"""Deterministic, tracked brand layer (spec capability #10).

The navy chest stripe + logo are the parts a diffusion engine reliably mangles
(they "swim" and rescale). The LOCKED architecture keeps them as REAL tracked
pixels composited deterministically — never generated. This module:

  1. derives a per-frame brand TRACK from the garment region geometry
     (centroid + bbox + orientation of the torso mask), so the stripe/logo
     ride the body instead of floating; and
  2. rasterizes the brand asset at each tracked placement.

The geometry (track) is pure and unit-testable. Only the raster step needs
numpy, so it is lazily imported. The asset itself is model-agnostic: pass any
RGBA reference, or use ``synthetic_brand_asset`` for a deterministic stand-in
that lets the prototype exercise stripe-width / logo-stability QA without an
external file.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class RegionGeometry:
    """Summary geometry of a garment region on one frame (from its mask)."""

    index: int
    present: bool
    cx: float = 0.0        # centroid x (px)
    cy: float = 0.0        # centroid y (px)
    x0: float = 0.0        # bbox
    y0: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    angle_deg: float = 0.0  # principal-axis orientation (0 = upright)

    @property
    def width(self) -> float:
        return max(0.0, self.x1 - self.x0)

    @property
    def height(self) -> float:
        return max(0.0, self.y1 - self.y0)


@dataclass
class BrandPlacement:
    """Where the brand asset is stamped on a frame. Deterministic from geometry."""

    index: int
    present: bool
    stripe_cx: float = 0.0
    stripe_cy: float = 0.0
    stripe_w: float = 0.0
    stripe_h: float = 0.0
    logo_cx: float = 0.0
    logo_cy: float = 0.0
    logo_size: float = 0.0
    angle_deg: float = 0.0


# Relative placement of stripe + logo within the torso bbox. These are the
# tracked constants — the "brand spec". Chest stripe sits across the upper
# torso; logo above it, left-of-centre.
STRIPE_REL_CY = 0.42     # fraction of torso height from top
STRIPE_REL_W = 0.86      # fraction of torso width
STRIPE_REL_H = 0.10
LOGO_REL_CX = 0.32
LOGO_REL_CY = 0.24
LOGO_REL_SIZE = 0.14     # fraction of torso width


def place_brand(geom: RegionGeometry) -> BrandPlacement:
    """Deterministically place the stripe + logo from torso geometry (pure)."""
    if not geom.present or geom.width <= 0 or geom.height <= 0:
        return BrandPlacement(index=geom.index, present=False)
    return BrandPlacement(
        index=geom.index,
        present=True,
        stripe_cx=geom.x0 + geom.width * 0.5,
        stripe_cy=geom.y0 + geom.height * STRIPE_REL_CY,
        stripe_w=geom.width * STRIPE_REL_W,
        stripe_h=geom.height * STRIPE_REL_H,
        logo_cx=geom.x0 + geom.width * LOGO_REL_CX,
        logo_cy=geom.y0 + geom.height * LOGO_REL_CY,
        logo_size=geom.width * LOGO_REL_SIZE,
        angle_deg=geom.angle_deg,
    )


def track_brand(geoms: List[RegionGeometry], smooth: int = 3) -> List[BrandPlacement]:
    """Per-frame brand track with light temporal smoothing so the stripe/logo do
    not jitter frame-to-frame (a diffusion "swim" surrogate the QA checks for).
    Smoothing is a centred moving average over present placements (pure)."""
    raw = [place_brand(g) for g in geoms]
    if smooth <= 1:
        return raw
    out: List[BrandPlacement] = []
    half = smooth // 2
    for i, p in enumerate(raw):
        if not p.present:
            out.append(p)
            continue
        window = [raw[j] for j in range(max(0, i - half), min(len(raw), i + half + 1)) if raw[j].present]
        n = len(window)
        out.append(
            BrandPlacement(
                index=p.index,
                present=True,
                stripe_cx=sum(w.stripe_cx for w in window) / n,
                stripe_cy=sum(w.stripe_cy for w in window) / n,
                stripe_w=sum(w.stripe_w for w in window) / n,
                stripe_h=sum(w.stripe_h for w in window) / n,
                logo_cx=sum(w.logo_cx for w in window) / n,
                logo_cy=sum(w.logo_cy for w in window) / n,
                logo_size=sum(w.logo_size for w in window) / n,
                angle_deg=sum(w.angle_deg for w in window) / n,
            )
        )
    return out


def stripe_width_stability(track: List[BrandPlacement]) -> Optional[float]:
    """Coefficient of variation of stripe width across present frames — a direct
    'does the stripe rescale/swim' QA metric (lower = more stable). Pure."""
    widths = [p.stripe_w for p in track if p.present and p.stripe_w > 0]
    if len(widths) < 2:
        return None
    mean = sum(widths) / len(widths)
    if mean == 0:
        return None
    var = sum((w - mean) ** 2 for w in widths) / len(widths)
    return math.sqrt(var) / mean


# --- raster (needs numpy; lazily imported) -----------------------------------

def synthetic_brand_asset(size: int = 256):
    """Deterministic navy-stripe + logo RGBA stand-in. Real navy (#1b2a4a) with a
    high-contrast light band + a simple bordered mark, so QA can measure whether
    the *placement* holds without depending on an external brand file."""
    import numpy as np

    a = np.zeros((size, size, 4), dtype=np.uint8)
    navy = (74, 42, 27)  # BGR of #1b2a4a
    # Stripe band across the middle.
    y0, y1 = int(size * 0.44), int(size * 0.56)
    a[y0:y1, :, :3] = navy
    a[y0:y1, :, 3] = 255
    # Thin light keyline top & bottom of the band (construction edge cue).
    a[y0 : y0 + 2, :, :3] = (230, 230, 230)
    a[y0 : y0 + 2, :, 3] = 255
    a[y1 - 2 : y1, :, :3] = (230, 230, 230)
    a[y1 - 2 : y1, :, 3] = 255
    return a


def render_brand_layer(canvas_h: int, canvas_w: int, placement: BrandPlacement, asset):
    """Return an (H,W,4) RGBA layer with the brand asset stamped at ``placement``
    (rotated by angle). Needs numpy + cv2. Deterministic."""
    import cv2
    import numpy as np

    layer = np.zeros((canvas_h, canvas_w, 4), dtype=np.uint8)
    if not placement.present or placement.stripe_w <= 1 or placement.stripe_h <= 1:
        return layer
    w = max(2, int(round(placement.stripe_w)))
    h = max(2, int(round(placement.stripe_h)))
    stamp = cv2.resize(asset, (w, h), interpolation=cv2.INTER_AREA)
    # Rotate the stamp about its centre by the tracked angle.
    if abs(placement.angle_deg) > 0.5:
        M = cv2.getRotationMatrix2D((w / 2, h / 2), placement.angle_deg, 1.0)
        stamp = cv2.warpAffine(stamp, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    cx, cy = int(round(placement.stripe_cx)), int(round(placement.stripe_cy))
    x0, y0 = cx - w // 2, cy - h // 2
    _paste_rgba(layer, stamp, x0, y0)
    return layer


def _paste_rgba(dst, src, x0: int, y0: int) -> None:
    import numpy as np

    H, W = dst.shape[:2]
    h, w = src.shape[:2]
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    sx0, sy0 = dx0 - x0, dy0 - y0
    dst[dy0:dy1, dx0:dx1, :] = src[sy0 : sy0 + (dy1 - dy0), sx0 : sx0 + (dx1 - dx0), :]
