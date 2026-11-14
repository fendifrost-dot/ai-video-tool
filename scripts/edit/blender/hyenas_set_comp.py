"""Finish the Hyenas set's Blender frames: lens glare, exposure and tone, vignette, grain. $0 and deterministic.
usage: hyenas_set_comp.py <hyenas_set.json> <exr_dir> <out.mp4> [--song master.wav] [--exposure 1.0] [--only FRAME --still out.jpg]
  exr_dir   from hyenas_set_build.py (set_0001.exr ..., scene-linear)
Glare is made from the picture's own light above white (the flames, the running lights), so it flickers with the
flares because the flares flicker; nothing is painted on. The song, when given, is laid from the verse time in the
params (song.verse_zero_in_master_s + song.verse_start_s)."""
import argparse, glob, os, subprocess
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import json
import cv2, numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("params"); ap.add_argument("exr"); ap.add_argument("out")
ap.add_argument("--song", default=""); ap.add_argument("--exposure", type=float, default=0.85)
ap.add_argument("--only", type=int, default=0); ap.add_argument("--still", default="")
ap.add_argument("--glare", type=float, default=1.0); ap.add_argument("--grain", type=float, default=0.016)
ap.add_argument("--verse_start", type=float, default=None, help="verse time of the first frame, when it is not the params' song.verse_start_s")
A = ap.parse_args()
P = json.load(open(A.params)); FPS = P["render"]["fps"]
files = sorted(glob.glob(os.path.join(A.exr, "set_*.exr")))
if A.only: files = [f for f in files if f.endswith(f"{A.only:04d}.exr")]
assert files, "no frames"
blur = lambda x, sx, sy=None: cv2.GaussianBlur(x, (0, 0), sx, sigmaY=sy or sx)
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.clip(v, 0, None), 1 / 2.4) - 0.055)

def finish(path, idx):
    lin = np.clip(cv2.imread(path, cv2.IMREAD_UNCHANGED)[..., :3].astype(np.float32), 0, 4000) * A.exposure   # BGR, linear
    h, w = lin.shape[:2]; k = w / 1080.0
    hot = np.clip(lin - 1.6, 0, 250)                                    # light above white: flame, running lights
    small = cv2.resize(hot, (w // 4, h // 4), interpolation=cv2.INTER_AREA); ks = k / 4
    g = 0.50 * blur(small, 3 * ks) + 0.30 * blur(small, 12 * ks) + 0.20 * blur(small, 40 * ks) + 0.10 * blur(small, 110 * ks)
    g += 0.14 * blur(small, 90 * ks, 1.6 * ks)                          # the phone lens's horizontal streak
    lin = lin + A.glare * 0.55 * cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
    lum = lin @ np.array([0.0722, 0.7152, 0.2126], np.float32)
    tm = lin / (1.0 + lum[..., None] * 0.55)                            # shoulder on luminance: bright red stays red
    tm = tm / (1.0 + np.clip(tm - 1.0, 0, None))                        # and no channel clips hard
    core = np.clip((lum - 25.0) / 150.0, 0, 1)[..., None]               # a flame's core burns out to white, as on a sensor
    tm = tm * (1 - core) + core
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r2 = ((xx - w / 2) / (w / 2)) ** 2 * 0.35 + ((yy - h / 2) / (h / 2)) ** 2 * 0.65
    tm *= (1 - 0.22 * np.clip(r2, 0, 1.5))[..., None]
    out = srgb(np.clip(tm, 0, 1))
    rs = np.random.default_rng(9000 + idx)
    n = rs.normal(0, A.grain, (h, w, 1)).astype(np.float32) + rs.normal(0, A.grain * 0.4, (h, w, 3)).astype(np.float32)
    out = out + n * (0.35 + 0.65 * (1 - np.clip(out.mean(-1, keepdims=True), 0, 1)))    # more in the dark, as a phone at night
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)

if A.still:
    cv2.imwrite(A.still, finish(files[0], A.only or 1), [cv2.IMWRITE_JPEG_QUALITY, 93]); print("wrote", A.still); raise SystemExit
first = finish(files[0], 1); h, w = first.shape[:2]
cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-"]
if A.song:
    t0 = P["song"]["verse_zero_in_master_s"] + (P["song"]["verse_start_s"] if A.verse_start is None else A.verse_start)
    cmd += ["-ss", f"{t0:.4f}", "-t", f"{len(files) / FPS:.4f}", "-i", A.song, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k"]
cmd += ["-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-shortest", A.out]
pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
pr.stdin.write(first.tobytes())
for i, f in enumerate(files[1:], 2): pr.stdin.write(finish(f, i).tobytes())
pr.stdin.close(); pr.wait(); print("wrote", A.out, len(files), "frames")
