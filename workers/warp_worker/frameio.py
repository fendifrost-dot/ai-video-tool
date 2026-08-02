"""Frame + artifact I/O (needs numpy + cv2).

The canonical benchmark frames are 16-bit ``rgb48be`` PNG at 2160x3840. CPU dense
flow at that resolution is intractable, so the prototype loads at a working
width (default 540) as 8-bit BGR. This is a PROTOTYPE-scale decision, recorded in
the repro metadata; a production GPU worker runs full-res through the identical
interfaces.
"""
from __future__ import annotations

import glob
import os
from typing import List, Optional, Tuple

import cv2
import numpy as np


def frame_path(directory: str, index: int, pad: int = 5) -> str:
    return os.path.join(directory, f"frame_{index:0{pad}d}.png")


def list_frames(directory: str) -> List[str]:
    return sorted(glob.glob(os.path.join(directory, "frame_*.png")))


def load_bgr(path: str, work_width: Optional[int] = None) -> np.ndarray:
    """Load a frame as 8-bit BGR, optionally downscaled to ``work_width``.
    Handles 16-bit source (quantizes 16->8, which is a bit-depth reduction, not a
    gamma change — matching the benchmark's colour note)."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"cannot read frame: {path}")
    if img.dtype == np.uint16:
        img = (img / 257.0).round().astype(np.uint8)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    if work_width and img.shape[1] != work_width:
        h, w = img.shape[:2]
        scale = work_width / w
        img = cv2.resize(img, (work_width, max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    return img


def load_gray(path: str, work_width: Optional[int] = None) -> np.ndarray:
    return cv2.cvtColor(load_bgr(path, work_width), cv2.COLOR_BGR2GRAY)


def save_bgr(path: str, img: np.ndarray) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    ok = cv2.imwrite(path, img)
    if not ok:
        raise IOError(f"failed to write {path}")
    return path


def save_gray(path: str, img: np.ndarray) -> str:
    return save_bgr(path, img)


def save_flow(path: str, flow: np.ndarray) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    np.save(path, flow.astype(np.float32))
    return path if path.endswith(".npy") else path + ".npy"


def load_flow(path: str) -> np.ndarray:
    return np.load(path)


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path
