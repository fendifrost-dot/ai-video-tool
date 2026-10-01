#!/usr/bin/env python3
"""
GRADE TO BANK — push a clip's photographic look toward a reference bank's statistics (deterministic, $0).

  python3 scripts/edit/grade_to_bank.py --clip in.mp4 --bank qa/look_bank.json --out out.mp4 [--strength 1.0] [--aspect 4:3|bank|keep] [--grain bank|0.0] [--crf 16]

The bank (scripts/qa/look_fingerprint.py build) carries the mean exposure key, tonal range, saturation, warmth,
tint, grain and frame of the clips that define the bar. This script fits ONE global grade to the clip so its
own medians land on those means: a luma curve (gamma for the key, a soft shoulder so highlights roll off instead
of clipping, lifted or crushed toe to the bank's black fraction), a saturation gain, Lab a/b shifts for warmth
and tint, then grain added to the bank's level, and optionally a centre crop to the bank's aspect. `--strength`
scales every move (0 = untouched, 1 = land on the bank). Audio is copied. It is a look, not a repair: the
scene, lighting direction and lens stay what they were — a flat bright phone shot graded low-key will look
graded, not lit; the number says how far it still sits from the bar. Measured 2026-10-01: a flat bright closet take
moved 5.9 → 3.1 and read as a dark flat take; a night street plate moved 2.8 → 1.1 but over-saturated at full
strength — hence the default strength 0.7 and the saturation-gain cap. The upstream levers (lighting on set, the
look preamble in generation prompts) do what a grade cannot.
"""
import argparse, json, os, subprocess, sys, tempfile
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa"))
from look_fingerprint import fingerprint, score  # noqa: E402


def luma_curve(mean_in, p5_in, p95_in, mean_t, contrast_t, hi_t, strength):
    """Monotone 256-entry curve: gamma to move the mean, soft shoulder for highlights, scaled to the target range."""
    x = np.linspace(0, 1, 256)
    # 1. gamma that maps the input mean onto the target mean (blend by strength)
    mi, mt = max(mean_in, 1) / 255.0, max(mean_t, 1) / 255.0; g = np.log(mt) / np.log(mi) if 0 < mi < 1 else 1.0
    g = 1.0 + (g - 1.0) * strength; y = x ** g
    # 2. soft shoulder: compress the top so the target clipped fraction (≈ 0 for film) is honoured
    knee = 0.80; over = y > knee; y[over] = knee + (1 - knee) * np.tanh((y[over] - knee) / (1 - knee) * 1.6) / np.tanh(1.6) * (1 - 0.06 * strength)
    # 3. tonal range: scale about the mean toward the target p95−p5
    rng_in = max(p95_in - p5_in, 1) / 255.0; rng_t = contrast_t / 255.0; k = 1.0 + ((rng_t / rng_in) - 1.0) * 0.5 * strength
    y = mt + (y - mt) * k if strength > 0 else y
    return np.clip(np.maximum.accumulate(y), 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True); ap.add_argument("--bank", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--strength", type=float, default=0.7); ap.add_argument("--max-sat-gain", type=float, default=1.5); ap.add_argument("--aspect", default="keep"); ap.add_argument("--grain", default="bank"); ap.add_argument("--crf", type=int, default=16)
    a = ap.parse_args(); bank = json.load(open(a.bank)); S = bank["stats"]; st = a.strength
    before = fingerprint(a.clip); m = before
    # sample the clip's own percentiles for the curve
    cap = cv2.VideoCapture(a.clip); N = int(cap.get(7)); fps = cap.get(5); W = int(cap.get(3)); H = int(cap.get(4)); p5s = []; p95s = []
    for i in np.linspace(0, max(0, N - 2), 12).astype(int):
        cap.set(1, int(i)); ok, f = cap.read()
        if ok: g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); q = np.percentile(g, [5, 95]); p5s.append(q[0]); p95s.append(q[1])
    cap.release()
    curve = luma_curve(m["luma"], float(np.median(p5s)), float(np.median(p95s)), S["luma"]["mean"], S["contrast"]["mean"], S["hi_clip"]["mean"], st)
    lut = (curve * 255).astype(np.uint8)
    sat_gain = min(a.max_sat_gain, 1.0 + ((S["sat"]["mean"] / max(m["sat"], 1)) - 1.0) * st)
    b_shift = (S["warm"]["mean"] - m["warm"]) * st; a_shift = -(S["tint"]["mean"] - m["tint"]) * st
    grain_t = S["grain"]["mean"] if a.grain == "bank" else float(a.grain); grain_add = max(0.0, grain_t - m["grain"]) * st
    # crop
    tw, th = W, H
    if a.aspect != "keep":
        ar = S["aspect"]["mean"] if a.aspect == "bank" else (float(a.aspect.split(":")[0]) / float(a.aspect.split(":")[1]))
        if W / H > ar: tw = int(round(H * ar)) // 2 * 2
        else: th = int(round(W / ar)) // 2 * 2
    x0, y0 = (W - tw) // 2, (H - th) // 2
    tmp = tempfile.mkdtemp(prefix="avt_bank_"); raw = os.path.join(tmp, "graded.mp4"); wr = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (tw, th))
    cap = cv2.VideoCapture(a.clip); rng = np.random.default_rng(7)
    while True:
        ok, f = cap.read()
        if not ok: break
        f = f[y0:y0 + th, x0:x0 + tw]
        # luma curve applied in Lab L so hue holds, then chroma moves
        lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
        L = lab[:, :, 0]; lab[:, :, 0] = lut[np.clip(L, 0, 255).astype(np.uint8)].astype(np.float32)
        lab[:, :, 1] = np.clip(128 + (lab[:, :, 1] - 128) * sat_gain + a_shift, 0, 255); lab[:, :, 2] = np.clip(128 + (lab[:, :, 2] - 128) * sat_gain + b_shift, 0, 255)
        out = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
        if grain_add > 0:
            n = rng.normal(0, grain_add * 1.9, (th, tw, 1)).astype(np.float32)   # scaled so the 3×3-median residual lands near grain_t
            out = out + n
        wr.write(np.clip(out, 0, 255).astype(np.uint8))
    wr.release(); cap.release()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-i", a.clip, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", str(a.crf), "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", "-movflags", "+faststart", a.out], check=True)
    after = score(a.out, bank); b4 = score(a.clip, bank)
    side = {"clip": a.clip, "out": a.out, "strength": st, "aspect": a.aspect, "crop": [x0, y0, tw, th], "sat_gain": round(sat_gain, 3), "a_shift": round(a_shift, 2), "b_shift": round(b_shift, 2), "grain_added": round(grain_add, 3), "look_distance_before": b4["look_distance"], "look_distance_after": after["look_distance"], "z_before": b4["z"], "z_after": after["z"], "lut": lut.tolist()}
    json.dump(side, open(a.out + ".bank.json", "w"), indent=1)
    print(json.dumps({k: side[k] for k in ("look_distance_before", "look_distance_after", "sat_gain", "b_shift", "grain_added", "crop")}))


if __name__ == "__main__":
    main()
