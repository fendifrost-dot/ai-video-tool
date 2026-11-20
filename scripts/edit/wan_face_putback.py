"""TEST: Wan 3.0 gives the motion, the light and the scene; Allen's face stays his own photo pixels.

The Wan clip starts on the approved still, then redraws his face as it goes (eyes, skin, a smirk). Here each frame's
face is rebuilt from the still's own pixels: moved by the dense motion Wan gave the face (flow from Wan's first frame),
and lit by the slow change of light Wan put on it (low-frequency ratio only, no detail taken from the render).
Outside the head mask every pixel is Wan's.

usage: wan_face_putback.py <frames_dir> <still.png> <head_mask.png> <out_dir>
"""
import glob, os, sys
sys.path.insert(0, "/Volumes/T7/tools/LivePortrait/site-packages")
import cv2
import numpy as np

fdir, still_p, mask_p, out_dir = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
fs = sorted(glob.glob(os.path.join(fdir, "f_*.png")))
f0 = cv2.imread(fs[0])
h, w = f0.shape[:2]
still = cv2.resize(cv2.imread(still_p), (w, h), interpolation=cv2.INTER_AREA)
mask = cv2.resize(cv2.imread(mask_p, 0), (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
print("first Wan frame vs the still inside the head mask: mean |diff| %.2f of 255" % np.abs(f0.astype(np.float32) - still)[mask > 0.5].mean())
g0 = cv2.cvtColor(f0, cv2.COLOR_BGR2GRAY)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
dis.setFinestScale(0)
gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
flow = None
prev_g = g0
acc = np.zeros((h, w, 2), np.float32)          # for each pixel of frame k: where it was in frame 0
peak, resid = 0.0, []
for k, f in enumerate(fs):
    cur = cv2.imread(f)
    g = cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY)
    if k:
        step = dis.calc(g, prev_g, None)                                   # frame k -> frame k-1
        mx, my = gx + step[..., 0], gy + step[..., 1]
        acc = step + cv2.remap(acc, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    prev_g = g
    # only the smooth movement of the whole head is followed: Wan's own eyelids and smirk are not his, and following
    # them (sigma 2) dragged his eyes and mouth out of shape by the last third of the clip
    fl = cv2.GaussianBlur(acc, (0, 0), float(os.environ.get('FLOW_SIGMA', '16')))
    mx, my = gx + fl[..., 0], gy + fl[..., 1]
    own = cv2.remap(still, mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    w0 = cv2.remap(f0, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    m = cv2.remap(mask, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    m = cv2.GaussianBlur(cv2.erode(m, np.ones((5, 5), np.uint8)), (0, 0), 3.0)
    ratio = (cv2.GaussianBlur(cur.astype(np.float32), (0, 0), 14) + 4) / (cv2.GaussianBlur(w0, (0, 0), 14) + 4)
    if os.environ.get('LIGHT') == 'luma':            # brightness only: Wan's colour drift is not laid on his skin (it tinted his face violet)
        ratio = np.repeat(ratio.mean(2, keepdims=True), 3, 2)
    lit = np.clip(own * np.clip(ratio, 0.45, 2.4), 0, 255)
    out = (cur.astype(np.float32) * (1 - m[..., None]) + lit * m[..., None]).round().astype(np.uint8)
    out[m == 0] = cur[m == 0]
    cv2.imwrite(os.path.join(out_dir, os.path.basename(f)), out)
    mag = np.linalg.norm(fl, axis=2)[m > 0.5]
    peak = max(peak, float(np.percentile(mag, 99)) if mag.size else 0)
    resid.append(float(np.abs(lit - cur.astype(np.float32))[m > 0.5].mean()) if mag.size else 0)
print("frames %d; largest head movement from the first frame (99th pct): %.1f px" % (len(fs), peak))
print("his pixels vs Wan's redraw inside the mask, mean |diff|: first %.1f, median %.1f, last %.1f of 255" % (resid[0], float(np.median(resid)), resid[-1]))
