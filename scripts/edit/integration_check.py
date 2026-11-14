"""Does he sit IN the scene or ON it? Measures the tells a compositor checks by eye, $0, no generation.
usage: integration_check.py <final> <matte> [--frame N] [--ring 60] [--json out.json]
       integration_check.py --self-test
  final  the finished shot (mp4/mov, or one png/jpg/exr frame): sRGB, or scene-linear if .exr
  matte  where he (and a creature) are IN THAT FRAME: veed matte mp4, hyenas_set_build.py --passes matte (exr_matte/
         alpha), or a png. White = him.
  --frame N  frame of a video to check (0-based; default the middle one)

Regions: HIM = the matte eroded 4 px (his pixels, no edge); RING = the set within --ring px around him (same light,
nearly the same depth); SET = everything outside him. All maths in linear light (sRGB decoded).
What it prints, each HIM vs the set, and why a compositor looks at it (docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md):
  black point   his darkest 1 % vs the set's, in stops. Lifted blacks on him = the first "pasted" tell.
  white point   his brightest 1 % vs the ring's, in stops (the set may hold flames brighter than anything near him).
  shadow tint   colour of his darkest 10 % vs the set's darkest 10 % (Lab a,b distance). Blacks share one colour in a
                photograph: the scene's ambient light.
  light tint    colour of his lit 10 % vs the ring's lit 10 %: does the light on him have the set's colour?
  saturation    median chroma, him vs ring.
  noise         grain in his flattest areas vs the set's flattest areas (std of picture minus its 3x3 median).
  sharpness     edge energy relative to contrast, him vs ring (phone sharpening vs a clean render).
Then the match grade a compositor would start from: per channel, the gain and lift that put his darkest 10 % and lit
10 % on the set's. It is PRINTED, never applied: the grade on him is Fendi's call (his pixels are graded, never redrawn).
Thresholds below are DECISION starting points (13-14 Nov 2026), to be re-set on shots Fendi approves; they are not
derived from a benchmark yet. The metric shares no threshold with any fix script."""
import argparse, json, os, subprocess, sys
os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
import numpy as np, cv2

LIMITS = dict(black_stops=0.5, white_stops=0.5, shadow_tint=4.0, light_tint=6.0, saturation=(0.75, 1.33),
              noise=(0.7, 1.4), sharpness=(0.7, 1.4))

def lin(s): return np.where(s <= 0.04045, s / 12.92, ((np.clip(s, 0, None) + 0.055) / 1.055) ** 2.4)

def read(path, frame, alpha=False):
    """float32 RGB linear (or one alpha channel), plus the frame index used."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr"):
        im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        assert im is not None, path
        if alpha:
            if im.ndim == 3 and im.shape[2] == 4: a = im[..., 3]
            elif im.ndim == 3: a = im[..., 1]
            else: a = im
            a = a.astype(np.float32); return (a / (255.0 if a.max() > 1.5 else 1.0) if a.dtype != np.uint16 else a / 65535.0), 0
        rgb = im[..., :3][..., ::-1].astype(np.float32)
        if ext == ".exr": return rgb, 0
        return lin(rgb / (65535.0 if im.dtype == np.uint16 else 255.0)), 0
    n = int(subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                            "stream=nb_read_packets", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip() or 1)
    f = n // 2 if frame is None else frame
    wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of",
                         "csv=p=0", path], capture_output=True, text=True).stdout.strip().split(",")
    w, h = int(wh[0]), int(wh[1])
    b = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"select=eq(n\\,{f})", "-vframes", "1", "-f",
                        "rawvideo", "-pix_fmt", "gray" if alpha else "rgb24", "-"], capture_output=True).stdout
    assert len(b) == w * h * (1 if alpha else 3), f"frame {f} of {path} not read"
    im = np.frombuffer(b, np.uint8).reshape((h, w) if alpha else (h, w, 3)).astype(np.float32) / 255.0
    return (im if alpha else lin(im)), f

def lab(rgb_lin):
    s = np.where(rgb_lin <= 0.0031308, rgb_lin * 12.92, 1.055 * np.power(np.clip(rgb_lin, 0, None), 1 / 2.4) - 0.055)
    return cv2.cvtColor(np.clip(s, 0, 1).astype(np.float32), cv2.COLOR_RGB2Lab)

def measure(img, a, ring_px=60):
    h, w = a.shape
    if img.shape[:2] != (h, w): img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
    core = cv2.erode((a > 0.95).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    near = cv2.dilate((a > 0.05).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    k = 2 * ring_px + 1
    ring = (cv2.dilate((a > 0.05).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) > 0) & ~near
    st = ~near
    assert core.sum() > 500 and ring.sum() > 500, "matte too small or covers the frame"
    Y = img @ np.array([0.2126, 0.7152, 0.0722], np.float32); L = lab(img)
    pct = lambda m, q: float(np.percentile(Y[m], q))
    stops = lambda x, y: float(np.log2(max(x, 1e-5) / max(y, 1e-5)))
    def tint(m, lo, hi):
        sel = m & (Y >= pct(m, lo)) & (Y <= pct(m, hi)); return L[sel][:, 1:].mean(0), img[sel].mean(0)
    hs, hs_rgb = tint(core, 0, 10); ss, ss_rgb = tint(st, 0, 10)
    hl, hl_rgb = tint(core, 90, 99); rl, rl_rgb = tint(ring, 90, 99)
    chroma = np.hypot(L[..., 1], L[..., 2])
    g = Y ** (1 / 2.2)                                   # grain and edges are judged as the eye sees them
    hp = np.abs(g - cv2.medianBlur((g * 255).astype(np.uint8), 3).astype(np.float32) / 255)
    lap = np.abs(cv2.Laplacian(g, cv2.CV_32F, ksize=3))
    var = cv2.blur(g * g, (15, 15)) - cv2.blur(g, (15, 15)) ** 2
    def flat_noise(m):
        v = var[m]; return float(hp[m][v <= np.percentile(v, 20)].std())
    def sharp(m):
        return float(np.percentile(lap[m], 95) / max(np.percentile(g[m], 95) - np.percentile(g[m], 5), 1e-3))
    # match grade: out = his * gain + lift, per channel, so his shadow and lit means land on the set's
    gain = (rl_rgb - ss_rgb) / np.maximum(hl_rgb - hs_rgb, 1e-5); lift = ss_rgb - hs_rgb * gain
    r = dict(black_stops=stops(pct(core, 1), pct(st, 1)), white_stops=stops(pct(core, 99), pct(ring, 99)),
             shadow_tint=float(np.linalg.norm(hs - ss)), light_tint=float(np.linalg.norm(hl - rl)),
             saturation=float(np.median(chroma[core]) / max(np.median(chroma[ring]), 1e-3)),
             noise=flat_noise(core) / max(flat_noise(st), 1e-5), sharpness=sharp(core) / max(sharp(ring), 1e-5),
             shadow_ab_him=[round(float(v), 1) for v in hs], shadow_ab_set=[round(float(v), 1) for v in ss],
             light_ab_him=[round(float(v), 1) for v in hl], light_ab_ring=[round(float(v), 1) for v in rl],
             match_grade_rgb=dict(gain=[float(v) for v in gain], lift=[float(v) for v in lift]))
    r["flags"] = [k for k, lim in LIMITS.items() if (abs(r[k]) > lim if not isinstance(lim, tuple) else not lim[0] <= r[k] <= lim[1])]
    return r

def report(r):
    rows = [("black point (stops, him - set)", "black_stops"), ("white point (stops, him - ring)", "white_stops"),
            ("shadow tint (Lab ab distance)", "shadow_tint"), ("light tint (Lab ab distance)", "light_tint"),
            ("saturation (him / ring)", "saturation"), ("noise (him / set)", "noise"), ("sharpness (him / ring)", "sharpness")]
    for name, k in rows:
        lim = LIMITS[k]; lims = f"{lim[0]}..{lim[1]}" if isinstance(lim, tuple) else f"<= {lim}"
        print(f"  {name:34s} {r[k]:+7.2f}   limit {lims:10s} {'OFF' if k in r['flags'] else 'ok'}")
    print(f"  shadows ab him {r['shadow_ab_him']} set {r['shadow_ab_set']}; light ab him {r['light_ab_him']} ring {r['light_ab_ring']}")
    print(f"  match grade (linear, per R,G,B; printed, not applied): gain {[round(v, 3) for v in r['match_grade_rgb']['gain']]} lift {[round(v, 4) for v in r['match_grade_rgb']['lift']]}")
    print("RESULT", "IN THE SCENE (all within limits)" if not r["flags"] else "PASTED TELLS: " + ", ".join(r["flags"]))

def self_test():
    rs = np.random.default_rng(1); h, w = 400, 300
    tex = cv2.GaussianBlur(rs.random((h, w)).astype(np.float32), (0, 0), 3); tex = (tex - tex.min()) / (tex.max() - tex.min())
    base = np.stack([0.01 + 0.4 * tex, 0.01 + 0.3 * tex, 0.008 + 0.2 * tex], -1)      # one texture everywhere: a fair set
    def grain(im, s): return np.clip(im + rs.normal(0, s, im.shape[:2] + (1,)).astype(np.float32) * im, 0, None)
    a = np.zeros((h, w), np.float32); cv2.ellipse(a, (150, 200), (60, 140), 0, 0, 360, 1.0, -1)
    same = grain(base, 0.08)
    r = measure(same, a, 40); assert not r["flags"], r["flags"]
    pasted = same.copy(); m = a > 0
    pasted[m] = base[m] * 0.8 + np.array([0.02, 0.02, 0.06], np.float32)     # lifted, blue blacks, no grain
    r = measure(pasted, a, 40)
    assert {"shadow_tint", "noise"} <= set(r["flags"]), r["flags"]
    lifted = same.copy(); lifted[m] = same[m] * 0.5 + 0.15                     # milky blacks, the classic paste-up
    assert "black_stops" in measure(lifted, a, 40)["flags"]
    print("self-test ok")

if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test(); raise SystemExit
    ap = argparse.ArgumentParser(); ap.add_argument("final"); ap.add_argument("matte")
    ap.add_argument("--frame", type=int); ap.add_argument("--ring", type=int, default=60); ap.add_argument("--json")
    A = ap.parse_args()
    img, f = read(A.final, A.frame); a, _ = read(A.matte, f, alpha=True)
    r = measure(img, a, A.ring); r["frame"] = f
    print(f"{A.final} frame {f}"); report(r)
    if A.json: json.dump(r, open(A.json, "w"), indent=1)
