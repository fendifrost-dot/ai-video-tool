"""A stand-in for the `mediapipe` package so the put-back scripts run in CI without the real models or weights.
Only the surface the scripts use: mp.Image / mp.ImageFormat, tasks.python.vision.ImageSegmenter (categories from the
frame's colours: red = face skin 3, green = clothes 4, blue = hair 1, yellow = body skin 2, else background 0) and
FaceLandmarker (478 landmarks laid on the red block's bounding box when the crop holds one)."""
import numpy as np


class ImageFormat:
    SRGB = "SRGB"


class Image:
    def __init__(self, image_format=None, data=None):
        self.image_format, self.data = image_format, np.asarray(data)


def categories(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    c = np.zeros(rgb.shape[:2], np.uint8)
    c[(r > 150) & (g < 100) & (b < 100)] = 3
    c[(g > 150) & (r < 100) & (b < 100)] = 4
    c[(b > 150) & (r < 100) & (g < 100)] = 1
    c[(r > 150) & (g > 150) & (b < 100)] = 2
    return c
