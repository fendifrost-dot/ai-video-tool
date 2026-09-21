#!/usr/bin/env python3
"""
B-roll / FX slot renderer — data-driven, section-agnostic, deterministic after planning.

Two stages (ChatGPT ruling 2026-09-21 §6: "Recipe inference may propose a recipe during
treatment/planning, but resolve that choice into explicit ShotSpec data before production. The
renderer should execute the recorded recipe rather than repeatedly infer production behavior
from prose."):

  PLAN   python3 scripts/edit/render_broll_slots.py --shotspecs section.shotspecs.json \
             --recipes broll_recipes.json --plan
         For every non-performance ShotSpec: take the recipe named in the recipes JSON, or
         PROPOSE one from the ShotSpec (fx types/descriptions, cameraMotion.type), and record
         the fully resolved choice in the ShotSpec itself at
         `generation.parameters.broll = {recipe, <source fields>, resolvedFrom, resolvedAt}`.
         The shotspecs file is rewritten in place (or --write-shotspecs PATH). Nothing renders.

  RENDER python3 scripts/edit/render_broll_slots.py --shotspecs section.shotspecs.json \
             --renders renders.json --out-dir fx/
         Executes exactly `generation.parameters.broll` for every B-roll shot. No inference
         happens here: a B-roll shot without a recorded recipe FAILS CLOSED ("run --plan"),
         and no filler is ever invented for a slot.

recipes JSON (plan input only) — one entry per B-roll shot id:
  {"S05": {"plate": "plates/diamond.jpg"},                        # recipe proposed from the ShotSpec fx
   "S10": {"plate": "plates/corridor.jpg", "recipe": "still_strobe", "subdivision": 8},
   "S07": {"plate": "plates/city.jpg", "recipe": "still_lateral_push"},
   "S02": {"recipe": "render_macro", "source": "S03", "slotOffset": 1.55,
           "center": [0.56, 0.60], "zoom": [3.2, 3.5], "still": true}}

Recipes (all deterministic, $0, on the song clock):
  still_push          slow push on a still (proposed for a dolly/"slow push" ShotSpec)
  still_push_flash    push + prismatic bloom, whiting out into the next slot's flash-in
                      (proposed when the ShotSpec fx contains "flash")
  still_lateral_push  fast lateral push (proposed when cameraMotion.type is "pan"/"lateral")
  still_strobe        hard strobe on the beat subdivision (proposed when fx contains
                      "glitch" or "strobe"): even eighths cold push, odd eighths mirrored
                      negative ice flash decaying to black
  render_macro        macro punch-in on a performance render (renders.json entry `source`)
                      at `slotOffset` seconds into that shot's slot; `still: true` freezes one
                      clean frame (locked product macro) instead of following motion;
                      `gamma` (default 1.15) lifts dark garments so hardware/stitching reads
Beat timing comes from spec.section.bpm (eighth note = 30 / bpm s); sync from spec.sync.
"""
import argparse, datetime, json, os, subprocess, sys

ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "24"]
PAD = 0.1

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:]); raise SystemExit("ffmpeg failed: " + " ".join(cmd[:6]))

RECIPES = ("still_push", "still_push_flash", "still_lateral_push", "still_strobe", "render_macro")
BROLL_KEY = "broll"  # ShotSpec generation.parameters[BROLL_KEY] — the recorded production recipe

def propose_recipe(shot, rec):
    """PLAN stage only: explicit recipe from the recipes JSON, else a proposal from the ShotSpec."""
    if rec.get("recipe"): return rec["recipe"], "explicit"
    fx = " ".join(str(f.get("type", "")) + " " + str(f.get("description", "")) for f in (shot.get("fx") or [])).lower()
    cm = shot.get("cameraMotion") or {}
    if "flash" in fx or "white" in fx: return "still_push_flash", "inferred"
    if "glitch" in fx or "strobe" in fx: return "still_strobe", "inferred"
    if str(cm.get("type", "")).lower() in ("pan", "lateral", "truck"): return "still_lateral_push", "inferred"
    if rec.get("source"): return "render_macro", "inferred"
    return "still_push", "inferred"

def recorded_recipe(shot):
    """RENDER stage: the recipe the ShotSpec records, or None."""
    params = ((shot.get("generation") or {}).get("parameters") or {})
    rec = params.get(BROLL_KEY)
    return rec if isinstance(rec, dict) and rec.get("recipe") else None

def plan(spec, recipes):
    """Resolve every B-roll shot's recipe into the ShotSpec. Returns the list of (id, recipe, resolvedFrom)."""
    out = []; now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    for shot in spec["shots"]:
        if shot.get("kind") == "performance": continue
        sid = shot["id"]; rec = recipes.get(sid)
        if rec is None: raise SystemExit(f"{sid}: no recipe/plate in the recipes file — refuse to plan filler for a B-roll slot")
        recipe, how = propose_recipe(shot, rec)
        if recipe not in RECIPES: raise SystemExit(f"{sid}: unknown recipe {recipe}")
        if recipe == "render_macro" and not rec.get("source"): raise SystemExit(f"{sid}: render_macro needs `source`")
        if recipe != "render_macro" and not rec.get("plate"): raise SystemExit(f"{sid}: {recipe} needs `plate`")
        resolved = {k: v for k, v in rec.items() if k != "recipe"}
        resolved.update({"recipe": recipe, "resolvedFrom": how, "resolvedAt": now})
        gen = shot.setdefault("generation", {}); params = gen.setdefault("parameters", {}); params[BROLL_KEY] = resolved
        out.append((sid, recipe, how))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shotspecs", required=True)
    ap.add_argument("--plan", action="store_true", help="PLAN stage: resolve recipes into the ShotSpecs and exit (needs --recipes)")
    ap.add_argument("--recipes", default=None, help="recipes JSON (plan input): plates / sources per B-roll shot id")
    ap.add_argument("--write-shotspecs", default=None, help="plan: write the resolved ShotSpecs here instead of in place")
    ap.add_argument("--renders", default=None, help="renders.json (performance renders with masterStart) — needed by render_macro")
    ap.add_argument("--out-dir", default=None); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    a = ap.parse_args()
    spec = json.load(open(a.shotspecs)); shots = {s["id"]: s for s in spec["shots"]}
    if a.plan:
        if not a.recipes: raise SystemExit("--plan needs --recipes")
        planned = plan(spec, json.load(open(a.recipes)))
        dst = a.write_shotspecs or a.shotspecs
        json.dump(spec, open(dst, "w"), indent=2, ensure_ascii=False); open(dst, "a").write("\n")
        for sid, recipe, how in planned: print(f"{sid}: {recipe} ({how}) -> generation.parameters.{BROLL_KEY}")
        print(f"resolved {len(planned)} B-roll shots into {dst}"); return
    if not a.out_dir: raise SystemExit("render needs --out-dir (or use --plan)")
    if a.recipes: raise SystemExit("--recipes is a PLAN input; the render stage executes only what the ShotSpecs record (run --plan first)")
    W, H = (int(x) for x in a.size.lower().split("x")); fps = a.fps
    R = json.load(open(a.renders)) if a.renders else {}
    sync = spec.get("sync", {}); bpm = float((spec.get("section") or {}).get("bpm") or 120)
    s2p = lambda t: (t - sync.get("offsetSeconds", 0.0)) / (1 + sync.get("driftPpm", 0) / 1e6)
    os.makedirs(a.out_dir, exist_ok=True); out_dir = os.path.abspath(a.out_dir); out = {}

    for sid, shot in shots.items():
        if shot.get("kind") == "performance": continue
        rec = recorded_recipe(shot)
        if rec is None: raise SystemExit(f"{sid}: no recorded recipe at generation.parameters.{BROLL_KEY} — run --plan first; the renderer never infers production behaviour or fills a slot")
        d = shot["timeline"]["end"] - shot["timeline"]["start"] + PAD; n = int(round(d * fps))
        recipe = rec["recipe"]; p = os.path.join(out_dir, f"{sid}_{recipe}.mp4")
        big = f"scale={2 * W}:{2 * H}:flags=lanczos"
        if recipe in ("still_push", "still_push_flash", "still_lateral_push"):
            plate = rec["plate"]
            if recipe == "still_lateral_push":
                vf = f"{big},zoompan=z='1.05+0.30*on/{n}':x='iw*0.15+iw*0.25*on/{n}-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={fps},tmix=frames=3,eq=contrast=1.1:saturation=1.05"
            else:
                push = float(rec.get("push", 0.18 if recipe == "still_push_flash" else 0.10))
                vf = f"{big},zoompan=z='1.0+{push}*on/{n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={fps}"
                if recipe == "still_push_flash":
                    fo = float(rec.get("flashOut", 0.25))
                    vf += f",eq=contrast=1.15:saturation=1.1,gblur=sigma=0.6,curves=preset=increase_contrast,fade=t=out:st={max(0.0, d - PAD - fo):.3f}:d={fo:.3f}:color=white"
            run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", plate, "-t", f"{d:.3f}", "-vf", vf, *ENC, p])
        elif recipe == "still_strobe":
            plate = rec["plate"]; sub = int(rec.get("subdivision", 8)); e = (d - PAD) / sub
            fr = max(1, int(round(e * fps)) + (1 if sub * int(round(e * fps)) < n else 0))
            grade = "eq=contrast=1.2:saturation=0.7,colorbalance=bs=0.18:bm=0.10:bh=0.05"
            parts = []
            for k in range(sub):
                pk = os.path.join(out_dir, f"_{sid}_{k}.mp4"); z0 = 1.0 + 0.04 * k
                base = f"{big},zoompan=z='{z0}+0.04*on/{fr}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={fps}"
                vf = base + "," + grade + (",fade=t=in:st=0:d=0.05:color=white" if k else "") if k % 2 == 0 else \
                     base + ",hflip,negate,eq=contrast=1.5:brightness=-0.05:saturation=0.35,colorbalance=bs=0.3:bm=0.2,gblur=sigma=1.2,fade=t=in:st=0:d=0.001:color=white,fade=t=out:st=0.04:d=0.20:color=black"
                run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", plate, "-t", f"{e + 0.1:.3f}", "-vf", vf, "-frames:v", str(fr), *ENC, pk]); parts.append(pk)
            lst = os.path.join(out_dir, f"_{sid}.txt"); open(lst, "w").write("".join(f"file '{x}'\n" for x in parts))
            run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", p])
        elif recipe == "render_macro":
            if not R: raise SystemExit(f"{sid}: render_macro needs --renders")
            src = rec["source"]; r = R[src]; f = r["file"]
            off = s2p(shots[src]["timeline"]["start"]) - float(r["masterStart"]) + float(rec.get("slotOffset", 0.0))
            cx, cy = rec.get("center", [0.5, 0.5]); z0, z1 = rec.get("zoom", [2.6, 2.9])
            zp = f"scale={int(2.2 * W)}:{int(2.2 * H)}:flags=lanczos,zoompan=z='{z0}+{z1 - z0}*on/{n}':x='iw*{cx}-iw/zoom/2':y='ih*{cy}-ih/zoom/2':d=1:s={W}x{H}:fps={fps}"
            gamma = float(rec.get("gamma", 1.15))  # macro detail must read on dark garments in a dark room
            grade = f"eq=contrast=1.1:saturation=0.85:gamma={gamma},colorbalance=bs=0.08:bm=0.04,unsharp=5:5:0.5"
            if rec.get("still", True):
                still = os.path.join(out_dir, f"_{sid}_still.png")
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.3f}", "-i", f, "-frames:v", "1", still])
                run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", still, "-t", f"{d:.3f}", "-vf", f"{zp},{grade},noise=alls=6:allf=t,vignette=PI/4", *ENC, p])
            else:
                run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.3f}", "-i", f, "-t", f"{d:.3f}", "-vf", f"{zp},{grade},vignette=PI/4", *ENC, p])
        else:
            raise SystemExit(f"{sid}: unknown recipe {recipe}")
        out[sid] = {"file": p, "recipe": recipe, "resolvedFrom": rec.get("resolvedFrom"), "resolvedAt": rec.get("resolvedAt")}
        print(f"{sid}: {recipe} -> {os.path.basename(p)}")
    json.dump(out, open(os.path.join(out_dir, "broll_renders.json"), "w"), indent=2)

if __name__ == "__main__":
    main()
