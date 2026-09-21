#!/usr/bin/env python3
"""
Environment transformation WITHOUT a second generative pass over the performer
(master-aware reconstruction, deterministic, $0 after the plate exists).

  python3 scripts/edit/composite_environment.py --in wardrobe_edit.mp4 --plate plate.jpg --out env.mp4 \
      [--fps 24] [--size 720x1280] [--zoom 0.015] [--cool 0.06] [--feather 3] [--model u2net_human_seg]

Why: a v2v "change the background" pass over the wardrobe output relit the face into
darkness and lost identity (YSL Real Video #1, S06 env test, rejected). Here the
performer's pixels come untouched from the accepted wardrobe pass; only a person
matte (rembg / U²-Net human segmentation) decides where the generated plate shows.

Matte (v3, after Astra review #1 found body dropouts + closet leaks in v1 and the v2
rembg-union rewrite still passed the performer's shadow on the door as body):
  * default matter is RobustVideoMatting (MobileNetV3, ONNX, CPU ~7 fps at 720x1280) — a
    VIDEO human matter with recurrent state, so the alpha is temporally coherent and has
    real soft edges; it is auto-downloaded to ~/.cache/avt/ on first use.
  * cleanup: components below 3 % of the largest are dropped (ghost blobs), holes filled, an
    optional static-background peel (`--rvm-peel`; off by default — it bit into the sand-beige
    jacket where jacket ≈ door colour), alpha remapped 0.4→0.85 (smoothstep) to cut the half-transparent shadow/door fringe, RVM's own
    decontaminated foreground colour across the edge (no closet bleed), optional temporal
    median, 1-px erode + Gaussian feather. (Astra review #2: fringes/halo + attached fragments.)
  * `--matte rembg` keeps the v2 path (u2net_human_seg ∪ isnet-general-use, vertical
    closing, masked static-background prior in a boundary band) for comparison.
The plate gets a slow push (default 1.5 % over the clip) so it is not a dead still,
and the foreground gets a light cool grade so it sits in the cold room.
"""
import argparse, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:]); raise SystemExit("ffmpeg failed")

def largest_component(mask):
    from scipy import ndimage
    lab, n = ndimage.label(mask)
    if n <= 1: return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    return lab == keep

RVM_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"

def rvm_alphas(model_path, frame_paths, downsample_ratio):
    """RobustVideoMatting (ONNX, CPU): recurrent video human matting -> list of float32 alphas."""
    import onnxruntime as ort
    if not os.path.exists(model_path):
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        run(["curl", "-sSL", "-o", model_path, RVM_URL])
    sess = ort.InferenceSession(model_path)
    rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
    dsr = np.array([downsample_ratio], np.float32)
    out, fgrs = [], []
    for i, fp in enumerate(frame_paths):
        src = (np.asarray(Image.open(fp).convert("RGB")).astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        fgr, pha, *rec = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": dsr})
        out.append(pha[0, 0].astype(np.float32))
        # decontaminated foreground colour (RVM predicts it): used at the edge so the closet
        # never bleeds into the fringe
        fgrs.append((np.clip(fgr[0].transpose(1, 2, 0), 0, 1) * 255).astype(np.uint8))
        if i % 48 == 0: print(f"rvm {i+1}/{len(frame_paths)}", file=sys.stderr)
    return out, fgrs

def fill_holes(mask):
    from scipy import ndimage
    return ndimage.binary_fill_holes(mask)

def local_ncc(a, b, win=9):
    """Normalised cross-correlation of two single-channel images in a win×win window:
    ~1 where the two share the same STRUCTURE (a shadowed door still shows the door's
    panel lines), ~0 where a different surface sits in front of the background."""
    import cv2
    a = a.astype(np.float32); b = b.astype(np.float32)
    ma = cv2.blur(a, (win, win)); mb = cv2.blur(b, (win, win))
    va = cv2.blur(a * a, (win, win)) - ma * ma; vb = cv2.blur(b * b, (win, win)) - mb * mb
    cov = cv2.blur(a * b, (win, win)) - ma * mb
    return cov / np.sqrt(np.maximum(va, 1e-3) * np.maximum(vb, 1e-3))

def shadow_aware_alpha(img, fgr, alpha, bg, core_hi=0.98, band_px=14, ncc_win=9, ncc_thr=0.55, min_sep=45.0):
    """Shadow-aware matte refinement (ChatGPT ruling 2026-09-21 §5): keep the RVM foreground,
    reason explicitly about the background/shadow interaction in the UNCERTAIN BAND only.

      img   this frame (RGB float)      fgr   RVM's decontaminated foreground colour (or img)
      alpha RVM alpha after the hard-mask cleanup   bg   temporal-median background prior

    1. Local shadow model: the performer's shadow is the background scaled by a smooth,
       nearly neutral attenuation k(x,y). k is estimated from confident-background pixels
       (alpha < 0.05) as the local median of img/bg, smoothed, clipped to [0.35, 1.05], so
       B(x,y) = k·bg is what the background looks like HERE, shadow included.
    2. Structure test: local NCC between the frame's luminance and the background's. Shadowed
       background keeps the door's structure (NCC high); a garment or skin in front of the
       door does not. Pixels in the band with NCC > ncc_thr and a colour close to B are
       background — even when they are cream on a cream door.
    3. Known-background unmixing on the rest of the band: img = a·F + (1−a)·B with F = fgr,
       a = <img−B, F−B> / |F−B|²  (the classic difference-matting solution). Where F and B are
       too similar (|F−B| < min_sep) the equation is ill-posed and RVM's alpha is kept.
    The confident core (alpha ≥ core_hi, eroded) is never touched: no foreground erosion.
    Returns (alpha, band_mask, shadow_mask)."""
    import cv2
    from scipy import ndimage
    core = ndimage.binary_erosion(alpha >= core_hi, iterations=3)
    outer = ndimage.binary_dilation(alpha > 0.02, iterations=band_px)
    band = outer & ~core
    # 1. local attenuation from confident background
    eps = 4.0
    ratio = ((img + eps) / (bg + eps)).mean(axis=2)
    conf_bg = (alpha < 0.05)
    k = np.where(conf_bg, ratio, np.nan)
    k_med = ndimage.generic_filter(np.nan_to_num(k, nan=1.0), np.median, size=15) if False else None  # (slow) — use blur of masked values instead
    num = cv2.blur(np.where(conf_bg, ratio, 0).astype(np.float32), (31, 31)); den = cv2.blur(conf_bg.astype(np.float32), (31, 31))
    k_s = np.where(den > 0.05, num / np.maximum(den, 1e-6), 1.0)
    k_s = cv2.GaussianBlur(np.clip(k_s, 0.35, 1.05).astype(np.float32), (0, 0), 8)
    B = bg * k_s[..., None]
    # 2. structure test
    gi = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2GRAY); gb = cv2.cvtColor(np.clip(B, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    ncc = local_ncc(gi, gb, ncc_win)
    close_to_B = np.abs(img - B).sum(axis=2) < 60
    grad = cv2.Sobel(gb.astype(np.float32), cv2.CV_32F, 1, 0) ** 2 + cv2.Sobel(gb.astype(np.float32), cv2.CV_32F, 0, 1) ** 2
    has_structure = cv2.blur(grad, (ncc_win, ncc_win)) > 25.0   # NCC is meaningless on a flat wall
    shadow_bg = band & close_to_B & ((ncc > ncc_thr) | ~has_structure) & (alpha < 0.9)
    # 3. known-background unmixing
    F = fgr if fgr is not None else img
    d = F - B; sep = np.sqrt((d * d).sum(axis=2))
    a_unmix = np.clip(((img - B) * d).sum(axis=2) / np.maximum(sep * sep, 1e-6), 0, 1)
    posed = band & (sep >= min_sep)
    out = alpha.copy()
    out[posed] = 0.5 * alpha[posed] + 0.5 * a_unmix[posed]   # blend: RVM's temporal prior + the physics
    out[shadow_bg] = 0.0
    # tiny detached specks the refinement leaves behind
    return out.astype(np.float32), band, shadow_bg

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True); ap.add_argument("--plate", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--zoom", type=float, default=0.015)
    ap.add_argument("--cool", type=float, default=0.06); ap.add_argument("--feather", type=float, default=3.0)
    ap.add_argument("--models", default="u2net_human_seg,isnet-general-use", help="comma-separated rembg models; masks are unioned"); ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--plate-gain", type=float, default=1.0)
    ap.add_argument("--bg-tol", type=float, default=30.0, help="sum-RGB distance below which a pixel matches the static background")
    ap.add_argument("--band-px", type=int, default=20, help="the background prior may only remove pixels within this many px of the matte edge")
    ap.add_argument("--close-v", type=int, default=61, help="vertical closing kernel height (bridges hip/waist gaps)")
    ap.add_argument("--temporal", type=int, default=5, help="temporal median window (odd)")
    ap.add_argument("--matte", default="rvm", choices=["rvm", "rembg"])
    ap.add_argument("--rvm-model", default=os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx"))
    ap.add_argument("--rvm-downsample", type=float, default=0.4)
    ap.add_argument("--static-peel", type=float, default=0.9, help="peel matte-band pixels that are static (within 20 of the temporal median) in at least this fraction of sampled frames; 0 = off")
    ap.add_argument("--rvm-peel", action="store_true", help="apply the static-background peel to the RVM matte too (off: on the sand-beige Look 1 it bit into the shoulder where jacket ≈ door colour, YSL v3 test)")
    ap.add_argument("--shadow-spread", type=float, default=0.0, help="max per-channel ratio spread for the shadowed-background test; 0 = off (tested 0.04 on S08: it bites into the cream shoulder and cap, so it stays off)")
    ap.add_argument("--alpha-lo", type=float, default=0.4, help="RVM alpha at/below this is background")
    ap.add_argument("--alpha-hi", type=float, default=0.85, help="RVM alpha at/above this is body")
    ap.add_argument("--refine", default="shadow", choices=["shadow", "none"], help="shadow-aware refinement of the RVM matte in the uncertain band (known-background unmixing + structure test; never touches the confident core)")
    ap.add_argument("--refine-ncc", type=float, default=0.55); ap.add_argument("--refine-band", type=int, default=14)
    ap.add_argument("--refine-debug", default=None, help="write band/shadow masks for frame indices (comma list) as PNGs next to --out")
    ap.add_argument("--mask-cache", default=None, help="npz path; segmenter masks are saved here and reused if present (matte logic can then be iterated without re-running rembg)")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    sessions = []
    if a.matte == "rembg" and not (a.mask_cache and os.path.exists(a.mask_cache)):
        from rembg import new_session
        sessions = [new_session(m.strip()) for m in a.models.split(",") if m.strip()]

    tmp = tempfile.mkdtemp(prefix="avt_env_")
    run(["ffmpeg", "-v", "error", "-y", "-i", a.inp, "-vf", f"scale={W}:{H}:flags=lanczos,fps={a.fps}", os.path.join(tmp, "f_%05d.png")])
    frames = sorted(f for f in os.listdir(tmp) if f.startswith("f_"))
    n = len(frames)

    plate = Image.open(a.plate).convert("RGB")
    # cover-fit plate to the raster
    pr = plate.width / plate.height; tr = W / H
    if pr > tr: plate = plate.resize((int(H * pr), H), Image.LANCZOS)
    else: plate = plate.resize((W, int(W / pr)), Image.LANCZOS)
    pl = np.asarray(plate).astype(np.float32) * a.plate_gain

    from scipy import ndimage
    # pass 1: soft union masks
    soft = []
    if a.mask_cache and os.path.exists(a.mask_cache):
        cached = np.load(a.mask_cache)["soft"]
        if cached.shape[0] == n: soft = [cached[i] for i in range(n)]; print("masks from cache", file=sys.stderr)
    fgrs = None
    if not soft and a.matte == "rvm":
        soft, fgrs = rvm_alphas(a.rvm_model, [os.path.join(tmp, f) for f in frames], a.rvm_downsample)
        for i, fg8 in enumerate(fgrs): Image.fromarray(fg8).save(os.path.join(tmp, f"fgr_{i:05d}.png"))
        if a.mask_cache: np.savez_compressed(a.mask_cache, soft=np.stack(soft).astype(np.float16))
    elif soft and a.matte == "rvm":
        fgrs = None  # cached masks: no fgr; the raw frame is used at the edge
    if not soft:
        from rembg import remove
        for i, f in enumerate(frames):
            im = Image.open(os.path.join(tmp, f)).convert("RGB")
            u = None
            for sess in sessions:
                m = np.asarray(remove(im, session=sess, only_mask=True)).astype(np.float32) / 255.0
                u = m if u is None else np.maximum(u, m)
            soft.append(u)
            if i % 24 == 0: print(f"matte {i+1}/{n}", file=sys.stderr)
        if a.mask_cache: np.savez_compressed(a.mask_cache, soft=np.stack(soft).astype(np.float16))
    # masked static-background prior: median over frames of pixels the segmenters call background
    step = max(1, n // 24)
    stack = np.stack([np.asarray(Image.open(os.path.join(tmp, frames[i])).convert("RGB")).astype(np.float32) for i in range(0, n, step)])
    bgmask = np.stack([soft[i] < 0.2 for i in range(0, n, step)])
    masked = np.where(bgmask[..., None], stack, np.nan)
    with np.errstate(all="ignore"):
        bg_med = np.nanmedian(masked, axis=0)
    have_bg = ~np.isnan(bg_med[..., 0])
    # pixels the performer covers in every sampled frame get the nearest observed background
    # value (the closet door / wall is near-uniform, so nearest-neighbour is a fair prior)
    if have_bg.any() and not have_bg.all():
        _, idx = ndimage.distance_transform_edt(~have_bg, return_distances=True, return_indices=True)
        bg_med = bg_med[idx[0], idx[1]]
        have_bg = np.ones_like(have_bg)
    bg_med = np.nan_to_num(bg_med)
    vstruct = np.ones((a.close_v, 3), bool)
    # static score: fraction of sampled frames whose pixel stays within 20 (sum-RGB) of the plain
    # temporal median — closet objects beside the performer are static for the whole clip,
    # Fendi is not (even a locked-off performer sways/gestures)
    static_score = None
    if a.static_peel > 0:
        med_all = np.median(stack, axis=0)
        static_score = (np.abs(stack - med_all).sum(axis=3) < 20).mean(axis=0)
    alphas = []
    for i, f in enumerate(frames):
        if a.matte == "rvm":
            hard = soft[i] > 0.5
            lab, k = ndimage.label(hard)
            if k > 1:
                sizes = ndimage.sum(hard, lab, range(1, k + 1)); big = 1 + int(np.argmax(sizes))
                hard = np.isin(lab, [c for c in range(1, k + 1) if sizes[c - 1] >= 0.03 * sizes[big - 1]])
            hard = fill_holes(hard)
            # static-background peel: pixels near the matte edge whose colour matches the
            # temporal-median background (nearest-filled) are closet/door, not Fendi
            if a.rvm_peel and a.bg_tol > 0:
                img = np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")).astype(np.float32)
                diff = np.abs(img - bg_med).sum(axis=2)
                # shadow-tolerant match: the performer's shadow on the door is the door scaled
                # down uniformly (per-channel ratio ~equal, 0.6–0.97); the cream jacket is brighter
                ratio = (img + 4) / (bg_med + 4)
                shadow = (a.shadow_spread > 0) & (ratio.max(axis=2) - ratio.min(axis=2) < a.shadow_spread) & (ratio.mean(axis=2) > 0.6) & (ratio.mean(axis=2) < 0.97)
                for _ in range(2):
                    band = hard & ~ndimage.binary_erosion(hard, iterations=a.band_px)
                    remove_px = band & ((diff <= a.bg_tol) | shadow)
                    if not remove_px.any(): break
                    hard = hard & ~remove_px
                    lab, k = ndimage.label(hard)
                    if k > 1:
                        sizes = ndimage.sum(hard, lab, range(1, k + 1)); big = 1 + int(np.argmax(sizes))
                        hard = np.isin(lab, [c for c in range(1, k + 1) if sizes[c - 1] >= 0.03 * sizes[big - 1]])
                hard = fill_holes(hard)
            if static_score is not None:
                # peel fully-static pixels in the outer band of the matte (hanging clothes, door
                # edge fragments that RVM attaches to the silhouette); never inside the body
                band = hard & ~ndimage.binary_erosion(hard, iterations=a.band_px)
                rm = band & (static_score >= a.static_peel)
                if rm.any():
                    hard = hard & ~rm
                    lab, k = ndimage.label(hard)
                    if k > 1:
                        sizes = ndimage.sum(hard, lab, range(1, k + 1)); big = 1 + int(np.argmax(sizes))
                        hard = np.isin(lab, [c for c in range(1, k + 1) if sizes[c - 1] >= 0.03 * sizes[big - 1]])
                    hard = fill_holes(hard)
            keep = ndimage.binary_dilation(hard, iterations=2)
            al = np.where(keep, soft[i], 0.0).astype(np.float32)
            # remap: below alpha-lo is background (shadow/door bleed RVM keeps half-transparent),
            # above alpha-hi is body; smoothstep between, then the Gaussian feather below
            t = np.clip((al - a.alpha_lo) / max(1e-3, a.alpha_hi - a.alpha_lo), 0, 1)
            t = (t * t * (3 - 2 * t)).astype(np.float32)
            if a.refine == "shadow":
                img = np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")).astype(np.float32)
                fgr_p = os.path.join(tmp, f"fgr_{i:05d}.png")
                fgr = np.asarray(Image.open(fgr_p).convert("RGB")).astype(np.float32) if os.path.exists(fgr_p) else None
                t, band, shadow_bg = shadow_aware_alpha(img, fgr, t, bg_med, band_px=a.refine_band, ncc_thr=a.refine_ncc)
                if a.refine_debug and str(i) in a.refine_debug.split(","):
                    dbg = np.zeros((*t.shape, 3), np.uint8); dbg[band] = (60, 60, 60); dbg[shadow_bg] = (255, 0, 0); dbg[t >= 0.98] = (0, 160, 0)
                    Image.fromarray(dbg).save(os.path.splitext(a.out)[0] + f"_refine_{i:05d}.png")
            alphas.append(t)
            continue
        hard = soft[i] > 0.4
        hard = ndimage.binary_closing(hard, structure=vstruct)
        hard = fill_holes(hard)
        # keep the largest component plus any component >= 3 % of it that overlaps it horizontally
        lab, k = ndimage.label(hard)
        if k > 1:
            sizes = ndimage.sum(hard, lab, range(1, k + 1)); big = 1 + int(np.argmax(sizes))
            ys, xs = np.where(lab == big); x0, x1 = xs.min(), xs.max()
            keep = np.zeros_like(hard)
            for c in range(1, k + 1):
                if c == big or sizes[c - 1] < 0.03 * sizes[big - 1]: 
                    if c != big: continue
                cy, cx = np.where(lab == c)
                if c == big or (cx.max() >= x0 and cx.min() <= x1): keep |= lab == c
            hard = keep
        # boundary-band background prior, peeled in two passes so a wide door/wall halo goes too
        img = np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")).astype(np.float32)
        diff = np.abs(img - bg_med).sum(axis=2)
        for _ in range(2):
            band = hard & ~ndimage.binary_erosion(hard, iterations=a.band_px)
            remove_px = band & have_bg & (diff <= a.bg_tol)
            if not remove_px.any(): break
            hard = hard & ~remove_px
            # drop slivers the peel detached from the body
            lab, k = ndimage.label(hard)
            if k > 1:
                sizes = ndimage.sum(hard, lab, range(1, k + 1)); big = 1 + int(np.argmax(sizes))
                hard = (lab == big) | np.isin(lab, [c for c in range(1, k + 1) if sizes[c - 1] >= 0.03 * sizes[big - 1]])
        hard = fill_holes(hard)
        alphas.append(hard.astype(np.float32))
    A = np.stack(alphas)
    Am = A.copy(); h = a.temporal // 2
    for i in range(n):
        lo, hi = max(0, i - h), min(n, i + h + 1)
        Am[i] = np.median(A[lo:hi], axis=0)
    out_frames = []
    for i in range(n):
        al = Image.fromarray((Am[i] * 255).astype(np.uint8))
        al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(a.feather))
        al = np.asarray(al).astype(np.float32)[..., None] / 255.0
        fg = np.asarray(Image.open(os.path.join(tmp, frames[i])).convert("RGB")).astype(np.float32)
        fgr_p = os.path.join(tmp, f"fgr_{i:05d}.png")
        if os.path.exists(fgr_p):
            # inside the body keep the true pixels; across the fringe use RVM's decontaminated colour
            fgr = np.asarray(Image.open(fgr_p).convert("RGB")).astype(np.float32)
            w = np.clip((0.97 - al) / 0.5, 0, 1)  # 0 deep inside, 1 at the edge
            fg = fg * (1 - w) + fgr * w
        # light cool grade on the performer so he sits in the room
        fg = fg * np.array([1 - a.cool, 1 - a.cool * 0.4, 1 + a.cool * 0.6], np.float32)
        fg = np.clip((fg - 128) * 1.06 + 124, 0, 255)
        # slow push on the plate
        z = 1 + a.zoom * (i / max(1, n - 1))
        cw, ch = int(W / z), int(H / z)
        x0 = (pl.shape[1] - cw) // 2; y0 = (pl.shape[0] - ch) // 2
        bgc = Image.fromarray(np.clip(pl[y0:y0 + ch, x0:x0 + cw], 0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
        bg = np.asarray(bgc).astype(np.float32)
        comp = fg * al + bg * (1 - al)
        p = os.path.join(tmp, f"c_{i:05d}.png")
        Image.fromarray(np.clip(comp, 0, 255).astype(np.uint8)).save(p)
    run(["ffmpeg", "-v", "error", "-y", "-framerate", str(a.fps), "-i", os.path.join(tmp, "c_%05d.png"),
         "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out])
    print(f"wrote {a.out} ({n} frames @ {a.fps} fps)")

if __name__ == "__main__":
    main()
