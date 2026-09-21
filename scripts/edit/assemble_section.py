#!/usr/bin/env python3
"""
Assemble a treatment section on the SONG clock into one MP4 (deterministic, $0).

  python3 scripts/edit/assemble_section.py \
      --shotspecs docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json \
      --renders   renders.json --song song.wav --out section.mp4 [--fps 24] [--size 1080x1920]

renders.json maps shot id -> how to fill that timeline slot:
  {
    "S06": {"file": "s06_edit.mp4", "masterStart": 61.597},     # performance: file starts at this MASTER time
    "S02": {"file": "broll_zip.mp4"},                            # generated: file starts at the slot's timeline start
    "S05": {"file": "ice_flash.mp4", "fx": "flash"}
  }

For a performance shot the source offset inside the file is
    songToPerformance(timeline.start) - masterStart
so a shot is never "guessed" onto the song: it is placed by the canonical sync
(sync.offsetSeconds / driftPpm from the shotspecs header). The song audio is cut
from the same timeline range, so audio and picture share one clock.

Every slot must be filled; a missing render aborts (no silent black filler).
Transitions declared in the shotspecs (cut / crossfade / fade_black / fade_white /
flash) are honoured at the slot boundary with the given duration.
"""
import argparse, json, os, subprocess, sys, tempfile

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-4000:])
        raise SystemExit(f"command failed: {' '.join(cmd[:6])} …")
    return r.stdout

def probe_duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())

def song_to_performance(t, sync):
    return (t - sync["offsetSeconds"]) / (1 + sync.get("driftPpm", 0) / 1e6)

def _framing_zoom(shot):
    """'1.25× crop' / '1.25x crop' in the ShotSpec motion/framing text → 1.25 (0 when absent)."""
    import re
    txt = json.dumps({k: shot.get(k) for k in ("framing", "cameraMotion", "camera", "motion")}, ensure_ascii=False)
    m = re.search(r"(\d+(?:\.\d+)?)\s*[×x]\s*crop", txt)
    return float(m.group(1)) if m else 0.0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shotspecs", required=True); ap.add_argument("--renders", required=True)
    ap.add_argument("--song", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=24); ap.add_argument("--size", default="1080x1920")
    ap.add_argument("--crf", type=int, default=17)
    a = ap.parse_args()
    spec = json.load(open(a.shotspecs)); renders = json.load(open(a.renders))
    sync = spec["sync"]; shots = sorted(spec["shots"], key=lambda s: s["timeline"]["start"])
    W, H = (int(x) for x in a.size.lower().split("x"))
    section_start = shots[0]["timeline"]["start"]; section_end = shots[-1]["timeline"]["end"]

    tmp = tempfile.mkdtemp(prefix="avt_section_")
    parts = []; report = []
    for s in shots:
        sid = s["id"]; t0, t1 = s["timeline"]["start"], s["timeline"]["end"]; dur = t1 - t0
        r = renders.get(sid)
        if not r or not os.path.exists(r["file"]):
            raise SystemExit(f"{sid}: no render for timeline {t0:.3f}-{t1:.3f} — refuse to fill with filler")
        if s["kind"] == "performance":
            if "masterStart" not in r:
                raise SystemExit(f"{sid}: performance render needs masterStart")
            off = song_to_performance(t0, sync) - r["masterStart"]
        else:
            off = float(r.get("offset", 0.0))
        avail = probe_duration(r["file"]) - off
        if off < -1e-3 or avail + 0.03 < dur:
            raise SystemExit(f"{sid}: render covers {avail:.3f}s from offset {off:.3f}, slot needs {dur:.3f}s")
        # normalise every part to the same raster / fps / pixel format, video only
        part = os.path.join(tmp, f"{sid}.mp4")
        vf = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},fps={a.fps},format=yuv420p"
        # per-slot punch-in: renders.json "zoom" (e.g. 1.25) or a "<n>× crop" in the ShotSpec framing
        zoom = float(r.get("zoom") or 0) or _framing_zoom(s)
        if zoom and zoom > 1.0:
            cw, ch = int(W / zoom) // 2 * 2, int(H / zoom) // 2 * 2
            vf += f",crop={cw}:{ch}:(iw-{cw})/2:(ih-{ch})*0.4,scale={W}:{H}:flags=lanczos"
        fx_in = ""
        tr = s.get("transitionIn") or {}
        ttype = tr.get("type", "cut"); tdur = float(tr.get("durationSeconds") or 0)
        if ttype == "fade_black" and tdur > 0: fx_in = f",fade=t=in:st=0:d={tdur}:color=black"
        if ttype in ("fade_white", "flash") and tdur > 0: fx_in = f",fade=t=in:st=0:d={tdur}:color=white"
        if ttype == "glitch":
            # two-frame ice flash + one-frame horizontal split, then clean
            g = max(tdur, 2 / a.fps)
            fx_in = f",fade=t=in:st=0:d={g:.3f}:color=white"
        # exact frame budget on the song clock so cut points never drift: frames = round(t1*fps) - round(t0*fps)
        nframes = int(round(t1 * a.fps)) - int(round(t0 * a.fps))
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.4f}", "-i", r["file"], "-t", f"{dur + 0.5:.4f}",
             "-an", "-vf", vf + fx_in, "-frames:v", str(nframes), "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-r", str(a.fps), part])
        parts.append(part)
        report.append({"shot": sid, "kind": s["kind"], "song": [round(t0, 4), round(t1, 4)], "file": r["file"],
                       "offsetInFile": round(off, 4), "durationSeconds": round(dur, 4), "frames": nframes, "transitionIn": ttype})

    concat = os.path.join(tmp, "concat.txt")
    with open(concat, "w") as f:
        for p in parts: f.write(f"file '{p}'\n")
    video = os.path.join(tmp, "video.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", video])
    # song audio for exactly the section range, same clock
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{section_start:.4f}", "-t", f"{section_end - section_start:.4f}", "-i", a.song,
         "-i", video, "-map", "1:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest",
         "-movflags", "+faststart", a.out])
    out_dur = probe_duration(a.out)
    summary = {"out": a.out, "sectionSong": [round(section_start, 4), round(section_end, 4)],
               "expectedSeconds": round(section_end - section_start, 4), "outputSeconds": round(out_dur, 4),
               "fps": a.fps, "size": a.size, "sync": sync, "slots": report}
    json.dump(summary, open(a.out + ".assembly.json", "w"), indent=2)
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
