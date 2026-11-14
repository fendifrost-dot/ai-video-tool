"""Visual QA + side-by-side report (spec capability #12).

Metrics are chosen to map 1:1 onto the kill criterion (§7 / the PASS CRITERIA):

  * identity_drift_outside   — mean |composite - source| OUTSIDE the garment
                               region. Should be ~0: proves compositing preserves
                               identity/pose/scene (capability #8). This is the
                               single most important number.
  * flicker_ratio            — garment-region frame-to-frame temporal difference
                               of the OUTPUT vs the SOURCE. ~1 means the swap adds
                               no shimmer beyond the real motion; >>1 means boiling.
  * edge_halo                — mean change in a thin band just outside the mask.
  * stripe_width_cv          — coeff. of variation of the tracked stripe width
                               (does the logo/stripe swim / rescale).
  * garment_coverage         — mean garment-mask area fraction (sanity).

Also renders a side-by-side grid: SOURCE | PROTOTYPE, with columns reserved for
the Kolors-only and Grok-only baselines (populated when those frozen artifacts
are provided; otherwise clearly marked PENDING, never faked).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import cv2
import numpy as np


def temporal_diff(seq_a: np.ndarray, seq_b: np.ndarray, mask: np.ndarray) -> float:
    m = mask > 0
    if not m.any():
        return 0.0
    d = cv2.absdiff(seq_a, seq_b).astype(np.float32).mean(axis=2)
    return float(d[m].mean())


def identity_drift_outside(source: np.ndarray, composite: np.ndarray, garment_mask: np.ndarray) -> float:
    outside = garment_mask == 0
    if not outside.any():
        return 0.0
    d = cv2.absdiff(source, composite).astype(np.float32).mean(axis=2)
    return float(d[outside].mean())


@dataclass
class QAMetrics:
    frame_count: int
    identity_drift_outside: float = 0.0
    flicker_ratio: float = 0.0
    flicker_output: float = 0.0
    flicker_source: float = 0.0
    edge_halo: float = 0.0
    stripe_width_cv: Optional[float] = None
    garment_coverage: float = 0.0
    reanchor_count: int = 0
    reanchor_indices: List[int] = field(default_factory=list)
    propagation_residual_mean: Optional[float] = None
    propagation_residual_max: Optional[float] = None
    notes: List[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "frame_count": self.frame_count,
            "identity_drift_outside": round(self.identity_drift_outside, 4),
            "flicker_ratio": round(self.flicker_ratio, 4),
            "flicker_output": round(self.flicker_output, 4),
            "flicker_source": round(self.flicker_source, 4),
            "edge_halo": round(self.edge_halo, 4),
            "stripe_width_cv": None if self.stripe_width_cv is None else round(self.stripe_width_cv, 4),
            "garment_coverage": round(self.garment_coverage, 4),
            "propagation_residual_mean": None if self.propagation_residual_mean is None else round(self.propagation_residual_mean, 4),
            "propagation_residual_max": None if self.propagation_residual_max is None else round(self.propagation_residual_max, 4),
            "reanchor_count": self.reanchor_count,
            "reanchor_indices": self.reanchor_indices,
        }


def build_sidebyside(
    rows: List[Dict[str, Optional[np.ndarray]]],
    columns: List[str],
    out_path: str,
    tile_w: int = 220,
) -> str:
    """rows[i][col] -> BGR frame (or None to draw a PENDING placeholder).
    columns is the ordered header list."""
    tiles: List[List[np.ndarray]] = []
    header = _text_row(columns, tile_w)
    for row in rows:
        cells = []
        for col in columns:
            img = row.get(col)
            if img is None:
                cells.append(_placeholder(tile_w, col))
            else:
                h, w = img.shape[:2]
                th = max(1, round(tile_w * h / w))
                cells.append(cv2.resize(img, (tile_w, th), interpolation=cv2.INTER_AREA))
        # normalise cell heights within the row
        maxh = max(c.shape[0] for c in cells)
        cells = [_pad_to_h(c, maxh) for c in cells]
        tiles.append(cells)
    grid_rows = [np.hstack(cells) for cells in tiles]
    maxw = max(r.shape[1] for r in grid_rows + [header])
    grid_rows = [_pad_to_w(r, maxw) for r in grid_rows]
    header = _pad_to_w(header, maxw)
    grid = np.vstack([header] + grid_rows)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    cv2.imwrite(out_path, grid)
    return out_path


def _text_row(columns: List[str], tile_w: int) -> np.ndarray:
    h = 28
    cells = []
    for c in columns:
        cell = np.full((h, tile_w, 3), 30, np.uint8)
        cv2.putText(cell, c[:26], (6, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (240, 240, 240), 1, cv2.LINE_AA)
        cells.append(cell)
    return np.hstack(cells)


def _placeholder(tile_w: int, col: str) -> np.ndarray:
    cell = np.full((round(tile_w * 16 / 9), tile_w, 3), 45, np.uint8)
    cv2.putText(cell, "PENDING", (10, cell.shape[0] // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2, cv2.LINE_AA)
    cv2.putText(cell, "frozen artifact", (10, cell.shape[0] // 2 + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255), 1, cv2.LINE_AA)
    return cell


def _pad_to_h(img: np.ndarray, h: int) -> np.ndarray:
    if img.shape[0] >= h:
        return img[:h]
    pad = np.zeros((h - img.shape[0], img.shape[1], 3), np.uint8)
    return np.vstack([img, pad])


def _pad_to_w(img: np.ndarray, w: int) -> np.ndarray:
    if img.shape[1] >= w:
        return img[:, :w]
    pad = np.zeros((img.shape[0], w - img.shape[1], 3), np.uint8)
    return np.hstack([img, pad])


def write_report(path: str, metrics: QAMetrics, repro: dict, columns_present: Dict[str, bool], grid_rel: str) -> str:
    """Markdown QA report scored against the kill criterion."""
    def verdict(ok: bool) -> str:
        return "✅" if ok else "❌"

    # Honest, conservative thresholds for the prototype scoring.
    id_ok = metrics.identity_drift_outside < 1.5           # near-lossless outside garment
    flicker_ok = metrics.flicker_ratio < 1.35              # little added shimmer
    halo_ok = metrics.edge_halo < 6.0
    stripe_ok = (metrics.stripe_width_cv is None) or (metrics.stripe_width_cv < 0.08)

    lines = []
    lines.append(f"# Warp-worker one-shot QA — `{repro.get('shot_id','?')}`\n")
    lines.append("Prototype gated-propagation result scored against the LOCKED §7 kill criterion.\n")
    lines.append("## Reproducibility\n")
    lines.append("| key | value |")
    lines.append("|---|---|")
    for k in sorted(repro):
        lines.append(f"| {k} | {repro[k]} |")
    lines.append("")
    lines.append("## Metrics\n")
    lines.append("| metric | value | target | verdict |")
    lines.append("|---|---|---|---|")
    lines.append(f"| identity_drift_outside (mean |Δ| outside garment) | {metrics.identity_drift_outside:.3f} | < 1.5 | {verdict(id_ok)} |")
    lines.append(f"| flicker_ratio (garment Δt output/source) | {metrics.flicker_ratio:.3f} | < 1.35 | {verdict(flicker_ok)} |")
    lines.append(f"| &nbsp;&nbsp;flicker_output | {metrics.flicker_output:.3f} | — | |")
    lines.append(f"| &nbsp;&nbsp;flicker_source | {metrics.flicker_source:.3f} | — | |")
    lines.append(f"| edge_halo (band outside mask) | {metrics.edge_halo:.3f} | < 6.0 | {verdict(halo_ok)} |")
    sw = "n/a" if metrics.stripe_width_cv is None else f"{metrics.stripe_width_cv:.4f}"
    lines.append(f"| stripe_width_cv (does the stripe swim) | {sw} | < 0.08 | {verdict(stripe_ok)} |")
    lines.append(f"| garment_coverage (mean mask area) | {metrics.garment_coverage:.3f} | sanity | |")
    if metrics.propagation_residual_mean is not None:
        rmean = metrics.propagation_residual_mean
        rmax = metrics.propagation_residual_max
        resid_ok = rmax is not None and rmax < 60.0
        lines.append(f"| propagation_residual mean (anchor-warp vs truth, garment) | {rmean:.2f} | — | |")
        lines.append(f"| propagation_residual **max** | {rmax:.2f} | < 60 | {verdict(resid_ok)} |")
    lines.append(f"| re-anchors flagged by gate | {metrics.reanchor_count} | — | |")
    lines.append("")
    if metrics.reanchor_indices:
        lines.append(f"**Gate flagged re-anchor at frames:** {metrics.reanchor_indices}\n")
    lines.append("## Side-by-side\n")
    lines.append(f"![side-by-side]({grid_rel})\n")
    cols = ", ".join(f"{k}={'present' if v else 'PENDING'}" for k, v in columns_present.items())
    lines.append(f"Columns: {cols}\n")
    lines.append("## Honest read\n")
    for n in metrics.notes:
        lines.append(f"- {n}")
    lines.append("")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(lines))
    return path
