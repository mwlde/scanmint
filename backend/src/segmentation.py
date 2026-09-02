import cv2
import numpy as np

from .utils import to_gray


# finds where the text/content regions are on the warped doc
# the idea is: binarize so text is white on black, open to remove tiny specks,
# then dilate with a wide short kernel so individual chars merge into full line blobs,
# then just grab the bounding boxes of those blobs
# we skip boxes that are too small (noise) or cover basically the whole page (usually the border)
def segment_regions(image, min_area_frac=0.0008, merge_kernel=(25, 5)):
    gray = to_gray(image)
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,   # text becomes white (foreground)
        25, 15,
    )
    # kill isolated specks smaller than 2x2
    binary = cv2.morphologyEx(
        binary, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)),
    )
    # wide short kernel glues chars of a line into one blob, narrow enough to keep lines separate
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, merge_kernel)
    dilated = cv2.dilate(binary, kernel, iterations=2)

    cnts, _ = cv2.findContours(
        dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    page_area = image.shape[0] * image.shape[1]
    boxes = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if w * h < min_area_frac * page_area:
            continue
        # skip anything covering basically the whole page (usually the border)
        if w * h > 0.95 * page_area:
            continue
        boxes.append((x, y, w, h))

    # reading order: top to bottom then left to right within 20px bands
    boxes.sort(key=lambda b: (b[1] // 20, b[0]))
    return boxes


# draws numbered bounding boxes on a copy of the img so we can visualize the detected regions
def draw_regions(image, boxes, color=(255, 0, 0), thickness=2):
    out = image.copy()
    if out.ndim == 2:
        out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    for i, (x, y, w, h) in enumerate(boxes, start=1):
        cv2.rectangle(out, (x, y), (x + w, y + h), color, thickness)
        cv2.putText(
            out, f"R{i}", (x, max(0, y - 5)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )
    return out
