#!/usr/bin/env python3
"""Execute a render contract: the storyboard, as Review plays it, made into one video file.

The contract (storyboard_timeline.json, version 2 — src/lib/storyboard/renderContract.ts) already says, per shot and
in output frames, everything a renderer does: the original file to read, where its picture starts, how many frames
hold the first picture, play, and hold the last, and what the edit does to the picture frame run by frame run. This
script decides NOTHING editorial and re-derives nothing: it reads those numbers and has ffmpeg do them.

    python3 scripts/render/render_contract.py CONTRACT.json --media MEDIA.json --out cut.mp4

MEDIA.json maps each asset to where its file can be read (a local path or an https URL ffmpeg can open):
    { "<bucket>/<path>": "/abs/or/https/location", ... }      (the keys are the contract's own bucket + "/" + path)

Options:
    --scale N       render at 1/N of the contract's frame (tests; a draft). Default 1.
    --plan          print the ffmpeg command and the filter graph, render nothing.
    --crf N         x264 quality (default 18).

What it does not do — because the contract says Review does not either: transitions (every shot starts on a cut),
and anything for a shot's timed DIRECTION (that has to be in the footage). A shot with nothing on it is black.

Needs ffmpeg and ffprobe on PATH. No network of its own, no project knowledge, no provider.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

SUPPORTED_VERSION = 2


class ContractError(Exception):
    """The contract or the media map is not something this renderer can execute. Nothing is rendered."""


def even(n):
    return max(2, int(round(n / 2.0)) * 2)


def load_contract(path):
    with open(path, "r", encoding="utf-8") as f:
        c = json.load(f)
    if c.get("version") != SUPPORTED_VERSION:
        raise ContractError(f"this renderer executes render contract version {SUPPORTED_VERSION}; the file says {c.get('version')!r}")
    if c.get("clock") != "song":
        raise ContractError("the contract's clock is not the song")
    if not c.get("frames") or not c.get("fps"):
        raise ContractError("the contract has no frames to render")
    if c.get("frame", {}).get("fit") != "contain":
        raise ContractError(f"frame.fit {c.get('frame', {}).get('fit')!r} is not supported: media is fitted whole (contain)")
    return c


def validate(c):
    """The contract's own arithmetic must close: every output frame belongs to at most one shot, and a video shot's
    lead + play + tail is its frame count. A contract that does not add up is refused, not patched."""
    covered = 0
    last_out = 0
    for s in c["segments"]:
        fi, fo = s["frame_in"], s["frame_out"]
        if fo < fi or fi < last_out or fo > c["frames"]:
            raise ContractError(f"shot {s['index']} ({s['key']}): frames {fi}–{fo} overlap the shot before it or run past the end")
        last_out = max(last_out, fo)
        covered += fo - fi
        m = s["media"]
        if m["kind"] == "video":
            f = m["frames"]
            if f["lead"] + f["play"] + f["tail"] != fo - fi or min(f["lead"], f["play"], f["tail"]) < 0:
                raise ContractError(f"shot {s['index']} ({s['key']}): lead + play + tail is not its {fo - fi} frames")
        for r in s.get("picture_runs", []):
            if r["frame_in"] < fi or r["frame_out"] > fo or r["frame_out"] <= r["frame_in"]:
                raise ContractError(f"shot {s['index']} ({s['key']}): an effect run lies outside the shot")
    return covered


def media_location(media_map, bucket, path):
    key = f"{bucket}/{path}"
    loc = media_map.get(key)
    if not loc:
        raise ContractError(f"no file given for {key}")
    if not loc.startswith(("http://", "https://")) and not os.path.exists(loc):
        raise ContractError(f"the file given for {key} does not exist: {loc}")
    return loc


def lut_for(run):
    """One effect run as a per-channel lookup: the same arithmetic Review applies — brightness, then contrast about
    mid-grey (each clamped, as a CSS filter chain clamps), then white laid over at `flash`."""
    b, c, f = float(run["brightness"]), float(run["contrast"]), float(run["flash"])
    expr = f"clip(clip(val*{b:.6f},0,255)*{c:.6f}+{127.5 * (1 - c):.6f},0,255)*{1 - f:.6f}+{255 * f:.6f}"
    return f"lutrgb=r='{expr}':g='{expr}':b='{expr}'"


def build(c, media_map, scale=1, matrices=None):
    """→ (ffmpeg inputs, filter_complex, has_audio, size). Pure: touches no file but to check that it exists.
    `matrices` says, per file location, the colour matrix its picture is in when the file itself does not."""
    fps = c["fps"]
    W, H = even(c["frame"]["width"] / scale), even(c["frame"]["height"] / scale)
    matrices = matrices or {}

    def fit_of(loc=None):
        # the whole picture inside the frame, never cropped; black where it does not reach
        matrix = f":in_color_matrix={matrices[loc]}" if loc in matrices and matrices[loc] else ""
        return f"scale={W}:{H}:force_original_aspect_ratio=decrease:flags=bicubic{matrix},pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=rgb24"

    inputs, chains, labels = [], [], []

    def black(frames, label):
        chains.append(f"color=c=black:s={W}x{H}:r={fps}:d={frames / fps:.6f},format=rgb24,trim=end_frame={frames},setpts=PTS-STARTPTS[{label}]")

    cursor = 0
    k = 0
    for s in c["segments"]:
        n = s["frame_out"] - s["frame_in"]
        if s["frame_in"] > cursor:  # frames no shot covers (before the first shot of a range): black
            black(s["frame_in"] - cursor, f"g{k}")
            labels.append(f"g{k}")
        cursor = max(cursor, s["frame_out"])
        if n <= 0:
            k += 1
            continue
        m = s["media"]
        base = f"s{k}"
        if m["kind"] == "none":
            black(n, base)
        elif m["kind"] == "image":
            inputs += ["-loop", "1", "-framerate", str(fps), "-t", f"{n / fps + 1:.6f}", "-i", media_location(media_map, m["bucket"], m["path"])]
            chains.append(f"[{len(inputs_index(inputs)) - 1}:v]{fit_of()},fps={fps},trim=end_frame={n},setpts=PTS-STARTPTS[{base}]")
        else:
            f = m["frames"]
            # read the file from the picture the first played frame shows; the file runs at its own rate; the frames
            # before it hold that first picture and the frames after the footage ends hold the last one reached
            loc = media_location(media_map, m["bucket"], m["path"])
            inputs += ["-ss", f"{max(0.0, f['source_first']):.6f}", "-i", loc]
            chains.append(
                f"[{len(inputs_index(inputs)) - 1}:v]{fit_of(loc)},fps={fps},trim=end_frame={max(1, f['play'])},setpts=PTS-STARTPTS,"
                f"tpad=start={f['lead']}:start_mode=clone:stop=-1:stop_mode=clone,trim=end_frame={n},setpts=PTS-STARTPTS[{base}]"
            )
        runs = s.get("picture_runs") or []
        if runs:
            # cut the shot into the runs the contract lists (and the stretches between them, left as filmed)
            pieces, at = [], s["frame_in"]
            for r in runs:
                if r["frame_in"] > at:
                    pieces.append((at, r["frame_in"], None))
                pieces.append((r["frame_in"], r["frame_out"], r))
                at = r["frame_out"]
            if at < s["frame_out"]:
                pieces.append((at, s["frame_out"], None))
            chains.append(f"[{base}]split={len(pieces)}" + "".join(f"[{base}p{i}]" for i in range(len(pieces))))
            outs = []
            for i, (a, b, r) in enumerate(pieces):
                lo, hi = a - s["frame_in"], b - s["frame_in"]
                fx = f",{lut_for(r)}" if r else ""
                chains.append(f"[{base}p{i}]trim=start_frame={lo}:end_frame={hi},setpts=PTS-STARTPTS{fx}[{base}q{i}]")
                outs.append(f"[{base}q{i}]")
            # frames are counted, never timed: a one-frame piece has no length a timestamp could be trusted for
            chains.append("".join(outs) + f"concat=n={len(pieces)}:v=1:a=0,setpts=N/({fps}*TB)[{base}x]")
            base = f"{base}x"
        labels.append(base)
        k += 1
    if cursor < c["frames"]:
        black(c["frames"] - cursor, "gz")
        labels.append("gz")
    chains.append("".join(f"[{label}]" for label in labels) + f"concat=n={len(labels)}:v=1:a=0,setpts=N/({fps}*TB),scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]")

    has_audio = bool(c.get("audio"))
    if has_audio:
        a = c["audio"]
        inputs += ["-ss", f"{max(0.0, a['song_in']):.6f}", "-t", f"{c['frames'] / fps:.6f}", "-i", media_location(media_map, a["bucket"], a["path"])]
        chains.append(f"[{len(inputs_index(inputs)) - 1}:a]aresample=48000,apad,atrim=duration={c['frames'] / fps:.6f},asetpts=PTS-STARTPTS[a]")
    return inputs, ";".join(chains), has_audio, (W, H)


def inputs_index(inputs):
    """The inputs given so far (every `-i`)."""
    return [x for x in inputs if x == "-i"]


def video_locations(c, media_map):
    return sorted({media_location(media_map, s["media"]["bucket"], s["media"]["path"]) for s in c["segments"] if s["media"]["kind"] == "video"})


def input_matrices(locations):
    """The colour matrix of each video file: its own tag when it has one; otherwise BT.709 for HD and BT.601 below —
    the convention players follow. (Left to itself ffmpeg's scaler reads every untagged file as BT.601, which shifts
    the colours of HD footage.)"""
    out = {}
    for loc in locations:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space,height", "-of", "json", loc], capture_output=True, text=True)
        try:
            st = json.loads(r.stdout)["streams"][0]
        except (ValueError, KeyError, IndexError):
            continue
        tag = (st.get("color_space") or "").lower()
        if tag in ("bt709", "bt470bg", "smpte170m", "bt2020nc"):
            out[loc] = {"bt470bg": "bt601", "smpte170m": "bt601", "bt2020nc": "bt2020"}.get(tag, tag)
        else:
            out[loc] = "bt709" if int(st.get("height") or 0) >= 720 else "bt601"
    return out


def command(c, media_map, out, scale=1, crf=18, matrices=None):
    inputs, graph, has_audio, _ = build(c, media_map, scale, matrices)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-nostdin", *inputs, "-filter_complex", graph, "-map", "[v]"]
    if has_audio:
        cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", "256k"]
    cmd += ["-frames:v", str(c["frames"]), "-r", str(c["fps"]), "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    cmd += ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart", out]
    return cmd


def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,width,height,r_frame_rate:format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    j = json.loads(r.stdout)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    return {"frames": int(st["nb_read_frames"]), "width": int(st["width"]), "height": int(st["height"]), "fps": float(num) / float(den), "seconds": float(j["format"]["duration"]), "audio": audio or None}


def render(contract_path, media_path, out, scale=1, crf=18, plan_only=False):
    c = load_contract(contract_path)
    validate(c)
    with open(media_path, "r", encoding="utf-8") as f:
        media_map = json.load(f)
    if plan_only:
        return {"command": command(c, media_map, out, scale, crf)}
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise ContractError(f"{tool} is not installed")
    cmd = command(c, media_map, out, scale, crf, input_matrices(video_locations(c, media_map)))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise ContractError(f"ffmpeg failed: {r.stderr.strip()[-1200:]}")
    got = probe(out)
    # the file is what the contract asked for, or it is not a render of it
    problems = []
    if got["frames"] != c["frames"]:
        problems.append(f"{got['frames']} frames, the contract has {c['frames']}")
    if abs(got["fps"] - c["fps"]) > 0.01:
        problems.append(f"{got['fps']:.3f} fps, the contract says {c['fps']}")
    if c.get("audio") and not got["audio"]:
        problems.append("no sound, and the contract has the song")
    if problems:
        raise ContractError("the rendered file is not the contract: " + "; ".join(problems))
    return {"out": out, **got, "shots": len(c["segments"])}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Execute a render contract (storyboard_timeline.json, version 2) with ffmpeg.")
    ap.add_argument("contract")
    ap.add_argument("--media", required=True, help='JSON: { "<bucket>/<path>": "<local path or https URL>" }')
    ap.add_argument("--out", default="cut.mp4")
    ap.add_argument("--scale", type=int, default=1)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--plan", action="store_true", help="print the ffmpeg command; render nothing")
    a = ap.parse_args(argv)
    try:
        result = render(a.contract, a.media, a.out, max(1, a.scale), a.crf, a.plan)
    except ContractError as e:
        print(f"not rendered: {e}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
