"""Before/after crops of his car-side edge, side by side, for Fendi's eye (bleed tests), $0.
usage: edge_crops.py <out.png> <x0,y0,x1,y1> <scale> LABEL=SOURCE [LABEL=SOURCE ...]
  SOURCE is a still (PNG) or a clip and a frame number, clip.mp4@N (1-based, decoded with ffmpeg, no seek guesswork).
Each source is cropped to the same box (frame pixels), enlarged by `scale` with nearest-neighbour (no smoothing, so
the edge reads as rendered), labelled, and laid left to right. Output stays local: it shows Fendi, so it never goes
in the repo."""
import subprocess, sys
import cv2, numpy as np

out, box, scale = sys.argv[1], [int(v) for v in sys.argv[2].split(",")], float(sys.argv[3])
x0, y0, x1, y1 = box
def load(src):
    if "@" in src and src.rsplit("@", 1)[1].isdigit():
        clip, n = src.rsplit("@", 1); n = int(n)
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", clip, "-vf", f"select=eq(n\\,{n - 1})",
                              "-vframes", "1", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
        return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    return cv2.imread(src, cv2.IMREAD_COLOR)
tiles = []
for arg in sys.argv[4:]:
    label, src = arg.split("=", 1)
    im = load(src)
    c = cv2.resize(im[y0:y1, x0:x1], None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
    bar = np.zeros((34, c.shape[1], 3), np.uint8)
    cv2.putText(bar, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
    tiles.append(np.vstack([bar, c]))
gap = np.full((tiles[0].shape[0], 6, 3), 40, np.uint8)
row = tiles[0]
for t in tiles[1:]: row = np.hstack([row, gap, t])
cv2.imwrite(out, row)
print("wrote", out, row.shape[1], "x", row.shape[0])
