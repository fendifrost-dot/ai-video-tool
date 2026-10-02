#!/usr/bin/env python3
"""
COVERAGE — turn one performance take per slot into a coverage set: cuts on the grid, a camera move on every cut,
angle rotation, and (optionally) generated angles from the same take. Deterministic, $0 for the camera moves.

  python3 scripts/edit/camera_coverage.py plan   --shotspecs spec.json --renders renders.json --out cov/ --bpm 122 \\
        [--lyric-lines lyric_lines.json] [--presets config/coverage_presets.json] [--angles 0|N] [--seed 7]
  python3 scripts/edit/camera_coverage.py render --plan cov/coverage_plan.json [--size 1080x1920] [--fps 24] [--workers 2]
  then: assemble_section.py --shotspecs cov/shotspecs_coverage.json --renders cov/renders_coverage.json …

Named camera_coverage.py (not coverage.py): a script in this folder named coverage.py shadows the `coverage` package for
anything run from here that imports numba/rembg (composite_environment.py --matte rembg, --occluder-auto) — measured 2026-10-02.

Why (Fendi, 2026-10-02): "music videos are almost always filled with lots of camera movement and switching of angles …
I would have to do each performance shot 3–6× to get the different camera angle cuts … this should be the norm for the
tool, not the exception." The drafts had one take, one angle, one static frame per slot. This makes coverage the default.

plan — for every PERFORMANCE slot in the shotspecs:
  * the section (verse/hook/bridge) comes from the timed lyric lines under the slot, else the shot's own section field,
    else "default"; the section's preset (config/coverage_presets.json) gives the move vocabulary and odds, how often
    to cut, the share of cuts that are generated angles, and the transition on the 1;
  * the slot is split into sub-slots on the bar grid (cut_every_bars; never shorter than rules.min_cut_bars);
  * each sub-slot gets a MOVE drawn deterministically (seeded by the slot id) under the rules: no move repeats the
    previous one, pushes and pulls alternate, the static share stays under rules.static_share_max, framing rotates;
  * a share of sub-slots (generated_angle_share) is marked as a GENERATED ANGLE: a Seedance reference-to-video request
    (the real take as @Video1, the angle sentence from the preset) written to angle_requests.json for
    run_world_batch.py --route seedance_ref; until that clip exists the sub-slot falls back to a camera move on the take;
  * outputs: coverage_plan.json (everything), shotspecs_coverage.json (the sub-slots as shots, cameraMotion filled,
    transitionIn set), renders_coverage.json (sub-slot → variant file), angle_requests.json.

render — renders the variants named in the plan from the slot's source clip: a 2D virtual camera (zoom / pan / roll /
handheld from camera_engine.camera_path, the lens stack from lens_presets.json) over the finished slot clip; or the
2.5D camera (camera_engine.py, depth parallax) when the slot has a matte export (`matte_dir` + `plate` in renders.json).
The move spans exactly the sub-slot's window inside the source clip, so the assembler can cut the sub-slot out of the
variant with the slot's own masterStart. Nothing here knows a project or a song.
"""
import argparse, hashlib, json, math, os, subprocess, sys
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, "scripts", "_lib"))
import camera_engine as CE   # noqa: E402  (camera_path, handheld, lens_post)
from jobs import job          # noqa: E402

PRESETS_DEFAULT = os.path.join(ROOT, "config", "coverage_presets.json")
LENSES = json.load(open(os.path.join(HERE, "lens_presets.json")))["presets"]


# ----------------------------------------------------------------------------- helpers
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: sys.stderr.write(r.stderr[-3000:]); raise SystemExit("command failed: " + " ".join(cmd[:4]))
    return r.stdout


def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", path]))
    s = j["streams"][0]; num, den = s["r_frame_rate"].split("/")
    return int(s["width"]), int(s["height"]), float(num) / float(den), float(j["format"]["duration"])


def rng_for(key, seed):
    h = int(hashlib.sha256(f"{seed}:{key}".encode()).hexdigest()[:16], 16)
    return np.random.default_rng(h)


def weighted(rng, items, exclude=None):
    pool = [it for it in items if not (exclude and it.get("type") == exclude and len(items) > 1)]
    w = np.array([float(it.get("weight", 1)) for it in pool]); w = w / w.sum()
    return pool[int(rng.choice(len(pool), p=w))]


def section_of(t0, t1, lyric_lines):
    """the section sung most inside [t0, t1): verse/hook/…; None when nothing is sung."""
    if not lyric_lines: return None
    tally = {}
    for l in lyric_lines:
        ov = min(l["end"], t1) - max(l["start"], t0)
        if ov > 0 and not l.get("suspect"): tally[l["section"]] = tally.get(l["section"], 0) + ov
    return max(tally, key=tally.get) if tally else None


# ----------------------------------------------------------------------------- plan
# The treatment writes the camera as prose ("50mm macro, slight push-in", "24mm wide shot, locked frame"); the same
# patterns as src/lib/treatment/coverage.ts MOTION_WORDS read it into the engine's move vocabulary. The director's
# camera on a slot is honoured on its FIRST sub-slot (an explicit static included, within the budget); the rest of the
# slot's sub-slots are drawn from the section's vocabulary so the line still gets its coverage.
MOTION_WORDS = [
    ("static", r"\b(locked[- ]?(off|frame)?|static|tripod|no (camera )?move(ment)?|still camera|fixed (frame|camera))\b"),
    ("dolly_zoom", r"\b(dolly[- ]?zoom|vertigo|zolly)\b"),
    ("snap_zoom", r"\b(snap[- ]?zoom|crash[- ]?zoom|zoom (in|out)|zoom)\b"),
    ("whip_pan", r"\b(whip[- ]?pan|whip)\b"),
    ("orbit", r"\b(orbit|arc(ing)?|circl(e|ing)|360)\b"),
    ("crane", r"\b(crane|jib|boom|rise[s]? (up|over)|descend(s|ing)?|lift(s|ing)? (up|over))\b"),
    ("pedestal", r"\b(pedestal|tilt(s|ing)? (up|down))\b"),
    ("push", r"\b(push(es|ing)?[- ]?in|push|dolly[- ]?in|track(s|ing)? in|move(s|ing)? (in|closer)|creep(s|ing)? in)\b"),
    ("pull", r"\b(pull(s|ing)?[- ]?(out|back)|dolly[- ]?(out|back)|track(s|ing)? (out|back)|move(s|ing)? (out|back|away)|widen(s|ing)?)\b"),
    ("truck", r"\b(truck(s|ing)?|lateral|slide(s|ing)?|track(s|ing)? (left|right|along|with)|crab)\b"),
    ("pan", r"\b(pan(s|ning)?)\b"),
    ("handheld", r"\b(hand[- ]?held|drift(s|ing)?|breath(es|ing)?|sway)\b"),
]
CARD_TO_ENGINE = {"dolly": "push", "truck": "truck", "pedestal": "pedestal", "crane": "crane", "orbit": "orbit", "whip_pan": "whip_pan", "zoom": "snap_zoom", "pan": "pan", "tilt": "pedestal", "handheld": "handheld", "steadicam": "handheld", "gimbal": "handheld", "jib": "crane", "static": "static"}


def classify_motion(cm):
    """Engine move named by a shot's cameraMotion (prose first, then the typed field); '' when nothing is named."""
    import re
    cm = cm or {}; desc = cm.get("description") or ""
    for move, pat in MOTION_WORDS:
        if re.search(pat, desc, re.I): return move
    t = cm.get("type") or "static"
    if t != "static": return CARD_TO_ENGINE.get(t, t)
    return "" if desc.strip() else "static"


def directors_move(cm, moves):
    """The slot's written camera as a move spec from the section vocabulary (amount/lens/handheld from the nearest preset)."""
    name = classify_motion(cm)
    if not name: return None
    for m in moves:
        if m["type"] == name: return dict(m)
    base = next((m for m in moves if m["type"] not in ("static",)), moves[0])
    return dict(base, type=name) if name in ("push", "pull", "truck", "pedestal", "crane", "orbit", "whip_pan", "snap_zoom", "dolly_zoom", "static", "pan", "handheld") else None


def plan(a):
    spec = json.load(open(a.shotspecs)); renders = json.load(open(a.renders)); presets = json.load(open(a.presets))
    rules = presets["rules"]; bar = 240.0 / a.bpm
    lines = None
    if a.lyric_lines:
        d = json.load(open(a.lyric_lines)); lines = d["lines"] if isinstance(d, dict) else d
        for l in lines:
            l.setdefault("start", l.get("start_seconds")); l.setdefault("end", l.get("end_seconds"))
    shots = sorted(spec["shots"], key=lambda s: s["timeline"]["start"]); sec0 = shots[0]["timeline"]["start"]
    out_shots, out_renders, angle_reqs, plan_slots = [], {}, [], []
    static_total = 0.0; total = 0.0; prev_move = None; prev_zoom_dir = None; framing_i = 0; prev_angle = None; static_run = 0.0
    max_run = float(rules.get("max_static_run_s", 4.0)); share_max = float(rules.get("static_share_max", 0.12)); honoured = 0
    os.makedirs(a.out, exist_ok=True)
    for s in shots:
        sid = s["id"]; t0, t1 = s["timeline"]["start"], s["timeline"]["end"]; r = renders.get(sid)
        if s.get("kind") != "performance" or not r:
            out_shots.append(s); out_renders[sid] = r; continue
        section = section_of(t0, t1, lines) or s.get("section") or "default"
        P = presets["sections"].get(section) or presets["sections"]["default"]
        # sub-slots on the bar grid
        k0 = int(round((t0 - sec0) / bar)); edges = [t0]
        step = max(float(P.get("cut_every_bars", 2)), float(rules.get("min_cut_bars", 1)))
        b = k0 + step
        while sec0 + b * bar < t1 - 0.5 * bar: edges.append(sec0 + b * bar); b += step
        edges.append(t1)
        rng = rng_for(sid, a.seed); subs = []
        n_sub = len(edges) - 1; n_gen = int(round(n_sub * float(P.get("generated_angle_share", 0)))) if a.angles else 0
        gen_idx = set(int(i) for i in rng.choice(n_sub, size=min(n_gen, n_sub), replace=False)) if n_gen else set()
        written = directors_move(s.get("cameraMotion"), P["moves"])
        for i in range(n_sub):
            u0, u1 = edges[i], edges[i + 1]; dur = u1 - u0
            static_would_break = (total > 0 and (static_total + dur) / (total + dur) > share_max) or static_run + dur > max_run
            if i == 0 and written and not (written["type"] == "static" and static_would_break):
                move = written; honoured += 1          # the director's camera leads the slot
            else:
                move = weighted(rng, P["moves"], exclude=prev_move if rules.get("no_repeat_move_consecutive") else None)
                if rules.get("zoom_alternate") and move["type"] in ("push", "pull") and prev_zoom_dir == move["type"]:
                    move = dict(move, type="pull" if move["type"] == "push" else "push")
                if move["type"] == "static" and static_would_break:
                    move = weighted(rng, [m for m in P["moves"] if m["type"] != "static"])
            if move["type"] == "static": static_total += dur; static_run += dur
            else: static_run = 0.0
            total += dur
            framing = rules["framing_rotation"][framing_i % len(rules["framing_rotation"])]; framing_i += 1
            sub_id = f"{sid}{chr(97 + i)}"
            # move window as a fraction of the SOURCE SLOT clip (the assembler cuts the sub-slot out of the full variant)
            w0, w1 = (u0 - t0) / (t1 - t0), (u1 - t0) / (t1 - t0)
            cam = {"type": move["type"], "amount": float(move.get("amount", 0)), "ease": move.get("ease", "in_out"), "start": round(w0, 4), "end": round(w1, 4),
                   "direction": ["left", "right"][int(rng.integers(0, 2))]}
            entry = {"id": sub_id, "slot": sid, "section": section, "song": [round(u0, 4), round(u1, 4)], "move": cam, "handheld": float(move.get("handheld", 0.3)), "lens": move.get("lens", "anamorphic_35"), "framing": framing,
                     "source": "take", "variant": os.path.join(a.out, "variants", f"{sub_id}_{move['type']}.mp4")}
            if i in gen_idx and P.get("angles"):
                ang = weighted(rng, P["angles"], exclude=None)
                if ang["name"] == prev_angle and len(P["angles"]) > 1: ang = weighted(rng, [x for x in P["angles"] if x["name"] != prev_angle])
                prev_angle = ang["name"]
                entry.update({"source": "angle", "angle": ang["name"], "angle_sentence": ang["sentence"], "angle_file": os.path.join(a.out, "angles", f"{sub_id}_{ang['name']}.mp4")})
                angle_reqs.append({"id": f"{sub_id}_{ang['name']}", "kind": "angle", "route": "seedance_ref", "aspect": "9:16", "resolution": "720p", "source_path": r.get("source_path"), "source_local": r["file"],
                                   "source_window": [round(u0, 3), round(u1, 3)], "masterStart": r.get("masterStart"), "angle": ang["sentence"], "keep": r.get("keep", []), "prompt": "(angle shot)"})
            subs.append(entry); prev_move = move["type"]
            if move["type"] in ("push", "pull"): prev_zoom_dir = move["type"]
            on_the_1 = abs(((u0 - sec0) / bar) - round((u0 - sec0) / bar)) < 0.05 and (round((u0 - sec0) / bar) % 4 == 0)
            tr = P.get("transition_on_the_1", "cut") if on_the_1 else P.get("transition_elsewhere", "cut")
            shot = dict(s); shot["id"] = sub_id; shot["timeline"] = {"start": u0, "end": u1}
            shot["cameraMotion"] = {"type": cam["type"], "description": f"{cam['type']} {cam['amount']:.2f} ({move.get('lens', '')}, handheld {move.get('handheld', 0)})"}
            shot["framing"] = framing; shot["transitionIn"] = {"preset": tr} if i > 0 or tr != "cut" else {"type": "cut"}
            shot["coverage"] = {"source": entry["source"], "section": section, "angle": entry.get("angle")}
            out_shots.append(shot)
            out_renders[sub_id] = {"file": entry["angle_file"] if entry["source"] == "angle" and os.path.exists(entry.get("angle_file", "")) else entry["variant"], "masterStart": r.get("masterStart"), "_fallback": entry["variant"]}
        plan_slots.append({"slot": sid, "section": section, "song": [t0, t1], "source": r["file"], "masterStart": r.get("masterStart"), "matte_dir": r.get("matte_dir"), "plate": r.get("plate"), "plate_loop": bool(r.get("plate_loop")), "subs": subs})
    cov = {"bpm": a.bpm, "presets": a.presets, "seed": a.seed, "section_song": [sec0, shots[-1]["timeline"]["end"]], "slots": plan_slots,
           "stats": {"performance_slots": len(plan_slots), "cuts": sum(len(p["subs"]) for p in plan_slots), "generated_angles": len(angle_reqs), "static_share": round(static_total / max(1e-6, total), 3), "directors_cameras_honoured": honoured}}
    json.dump(cov, open(os.path.join(a.out, "coverage_plan.json"), "w"), indent=1)
    out_spec = dict(spec); out_spec["shots"] = out_shots; json.dump(out_spec, open(os.path.join(a.out, "shotspecs_coverage.json"), "w"), indent=1)
    json.dump(out_renders, open(os.path.join(a.out, "renders_coverage.json"), "w"), indent=1)
    json.dump(angle_reqs, open(os.path.join(a.out, "angle_requests.json"), "w"), indent=1)
    print(json.dumps(cov["stats"]))
    for p in plan_slots: print(p["slot"], p["section"], " | ".join(f"{x['id']}:{x['move']['type']}{'/' + x['angle'] if x['source'] == 'angle' else ''}" for x in p["subs"]))


# ----------------------------------------------------------------------------- render (2D camera over a finished clip)
def render_2d(src, out, move, handheld, lens_name, fps_out, W, H, crf=16):
    w, h, fps, dur = probe(src); n = int(round(dur * fps))
    path = CE.camera_path(move, n, fps, handheld=handheld); lens = LENSES[lens_name]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2); vignette = np.clip((r - 0.55) / 0.9, 0, 1) ** 1.5
    grain_rng = np.random.default_rng(11)
    # the base scale fills the output and leaves room for the move's largest excursion (no black edges)
    max_pan = float(np.max(np.abs(path["px"])) + np.max(np.abs(path["py"]))); base = 1.0 + 2.2 * max_pan + 0.02
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-r", str(fps), out], stdin=subprocess.PIPE)
    i = 0; prev = (0.0, 0.0)
    while True:
        buf = dec.stdout.read(W * H * 3)
        if len(buf) < W * H * 3: break
        f = np.frombuffer(buf, np.uint8).reshape(H, W, 3); k = min(i, n - 1)
        z = base * float(path["zoom"][k]) * float(path["plate_zoom"][k]) if path["kind"] != "dolly_zoom" else base * float(path["zoom"][k])
        if path["kind"] == "orbit": px = float(path["px"][k]) + 0.3 * float(path["orbit"][k]); roll = float(path["roll"][k]) + 1.2 * float(path["orbit"][k])   # 2D stand-in: a lateral drift with a touch of roll; the true orbit is the 2.5D camera
        else: px = float(path["px"][k]); roll = float(path["roll"][k])
        py = float(path["py"][k])
        M = cv2.getRotationMatrix2D((W / 2, H / 2), roll, z); M[0, 2] -= px * W; M[1, 2] -= py * H
        g = cv2.warpAffine(f, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        vel = ((px * W) - prev[0], (py * H) - prev[1]); prev = (px * W, py * H)
        g = CE.lens_post(g, lens, vel, grain_rng, vignette)
        enc.stdin.write(g.tobytes()); i += 1
    dec.stdout.close(); enc.stdin.close(); enc.wait()
    # keep the source audio so the assembler's offsets stay valid
    tmp = out + ".a.mp4"; subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-i", src, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", tmp]); os.replace(tmp, out)
    return i


def render(a):
    cov = json.load(open(a.plan)); W, H = (int(x) for x in a.size.lower().split("x"))
    todo = []
    for p in cov["slots"]:
        for sub in p["subs"]:
            if os.path.exists(sub["variant"]) and not a.force: continue
            todo.append((p, sub))
    print(f"{len(todo)} variants to render")
    os.makedirs(os.path.join(os.path.dirname(a.plan), "variants"), exist_ok=True)
    with job("coverage", need_gb=1.0, out=a.plan):
        for p, sub in todo:
            if p.get("matte_dir") and p.get("plate") and os.path.isdir(p["matte_dir"]):
                # 2.5D renders only the sub-slot's WINDOW (+ the assembler's handle on each side), not the whole slot:
                # a slot cut three ways used to be rendered three times over. The variant's masterStart moves with it.
                n_m = len([f for f in os.listdir(p["matte_dir"]) if f.startswith("alpha_")])
                w0, w1 = float(sub["move"].get("start", 0.0)), float(sub["move"].get("end", 1.0)); hnd = int(round(a.handle * a.fps))
                f0 = max(0, int(math.floor(w0 * n_m)) - hnd); f1 = min(n_m, int(math.ceil(w1 * n_m)) + hnd)
                span = max(1, f1 - f0)
                move = dict(sub["move"], start=round((w0 * n_m - f0) / span, 5), end=round((w1 * n_m - f0) / span, 5))
                spec = {"move": move, "lens": sub["lens"], "handheld": sub["handheld"]}
                cmd = [sys.executable, os.path.join(HERE, "camera_engine.py"), "--matte-dir", p["matte_dir"], "--plate", p["plate"], "--spec", json.dumps(spec), "--out", sub["variant"], "--audio", p["source"], "--size", a.size, "--fps", str(a.fps), "--crf", str(a.crf), "--range", f"{f0}:{f1}"]
                if p.get("plate_loop"): cmd.append("--plate-loop")
                run(cmd)
                # the window starts f0 frames into the slot: shift the variant's masterStart so the assembler's clock holds
                rpath = os.path.join(os.path.dirname(a.plan), "renders_coverage.json"); R = json.load(open(rpath))
                if sub["id"] in R and R[sub["id"]].get("file") == sub["variant"] and p.get("masterStart") is not None:
                    R[sub["id"]]["masterStart"] = round(float(p["masterStart"]) + f0 / a.fps, 4); R[sub["id"]]["window_frames"] = [f0, f1]
                    json.dump(R, open(rpath, "w"), indent=1)
                mode = f"2.5d[{f0}:{f1}]"
            else:
                render_2d(p["source"], sub["variant"], sub["move"], sub["handheld"], sub["lens"], a.fps, W, H, a.crf); mode = "2d"
            print(sub["id"], mode, sub["move"]["type"], os.path.basename(sub["variant"]), flush=True)


def main():
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("plan"); p.add_argument("--shotspecs", required=True); p.add_argument("--renders", required=True); p.add_argument("--out", required=True); p.add_argument("--bpm", type=float, required=True)
    p.add_argument("--lyric-lines", default=None); p.add_argument("--presets", default=PRESETS_DEFAULT); p.add_argument("--angles", type=int, default=1, help="0 = no generated-angle requests (camera moves only)"); p.add_argument("--seed", type=int, default=7)
    r = sp.add_parser("render"); r.add_argument("--plan", required=True); r.add_argument("--size", default="1080x1920"); r.add_argument("--fps", type=int, default=24); r.add_argument("--crf", type=int, default=16); r.add_argument("--force", action="store_true"); r.add_argument("--handle", type=float, default=1.0, help="seconds rendered beyond the sub-slot window on each side (the assembler's transition handles)")
    a = ap.parse_args()
    plan(a) if a.cmd == "plan" else render(a)


if __name__ == "__main__":
    main()
