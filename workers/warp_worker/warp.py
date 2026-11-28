"""Flow-based warping + bidirectional anchor propagation (spec capability #6).

To place an approved anchor's garment DETAIL into an intermediate frame we warp
the anchor by the flow that maps the intermediate frame's pixels back to the
anchor. Those long-range flows are built by COMPOSING the per-step dense flows
(chaining), not by re-estimating flow across a big temporal gap (which DIS/RAFT
both do poorly). Then the two bracketing anchors are blended by position ``t``
AND by warped confidence, so the more-trustworthy side dominates.

All real remaps; no fabricated correspondence.
"""
from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np


def _grid(h: int, w: int) -> Tuple[np.ndarray, np.ndarray]:
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return xs, ys


def remap_by_flow(img: np.ndarray, flow: np.ndarray) -> np.ndarray:
    """dst(x) = img(x + flow(x)). ``flow`` maps OUTPUT pixels to source
    displacement (i.e. flow_{out->src})."""
    h, w = flow.shape[:2]
    xs, ys = _grid(h, w)
    map_x = (xs + flow[..., 0]).astype(np.float32)
    map_y = (ys + flow[..., 1]).astype(np.float32)
    return cv2.remap(img, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def compose_flow(flow_ab: np.ndarray, flow_bc: np.ndarray) -> np.ndarray:
    """Compose displacement fields: flow_ac(x) = flow_ab(x) + flow_bc(x+flow_ab(x)).
    Chains a->b and b->c into a->c."""
    h, w = flow_ab.shape[:2]
    xs, ys = _grid(h, w)
    fx = (xs + flow_ab[..., 0]).astype(np.float32)
    fy = (ys + flow_ab[..., 1]).astype(np.float32)
    bc_x = cv2.remap(flow_bc[..., 0], fx, fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    bc_y = cv2.remap(flow_bc[..., 1], fx, fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    out = np.empty_like(flow_ab)
    out[..., 0] = flow_ab[..., 0] + bc_x
    out[..., 1] = flow_ab[..., 1] + bc_y
    return out


def chain_flow(step_flows: List[np.ndarray]) -> Optional[np.ndarray]:
    """Compose an ordered list of per-step flows into one cumulative flow.
    e.g. [flow_{i->i-1}, flow_{i-1->i-2}, ...] -> flow_{i->P}. Empty -> None
    (the frame IS the anchor)."""
    if not step_flows:
        return None
    acc = step_flows[0]
    for f in step_flows[1:]:
        acc = compose_flow(acc, f)
    return acc


def warp_anchor(anchor_img: np.ndarray, cumulative_flow: Optional[np.ndarray]) -> np.ndarray:
    """Warp an anchor image into a target frame's geometry. None flow -> identity
    (the target frame is the anchor)."""
    if cumulative_flow is None:
        return anchor_img.copy()
    return remap_by_flow(anchor_img, cumulative_flow)


def warp_scalar(field: np.ndarray, cumulative_flow: Optional[np.ndarray]) -> np.ndarray:
    """Warp a single-channel field (e.g. confidence / mask) the same way."""
    if cumulative_flow is None:
        return field.copy()
    return remap_by_flow(field, cumulative_flow)


def blend_bidirectional(
    warped_prev: np.ndarray,
    warped_next: Optional[np.ndarray],
    t: float,
    conf_prev: Optional[np.ndarray] = None,
    conf_next: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Blend the two bracketing anchor warps. Weight combines position (``t``)
    with per-pixel warped confidence so the trustworthy side wins near
    occlusions. Single-sided (next None) returns the prev warp."""
    if warped_next is None:
        return warped_prev
    h, w = warped_prev.shape[:2]
    wp = np.full((h, w), 1.0 - t, dtype=np.float32)
    wn = np.full((h, w), t, dtype=np.float32)
    if conf_prev is not None and conf_next is not None:
        wp = wp * (0.25 + conf_prev)
        wn = wn * (0.25 + conf_next)
    total = wp + wn
    total[total == 0] = 1.0
    wp /= total
    wn /= total
    if warped_prev.ndim == 3:
        wp = wp[..., None]
        wn = wn[..., None]
    out = warped_prev.astype(np.float32) * wp + warped_next.astype(np.float32) * wn
    return np.clip(out, 0, 255).astype(np.uint8)
