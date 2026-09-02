
import cv2
import numpy as np

from .utils import to_gray


# improves image quality before we try to detect the document edges
# bilateral filter smooths out noise without blurring the edges (important bc edge detection comes next)
# clahe boosts local contrast on the lightness channel so text is more readable in dark or uneven lighting
# we only touch the l channel in lab space so the colors dont shift
def enhance(image, denoise=True, clahe=True):
    out = image.copy()

    if denoise:
        out = cv2.bilateralFilter(out, d=9, sigmaColor=75, sigmaSpace=75)

    if clahe:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe_op = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe_op.apply(l)
        out = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

    return out


# converts the warped page to a black and white scan look
# adaptive threshold works way better than a fixed cutoff bc it adjusts per region,
# so it handles shadows and uneven lighting without washing out or going too dark
# the median blur before thresholding kills paper texture and sensor noise that would otherwise show up as speckles
def to_scan(image, block_size=25, c=15):
    gray = to_gray(image)
    gray = cv2.medianBlur(gray, 3)
    if block_size % 2 == 0:
        block_size += 1
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        c,
    )
    return binary
