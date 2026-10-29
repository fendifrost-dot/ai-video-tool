"""Per-region masks (spec capability #3): torso, left/right sleeve, collar,
stripe_logo, hands_arms.

Masks are a PLUGGABLE INTERFACE. Two providers:

  * ``load_mask_dir``    — load externally-produced masks (the SAM plug-in point;
                           production supplies fal-ai/sam-3/video masks here).
  * ``derive_heuristic`` — a genuinely-computed but deliberately COARSE prototype
                           fallback. The most important mask for the kill
                           criterion — ``hands_arms`` (the forearms crossing the
                           chest) — uses a REAL YCrCb skin segmentation, because
                           natural hand/arm occlusion is exactly what the test
                           stresses. The garment regions are a coarse
                           person-region split; they are honest stand-ins, not
                           pixel-accurate garment segmentation, and are labelled
                           as such in the QA report.

Nothing here pretends to be SAM. When a mask dir exists it wins.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional

import cv2
import numpy as np

from .brand import RegionGeometry
from .config import FOREGROUND_REGION, GARMENT_REGIONS


def load_mask_dir(directory: str, index: int, shape) -> Optional[np.ndarray]:
    """Load a provided mask (SAM plug-in point). Returns uint8 0/255 or None."""
    path = os.path.join(directory, f"frame_{index:05d}.png")
    if not os.path.exists(path):
        return None
    m = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if m is None:
        return None
    if m.shape[:2] != tuple(shape[:2]):
        m = cv2.resize(m, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    return (m > 127).astype(np.uint8) * 255


# --- REAL: skin / hands_arms via YCrCb ---------------------------------------

def skin_mask(bgr: np.ndarray) -> np.ndarray:
    """Standard YCrCb skin segmentation (real). Captures the forearms/hands that
    cross the chest — the foreground occluder the compositor must keep on top."""
    ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    lower = np.array([0, 135, 85], dtype=np.uint8)
    upper = np.array([255, 180, 135], dtype=np.uint8)
    m = cv2.inRange(ycrcb, lower, upper)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    return m


# --- COARSE prototype garment/person region ----------------------------------

def person_mask_grabcut(bgr: np.ndarray, rect_rel=(0.15, 0.05, 0.70, 0.90)) -> np.ndarray:
    """Coarse foreground via GrabCut seeded from a central rectangle. Real, runs
    on CPU. Prototype-grade — a labelled stand-in for a person/garment segmenter."""
    h, w = bgr.shape[:2]
    rx, ry, rw, rh = rect_rel
    rect = (int(w * rx), int(h * ry), int(w * rw), int(h * rh))
    mask = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(bgr, mask, rect, bgd, fgd, 3, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        # Degenerate frame -> fall back to the seed rectangle.
        mask[rect[1]:rect[1] + rect[3], rect[0]:rect[0] + rect[2]] = cv2.GC_FGD
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return fg


@dataclass
class RegionMaskSet:
    masks: Dict[str, np.ndarray]           # region -> uint8 0/255
    source: str                            # "provided" | "heuristic" | "mixed"

    def get(self, region: str, shape) -> np.ndarray:
        m = self.masks.get(region)
        if m is None:
            return np.zeros(shape[:2], np.uint8)
        return m

    def garment_union(self, shape) -> np.ndarray:
        out = np.zeros(shape[:2], np.uint8)
        for r in GARMENT_REGIONS:
            m = self.masks.get(r)
            if m is not None:
                out = cv2.bitwise_or(out, m)
        return out


def derive_heuristic(bgr: np.ndarray) -> RegionMaskSet:
    """Derive the full region set for one frame. hands_arms is REAL skin; garment
    regions are a coarse person-region geometric split (labelled coarse)."""
    h, w = bgr.shape[:2]
    person = person_mask_grabcut(bgr)
    skin = skin_mask(bgr)
    # Garment = person minus skin (skin is foreground occluder / face).
    garment = cv2.bitwise_and(person, cv2.bitwise_not(skin))

    # Geometric split of the garment blob into torso / sleeves / collar.
    ys, xs = np.where(garment > 0)
    masks: Dict[str, np.ndarray] = {r: np.zeros((h, w), np.uint8) for r in GARMENT_REGIONS}
    masks[FOREGROUND_REGION] = skin
    if len(xs) > 50:
        x0, x1 = xs.min(), xs.max()
        y0, y1 = ys.min(), ys.max()
        gw = max(1, x1 - x0)
        gh = max(1, y1 - y0)
        cx_split_l = x0 + int(gw * 0.30)
        cx_split_r = x0 + int(gw * 0.70)
        collar_y = y0 + int(gh * 0.14)
        for (yy, xx) in zip(ys, xs):
            if yy <= collar_y and cx_split_l <= xx <= cx_split_r:
                masks["collar"][yy, xx] = 255
            elif xx < cx_split_l:
                masks["left_sleeve"][yy, xx] = 255
            elif xx > cx_split_r:
                masks["right_sleeve"][yy, xx] = 255
            else:
                masks["torso"][yy, xx] = 255
    return RegionMaskSet(masks=masks, source="heuristic")


def region_geometry(index: int, mask: np.ndarray) -> RegionGeometry:
    """Centroid + bbox + principal-axis angle of a mask (feeds the brand track)."""
    ys, xs = np.where(mask > 0)
    if len(xs) < 20:
        return RegionGeometry(index=index, present=False)
    cx, cy = float(xs.mean()), float(ys.mean())
    x0, y0, x1, y1 = float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())
    # Principal axis via covariance -> orientation of the region.
    cov = np.cov(np.vstack([xs.astype(np.float64), ys.astype(np.float64)]))
    angle = 0.0
    if cov.shape == (2, 2) and np.isfinite(cov).all():
        evals, evecs = np.linalg.eigh(cov)
        major = evecs[:, int(np.argmax(evals))]
        angle = float(np.degrees(np.arctan2(major[1], major[0])))
        # Fold to a small deviation from vertical (torso is ~upright).
        angle = ((angle + 90.0 + 90.0) % 180.0) - 90.0
    return RegionGeometry(index=index, present=True, cx=cx, cy=cy, x0=x0, y0=y0, x1=x1, y1=y1, angle_deg=angle)


def feather(mask: np.ndarray, px: int) -> np.ndarray:
    """Return a float 0..1 alpha with a feathered boundary (kills edge halos)."""
    if px <= 0:
        return (mask > 0).astype(np.float32)
    k = px * 2 + 1
    soft = cv2.GaussianBlur((mask > 0).astype(np.float32), (k, k), 0)
    return np.clip(soft, 0.0, 1.0)
