#!/usr/bin/env python3
"""
Deterministic hem repair for a wardrobe edit: remove a garment class that shows where the
Look says it must not (a shirt tail hanging below a closed jacket hem, a shirt showing through
split jacket fronts) and repaint it with the garment that should be there.

Why this exists (S08, 2026-09-24): the source performance wears an untucked shirt, and every
xAI edit of that shot (E1 and two best-of-N rolls, 3/3) keeps the untucked silhouette as a
white shirt tail below the jacket hem. The generator will not fix a defect it inherits from
the source, so best-of-N is the wrong tool; a garment-class repaint is the right one.

Mechanism (nothing here is shot-specific):
  1. Colour classes are learned from the APPROVED anchor frame exactly as construction_score.py
     does, so "shirt", "jacket body" and "trousers" are the anchor's own classes.
  2. Per frame, the changed-region mask (edit vs master) and the chest-stripe landmark place the
     garment-relative HEM REGION (rows r + lo·h .. r + hi·h across the garment width).
  3. Inside that region, pixels of the intruding class (default: the anchor's lightest class,
     i.e. the shirt) are the repair mask, cleaned and smoothed over time (temporal median).
  4. Each column of the mask is filled from the garment that bounds the run: a run bounded
     ABOVE by jacket and BELOW by trousers is a tail hanging below the hem → trousers texture
     propagated upward; a run bounded by jacket on both sides is a split front → jacket texture
     propagated from above; anything else (hands, background) is left alone.
  5. Fills are per-column texture copies with a low-frequency shading match and a feathered
     edge, so the flat black trousers and the mastic jacket keep their footage grain.

QA written next to the output: per-frame intruding-pixel fraction in the hem region before and
after, frames repaired, a contact sheet (before | mask | after) at four instants.

Usage:
  python3 scripts/edit/hem_repair.py --edit s08_e1.mp4 --master cuts/S08_master_*.mp4 \
      --anchor heroes/anchor_hook_s11_f0080.jpg --anchor-master heroes/anchor_hook_master_s11_f0080.jpg \
      --out gfx/s08_e1_hem.mp4
"""
import argparse, glob, json, os, subprocess, sys, tempfile
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import construction_score as C  # noqa: E402
from propagate_keyframe import decode  # noqa: E402


def encode(frames, fps, audio_src, out):
    tmp = tempfile.mkdtemp(prefix="avt_hem_")
    for i, f in enumerate(frames): cv2.imwrite(os.path.join(tmp, f"f_{i:05d}.png"), f)
    has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "csv=p=0", audio_src], capture_output=True, text=True).stdout.strip() != ""
    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(tmp, "f_%05d.png")] + (["-i", audio_src, "-map", "0:v", "-map", "1:a", "-c:a", "copy"] if has_audio else []) + ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", out]
    subprocess.run(cmd, check=True)
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)


def region_rows(mask, lm, lo, hi):
    """Row span and column span of the garment-relative hem region."""
    H, W = mask.shape; r, h = lm["row"], lm["height"]
    y0, y1 = max(0, r + int(lo * h)), min(H, r + int(hi * h))  # h = clip-median stripe height
    band = np.where(mask[max(0, r - h):r + 3 * h].any(axis=0))[0]
    if len(band) < 10: return None
    x0, x1 = int(band.min()), int(band.max()); w = x1 - x0
    return y0, y1, max(0, x0 - int(0.15 * w)), min(W, x1 + int(0.15 * w))


def intruder_map(im, a):
    """Pixels that read as the intruding garment. Default = a light, colour-neutral, finely
    textured fabric (a white pinstriped shirt): L > l_min, b below the warm garment's b, not skin
    (a small), and horizontal-gradient energy above a floor — a smooth mastic jacket has ~2, the
    shirt 30–120 at 720p. All thresholds are CLI data so another Look can describe its own intruder."""
    lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.blur(np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)), (9, 9))
    lit = (lab[..., 0] > a.intruder_l_min) & (lab[..., 2] < a.intruder_b_max) & (lab[..., 1] < a.intruder_a_max) & (gx > a.intruder_texture_min)
    # in SHADOW the same shirt is darker and warmer (S08 f69 under the crossing hand: L 105–114,
    # b 138–141 — both outside the lit thresholds) but its stripes are still there: texture far
    # above the smooth garment's (gx 25–110 vs 5–10) with a plausible lightness is the shirt too
    shaded = (gx > a.intruder_texture_hi) & (lab[..., 0] > a.intruder_l_min - 20) & (lab[..., 2] < a.intruder_b_max + 6) & (lab[..., 1] < a.intruder_a_max)
    # ...but only as a CONTINUATION of lit shirt: a ribbed hem band or a seam is textured too, so a
    # shaded pixel counts only within --intruder-grow px of pixels the lit rule accepted
    near_lit = cv2.dilate(lit.astype(np.uint8), np.ones((2 * a.intruder_grow + 1,) * 2, np.uint8)) > 0
    # a BRIGHT, colour-neutral pixel is the intruder whatever its texture: a white rib knit's flat
    # parts have no horizontal gradient, and no shade of the warm garment reaches this lightness
    # with this little chroma (S09's white waistband: L 190+, b 132 vs the mastic highlight's 142)
    bright = (lab[..., 0] > a.intruder_l_bright) & (lab[..., 2] < a.intruder_b_max) & (lab[..., 1] < a.intruder_a_max)
    return lit | (shaded & near_lit) | bright


def analyse_columns(im, cls, mask, region, jacket_ids, r, h, dark_l=70, smooth_max=10.0, extend=110, climb_max=24, win=8, win_ok=5, max_run=150):
    """Per column: the jacket's hem row (top), the row where the trousers start (bot) and the run
    kind (1 tail → trousers, 2 split → jacket). From the lowest intruder run in the column the
    hem is found by climbing UP through the blurred edge until an 8-row window is jacket-like
    (jacket colour class, not intruder, not dark, smooth: ≥ 5 of 8 rows — a seam line or a fold is
    tolerated, a pinstriped shirt is not); the trousers by walking DOWN to a dark row on a
    horizontally averaged L (pinstripes never pass for trousers); a jacket window met on the way
    down instead makes the run a split front."""
    H, W = mask.shape
    L = cv2.blur(cv2.cvtColor(im, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32), (9, 1))
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.blur(np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)), (9, 9))
    jl = np.isin(cls, list(jacket_ids)) & (mask == 0) & (L >= dark_l) & (gx < smooth_max)
    cum = np.cumsum(np.vstack([np.zeros((1, W), np.int32), jl.astype(np.int32)]), axis=0)
    def window_ok(x, y0_, y1_):  # rows y0_..y1_-1 inclusive-exclusive
        if y0_ < 0 or y1_ > H: return False
        return cum[y1_, x] - cum[y0_, x] >= win_ok
    top = np.full(W, -1); bot = np.full(W, -1); kind = np.zeros(W, dtype=np.uint8)
    if region is None: return top, bot, kind
    y0, y1, x0, x1 = region
    for x in range(x0, x1):
        ys = np.where(mask[:, x] > 0)[0]
        if len(ys) == 0: continue
        splits = np.where(np.diff(ys) > 1)[0] + 1; run = np.split(ys, splits)[-1]
        a, b = int(run[0]), int(run[-1])
        y = a - 1; found = False
        while y >= 0 and a - y <= climb_max:
            if window_ok(x, y - win + 1, y + 1): found = True; break
            y -= 1
        t = y + 1 if found else a          # no jacket within reach (zip line, hand): keep the run's own top
        y = b + 1; k = 0
        while y < H and y - b <= extend:
            if L[y, x] < dark_l: k = 1; break
            if y > b + 2 and window_ok(x, y, y + win): k = 2; break
            y += 1
        if k == 0 or (y - 1 - t) > max_run: continue
        top[x], bot[x], kind[x] = t, y - 1, k
    return top, bot, kind


def smooth_columns(arr, kind, ker=31):
    """Smooth a per-column boundary within each contiguous same-kind group: a median (removes
    outliers) followed by a Gaussian (removes the stair-steps a pure median leaves), so the
    repaired hem is a continuous fabric edge rather than a mask edge."""
    out = arr.astype(np.float32).copy(); W = len(arr); x = 0
    while x < W:
        if kind[x] == 0: x += 1; continue
        x1 = x
        while x1 + 1 < W and kind[x1 + 1] == kind[x]: x1 += 1
        seg = arr[x:x1 + 1].astype(np.float32); n = len(seg); k = min(ker, 2 * (n // 2) + 1)
        if k >= 3:
            padded = np.pad(seg, k // 2, mode="edge"); med = np.array([np.median(padded[i:i + k]) for i in range(n)], np.float32)
            sig = max(1.0, k / 4.0); r = int(3 * sig); pad2 = np.pad(med, r, mode="edge"); g = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); g /= g.sum()
            out[x:x1 + 1] = np.convolve(pad2, g, mode="valid")
        x = x1 + 1
    return np.round(out).astype(int)


def fill_columns(im, top, bot, kind, feather, overlap=2, overlap_below=3, min_cols=4, cls_map=None, jacket_ids=(), split_max_w=40, remnant_fn=None, remnant_reach=9):
    out = im.copy().astype(np.float32); H, W = im.shape[:2]; filled = np.zeros((H, W), np.uint8); rng_ = np.random.default_rng(0)
    x = 0
    while x < W:   # drop slivers narrower than min_cols
        if kind[x] == 0: x += 1; continue
        x1 = x
        while x1 + 1 < W and kind[x1 + 1] == kind[x]: x1 += 1
        if x1 - x + 1 < min_cols: kind[x:x1 + 1] = 0
        x = x1 + 1
    # a narrow tail group flanked on both sides by jacket at its own rows is the gap between the
    # two jacket fronts (a split), not a tail: fill it with jacket, not trousers
    cls_j = None
    x = 0
    while x < W:
        if kind[x] != 1: x += 1; continue
        x1 = x
        while x1 + 1 < W and kind[x1 + 1] == 1: x1 += 1
        if x1 - x + 1 <= split_max_w and cls_map is not None:
            ym = int((top[x] + bot[x]) / 2); lx, rx = max(0, x - 6), min(W - 1, x1 + 6)
            if int(cls_map[ym, lx]) in jacket_ids and int(cls_map[ym, rx]) in jacket_ids: kind[x:x1 + 1] = 2
        x = x1 + 1
    for x in range(W):
        if kind[x] == 0 or top[x] < 0 or bot[x] < top[x]: continue
        a = max(0, int(top[x]) - overlap); b = int(bot[x])
        if kind[x] == 1:
            src = out[b + 1:min(H, b + 17), x]
            if len(src) < 4: continue
            b = min(H - 1, b + overlap_below); n = b - a + 1
            fill = np.repeat(np.median(src, axis=0)[None, :], n, axis=0) + rng_.normal(0, 1.5, (n, 3))
        else:
            n = b - a + 1; src = out[max(0, a - n):a, x][::-1]
            if len(src) == 0: continue
            if len(src) < n: src = np.concatenate([src, np.repeat(src[-1][None, :], n - len(src), axis=0)], axis=0)
            fill = src[:n]
        out[a:b + 1, x] = fill; filled[a:b + 1, x] = 255
    if filled.any():
        soft = cv2.GaussianBlur(filled.astype(np.float32) / 255.0, (0, 0), feather)
        smooth = cv2.GaussianBlur(out, (0, 0), 1.0)
        out = np.where(filled[..., None] > 0, smooth, out)
        out = soft[..., None] * out + (1 - soft[..., None]) * im.astype(np.float32)
        out8 = np.clip(out, 0, 255).astype(np.uint8)
        if remnant_fn is not None:
            # pale remnants the column fill missed, within reach of the repaint: inpaint from the surroundings
            near = cv2.dilate(filled, np.ones((remnant_reach, remnant_reach), np.uint8)); rem = (remnant_fn(out8) & (near > 0) & (filled == 0)).astype(np.uint8) * 255
            rem = cv2.dilate(rem, np.ones((3, 3), np.uint8))
            if rem.any(): out8 = cv2.inpaint(out8, rem, 3, cv2.INPAINT_TELEA); filled = filled | rem
        return out8, filled
    return np.clip(out, 0, 255).astype(np.uint8), filled


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edit", required=True); ap.add_argument("--master", required=True, help="path or glob of the master cut the edit was made from")
    ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--classes", type=int, default=6); ap.add_argument("--class-radius", type=float, default=28.0)
    ap.add_argument("--zone", default="2.5,11", help="hem region rows as multiples of the stripe height below the stripe row (lo,hi)")
    ap.add_argument("--intruder-l-min", type=float, default=110.0); ap.add_argument("--intruder-b-max", type=float, default=137.0)
    ap.add_argument("--intruder-a-max", type=float, default=134.0); ap.add_argument("--intruder-texture-min", type=float, default=12.0)
    ap.add_argument("--intruder-l-bright", type=float, default=170.0, help="L above which a colour-neutral pixel is the intruder without the texture test")
    ap.add_argument("--intruder-grow", type=int, default=25, help="px: shaded-shirt pixels count only this close to lit-shirt pixels")
    ap.add_argument("--intruder-texture-hi", type=float, default=40.0, help="horizontal-gradient energy above which a pixel is the intruder even in shadow (colour thresholds relaxed)")
    ap.add_argument("--remnant-reach", type=int, default=9, help="px: intruder remnants the column fill missed are inpainted when within this distance of a repainted column (a rib edge running UP the front, beside the fill)")
    ap.add_argument("--split-max-w", type=int, default=40, help="a tail group up to this many columns wide, flanked by jacket on both sides at its own rows, is the gap between the jacket fronts and is filled with jacket")
    ap.add_argument("--hole-max", type=float, default=0.03, help="an unchanged hole enclosed by the changed region up to this fraction of the frame counts as garment region (the source's own shirt tail)")
    ap.add_argument("--row-bridge", type=int, default=60, help="row-wise closing radius (px) on the changed-region mask so an unchanged shirt tail flanked by repainted trousers counts as garment region")
    ap.add_argument("--min-blob", type=int, default=40, help="ignore intruding blobs smaller than this many pixels")
    ap.add_argument("--temporal", type=int, default=3, help="temporal median window on the repair mask (odd; 1 = off)")
    ap.add_argument("--feather", type=float, default=2.0)
    ap.add_argument("--hem-smooth", type=int, default=41, help="column window (odd) for smoothing the repaired hem line")
    a = ap.parse_args()
    W, H = (int(v) for v in a.size.split("x")); lo, hi = (float(v) for v in a.zone.split(","))
    masters = glob.glob(a.master); assert masters, f"no master matches {a.master}"
    master = decode(masters[0], W, H, a.fps); edit = decode(a.edit, W, H, a.fps)
    n = min(len(master), len(edit)); master, edit = master[:n], edit[:n]
    anchor = cv2.resize(cv2.imread(a.anchor), (W, H)); amaster = cv2.resize(cv2.imread(a.anchor_master), (W, H))
    amask = C.garment_mask(amaster, anchor); centres, shares = C.learn_classes(anchor, amask, a.classes)
    acls = C.classify(anchor, centres, a.class_radius)
    alm = C.landmark(acls, amask, list(range(len(centres))), 0.12, 0.25, (0.12, 0.7))
    if alm is None: raise SystemExit("anchor: no stripe landmark")
    stripe = alm["class"]
    # body = dominant class around the stripe; trousers = darkest non-stripe class; shirt = lightest class
    r, h = alm["row"], alm["height"]; win = np.zeros_like(amask); win[max(0, r - 3 * h):r + 5 * h] = 255; win &= amask
    counts = np.bincount(acls[win > 0], minlength=len(centres) + 1)[: len(centres)]; counts[stripe] = 0; body = int(counts.argmax())
    L = centres[:, 0]
    # dark classes (navy stripe, black trousers: L below the body's midpoint) bound a tail from below;
    # every other anchor class is a shade of the jacket and bounds a split from above
    dark_ids = {int(i) for i in range(len(centres)) if L[i] < 0.5 * L[body]} | {stripe}
    jacket_ids = {int(i) for i in range(len(centres)) if int(i) not in dark_ids}
    print(json.dumps({"classes": [[round(float(x), 1) for x in c] for c in centres], "stripe": stripe, "body": body, "dark_ids": sorted(dark_ids), "jacket_ids": sorted(jacket_ids)}))

    masks = []; regions = []; clss = []; before = []; gmasks = []; lms = []
    for k in range(n):
        m = C.garment_mask(master[k], edit[k]); cls = C.classify(edit[k], centres, a.class_radius); clss.append(cls)
        # the changed-region mask has HOLES where the edit kept the source's pixels — the source's
        # own untucked shirt tail is exactly such a hole (unchanged white shirt between a repainted
        # jacket and repainted trousers); an enclosed hole of at most --hole-max of the frame is
        # part of the garment region, otherwise the tail is never seen as an intruder (S08 f69)
        nh, hl, hs_, _ = cv2.connectedComponentsWithStats((m == 0).astype(np.uint8), connectivity=4)
        for hj in range(1, nh):
            x, y, w_, h_, ar = hs_[hj]
            if ar <= a.hole_max * H * W and x > 0 and y > 0 and x + w_ < W and y + h_ < H: m[hl == hj] = 255
        # ...and a hole that reaches the border through a hand in front of it (the hand is unchanged
        # too) is still garment where it lies BETWEEN changed pixels on its row: close each row over
        # gaps of at most --row-bridge px
        if a.row_bridge > 0:
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((1, 2 * a.row_bridge + 1), np.uint8))
        gmasks.append(m)
        lms.append(C.landmark(cls, m, [stripe], 0.12, 0.25, (0.12, 0.7)))
    # the stripe's measured height jitters frame to frame (24–40 px on S08); the hem region is laid
    # out with the clip's MEDIAN stripe height so the zone does not breathe with the landmark
    hs = [lm["height"] for lm in lms if lm]; h_ref = int(round(float(np.median(hs)))) if hs else None
    # a frame whose stripe landmark is lost (arm across the band) takes the nearest found frame's
    # row, so the repair never switches off for a few frames and flickers the tail back in
    valid = [k for k in range(n) if lms[k]]
    for k in range(n):
        if not lms[k] and valid:
            j = min(valid, key=lambda v: abs(v - k)); lms[k] = dict(lms[j], borrowed_from=j)
    for k in range(n):
        m = gmasks[k]; cls = clss[k]; lm = lms[k]
        lm = dict(lm, height=h_ref) if (lm and h_ref) else lm
        reg = region_rows(m, lm, lo, hi) if lm else None; regions.append(reg)
        rm = np.zeros((H, W), np.uint8)
        if reg:
            y0, y1, x0, x1 = reg
            sub = (intruder_map(edit[k], a)[y0:y1, x0:x1] & (m[y0:y1, x0:x1] > 0)).astype(np.uint8) * 255
            sub = cv2.morphologyEx(sub, cv2.MORPH_OPEN, np.ones((3, 1), np.uint8)); sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))   # open vertically only: a 3 px shirt sliver between the fronts must survive
            nn, lab, st, _ = cv2.connectedComponentsWithStats(sub); keep = np.zeros_like(sub)
            for i in range(1, nn):
                if st[i, cv2.CC_STAT_AREA] >= a.min_blob: keep[lab == i] = 255
            rm[y0:y1, x0:x1] = keep
            before.append(float((keep > 0).sum()) / max(1, (y1 - y0) * (x1 - x0)))
        else: before.append(None)
        masks.append(rm)
    if a.temporal > 1:
        t = a.temporal // 2; sm = []
        for k in range(n):
            stack = np.stack(masks[max(0, k - t):min(n, k + t + 1)], axis=0); sm.append((np.median(stack, axis=0) > 127).astype(np.uint8) * 255)
        masks = sm
    # per-frame column analysis, then the hem row is smoothed across columns and over time
    cols = []
    for k in range(n):
        lm = lms[k]; lm = dict(lm, height=h_ref) if (lm and h_ref) else lm
        if lm and masks[k].any(): cols.append(analyse_columns(edit[k], clss[k], masks[k], regions[k], jacket_ids, lm["row"], h_ref or lm["height"]))
        else: cols.append((np.full(W, -1), np.full(W, -1), np.zeros(W, dtype=np.uint8)))
    tops = np.stack([c[0] for c in cols]); bots = np.stack([c[1] for c in cols]); kinds = np.stack([c[2] for c in cols])
    for k in range(n):
        anyk = (kinds[k] > 0).astype(np.uint8)          # the hem is ONE fabric edge: smooth it across every repaired column, whatever the fill kind
        tops[k] = smooth_columns(tops[k], anyk, ker=a.hem_smooth); bots[k] = smooth_columns(bots[k], kinds[k], ker=15)
    if a.temporal > 1:
        t = a.temporal // 2; tops2 = tops.copy()
        for k in range(n):
            lo_, hi_ = max(0, k - t), min(n, k + t + 1); st = tops[lo_:hi_]; vmask = st >= 0
            med = np.where(vmask.sum(axis=0) > 0, np.nanmedian(np.where(vmask, st, np.nan), axis=0), -1)
            tops2[k] = np.where(kinds[k] > 0, np.nan_to_num(med, nan=-1).astype(int), tops[k])
        tops = tops2
    out_frames = []; after = []; repaired = 0; fill_px = []
    for k in range(n):
        if kinds[k].any():
            im2, filled = fill_columns(edit[k], tops[k], bots[k], kinds[k], a.feather, cls_map=clss[k], jacket_ids=jacket_ids, split_max_w=a.split_max_w, remnant_reach=a.remnant_reach, remnant_fn=lambda im_: intruder_map(im_, a)); out_frames.append(im2); fill_px.append(int((filled > 0).sum()))
            if filled.any(): repaired += 1
            reg = regions[k]
            if reg:
                y0, y1, x0, x1 = reg
                after.append(float((intruder_map(im2, a)[y0:y1, x0:x1] & (masks[k][y0:y1, x0:x1] > 0)).sum()) / max(1, (y1 - y0) * (x1 - x0)))
            else: after.append(None)
        else: out_frames.append(edit[k]); after.append(before[k]); fill_px.append(0)
    encode(out_frames, a.fps, a.edit, a.out)
    # QA sheet
    idx = [int(n * f) for f in (0.12, 0.4, 0.65, 0.9)]; rows = []
    for k in idx:
        mvis = cv2.cvtColor(masks[k], cv2.COLOR_GRAY2BGR); rows.append(np.hstack([edit[k], mvis, out_frames[k]]))
    sheet = np.vstack(rows); sheet = cv2.resize(sheet, (sheet.shape[1] // 2, sheet.shape[0] // 2))
    base = os.path.splitext(a.out)[0]; cv2.imwrite(base + "_hem_qa_sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b_valid = [x for x in before if x is not None]; a_valid = [x for x in after if x is not None]
    qa = {"edit": a.edit, "out": a.out, "frames": n, "frames_with_landmark": len(valid), "frames_landmark_borrowed": n - len(valid), "frames_repaired": repaired, "fill_px_series": fill_px,
          "intruder_frac_before_median": float(np.median(b_valid)) if b_valid else None, "intruder_frac_before_p90": float(np.percentile(b_valid, 90)) if b_valid else None,
          "intruder_frac_after_median": float(np.median(a_valid)) if a_valid else None, "intruder_frac_after_p90": float(np.percentile(a_valid, 90)) if a_valid else None,
          "fill_px_median": float(np.median(fill_px)), "fill_px_max": int(max(fill_px)) if fill_px else 0,
          "params": {"zone": a.zone, "intruder": {"l_min": a.intruder_l_min, "b_max": a.intruder_b_max, "a_max": a.intruder_a_max, "texture_min": a.intruder_texture_min}, "dark_ids": sorted(dark_ids), "jacket_ids": sorted(jacket_ids), "temporal": a.temporal, "feather": a.feather}}
    json.dump(qa, open(base + "_hem_qa.json", "w"), indent=1); print(json.dumps(qa))


if __name__ == "__main__":
    main()
