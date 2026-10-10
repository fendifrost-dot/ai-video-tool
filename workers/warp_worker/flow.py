"""Dense optical flow + occlusion/confidence (spec capabilities #4, #5).

REAL compute — nothing here is faked. Uses OpenCV DISOpticalFlow (a genuine
dense flow method that runs on CPU) to produce forward and backward flow over
the SOURCE footage, then derives occlusion + confidence from forward/backward
CONSISTENCY (the standard test: warp the backward flow by the forward flow; where
fwd(x) + bwd(x + fwd(x)) ~= 0 the correspondence is trustworthy; where it
diverges the pixel is occluded / unreliable).

HONEST BOUNDARY: DIS is the tractable prototype engine. Production quality wants
RAFT/GMFlow on a GPU — which exposes the SAME (flow_fwd, flow_bwd, occlusion,
confidence) interface, so swapping it in changes only this file. This is why the
worker is model-agnostic about the flow engine, not just the garment engine.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import cv2
import numpy as np

_PRESETS = {
    "opencv-dis-ultrafast": cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST,
    "opencv-dis-fast": cv2.DISOPTICAL_FLOW_PRESET_FAST,
    "opencv-dis-medium": cv2.DISOPTICAL_FLOW_PRESET_MEDIUM,
}


def make_flow_engine(name: str = "opencv-dis-medium"):
    preset = _PRESETS.get(name, cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis = cv2.DISOpticalFlow_create(preset)
    # Density + smoothness that hold structure on cloth without over-smoothing.
    dis.setUseSpatialPropagation(True)
    return dis


def dense_flow(engine, gray_a: np.ndarray, gray_b: np.ndarray) -> np.ndarray:
    """Forward flow A->B, shape (H,W,2) float32 (dx, dy) in pixels."""
    return engine.calc(gray_a, gray_b, None)


@dataclass
class FlowConsistency:
    flow_fwd: np.ndarray       # A->B (H,W,2)
    flow_bwd: np.ndarray       # B->A (H,W,2)
    occlusion: np.ndarray      # (H,W) uint8, 255 = occluded/unreliable
    confidence: np.ndarray     # (H,W) float32 0..1


def _coord_grid(h: int, w: int) -> Tuple[np.ndarray, np.ndarray]:
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return xs, ys


def forward_backward_consistency(
    flow_fwd: np.ndarray, flow_bwd: np.ndarray, tol_px: float = 1.5
) -> Tuple[np.ndarray, np.ndarray]:
    """Return (occlusion_uint8, confidence_float). A pixel x in A maps to
    x' = x + flow_fwd(x); sample flow_bwd at x' and require
    x' + flow_bwd(x') ~= x. The residual magnitude drives confidence."""
    h, w = flow_fwd.shape[:2]
    xs, ys = _coord_grid(h, w)
    fx = xs + flow_fwd[..., 0]
    fy = ys + flow_fwd[..., 1]
    # Sample backward flow at the forward-mapped location (bilinear).
    bwd_x = cv2.remap(flow_bwd[..., 0], fx, fy, interpolation=cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_REPLICATE)
    bwd_y = cv2.remap(flow_bwd[..., 1], fx, fy, interpolation=cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_REPLICATE)
    # Round-trip residual.
    rx = flow_fwd[..., 0] + bwd_x
    ry = flow_fwd[..., 1] + bwd_y
    residual = np.sqrt(rx * rx + ry * ry)
    # Out-of-bounds forward maps are always occluded.
    oob = (fx < 0) | (fx > w - 1) | (fy < 0) | (fy > h - 1)
    occluded = (residual > tol_px) | oob
    occlusion = (occluded.astype(np.uint8)) * 255
    # Confidence: 1 at zero residual, decaying to 0 by ~3*tol; 0 where occluded.
    confidence = np.clip(1.0 - residual / (3.0 * tol_px), 0.0, 1.0).astype(np.float32)
    confidence[occluded] = 0.0
    return occlusion, confidence


def compute_consistency(engine, gray_a: np.ndarray, gray_b: np.ndarray, tol_px: float = 1.5) -> FlowConsistency:
    fwd = dense_flow(engine, gray_a, gray_b)
    bwd = dense_flow(engine, gray_b, gray_a)
    occ, conf = forward_backward_consistency(fwd, bwd, tol_px)
    return FlowConsistency(flow_fwd=fwd, flow_bwd=bwd, occlusion=occ, confidence=conf)


def region_confidence(confidence: np.ndarray, mask: Optional[np.ndarray]) -> float:
    """Mean flow confidence inside a mask (whole frame if mask is None). This is
    the scalar that becomes FlowMetrics.confidence for the gate."""
    if mask is None:
        return float(confidence.mean())
    m = mask > 0
    if not m.any():
        return 1.0  # nothing to propagate here -> not a flow problem
    return float(confidence[m].mean())


def region_occlusion_ratio(occlusion: np.ndarray, mask: Optional[np.ndarray]) -> float:
    """Fraction of a masked region flagged occluded -> FlowMetrics.occlusionRatio."""
    occ = occlusion > 0
    if mask is None:
        return float(occ.mean())
    m = mask > 0
    if not m.any():
        return 0.0
    return float((occ & m).sum() / m.sum())


def estimate_rotation_deg(gray_a: np.ndarray, gray_b: np.ndarray, mask: Optional[np.ndarray] = None) -> float:
    """Estimate inter-frame rotation (deg) from a partial-affine fit on tracked
    corners -> FlowMetrics.rotationDeg. Falls back to 0 when too few matches."""
    pts_a = cv2.goodFeaturesToTrack(gray_a, maxCorners=400, qualityLevel=0.01,
                                    minDistance=7, mask=(mask if mask is not None else None))
    if pts_a is None or len(pts_a) < 6:
        return 0.0
    pts_b, st, _ = cv2.calcOpticalFlowPyrLK(gray_a, gray_b, pts_a, None)
    if pts_b is None:
        return 0.0
    good_a = pts_a[st.flatten() == 1]
    good_b = pts_b[st.flatten() == 1]
    if len(good_a) < 6:
        return 0.0
    M, _ = cv2.estimateAffinePartial2D(good_a, good_b, method=cv2.RANSAC)
    if M is None:
        return 0.0
    ang = np.degrees(np.arctan2(M[1, 0], M[0, 0]))
    return abs(float(ang))
