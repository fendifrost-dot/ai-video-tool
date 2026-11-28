"""Region compositing (spec capabilities #8, #9, #10 integration).

The compositor is where identity/pose is PRESERVED: everything outside the
garment region is the ORIGINAL footage pixel-for-pixel. Inside the garment
region we lay in the propagated garment, then the deterministic brand layer, and
finally re-assert the foreground (hands/arms) so natural occlusion is never
painted over.

Layer order (bottom -> top):
  1. original source frame                         (identity / pose / scene)
  2. propagated garment, inside feathered garment mask, with original-patch
     leakage suppressed
  3. deterministic brand layer (navy stripe + logo), clipped to the garment
  4. foreground occluders (hands/arms) restored from the original frame
"""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from .masks import feather


def suppress_original_patch(
    source_bgr: np.ndarray,
    garment_bgr: np.ndarray,
    garment_alpha: np.ndarray,
    patch_mask: Optional[np.ndarray],
) -> np.ndarray:
    """Deterministically remove the ORIGINAL garment's patch/branding so it does
    not bleed through the swap (capability #9). Where ``patch_mask`` is set we
    force the propagated garment (alpha := 1), overriding any soft blend that
    would let the old patch show. No-op when no patch mask is supplied."""
    if patch_mask is None:
        return garment_alpha
    a = garment_alpha.copy()
    a[patch_mask > 0] = 1.0
    return a


def alpha_over(base: np.ndarray, top: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """base*(1-a) + top*a, alpha (H,W) float 0..1."""
    a = alpha[..., None] if alpha.ndim == 2 else alpha
    out = base.astype(np.float32) * (1.0 - a) + top.astype(np.float32) * a
    return np.clip(out, 0, 255).astype(np.uint8)


def composite_frame(
    source_bgr: np.ndarray,
    garment_bgr: np.ndarray,
    garment_mask: np.ndarray,
    foreground_mask: Optional[np.ndarray] = None,
    brand_layer_rgba: Optional[np.ndarray] = None,
    patch_mask: Optional[np.ndarray] = None,
    feather_px: int = 3,
) -> np.ndarray:
    """Produce one composited frame. See module docstring for layer order."""
    h, w = source_bgr.shape[:2]
    out = source_bgr.copy()

    # (2) propagated garment inside the feathered garment mask.
    g_alpha = feather(garment_mask, feather_px)
    g_alpha = suppress_original_patch(source_bgr, garment_bgr, g_alpha, patch_mask)
    # Never composite garment where the foreground occludes it.
    if foreground_mask is not None:
        g_alpha = g_alpha * (1.0 - (foreground_mask > 0).astype(np.float32))
    out = alpha_over(out, garment_bgr, g_alpha)

    # (3) deterministic brand layer, clipped to the garment region.
    if brand_layer_rgba is not None:
        b_rgb = brand_layer_rgba[..., :3]
        b_a = (brand_layer_rgba[..., 3].astype(np.float32) / 255.0)
        b_a = b_a * (garment_mask > 0).astype(np.float32)
        if foreground_mask is not None:
            b_a = b_a * (1.0 - (foreground_mask > 0).astype(np.float32))
        out = alpha_over(out, b_rgb, b_a)

    # (4) restore foreground occluders (hands/arms) from the ORIGINAL frame so
    # the real performance's occlusion always wins over the swap.
    if foreground_mask is not None:
        f_alpha = feather(foreground_mask, max(1, feather_px - 1))
        out = alpha_over(out, source_bgr, f_alpha)

    return out


def edge_halo_metric(source_bgr: np.ndarray, composite_bgr: np.ndarray, garment_mask: np.ndarray, band_px: int = 4) -> float:
    """Mean absolute change in a thin band just OUTSIDE the garment mask. A clean
    composite changes ~nothing outside the region; a haloing one lights up the
    band. Lower = cleaner (capability: 'no edge halo')."""
    m = (garment_mask > 0).astype(np.uint8)
    dil = cv2.dilate(m, np.ones((band_px * 2 + 1, band_px * 2 + 1), np.uint8))
    band = (dil > 0) & (m == 0)
    if not band.any():
        return 0.0
    diff = cv2.absdiff(source_bgr, composite_bgr).astype(np.float32).mean(axis=2)
    return float(diff[band].mean())
