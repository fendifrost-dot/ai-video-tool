# Claude review — Shot compiler compiled handoff (PR #164) · 2026-10-02

**Verdict:** green light for Cursor, Phases 1–2 in one PR, with the five amendments below folded into the spec before implementation. Fendi approved the review path ("Cursor implements; Claude reviews first").

What stands as written: no new providers / MCPs / model variants; no keys in AVT; phrase jobs not panels; duration snap to model enums; the prompt locks (§4.7); no text/logos in provider prompts; the gate before any cut; living plate as a compositor stub, not a provider route; one payload dialect; `ai-draft-treatment` stays the concept step; no CC lock lift for v1.

## Amendments

**A1 — split `hero_camera`.** A camera move on a *performance line* is a $0 move on the real take (`scripts/edit/coverage.py` → `camera_engine.camera_path` + `lens_post`; 2.5D with parallax when a matte export exists). It is pixel-true and lip-locked. DoP / Kling i2v re-draw the face (identity 0.43–0.63 measured, rev 40–42) and must never carry a sung line. Routes: `take_move` = non-provider stub `{ "kind": "take_move", "source_path", "matte_dir?", "move": {type, amount, ease, handheld, lens}, "window": [start, end] }` consumed by `coverage.py render`; `hero_broll_i2v` = DoP (`higgsfield-generate`) or `kling-2.5-turbo-pro-i2v` from a hero still, non-singing B-roll only.

**A2 — phrases come from the coverage planner and the lyric clock, typed.** The audit baseline (`fea6ba3`) predates Part E (`93d37d0`). For performance lines the phrase is a coverage sub-slot from `coverage_plan.json` (bar-grid window, move object, framing, transition); for worlds it is a `lyric_lines` window plus the motion contract (entrance / primary / secondary / exit) from `config/treatment_templates/motion_story_v1.json`. Replace `camera?: string` with the move object whose fields are those of `config/coverage_presets.json` (`type, amount, ease, handheld, lens`). Cut cadence comes from the presets' `cut_every_bars` per section, not from the model and not from the compiler.

**A3 — Seedance re-angle uses the real take.** `@Video1` = the trimmed real cut (`source_path`, 4–30 s; input seconds are billed too), `@Image1` = an optional world still; duration = source seconds (a longer ask comes back stretched); `keep[]` wardrobe constants in the payload ("clear-lens glasses, not tinted"). That is the `seedance_ref` shape already in `run_world_batch.py` — mirror it verbatim. `heroStillUrl` becomes optional.

**A4 — payload schema = the documented `shots.json` (`run_world_batch.py` lines 8–20), verbatim; Phase 2 = emit that file.** Option (a) — `providerJobs` → `video-providers-higgsfield-model` with `mode` + `modelVariant` — may ride in the same PR but is not required for v1; the scripts lane stays the paid executor until a batch page exists (it now has a batch identity, #163).

**A5 — gate chain gains two checks.** `scripts/qa/reference_fidelity.py` on every `seedance_ref` result (identity + lip fit at ≥ 24 fps) before an angle is cut on a sung line; `scripts/qa/coverage_qa.py` on the assembled section (static share, longest static run, cadence, repeats). Genjutsu routes stay in the table and out of the next sample — the garment lane is parked.

## Checklist (§9)

- Routing table: yes with A1–A3 — still-first worlds (bar still → Kling 2.5 i2v, camera-only motion) over t2v; t2v only as fallback and never for 9:16.
- Payload schema mirrors `run_world_batch` shot list: **yes, verbatim** (A4), plus the `take_move` stub (A1).
- Living plate as compositor stub: **agree**; the stub carries `composite_environment.py` inputs including the new `--occluder` layer (landing from the Cowork side) and `--match-plate`.
- Phase 1–2 in one Cursor PR: **agree**.
- CC lock-lift before Phase 2: **no**.

## File ownership while three agents work

Cursor: `src/lib/shotCompiler/**` only (plus its tests and fixtures). Claude Code: B3/B4 per `CLAUDE_CODE_BRIEF_B3_B4_2026-10-02.md` (`shot_overrides`, `overrides.ts`, `regenerateFromLyrics.ts`, `lyric-visualizer-proxy`, a delimited block in `ShotCard.tsx`). Claude (Cowork): `src/lib/treatment/coverage.ts`, `src/lib/treatment/transitions.ts`, `ShotStoryboard.tsx`, the coverage badge block in `ShotCard.tsx`, `scripts/edit/**`, `scripts/qa/**`, `config/**`. Nobody edits Control Center.
