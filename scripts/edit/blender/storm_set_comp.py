"""Finish the storm set's Blender frames: rain on the same wind, grain, vignette, the mp4. $0 and deterministic.
usage: storm_set_comp.py <storm_set.json> <png_dir> <out.mp4> [--seed 7] [--rain 1.0] [--grain 0.018] [--still N out.jpg]
  png_dir   storm_set_build.py's storm_0001.png ... (any size; the rain scales with it)
Rain is two layers of streaks drawn on the picture (far: fine and dim; near: long and soft), slanted by the wind curve in
the params so it leans and gusts with the debris. Grain is fixed-seed per frame. No audio: the song is laid when the
verse is timed against his footage (Fendi, 16 Nov: line up only after the footage is in)."""
import argparse, glob, json, math, os, subprocess
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("params"); ap.add_argument("png"); ap.add_argument("out")
ap.add_argument("--seed", type=int, default=7); ap.add_argument("--rain", type=float, default=1.0)
ap.add_argument("--grain", type=float, default=0.018); ap.add_argument("--still", nargs=2, default=None)
A = ap.parse_args()
P = json.load(open(A.params)); WD = P["wind"]; FPS = P["render"]["fps"]
files = sorted(glob.glob(os.path.join(A.png, "storm_*.png"))); assert files, "no frames"
h, w = cv2.imread(files[0]).shape[:2]; k = w / 1080.0
def gust(t): return WD["base"] + sum(a * math.sin(2 * math.pi * t / p + ph) for a, p, ph in WD["gusts"])

rs = np.random.RandomState(A.seed)
LAYERS = [  # count, length px, thickness, brightness, fall speed px/frame, slant gain
    dict(n=int(900 * A.rain), L=26 * k, th=1, a=0.10, v=70 * k, slant=0.55, x=rs.rand(int(900 * A.rain)) * w * 1.6 - 0.3 * w, y=rs.rand(int(900 * A.rain)) * h),
    dict(n=int(160 * A.rain), L=95 * k, th=2, a=0.13, v=150 * k, slant=0.75, x=rs.rand(int(160 * A.rain)) * w * 1.6 - 0.3 * w, y=rs.rand(int(160 * A.rain)) * h),
]
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
vig = 1 - 0.28 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) ** 1.3
vig = np.clip(vig, 0.55, 1)[..., None]

def frame(i, img):
    t = i / FPS; g = gust(t)
    out = img.astype(np.float32) / 255
    for Ly in LAYERS:
        Ly["y"] = (Ly["y"] + Ly["v"]) % (h + Ly["L"]); Ly["x"] = Ly["x"] + Ly["v"] * Ly["slant"] * g * WD["toward_x"]
        Ly["x"] = np.where(Ly["x"] > w * 1.3, Ly["x"] - w * 1.6, Ly["x"])
        layer = np.zeros((h, w), np.float32)
        dx = Ly["slant"] * g * WD["toward_x"]; n = math.hypot(1, dx)
        for x0, y0 in zip(Ly["x"], Ly["y"]):
            x1, y1 = x0 - Ly["L"] * dx / n, y0 - Ly["L"] / n
            cv2.line(layer, (int(x0), int(y0)), (int(x1), int(y1)), 1.0, Ly["th"], cv2.LINE_AA)
        if Ly["th"] > 1: layer = cv2.GaussianBlur(layer, (0, 0), 1.2 * k)
        out = out + (1 - out) * layer[..., None] * Ly["a"] * np.array([0.92, 0.95, 1.0], np.float32)
    gr = np.random.RandomState(A.seed * 1000 + i).randn(h, w, 1).astype(np.float32) * A.grain
    out = np.clip(out * vig + gr, 0, 1)
    return (out * 255 + 0.5).astype(np.uint8)

if A.still:
    idx = int(A.still[0])
    for i in range(idx): frame(i, cv2.imread(files[i]))                      # advance the rain to that frame
    cv2.imwrite(A.still[1], frame(idx, cv2.imread(files[idx]))); print("still", A.still[1]); raise SystemExit
pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
for i, f in enumerate(files): pr.stdin.write(frame(i, cv2.imread(f)).tobytes())
pr.stdin.close(); pr.wait(); print("wrote", A.out, len(files), "frames")
