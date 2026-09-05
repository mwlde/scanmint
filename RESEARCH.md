# Research questions

Living document of open questions and empirical work happening inside ScanMint.

---

## 1. CV+CNN pipeline vs VLM-based extraction: what does the swap actually cost and buy?

SmartScan used a hand-tuned OpenCV pipeline followed by a fine-tuned MobileNetV2 classifier. ScanMint keeps the OpenCV front end but replaces the classifier (and adds structured extraction) with a general-purpose vision LLM. Both approaches produce structured output about a document. They differ on axes worth measuring.

### Axes to measure

- **Latency.** End-to-end wall time from image upload to structured JSON.
- **Cost per document.** Compute + API + storage, amortised.
- **Accuracy.** Field-level precision and recall on a labeled receipt set. Vendor, date, total, line items scored separately.
- **Maintainability.** Time to add a new document type or a new extracted field. LOC touched.
- **Failure modes.** What each approach fails on. Where they overlap, where they diverge.
- **Data requirements.** How much labeled data each needs to reach a usable baseline.
- **Deployment footprint.** Cold start, memory, dependency size.

### Method

- Build a labeled receipt set (start small, ~50 receipts, grow to 200+).
- Run both pipelines on the same set. SmartScan's classifier obviously can't do the full extraction, so the comparison is CNN-classifies-then-heuristic-extracts vs VLM-does-both.
- Log every field-level prediction. Compare against gold.
- Track cost and latency per call.

### Hypotheses to test

- VLM wins on accuracy for varied receipt layouts, loses on latency and per-call cost.
- CV+CNN wins on tail latency and offline capability.
- Maintainability strongly favours the VLM (no retraining loop) until a specific field's accuracy plateaus below product threshold, at which point fine-tuning re-enters the conversation.

### Status

Not started. To begin once MVP has been used on ~50 real receipts to build a natural test set.

---

## 2. Manual corner adjustment: how often is it used, and does it save otherwise-lost scans?

Instrument the manual corner editor. Log: auto-detection outcome, whether user adjusted, whether extraction succeeded. Question: does the manual path meaningfully rescue scans that would otherwise fail, or do users just adjust for cosmetic reasons on scans that would have worked?

---

## 3. Which vision model wins on receipts specifically?

Vendor lock-in avoidance is one thing, but at some point one provider will be measurably better for this narrow task. The provider abstraction makes A/B testing trivial. Set up shadow evaluations on real user submissions (with consent) once there's traffic.

---

## 4. Groq vision extraction: working configuration and its constraints

### Result

Vision extraction with `qwen/qwen3.6-27b` on Groq is reliable under this exact
configuration:

```
reasoning_effort = "none"
reasoning_format = "hidden"
max_tokens       = 900
temperature      = 0
response_format  = json_schema, strict: true
pacing           = 70s between calls
```

Controlled test, 12 calls against one receipt image: **12/12 complete and
identical**. Same four line items in the same order every run
(`Latte Macchiato, Gloki, Schweinschnitzel, Chässpätzli`), line totals
`[9.0, 5.0, 22.0, 18.5]` every run, and identical vendor, date, subtotal
(50.65), tax (3.85), total (54.50), currency and category. Zero rate-limit
rejections. Raw per-run responses: `backend/samples/20260905T115446Z/`.

Every element of that config is load-bearing; the sections below are why.

### Known constraint: ~1 scan per minute per org on the free tier

`max_tokens=900` reserves 900 of the 1,000 output-tokens-per-minute (OTPM)
allowance, so a second concurrent extraction inside the same minute is rejected.
This is a rate-limit ceiling, not a bug, and it is a hard cap on concurrency: fine
for solo use, immediately limiting with two simultaneous users. Mitigations are
the paid tier or a provider swap — `get_provider()` already switches on
`EXTRACTION_PROVIDER`, so a second provider is a small addition.

### The daily token limit is a rolling 24h window

200K TPD on the free tier, ageing out gradually rather than resetting at midnight.
A session the morning after exhausting it still saw `Used` above 198K. Earlier
analysis in this repo assumed a calendar-day reset; that premise was false, and
any conclusion resting on "fresh budget" from those sessions should be discarded.

429 responses carry a `retry-after` header with the precise resume time (628s and
270s observed), and the body states `Limit`/`Used`/`Requested` exactly. A rejected
request costs no tokens, so a 429 is a free, precise budget probe — but only when
it is rejected. A *successful* probe yields no number and burns ~2K tokens, which
at the margin consumes the very headroom it is reporting.

Note the two limits are independent: OTPM rejections happen with a full daily
budget, and TPD exhaustion happens regardless of pacing. Diagnosing either
requires reading the 429 body, since the message names the dimension.

### `json_schema` on Groq is post-hoc validation, not constrained decoding

The response format is validated server-side after generation rather than by
masking the sampler. A bad generation returns a 400 (`code:
json_validate_failed`, empty `failed_generation`) instead of being made
impossible. Empty generations were observed under load. `GroqProvider.extract`
retries that specific code twice (0.5s, 1.0s backoff) and absorbs them; retries
are logged at warning level so the rate stays visible.

That retry loop makes the pre-registered prediction "`json_validate_failed`: 0"
ambiguous at the result level: a run that flaked twice and recovered looks exactly
like a run that never flaked. The clean 12-run sample is all-success, so it is
compatible with both readings and settles neither.

`scripts/sample_extractions.py` now closes that gap. It captures the provider's
warning stream per call and records `json_validate_failed_retries` (plus every
warning verbatim) in each `run_NN.json` and in `summary.json`, printing the sample
total at the end. The strict form of the prediction — nothing for the retry loop to
absorb — is scored by that number being 0; retries above 0 on an all-success sample
refutes it while the user-visible behaviour stays clean. The existing sample predates
the instrumentation and stays unresolved; the next one is evidence either way.

### `enum` combined with `null` breaks Groq's schema validator

A nullable enum — either `{"type": ["string","null"], "enum": [...cats, null]}` or
`{"anyOf": [{enum}, {"type":"null"}]}` — causes intermittent-to-deterministic 400s.
Plain nullable scalars (`["number","null"]`) are fine; it is the combination.

Workaround in `_RECEIPT_SCHEMA`: a closed, non-nullable enum with an `"Unknown"`
sentinel, remapped to `None` in `_parse_extraction`. Do not "tidy" `category` back
to a nullable enum.

### Groq reserves OTPM from max_tokens, and reasoning tokens spend it

Groq budgets a request against OTPM using `max_tokens` (or the model default when
unset), **not** the tokens actually produced. On a thinking-mode model the
reasoning tokens are charged against that same output budget.

With reasoning enabled and `max_tokens` unset, the reserved output was ~1,862
against a 1,000 cap, so **every request was rejected before generating anything**
— regardless of remaining daily budget. `reasoning_effort="none"` cut the
reservation to ~1,010, still marginally over. Only the combination of disabled
reasoning *and* a bounded `max_tokens` fits under the cap.

The failure mode in between is worth knowing: `max_tokens=900` with reasoning
still enabled produced **silent truncation** — receipts came back with 1, 3 or 4
items, always a strict prefix of the full list, never reordered, never a gap in
the middle. A truncated receipt looks like a valid extraction to the review card.
Sample preserved at `backend/samples/20260905T051633Z/`.

Per Groq's reasoning docs, `reasoning_effort` on this model accepts only `"none"`
and `"default"` (`"low"`/`"medium"`/`"high"` belong to Qwen 3.8 and GPT-OSS), and
`reasoning_format` must be `"parsed"` or `"hidden"` in JSON mode — `"raw"` is
unsupported there.

### The item-sum check must handle VAT-inclusive and VAT-exclusive receipts

Line items that don't reconcile against the receipt's totals mean something was
dropped, and a silent half-receipt is worse than a visible error. But the anchor
is not obvious: on a VAT-inclusive receipt the item prices already include tax, so
the items sum to the **total**; on a VAT-exclusive one they sum to the
**subtotal**.

The test receipt is VAT-inclusive — items sum to 54.50 (the total) while subtotal
is 50.65, the gap being exactly the tax. Anchoring on subtotal alone false-positives
on a perfect extraction; anchoring on total alone would false-positive on the
exclusive case.

`ExtractionResult.item_sum_warning` therefore checks the item sum against both
anchors and warns only when it matches **neither**, within a tolerance of 2% or
1.00, whichever is larger. It stays silent when there is nothing to reconcile —
no subtotal and no total, or no line item carrying a price — rather than
manufacturing a warning out of missing data. The cost of the looser rule is a
dropped item worth less than the tax gap hiding behind the other anchor; the
alternative was warning on every correct VAT-inclusive receipt, which trains people
to ignore the warning entirely.

### Open: MoE non-determinism

Mixture-of-experts routing is a plausible general source of run-to-run variance at
`temperature=0`, but it has not been tested against Groq specifically, and the
variance originally attributed to it here turned out to be output truncation. The
12/12 identical sample gives no evidence of it on this receipt. Deferred rather
than concluded — it would need a many-run sample under the now-known-good config.
