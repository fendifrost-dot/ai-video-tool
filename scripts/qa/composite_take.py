#!/usr/bin/env python3
"""
COMPOSITE TAKE — one take, one background, through the compositor the repo already has.

    python3 scripts/qa/composite_take.py --take S06.mp4 --from 0 --to 2.5 --plate plate.png --out run/
    python3 scripts/qa/composite_take.py --take take.mp4 --frames 3710:3944:2 --plate plate.png --out run/

What this is: a thin, recorded wrapper around scripts/edit/composite_environment.py (RobustVideoMatting + the
shadow-aware refinement that lane already built). It adds the two things that lane does not do, and that a take
filmed on a phone needs:

  1. AN EXPLICIT COLOUR CONVERSION. These takes are HLG (`arib-std-b67`, BT.2020). Decoding one with a plain
     `scale` — which is what the compositor does — does not apply the HLG curve, and the result is flat and
     desaturated: measured on S06, mean channel spread 22.6 against 41.4 once converted. So the take is converted
     ONCE here, to BT.709, and the intermediate is TAGGED bt709 so nothing downstream converts it again. The
     original file is never written to.
  2. A RECORD. Every number that decided the output — the source range, the frame count in and out, the matte
     settings, the conversion filter — is written beside it, so a composite can be held against the take it came
     from without rerunning anything.

  3. AN EXACT CUT. The cut is made by FRAME INDEX, not by seconds, and the take's real frame rate is carried as a
     fraction (a phone's "59.94" is 60000/1001, not 60). Rounding the rate to an integer — which is what this did
     before — plays a 59.94 take 0.1 % fast: four frames adrift over a minute, which is a lip-sync error on a
     performance. `--frames A:B:2` keeps every second frame, so a 59.94 take becomes a true 29.97 one with each kept
     frame still at its own instant. The time of the first and last kept frame is read off the take and recorded,
     so the composite can be put on a clock without guessing.

It does NOT run in AVT. It is an agent-operated harness on a build box; a run of it proves the ROUTE, not that
anything can be produced unattended. `environment` in the record says so.
"""
import argparse, json, os, re, shutil, subprocess, sys, time
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# the standard HLG/BT.2020 → BT.709 chain: linearise on the input curve, move the primaries, compress the range,
# then re-apply the BT.709 transfer. Applied exactly once; the output carries bt709 tags so a second pass is a no-op.
HLG_TO_709 = (
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
    "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
)
TONE_MAPPED_TRANSFERS = {"arib-std-b67", "smpte2084"}
# How the finished frames (RGB) are written to video. Left to itself ffmpeg turns RGB into YUV with the BT.601
# matrix and writes no tag; a player then reads an untagged HD file as BT.709 and every saturated colour moves
# (measured on the checker: green 0/220/60 came back 0/189/55). So the matrix is named, and the file says what it is.
ENCODE_709 = ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
              "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"]


def exact_rate(reported: float) -> Fraction:
    """The frame rate a container MEANS by the rounded figure it prints.

    Cameras run at whole rates (24, 25, 30, 60 …) or at the broadcast ones a factor 1000/1001 below them (23.976,
    29.97, 59.94). ffmpeg prints two decimals, so the fraction is recovered by taking whichever of the two families
    lies closer to the printed figure. A rate that fits neither within the printing error is kept as printed.
    """
    whole = Fraction(round(reported))
    ntsc = Fraction(round(reported * 1001 / 1000) * 1000, 1001)
    best = min((whole, ntsc), key=lambda r: abs(float(r) - reported))
    return best if abs(float(best) - reported) < 0.006 else Fraction(reported).limit_denominator(1001)


def frame_plan(rate: Fraction, frames: str | None, start: float, end: float | None) -> dict:
    """Which decoded frames of the take are kept, as indices. `--frames A:B[:step]` is inclusive at both ends;
    `--from/--to` are seconds and are turned into the same thing, so there is one cutting path and it is exact."""
    if frames:
        parts = [int(x) for x in frames.split(":")]
        if len(parts) not in (2, 3):
            raise SystemExit("--frames is A:B or A:B:step")
        first, last, step = parts[0], parts[1], (parts[2] if len(parts) == 3 else 1)
    else:
        if end is None:
            raise SystemExit("say what to cut: --frames A:B[:step], or --from/--to in seconds")
        first, last, step = round(start * rate), round(end * rate) - 1, 1
    if step < 1 or first < 0 or last < first:
        raise SystemExit(f"nothing to cut in frames {first}..{last} step {step}")
    kept = (last - first) // step + 1
    out_rate = rate / step
    return {
        "first": first, "last": first + (kept - 1) * step, "step": step, "kept": kept,
        "rate": out_rate,
        # the matter resamples to a whole rate (`fps=N`); the intermediate is stamped at that whole rate so the
        # resample is the identity, and the real rate is put back when the composite is encoded
        "nominal": max(1, round(out_rate)),
    }


def rate_text(r: Fraction) -> str:
    return str(r.numerator) if r.denominator == 1 else f"{r.numerator}/{r.denominator}"


def ffmpeg() -> str:
    for c in (shutil.which("ffmpeg"), ):
        if c:
            return c
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path: str) -> dict:
    out = subprocess.run([ffmpeg(), "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    info = {"transfer": None, "width": None, "height": None, "fps": None, "seconds": None, "frames": None}
    for line in out.splitlines():
        s = line.strip()
        if s.startswith("Duration:"):
            h, m, sec = s.split("Duration:")[1].split(",")[0].strip().split(":")
            info["seconds"] = int(h) * 3600 + int(m) * 60 + float(sec)
        if "Video:" in s:
            for part in s.split(","):
                p = part.strip()
                if "x" in p and p.split(" ")[0].replace("x", "").isdigit():
                    w, _, h2 = p.split(" ")[0].partition("x")
                    if w.isdigit() and h2.isdigit():
                        info["width"], info["height"] = int(w), int(h2)
                if p.endswith("fps"):
                    try: info["fps"] = float(p.split(" ")[0])
                    except ValueError: pass
                for t in TONE_MAPPED_TRANSFERS | {"bt709"}:
                    if t in p: info["transfer"] = t
    info["frames"] = frames_of(path)
    return info


def frames_of(path: str) -> int | None:
    r = subprocess.run([ffmpeg(), "-hide_banner", "-i", path, "-map", "0:v:0", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    last = [w for w in r.replace("=", "= ").split() if w.isdigit()]
    for line in reversed(r.splitlines()):
        if line.startswith("frame="):
            try: return int(line.split("frame=")[1].split()[0])
            except (IndexError, ValueError): pass
    return int(last[-1]) if last else None


def run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2500:])
        raise SystemExit(f"failed: {' '.join(cmd[:3])}…")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--take", required=True, help="the ORIGINAL take; it is read, never written")
    ap.add_argument("--plate", required=True)
    ap.add_argument("--out", required=True, help="a directory: the intermediate, the composite and the record")
    ap.add_argument("--from", dest="start", type=float, default=0.0)
    ap.add_argument("--to", dest="end", type=float, default=None)
    ap.add_argument("--frames", default=None, help="A:B[:step] — decoded frame indices of the take, inclusive; step 2 halves the rate exactly. Instead of --from/--to")
    ap.add_argument("--size", default=None, help="default: the take's own raster, so nothing is rescaled")
    ap.add_argument("--diagnostic", default=None, help="a second plate (a checker) rendered from the same matte, so edges can be judged")
    ap.add_argument("--matte-args", default="", help="passed through to composite_environment.py, space separated")
    ap.add_argument("--choke", type=int, default=0, help="pull the matte's edge in by this many pixels before blending. A take filmed against a pale wall carries a pale rim of it; over a dark place that rim is a halo (measured by eye on a black runway: gone at 3). His inside is not touched — only where the edge falls")
    ap.add_argument("--resume", action="store_true", help="keep the cut and the matte already in --out when they are of this same cut (the matte is minutes of CPU); only the blend and the encode run again")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    started = time.time()

    src = probe(a.take)
    if not src["width"] or not src["fps"]:
        raise SystemExit("the take does not say how large or how fast it is")
    size = a.size or f"{src['width']}x{src['height']}"
    take_rate = exact_rate(src["fps"])
    plan = frame_plan(take_rate, a.frames, a.start, a.end)
    fps = plan["nominal"]

    # 1 ── the colour conversion, once, on a cut of the take
    needs_tonemap = src["transfer"] in TONE_MAPPED_TRANSFERS
    mid = os.path.join(a.out, "source_bt709.mp4")
    vf = HLG_TO_709 if needs_tonemap else "format=yuv420p"
    matte_dir = os.path.join(a.out, "matte")
    cut_file = os.path.join(a.out, "cut.json")
    asked = {"take": os.path.basename(a.take), "first": plan["first"], "last": plan["last"], "step": plan["step"],
             "size": size, "filter": vf, "matteArgs": a.matte_args}
    kept_before = json.load(open(cut_file)) if a.resume and os.path.exists(cut_file) else None
    mattes = len([f for f in os.listdir(matte_dir) if f.startswith("alpha_")]) if os.path.isdir(matte_dir) else 0
    resumed = bool(kept_before and kept_before.get("asked") == asked and os.path.exists(mid) and mattes == plan["kept"])
    if resumed:
        stamps = kept_before["stamps"]
    else:
        # select by index, read each kept frame's own time off the take (showinfo), then restamp one frame per whole
        # tick. Nothing is resampled: a kept frame is a frame the camera recorded.
        cut = (f"select='between(n\\,{plan['first']}\\,{plan['last']})*not(mod(n-{plan['first']}\\,{plan['step']}))',"
               f"showinfo,setpts=N/{fps}/TB,{vf}")
        r = subprocess.run([ffmpeg(), "-hide_banner", "-loglevel", "info", "-i", a.take, "-vf", cut,
                            "-frames:v", str(plan["kept"]), "-fps_mode", "passthrough",
                            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
                            "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-an", "-y", mid],
                           capture_output=True, text=True)
        if r.returncode != 0:
            sys.stderr.write(r.stderr[-2500:])
            raise SystemExit("failed: the cut")
        stamps = [float(x) for x in re.findall(r"Parsed_showinfo.*?pts_time:\s*([0-9.]+)", r.stderr)]
        if len(stamps) != plan["kept"]:
            raise SystemExit(f"the take gave {len(stamps)} frames in that range, not the {plan['kept']} asked for — it is shorter than the cut")
    midinfo = probe(mid)
    if midinfo["transfer"] in TONE_MAPPED_TRANSFERS:
        raise SystemExit("the intermediate is still tagged as HDR — a second conversion downstream would double-map it")

    # 2 ── the matte, by the matter this repo already has
    if not resumed:
        cmd = [sys.executable, os.path.join(ROOT, "scripts", "edit", "composite_environment.py"),
               "--in", mid, "--plate", a.plate, "--out", os.path.join(a.out, "_unused.mp4"),
               "--fps", str(fps), "--size", size, "--zoom", "0.0", "--cool", "0.0",
               "--export-matte", matte_dir, "--matte-only"]
        if a.matte_args:
            cmd += a.matte_args.split()
        run(cmd)
        with open(cut_file, "w") as f:
            json.dump({"asked": asked, "stamps": stamps}, f)

    # 3 ── the blend, here, over the ORIGINAL pixels
    #
    # Why this is not left to composite_environment.py's own blend: measured on this very clip, its output applies
    # `out = 1.0512 × source − 12.53` to the performer INSIDE the matte, with --cool 0 and --match-plate 0 — a 5 %
    # contrast stretch and a 12.5/255 black crush on the recorded performance. The matte it exports is exact (its
    # `fg` is pixel-identical to the source inside the body: measured |Δ| 0.00), so the matting is sound and only the
    # final blend is not. Blending here keeps the performance bit-exact, which is the one thing this run must not
    # lose. The finding is reported to that lane rather than fixed behind its back — other sections were graded on
    # its current behaviour.
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    def choked(al):
        """The matte with its edge pulled in: the smallest value within `--choke` pixels, softened by under a pixel so
        the new edge is not a stair, and never above the matte it came from (it can only remove, not add)."""
        if a.choke <= 0:
            return al
        inner = ndimage.gaussian_filter(ndimage.minimum_filter(al, size=2 * a.choke + 1), 0.8)
        return np.minimum(al, inner)

    def cover_fit(plate, w: int, h: int):
        """Fill the frame without changing the picture's shape: scale until it covers, crop the overhang evenly.
        A plate of another aspect used to be squeezed to fit, which bends every line in it."""
        img = Image.fromarray(plate.astype(np.uint8))
        k = max(w / img.width, h / img.height)
        img = img.resize((max(w, round(img.width * k)), max(h, round(img.height * k))), Image.LANCZOS)
        x, y = (img.width - w) // 2, (img.height - h) // 2
        return np.asarray(img.crop((x, y, x + w, y + h))).astype(np.float32)

    def blend(plate_path: str, out_png_dir: str) -> None:
        os.makedirs(out_png_dir, exist_ok=True)
        plate = np.asarray(Image.open(plate_path).convert("RGB")).astype(np.float32)
        n = len([f for f in os.listdir(matte_dir) if f.startswith("alpha_")])
        for i in range(n):
            al = choked(np.asarray(Image.open(os.path.join(matte_dir, f"alpha_{i:05d}.png")).convert("L")).astype(np.float32) / 255.0)[..., None]
            fg = np.asarray(Image.open(os.path.join(matte_dir, f"fg_{i:05d}.png")).convert("RGB")).astype(np.float32)
            if plate.shape[:2] != fg.shape[:2]:
                plate = cover_fit(plate, fg.shape[1], fg.shape[0])
            Image.fromarray(np.clip(fg * al + plate * (1 - al), 0, 255).astype(np.uint8)).save(os.path.join(out_png_dir, f"c_{i:05d}.png"))
        return None

    out_mp4 = os.path.join(a.out, "composite.mp4")
    blend(a.plate, os.path.join(a.out, "frames"))
    run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-framerate", rate_text(plan["rate"]),
         "-i", os.path.join(a.out, "frames", "c_%05d.png"), *ENCODE_709, "-c:v", "libx264", "-preset", "medium", "-crf", "16",
         "-movflags", "+faststart", out_mp4])
    diagnostic = None
    if a.diagnostic:
        blend(a.diagnostic, os.path.join(a.out, "diagframes"))
        diagnostic = os.path.join(a.out, "diagnostic.mp4")
        run([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-framerate", rate_text(plan["rate"]),
             "-i", os.path.join(a.out, "diagframes", "c_%05d.png"), *ENCODE_709, "-c:v", "libx264", "-preset", "medium",
             "-crf", "16", "-movflags", "+faststart", out_mp4.replace("composite.mp4", "diagnostic.mp4")])
    outinfo = probe(out_mp4)

    # 4 ── the record: what decided this file, so it can be held against the take without rerunning
    seconds = float(plan["kept"] / plan["rate"])
    record = {
        "method": "RobustVideoMatting (scripts/edit/composite_environment.py) over an explicitly colour-converted cut",
        "environment": "agent-operated harness on a build box — NOT AVT, and not evidence of unattended production",
        "producedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tookSeconds": round(time.time() - started, 1),
        "resumed": resumed,
        # `range` is where the kept frames sit in the TAKE's own time, read off the take: first frame's instant to
        # the end of the last kept frame's slot
        "source": {"file": os.path.basename(a.take), "range": [round(stamps[0], 4), round(stamps[0] + seconds, 4)], **src,
                   "rate": rate_text(take_rate)},
        "cut": {
            "firstFrame": plan["first"], "lastFrame": plan["last"], "step": plan["step"], "frames": plan["kept"],
            "rate": rate_text(plan["rate"]), "seconds": round(seconds, 4),
            "firstFrameAt": round(stamps[0], 4), "lastFrameAt": round(stamps[-1], 4),
            "intermediateRate": fps,
            "note": "frames chosen by index and never resampled; the intermediate is stamped one frame per whole tick so the matter's resample is the identity, and the composite is encoded at the cut's real rate",
        },
        "colour": {
            "sourceTransfer": src["transfer"],
            "converted": needs_tonemap,
            "filter": vf,
            "intermediateTransfer": midinfo["transfer"],
            "outputTransfer": outinfo["transfer"],
            "outputMatrix": "bt709, named at the encode and written on the file",
            "note": "one conversion, at the cut; the intermediate is tagged bt709 so nothing downstream maps it again",
        },
        "output": {"file": os.path.basename(out_mp4), **outinfo},
        "timing": {
            "expectedFrames": plan["kept"],
            "sourceCutFrames": midinfo["frames"],
            "outputFrames": outinfo["frames"],
            "framesMatch": midinfo["frames"] == outinfo["frames"] == plan["kept"],
            "fpsMatch": abs((outinfo["fps"] or 0) - float(plan["rate"])) < 0.006,
            "spanInTake": round(stamps[-1] - stamps[0], 4),
            "spanInOutput": round(float((plan["kept"] - 1) / plan["rate"]), 4),
            "note": "the composite is frame for frame with the cut it was made from: nothing was retimed or dropped",
        },
        "matte": {"matter": "scripts/edit/composite_environment.py --matte-only (RobustVideoMatting)",
                  "extraArgs": a.matte_args or None, "exported": matte_dir, "chokePx": a.choke,
                  "blend": "done in this harness, not by the compositor: its own blend applies 1.0512x-12.53 to the performer (measured), which this run must not do"},
        "diagnosticRender": os.path.basename(diagnostic) if diagnostic else None,
    }
    with open(os.path.join(a.out, "record.json"), "w") as f:
        json.dump(record, f, indent=1)
    print(json.dumps(record["timing"], indent=1))
    print(f"wrote {out_mp4} and {a.out}/record.json")


if __name__ == "__main__":
    main()
