"""Put a NEW cut-out of him (reinsert_him.py + matte + prep_performer.py) into a shot that was already built in the set,
without re-rendering the set. $0. usage:
  place_in_built_shot.py <built_final> <plate> <built_matte> <old_alpha> <perf_dir> <out_final.mp4> <out_matte.mp4>
                         --offset N [--wrap 0] [--gain auto] [--sheet out.jpg]
  built_final   the shot as built with the OLD cut-out (hyenas_set_build.py + hyenas_set_comp.py), 1080x1920
  plate         the same set without them, with their shadows (--passes plate), frame for frame
  built_matte   where the old cut-out is in the built frame (--passes matte): it carries what stands in front of them
  old_alpha     the matte the OLD cut-out was made with (matte-video-proxy alpha of the put-back), take geometry
  perf_dir      prep_performer.py p_0001.png ... of the NEW cut-out (RGBA, the take's geometry, any size)
  --offset N    the first take frame the built shot uses (the build's --perf_offset)
How: per frame an affine fit (ECC) of old_alpha onto built_matte gives the map take -> shot that the set's camera made
(the picture stands on one upright surface, so the map is very nearly a similarity). The new cut-out goes through the
same map. What stood in front of the old cut-out (grass) is kept: where the mapped old alpha is solid and the built
matte is empty, the new alpha is cut too. He is composited in linear light over the plate with one gain (--gain auto:
the old cut-out's median brightness in the built shot, one number for the whole shot) and no light wrap by default (0.10 left a paler outline on verse 26.1; <= 0.15 if a shot wants one).
The shadows on the ground are the plate's (thrown by the old cut-out: same place, same outline within a few pixels).
Out: the new shot and its matte, the inputs relight_comp.py takes. Status: CANDIDATE (verse 26.1, 14 Nov 2026)."""
import argparse, json, os, subprocess, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from relight_from_passes import lin, srgb, blur

W, H = 1080, 1920
def frames(p, gray=False):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt",
                           "gray" if gray else "rgb48le", "-"], stdout=subprocess.PIPE)
    n = W * H * (1 if gray else 6)
    while len(b := pr.stdout.read(n)) == n:
        yield (np.frombuffer(b, np.uint8).reshape(H, W).astype(np.float32) / 255 if gray
               else np.frombuffer(b, np.uint16).reshape(H, W, 3).astype(np.float32) / 65535)

def fit(old_a, built_m):
    """Affine map (2x3) taking take pixels to shot pixels: bbox start, then ECC on the two mattes at half size."""
    def box(m):
        ys, xs = np.nonzero(m > 0.5); return xs.min(), ys.min(), xs.max(), ys.max()
    ax0, ay0, ax1, ay1 = box(old_a); bx0, by0, bx1, by1 = box(built_m)
    s = (by1 - by0) / max(ay1 - ay0, 1)
    M = np.array([[s, 0, (bx0 + bx1) / 2 - s * (ax0 + ax1) / 2], [0, s, by0 - s * ay0]], np.float32)
    k = 0.5; a = cv2.resize(blur(old_a, 2), None, fx=k, fy=k); b = cv2.resize(blur(built_m, 2), None, fx=k, fy=k)
    Mk = M.copy(); Mk[:, 2] *= k
    try: _, Mk = cv2.findTransformECC(a, b, Mk, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-6), None, 5)
    except cv2.error: pass
    # ECC returns the map from template (a, take) coords to input (b, shot) coords
    Mk[:, 2] /= k
    return Mk

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    for a in ("built", "plate", "built_matte", "old_alpha", "perf_dir", "out", "out_matte"): ap.add_argument(a)
    ap.add_argument("--offset", type=int, required=True); ap.add_argument("--wrap", type=float, default=0.0)
    ap.add_argument("--gain", default="auto"); ap.add_argument("--sheet")
    ap.add_argument("--edge_from_inside", type=float, default=0.0, help="px; 0 = off (default: on verse 26.1 it darkened the chain where it crosses open ground)")
    A = ap.parse_args()
    pf = sorted(f for f in os.listdir(A.perf_dir) if f.startswith("p_") and f.endswith(".png"))
    built = list(frames(A.built)); mattes = list(frames(A.built_matte, gray=True)); N = len(built)
    olds = [a for i, a in enumerate(frames(A.old_alpha, gray=True)) if A.offset <= i < A.offset + N]
    assert len(olds) == N and len(pf) >= A.offset + N, (len(olds), len(pf), N)
    Y = lambda x: x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    def new(i):
        im = cv2.imread(os.path.join(A.perf_dir, pf[A.offset + i]), cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
        im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA) if im.shape[:2] != (H, W) else im
        return lin(im[..., :3][..., ::-1]), im[..., 3]
    Ms = [fit(olds[i], mattes[i]) for i in range(N)]
    # the set's camera moves smoothly: the fitted maps are smoothed over 5 frames so the cut-out does not jitter
    Ms = np.array(Ms); pad = np.pad(Ms, ((2, 2), (0, 0), (0, 0)), mode="edge"); Ms = np.stack([pad[i:i + 5].mean(0) for i in range(N)])
    warp = lambda x, M: cv2.warpAffine(x, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=0)
    if A.gain == "auto":
        gs = []
        for i in range(0, N, 6):
            rgb, a = new(i); m_old = mattes[i] > 0.9; m_new = warp(a, Ms[i]) > 0.9
            pl = lin(built[i]); gs.append(np.median(Y(pl)[m_old]) / max(np.median(Y(warp(rgb, Ms[i]))[m_new]), 1e-6))
        gain = float(np.median(gs))
    else: gain = float(A.gain)
    enc = lambda path, pix: subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix, "-s", f"{W}x{H}", "-r", "24",
                                               "-i", "-", "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    vo, vm = enc(A.out, "rgb48le"), enc(A.out_matte, "gray")
    sheet = []; resid = []
    for i, Pl in enumerate(frames(A.plate)):
        if i >= N: break
        rgb, a = new(i); M = Ms[i]
        pm = warp(np.dstack([rgb * a[..., None], a]), M); na = np.clip(pm[..., 3], 0, 1)
        him = np.where(na[..., None] > 1e-4, pm[..., :3] / np.maximum(na[..., None], 1e-4), 0) * gain
        if A.edge_from_inside > 0:      # his outline takes its colour from just inside him, not from the take's wall (a pale
            # line on a dark set). The alpha is untouched and thin things (a chain, a leash: whatever a 9 px opening
            # removes) are left exactly as they are, so no link is recoloured or lost (no choke: PROBLEM_INDEX)
            solid = (na > 0.5).astype(np.uint8); thick = cv2.morphologyEx(solid, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
            thin = cv2.dilate(solid & (1 - thick), np.ones((7, 7), np.uint8)) > 0
            iw = cv2.erode((na > 0.95).astype(np.float32), np.ones((5, 5), np.uint8)) * thick; bw = blur(iw, A.edge_from_inside)
            cin = blur(him * iw[..., None], A.edge_from_inside) / np.maximum(bw, 1e-5)[..., None]
            band = ((na > 0.02) & (iw == 0) & (bw > 0.002) & ~thin)[..., None]
            him = np.where(band, cin, him)
        oa = warp(olds[i], M); resid.append(float(np.abs((oa > 0.5).astype(np.float32) - (mattes[i] > 0.5)).mean()))
        hold = ((oa > 0.6) & (mattes[i] < 0.2)).astype(np.uint8)                       # what stood in front of the old cut-out
        hold = cv2.dilate(cv2.morphologyEx(hold, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)), np.ones((3, 3), np.uint8))
        na = na * (1 - blur(hold.astype(np.float32), 0.8))
        pl = lin(Pl)
        inner = blur(cv2.erode(na, np.ones((7, 7), np.uint8)), 3.0); edge = np.clip(na - inner, 0, 1)[..., None]
        wide = blur(pl, 30.0); him = him * (1 - A.wrap * edge) + (1 - (1 - np.clip(him, 0, 1)) * (1 - wide)) * A.wrap * edge
        out = pl * (1 - na[..., None]) + him * na[..., None]
        vo.stdin.write((np.clip(srgb(out), 0, 1) * 65535 + 0.5).astype(np.uint16).tobytes())
        vm.stdin.write((na * 255 + 0.5).astype(np.uint8).tobytes())
        if A.sheet and i in (5, N // 2, N - 6):
            c = lambda x: (np.clip(x, 0, 1) * 255).astype(np.uint8)[430:1620, 300:960]
            sheet.append(np.hstack([c(built[i]), c(srgb(out))]))
    for v in (vo, vm): v.stdin.close(); v.wait()
    if sheet: cv2.imwrite(A.sheet, cv2.resize(np.hstack(sheet), None, fx=0.6, fy=0.6)[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 92])
    s = np.sqrt(np.abs(np.linalg.det(Ms[:, :, :2])))
    print(f"frames {N}  gain {gain:.3f}  take->shot scale {s.min():.4f}..{s.max():.4f}  fit residual (old alpha vs built matte) "
          f"mean {100 * np.mean(resid):.2f} % max {100 * np.max(resid):.2f} % of the frame")
