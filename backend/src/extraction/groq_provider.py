"""Groq vision provider using the OpenAI-compatible chat completions API."""

import asyncio
import base64
import json
import logging
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from groq import AsyncGroq, RateLimitError

from .base import ExtractionProvider, ExtractionResult, LineItem

log = logging.getLogger("scanmint.extraction.groq")

# Default is Qwen 3.6 27B, the current vision-capable model on Groq's free tier
# after Llama 4 Scout was deprecated in June 2026. Override via GROQ_MODEL env.
_DEFAULT_MODEL = "qwen/qwen3.6-27b"


_CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Other"]
_CATEGORY_UNKNOWN = "Unknown"

# Constrained decoding: the sampler is masked to tokens that continue a valid
# schema-conformant sequence, so the model cannot emit malformed JSON at all.
# This replaces the schema block that used to live in the system prompt (and the
# json_object mode that would 400 with json_validate_failed on a bad generation).
_RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "vendor":        {"type": ["string", "null"]},
        "purchase_date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "subtotal":      {"type": ["number", "null"]},
        "tax":           {"type": ["number", "null"]},
        "total":         {"type": ["number", "null"]},
        "currency":      {"type": ["string", "null"], "description": "three-letter ISO code"},
        # NOTE: deliberately NOT nullable. Groq's constrained decoding breaks when an
        # enum also permits null -- it intermittently emits an empty generation and the
        # request 400s with json_validate_failed. Plain nullable scalars are fine; it is
        # enum+null specifically. "Unknown" carries the "couldn't tell" case instead and
        # _parse_extraction maps it back to None.
        "category":      {"type": "string", "enum": _CATEGORIES + [_CATEGORY_UNKNOWN]},
        "line_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "quantity":    {"type": ["number", "null"]},
                    "unit_price":  {"type": ["number", "null"]},
                    "line_total":  {"type": ["number", "null"]},
                },
                "required": ["description", "quantity", "unit_price", "line_total"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "vendor", "purchase_date", "subtotal", "tax",
        "total", "currency", "category", "line_items",
    ],
    "additionalProperties": False,
}

# The shape is enforced by _RECEIPT_SCHEMA; these are the reading rules the
# schema can't express.
_SYSTEM_PROMPT = """You extract structured data from photographs of receipts.

Rules:
- Use null for any field you cannot read confidently. Do not guess.
- Numbers are decimal, no currency symbols, no thousand separators.
- Dates: if only day and month are visible, use the current year.
- Currency: infer from country context if the symbol is ambiguous.
- Category: pick the single best fit for the vendor and items.
  Use "Unknown" only if none of the options fit.
- Line items: list every distinct purchased item. Skip subtotal, tax, total rows.
- Return an empty line_items list if you cannot read individual items.
- If the image is not a receipt, return every field as null and line_items empty.
"""

_USER_PROMPT = "Extract the structured receipt data from this image."

# Groq validates the generation against the schema server-side rather than masking the
# sampler, so a bad generation still comes back as a 400 (code json_validate_failed,
# with an empty failed_generation). It is transient -- the same image succeeds on a
# retry -- so retry that one code only. Rate limits, auth and network errors return
# immediately; retrying a 429 only deepens the hole.
# Groq reserves OTPM budget from max_tokens, not from tokens actually produced, and
# charges reasoning tokens against the same output budget. On qwen3.6-27b the only
# valid reasoning_effort values are "none" and "default" (per Groq's reasoning docs);
# "none" cuts the reserved output from ~1862 to ~1010. reasoning_format must be
# "parsed" or "hidden" in JSON mode -- "raw" is unsupported there.
#
# 900 keeps the reservation under the 1000/min OTPM cap. NOTE: it also means one
# request reserves 90% of the per-minute budget, so callers cannot issue more than
# one extraction per minute without eating a 429.
_REASONING_EFFORT = "none"
_REASONING_FORMAT = "hidden"
_MAX_OUTPUT_TOKENS = 900

_JSON_VALIDATE_FAILED = "json_validate_failed"
_RETRY_BACKOFF = (0.5, 1.0)   # seconds; len() == the number of retries


def _retry_after_seconds(e: Exception) -> int | None:
    """Seconds to wait, from the 429's retry-after header. None if unreadable.

    Groq sends an integer count of seconds (e.g. "270"), but the header is also
    allowed to carry an HTTP date, so handle both and fall back to None.
    """
    resp = getattr(e, "response", None)
    raw = getattr(resp, "headers", {}).get("retry-after") if resp is not None else None
    if not raw:
        return None
    try:
        return max(0, int(float(raw)))
    except (TypeError, ValueError):
        pass
    try:
        when = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0, int((when - datetime.now(timezone.utc)).total_seconds()))


def _error_code(e: Exception) -> str | None:
    body = getattr(e, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return err.get("code")
    return None


class GroqProvider(ExtractionProvider):
    """Groq-hosted multimodal model."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        key = api_key or os.getenv("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY is not set")
        self._client = AsyncGroq(api_key=key)
        self._model = model or os.getenv("GROQ_MODEL", _DEFAULT_MODEL)

    def name(self) -> str:
        return "groq"

    def model_id(self) -> str:
        return self._model

    async def extract(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> ExtractionResult:
        data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"

        completion = None
        for attempt in range(len(_RETRY_BACKOFF) + 1):
            try:
                completion = await self._client.chat.completions.create(
                    model=self._model,
                    temperature=0,
                    max_tokens=_MAX_OUTPUT_TOKENS,
                    reasoning_effort=_REASONING_EFFORT,
                    reasoning_format=_REASONING_FORMAT,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": "receipt",
                            "schema": _RECEIPT_SCHEMA,
                            "strict": True,
                        },
                    },
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": _USER_PROMPT},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        },
                    ],
                )
            except RateLimitError as e:
                # The binding limit is tokens per day on a rolling 24h window, so the
                # wait can be minutes, not seconds -- take it from the header rather
                # than guessing. Round UP: overstating the wait is kinder than telling
                # someone "1 minute" when the real answer is ten.
                wait = _retry_after_seconds(e)
                # log the API's own text -- it names the exact limit dimension and
                # usage ("tokens per day (TPD): Limit 200000, Used 199981"), which is
                # the number you need to tell "wait a minute" from "wait a day".
                log.warning(
                    "groq rate limit hit, retry-after=%ss: %s",
                    wait, getattr(e, "message", None) or str(e),
                )
                if wait:
                    mins = max(1, -(-wait // 60))
                    # Copy decision: we show the real number even when it is large.
                    # A vague "try again later" reads as broken; a long-but-honest
                    # wait at least tells the user the app is working as intended.
                    # Worth revisiting against real users.
                    detail = f"in about {mins} minute{'s' if mins != 1 else ''}"
                else:
                    detail = "later"
                return ExtractionResult(
                    provider=self.name(),
                    model=self._model,
                    success=False,
                    error_message=f"Too many requests. Please try again {detail}.",
                )
            except Exception as e:
                retriable = _error_code(e) == _JSON_VALIDATE_FAILED
                if retriable and attempt < len(_RETRY_BACKOFF):
                    delay = _RETRY_BACKOFF[attempt]
                    # logged at warning so the flake rate is visible in production;
                    # if it climbs much past ~5% the model needs reconsidering.
                    log.warning(
                        "groq %s on attempt %d/%d, retrying in %.1fs",
                        _JSON_VALIDATE_FAILED, attempt + 1,
                        len(_RETRY_BACKOFF) + 1, delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                log.exception("groq api call failed")
                # the api's own message is the only thing that tells us *why* a 400
                # happened, so surface it instead of just the exception class name.
                detail = getattr(e, "message", None) or str(e)
                if retriable:
                    detail = f"still failing after {len(_RETRY_BACKOFF) + 1} attempts: {detail}"
                return ExtractionResult(
                    provider=self.name(),
                    model=self._model,
                    success=False,
                    error_message=f"Vision model request failed: {type(e).__name__}: {detail}",
                )
            else:
                break

        raw = (completion.choices[0].message.content or "").strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("groq returned unparseable JSON: %r", raw[:500])
            return ExtractionResult(
                provider=self.name(),
                model=self._model,
                success=False,
                error_message="Vision model returned invalid JSON.",
                raw_response={"raw_text": raw},
            )

        return _parse_extraction(data, provider=self.name(), model=self._model)


def _parse_extraction(data: dict, provider: str, model: str) -> ExtractionResult:
    """Coerce loose LLM output into an ExtractionResult without raising."""

    def _num(v):
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def _str(v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    def _category(v):
        c = _str(v)
        return None if c == _CATEGORY_UNKNOWN else c

    items_raw = data.get("line_items")
    line_items: list[LineItem] = []
    if isinstance(items_raw, list):
        for it in items_raw:
            if not isinstance(it, dict):
                continue
            desc = _str(it.get("description"))
            if not desc:
                continue
            line_items.append(LineItem(
                description=desc,
                quantity=_num(it.get("quantity")),
                unit_price=_num(it.get("unit_price")),
                line_total=_num(it.get("line_total")),
            ))

    return ExtractionResult(
        vendor=_str(data.get("vendor")),
        purchase_date=_str(data.get("purchase_date")),
        subtotal=_num(data.get("subtotal")),
        tax=_num(data.get("tax")),
        total=_num(data.get("total")),
        currency=_str(data.get("currency")),
        category=_category(data.get("category")),
        line_items=line_items,
        provider=provider,
        model=model,
        raw_response=data,
        success=True,
    )