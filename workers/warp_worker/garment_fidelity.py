"""GARMENT-FIDELITY scorecard (new required benchmark axis).

Until now the benchmark was almost entirely TEMPORAL. The stakeholder requires a
quantitative garment-fidelity score, reported as a SEPARATE scorecard from
temporal stability and never averaged into it. Components:

  * stripe_width_variance      — does the chest stripe keep constant thickness
  * stripe_position_variance   — does it stay put vertically (no swim)
  * logo_alignment             — logo centroid stability vs the stripe
  * logo_legibility            — local contrast/sharpness in the logo box
  * zipper_alignment           — vertical centre seam straightness
  * collar_geometry            — collar-region shape stability

The first two are AUTO-measured here from the navy band (real numbers). The last
four are marked SEMI-MANUAL for the first pass (the stakeholder explicitly allows
this) with the measurement method recorded, so they can be filled in as benchmark
numbers without changing the schema. Nothing is faked: a component that was not
measured is reported as ``null`` with its method, not a guessed score.

Lower variance = higher fidelity. Values are recorded as benchmark numbers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np


@dataclass
class StripeMeasurement:
    index: int
    present: bool
    width_norm: float = 0.0     # band thickness / torso height
    cy_norm: float = 0.0        # band vertical centre / torso height (0=top,1=bot)
    cx_norm: float = 0.0        # band horizontal centre / torso width
    coverage: float = 0.0       # navy fraction of the chest search box


def _torso_bbox(garment_mask: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    ys, xs = np.where(garment_mask > 0)
    if len(xs) < 50:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def measure_stripe(bgr: np.ndarray, garment_mask: np.ndarray, index: int = 0) -> StripeMeasurement:
    """Detect the navy chest band inside the garment region and measure its
    thickness + position, normalised by torso extent. Real measurement."""
    bb = _torso_bbox(garment_mask)
    if bb is None:
        return StripeMeasurement(index=index, present=False)
    x0, y0, x1, y1 = bb
    th = max(1, y1 - y0)
    tw = max(1, x1 - x0)
    # chest search box: upper-mid torso where the stripe lives
    cy0, cy1 = y0 + int(th * 0.20), y0 + int(th * 0.70)
    roi = bgr[cy0:cy1, x0:x1]
    gm = garment_mask[cy0:cy1, x0:x1] > 0
    if roi.size == 0 or not gm.any():
        return StripeMeasurement(index=index, present=False)
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    # navy: blue hue, moderate+ saturation, low-mid value
    navy = cv2.inRange(hsv, np.array([100, 60, 20]), np.array([135, 255, 160]))
    navy = (navy > 0) & gm
    if navy.sum() < 0.01 * gm.sum():
        return StripeMeasurement(index=index, present=False, coverage=float(navy.sum()) / max(1, gm.sum()))
    ys, xs = np.where(navy)
    # band thickness = vertical extent of the dominant navy rows
    row_counts = navy.sum(axis=1)
    active_rows = np.where(row_counts > 0.15 * row_counts.max())[0]
    width = (active_rows.max() - active_rows.min() + 1) if len(active_rows) else 0
    cy = float(ys.mean()) + cy0
    cx = float(xs.mean()) + x0
    return StripeMeasurement(
        index=index, present=True,
        width_norm=width / th,
        cy_norm=(cy - y0) / th,
        cx_norm=(cx - x0) / tw,
        coverage=float(navy.sum()) / max(1, gm.sum()),
    )


def _cv(vals: List[float]) -> Optional[float]:
    v = [x for x in vals if x is not None]
    if len(v) < 2:
        return None
    m = float(np.mean(v))
    if abs(m) < 1e-9:
        return None
    return float(np.std(v) / abs(m))


def _std(vals: List[float]) -> Optional[float]:
    v = [x for x in vals if x is not None]
    return float(np.std(v)) if len(v) >= 2 else None


@dataclass
class FidelityScorecard:
    label: str
    frames_measured: int
    stripe_width_variance: Optional[float]      # CV of band thickness (lower better)
    stripe_position_variance: Optional[float]   # std of normalised cy (lower better)
    stripe_x_variance: Optional[float]
    stripe_presence_rate: float
    logo_alignment: Optional[float] = None
    logo_legibility: Optional[float] = None
    zipper_alignment: Optional[float] = None
    collar_geometry: Optional[float] = None
    methods: Dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        def r(x):
            return None if x is None else round(x, 4)
        return {
            "label": self.label,
            "frames_measured": self.frames_measured,
            "stripe_width_variance": r(self.stripe_width_variance),
            "stripe_position_variance": r(self.stripe_position_variance),
            "stripe_x_variance": r(self.stripe_x_variance),
            "stripe_presence_rate": r(self.stripe_presence_rate),
            "logo_alignment": r(self.logo_alignment),
            "logo_legibility": r(self.logo_legibility),
            "zipper_alignment": r(self.zipper_alignment),
            "collar_geometry": r(self.collar_geometry),
            "methods": self.methods,
        }


SEMI_MANUAL_METHODS = {
    "logo_alignment": "SEMI-MANUAL: mark logo centroid in N sampled frames; report std of "
                      "(logo_centroid - stripe_centroid) normalised by torso width.",
    "logo_legibility": "SEMI-MANUAL: local RMS contrast / Laplacian variance in a fixed logo box; "
                       "higher = sharper, less smeared.",
    "zipper_alignment": "SEMI-MANUAL: fit a line to the central vertical seam; report max lateral "
                        "deviation (px, normalised by torso width).",
    "collar_geometry": "SEMI-MANUAL: mark collar top corners in N frames; report variance of "
                       "collar width + tilt.",
}


def score_fidelity(measurements: List[StripeMeasurement], label: str) -> FidelityScorecard:
    present = [m for m in measurements if m.present]
    widths = [m.width_norm for m in present]
    cys = [m.cy_norm for m in present]
    cxs = [m.cx_norm for m in present]
    return FidelityScorecard(
        label=label,
        frames_measured=len(present),
        stripe_width_variance=_cv(widths),
        stripe_position_variance=_std(cys),
        stripe_x_variance=_std(cxs),
        stripe_presence_rate=len(present) / max(1, len(measurements)),
        methods=dict(SEMI_MANUAL_METHODS),
    )
