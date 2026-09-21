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

Matte hygiene: largest connected component, hole fill, temporal median over 3
frames (kills flicker), 1-px erode + Gaussian feather so the closet never fringes.
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

def fill_holes(mask):
    from scipy import ndimage
    return ndimage.binary_fill_holes(mask)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True); ap.add_argument("--plate", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--zoom", type=float, default=0.015)
    ap.add_argument("--cool", type=float, default=0.06); ap.add_argument("--feather", type=float, default=3.0)
    ap.add_argument("--model", default="u2net_human_seg"); ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--plate-gain", type=float, default=1.0)
    ap.add_argument("--bg-tol", type=float, default=30.0, help="sum-RGB distance below which a pixel matches the static background")
    ap.add_argument("--core-erode", type=int, default=12, help="px eroded from the matte that are always kept (performer interior)")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    from rembg import remove, new_session
    session = new_session(a.model)

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

    # Static-camera background prior: the temporal median of the clip is the empty
    # room; pixels that match it cannot be the performer. This stops the matte
    # swallowing dark closet objects that touch his arm.
    from scipy import ndimage
    sub = [np.asarray(Image.open(os.path.join(tmp, frames[i])).convert("RGB")).astype(np.float32) for i in range(0, n, max(1, n // 24))]
    bg_med = np.median(np.stack(sub), axis=0)
    alphas = []
    for i, f in enumerate(frames):
        im = Image.open(os.path.join(tmp, f)).convert("RGB")
        m = remove(im, session=session, only_mask=True)
        m = np.asarray(m).astype(np.float32) / 255.0
        hard = m > 0.5
        diff = np.abs(np.asarray(im).astype(np.float32) - bg_med).sum(axis=2)
        core = ndimage.binary_erosion(hard, iterations=a.core_erode)
        hard = hard & ((diff > a.bg_tol) | core)
        hard = fill_holes(largest_component(hard))
        alphas.append(hard.astype(np.float32))
        if i % 24 == 0: print(f"matte {i+1}/{n}", file=sys.stderr)
    A = np.stack(alphas)
    # temporal median (3) to kill flicker, then erode 1 px + feather
    Am = A.copy()
    for i in range(n):
        lo, hi = max(0, i - 1), min(n, i + 2)
        Am[i] = np.median(A[lo:hi], axis=0)
    out_frames = []
    for i in range(n):
        al = Image.fromarray((Am[i] * 255).astype(np.uint8))
        al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(a.feather))
        al = np.asarray(al).astype(np.float32)[..., None] / 255.0
        fg = np.asarray(Image.open(os.path.join(tmp, frames[i])).convert("RGB")).astype(np.float32)
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
