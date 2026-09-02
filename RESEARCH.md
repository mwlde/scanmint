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
