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
Transitions declared on the shot cards (`transitionIn`: a preset name from config/transition_presets.json, or a
type with `beats` / `durationSeconds` and `params`) are rendered by scripts/edit/transitions.py across the cut with
the frame budget of every slot kept — the cut point never moves. Each slot is rendered with up to --handle seconds of
extra source on either side so dissolves, wipes and speed ramps have material; a slot whose source has no handle
degrades to what its own frames allow. The legacy types fade_black / fade_white / flash / glitch still resolve.
"""
import argparse, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

def _splice(part, frames, where, total, a, tmp, tag):
    """Replace the first/last len(frames) frames of `part` with `frames`; the untouched body is trimmed (re-encoded once
    with the same codec settings) and joined with the new frames by the concat demuxer, so the frame count is exact."""
    import transitions as T
    n = len(frames); body = os.path.join(tmp, f"tr_{tag}_{where}_body.mp4"); new = os.path.join(tmp, f"tr_{tag}_{where}_new.mp4"); out = os.path.join(tmp, f"tr_{tag}_{where}_out.mp4")
    sel = f"select='lt(n\\,{total - n})'" if where == "tail" else f"select='gte(n\\,{n})'"
    run(["ffmpeg", "-v", "error", "-y", "-i", part, "-vf", sel + ",setpts=N/FRAME_RATE/TB", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-r", str(a.fps), "-pix_fmt", "yuv420p", body])
    T.write_frames(frames, new, a.fps, a.crf)
    lst = os.path.join(tmp, f"tr_{tag}_{where}.txt")
    with open(lst, "w") as f:
        for q in ([body, new] if where == "tail" else [new, body]): f.write(f"file '{q}'\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])
    os.replace(out, part)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shotspecs", required=True); ap.add_argument("--renders", required=True)
    ap.add_argument("--song", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=int, default=24); ap.add_argument("--size", default="1080x1920")
    ap.add_argument("--crf", type=int, default=17); ap.add_argument("--handle", type=float, default=1.0, help="seconds of extra source rendered on each side of a slot for transitions")
    ap.add_argument("--bpm", type=float, default=None, help="beat grid for transition durations (default: shotspecs 'bpm', else 120)")
    a = ap.parse_args()
    spec = json.load(open(a.shotspecs)); renders = json.load(open(a.renders))
    sync = spec["sync"]; shots = sorted(spec["shots"], key=lambda s: s["timeline"]["start"])
    W, H = (int(x) for x in a.size.lower().split("x"))
    section_start = shots[0]["timeline"]["start"]; section_end = shots[-1]["timeline"]["end"]

    tmp = tempfile.mkdtemp(prefix="avt_section_")
    bpm = a.bpm or float(spec.get("bpm") or (spec.get("treatment") or {}).get("bpm") or 120)
    parts = []; report = []; handles = []
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
        tr = s.get("transitionIn") or {}
        legacy = {"fade_black": "dip_black", "fade_white": "dip_white", "flash": "flash", "glitch": "glitch", "crossfade": "crossfade_1", "whip_pan": "whip_left"}
        if tr.get("type") in legacy and not tr.get("preset"): tr = {**tr, "preset": legacy[tr["type"]]}
        ttype = tr.get("preset") or tr.get("type", "cut")
        # exact frame budget on the song clock so cut points never drift: frames = round(t1*fps) - round(t0*fps)
        nframes = int(round(t1 * a.fps)) - int(round(t0 * a.fps))
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.4f}", "-i", r["file"], "-t", f"{dur + 0.5:.4f}",
             "-an", "-vf", vf, "-frames:v", str(nframes), "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-r", str(a.fps), part])
        parts.append(part)
        # handles for transitions: frames after the slot (tail) and before it (head), from the same source, same raster
        hframes = int(round(a.handle * a.fps)); h_out = h_in = None
        if hframes > 0:
            tail_avail = probe_duration(r["file"]) - (off + dur)
            if tail_avail > 1.0 / a.fps:
                h_out = os.path.join(tmp, f"{sid}.tail.mp4")
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off + dur:.4f}", "-i", r["file"], "-t", f"{a.handle + 0.3:.4f}", "-an", "-vf", vf, "-frames:v", str(min(hframes, int(tail_avail * a.fps))), "-c:v", "libx264", "-preset", "fast", "-crf", str(a.crf), "-r", str(a.fps), h_out])
            if off > 1.0 / a.fps:
                pre = min(a.handle, off); h_in = os.path.join(tmp, f"{sid}.head.mp4")
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off - pre:.4f}", "-i", r["file"], "-t", f"{pre + 0.3:.4f}", "-an", "-vf", vf, "-frames:v", str(int(round(pre * a.fps))), "-c:v", "libx264", "-preset", "fast", "-crf", str(a.crf), "-r", str(a.fps), h_in])
        handles.append({"tail": h_out, "head": h_in, "transitionIn": tr})
        report.append({"shot": sid, "kind": s["kind"], "song": [round(t0, 4), round(t1, 4)], "file": r["file"],
                       "offsetInFile": round(off, 4), "durationSeconds": round(dur, 4), "frames": nframes, "transitionIn": ttype})

    # transitions across every cut, frame budgets untouched; only the affected frames are decoded (memory stays small)
    import transitions as T
    for idx in range(1, len(parts)):
        spec_t = T.resolve(handles[idx]["transitionIn"], bpm, a.fps)
        if spec_t["type"] == "cut": continue
        n_prev = report[idx - 1]["frames"]; n_cur = report[idx]["frames"]
        n_o, n_i = min(spec_t["n_out"], n_prev - 1), min(spec_t["n_in"], n_cur - 1)
        out_frames = T.read_frames(parts[idx - 1], max(0, n_prev - n_o), n_o) if n_o else T.read_frames(parts[idx - 1], n_prev - 1, 1)[:0]
        in_frames = T.read_frames(parts[idx], 0, n_i) if n_i else T.read_frames(parts[idx], 0, 1)[:0]
        edge_o = T.read_frames(parts[idx - 1], n_prev - 1, 1); edge_i = T.read_frames(parts[idx], 0, 1)
        out_handle = T.read_frames(handles[idx - 1]["tail"]) if handles[idx - 1]["tail"] else edge_o[:0]
        in_handle = T.read_frames(handles[idx]["head"]) if handles[idx]["head"] else edge_i[:0]
        o, i = T.LIB[spec_t["type"]]((out_frames if n_o else edge_o).copy(), (in_frames if n_i else edge_i).copy(), out_handle, in_handle, spec_t["params"])
        if n_o: _splice(parts[idx - 1], o[:n_o], "tail", n_prev, a, tmp, f"{idx - 1}")
        if n_i: _splice(parts[idx], i[:n_i], "head", n_cur, a, tmp, f"{idx}")
        report[idx]["transition"] = {k: v for k, v in spec_t.items() if k != "params"}
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
