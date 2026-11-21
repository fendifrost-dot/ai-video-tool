"""Key a green backdrop out of a delivered matte the way a green screen is keyed, $0 (Fendi, 21 Nov 2026: "Key out any
green ... Like you would in a green screen").

Replaces matte_minus_green_backdrop.py for this use: that step cut a hard, dilated hole wherever a pixel was green and
kept only the piece joined to him; on the wall take it removed ~600 px of HIM per frame (outline and hands over the
quilt), the outline flickered and his hand came and went (Fendi, 21 Nov: "my outline is flickering like crazy and my
hand keeps disappearing"). The PROBLEM_INDEX "Never" column lists a per-frame colour gate on the matte.

This keyer, per pixel, soft, no morphology, nothing carried between frames:
  1. the backdrop's colour is MEASURED once: Lab mean and covariance of the backdrop in an empty-room plate (the
     per-pixel median of frames across the whole static-camera take, where he is everywhere and nowhere);
  2. each pixel's Mahalanobis distance d to that colour gives the key: 0 below --lo, 1 above --hi, a smoothstep
     between (the thresholds are set from the measured distributions: the backdrop's 99th percentile and his own
     0.01th percentile on frames where the delivered matte holds no backdrop);
  3. alpha = delivered alpha x key: it only ever REMOVES backdrop; it never adds;
  3b. clean plate: inside the backdrop's area, a pixel matching the empty room (Delta E under --plate-lo) is backdrop too
  4. spill: where the key is partial (his edge over the backdrop) the colour's green excess is clamped to
     max(R, B), so his outline carries no green fringe; his solid pixels (key 1) are untouched.
Prints per frame what it removed and the share of removed pixels that are backdrop-coloured (should be ~100 %).

usage: key_green_screen.py <fg.mp4> <delivered_alpha.mp4> <empty_room.png (backdrop region: the most backdrop-like sample per pixel)> <out_fg.mp4> <out_alpha.mp4>
       --box x0,y0,x1,y1 (the backdrop's region in the empty room) [--lo 2.6] [--hi 4.0]
"""
import argparse, json, subprocess
import numpy as np, cv2

ap = argparse.ArgumentParser()
for k in ("fg", "alpha", "room", "out_fg", "out_alpha"): ap.add_argument(k)
ap.add_argument("--box", required=True); ap.add_argument("--lo", type=float, default=2.6); ap.add_argument("--hi", type=float, default=4.0)
ap.add_argument("--l-weight", type=float, default=0.35)   # brightness counts this much: the backdrop in his shadow is the same green, darker
ap.add_argument("--islands", type=int, default=1)   # drop specks not joined to his body (the largest piece), after the key
ap.add_argument("--plate-lo", type=float, default=4.0); ap.add_argument("--plate-hi", type=float, default=9.0)
A = ap.parse_args()
s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                               "-of", "json", A.fg], capture_output=True, text=True).stdout)["streams"][0]
W, H, RATE = int(s["width"]), int(s["height"]), s["r_frame_rate"]
room = cv2.imread(A.room); x0, y0, x1, y1 = (int(v) for v in A.box.split(","))
lab = cv2.cvtColor(room, cv2.COLOR_BGR2LAB).astype(np.float64); hsv = cv2.cvtColor(room, cv2.COLOR_BGR2HSV)
box = np.zeros(room.shape[:2], bool); box[y0:y1, x0:x1] = True
screen = box & (hsv[..., 0] > 35) & (hsv[..., 0] < 90) & (hsv[..., 1] > 60)
WL = np.array([A.l_weight, 1.0, 1.0])
Q = lab[screen] * WL; mu = Q.mean(0); Ci = np.linalg.inv(np.cov(Q.T) + np.eye(3))
print("backdrop Lab", mu.round(1), "pixels", int(screen.sum()))
# clean-plate key, inside the backdrop's area only (its seams and dark folds are not backdrop-coloured, so the colour
# key leaves them): the camera never moves, so a pixel that matches the empty room there IS the backdrop; he differs
# from it (cream knit, skin, beard, denim against dark green: Delta E well above --plate-hi)
region = cv2.morphologyEx(screen.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
region = cv2.dilate(region, np.ones((9, 9), np.uint8)).astype(bool)
room_lab = cv2.cvtColor(room, cv2.COLOR_BGR2LAB).astype(np.float32) * np.array([100 / 255, 1, 1], np.float32)
def reader(p, gray):
    return subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "gray" if gray else "bgr24", "-"], stdout=subprocess.PIPE)
def writer(p, gray):
    return subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray" if gray else "bgr24", "-s", f"{W}x{H}", "-r", RATE,
                             "-i", "-", "-c:v", "libx264", "-crf", "4" if gray else "12", "-pix_fmt", "yuv420p", p], stdin=subprocess.PIPE)
rf, ra = reader(A.fg, False), reader(A.alpha, True); wf, wa = writer(A.out_fg, False), writer(A.out_alpha, True)
n = 0
while True:
    bf = rf.stdout.read(W * H * 3); ba = ra.stdout.read(W * H)
    if len(bf) < W * H * 3 or len(ba) < W * H: break
    f = np.frombuffer(bf, np.uint8).reshape(H, W, 3); a = np.frombuffer(ba, np.uint8).reshape(H, W).astype(np.float32) / 255
    L = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float64) * WL - mu
    d = np.sqrt(np.einsum("...i,ij,...j->...", L, Ci, L))
    t = np.clip((d - A.lo) / (A.hi - A.lo), 0, 1); key = (t * t * (3 - 2 * t)).astype(np.float32)
    fl8 = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
    fl = fl8 * np.array([100 / 255, 1, 1], np.float32)
    # Delta E with brightness down-weighted (the backdrop in his shadow is the same green, darker), and only for
    # pixels that are themselves greenish (Lab a* under 125 on the 0-255 scale): his beard and dark hair are neutral
    # (a* ~128), skin is red (a* > 135), the cream knit and denim are far away in hue
    dd = fl - room_lab; de = np.sqrt((dd[..., 0] * A.l_weight) ** 2 + dd[..., 1] ** 2 + dd[..., 2] ** 2)
    tp = np.clip((de - A.plate_lo) / (A.plate_hi - A.plate_lo), 0, 1)
    kp = np.where(region & (fl8[..., 1] < 125), tp * tp * (3 - 2 * tp), 1.0).astype(np.float32)
    key = key * kp
    out_a = a * key
    if A.islands:
        # the clean-up step of a key: threads of the backdrop's dark seams and edges touch him only through 1-2 px
        # lines. His body is found on the matte with those threads shaved (an opening of 3 px) as its largest piece;
        # everything within 6 px of that body is kept as it is (fingertips and motion blur included), the rest goes.
        # His own pixels are never shaved: the opening only decides which piece is him.
        m = (out_a > 0.08).astype(np.uint8)
        mo = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        nn, lab_, st, _ = cv2.connectedComponentsWithStats(mo, connectivity=8)
        if nn > 1:
            body = (lab_ == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
            keep = cv2.dilate(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(bool)
            # in the 6 px margin only (outside the shaved body), a greenish pixel (Lab a* < 126) is the backdrop in his
            # shadow, not him: his edges are skin (a* > 135), cream knit (~128) or denim (b* low, a* ~128)
            band = keep & ~body.astype(bool)
            # ... and a very dark pixel there (Lab L* under 45 of 255) is the backdrop's shadowed fold: his edges are lit
            # skin, knit and denim (L* well above 60 in this take)
            out_a = np.where(keep & ~(band & ((fl8[..., 1] < 126) | (fl8[..., 0] < 45))), out_a, 0).astype(np.float32)
    g = f.astype(np.float32); edge = (key < 0.999) & (out_a > 0.002)
    cap = np.maximum(g[..., 0], g[..., 2]); g[..., 1] = np.where(edge, np.minimum(g[..., 1], cap), g[..., 1])
    wf.stdin.write(np.clip(g, 0, 255).astype(np.uint8).tobytes()); wa.stdin.write((out_a * 255).round().astype(np.uint8).tobytes())
    removed = (a > 0.5) & (out_a <= 0.5)
    if n % 12 == 0 or removed.sum() > 3000:
        print(f"frame {n}: removed {int(removed.sum())} solid px")
    n += 1
for w in (wf, wa): w.stdin.close(); w.wait()
print("frames", n)
