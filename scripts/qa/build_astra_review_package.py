#!/usr/bin/env python3
"""
Build the Astra visual-QA review package for a completed draft (deterministic, $0).

  python3 scripts/qa/build_astra_review_package.py \
      --draft out/section_v1.mp4 --shotspecs docs/treatments/<x>.shotspecs.json \
      --assembly out/section_v1.mp4.assembly.json --draft-id YSL_IceOn_bars24-46_v1 \
      --ref "Look 1 flat product photo=refs/track_flat.jpg" --ref "Look 2 flat product photo=refs/trucker.jpg" \
      --ref "Identity anchor: the performer, original master frame=refs/identity.jpg" \
      --ref "Source performance contact sheet (original location)=refs/source_sheet.jpg" \
      --out astra_pkg/

gpt-6-astra takes text + images only (no video on the API), so the draft is handed over as
dense TIMESTAMPED FRAME SEQUENCES — the documented way to do temporal review with Astra:
  parts/shots-*.json      per shot group, 3 fps (6 fps for slots < 2.5 s)      → Level 1 shot conformance
  parts/transitions.json  ±0.25 s at 12 fps around every cut                      → Level 2 edit review
  parts/sequence.json     2 fps across the whole draft                            → Level 3 treatment conformance
Each part = { instructions, frames[{label,file}], references[{label,file}], jsonSchema } for
supabase/functions/astra-visual-review-proxy. Frames are 540x960 JPEG (~70 KB) so a part stays
under the proxy's image cap and the browser can inline them as data URLs.
"""
import argparse, json, os, subprocess, sys

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:]); raise SystemExit("ffmpeg failed")

DRAFT_FPS = 24.0

def snap(t, fps=DRAFT_FPS):
    """Snap a sample time to the presentation time of the frame that contains it (frame n = floor(t*fps)).
    ffmpeg -ss returns the first frame with pts >= ss, so seeking to an unsnapped t could hand back the NEXT
    frame while the label still said t — across a cut that mislabels the incoming shot as 'before the cut'
    (Astra review #2, SEQ-CUT-BOUNDARY-OFFSET, ~1/24 s)."""
    return int(t * fps + 1e-6) / fps

def grab(draft, t, path, w=540, h=960):
    """Grabs frame floor(t*fps) exactly (seek to half a frame before its pts). Returns False past the last frame."""
    ts = snap(t)
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0.0, ts - 0.5 / DRAFT_FPS):.4f}", "-i", draft, "-frames:v", "1", "-vf", f"scale={w}:{h}:flags=lanczos", "-q:v", "4", path])
    return os.path.exists(path)

def fmt(t): return f"{int(t//60)}:{t%60:06.3f}"

# ---- strict JSON schemas (Responses API json_schema, strict=true: all keys required, no extras) ----
VERDICT = {"type": "string", "enum": ["PASS", "FAIL", "PARTIAL", "UNCERTAIN"]}
SEV = {"type": "string", "enum": ["blocker", "major", "minor", "note"]}
CAT = {"type": "string", "enum": ["wardrobe", "identity", "environment", "framing", "transition", "sync", "broll", "artifact", "quality", "continuity", "creative_intent"]}
OWNER = {"type": "string", "enum": ["wardrobe_generation", "temporal_propagation", "brand_repair", "identity", "environment", "compositing_mask", "edit_fx", "source_range", "sync", "broll", "export_quality", "treatment", "unknown"]}
NUM2 = {"type": "array", "items": {"type": "number"}, "description": "exactly two numbers [start, end]"}
DEFECT = {"type": "object", "additionalProperties": False, "required": ["defect_id", "severity", "category", "time_range", "shot_id", "description", "evidence", "recommended_owner", "recommended_action", "requires_treatment_change"],
          "properties": {"defect_id": {"type": "string", "description": "stable id like S12-WORDMARK-SCALE; reuse the same id for the same defect in later reviews"},
                         "severity": SEV, "category": CAT,
                         "time_range": {**NUM2, "description": "DRAFT seconds [start,end]"},
                         "shot_id": {"type": ["string", "null"]}, "description": {"type": "string"},
                         "evidence": {"type": "string", "description": "what you saw, with draft timecodes and frame labels"},
                         "recommended_owner": OWNER, "recommended_action": {"type": "string"},
                         "requires_treatment_change": {"type": "boolean"}}}
SHOT = {"type": "object", "additionalProperties": False, "required": ["shot_id", "verdict", "confidence", "expected", "observed", "observations", "defect_ids", "recommended_owner", "recommended_action"],
        "properties": {"shot_id": {"type": "string"}, "verdict": VERDICT, "confidence": {"type": "number"}, "expected": {"type": "string"}, "observed": {"type": "string"},
                       "observations": {"type": "array", "items": {"type": "string"}}, "defect_ids": {"type": "array", "items": {"type": "string"}},
                       "recommended_owner": {"type": "string", "enum": list(OWNER["enum"]) + ["none"]}, "recommended_action": {"type": ["string", "null"]}}}
TRANS = {"type": "object", "additionalProperties": False, "required": ["from_shot", "to_shot", "draft_time", "verdict", "expected", "observed", "defect_ids", "recommended_action"],
         "properties": {"from_shot": {"type": "string"}, "to_shot": {"type": "string"}, "draft_time": {"type": "number"}, "verdict": VERDICT, "expected": {"type": "string"}, "observed": {"type": "string"},
                        "defect_ids": {"type": "array", "items": {"type": "string"}}, "recommended_action": {"type": ["string", "null"]}}}
SCORE = {"type": "integer", "description": "0-10"}
SCHEMA_SHOTS = {"name": "astra_shot_review", "schema": {"type": "object", "additionalProperties": False, "required": ["shots", "defects"], "properties": {"shots": {"type": "array", "items": SHOT}, "defects": {"type": "array", "items": DEFECT}}}}
SCHEMA_TRANS = {"name": "astra_transition_review", "schema": {"type": "object", "additionalProperties": False, "required": ["transitions", "defects"], "properties": {"transitions": {"type": "array", "items": TRANS}, "defects": {"type": "array", "items": DEFECT}}}}
SCHEMA_SEQ = {"name": "astra_sequence_review", "schema": {"type": "object", "additionalProperties": False, "required": ["overall", "answers", "defects", "final_verdict", "escalate_to_fendi"],
              "properties": {"overall": {"type": "object", "additionalProperties": False, "required": ["treatment_conformance", "visual_coherence", "identity_preservation", "wardrobe_conformance", "environment_conformance", "edit_transition_conformance", "summary"],
                                         "properties": {"treatment_conformance": SCORE, "visual_coherence": SCORE, "identity_preservation": SCORE, "wardrobe_conformance": SCORE, "environment_conformance": SCORE, "edit_transition_conformance": SCORE, "summary": {"type": "string"}}},
                             "answers": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["question", "answer", "evidence"], "properties": {"question": {"type": "string"}, "answer": {"type": "string"}, "evidence": {"type": "string"}}}},
                             "defects": {"type": "array", "items": DEFECT},
                             "final_verdict": {"type": "string", "enum": ["PASS", "REPAIR_REQUIRED", "HUMAN_REVIEW_REQUIRED"]},
                             "escalate_to_fendi": {"type": "array", "items": {"type": "string"}}}}}

ROLE = """You are Astra, the visual-QA reviewer for AVT (an AI music-video tool). You are NOT the creative director: the Treatment and ShotSpecs are the creative intent and {authority} is final authority. Your job is to compare WHAT WAS REQUESTED against WHAT IS ACTUALLY VISIBLE in the rendered draft, shot by shot and over time, and to report defects that route to the production subsystem that can fix them. Do not invent a different video. Do not soften findings. Cite draft timecodes and frame labels as evidence for every claim. If you cannot tell, say UNCERTAIN with low confidence rather than guessing. The frames are consecutive samples of one continuous video: reason about motion, stability, flicker and continuity across them, not only about single images."""

# What sampled silent frames CAN and CANNOT establish. Kept as data next to ROLE so a future
# reviewer with audio / native-rate input can drop the clause without touching the questions.
UNOBSERVABLE = [
    "musical timing, downbeat landing and beat alignment of any cut, flash, strobe or hard out",
    "audio / lip / gesture synchronization after inserts",
    "one-native-frame precision of cut boundaries (labels are computed from the assembler, not observed)",
    "sub-sample motion: flicker, strobe cadence, glitch duration, fabric shimmer between sampled frames",
    "native-resolution sharpness vs the source (frames are downscaled samples)",
]
EVIDENCE_BOUNDARY = (
    "\nEVIDENCE BOUNDARY: you are reviewing SILENT, SAMPLED frames of the draft, not the native-rate video with audio. "
    "You CAN establish what is visible in and across the sampled frames (wardrobe, identity, environment, matte edges, "
    "composition, continuity at sampled instants, presence/absence of an effect state). You CANNOT establish, and must not "
    "certify or fail: " + "; ".join(UNOBSERVABLE) + ". For any such property answer exactly 'UNVERIFIABLE FROM SAMPLES' "
    "with confidence no higher than 0.3, say what native-media check would settle it, and — if you must file it as a defect — "
    "use severity 'note', recommended_owner 'sync' (timing/audio) or 'edit_fx' (cadence/duration) and start the description "
    "with 'UNVERIFIABLE FROM SAMPLES:'. Those items are routed to deterministic native-media QA or to {authority}, never repaired on your word alone."
)

def expected_text(s, offset):
    t0, t1 = s["timeline"]["start"], s["timeline"]["end"]
    d0, d1 = t0 - offset, t1 - offset
    src = s.get("source", {}).get("range")
    ward = s.get("wardrobe", {}).get("name") or "none (B-roll/FX)"
    env = s.get("environment", {}).get("description", "")
    tr = (s.get("transitionIn") or {}).get("type", "cut")
    fx = ", ".join(f.get("type", "") for f in s.get("fx", []) or []) or "none"
    src_txt = f"master {src['start']:.3f}-{src['end']:.3f}s" if src else "generated"
    return (f"{s['id']} [{s['kind']}/{s.get('shotType','')}] draft {fmt(d0)}-{fmt(d1)} (song {t0:.3f}-{t1:.3f}s) | source: {src_txt} | wardrobe: {ward} | "
            f"framing: {s.get('framing','')}, angle {s.get('cameraAngle','')}, motion: {s.get('cameraMotion',{}).get('description','')} | lighting: {s.get('lighting',{}).get('description','')} | "
            f"fx: {fx} | transition in: {tr} | environment: {env} | purpose: {s.get('purpose','')} | QA: " + "; ".join(q.get("check", "") for q in s.get("qa", [])))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", required=True); ap.add_argument("--shotspecs", required=True); ap.add_argument("--assembly", required=True)
    ap.add_argument("--draft-id", required=True); ap.add_argument("--treatment-version", default="unknown")
    ap.add_argument("--ref", action="append", default=[], help='"label=path"'); ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=3.0); ap.add_argument("--short-fps", type=float, default=6.0)
    ap.add_argument("--group-size", type=int, default=4)
    ap.add_argument("--prev-review", default=None, help="aggregated AstraReviewSchema JSON of the previous revision: its defect_ids are handed to Astra so persisting defects keep their identity (diffReviews)")
    ap.add_argument("--repair-notes", default=None, help="text file: what Claude changed since the previous revision (Astra verifies, it does not take it on trust)")
    a = ap.parse_args()
    spec = json.load(open(a.shotspecs)); asm = json.load(open(a.assembly))
    shots = sorted(spec["shots"], key=lambda s: s["timeline"]["start"]); offset = shots[0]["timeline"]["start"]
    os.makedirs(os.path.join(a.out, "frames"), exist_ok=True); os.makedirs(os.path.join(a.out, "parts"), exist_ok=True)

    refs = []
    for r in a.ref:
        label, path = r.split("=", 1); refs.append({"label": label, "file": os.path.abspath(path)})
    # Project context comes from the ShotSpecs file's `treatment` block (artistName, creativeDirection,
    # brand, sourceEnvironment, authority, toolName), never from this script. Missing keys fall back to
    # neutral wording so the builder works for any artist / brand / location.
    T = spec.get("treatment") or {}
    artist = T.get("artistName") or "the performer"
    brand = T.get("brand") or "the specified"
    direction = T.get("creativeDirection") or "the approved treatment"
    source_env = T.get("sourceEnvironment") or "the original shooting location"
    authority = T.get("authority") or "the artist"
    treatment_lines = "\n".join(expected_text(s, offset) for s in shots)
    looks = spec.get("looks", {})
    looks_txt = "\n".join(f"- {k}: {v.get('name')} (bars {v.get('bars')})" for k, v in looks.items())
    manifest_txt = "\n".join(f"{sl['shot']}: draft {fmt(sl['song'][0]-offset)}-{fmt(sl['song'][1]-offset)} <- {os.path.basename(sl['file'])} @ {sl['offsetInFile']:.3f}s, {sl['frames']} frames, transitionIn={sl['transitionIn']}" for sl in asm["slots"])
    common = (f"{ROLE.format(authority=authority)}\n\nDRAFT: {a.draft_id} — song {asm['sectionSong'][0]:.3f}-{asm['sectionSong'][1]:.3f}s, {asm['expectedSeconds']:.2f}s, draft t=0 is song {offset:.3f}s. Treatment version {a.treatment_version}.\n"
              f"CREATIVE DIRECTION: {direction}. {artist}'s REAL performance is the visual spine; AI changes wardrobe ({brand} garments actually on the performer), environment, lighting, FX and B-roll — it must not replace the performer.\n"
              f"LOOKS:\n{looks_txt}\n\nSHOTSPECS (expected, one per line):\n{treatment_lines}\n\nASSEMBLED TIMELINE (what was actually placed):\n{manifest_txt}\n")
    # Epistemic boundary (ChatGPT ruling 2026-09-21 §7): the material is SILENT, SAMPLED frames.
    # Properties that need audio or native-rate motion are declared out of scope here so the
    # reviewer is never pressured into a verdict its evidence cannot support; they route to
    # native-media QA (scripts/edit/assemble_section.py timeline + audio checks) or to the authority.
    common += EVIDENCE_BOUNDARY.format(authority=authority)
    if a.prev_review:
        prev = json.load(open(a.prev_review))
        prev_lines = "\n".join(f"- {d['defect_id']} [{d['severity']}/{d['recommended_owner']}] draft {fmt(d['time_range'][0])}-{fmt(d['time_range'][1])}: {d['description'][:220]}" for d in prev["sequence_defects"])
        common += (f"\nPREVIOUS REVISION ({prev['draft_id']}, verdict {prev['final_verdict']}) reported these defects. This is a RE-REVIEW after targeted repair: "
                   f"for every defect below, look at the same time range in THIS draft and decide from the frames whether it is RESOLVED or still PRESENT. "
                   f"If still present, report it again with EXACTLY the same defect_id (do not rename it). Do not list a resolved defect as a defect; mention resolved ids in your summary. "
                   f"New problems get new defect_ids. Never mark something resolved because the repair notes say it was fixed — verify it in the frames.\n{prev_lines}\n")
    if a.repair_notes:
        common += "\nREPAIR NOTES FROM CLAUDE (claims to verify, not facts):\n" + open(a.repair_notes).read().strip() + "\n"

    parts = []
    # ---- Level 1: shot groups ----
    groups = [shots[i:i + a.group_size] for i in range(0, len(shots), a.group_size)]
    for gi, g in enumerate(groups):
        frames = []
        for s in g:
            t0, t1 = s["timeline"]["start"] - offset, s["timeline"]["end"] - offset
            fps = a.short_fps if (t1 - t0) < 2.5 else a.fps
            t = t0 + 0.5 / fps
            while t < t1 - 1e-6:
                p = os.path.join(a.out, "frames", f"{s['id']}_{t:07.3f}.jpg")
                if grab(a.draft, t, p): frames.append({"label": f"draft t={fmt(snap(t))} (song {snap(t)+offset:.3f}s) shot {s['id']}", "file": p})
                t += 1 / fps
        ids = [s["id"] for s in g]
        instr = common + (f"\nTASK (LEVEL 1 — SHOT CONFORMANCE) for shots {', '.join(ids)}. For EACH shot answer: did the intended shot occur; is {artist} present when the spec says performance; is the correct look visible and actually WORN by him (not floating, not partial); does identity stay credible (same real person, face/beard/glasses/cap); does the intended environment appear ({source_env} must NOT be recognizable); does framing approximately match; does the shot perform its stated purpose; are AI artifacts visible (morphing, texture crawl, plastic skin, garment disappearing, wordmark corruption, matte halos)? "
                         f"For wardrobe shots inspect: garment construction vs the reference, coverage, wordmark/logo legibility and SCALE vs reference, placement, temporal stability across the frames, sleeve/body behaviour during arm movement, occlusion behaviour, unintended wardrobe changes, cartoon/plastic look. "
                         "Report every defect once with a stable defect_id, severity, DRAFT time_range and the owning subsystem.")
        parts.append({"partId": f"shots-{'-'.join(ids)}", "instructions": instr, "frames": frames, "references": refs, "jsonSchema": SCHEMA_SHOTS, "level": 1})

    # ---- Level 2: transitions ----
    frames = []
    for i in range(1, len(shots)):
        tc = shots[i]["timeline"]["start"] - offset
        for k in range(-3, 3):
            t = tc + (k + 0.5) / 12.0
            if t < 0: continue
            p = os.path.join(a.out, "frames", f"cut_{shots[i-1]['id']}_{shots[i]['id']}_{t:07.3f}.jpg")
            if not grab(a.draft, t, p): continue
            ts = snap(t); cut_frame = int(round(tc * DRAFT_FPS)) / DRAFT_FPS  # the assembler cuts on round(t*fps)
            frames.append({"label": f"draft t={fmt(ts)} — cut {shots[i-1]['id']}→{shots[i]['id']} at {fmt(cut_frame)} ({'before' if ts < cut_frame - 1e-6 else 'after'})", "file": p})
    instr = common + ("\nTASK (LEVEL 2 — TRANSITION / EDIT REVIEW). For every cut (6 frames at 12 fps around each): does the transition described in the treatment actually happen (cut / flash / glitch / white-out); does the cut happen on the labelled cut frame and feel intentional (musical landing is UNVERIFIABLE FROM SAMPLES — do not judge it); do wardrobe and environment continuity make sense (Look 2 pre-hook → Look 1 from the drop at S06); are there accidental visual jumps; does B-roll return cleanly to synchronized performance; do transitions expose broken mattes, malformed frames or identity discontinuities; does each effect improve the sequence or merely look generated?")
    parts.append({"partId": "transitions", "instructions": instr, "frames": frames, "references": refs[:2], "jsonSchema": SCHEMA_TRANS, "level": 2})

    # ---- Level 3: whole sequence ----
    frames = []; t = 0.25; end = asm["expectedSeconds"]
    while t < end:
        sid = next((s["id"] for s in shots if s["timeline"]["start"] - offset <= t < s["timeline"]["end"] - offset), "?")
        p = os.path.join(a.out, "frames", f"seq_{t:07.3f}.jpg")
        if grab(a.draft, t, p): frames.append({"label": f"draft t={fmt(snap(t))} shot {sid}", "file": p})
        t += 0.5
    # Standing questions (the Astra handoff's 15), templated on the treatment block; the
    # wordmark-scale question targets whichever shots the ShotSpecs mark as wordmark-critical
    # (qa contains "gate0_garment_truth"), falling back to "any shot".
    wm_shots = [s["id"] for s in shots if any("garment_truth" in str(q) for q in (s.get("qa") or []))]
    wm_target = ", ".join(wm_shots[-2:]) if wm_shots else "any shot"
    questions = [
        f"1. Does {artist} remain recognizably the same real person throughout the performance shots?",
        f"2. Is the {brand} wardrobe actually and convincingly worn by {artist}?",
        "3. Does the wardrobe remain stable during movement?",
        "4. Where exactly does the wordmark/logo break (draft timecodes)?",
        f"5. Is any lettering visibly oversized or mis-scaled relative to the reference (check {wm_target} in particular)?",
        "6. Are there other garment defects not listed in the shotspecs QA?",
        "7. Does the native-resolution transformation/upscale visibly hurt quality relative to the source contact sheet?",
        f"8. Does the environment composite convincingly eliminate {source_env}?",
        "9. Do matte/composite boundaries remain believable during movement?",
        "10. Does B-roll feel intentional and compatible with the treatment?",
        "11. Do transitions work visually at the sampled instants? (Musical landing is UNVERIFIABLE FROM SAMPLES — say so rather than judge it.)",
        "12. Does the edit visibly return to the performer in the intended slots after B-roll/FX? (Exact synchronization is UNVERIFIABLE FROM SAMPLES.)",
        "13. Does every shot substantially conform to its ShotSpec?",
        f"14. Does the complete sequence resemble the intended treatment ({direction})?",
        f"15. MOST IMPORTANT: does this look like a REAL {artist} music video enhanced by AVT, or like AI content built around {artist}'s song? No vague praise — support with timecoded evidence.",
    ]
    instr = common + ("\nTASK (LEVEL 3 — SEQUENCE / TREATMENT CONFORMANCE). Judge the draft as a complete piece (2 fps strip): does it resemble the approved treatment; does the creative language survive production; does it feel like a coherent music video; does the real performance remain the spine; has AI generation begun replacing rather than enhancing; does the wardrobe strategy (two looks, change on the drop) read; do environments feel intentional; is B-roll purposeful; is the visual rhythm right; where did implementation succeed technically but fail creatively? Score each overall dimension 0-10. Answer ALL of these questions explicitly in `answers`:\n" + "\n".join(questions) +
                      f"\nSet final_verdict: PASS only if no blocker/major defects remain; REPAIR_REQUIRED for objective, technically repairable defects; HUMAN_REVIEW_REQUIRED when the fix needs a treatment decision, findings are contradictory/low-confidence, or the disagreement is aesthetic. List anything for {authority} in escalate_to_fendi.")
    parts.append({"partId": "sequence", "instructions": instr, "frames": frames, "references": refs, "jsonSchema": SCHEMA_SEQ, "level": 3})

    # Output budget on every part: the sequence part (15 questions + prior defects) overran the proxy's
    # max_output_tokens in review #2 and the transitions part did in review #3 — both `incomplete`,
    # both still billed. The clause keeps answers inside the cap without dropping findings.
    BUDGET = ("\nOUTPUT BUDGET (hard): keep the whole JSON answer under 9000 tokens — at most 45 words per expected/observed/description/evidence/answer field, "
              "at most three frame labels per item, no repeated text across fields, and do not restate the prior-defect list: report only defects still PRESENT or NEW.")
    for p in parts: p["instructions"] += BUDGET

    for p in parts:
        json.dump(p, open(os.path.join(a.out, "parts", p["partId"] + ".json"), "w"), indent=1)
    summary = {"draftId": a.draft_id, "treatmentVersion": a.treatment_version, "draftOffsetSongSeconds": offset,
               "parts": [{"partId": p["partId"], "level": p["level"], "frames": len(p["frames"]), "references": len(p["references"])} for p in parts]}
    json.dump(summary, open(os.path.join(a.out, "manifest.json"), "w"), indent=2)
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
