"""$0. A clip plays inside a picture frame hanging on a wall (the "living portrait").

The wall plate is a photograph with a flat GREEN card inside the frame. The card's four corners are found, each clip
frame (cropped to the card's shape) is warped onto it, and the card's own light (brighter under the picture lamp,
darker in the frame's shadow) is laid over the clip so it sits in the room. Only the card's pixels change (printed).

usage: clip_in_wall_frame.py <wall.jpg> <clip_frames_dir> <out_dir> <crop_x0> [<out_w> <out_h>]   env GAIN (0.82)
"""
import sys, os, glob, numpy as np, cv2
wall_p, fdir, out_dir, cx0 = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
OW, OH = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (1920, 1080)
os.makedirs(out_dir, exist_ok=True)
GAIN = float(os.environ.get('GAIN', '0.82'))        # a daylight picture at full brightness reads as a TV screen in a dim room
wall = cv2.imread(wall_p); s = max(OW / wall.shape[1], OH / wall.shape[0])
wall = cv2.resize(wall, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
y0 = (wall.shape[0] - OH) // 2; x0 = (wall.shape[1] - OW) // 2; wall = wall[y0:y0 + OH, x0:x0 + OW].copy()
hsv = cv2.cvtColor(wall, cv2.COLOR_BGR2HSV)
green = ((hsv[..., 0] > 40) & (hsv[..., 0] < 85) & (hsv[..., 1] > 110) & (hsv[..., 2] > 60)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(green); big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); card = (lab == big).astype(np.uint8)
card = cv2.morphologyEx(card, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
cnt = max(cv2.findContours(card, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
quad = cv2.approxPolyDP(cnt, 0.02 * cv2.arcLength(cnt, True), True).reshape(-1, 2).astype(np.float32)
assert len(quad) == 4, "the card is not a four-cornered shape: %d corners" % len(quad)
c = quad.mean(0); quad = quad[np.argsort(np.arctan2(quad[:, 1] - c[1], quad[:, 0] - c[0]))]      # TL, TR, BR, BL
cw = float(np.linalg.norm(quad[1] - quad[0]) + np.linalg.norm(quad[2] - quad[3])) / 2; ch = float(np.linalg.norm(quad[3] - quad[0]) + np.linalg.norm(quad[2] - quad[1])) / 2
print("card corners (TL TR BR BL):", quad.round().astype(int).tolist(), "| %.0f x %.0f px, shape %.3f" % (cw, ch, cw / ch))
# the card's own light: its brightness over its median, smoothed (lamp above, frame shadow at the edges)
L = cv2.cvtColor(wall, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32); med = float(np.median(L[card > 0]))
Lf = L.copy(); Lf[card == 0] = med
light = np.clip(cv2.GaussianBlur(Lf, (0, 0), 12) / med, 0.7, 1.25)[..., None]
grow = cv2.dilate(card, np.ones((5, 5), np.uint8))                 # cover the green fringe on the frame's inner lip
alpha = cv2.GaussianBlur(grow.astype(np.float32), (0, 0), 0.8)[..., None]
shade = 1 - 0.35 * np.clip(1 - cv2.distanceTransform(grow, cv2.DIST_L2, 5) / 14.0, 0, 1)[..., None] ** 2      # the lip's soft shadow on the picture
qg = quad + (quad - c) / np.linalg.norm(quad - c, axis=1, keepdims=True) * 4
fs = sorted(glob.glob(os.path.join(fdir, "f_*.png"))); f0 = cv2.imread(fs[0]); fh, fw = f0.shape[:2]
cwid = int(round(fh * cw / ch)); assert cx0 + cwid <= fw, "crop runs off the clip"
src = np.float32([[0, 0], [cwid, 0], [cwid, fh], [0, fh]]); M = cv2.getPerspectiveTransform(src, qg)
print("clip crop: x %d-%d of %d, full height %d; drawn at %.2fx" % (cx0, cx0 + cwid, fw, fh, ch / fh))
worst = 0
for f in fs:
    pic = cv2.warpPerspective(cv2.imread(f)[:, cx0:cx0 + cwid], M, (OW, OH), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    out = wall.astype(np.float32) * (1 - alpha) + np.clip(pic * light * shade * GAIN, 0, 255) * alpha
    out = out.round().astype(np.uint8); out[grow == 0] = wall[grow == 0]
    worst = max(worst, int(np.abs(out.astype(int) - wall.astype(int))[cv2.dilate(grow, np.ones((7, 7), np.uint8)) == 0].max()))
    cv2.imwrite(os.path.join(out_dir, os.path.basename(f)), out)
print("frames %d; max change outside the card (and its 3 px lip): %d; green pixels left in frame 1: %d" % (len(fs), worst,
      int(((lambda h: (h[..., 0] > 40) & (h[..., 0] < 85) & (h[..., 1] > 110) & (h[..., 2] > 60))(cv2.cvtColor(cv2.imread(os.path.join(out_dir, os.path.basename(fs[0]))), cv2.COLOR_BGR2HSV)) & (cv2.dilate(grow, np.ones((15, 15), np.uint8)) > 0) & (cv2.erode(grow, np.ones((15, 15), np.uint8)) == 0)).sum())))
