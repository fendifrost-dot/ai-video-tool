"""Measure the plate's light where it matters for him, $0: a reference surface per plate frame (the room's light
changes, which he follows) and, for the record, the reference surfaces in the plate and the take.
usage: measure_plate_light.py <plate.mp4> <approved.mp4> <out.npy> [belly|marble|x0,y0,x1,y1]
  belly   the penguin's white belly (only while the penguin stands still: the first plate)
  marble  the lit marble backsplash, a fixed surface (default: the penguin walks in the Ferrari plate)
  x0,y0,x1,y1   any other fixed surface, a box in 1080x1920 pixels (another room)
Boxes are in 1080x1920 pixels and were picked by eye on the plate still and on the take (DECISION)."""
import sys, subprocess
import numpy as np

plate, approved, out = sys.argv[1:4]
ref = sys.argv[4] if len(sys.argv) > 4 else "marble"
W, H = 1080, 1920
def frames(p):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    while len(b := pr.stdout.read(W * H * 3)) == W * H * 3:
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
def means(p, boxes):
    acc = {k: [] for k in boxes}
    for f in frames(p):
        for k, (x0, y0, x1, y1) in boxes.items(): acc[k].append(f[y0:y1, x0:x1].reshape(-1, 3).mean(0) / 255)
    return {k: np.array(v) for k, v in acc.items()}
boxes = dict(belly=(150, 1030, 215, 1180), marble=(40, 640, 300, 780), counter=(450, 1150, 800, 1250))
if "," in ref: boxes[ref] = tuple(int(v) for v in ref.split(","))
P = means(plate, boxes)
Q = means(approved, dict(door=(40, 700, 180, 1000), face=(560, 650, 650, 780)))
np.save(out, P[ref])
for k, v in {**P, **Q}.items(): print(k, "median sRGB", np.median(v, 0).round(3))
print("wrote", out, ref, len(P[ref]), "plate frames")
