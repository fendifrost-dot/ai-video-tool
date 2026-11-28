"""Configuration constants — kept in lockstep with the TypeScript edge helpers so
the worker and ``wardrobe-video-propagate-proxy`` agree on the contract.

Thresholds mirror ``supabase/functions/_shared/flowBreak.ts``
(DEFAULT_FLOW_BREAK_THRESHOLDS) and the keyframe cadence band mirrors
``keyframePlan.ts``. If those change, change these together.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

# --- Flow-break / re-anchor thresholds (mirror flowBreak.ts) -----------------
MIN_CONFIDENCE = 0.60
MAX_ROTATION_DEG = 25.0
MAX_OCCLUSION_RATIO = 0.35

# --- Keyframe cadence band (mirror keyframePlan.ts) --------------------------
MIN_KEYFRAME_CADENCE = 12
MAX_KEYFRAME_CADENCE = 24
DEFAULT_KEYFRAME_CADENCE = 18

# --- Region masks the compositor understands (spec capability #3) ------------
# Order matters for layered compositing: garment regions first, foreground
# occluders (hands/arms) last so they always win over the swapped garment.
GARMENT_REGIONS: List[str] = ["torso", "left_sleeve", "right_sleeve", "collar"]
BRAND_REGION = "stripe_logo"            # deterministic brand layer target
FOREGROUND_REGION = "hands_arms"        # occluders that must stay on top
ALL_REGIONS: List[str] = GARMENT_REGIONS + [BRAND_REGION, FOREGROUND_REGION]


@dataclass
class WorkerConfig:
    """Runtime knobs for one prototype shot. All defaults are prototype-scale."""

    # Working resolution the flow/warp/composite runs at. The canonical 16-bit
    # PNGs are 2160x3840; CPU dense flow at full res is intractable, so the
    # prototype downscales to a working width. Production (GPU) runs full res.
    work_width: int = 540

    # Keyframe / anchor cadence (frames). Clamped into [MIN,MAX]_KEYFRAME_CADENCE.
    cadence_frames: int = DEFAULT_KEYFRAME_CADENCE

    # Re-anchor gate thresholds.
    min_confidence: float = MIN_CONFIDENCE
    max_rotation_deg: float = MAX_ROTATION_DEG
    max_occlusion_ratio: float = MAX_OCCLUSION_RATIO

    # Forward/backward consistency tolerance (px, at working resolution) below
    # which a pixel's flow is considered CONSISTENT (not occluded). Above it the
    # pixel is marked occluded -> confidence 0 there.
    fb_consistency_px: float = 1.5

    # Edge feather (px) applied to garment mask boundaries to kill halos.
    feather_px: int = 3

    # Cumulative-propagation gate. Adjacent-frame (per-step) flow at 60fps is
    # trivially consistent even under occlusion, so it under-detects segment-level
    # drift. The honest trust signal is the RESIDUAL between the anchor garment
    # warped to frame k and the true frame k inside the garment mask. This scale
    # maps mean residual (0..255 gray) to a 0..1 confidence:
    #   confidence = clip(1 - residual / residual_conf_scale, 0, 1)
    # so a mean deviation >= residual_conf_scale reads as fully untrusted.
    residual_conf_scale: float = 60.0

    # Per-frame retry budget for the propagation of a single frame.
    max_retries: int = 2

    # Reproducibility labels recorded into status + manifest.
    flow_engine: str = "opencv-dis-medium"
    geometry_authority: str = "kolors"      # base garment frames provider
    detail_authority: str = "grok"          # correction-anchor provider

    def clamp_cadence(self) -> int:
        c = self.cadence_frames
        if c != c:  # NaN
            return DEFAULT_KEYFRAME_CADENCE
        return max(MIN_KEYFRAME_CADENCE, min(MAX_KEYFRAME_CADENCE, round(c)))
