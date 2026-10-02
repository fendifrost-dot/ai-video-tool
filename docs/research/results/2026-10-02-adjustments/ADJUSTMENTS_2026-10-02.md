# Adjustments after bar3 — wired before the next test round (2026-10-02)

Fendi: "Wire all the adjustments in that we discussed before any more tests — we'll test everything at once." This folder records what landed from the Cowork side and what each adjustment measured. Claude Code carries B3/B4 (`docs/handoffs/CLAUDE_CODE_BRIEF_B3_B4_2026-10-02.md`); Cursor carries the shot compiler (`src/lib/shotCompiler/**`, merged as #164 + `98f86fb`).

## 1. The treatment's camera prose now drives the typed move (app + planner)

**Finding.** The treatment generators write the camera as prose ("50mm macro, slight push-in", "24mm wide shot, locked frame") and leave `cameraMotion.type` at its default `"static"`. Every card therefore typed as static whether it moved or not, `applyCoverageDefaults` treated the prose as an explicit choice and never fired on a real treatment (the live YSL storyboard showed no change after Part E landed), and nothing downstream could tell a locked frame from a push.

**Fix.** `MOTION_WORDS` / `classifyMotion` (`src/lib/treatment/coverage.ts`) and the same patterns in `scripts/edit/camera_coverage.py` read the prose into the engine's move vocabulary (static · dolly_zoom · snap_zoom · whip_pan · orbit · crane · pedestal · push · pull · truck · pan · handheld; explicit statics match first). `applyCoverageDefaults` now types the written camera, draws only where no camera is written, keeps every draw inside the section's static share and static-run budget, and fills `transitionIn` on a section's first card from the presets. The planner honours the director's written camera on a slot's first cut (an explicit static included, within the budget) and draws the rest; `max_static_run_s` is enforced beside `static_share_max`. Re-plan of bars 24–46 with the director's cameras honoured: static share 0.108, one static honoured (S01a "locked off"), 16 cuts, rules intact.

## 2. Coverage measured where the treatment is written

`measureCoverage` (same rules and numbers as `scripts/qa/coverage_qa.py`, computed on the cards): per-section static share, longest static run, consecutive move/framing repeats → a strip above the storyboard ("Coverage on the norm" / the findings) and an amber flag on each card that puts its section over the rule. Tests: three locked cards → FAIL + three flags; three moving cards → on the norm; a card names its transition preset with beats. Live at `a7024d3`.

## 3. Transition presets on the cards (C2)

`TransitionSchema.preset` (name from `config/transition_presets.json`; the DB family stays in `type`, the preset is row-unmapped and documented), `src/lib/treatment/transitions.ts` mirrors the presets and section defaults (sync-tested), `transitionInFromPreset(name, bpm)` times the preset in seconds when a BPM is known, `ShotCard` shows "whip left · 0.5 beats". The picker is a select in the B3 override block.

## 4. Foreground occluder + performer placement in the compositor

Fendi's staging (him on a stoop; the kids lift the wheel-less car at the curb 5–10 ft in front; his takes are waist-up, so the car must cut off his lower half) needs a layer IN FRONT of the performer. `composite_environment.py`:

* `--fg-place scale,cx,cy` + `--fg-anchor bottom|centre` — scale and place the take inside the frame (a waist-up take sits ON the thing that occludes it when its bottom edge is anchored at or below the occluder's top line).
* `--occluder-auto x0,y0,x1,y1` — rembg (`isnet-general-use`) cuts the salient object out of the plate's first frame inside the box → the plate's own pixels are lifted in front of him, registered with the plate's zoom; the mask is saved beside the output for inspection/reuse.
* `--occluder-from-plate mask.png` (a hand or SAM mask in plate geometry), `--occluder-below y` (a soft horizon: everything below it is in front), `--occluder cutout.png --occluder-place x,y,w` (an RGBA cutout in output coordinates). Sources union; `--occluder-feather` softens edges.

**Measured** on a 3 s S11 take over `pass6_car_at_curb.jpg` (the Grok stoop staging): `--occluder-auto 0,0.33,1,1 --occluder-below 0.47 --fg-place 0.30,0.25,0.48 --fg-anchor bottom --match-plate 0.7` → the car, the four boys and the fence line sit in front of the real performer; his cut edge is hidden behind the car hood and the fence; the plate grade carries onto him. `occluder_auto_car_kids_mask.jpg` (frame + the auto mask), `occluder_car_kids_fence_performer_on_stoop.jpg`, `occluder_strip_6fps.jpg`. What the test also shows: the plate must be generated WITHOUT the performer (or with him exactly where the take lands) — the generated figure in this plate peeks out beside the real one; that is a plate matter (`world_around.py` prompt: "the stoop empty"), not a compositor matter. The shot compiler's `living_plate` stub carries these flags.

Also fixed while running it: the compositor left its frame/memmap temp folders behind (gigabytes per run) and filled the disk mid-batch — they are now removed at exit.

## 5. 2.5D moves on living plates

`camera_engine.py` accepts a VIDEO plate (decoded at the output fps, depth measured on its first frame — our world plates' cameras move slowly, so one parallax field holds; `--plate-depth-every` for faster plates), reads the compositor's plate-aware grade from the matte export (`grade.json`, written by `composite_environment.py --export-matte --match-plate`), and applies it with the same numbers. `camera_coverage.py render` goes 2.5D when `renders.json` carries `matte_dir` + `plate` for a slot.

## 6. Renamed: `scripts/edit/coverage.py` → `scripts/edit/camera_coverage.py`

A script named `coverage.py` in `scripts/edit/` shadows the `coverage` package for anything run from that folder that imports numba (rembg): `composite_environment.py --matte rembg` and `--occluder-auto` failed with `module 'coverage' has no attribute 'types'`. Measured, renamed, references updated (plan, results, review doc, `coverage.ts` comment). Cursor's `src/lib/shotCompiler/*` comments still say `coverage.py` — harmless, theirs to touch.

## 7. bar4 — 1080p, 2.5D moves on the living plates

Pipeline: mattes exported for the eight takes at 1080p (`composite_environment.py --export-matte --matte-only --match-plate 0.7`, ≈ 8–12 min each; `grade.json` beside each) → `camera_coverage.py plan` (seed 7, lyric lines, director's cameras honoured) → `camera_coverage.py render --size 1080x1920` (every sub-slot 2.5D through `camera_engine.py` over its Kling living plate, `--plate-loop`) → `assemble_section.py` (handles, transitions on the grid) → `insert_broll.py` (the four lyric-locked inserts, PASS only) → `coverage_qa.py`.

**Result** `YSL_IceOn_bars24-46_bar4_2p5d_1080p.mp4` (sandbox `ysl/bar4/`, 1037 frames @ 24, 43.279 s against 43.2787 s expected — clock exact). Coverage QA **PASS**: 16 performance cuts, moving share 0.892, static share 0.108, longest static run 3.93 s (the honoured "locked off" on S01a, inside the 4 s rule), mean cut 1.16 bars (verse 1.62, hook 1.0), no repeated moves or framings. Inserts: tailor on "Yves Saint Laurent" (S01a split), switch on "cut the lights on" (S06a split), frost on "this ice on" (S10 replace), lights (S12a split) — all PASS. Evidence: `bar4_coverage_qa.json`, `bar4_coverage_plan.json`, `bar4_renders_coverage.json`, `bar4_strip_2p7s.jpg`, `S01_push_2p5d_living_plate_sheet.jpg`.

**What the render taught, and what changed because of it.** The first pass rendered each sub-slot's variant over the WHOLE slot (a slot cut three ways was rendered three times over: 2505 frames for 1371 used) at ≈ 2.7 s per 1080p frame — on course for ~2 h. `camera_coverage.py render` now renders 2.5D variants over the sub-slot's window plus the assembler's handle on each side (`--handle`, default 1 s), remaps the move's start/end into that range, and shifts the variant's `masterStart` by the window offset in `renders_coverage.json` so the assembler's clock holds; 1371 frames rendered instead of 2505. `camera_engine.py` computes a video plate's defocus pyramid at half resolution per frame (a defocus is low-frequency; the sharp plate stays full-res where the focus map says sharp). Per-frame cost is now dominated by `lens_post` (a dozen full-frame float ops) and the plate decode/fit — the next lever is a render worker, not more Python.
