"""The matte pass of hyenas_set_build.py (--passes matte) as a grey video: white where he, the creature and the chain
are in the finished frame. $0 and deterministic.
usage: hyenas_set_matte.py <exr_matte_dir> <out.mp4> [--fps 24]
The pass renders only them, with everything else holding them out and no smoke, on a transparent film; its alpha is
the matte. Written as 8-bit grey H.264 at crf 6 (a finisher's luma matte), one frame per EXR."""
import argparse, glob, os, subprocess
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2, numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("exr"); ap.add_argument("out"); ap.add_argument("--fps", type=float, default=24)
A = ap.parse_args()
files = sorted(glob.glob(os.path.join(A.exr, "set_*.exr"))); assert files, "no frames"
first = cv2.imread(files[0], cv2.IMREAD_UNCHANGED); assert first.shape[2] == 4, "not a matte pass (no alpha)"
h, w = first.shape[:2]
pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", str(A.fps), "-i", "-",
                       "-c:v", "libx264", "-crf", "6", "-preset", "slow", "-pix_fmt", "yuv420p", "-color_range", "pc", "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
cover = []
for f in files:
    a = np.clip(cv2.imread(f, cv2.IMREAD_UNCHANGED)[..., 3], 0, 1); cover.append(int((a > 0.5).sum()))
    pr.stdin.write((a * 255 + 0.5).astype(np.uint8).tobytes())
pr.stdin.close(); pr.wait()
print("wrote", A.out, len(files), "frames; covered px min/max", min(cover), max(cover))
