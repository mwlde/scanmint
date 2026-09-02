# four point perspective transform, takes detected corners, returns a flat top down view of the doc
import cv2
import numpy as np


# sorts the 4 corner points into a consistent order: top left, top right, bottom right, bottom left
# we need a fixed order so the warp destination matrix lines up correctly
# the sum trick works bc top left has the smallest x+y and bottom right has the largest
# the diff trick (x-y) separates top right (large x, small y) from bottom left (small x, large y)
def order_points(pts):
    pts = np.asarray(pts, dtype="float32").reshape(4, 2)
    rect = np.zeros((4, 2), dtype="float32")

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top left
    rect[2] = pts[np.argmax(s)]  # bottom right

    diff = np.diff(pts, axis=1).ravel()
    # np.diff gives (y-x), flip to get x-y ordering
    diff = pts[:, 0] - pts[:, 1]
    rect[1] = pts[np.argmax(diff)]  # top right (large x, small y)
    rect[3] = pts[np.argmin(diff)]  # bottom left (small x, large y)
    return rect


# the main warp thingy, computes a perspective transform matrix and applies it
# output size is based on the actual edge lengths of the detected quad so the aspect ratio stays correct
# without this the image would squish or stretch depending on camera angle
def four_point_transform(image, corners):
    """warp the img to a flat rectangle using the 4 detected corners. output size preserves real page aspect ratio."""
    rect = order_points(corners)
    (tl, tr, br, bl) = rect

    # width = max of the two horizontal edge lengths
    width_top = np.linalg.norm(tr - tl)
    width_bottom = np.linalg.norm(br - bl)
    max_w = int(max(width_top, width_bottom))

    # height = max of the two vertical edge lengths
    height_left = np.linalg.norm(bl - tl)
    height_right = np.linalg.norm(br - tr)
    max_h = int(max(height_left, height_right))

    max_w = max(max_w, 1)
    max_h = max(max_h, 1)

    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype="float32",
    )

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (max_w, max_h))
    return warped
