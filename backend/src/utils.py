import cv2
import numpy as np


# shrinks (or grows) the image to the target height while keeping the aspect ratio
# returns both the resized image and the scale ratio, bc we need the ratio later to map
# coordinates detected on the small version back up to the original full size image
def resize_to_height(image, height):
    h = image.shape[0]
    ratio = h / float(height)
    width = int(image.shape[1] / ratio)
    resized = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    return resized, ratio


# converts to grayscale, handles images that are already grayscale so it doesnt crash
def to_gray(image):
    if len(image.shape) == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


# fallback for when no document boundary was found, just use the whole image as the "doc"
# this way the rest of the pipeline still runs and we still produce an output
def full_frame_corners(image):
    h, w = image.shape[:2]
    return np.array(
        [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]],
        dtype="float32",
    )
