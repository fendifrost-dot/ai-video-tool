#!/usr/bin/env python3
"""
COMPOSITE VERIFY — hold a composite against the take it was cut from, and say which checks are arithmetic and
which are somebody's eye.

    python3 scripts/qa/composite_verify.py --run run/ --out run/verification.json

What it checks, all of it arithmetic over the files themselves:
  timing       frame count, rate and duration of the output against the cut, and against (end − start) × fps
  performance  the performer's pixels inside the matte, against the source. A composite must not touch them; this
               fits `out = gain × source + offset` over the matte core and reports both, so a grade nobody asked
               for shows up as a number instead of as a feeling
  matte        pieces of the room that travelled with him (components detached from his body), per frame
  stability    how much the matted area jumps between frames — a proxy for flicker
  colour       the output read the way a player reads an HD file — as BT.709 — against the frames that were
               blended. An encode that used another matrix, or left the file untagged, shows up here as a colour bias

What it does NOT check, and says so in the output: whether the lips match the words (no audio here, and lip sync is
a comparison against a performance, not a property of one file), whether the background's perspective and light are
plausible, and whether any of it LOOKS right. Those are visual judgements and are left to a person.
"""
import argparse, json, os, subprocess, sys

import numpy as np
from PIL import Image
from scipy import ndimage


def ffmpeg() -> str:
    import shutil
    return shutil.which("ffmpeg") or __import__("imageio_ffmpeg").get_ffmpeg_exe()


# every frame the file holds, once each (no resampling to a rate: a 29.97 file read at "30" gains a frame), read as
# BT.709 limited range — what the cut is tagged as, and what a player assumes of an HD file that does not say
AS_709 = "scale=in_color_matrix=bt709:in_range=tv,format=rgb24"


def frames_to(path: str, out_dir: str) -> int:
    os.makedirs(out_dir, exist_ok=True)
    if not os.listdir(out_dir):
        subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", path, "-vf", AS_709, "-fps_mode", "passthrough",
                        os.path.join(out_dir, "f_%05d.png")], check=True)
    return len([f for f in os.listdir(out_dir) if f.endswith(".png")])


def tags_of(path: str) -> str | None:
    out = subprocess.run([ffmpeg(), "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Video:" in line:
            return "bt709" if "bt709" in line else None
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, help="the directory composite_take.py wrote")
    ap.add_argument("--out", required=True)
    ap.add_argument("--leak-min", type=int, default=2000, help="a detached piece smaller than this is not counted")
    a = ap.parse_args()
    record = json.load(open(os.path.join(a.run, "record.json")))
    from fractions import Fraction
    fps = float(Fraction(record["cut"]["rate"])) if record.get("cut") else float(round(record["source"]["fps"]))
    matte = os.path.join(a.run, "matte")

    src_dir = os.path.join(a.run, "_verify_src")
    out_dir = os.path.join(a.run, "_verify_out")
    n_src = frames_to(os.path.join(a.run, "source_bt709.mp4"), src_dir)
    n_out = frames_to(os.path.join(a.run, "composite.mp4"), out_dir)
    n = min(n_src, n_out)

    # ── colour: does a player see what was blended? ─────────────────────────────────────────────────────────────
    blended = os.path.join(a.run, "frames")
    col_abs, col_bias = [], []
    for i in range(0, n, max(1, n // 12)):
        want = os.path.join(blended, f"c_{i:05d}.png")
        if not os.path.exists(want):
            continue
        w = np.asarray(Image.open(want).convert("RGB")).astype(np.float32)
        g = np.asarray(Image.open(os.path.join(out_dir, f"f_{i + 1:05d}.png")).convert("RGB")).astype(np.float32)
        # the coloured pixels are where a wrong matrix shows; greys survive any matrix
        sat = (w.max(axis=2) - w.min(axis=2)) > 40
        col_abs.append(float(np.abs(g - w).mean()))
        if sat.sum() > 2000:
            col_bias.append(np.abs((g - w)[sat]).mean(axis=0))
    sat_err = float(np.mean(col_bias)) if col_bias else None
    tagged = tags_of(os.path.join(a.run, "composite.mp4"))

    # ── performance: are his pixels still his? ──────────────────────────────────────────────────────────────────
    gains, offsets, resid = [], [], []
    for i in range(0, n, max(1, n // 15)):
        al = np.asarray(Image.open(os.path.join(matte, f"alpha_{i:05d}.png")).convert("L")).astype(np.float32) / 255.0
        core = ndimage.binary_erosion(al > 0.98, iterations=4)
        if core.sum() < 5000:
            continue
        s = np.asarray(Image.open(os.path.join(src_dir, f"f_{i + 1:05d}.png")).convert("RGB")).astype(np.float32)[core]
        c = np.asarray(Image.open(os.path.join(out_dir, f"f_{i + 1:05d}.png")).convert("RGB")).astype(np.float32)[core]
        g, o = np.polyfit(s.ravel(), c.ravel(), 1)
        gains.append(float(g)); offsets.append(float(o))
        resid.append(float(np.abs(c - (g * s + o)).mean()))

    # ── matte: what travelled with him, and how steady it is ────────────────────────────────────────────────────
    leaks, areas = [], []
    for i in range(n):
        f = os.path.join(matte, f"alpha_{i:05d}.png")
        if not os.path.exists(f):
            continue
        al = np.asarray(Image.open(f).convert("L"))
        hard = al > 24
        areas.append(float(hard.sum()))
        lab, k = ndimage.label(hard)
        if k > 1:
            sizes = ndimage.sum(hard, lab, range(1, k + 1))
            main = int(np.argmax(sizes))
            det = [int(s) for j, s in enumerate(sizes) if j != main and s > a.leak_min]
            if det:
                leaks.append({"frame": i, "seconds": round(i / fps, 3), "detachedPx": sum(det), "largestPx": max(det)})
    areas = np.array(areas)
    jump = np.abs(np.diff(areas)) / np.maximum(areas[:-1], 1)

    report = {
        "run": os.path.abspath(a.run),
        "environment": record["environment"],
        "technical": {
            "timing": {
                **record["timing"],
                "sourceCutFramesDecoded": n_src,
                "outputFramesDecoded": n_out,
                "verdict": "frame for frame with the cut" if n_src == n_out else "the output is not frame for frame with the cut",
            },
            "performanceUntouched": {
                "method": "least-squares fit of output = gain x source + offset over the eroded matte core",
                "gain": round(float(np.mean(gains)), 4) if gains else None,
                "offset": round(float(np.mean(offsets)), 2) if offsets else None,
                "residual255": round(float(np.mean(resid)), 2) if resid else None,
                "verdict": (
                    "his pixels are the take's pixels"
                    if gains and abs(np.mean(gains) - 1) < 0.01 and abs(np.mean(offsets)) < 2
                    else "the performer was graded: a gain or offset was applied that nobody asked for"
                ),
            },
            "colour": {
                "method": "the output decoded as BT.709 limited range, against the blended frames; `saturated` is over pixels whose channels differ by more than 40",
                "fileSays": tagged,
                "meanAbs255": round(float(np.mean(col_abs)), 2) if col_abs else None,
                "saturatedMeanAbs255": round(sat_err, 2) if sat_err is not None else None,
                "verdict": (
                    "not checked: the blended frames are not in the run folder" if not col_abs
                    else "a player sees the colours that were blended" if tagged == "bt709" and (sat_err is None or sat_err < 4) and np.mean(col_abs) < 3
                    else "the file is not tagged, so a player has to guess how to read it" if tagged != "bt709" and (sat_err is None or sat_err < 4)
                    else "read as BT.709 the colours are not the blended ones: the encode used another matrix"
                ),
            },
            "matteLeaks": {
                "framesAffected": len(leaks),
                "ofFrames": int(len(areas)),
                "worstPx": max([l["largestPx"] for l in leaks], default=0),
                "worstShareOfBody": round(max([l["largestPx"] for l in leaks], default=0) / max(areas.mean(), 1), 4),
                "frames": leaks[:20],
            },
            "temporalStability": {
                "medianAreaJump": round(float(np.median(jump)), 4),
                "maxAreaJump": round(float(jump.max()), 4) if len(jump) else None,
                "framesOver2pct": int((jump > 0.02).sum()),
                "note": "the matted area, frame to frame. Large jumps are limbs the matter gains or drops, which read as flicker",
            },
        },
        "notChecked": [
            "lip sync — a comparison against the performance, not a property of one file; and this take carries no audio track",
            "whether the background's perspective and light are plausible for this room",
            "whether any of it looks right: edge quality, halos and spill are judged by eye, from the diagnostic render",
        ],
    }
    with open(a.out, "w") as f:
        json.dump(report, f, indent=1)
    print(json.dumps(report["technical"], indent=1)[:2000])
    print(f"\nwritten to {a.out}")


if __name__ == "__main__":
    main()
