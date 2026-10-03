"""Model-agnostic data contracts for the warp worker.

The whole point of these types is that NOTHING downstream is hard-wired to Grok
or Kolors. The pipeline consumes:

  * SOURCE frames          — the original footage (identity / pose / occlusion
                             ground truth).
  * BASE garment frames    — per-frame garment geometry from the *geometry
                             authority* (Kolors today; any per-frame VTON
                             tomorrow). Optional: when absent the source frame is
                             the base (compositing outside the garment region is
                             then provably lossless).
  * CORRECTION ANCHORS     — approved garment-DETAIL references at chosen indices
                             from the *detail authority* (Grok today). These are
                             NOT literal full-frame donors — they carry construction
                             detail + branding that the base garment lacks.
  * REGION MASKS           — per-frame torso / sleeves / collar / stripe_logo /
                             hands_arms masks.
  * FLOW FIELDS            — forward + backward dense flow over the SOURCE.
  * CONFIDENCE / OCCLUSION — derived from forward/backward consistency.
  * TRACKED DETAIL ASSETS  — the deterministic brand layer (navy stripe + logo)
                             and its per-frame track.

Better models simply supply different SOURCE/BASE/ANCHOR/MASK providers; the
flow + gate + composite core is unchanged.

These dataclasses hold only metadata + on-disk paths (no pixel arrays), so this
module has NO heavy dependencies and is importable anywhere (tests, the edge
bridge, tooling).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ShotSpec:
    """One approved 2-4s shot to process. Paths are directories of zero-padded
    frames (``frame_%05d.png``) unless noted."""

    shot_id: str
    frame_count: int

    # Directory of ORIGINAL footage frames (required — identity/pose truth).
    source_dir: str

    # Directory of BASE garment frames (geometry authority / Kolors). Optional;
    # when None, the source frame is used as the base (identity-preserving).
    base_dir: Optional[str] = None

    # Correction anchors: {frame_index: image_path}. The detail authority (Grok)
    # supplies garment-detail-correct references at these indices. Index 0 and
    # frame_count-1 SHOULD be present so no intermediate extrapolates past an end.
    anchors: Dict[int, str] = field(default_factory=dict)

    # Per-frame region masks: masks[region] = directory of frame_%05d.png masks.
    # When a region dir is absent the worker derives a heuristic mask (prototype)
    # or treats it as empty (production plugs in SAM masks here).
    mask_dirs: Dict[str, str] = field(default_factory=dict)

    # Deterministic brand asset (navy stripe + logo) — a single RGBA reference
    # image; placement per frame comes from the brand track (see brand.py).
    brand_asset_path: Optional[str] = None

    # Free-form provenance for the reproducibility record.
    notes: str = ""


@dataclass
class Anchor:
    """An approved correction anchor placed at a frame index."""

    index: int
    image_path: str
    approved: bool = True
    origin: str = "detail_authority"   # e.g. "grok", "manual", "reanchor"


@dataclass
class FrameArtifacts:
    """On-disk outputs produced for a single frame."""

    index: int
    composite_path: Optional[str] = None      # final composited frame
    flow_fwd_path: Optional[str] = None        # forward flow (.npy) to next
    flow_bwd_path: Optional[str] = None        # backward flow (.npy) from next
    confidence_path: Optional[str] = None      # confidence map (.npy / .png)
    occlusion_path: Optional[str] = None       # occlusion mask (.png)


@dataclass
class FlowMetrics:
    """Per-frame metrics fed into the re-anchor gate. Mirrors the FlowMetrics
    interface in ``_shared/flowBreak.ts`` exactly so the edge function can
    consume the worker's output verbatim."""

    index: int
    confidence: Optional[float] = None      # 0..1 (fwd/bwd consistency ratio)
    rotationDeg: Optional[float] = None     # estimated inter-frame rotation
    occlusionRatio: Optional[float] = None  # 0..1 garment fraction occluded
    sceneCut: Optional[bool] = None

    def to_json(self) -> dict:
        out = {"index": self.index}
        if self.confidence is not None:
            out["confidence"] = round(self.confidence, 4)
        if self.rotationDeg is not None:
            out["rotationDeg"] = round(self.rotationDeg, 3)
        if self.occlusionRatio is not None:
            out["occlusionRatio"] = round(self.occlusionRatio, 4)
        if self.sceneCut is not None:
            out["sceneCut"] = self.sceneCut
        return out
