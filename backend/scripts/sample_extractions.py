"""Collect raw extraction responses for analysis, one JSON file per run.

Saves the FULL response every time -- summarising at collection time is how the
first attempt at this lost the interesting run. Also records the TPD headroom and
every provider warning at each call, so the same sample answers three questions
at once:

  1. which line items get dropped when the model returns a short list
  2. whether json_validate_failed correlates with a near-exhausted token budget
  3. how many json_validate_failed flakes the retry loop absorbed per run

(3) is what makes the strict form of the pre-registered "json_validate_failed: 0"
prediction measurable. GroqProvider retries that error twice and absorbs it, so a
run that flaked and recovered is indistinguishable at the result level from a run
that never flaked -- an all-success sample was previously compatible with both
"zero flakes" and "flakes, silently absorbed". The provider logs each retry at
warning level, so counting those warnings per run separates the two: retries == 0
across the sample is the strict prediction holding; retries > 0 with success=True
is the loop earning its keep, and the prediction failing.

PACING: the per-minute token bucket is 8,000 and one receipt call costs ~2,066,
so only THREE requests fit in a minute. Anything faster than a ~20s interval empties
the bucket and the rest of the run comes back 429 -- a 3s interval yielded 1 success
and 11 rate-limited. TPM 429s carry no retry-after header, so they surface as "try
again later" and carry no TPD numbers to harvest; that is a pacing failure, not an
exhausted daily budget.

Usage:
    python scripts/sample_extractions.py <image> [count] [interval_seconds]
    python scripts/sample_extractions.py --budget      # probe headroom, ~0 tokens

Output: backend/samples/<timestamp>/run_NN.json  plus  summary.json
"""
import asyncio
import base64
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from src.extraction.groq_provider import (  # noqa: E402
    GroqProvider, _error_code, _retry_after_seconds, log as gp_log,
)


class _LogSink(logging.Handler):
    """Captures the provider's warnings: TPD numbers and retry counts both ride here.

    The provider never returns its retry history to the caller -- absorbing the
    flake is the point -- so its log is the only channel that reports one.
    """

    def __init__(self):
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record):
        self.messages.append(record.getMessage())


# Emitted once per retry by GroqProvider.extract as
# "groq json_validate_failed on attempt N/3, retrying in 0.5s".
_RETRY_MARKER = "json_validate_failed on attempt"


def count_retries(messages: list[str]) -> int:
    """How many json_validate_failed retries the provider absorbed this run."""
    return sum(1 for m in messages if _RETRY_MARKER in m)


def jpeg_bytes(image_path: str) -> bytes:
    """Match exactly what main.py sends the model."""
    img = cv2.imread(image_path)
    if img is None:
        raise SystemExit(f"could not read image: {image_path}")
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return buf.tobytes()


def parse_tpd(message: str) -> dict | None:
    """Pull 'Limit 200000, Used 198557, Requested 2066' out of a 429 body."""
    out = {}
    for key in ("Limit", "Used", "Requested"):
        marker = f"{key} "
        if marker not in message:
            return None
        tail = message.split(marker, 1)[1]
        digits = ""
        for ch in tail:
            if ch.isdigit():
                digits += ch
            else:
                break
        if not digits:
            return None
        out[key.lower()] = int(digits)
    out["remaining"] = out["limit"] - out["used"]
    return out


async def budget_probe(image_bytes: bytes) -> dict:
    """Report TPD headroom.

    WARNING: this is free ONLY when it comes back rate-limited. The success path
    sends a real image request and burns ~2k tokens -- at the margin that is
    enough to consume the very headroom it is reporting, which is exactly how the
    first run of this script ended up with 12 rate-limited requests and no data.
    The sampling loop therefore does NOT call this; it reads budget state out of
    whatever 429s the real attempts produce. Use it standalone, deliberately.
    """
    p = GroqProvider()
    try:
        await p._client.chat.completions.create(
            model=p.model_id(),
            max_tokens=8,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "hi"},
                {"type": "image_url", "image_url": {
                    "url": f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode()}"}},
            ]}],
        )
        return {"rate_limited": False, "note": "request went through; budget has room"}
    except Exception as e:
        msg = getattr(e, "message", None) or str(e)
        return {
            "rate_limited": _error_code(e) == "rate_limit_exceeded",
            "tpd": parse_tpd(msg),
            "retry_after_s": _retry_after_seconds(e),
            "message": msg[:300],
        }


async def main():
    args = [a for a in sys.argv[1:]]
    image_path = args[0] if args else str(ROOT.parent / "receipt.png")

    if image_path == "--budget":
        image_path = str(ROOT.parent / "receipt.png")
        print(json.dumps(await budget_probe(jpeg_bytes(image_path)), indent=2))
        return

    count = int(args[1]) if len(args) > 1 else 10
    interval = float(args[2]) if len(args) > 2 else 20.0

    blob = jpeg_bytes(image_path)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    outdir = ROOT / "samples" / stamp
    outdir.mkdir(parents=True, exist_ok=True)

    provider = GroqProvider()
    budget_seen = []   # tpd snapshots harvested from 429s -- costs nothing
    log_sink = _LogSink()
    gp_log.addHandler(log_sink)
    gp_log.setLevel(logging.WARNING)
    summary = []
    for i in range(count):
        started = datetime.now(timezone.utc)
        result = await provider.extract(blob, mime_type="image/jpeg")
        record = {
            "run": i,
            "started": started.isoformat(),
            "success": result.success,
            "error": result.error_message,
            "vendor": result.vendor,
            "purchase_date": result.purchase_date,
            "subtotal": result.subtotal,
            "tax": result.tax,
            "total": result.total,
            "currency": result.currency,
            "category": result.category,
            "line_item_count": len(result.line_items),
            "line_items": [it.__dict__ for it in result.line_items],
            "raw_response": result.raw_response,
            # Verbatim, for the same reason raw_response is kept whole: a warning
            # nobody thought to parse today is the one worth reading next week.
            "warnings": list(log_sink.messages),
            "json_validate_failed_retries": count_retries(log_sink.messages),
        }
        # A rate-limited attempt states Used/Requested exactly and costs no tokens.
        # The provider replaces that text with user-facing copy, so read the numbers
        # off its log record instead -- free headroom data on every 429.
        tpd = next((parse_tpd(m) for m in reversed(log_sink.messages) if parse_tpd(m)), None)
        if tpd and not result.success:
            record["tpd"] = tpd
            budget_seen.append({"run": i, **tpd})
        log_sink.messages.clear()

        (outdir / f"run_{i:02d}.json").write_text(json.dumps(record, indent=2))
        summary.append({k: record[k] for k in
                        ("run", "success", "error", "line_item_count", "total",
                         "json_validate_failed_retries")})
        items = record["line_item_count"]
        retries = record["json_validate_failed_retries"]
        print(f"{i:2d}: {'OK ' if result.success else 'ERR'} items={items} "
              f"total={result.total} retries={retries} "
              f"{(result.error_message or '')[:60]}")
        if i < count - 1:
            await asyncio.sleep(interval)

    (outdir / "budget_seen.json").write_text(json.dumps(budget_seen, indent=2))
    (outdir / "summary.json").write_text(json.dumps(summary, indent=2))

    counts = {}
    for row in summary:
        if row["success"]:
            counts[row["line_item_count"]] = counts.get(row["line_item_count"], 0) + 1
    print(f"\nsaved to {outdir}")
    print(f"line-item counts across successful runs: {counts}")
    rate_limited = sum(1 for r in summary if not r["success"])
    print(f"rate-limited: {rate_limited}/{len(summary)}")
    # Score the "json_validate_failed: 0" prediction in its strict form: not
    # "no errors reached me" but "the retry loop had nothing to absorb".
    retries_total = sum(r["json_validate_failed_retries"] for r in summary)
    flaky_runs = sum(1 for r in summary if r["json_validate_failed_retries"])
    print(f"json_validate_failed retries: {retries_total} "
          f"across {flaky_runs}/{len(summary)} runs"
          f"{' (strict prediction holds: nothing absorbed)' if not retries_total else ''}")


asyncio.run(main())
