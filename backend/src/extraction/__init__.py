"""Extraction provider factory.

Reads EXTRACTION_PROVIDER from env, defaults to 'groq'. Add new providers
to the switch below as they're built.
"""

import os

from .base import ExtractionProvider, ExtractionResult, LineItem
from .groq_provider import GroqProvider


def get_provider(name: str | None = None) -> ExtractionProvider:
    resolved = (name or os.getenv("EXTRACTION_PROVIDER", "groq")).lower()

    if resolved == "groq":
        return GroqProvider()

    raise ValueError(f"Unknown extraction provider: {resolved!r}")


__all__ = ["ExtractionProvider", "ExtractionResult", "LineItem", "get_provider"]