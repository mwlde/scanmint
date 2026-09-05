"""Extraction provider abstraction.

An ExtractionProvider takes a flattened receipt image and returns
structured fields matching the receipts + receipt_line_items schema.
Concrete providers wrap specific vision LLMs (Groq, Gemini, OpenAI, etc.).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

# Line items that don't reconcile against the receipt's own totals mean something
# was dropped -- a silent half-receipt is worse than a visible error, because nobody
# reviewing the card has any way to notice. Tolerance is proportional so it scales
# from a coffee to a weekly shop, with a floor for small receipts where a couple
# of percent is pennies. Rounding, tips and uncategorised fees live under it.
_ITEM_SUM_TOLERANCE_PCT = 0.02
_ITEM_SUM_TOLERANCE_MIN = 1.00


@dataclass
class LineItem:
    description: str
    quantity: float | None = None
    unit_price: float | None = None
    line_total: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "description": self.description,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "line_total": self.line_total,
        }


@dataclass
class ExtractionResult:
    """What every provider returns. Fields map directly to the receipts schema.

    All content fields are optional because a real receipt may be unreadable
    and we still want to render the flattened image + a graceful failure
    state on the frontend (screen 05b: extraction failed).
    """
    vendor: str | None = None
    purchase_date: str | None = None      # ISO YYYY-MM-DD
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None
    currency: str | None = None
    category: str | None = None
    line_items: list[LineItem] = field(default_factory=list)

    # provenance, written into the receipts row for later analysis
    provider: str = ""
    model: str = ""
    raw_response: dict[str, Any] | None = None

    # signals the frontend can branch on
    success: bool = True
    error_message: str | None = None

    def item_sum_warning(self) -> str | None:
        """Warn when the line items reconcile against NEITHER subtotal nor total.

        Which one they should match depends on the receipt: with VAT-inclusive
        pricing the item prices already contain tax, so they sum to the total;
        with VAT-exclusive pricing they sum to the subtotal. Anchoring on either
        one alone false-positives on the other kind, so accept a match with
        either. Returns None when there is nothing to check against, rather than
        inventing a warning from missing data.
        """
        anchors = [a for a in (self.subtotal, self.total) if a is not None]
        if not anchors:
            return None

        priced = [li.line_total for li in self.line_items if li.line_total is not None]
        if not priced:
            # nothing was itemised, or nothing carried a price: there is no sum to
            # reconcile, and summing to 0.0 would fail every anchor for the wrong
            # reason. The card already shows the empty/priceless list as-is.
            return None
        items_sum = sum(priced)

        for anchor in anchors:
            tolerance = max(_ITEM_SUM_TOLERANCE_MIN, abs(anchor) * _ITEM_SUM_TOLERANCE_PCT)
            if abs(items_sum - anchor) <= tolerance:
                return None
        return ("The line items don't add up to the total. "
                "Some items may be missing — please check.")

    def to_dict(self) -> dict[str, Any]:
        return {
            "vendor": self.vendor,
            "purchase_date": self.purchase_date,
            "subtotal": self.subtotal,
            "tax": self.tax,
            "total": self.total,
            "currency": self.currency,
            "category": self.category,
            "line_items": [li.to_dict() for li in self.line_items],
            "extraction_provider": self.provider,
            "extraction_model": self.model,
            "extraction_success": self.success,
            "extraction_error": self.error_message,
            "raw_extraction": self.raw_response,
            "item_sum_warning": self.item_sum_warning(),
        }


class ExtractionProvider(ABC):
    """Contract for a vision-LLM-backed receipt extractor.

    Implementations MUST NOT raise. Return an ExtractionResult with
    success=False and a helpful error_message when extraction fails.
    """

    @abstractmethod
    def name(self) -> str:
        """Short identifier written into extraction_provider, e.g. 'groq'."""

    @abstractmethod
    def model_id(self) -> str:
        """Concrete model in use, e.g. 'qwen/qwen3.6-27b'."""

    @abstractmethod
    async def extract(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> ExtractionResult:
        """Extract structured fields from a flattened receipt image."""