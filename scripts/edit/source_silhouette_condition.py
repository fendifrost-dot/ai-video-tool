#!/usr/bin/env python3
"""
SOURCE SILHOUETTE CONDITIONING — repaint the source performance so its garment silhouette
agrees with the target Look BEFORE the wardrobe generator sees it.

  python3 scripts/edit/source_silhouette_condition.py --master cuts/S08_master.mp4 \\
      --out cond/S08_master_cond.mp4 --qa-dir cond/S08_qa [--hem-offset 0.0 --reach 0.7]

Why (S08, 2026-09-26): the source wears an untucked shirt whose tail hangs well below the hip.
Every video edit of the shot (E1 ×3, best-of-2, Aleph) kept that silhouette — a jacket with
long split fronts and a shirt tail — because a video editor follows the source outline more
faithfully than any sentence in the prompt. Post-hoc hem repair paints over the tail but cannot
change the jacket's length or close its fronts. The lever that the generator DOES obey is the
source itself: if the source's garment ends at the hip, the generated jacket ends at the hip.

Mechanism (nothing here is shot-specific; everything is measured from the clip):
  1. Pose landmarks (MediaPipe) give the hip line, the torso scale, the face and the hands.
  2. Colour classes are learned from the clip's own regions: the source garment (torso box between
     shoulders and hips), the trousers (below the hips), the skin (face box + hand discs) and the
     background (frame margins). Every pixel is assigned to the nearest class in Lab.
  3. The TARGET HEM is a row: hip line + --hem-offset × torso scale (0 = at the hip, which is
     where a cropped/boxy jacket's hem sits). In the rows below it (up to --reach × torso scale)
     across the garment's own column extent, every SOURCE-GARMENT pixel that is not skin and not
     inside a hand disc is the tail to remove.
  4. The tail is filled per column with the trousers' own texture propagated upward (mirrored copy
     of the rows just below the run; the trousers' median colour with footage-like noise when the
     run reaches the frame edge), feathered; the mask is a temporal median so it does not flicker.
  5. Nothing above the hem row changes: face, hands, arms, shirt body, background and camera are
     the source's own, so the generator still receives the real performance.

QA: per-frame tail pixel counts before/after, hem row series, a before | mask | after sheet.
"""
import argparse, json, os, subprocess, sys, tempfile
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "qa"))
from propagate_keyframe import decode  # noqa: E402
from hero_gate import PoseModel, hand_patches, face_box, torso_scale  # noqa: E402


def encode(frames, fps, audio_src, out):
    tmp = tempfile.mkdtemp(prefix="avt_cond_")
    for i, f in enumerate(frames): cv2.imwrite(os.path.join(tmp, f"f_{i:05d}.png"), f)
    has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "csv=p=0", audio_src], capture_output=True, text=True).stdout.strip() != ""
    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(tmp, "f_%05d.png")] + (["-i", audio_src, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-shortest"] if has_audio else []) + ["-c:v", "libx264", "-crf", "15", "-pix_fmt", "yuv420p", out]
    subprocess.run(cmd, check=True)
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)


def kmeans(px, k):
    px = np.asarray(px, np.float32)
    if len(px) < k * 20: return None
    _, _, c = cv2.kmeans(px[:: max(1, len(px) // 4000)], k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True); ap.add_argument("--out", required=True); ap.add_argument("--qa-dir", default=None)
    ap.add_argument("--size", default=None, help="WxH; default: the master's own size"); ap.add_argument("--fps", type=int, default=None)
    ap.add_argument("--hem-offset", type=float, default=-0.05, help="target hem row = hip line + this × torso scale (negative = above the hip); the hip landmarks sit at the trouser top, a cropped jacket's hem just above it")
    ap.add_argument("--reach", type=float, default=0.7, help="rows below the hem considered, in torso scales")
    ap.add_argument("--hand-radius", type=float, default=0.16); ap.add_argument("--face-scale", type=float, default=1.6)
    ap.add_argument("--k-garment", type=int, default=5); ap.add_argument("--k-trousers", type=int, default=2); ap.add_argument("--k-skin", type=int, default=3); ap.add_argument("--k-bg", type=int, default=4)
    ap.add_argument("--skin-lw", type=float, default=0.5, help="weight of L in the skin distance (skin varies in shade more than in chroma)")
    ap.add_argument("--min-blob", type=int, default=150); ap.add_argument("--temporal", type=int, default=5); ap.add_argument("--feather", type=float, default=2.5)
    ap.add_argument("--noise", type=float, default=3.0)
    ap.add_argument("--close-px", type=int, default=15, help="closing kernel on the tail mask (absorbs trousers-dark print inside the tail)")
    ap.add_argument("--tex-win", type=int, default=11); ap.add_argument("--tex-min", type=float, default=4.0, help="local L standard deviation (window --tex-win, box-smoothed) above which a garment-class pixel counts as the textured garment")
    ap.add_argument("--gap-px", type=int, default=8, help="a non-garment gap longer than this ends the hanging run in a column")
    ap.add_argument("--bg-de", type=float, default=22.0, help="Lab distance from the background classes below which a torso-box pixel is not garment when the classes are learned")
    a = ap.parse_args()
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", a.master], capture_output=True, text=True).stdout.strip().split(",")
    W, H = (int(x) for x in a.size.lower().split("x")) if a.size else (int(probe[0]), int(probe[1]))
    num, den = probe[2].split("/"); fps = a.fps or int(round(int(num) / int(den)))
    frames = decode(a.master, W, H, fps); n = len(frames)
    pose = PoseModel(); lms = [pose.detect(f) for f in frames]
    valid = [i for i in range(n) if lms[i] is not None and lms[i][23, 3] >= 0.5 and lms[i][24, 3] >= 0.5]
    if not valid: raise SystemExit("no frame with both hips seen")
    for i in range(n):                                   # a frame without hips borrows the nearest frame's pose
        if i not in valid: lms[i] = lms[min(valid, key=lambda j: abs(j - i))]
    ts = float(np.median([torso_scale(lms[i]) for i in valid]))
    # ---- classes from the clip's own regions
    def lab_of(i): return cv2.cvtColor(frames[i], cv2.COLOR_BGR2LAB).astype(np.float32)   # computed per use: a native-resolution clip does not fit in memory as Lab
    g_px, t_px, s_px, b_px = [], [], [], []
    for i in valid[:: max(1, len(valid) // 12)]:
        lm = lms[i]; L = lab_of(i)
        sh_y = int((lm[11, 1] + lm[12, 1]) / 2); hip_y = int((lm[23, 1] + lm[24, 1]) / 2)
        x0, x1 = int(min(lm[11, 0], lm[12, 0], lm[23, 0], lm[24, 0])), int(max(lm[11, 0], lm[12, 0], lm[23, 0], lm[24, 0]))
        zone = np.zeros((H, W), bool); zone[sh_y + int(0.15 * ts):hip_y - int(0.05 * ts), x0:x1] = True
        skinz = np.zeros((H, W), bool); fx0, fy0, fx1, fy1 = face_box(lm, W, H, a.face_scale); skinz[fy0:fy1, fx0:fx1] = True
        for _, disc in hand_patches(lm, W, H, a.hand_radius): skinz |= disc
        g_px.append(L[zone & ~skinz]); s_px.append(L[skinz])
        # trousers are sampled on the LEGS, below where any tail can hang, between the hips
        lx0, lx1 = int(min(lm[23, 0], lm[24, 0])), int(max(lm[23, 0], lm[24, 0]))
        tz = np.zeros((H, W), bool); tz[hip_y + int(0.6 * ts):hip_y + int(1.2 * ts), lx0:lx1] = True; t_px.append(L[tz])
        bz = np.zeros((H, W), bool); m = int(0.06 * W); bz[:, :m] = True; bz[:, W - m:] = True; bz[:int(0.05 * H), :] = True; b_px.append(L[bz])
    cb = kmeans(np.concatenate(b_px), a.k_bg)
    # the torso box also sees the background beside the body (between an arm and the torso):
    # background-like pixels are dropped before the garment classes are learned
    gp = np.concatenate(g_px)
    if cb is not None:
        db_ = np.min(np.stack([np.sqrt(((gp - c[None, :]) ** 2).sum(axis=1)) for c in cb]), axis=0); gp = gp[db_ > a.bg_de]
    cg = kmeans(gp, a.k_garment); tp = np.concatenate(t_px)
    ct, cs = (kmeans(np.concatenate(p) if isinstance(p, list) else p, k) for p, k in ((tp, a.k_trousers), (s_px, a.k_skin)))
    if cg is None or ct is None: raise SystemExit("could not learn garment/trousers classes")
    centres = np.concatenate([c for c in (cg, ct, cs, cb) if c is not None]); owner = np.concatenate([[k] * len(c) for k, c in enumerate((cg, ct, cs, cb)) if c is not None])
    print("garment classes (L,a,b):", [[round(float(v)) for v in c] for c in cg], "| trousers:", [[round(float(v)) for v in c] for c in ct], flush=True)
    def nearest(L):
        best = np.full(L.shape[:2], np.inf, np.float32); idx = np.zeros(L.shape[:2], np.int32)
        for k, c in enumerate(centres):
            d = ((L - c[None, None, :]) ** 2).sum(axis=2); better = d < best; best[better] = d[better]; idx[better] = k
        return owner[idx]
    # ---- per-frame tail mask
    masks = []; hem_rows = []; before = []
    for i in range(n):
        lm = lms[i]; L = lab_of(i); hip_y = (lm[23, 1] + lm[24, 1]) / 2; y_h = int(hip_y + a.hem_offset * ts); hem_rows.append(y_h)
        y1 = min(H, y_h + int(a.reach * ts)); cls = nearest(L)
        # the garment's own column extent just above the hem
        band = (cls[max(0, y_h - int(0.25 * ts)):y_h] == 0).any(axis=0); cols = np.where(band)[0]
        m = np.zeros((H, W), np.uint8)
        if len(cols) > 10 and y1 > y_h:
            x0, x1 = int(cols.min()), int(cols.max()); w = x1 - x0; x0, x1 = max(0, x0 - int(0.1 * w)), min(W, x1 + int(0.1 * w))
            # a tail HANGS from the hem: per column, the garment run that starts at the hem row and
            # continues downward (gaps up to --gap-px are the print's dark patches) is the tail;
            # whatever lies below the run's end (trousers of the same darkness, the background) is not
            # a printed/woven garment is TEXTURED where plain trousers and a wall are flat: the
            # garment class must also carry local lightness variation (window --tex-win) — this is
            # what separates a camo tail from jeans of the same darkness
            Lc = L[..., 0]; mu = cv2.blur(Lc, (a.tex_win, a.tex_win)); sd = np.sqrt(np.maximum(cv2.blur(Lc * Lc, (a.tex_win, a.tex_win)) - mu * mu, 0)); tex = cv2.blur(sd, (15, 15))
            sub = (cls[y_h:y1, x0:x1] == 0) & (tex[y_h:y1, x0:x1] > a.tex_min); tail = np.zeros((H, W), bool)
            rows_ = sub.shape[0]
            if rows_ > 0:
                # for each column: the first index where a gap longer than --gap-px begins
                notg = ~sub; run_end = np.full(sub.shape[1], rows_, np.int32)
                gap = np.zeros(sub.shape[1], np.int32); active = np.ones(sub.shape[1], bool)
                for r in range(rows_):
                    gap = np.where(notg[r], gap + 1, 0)
                    stop = active & (gap > a.gap_px); run_end[stop] = r - a.gap_px; active &= ~stop
                col_idx = np.arange(rows_)[:, None]; tail_sub = (col_idx < run_end[None, :]) & (run_end[None, :] > a.gap_px)
                tail[y_h:y1, x0:x1] = tail_sub
            tail = cv2.morphologyEx(tail.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((a.close_px, a.close_px), np.uint8))
            tail = cv2.morphologyEx(tail, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0          # a leg's edge against the wall is a thin textured strip, not a tail
            # skin by chroma distance (L down-weighted) and the hand discs are never the tail
            if cs is not None:
                sub = L[y_h:y1, x0:x1]
                def dmin(cc): return np.min(np.stack([a.skin_lw * (sub[..., 0] - c[0]) ** 2 + ((sub[..., 1:] - c[1:]) ** 2).sum(axis=2) for c in cc]), axis=0)
                tail[y_h:y1, x0:x1] &= ~(dmin(cs) < dmin(cg))
            for _, disc in hand_patches(lm, W, H, a.hand_radius): tail &= ~disc
            m = tail.astype(np.uint8) * 255
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
            nc, cl, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
            for c in range(1, nc):
                if st[c, cv2.CC_STAT_AREA] < a.min_blob: m[cl == c] = 0
        masks.append(m); before.append(int((m > 0).sum()))
    if a.temporal > 1:
        t = a.temporal // 2; masks = [(np.median(np.stack(masks[max(0, i - t):i + t + 1]), axis=0) > 127).astype(np.uint8) * 255 for i in range(n)]
    # ---- fill: trousers texture propagated upward, column by column
    t_med = np.median(tp, axis=0); t_bgr = cv2.cvtColor(np.uint8([[t_med]]), cv2.COLOR_LAB2BGR)[0, 0].astype(np.float32)
    outs = []; rng = np.random.default_rng(0)
    for i in range(n):
        f = frames[i].astype(np.float32); m = masks[i] > 0; g = f.copy()
        if m.any():
            cls = nearest(lab_of(i))
            for x in np.where(m.any(axis=0))[0]:
                ys = np.where(m[:, x])[0]; runs = np.split(ys, np.where(np.diff(ys) > 1)[0] + 1)
                for r in runs:
                    t0, b0 = int(r[0]), int(r[-1]); ln = b0 - t0 + 1
                    src = np.arange(b0 + 1, b0 + 1 + ln)
                    ok = src < H
                    if ok.any() and (cls[src[ok], x] == 1).mean() > 0.6:      # rows below are trousers: mirror them upward
                        col = f[np.clip(src, 0, H - 1), x][::-1]
                        col[~ok[::-1]] = t_bgr + rng.normal(0, a.noise, (int((~ok).sum()), 3))
                    else:
                        col = t_bgr[None, :] + rng.normal(0, a.noise, (ln, 3))
                    g[t0:b0 + 1, x] = col
            g = cv2.GaussianBlur(g, (0, 0), 0.8) * (m[..., None]) + g * (~m[..., None])      # soften the copied grain a touch
            w = cv2.GaussianBlur(m.astype(np.float32), (0, 0), a.feather)[..., None]
            f = f * (1 - w) + g * w
        outs.append(np.clip(f, 0, 255).astype(np.uint8))
    encode(outs, fps, a.master, a.out)
    after = []
    for i in range(0, n, max(1, n // 12)):
        cls = nearest(cv2.cvtColor(outs[i], cv2.COLOR_BGR2LAB).astype(np.float32)); y_h = hem_rows[i]; y1 = min(H, y_h + int(a.reach * ts))
        after.append(int((cls[y_h:y1] == 0).sum()))
    qa = {"master": a.master, "out": a.out, "frames": n, "size": [W, H], "fps": fps, "torso_scale": ts, "hem_offset": a.hem_offset, "reach": a.reach,
          "frames_with_hips": len(valid), "hem_row_median": float(np.median(hem_rows)), "hem_row_p05_p95": [float(np.percentile(hem_rows, 5)), float(np.percentile(hem_rows, 95))],
          "tail_px_before_median": float(np.median(before)), "tail_px_before_max": int(max(before)), "garment_px_below_hem_after_median": float(np.median(after)),
          "classes": {"garment": cg.tolist(), "trousers": ct.tolist(), "skin": cs.tolist() if cs is not None else None}}
    if a.qa_dir:
        os.makedirs(a.qa_dir, exist_ok=True); json.dump(qa, open(os.path.join(a.qa_dir, "condition_qa.json"), "w"), indent=1)
        idx = [int(n * f) for f in (0.1, 0.35, 0.6, 0.9)]; rows = []
        for i in idx:
            mv = cv2.cvtColor(masks[i], cv2.COLOR_GRAY2BGR); cv2.line(mv, (0, hem_rows[i]), (W, hem_rows[i]), (0, 0, 255), 2)
            rows.append(np.hstack([frames[i], mv, outs[i]]))
        sheet = np.vstack(rows); cv2.imwrite(os.path.join(a.qa_dir, "condition_sheet.jpg"), cv2.resize(sheet, (sheet.shape[1] // 3, sheet.shape[0] // 3)), [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(json.dumps({k: v for k, v in qa.items() if k != "classes"}))


if __name__ == "__main__":
    main()
