"""Fit the swap's head surroundings onto HIS face outline, row by row (pure numpy; body_only_swap applies it).

The generator redraws his head a little wider or narrower and shifted (c041 v2's close-up, 2 Nov 2026: 9 % wider at
cheek level, 7 px to the right, while the landmark ovals of both faces barely differ). The hat brim, the collar and
the scene in the swap were drawn against THAT face, so put beside his real face they leave a wedge of scene at one
cheek and the swap's own jaw at the other: an outline that moves with the train. Here each head row of the swap is
re-mapped horizontally so the swap's face edges land on his, with the shift fading out over 0.6 face heights to
either side and over the bottom rows of the head box. Edges come from the face-skin masks (eye to mouth rows, where
both faces are wide); the other head rows take the nearest measured row's shift."""
import numpy as np


def row_edges(mask, r0, r1, min_w):
    """(H, 2) float array of the mask's outer left/right column per row in [r0, r1) (the glasses split the face
    skin into runs; the outline is the outer extent), NaN where the extent is narrower than min_w."""
    H = mask.shape[0]; out = np.full((H, 2), np.nan, np.float32)
    for r in range(max(0, r0), min(H, r1)):
        xs = np.flatnonzero(mask[r])
        if xs.size and xs[-1] - xs[0] + 1 >= min_w: out[r] = (xs[0], xs[-1])
    return out


def smooth_edges(e, rows=9):
    """Fill NaN rows from the nearest measured row, then a running median over `rows` rows. None when nothing measured."""
    e = e.copy(); ok = ~np.isnan(e[:, 0])
    if not ok.any(): return None
    idx = np.arange(len(e)); src = idx[ok]
    for c in (0, 1):
        e[:, c] = np.interp(idx, src, e[ok, c])
    half = rows // 2
    out = e.copy()
    for r in range(len(e)):
        a, b = max(0, r - half), min(len(e), r + half + 1)
        out[r] = np.median(e[a:b], axis=0)
    # then a running mean over the same span: a row-to-row step in the shift tears the picture
    k = np.ones(rows, np.float32) / rows
    for c in (0, 1): out[:, c] = np.convolve(np.pad(out[:, c], (half, half), mode="edge"), k, mode="valid")
    return out


def x_map(W, H, r0, r1, eo, es, fh, taper_rows=None):
    """map_x (H, W) float32 for cv2.remap: for each output pixel of the ORIGINAL's frame, the swap column to read.
    Rows [r0, r1) are re-mapped so the swap's face edges (es) land on the original's (eo); the shift fades to zero
    0.6 * fh beyond each edge and over the last taper_rows rows of the range. Other rows are the identity."""
    xs = np.arange(W, dtype=np.float32)
    m = np.tile(xs, (H, 1))
    T = 0.6 * fh
    if taper_rows is None: taper_rows = max(1, int(0.2 * (r1 - r0)))
    for r in range(max(0, r0), min(H, r1)):
        Lo, Ro = eo[r]; Ls, Rs = es[r]
        if not (np.isfinite(Lo) and np.isfinite(Ls)) or Ro <= Lo or Rs <= Ls: continue
        w = 1.0
        if r >= r1 - taper_rows: w = (r1 - r) / float(taper_rows)
        # knots in OUTPUT space -> source column; the identity beyond the fade, and at the frame's edges
        kx = np.array([0, Lo - T, Lo, Ro, Ro + T, W - 1], np.float32)
        ky = np.array([0, Lo - T, Ls, Rs, Ro + T, W - 1], np.float32)
        if not np.all(np.diff(kx) > 0): continue
        src = np.interp(xs, kx, ky)
        m[r] = xs + w * (src - xs)
    return m


def fit_edges(oc_face, sc_face, r_eye, r_mouth, fh):
    """Per-row outer edges of both faces between the eye and mouth rows (at least 0.4 fh wide), smoothed over
    0.1 fh rows; (eo, es) or None when either face is not seen there."""
    rows = max(3, int(0.1 * fh) | 1)
    eo = smooth_edges(row_edges(oc_face, r_eye, r_mouth, 0.4 * fh), rows)
    es = smooth_edges(row_edges(sc_face, r_eye, r_mouth, 0.4 * fh), rows)
    if eo is None or es is None: return None
    return eo, es
