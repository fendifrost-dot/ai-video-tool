#!/usr/bin/env python3
"""
LOOK FINGERPRINT — measure a clip's photographic look and its distance to a reference bank (deterministic, $0).

  build the bank:   python3 scripts/qa/look_fingerprint.py build --clip refs/a.mp4 refs/b.mp4 … --out qa/look_bank.json [--label "Fendi bar 2026-10-01"]
  score a clip:     python3 scripts/qa/look_fingerprint.py score --clip out/x.mp4 [out/y.mp4 …] --bank qa/look_bank.json [--out qa/x_look.json]

Why: the realism judge answers "does this read as photographed"; it passed every clip in the artist's reference
bank AND a Kling street plate the artist would throw out on sight. What the bank's clips share, and the plate
lacks, is a LOOK — film grain in the real band, rich saturation, low-key exposure that never clips white,
compressed highlights, warm bias, a cinema frame. Those are measurable per frame without any model, so they
become a third axis beside realism (judge) and identity: `look_distance`, a z-score distance to the bank.

Metrics (median over sampled frames, computed at 640 px wide):
  grain      std of the residual after a 3×3 median, in flat regions (|Laplacian of blurred| < 4) — film/sensor grain
  sat        mean HSV saturation
  luma       mean grey level (exposure key)
  contrast   p95 − p5 of grey (tonal range actually used)
  hi_clip    fraction of pixels ≥ 245 (clipped whites)
  lo_crush   fraction of pixels ≤ 10 (crushed blacks)
  warm       mean Lab b − 128 (+ = warm)
  tint       128 − mean Lab a (+ = green, − = magenta)
  aspect     width / height
  fps        container frame rate
The bank stores each metric's mean and std over its clips; a scored clip gets per-metric z and
look_distance = RMS of the z's over the tonal metrics (grain, sat, luma, contrast, hi_clip, lo_crush, warm, tint).
Nothing here knows a project: the bank is whatever clips the caller names.
"""
import argparse, json, sys
import cv2, numpy as np

TONAL = ["grain", "sat", "luma", "contrast", "hi_clip", "lo_crush", "warm", "tint"]


def fingerprint(path, n=24, width=640):
    c = cv2.VideoCapture(path); N = int(c.get(cv2.CAP_PROP_FRAME_COUNT)); fps = c.get(cv2.CAP_PROP_FPS) or 0.0
    W = int(c.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(c.get(cv2.CAP_PROP_FRAME_HEIGHT)); rows = []
    for i in np.linspace(0, max(0, N - 2), n).astype(int):
        c.set(cv2.CAP_PROP_POS_FRAMES, int(i)); ok, f = c.read()
        if not ok: continue
        f = cv2.resize(f, (width, max(1, int(width * H / W))), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV); lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)
        med = cv2.medianBlur(g.astype(np.uint8), 3).astype(np.float32); grad = cv2.Laplacian(cv2.GaussianBlur(g, (5, 5), 0), cv2.CV_32F)
        flat = np.abs(grad) < 4; grain = float(np.std((g - med)[flat])) if flat.sum() > 1000 else float("nan")
        p5, p95 = np.percentile(g, [5, 95])
        rows.append(dict(grain=grain, sat=float(hsv[:, :, 1].mean()), luma=float(g.mean()), contrast=float(p95 - p5), hi_clip=float((g >= 245).mean()), lo_crush=float((g <= 10).mean()), warm=float(lab[:, :, 2].mean() - 128), tint=float(128 - lab[:, :, 1].mean())))
    c.release()
    if not rows: raise SystemExit(f"no frames read from {path}")
    m = {k: float(np.nanmedian([r[k] for r in rows])) for k in rows[0]}
    m.update(aspect=round(W / H, 3), fps=round(fps, 2), frame=f"{W}x{H}", frames_sampled=len(rows)); return m


def build(clips, out, label):
    fps_ = {p: fingerprint(p) for p in clips}
    bank = {"label": label, "clips": fps_, "stats": {}}
    for k in TONAL + ["aspect", "fps"]:
        v = np.array([f[k] for f in fps_.values()], float); bank["stats"][k] = {"mean": float(np.nanmean(v)), "std": float(max(np.nanstd(v), 1e-6)), "min": float(np.nanmin(v)), "max": float(np.nanmax(v))}
    json.dump(bank, open(out, "w"), indent=1); return bank


def score(path, bank, floor=None):
    """z per metric against the bank; the std floor keeps a tight bank from flagging trivia (defaults: 10 % of the mean or 0.5 units)."""
    f = fingerprint(path); z = {}
    for k in TONAL:
        s = bank["stats"][k]; sd = max(s["std"], (floor or {}).get(k, max(0.1 * abs(s["mean"]), 0.5))); z[k] = round((f[k] - s["mean"]) / sd, 2)
    dist = float(np.sqrt(np.mean([z[k] ** 2 for k in TONAL])))
    far = sorted(((abs(z[k]), k) for k in TONAL), reverse=True)[:3]
    return {"clip": path, "metrics": f, "z": z, "look_distance": round(dist, 2), "furthest": [k for _, k in far], "aspect_in_bank": bool(bank["stats"]["aspect"]["min"] - 0.05 <= f["aspect"] <= bank["stats"]["aspect"]["max"] + 0.05)}


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build"); b.add_argument("--clip", nargs="+", required=True); b.add_argument("--out", required=True); b.add_argument("--label", default="reference bank")
    s = sub.add_parser("score"); s.add_argument("--clip", nargs="+", required=True); s.add_argument("--bank", required=True); s.add_argument("--out", default=None)
    a = ap.parse_args()
    if a.cmd == "build":
        bank = build(a.clip, a.out, a.label)
        for k in TONAL + ["aspect", "fps"]: print(f"{k:9s} mean {bank['stats'][k]['mean']:8.2f}  std {bank['stats'][k]['std']:6.2f}  [{bank['stats'][k]['min']:.2f}, {bank['stats'][k]['max']:.2f}]")
    else:
        bank = json.load(open(a.bank)); reports = [score(p, bank) for p in a.clip]
        for r in reports: print(f"{r['clip'].split('/')[-1]:40s} look_distance {r['look_distance']:5.2f}  furthest {', '.join(r['furthest'])}  aspect_in_bank {r['aspect_in_bank']}")
        if a.out: json.dump({"bank": a.bank, "reports": reports}, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
