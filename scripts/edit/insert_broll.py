#!/usr/bin/env python3
"""
INSERT B-ROLL — cut gated lyric B-roll into a finished section on the bar grid (deterministic, $0).

  python3 scripts/edit/insert_broll.py --section out/section_v20.mp4 --assembly section_v19.assembly.json \\
      --manifest broll_batch/manifest.json --lyric-map lyric_windows.json --bpm 122 --out out/section_v21.mp4 \\
      [--bars 1] [--skip-head 0.75] [--min-verdict REVIEW] [--replace-generated] [--max-per-slot 1]

Inputs (all data, nothing shot- or project-specific in the code):
  --section   the finished section render (its audio is kept untouched: the song clock never moves)
  --assembly  the assembler's JSON for that section (slots with song windows and kinds)
  --manifest  run_broll_batch.py output: per lyric ref a clip file and a gate verdict
  --lyric-map {ref: [songStart, songEnd]} — where each lyric line sits on the song (from the shot table's LYRIC notes)
  --bpm       the song's tempo; inserts are --bars long and start on a bar line inside the lyric window

Rules:
  * a clip is used only when its gate verdict is at least --min-verdict (PASS > REVIEW > REJECT)
  * a generated (FX) slot whose window overlaps a lyric window is REPLACED by that lyric's clip (--replace-generated)
  * otherwise the insert is cut INTO the performance slot that contains the lyric window, starting on the first bar
    line ≥ max(slot start, lyric start) and lasting --bars bars, never crossing the slot's end
  * clips are read from --skip-head seconds in (image-to-video clips carry the composited still for the first frames),
    scaled/cropped to the section's size and conformed to its fps; audio is the section's own
Writes <out> and <out>.inserts.json (what went where, and why anything was skipped).
"""
import argparse, json, os, subprocess, sys, tempfile

ORDER = {"PASS": 2, "REVIEW": 1, "REJECT": 0}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: sys.stderr.write(r.stderr[-3000:]); raise SystemExit("ffmpeg failed")
    return r.stdout


def probe(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", path]); j = json.loads(out)
    s = j["streams"][0]; num, den = s["r_frame_rate"].split("/"); return int(s["width"]), int(s["height"]), float(num) / float(den), float(j["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--section", required=True); ap.add_argument("--assembly", required=True); ap.add_argument("--manifest", required=True); ap.add_argument("--lyric-map", required=True)
    ap.add_argument("--bpm", type=float, required=True); ap.add_argument("--out", required=True); ap.add_argument("--bars", type=float, default=1.0); ap.add_argument("--skip-head", type=float, default=0.75)
    ap.add_argument("--min-verdict", choices=["PASS", "REVIEW"], default="REVIEW"); ap.add_argument("--replace-generated", action="store_true"); ap.add_argument("--max-per-slot", type=int, default=1)
    ap.add_argument("--crf", type=int, default=17); ap.add_argument("--no-perf-split", action="store_true", help="only replace generated slots, never cut into performance")
    a = ap.parse_args()
    asm = json.load(open(a.assembly)); man = json.load(open(a.manifest)); lmap = json.load(open(a.lyric_map))
    W, H, fps, dur = probe(a.section); sec0 = float(asm["sectionSong"][0]); bar = 240.0 / a.bpm
    slots = []
    for s in asm["slots"]:
        s0, s1 = json.loads(s["song"]) if isinstance(s["song"], str) else s["song"]; slots.append({"shot": s["shot"], "kind": s["kind"], "song": [float(s0), float(s1)], "used": 0})
    clips = {p["ref"]: p for p in man["plan"] if p.get("file") and os.path.exists(p["file"])}
    inserts = []; skipped = []
    for ref, win in lmap.items():
        p = clips.get(ref)
        if not p: skipped.append({"ref": ref, "why": "no clip"}); continue
        v = (p.get("gate") or {}).get("verdict", "REVIEW")
        if ORDER.get(v, 0) < ORDER[a.min_verdict]: skipped.append({"ref": ref, "why": f"gate {v}"}); continue
        l0, l1 = float(win[0]), float(win[1]); placed = False
        # 1. replace an overlapping generated slot
        if a.replace_generated:
            for s in slots:
                if s["kind"] == "generated" and s["used"] < a.max_per_slot and s["song"][0] < l1 and s["song"][1] > l0:
                    inserts.append({"ref": ref, "slot": s["shot"], "mode": "replace", "song": s["song"], "file": p["file"], "verdict": v, "title": p.get("title")}); s["used"] += 1; placed = True; break
        # 2. cut into the performance slot on a bar line
        if not placed and not a.no_perf_split:
            for s in slots:
                if s["kind"] != "performance" or s["used"] >= a.max_per_slot: continue
                if s["song"][1] <= l0 or s["song"][0] >= l1: continue
                start = max(s["song"][0], l0); k = int((start - sec0) / bar + 0.999999); t0 = sec0 + k * bar
                t1 = min(t0 + a.bars * bar, s["song"][1], l1 + bar)
                if t1 - t0 < 0.5 * bar or t0 >= s["song"][1]: continue
                inserts.append({"ref": ref, "slot": s["shot"], "mode": "split", "song": [t0, t1], "file": p["file"], "verdict": v, "title": p.get("title")}); s["used"] += 1; placed = True; break
        if not placed: skipped.append({"ref": ref, "why": "no slot window"})
    inserts.sort(key=lambda i: i["song"][0])
    # overlay chain: each insert is trimmed from skip_head, conformed, and overlaid at its section time; audio untouched
    tmp = tempfile.mkdtemp(prefix="avt_ins_"); cur = a.section
    for n, ins in enumerate(inserts):
        t0, t1 = ins["song"][0] - sec0, ins["song"][1] - sec0; L = t1 - t0
        _, _, cfps, cdur = probe(ins["file"]); head = min(a.skip_head, max(0.0, cdur - L - 0.05))
        seg = os.path.join(tmp, f"seg{n}.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{head:.3f}", "-t", f"{L:.4f}", "-i", ins["file"], "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={fps}", "-an", "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-pix_fmt", "yuv420p", seg])
        nxt = os.path.join(tmp, f"cut{n}.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-i", cur, "-i", seg, "-filter_complex", f"[1:v]setpts=PTS+{t0:.4f}/TB[ins];[0:v][ins]overlay=0:0:enable='between(t,{t0:.4f},{t1:.4f})':eof_action=pass[v]", "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", str(a.crf), "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "copy", nxt])
        cur = nxt; ins["head_skipped"] = head; ins["section_time"] = [t0, t1]
    if inserts:
        run(["ffmpeg", "-v", "error", "-y", "-i", cur, "-c", "copy", "-movflags", "+faststart", a.out])
    else:
        sys.stderr.write("no inserts placed\n")
    json.dump({"section": a.section, "out": a.out, "bpm": a.bpm, "bar_seconds": bar, "inserts": inserts, "skipped": skipped}, open(a.out + ".inserts.json", "w"), indent=1)
    print(json.dumps({"inserts": [(i["ref"], i["slot"], i["mode"], [round(x, 3) for x in i["song"]], i["verdict"]) for i in inserts], "skipped": skipped}))


if __name__ == "__main__":
    main()
