#!/usr/bin/env python3
"""
MATCH GRADE — restore a source clip's colour grade on a video-to-video result (deterministic, $0).

  python3 scripts/edit/match_grade.py --source cuts/S06_master.mp4 --result genjutsu/S06_swap.mp4 --out genjutsu/S06_swap_graded.mp4 \\
      [--exclude-box x0,y0,x1,y1 …] [--samples 12] [--crf 16]

A video-to-video model (Genjutsu object-swap, Aleph, …) returns the same picture with a different tone curve: the
scene is structurally identical, only the grade moved. Because the untouched regions are the same picture in both
clips, they give a paired sample of (result colour → source colour) at every pixel. This script fits one monotone
per-channel LUT (histogram specification over the paired region, smoothed) on `--samples` time-aligned frames,
excluding any boxes the caller knows were regenerated (the garment), and applies that LUT to every frame of the
result. The result's resolution, fps and length are kept; audio is taken from the source (the model's output has
none and the song clock lives in the source).

Nothing here knows a shot, a project or a provider: inputs are two clips and optional exclusion boxes in the
result's pixel space.
"""
import argparse, json, os, subprocess, sys, tempfile
import cv2, numpy as np


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", path], capture_output=True, text=True, check=True).stdout
    j = json.loads(out); s = j["streams"][0]; n, d = s["r_frame_rate"].split("/"); return int(s["width"]), int(s["height"]), float(n) / float(d), float(j["format"]["duration"])


def frame_at(path, t, size):
    c = cv2.VideoCapture(path); c.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, f = c.read(); c.release()
    return cv2.resize(f, size, interpolation=cv2.INTER_AREA) if ok else None


def fit_time_scale(source, result, size=(180, 320)):
    """result_t = a * source_t + b, from nearest-frame matching on the central (moving) region, grade-normalised."""
    def load(path):
        c = cv2.VideoCapture(path); fps = c.get(cv2.CAP_PROP_FPS) or 24.0; fr = []
        while True:
            ok, f = c.read()
            if not ok: break
            g = cv2.GaussianBlur(cv2.cvtColor(cv2.resize(f, size, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32), (5, 5), 0)
            g = g[size[1] // 5: size[1] * 15 // 16, size[0] // 9: size[0] * 8 // 9]; fr.append((g - g.mean()) / (g.std() + 1e-6))
        return np.array(fr), fps
    S, fs = load(source); R, fr = load(result)
    pairs = []
    for i in range(len(R)):
        d = ((S - R[i]) ** 2).mean(axis=(1, 2)); pairs.append((i / fr, int(d.argmin()) / fs))
    pairs = np.array(pairs); a_, b_ = np.polyfit(pairs[:, 1], pairs[:, 0], 1)
    resid = float(np.abs(pairs[:, 0] - (a_ * pairs[:, 1] + b_)).mean())
    return float(a_), float(b_), resid, fs


def fit_lut(pairs_src, pairs_res):
    """Per-channel monotone LUT by histogram specification on the paired pixels (result → source)."""
    luts = np.zeros((3, 256), np.uint8)
    for ch in range(3):
        hs = np.bincount(pairs_src[:, ch], minlength=256).astype(np.float64); hr = np.bincount(pairs_res[:, ch], minlength=256).astype(np.float64)
        cs = np.cumsum(hs) / hs.sum(); cr = np.cumsum(hr) / hr.sum()
        lut = np.interp(cr, cs, np.arange(256))                       # value v in result → source value with the same CDF rank
        lut = np.convolve(np.pad(lut, 4, mode="edge"), np.ones(9) / 9, mode="valid")   # smooth the staircase
        luts[ch] = np.clip(np.maximum.accumulate(lut), 0, 255).astype(np.uint8)
    return luts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True); ap.add_argument("--result", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--exclude-box", action="append", default=[], help="x0,y0,x1,y1 in the result's pixels; repeatable (regenerated regions to leave out of the fit)")
    ap.add_argument("--samples", type=int, default=12); ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--retime", default="auto", help="auto = fit the time scale from frame matching; a number = use that scale; none = keep the result's timing")
    a = ap.parse_args()
    W, H, fps, dur = probe(a.result); _, _, _, sdur = probe(a.source); L = min(dur, sdur)
    mask = np.ones((H, W), bool)
    for b in a.exclude_box:
        x0, y0, x1, y1 = [int(v) for v in b.split(",")]; mask[y0:y1, x0:x1] = False
    S = []; R = []
    for t in np.linspace(0.15 * L, 0.85 * L, a.samples):
        s = frame_at(a.source, t, (W, H)); r = frame_at(a.result, t, (W, H))
        if s is None or r is None: continue
        # keep only pixels where the two frames agree structurally (edges within a few px): a gradient-magnitude gate
        gs = cv2.Laplacian(cv2.cvtColor(s, cv2.COLOR_BGR2GRAY), cv2.CV_32F); gr = cv2.Laplacian(cv2.cvtColor(r, cv2.COLOR_BGR2GRAY), cv2.CV_32F)
        agree = (np.abs(gs - gr) < 12) & mask
        S.append(s[agree]); R.append(r[agree])
    S = np.concatenate(S); R = np.concatenate(R)
    if len(S) < 10000: raise SystemExit("too few paired pixels to fit a grade")
    luts = fit_lut(S, R)
    before = np.abs(S.astype(float) - R.astype(float)).mean(); after = np.abs(S.astype(float) - np.stack([luts[c][R[:, c]] for c in range(3)], 1).astype(float)).mean()
    tmp = tempfile.mkdtemp(prefix="avt_grade_"); raw = os.path.join(tmp, "graded.mp4")
    cap = cv2.VideoCapture(a.result); wr = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
    while True:
        ok, f = cap.read()
        if not ok: break
        wr.write(np.stack([luts[c][f[:, :, c]] for c in range(3)], 2))
    wr.release(); cap.release()
    retime = None
    if a.retime != "none":
        if a.retime == "auto":
            ta, tb, resid, sfps = fit_time_scale(a.source, a.result); retime = {"scale": round(ta, 5), "offset_s": round(tb, 3), "fit_residual_s": round(resid, 3), "source_fps": sfps}
        else:
            ta = float(a.retime); sfps = probe(a.source)[2]; retime = {"scale": ta, "offset_s": 0.0, "fit_residual_s": None, "source_fps": sfps}
    vf = f"setpts=PTS/{retime['scale']:.6f},fps={retime['source_fps']}" if retime and abs(retime["scale"] - 1.0) > 0.002 else "null"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-i", a.source, "-map", "0:v", "-map", "1:a?", "-vf", vf, "-c:v", "libx264", "-crf", str(a.crf), "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", a.out], check=True)
    json.dump({"source": a.source, "result": a.result, "out": a.out, "paired_pixels": int(len(S)), "mean_abs_diff_before": round(before, 2), "mean_abs_diff_after": round(after, 2), "retime": retime, "video_filter": vf, "lut": luts.tolist()}, open(a.out + ".grade.json", "w"))
    print(json.dumps({"paired_pixels": int(len(S)), "mean_abs_diff_before": round(before, 2), "mean_abs_diff_after": round(after, 2), "retime": retime, "vf": vf}))


if __name__ == "__main__":
    main()
