"""Relight his REAL take to a built scene's lamps from Beeble's VFX passes, by a smooth gain on his own pixels. $0.
usage: relight_from_passes.py <fg_dir> <normal_dir> <basecolor_dir> <out_dir> --set hyenas_set.json
                              [--lights lights.json] [--ambient R,G,B] [--strength 1.0] [--smooth 6] [--exposure 0]
       relight_from_passes.py --self-test
  fg_dir         his frames as they go into the set (prep_performer.py p_0001.png ..., RGBA, straight alpha)
  normal_dir     Beeble VFX Pass Generator "Normal" frames, same size and order (object space, OpenGL: +X right,
                 +Y up, +Z toward the camera; Beeble docs, 14 Nov 2026)
  basecolor_dir  Beeble "BaseColor" frames (his colour with the light taken out, sRGB)
  --set          the scene params (hyenas_set.json): camera height, pitch and his distance place him; its flares are
                 the lamps unless --lights is given
  --lights       [{"pos": [x, y, z], "colour": [r, g, b], "power": W}, ...] in the set's metres (x right, y away from
                 the camera, z up; the camera at x 0, y 0)

Why a gain and not Beeble's own relit picture (Fendi's rules: his face and mouth are never redrawn; SwitchX redrew his
face on Hyenas, ledger row 29, and changed garments on YSL, row 58):
  light on him now   S_old = his picture / BaseColor, smoothed (the take's light, per channel)
  light in the set   S_new = sum over lamps of colour * power * max(0, N.L) / d^2, plus the scene's ambient
  out                = his picture * smooth(S_new / S_old) * 2^exposure        (in linear light)
The gain is blurred by --smooth px, so it carries light and its direction (brighter on the side facing a flare, a
red rim on the edges that turn to it) but no detail: no pixel of his face moves, his mouth's shapes are his. The
script prints the gain's own sharpness (p99 of its gradient) as proof. Every lamp is a point at its place, his surface
is his distance along the phone's rays (the passes have no metric depth we trust yet).

Status: CANDIDATE (gap G8, docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md). Not yet run on Beeble passes of his take;
the self-test relights a synthetic sphere and checks the result against the truth."""
import argparse, json, math, os, sys
import numpy as np, cv2

def lin(s): return np.where(s <= 0.04045, s / 12.92, ((np.clip(s, 0, None) + 0.055) / 1.055) ** 2.4)
def srgb(v): return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.clip(v, 0, None), 1 / 2.4) - 0.055)
blur = lambda x, s: cv2.GaussianBlur(x, (0, 0), s) if s > 0 else x
FLARE = (1.0, 0.36, 0.12)          # a road flare's colour (ESTIMATE; the set's flame shader uses a red-orange)

def read(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED); assert im is not None, p
    scale = 65535.0 if im.dtype == np.uint16 else 255.0 if im.dtype == np.uint8 else 1.0
    im = im.astype(np.float32) / scale
    if im.ndim == 2: im = im[..., None]
    rgb = im[..., :3][..., ::-1] if im.shape[2] >= 3 else np.repeat(im, 3, 2)
    a = im[..., 3] if im.shape[2] == 4 else np.ones(im.shape[:2], np.float32)
    return np.ascontiguousarray(rgb), a

def geometry(h, w, cam):
    """World position of each pixel on his surface (his distance along the phone's rays) and the camera->world
    rotation for normals, from the set's take_camera (the same model as hyenas_set_build.py)."""
    f = cam["focal_px"] * w / 1080.0; th = math.pi / 2 + math.radians(cam["pitch_deg"]); sn, cs = math.sin(th), math.cos(th)
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.stack([(u - w / 2) / f, -(v - h / 2) / f * cs + sn, -(v - h / 2) / f * sn - cs], -1)    # d . forward = 1
    t = cam["his_distance"] / np.maximum(d[..., 1], 1e-3)
    P = d * t[..., None]; P[..., 2] += cam["height"]
    # camera axes in the world: right = +x; up and toward-camera tilt with the pitch
    pitch = math.radians(cam["pitch_deg"])
    fwd = np.array([0, math.cos(pitch), math.sin(pitch)], np.float32)
    up = np.array([0, -math.sin(pitch), math.cos(pitch)], np.float32)
    R = np.stack([np.array([1, 0, 0], np.float32), up, -fwd], 1)        # columns: cam +X, +Y, +Z in the world
    return P.astype(np.float32), R

def shading(N_cam, P, R, lights, ambient):
    N = N_cam @ R.T; N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-4)
    S = np.broadcast_to(np.array(ambient, np.float32), N.shape).copy()
    for L in lights:
        D = np.array(L["pos"], np.float32) - P; d2 = np.maximum((D * D).sum(-1, keepdims=True), 0.05)
        ndl = np.clip((N * D).sum(-1, keepdims=True) / np.sqrt(d2), 0, None)
        S += np.array(L.get("colour", FLARE), np.float32) * L["power"] / (4 * math.pi) * ndl / d2
    return S

def relight(fg, alpha, normal, base, cam, lights, ambient, strength=1.0, smooth=6.0, exposure=0.0, P=None, R=None):
    h, w = alpha.shape
    if P is None: P, R = geometry(h, w, cam)
    m = (alpha > 0.5).astype(np.float32)[..., None]
    src = lin(fg); alb = np.maximum(lin(base), 0.02)
    N = normal * 2 - 1
    norm_blur = lambda x: blur(x * m, smooth) / np.maximum(blur(m, smooth), 1e-3)[..., None]     # smooth inside him only
    S_old = norm_blur(src / alb)
    S_new = shading(N, P, R, lights, ambient)
    g = S_new / np.maximum(S_old, 1e-4)
    # the take's overall level is kept (exposure moves it); only the light's shape and colour come from the set
    g /= np.exp(np.log(np.maximum(g, 1e-4))[m[..., 0] > 0].mean())
    g = norm_blur(g) ** strength * 2 ** exposure
    out = src * g
    grad = np.abs(cv2.Sobel(np.log(np.maximum(g.mean(-1), 1e-4)), cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(np.log(np.maximum(g.mean(-1), 1e-4)), cv2.CV_32F, 0, 1))
    return np.clip(srgb(out), 0, 1), g, float(np.percentile(grad[m[..., 0] > 0], 99))

def lamps_from_set(P):
    return [dict(pos=[f["pos"][0], f["pos"][1], 0.25], colour=list(FLARE), power=f["power"]) for f in P.get("flares", [])]

def self_test():
    """A textured sphere lit from the left (the 'take'), relit from the right with the true normals and albedo:
    the result must match a sphere rendered under the right lamp, up to the gain's blur."""
    h = w = 256; cam = dict(focal_px=1250 * 1080 / w, pitch_deg=0.0, height=1.0, his_distance=2.0)
    v, u = np.mgrid[0:h, 0:w].astype(np.float32); x = (u - w / 2) / 100; y = -(v - h / 2) / 100
    inside = (x * x + y * y) < 1; z = np.sqrt(np.clip(1 - x * x - y * y, 0, 1))
    N = np.stack([x, y, z], -1) * inside[..., None] + np.array([0, 0, 1], np.float32) * ~inside[..., None]
    rs = np.random.default_rng(3); tex = blur(rs.random((h, w)).astype(np.float32), 1.5)
    alb = np.stack([0.3 + 0.4 * tex, 0.25 + 0.3 * tex, 0.2 + 0.2 * tex], -1)
    P, R = geometry(h, w, cam)
    left = [dict(pos=[-3, 0.5, 1.0], colour=[1, 1, 1], power=60)]; right = [dict(pos=[3, 0.5, 1.0], colour=list(FLARE), power=60)]
    amb = [0.02, 0.02, 0.02]
    take = alb * shading(N, P, R, left, amb); truth = alb * shading(N, P, R, right, amb)
    out, g, sharp = relight(np.clip(srgb(take), 0, 1), inside.astype(np.float32), (N + 1) / 2, np.clip(srgb(alb), 0, 1), cam, right, amb,
                            smooth=2.0, P=P, R=R)
    o = lin(out); k = inside & (z > 0.5)
    scale = np.median(truth[k] / np.maximum(o[k], 1e-4))                 # the take's level is kept by design
    err = np.median(np.abs(o[k] * scale - truth[k]) / np.maximum(truth[k], 1e-3))
    side = (lin(out)[..., 0][k & (x > 0.4)].mean() > lin(out)[..., 0][k & (x < -0.4)].mean())
    hp = lambda im: (lambda L: L - blur(L, 3))(np.log(np.maximum(im[..., 1], 1e-4)))     # fine texture, light removed
    detail = np.corrcoef(hp(o)[k], hp(lin(np.clip(srgb(take), 0, 1)))[k])[0, 1]
    assert side, "the lit side did not move to the lamp's side"
    assert err < 0.15, f"relit sphere off the truth by {err:.3f}"
    assert detail > 0.85, f"texture not kept ({detail:.2f})"
    print(f"self-test ok: median error {err:.3f}, lit side moved to the lamp, texture kept (corr {detail:.2f}), gain p99 grad {sharp:.3f}")

if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test(); raise SystemExit
    ap = argparse.ArgumentParser()
    for a in ("fg_dir", "normal_dir", "basecolor_dir", "out_dir"): ap.add_argument(a)
    ap.add_argument("--set", required=True); ap.add_argument("--lights"); ap.add_argument("--ambient", default="0.004,0.003,0.003")
    ap.add_argument("--strength", type=float, default=1.0); ap.add_argument("--smooth", type=float, default=6.0)
    ap.add_argument("--exposure", type=float, default=0.0)
    A = ap.parse_args()
    SET = json.load(open(A.set)); cam = SET["take_camera"]
    lights = json.load(open(A.lights)) if A.lights else lamps_from_set(SET)
    amb = [float(v) for v in A.ambient.split(",")]
    lsd = lambda d: sorted(f for f in os.listdir(d) if f.lower().endswith((".png", ".exr", ".tif", ".tiff", ".jpg")))
    F, Nn, B = lsd(A.fg_dir), lsd(A.normal_dir), lsd(A.basecolor_dir)
    assert len(F) == len(Nn) == len(B), ("frame counts differ", len(F), len(Nn), len(B))
    os.makedirs(A.out_dir, exist_ok=True); P = R = None; worst = 0.0
    for i, (f, n, b) in enumerate(zip(F, Nn, B)):
        fg, a = read(os.path.join(A.fg_dir, f)); nm, _ = read(os.path.join(A.normal_dir, n)); bc, _ = read(os.path.join(A.basecolor_dir, b))
        h, w = a.shape
        nm = cv2.resize(nm, (w, h), interpolation=cv2.INTER_LINEAR); bc = cv2.resize(bc, (w, h), interpolation=cv2.INTER_AREA)
        if P is None: P, R = geometry(h, w, cam)
        out, g, sharp = relight(fg, a, nm, bc, cam, lights, amb, A.strength, A.smooth, A.exposure, P, R); worst = max(worst, sharp)
        rgba = np.dstack([out[..., ::-1], a]); cv2.imwrite(os.path.join(A.out_dir, f"p_{i + 1:04d}.png"), (rgba * 65535 + 0.5).astype(np.uint16))
    print(f"wrote {len(F)} frames to {A.out_dir}; lamps {len(lights)}; gain sharpness p99 {worst:.3f} (smooth light, no detail)")
