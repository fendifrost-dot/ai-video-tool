#!/usr/bin/env python3
"""Make an effects PREVIEW COPY: a small file of what post has built, for AVT to play in place over the song.

The contract is docs/design/EFFECTS_PREVIEW.md: H.264, long side 960 px, the song clock's frame rate, no sound, a
keyframe every 12 frames, and EXACTLY round((song_end - song_start) * fps) frames, frame 0 being the picture at
song_start. This script makes that file from any finished effects file (a section render, a chunk, ProRes or MP4),
checks the frame count, and prints where to upload it and the `project_assets` row to file. It uploads nothing and
holds no token.

  python3 -I scripts/render/preview/make_preview.py verse_v1e.mov --section storm_verse --version 3 \\
      --song-frames 3070-4980 --user <user id> --project <project id> --out-dir /Volumes/T7/.../effects_preview

  --song-start 127.917 --song-end 207.542     the stretch in seconds instead of song frames
  --source-start 12.5                          where song_start lies inside the source, when the source starts earlier
  --built-from lock=LOCK_v1e                   repeatable; carried on the record
  --plan                                       print the ffmpeg command and the record, make nothing

Run with `python3 -I`. Needs ffmpeg and ffprobe.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

LONG_SIDE = 960
FPS = 24.0
KEYFRAME_EVERY = 12
FRAME_TOLERANCE = 1          # the same tolerance the app reads a record with (effectsPreview.ts)
SECTION_RE = re.compile(r"[a-z0-9][a-z0-9_]*")
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
PLACEHOLDERS = ("<user id>", "<project id>")


class PreviewError(Exception):
    """Something about the request or the source that makes a correct copy impossible."""


def expected_frames(song_start, song_end, fps=FPS):
    """How many frames a copy of [song_start, song_end) holds."""
    if not (song_end > song_start >= 0):
        raise PreviewError(f"the stretch must run forward from a time at or after 0: {song_start} to {song_end}")
    if fps <= 0:
        raise PreviewError(f"the frame rate must be above 0: {fps}")
    return int(round((song_end - song_start) * fps))


def song_frames_to_seconds(text, fps=FPS):
    """'3070-4980' (first and last song frame, both shown) → (start, end) in seconds; the end is exclusive."""
    m = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", text or "")
    if not m:
        raise PreviewError(f"--song-frames wants FIRST-LAST, two whole numbers: {text!r}")
    first, last = int(m.group(1)), int(m.group(2))
    if last < first:
        raise PreviewError(f"--song-frames runs backwards: {text!r}")
    return first / fps, (last + 1) / fps


def scaled_size(width, height, long_side=LONG_SIDE):
    """The copy's size: the long side at `long_side` (never enlarged), the shape kept, both sides even."""
    if width <= 0 or height <= 0:
        raise PreviewError(f"the source has no picture size: {width}x{height}")
    scale = min(1.0, long_side / max(width, height))
    even = lambda v: max(2, int(round(v * scale / 2.0)) * 2)
    return even(width), even(height)


def storage_path(user, project, section, version):
    return f"{user}/{project}/effects_preview/{section}_v{version}.mp4"


def check_ids(user, project):
    """The storage folder is <user id>/<project id>: ids only, so nothing else can be written into the printed path."""
    for name, value in (("--user", user), ("--project", project)):
        if value not in PLACEHOLDERS and not UUID_RE.fullmatch(value or ""):
            raise PreviewError(f"{name} is an id like 3ca10935-8c3d-4479-9a0c-8bfe8050840c: {value!r}")


def as_file_arg(path):
    """A path that starts with '-' would be read by ffmpeg as an option: make it plainly a path."""
    return path if not path.startswith("-") else os.path.join(".", path)


def check_names(section, version):
    if not SECTION_RE.fullmatch(section or ""):
        raise PreviewError(f"--section is a slug of lower-case letters, digits and underscores: {section!r}")
    if version < 1:
        raise PreviewError(f"--version is a whole number from 1: {version}")


def ffmpeg_args(source, out, frames, size, fps=FPS, source_start=0.0):
    """The one ffmpeg command. -ss before -i with a re-encode is frame-accurate; -frames:v makes the length exact."""
    w, h = size
    fps_text = f"{fps:g}"
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-ss", f"{max(0.0, source_start):.6f}", "-i", source,
        "-map", "0:v:0", "-an", "-sn", "-dn",
        "-vf", f"fps={fps_text},scale={w}:{h}:flags=lanczos,format=yuv420p",
        "-frames:v", str(frames),
        "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p",
        "-g", str(KEYFRAME_EVERY), "-keyint_min", str(KEYFRAME_EVERY), "-sc_threshold", "0",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-movflags", "+faststart",
        out,
    ]


def record(section, version, song_start, song_end, fps, frames, label=None, built_from=None, made_at=None):
    """`metadata_json.effects_preview` as the app reads it (src/lib/storyboard/effectsPreview.ts parseEffectsPreview)."""
    out = {
        "section": section,
        "version": version,
        "song_start": round(song_start, 6),
        "song_end": round(song_end, 6),
        "fps": int(fps) if float(fps).is_integer() else fps,
        "frames": frames,
    }
    if label:
        out["label"] = label
    if built_from:
        out["built_from"] = built_from
    if made_at:
        out["made_at"] = made_at
    return out


def asset_row(path, rec, duration_seconds):
    """The `project_assets` row to file (user_id and project_id are added by whoever files it)."""
    return {
        "asset_type": "other",
        "source_tool": "manual",
        "shot_id": None,
        "file_url": path,
        "version_number": rec["version"],
        "notes": f"effects preview: {rec.get('label') or rec['section']} v{rec['version']}",
        "metadata_json": {
            "bucket": "project-exports",
            "mime_type": "video/mp4",
            "duration_seconds": round(duration_seconds, 6),
            "effects_preview": rec,
        },
    }


def frame_issues(frames_made, frames_wanted):
    """What is wrong with the copy's length, in words. Empty = it fits the stretch."""
    if abs(frames_made - frames_wanted) > FRAME_TOLERANCE:
        return [f"the copy has {frames_made} frames, the stretch needs {frames_wanted}"]
    return []


def source_covers(source_seconds, source_start, song_start, song_end, fps=FPS):
    """Whether the source holds the whole stretch from `source_start` on (one frame of slack for a muxer's rounding)."""
    return source_seconds - source_start >= (song_end - song_start) - 1.0 / fps


def parse_built_from(pairs):
    out = {}
    for pair in pairs or []:
        if "=" not in pair:
            raise PreviewError(f"--built-from wants key=value: {pair!r}")
        key, value = pair.split("=", 1)
        out[key.strip()] = value.strip()
    return out


# --------------------------------------------------------------------------- the parts that touch files


def probe(path):
    """Picture size, length in seconds and frame count of a video file."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
         "stream=width,height,nb_read_frames,duration:format=duration", "-of", "json", path],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    stream = (data.get("streams") or [{}])[0]
    seconds = stream.get("duration") or (data.get("format") or {}).get("duration") or 0
    return {
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "seconds": float(seconds),
        "frames": int(stream.get("nb_read_frames") or 0),
    }


def probe_fast(path):
    """Size and length only: counting the frames of a long 4K source would decode all of it."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,duration:format=duration", "-of", "json", path],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    stream = (data.get("streams") or [{}])[0]
    seconds = stream.get("duration") or (data.get("format") or {}).get("duration") or 0
    return {"width": int(stream.get("width") or 0), "height": int(stream.get("height") or 0), "seconds": float(seconds)}


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Make an effects preview copy for AVT (docs/design/EFFECTS_PREVIEW.md).")
    ap.add_argument("source", help="a finished effects file: a section render, a chunk, ProRes or MP4")
    ap.add_argument("--section", required=True, help="slug that names the stretch across versions, e.g. storm_verse")
    ap.add_argument("--version", required=True, type=int, help="whole number from 1; the highest of a section is shown")
    ap.add_argument("--song-frames", help="FIRST-LAST song frames the source shows, e.g. 3070-4980")
    ap.add_argument("--song-start", type=float, help="seconds on the song clock (with --song-end)")
    ap.add_argument("--song-end", type=float)
    ap.add_argument("--fps", type=float, default=FPS, help="the song clock's frame rate (default 24)")
    ap.add_argument("--source-start", type=float, default=0.0, help="where song_start lies inside the source, seconds")
    ap.add_argument("--long-side", type=int, default=LONG_SIDE)
    ap.add_argument("--label", help="a name for people, e.g. 'Storm verse'")
    ap.add_argument("--built-from", action="append", metavar="KEY=VALUE", help="what it was made from; repeatable")
    ap.add_argument("--user", default="<user id>", help="the owner's user id (the storage folder)")
    ap.add_argument("--project", default="<project id>")
    ap.add_argument("--out-dir", default=".", help="where the copy and its .json are written")
    ap.add_argument("--plan", action="store_true", help="print the command and the record; make nothing")
    args = ap.parse_args(argv)

    try:
        check_names(args.section, args.version)
        check_ids(args.user, args.project)
        args.source = as_file_arg(args.source)
        args.out_dir = as_file_arg(args.out_dir)
        if args.song_frames:
            song_start, song_end = song_frames_to_seconds(args.song_frames, args.fps)
        elif args.song_start is not None and args.song_end is not None:
            song_start, song_end = args.song_start, args.song_end
        else:
            raise PreviewError("say which stretch of the song this is: --song-frames FIRST-LAST, or --song-start and --song-end")
        frames = expected_frames(song_start, song_end, args.fps)
        built_from = parse_built_from(args.built_from)
        for tool in ("ffmpeg", "ffprobe"):
            if not shutil.which(tool):
                raise PreviewError(f"{tool} is not installed")
        if not os.path.isfile(args.source):
            raise PreviewError(f"no such file: {args.source}")
        src = probe_fast(args.source)
        if not source_covers(src["seconds"], args.source_start, song_start, song_end, args.fps):
            raise PreviewError(
                f"the source is {src['seconds']:.3f} s long; from {args.source_start:.3f} s it cannot fill a "
                f"{song_end - song_start:.3f} s stretch. Check the stretch, or --source-start."
            )
        size = scaled_size(src["width"], src["height"], args.long_side)
        out = os.path.join(args.out_dir, f"{args.section}_v{args.version}.mp4")
        cmd = ffmpeg_args(args.source, out, frames, size, args.fps, args.source_start)
        path = storage_path(args.user, args.project, args.section, args.version)

        if args.plan:
            rec = record(args.section, args.version, song_start, song_end, args.fps, frames, args.label, built_from or None)
            print(json.dumps({"plan": True, "ffmpeg": cmd, "upload_to": {"bucket": "project-exports", "path": path}, "row": asset_row(path, rec, frames / args.fps)}, indent=2))
            return 0

        os.makedirs(args.out_dir, exist_ok=True)
        subprocess.run(cmd, check=True)
        made = probe(out)
        issues = frame_issues(made["frames"], frames)
        if issues:
            raise PreviewError("; ".join(issues) + f". The file was left at {out} and must not be filed.")
        built = {"source": os.path.basename(args.source), "source_sha256": sha256_of(args.source), **built_from}
        made_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rec = record(args.section, args.version, song_start, song_end, args.fps, made["frames"], args.label, built, made_at)
        report = {
            "file": out,
            "sha256": sha256_of(out),
            "bytes": os.path.getsize(out),
            "size": f"{made['width']}x{made['height']}",
            "frames": made["frames"],
            "seconds": round(made["frames"] / args.fps, 6),
            "upload_to": {"bucket": "project-exports", "path": path},
            "row": asset_row(path, rec, made["frames"] / args.fps),
        }
        with open(out[:-4] + ".json", "w") as f:
            json.dump(report, f, indent=2)
        print(json.dumps(report, indent=2))
        return 0
    except PreviewError as e:
        print(f"make_preview: {e}", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"make_preview: {e.cmd[0]} failed ({e.returncode}): {(e.stderr or '').strip()}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
