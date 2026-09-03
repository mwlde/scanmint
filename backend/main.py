import base64
import json
import logging
import uuid
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.scan_pipeline import scan_document

log = logging.getLogger("scanmint.backend")

app = FastAPI(title="ScanMint CV Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 𓆝 𓆟 𓆞 𓆟 𓆝 local scan storage

# flattened images get written here so the frontend can show them in the review card.
# this is dev scaffolding only, the real thing uploads to the receipt-images supabase bucket.
SCANS_DIR = Path(__file__).parent / "scans"
SCANS_DIR.mkdir(exist_ok=True)

# serves the saved flattened images back over http, /scans/<name>.png
app.mount("/scans", StaticFiles(directory=SCANS_DIR), name="scans")

# 𓆝 𓆟 𓆞 𓆟 𓆝 upload validation

ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png"})
MAX_FILE_BYTES = 10 * 1024 * 1024   # 10 mb
MAX_DIMENSION  = 10_000             # px per side, stops decompression bombs (tiny file but huge decoded size)

# magic bytes are more reliable than content type which the client can fake
# jpeg starts with ff d8 ff, png starts with the 8 byte png signature
_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff",       "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
]

# just peeks at the first few bytes of the file to confirm it's actually what it claims to be
def _check_magic(data: bytes) -> bool:
    return any(data[:len(sig)] == sig for sig, _ in _MAGIC)


# runs 3 checks before we touch the image: file size, mime type, and actual byte content
# returns a json error response if anything looks wrong, or none if its fine
def _validate_upload(data: bytes, content_type: str | None) -> JSONResponse | None:
    if len(data) > MAX_FILE_BYTES:
        return JSONResponse(status_code=413, content={"error": "File too large. Maximum is 10 MB."})
    if content_type not in ALLOWED_CONTENT_TYPES:
        return JSONResponse(status_code=415, content={"error": "Only JPEG and PNG images are accepted."})
    if not _check_magic(data):
        return JSONResponse(status_code=415, content={"error": "File content does not match a recognised image format."})
    return None


# validates the raw bytes then decodes them into a cv2 image thats ready for the pipeline,
# resizing anything oversized down to 1000px on the longest side.
# returns (image, none) on success or (none, error_response) so the caller can just return the error.
def _prepare_image(data: bytes, content_type: str | None) -> tuple[np.ndarray | None, JSONResponse | None]:
    err = _validate_upload(data, content_type)
    if err:
        return None, err

    nparr = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return None, JSONResponse(status_code=400, content={"error": "Could not decode image."})

    h, w = image.shape[:2]
    if h > MAX_DIMENSION or w > MAX_DIMENSION:
        return None, JSONResponse(
            status_code=400,
            content={"error": f"Image dimensions too large. Maximum is {MAX_DIMENSION}×{MAX_DIMENSION} px."},
        )

    # resize to max 1000px on longest side, large imgs hang on 0.1 cpu
    if max(h, w) > 1000:
        scale = 1000 / max(h, w)
        image = cv2.resize(image, (int(w * scale), int(h * scale)))

    return image, None


# converts a cv2 image (numpy array) to a base64 png string so we can send it over json
def _encode_png(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf).decode()


# writes a cv2 image into SCANS_DIR under a random filename and hands back the path on disk
def _save_png(img: np.ndarray) -> Path:
    path = SCANS_DIR / f"{uuid.uuid4().hex}.png"
    if not cv2.imwrite(str(path), img):
        raise OSError(f"cv2.imwrite failed for {path}")
    return path

# 𓆝 𓆟 𓆞 𓆟 𓆝 manual corners

# the corner adjustment screen posts its quad as json: [{"x":0.14,"y":0.1}, ...] with x/y
# normalized to 0..1 against the displayed image, in tl, tr, br, bl order.
# normalized rather than pixels bc the phone renders the photo scaled to fit, so the frontend
# has no idea what the full res dimensions are.
#
# returns (corners, none) with corners as a (4,2) float array in pixel coords, or (none, error)
# when the payload is malformed. a bad quad is a client bug worth surfacing, not something to
# silently fall back on, otherwise "manual adjust does nothing" becomes impossible to diagnose.
def _parse_corners(raw: str | None, shape: tuple[int, ...]) -> tuple[np.ndarray | None, JSONResponse | None]:
    if not raw:
        return None, None

    bad = JSONResponse(
        status_code=400,
        content={"error": "corners must be 4 points of {x, y} normalized to 0..1."},
    )

    try:
        pts = json.loads(raw)
    except json.JSONDecodeError:
        return None, bad

    if not isinstance(pts, list) or len(pts) != 4:
        return None, bad

    h, w = shape[:2]
    out = []
    for p in pts:
        if not isinstance(p, dict) or "x" not in p or "y" not in p:
            return None, bad
        try:
            x, y = float(p["x"]), float(p["y"])
        except (TypeError, ValueError):
            return None, bad
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            return None, bad
        out.append([x * w, y * h])

    corners = np.asarray(out, dtype="float32")

    # a degenerate quad (all four points bunched together) would warp to a 1x1 image
    if cv2.contourArea(corners) < 0.01 * w * h:
        return None, JSONResponse(
            status_code=400,
            content={"error": "corners enclose too small an area to warp."},
        )

    return corners, None


@app.get("/health")
def health():
    return {"status": "ok"}


# quality thingy maps to the work height used during document detection
# lower = faster but misses fine edges, higher = slower but better on detailed docs
_QUALITY_MAP = {"low": 350, "medium": 500, "high": 800}

# 𓆝 𓆟 𓆞 𓆟 𓆝 routes

# main endpoint, takes an uploaded image and runs the full cv pipeline on it
# returns 6 versions of the image (original, enhanced, detected, warped, scan, region overlay) as base64 pngs
# also returns the detected text region boxes and timing info
@app.post("/scan")
async def scan(file: UploadFile = File(...), quality: str = Form("medium")):
    data = await file.read()

    image, err = _prepare_image(data, file.content_type)
    if err:
        return err

    work_height = _QUALITY_MAP.get(quality.lower(), 500)

    try:
        result = scan_document(image, work_height=work_height)
    except Exception:
        log.exception("scan_document raised an unhandled error")
        return JSONResponse(status_code=500, content={"error": "Image processing failed."})

    return {
        "document_found":   result.document_found,
        "original":         _encode_png(result.original),
        "enhanced":         _encode_png(result.enhanced),
        "detected_overlay": _encode_png(result.detected_overlay),
        "warped":           _encode_png(result.warped),
        "scan":             _encode_png(result.scan),
        "region_overlay":   _encode_png(result.region_overlay),
        "regions":          [{"x": rx, "y": ry, "w": rw, "h": rh} for rx, ry, rw, rh in result.regions],
        "timings_ms":       result.timings_ms,
        "total_ms":         result.total_ms,
    }


# 𓆝 𓆟 𓆞 𓆟 𓆝 extraction stub

# fixed receipt fields returned by /extract until a real llm is wired in.
# shape matches the receipts + receipt_line_items tables so the review card can be built against it now.
_STUB_EXTRACTION = {
    "vendor":        "Sample Cafe",
    "purchase_date": "2026-09-02",
    "subtotal":      12.50,
    "tax":           1.25,
    "total":         13.75,
    "currency":      "USD",
    "category":      "Dining",
    "line_items": [
        {"description": "Latte",     "quantity": 1, "unit_price": 5.50, "line_total": 5.50},
        {"description": "Croissant", "quantity": 1, "unit_price": 7.00, "line_total": 7.00},
    ],
    "extraction_provider": "stub",
    "extraction_model":    "stub-v0",
}


# takes an uploaded receipt photo, flattens it through the cv pipeline, saves the flattened
# image to disk, and returns hardcoded receipt fields alongside the image path.
#
# NOTE: the fields are a stub. no llm is called yet, every response is identical.
# only the image path and document_found flag actually reflect the upload.
@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    quality: str = Form("medium"),
    corners: str | None = Form(None),
):
    data = await file.read()

    image, err = _prepare_image(data, file.content_type)
    if err:
        return err

    work_height = _QUALITY_MAP.get(quality.lower(), 500)

    manual_corners, err = _parse_corners(corners, image.shape)
    if err:
        return err

    try:
        result = scan_document(image, work_height=work_height, corners=manual_corners)
    except Exception:
        log.exception("scan_document raised an unhandled error")
        return JSONResponse(status_code=500, content={"error": "Image processing failed."})

    try:
        image_path = _save_png(result.warped)
    except OSError:
        log.exception("could not write the flattened image to %s", SCANS_DIR)
        return JSONResponse(status_code=500, content={"error": "Could not save the flattened image."})

    return {
        **_STUB_EXTRACTION,
        "image_path":     str(image_path),                # absolute path on the server
        "image_url":      f"/scans/{image_path.name}",    # join onto NEXT_PUBLIC_SCAN_API to display it
        "document_found": result.document_found,
        "used_manual_corners": manual_corners is not None,
    }
