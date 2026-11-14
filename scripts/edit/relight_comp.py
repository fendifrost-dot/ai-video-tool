"""Relight him inside a finished set shot so the set's light falls on him, by a smooth gain on his own pixels. $0.
usage: relight_comp.py <final.mp4> <plate.mov> <matte.mov> <out.mp4> --set hyenas_set.json --rows TOP,FEET --x CENTRE
                       [--normals DIR] [--strength 1.0] [--smooth 5] [--song master.wav --t0 S] [--still FRAME out.png]
  final   the shot as built (him + creature over the set; hyenas_set_build.py + hyenas_set_comp.py)
  plate   the same set without them (--passes plate, finished the same way), frame for frame
  matte   where they are in the final frame (--passes matte), frame for frame
  --rows TOP,FEET  his cap top and shoe bottom rows in the final frame; --x his centre column (both measured once on
                   a middle frame of the matte; they place him in metres: cap top 1.95 m, his height 6 ft 3)
  --normals DIR    Beeble VFX Pass Generator Normal frames of the same frames (object space, OpenGL). Without it the
                   normals are built from the matte (an inflated silhouette): the light gets his outline and the side
                   each part faces, not the folds of his clothes

The light on him (S) is made from the set itself, so it changes as the set's light does:
  ground bounce  the plate below his feet (the lit dirt), on the parts that face down and toward the camera
  left / right   the plate beside him at his height (the flares' glow, the smoke), on the parts that face that side
  above, front   the plate above him and the plate's overall level
  flares         the set's flares (hyenas_set.json) as points behind him: a rim on the edges that turn to them
His pixels are then multiplied by S, normalised so his median brightness stays where it was (the grade sets the level;
this sets the colour and the direction), blurred by --smooth px so it carries light and no detail. His face and
mouth are graded, never redrawn; the gain's sharpness is printed as proof. The creature in the matte is lit the same way.
Status: CANDIDATE (gap G8). The matte normals are the stand-in until Beeble's passes are in."""
import argparse, json, math, os, subprocess, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from relight_from_passes import lin, srgb, blur, FLARE

def frames(path, w, h, gray=False):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "gray16le" if gray else "rgb48le", "-"],
                          stdout=subprocess.PIPE)
    n = w * h * (2 if gray else 6)
    while len(b := pr.stdout.read(n)) == n:
        a = np.frombuffer(b, np.uint16).astype(np.float32) / 65535.0
        yield a.reshape((h, w) if gray else (h, w, 3))

def matte_normals(a, radius):
    """An inflated silhouette: +X right, +Y up, +Z toward the camera."""
    core = (a > 0.5).astype(np.uint8)
    d = blur(cv2.distanceTransform(core, cv2.DIST_L2, 5), 2.0)
    gx = cv2.Sobel(d, cv2.CV_32F, 1, 0, ksize=5); gy = cv2.Sobel(d, cv2.CV_32F, 0, 1, ksize=5)
    g = np.maximum(np.hypot(gx, gy), 1e-4)
    t = np.clip(d / radius, 0, 1); nz = np.sqrt(1 - (1 - t) ** 2); s = np.sqrt(np.clip(1 - nz * nz, 0, 1))
    return np.dstack([-gx / g * s, gy / g * s, nz]).astype(np.float32)        # image y runs down: up = -gy

def env(plate_lin, a, rows, xc, w):
    """The set's light around him, from the plate (linear RGB means)."""
    top, feet = rows; h = plate_lin.shape[0]; half = int(0.35 * (feet - top))
    out = lambda y0, y1, x0, x1: plate_lin[max(0, y0):min(h, y1), max(0, x0):min(w, x1)].reshape(-1, 3).mean(0)
    return dict(below=out(feet, feet + 300, xc - 250, xc + 250), left=out(top, feet, xc - half - 260, xc - half),
                right=out(top, feet, xc + half, xc + half + 260), above=out(top - 300, top, xc - 250, xc + 250),
                front=plate_lin.reshape(-1, 3).mean(0))

def light(N, envs, P, lights, scale):
    up = np.clip(N[..., 1:2], 0, None); down = np.clip(-N[..., 1:2], 0, None)
    lt = np.clip(-N[..., 0:1], 0, None); rt = np.clip(N[..., 0:1], 0, None); fr = np.clip(N[..., 2:3], 0, None)
    S = down * envs["below"] + up * envs["above"] + lt * envs["left"] + rt * envs["right"] + fr * envs["front"]
    # the flares behind him, in the set's metres (camera space: x right, y up, z toward the camera)
    for L in lights:
        D = np.array([L["pos"][0], L["pos"][2], -L["pos"][1]], np.float32) - P
        d2 = np.maximum((D * D).sum(-1, keepdims=True), 0.05)
        ndl = np.clip((N * D).sum(-1, keepdims=True) / np.sqrt(d2), 0, None)
        S += np.array(L.get("colour", FLARE), np.float32) * L["power"] / (4 * math.pi) * ndl / d2 * scale
    return S

def main():
    ap = argparse.ArgumentParser()
    for x in ("final", "plate", "matte", "out"): ap.add_argument(x)
    ap.add_argument("--set", required=True); ap.add_argument("--rows", required=True); ap.add_argument("--x", type=float, required=True)
    ap.add_argument("--normals"); ap.add_argument("--strength", type=float, default=1.0); ap.add_argument("--smooth", type=float, default=5.0)
    ap.add_argument("--flare_scale", type=float, default=0.002, help="the flares' share against the plate's light (DECISION, by measure)")
    ap.add_argument("--studio", help="his real lights, kept as the key: 'room' = the 14 Nov room (two LEDs at his front right, "
                    "1.07 m, 1.96 and 2.13 m high; one near the camera, 2.75 m, 1.88 m high) or 'dx,dz,h,power;...' in metres from him "
                    "(dx + = his left, dz + = toward the camera)")
    ap.add_argument("--studio_share", type=float, default=0.85, help="share of the light on him that stays his own white light")
    ap.add_argument("--env_weight", type=float, default=0.25, help="weight of the set's broad glow (dirt, sides) against its flares")
    ap.add_argument("--denoise", type=float, default=0.0, help="take the phone's grain off him (NL-means strength, 0 = off)")
    ap.add_argument("--regrain", type=float, default=0.0, help="then the set's own grain on him (hyenas_set_comp.py: 0.016)")
    ap.add_argument("--rows_frame", type=int, default=28, help="the frame --rows and --x were measured on")
    ap.add_argument("--fixed", action="store_true", help="do not follow the push-in (rows and x as given on every frame)")
    ap.add_argument("--song"); ap.add_argument("--t0", type=float, default=0.0)
    ap.add_argument("--still", nargs=2, metavar=("FRAME", "PNG"))
    A = ap.parse_args()
    SET = json.load(open(A.set)); TC = SET["take_camera"]
    top, feet = (int(v) for v in A.rows.split(",")); ppm = (feet - top) / 1.95
    w, h = (int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                             "-of", "csv=p=0", A.final], capture_output=True, text=True).stdout.strip().split(","))
    his_x = -(540 - TC["his_x_px"]) / TC["focal_px"] * TC["his_distance"] * 0.9 / math.cos(math.radians(-TC["pitch_deg"]))
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    track = not A.fixed
    if track:   # his width under the cap at the frame the rows were measured on (--rows_frame) is the scale's reference
        for j, a0 in enumerate(frames(A.matte, w, h, gray=True)):
            if j == A.rows_frame: break
        ys, xs = np.nonzero(a0 > 0.5); band = ys < ys.min() + 0.25 * (feet - top)
        w_ref = np.percentile(xs[band], 95) - np.percentile(xs[band], 5)
    lights = [dict(pos=[f["pos"][0], f["pos"][1], 0.25], colour=list(FLARE), power=f["power"]) for f in SET.get("flares", [])]
    studio = []
    if A.studio:
        spec = "-0.76,0.76,1.96,100;-0.61,0.76,2.13,100;0.10,2.75,1.88,100" if A.studio == "room" else A.studio
        for it in spec.split(";"):
            dx, dz, hh, pw = (float(t) for t in it.split(","))
            studio.append(dict(pos=[his_x + dx, TC["his_distance"] - dz, hh], colour=[1.0, 1.0, 1.0], power=pw))
    nfiles = sorted(os.listdir(A.normals)) if A.normals else None
    only = int(A.still[0]) if A.still else None
    enc = None
    if not A.still:
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{w}x{h}", "-r", "24", "-i", "-"]
        nfr = int(subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets",
                                  "-of", "csv=p=0", A.final], capture_output=True, text=True).stdout.strip())
        if A.song: cmd += ["-ss", f"{A.t0:.4f}", "-t", f"{nfr / 24:.4f}", "-i", A.song, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k"]
        cmd += ["-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", A.out]
        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    worst = 0.0; i = -1
    for i, (F, Pl, a) in enumerate(zip(frames(A.final, w, h), frames(A.plate, w, h), frames(A.matte, w, h, gray=True))):
        if only is not None and i != only: continue
        if A.denoise > 0:                                      # the phone's grain off him (only inside his box; the set keeps its own)
            ys0, xs0 = np.nonzero(a > 0.02)
            y0, y1, x0, x1 = max(0, ys0.min() - 8), ys0.max() + 9, max(0, xs0.min() - 8), xs0.max() + 9
            crop = (np.clip(F[y0:y1, x0:x1], 0, 1) * 255 + 0.5).astype(np.uint8)
            dn = cv2.fastNlMeansDenoisingColored(crop, None, A.denoise, A.denoise, 5, 15).astype(np.float32) / 255
            F = F.copy(); w8 = a[y0:y1, x0:x1, None]
            F[y0:y1, x0:x1] = F[y0:y1, x0:x1] * (1 - w8) + dn * w8
        Fl, Pll = lin(F), lin(Pl); aa = a[..., None]
        him = np.clip((Fl - Pll * (1 - aa)) / np.maximum(aa, 1e-3), 0, None)              # his pixels, un-premultiplied
        if track:                                              # follow the camera's push-in: his cap top and width per frame
            ys, xs = np.nonzero(a > 0.5); t_i = int(ys.min())
            band = (ys < t_i + 0.25 * (feet - top)); w_i = np.percentile(xs[band], 95) - np.percentile(xs[band], 5)
            k = w_i / w_ref; tp, ft, xc = t_i, t_i + (feet - top) * k, float(np.median(xs[band]))
        else:
            tp, ft, xc = top, feet, A.x
        ppm_i = (ft - tp) / 1.95
        P = np.dstack([his_x + (u - xc) / ppm_i, (ft - v) / ppm_i, np.full_like(u, -TC["his_distance"])])
        if nfiles:
            nm = cv2.imread(os.path.join(A.normals, nfiles[i]), cv2.IMREAD_UNCHANGED)[..., :3][..., ::-1].astype(np.float32)
            N = cv2.resize(nm / (65535.0 if nm.max() > 255 else 255.0), (w, h)) * 2 - 1
        else:
            N = matte_normals(a, radius=0.12 * ppm_i)
        E = env(Pll, a, (int(tp), int(ft)), int(xc), w)
        m = a > 0.5
        mb = lambda x: blur(x * m[..., None], A.smooth) / np.maximum(blur(m.astype(np.float32), A.smooth), 1e-3)[..., None]
        Y = lambda x: x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        if studio:
            # his own white light stays the key (it is already in his pixels); the set's light is ADDED to it:
            # gain = (studio + set) / studio, so where his key falls the picture barely moves and the set's red shows
            # where his lights did not reach (the side away from the key, the edges that turn to a flare)
            Es = {k2: v2 * A.env_weight for k2, v2 in E.items()}; Es["front"] = Es["front"] * 0
            S_sc = light(N, Es, P, lights, A.flare_scale)
            S_st = light(N, {k2: np.zeros(3, np.float32) for k2 in E}, P, studio, 1.0)
            S_st += 0.15 * np.median(Y(S_st)[m])                                           # the room's own bounce: no zero
            r = np.median(Y(S_sc)[m]) / max(np.median(Y(S_st)[m]), 1e-9)
            kst = r * A.studio_share / max(1 - A.studio_share, 1e-6)                        # studio share of the median light
            g = mb((kst * S_st + S_sc) / (kst * S_st))
        else:
            g = mb(light(N, E, P, lights, A.flare_scale))
        g = g / np.maximum(np.median(Y(g)[m]), 1e-6)                                         # keep his level, take the colour and direction
        g = g ** A.strength
        relit = him * g
        relit *= np.median(Y(him)[m]) / max(np.median(Y(relit)[m]), 1e-6)
        if A.regrain > 0:                                      # one grain on him, the set's own (hyenas_set_comp.py), in sRGB
            rs = np.random.default_rng(7000 + i); sr = srgb(np.clip(relit, 0, None))
            n = rs.normal(0, A.regrain, sr.shape[:2] + (1,)).astype(np.float32) + rs.normal(0, A.regrain * 0.4, sr.shape).astype(np.float32)
            sr = sr + n * (0.35 + 0.65 * (1 - np.clip(sr.mean(-1, keepdims=True), 0, 1)))
            relit = lin(np.clip(sr, 0, 1))
        out = Pll * (1 - aa) + relit * aa
        lg = np.log(np.maximum(Y(g), 1e-4)); sharp = np.percentile((np.abs(cv2.Sobel(lg, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(lg, cv2.CV_32F, 0, 1)))[m], 99)
        worst = max(worst, float(sharp))
        o16 = (np.clip(srgb(out), 0, 1) * 65535 + 0.5).astype(np.uint16)
        if A.still:
            cv2.imwrite(A.still[1], o16[..., ::-1]); print("wrote", A.still[1]); break
        enc.stdin.write(o16.tobytes())
    if enc: enc.stdin.close(); enc.wait(); print("wrote", A.out, i + 1, "frames")
    print(f"gain sharpness p99 {worst:.3f} (a smooth light; his pixels are multiplied, never redrawn)")

if __name__ == "__main__":
    main()
