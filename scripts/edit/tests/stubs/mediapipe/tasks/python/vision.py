import numpy as np
from ... import categories


class RunningMode:
    IMAGE = "IMAGE"


class _Mask:
    def __init__(self, a): self._a = a
    def numpy_view(self): return self._a


class _SegResult:
    def __init__(self, a): self.category_mask = _Mask(a)


class ImageSegmenterOptions:
    def __init__(self, base_options=None, running_mode=None, output_category_mask=False): pass


class ImageSegmenter:
    @classmethod
    def create_from_options(cls, options): return cls()
    def segment(self, image): return _SegResult(categories(image.data))


class _Pt:
    def __init__(self, x, y): self.x, self.y = float(x), float(y)


class _LmResult:
    def __init__(self, lms): self.face_landmarks = lms


class FaceLandmarkerOptions:
    def __init__(self, base_options=None, running_mode=None, num_faces=1): pass


class FaceLandmarker:
    @classmethod
    def create_from_options(cls, options): return cls()

    def detect(self, image):
        """A face wherever the crop holds a red block of at least 6x6 px: 478 landmarks on its bounding box, the ones
        body_only_swap reads (OVAL ring, BROWS at 0.2 of the height, EYES at 0.35) placed by index."""
        c = categories(image.data); ys, xs = np.nonzero(c == 3)
        if len(ys) < 36: return _LmResult([])
        h, w = c.shape
        x0, x1, y0, y1 = xs.min() / w, (xs.max() + 1) / w, ys.min() / h, (ys.max() + 1) / h
        if (x1 - x0) * w < 6 or (y1 - y0) * h < 6: return _LmResult([])
        cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        pts = [_Pt(cx, cy)] * 478
        oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        for i, k in enumerate(oval):
            a = -np.pi / 2 + 2 * np.pi * i / len(oval)
            pts[k] = _Pt(cx + rx * np.cos(a), cy + ry * np.sin(a))
        for k in (70, 63, 105, 66, 107, 336, 296, 334, 293, 300): pts[k] = _Pt(cx, y0 + 0.2 * (y1 - y0))
        for k in (159, 160, 158, 386, 387, 385): pts[k] = _Pt(cx, y0 + 0.35 * (y1 - y0))
        return _LmResult([pts])
