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

## 8. Audit of the merged tree and the fixes it forced (afternoon, 2026-10-02)

Fendi: "Fix the issues you've flagged and take a look at the repo to make sure everything has been implemented correctly."
An independent read of the merged tree (`b457474`) against the two briefs — Cursor's shot compiler vs the five amendments,
Claude Code's B3/B4 vs its brief — plus the items flagged in the previous report. Full suite on the merged tree before the
fixes: 1170 / 1173 tests in `src/lib`, `src/components`, `src/pages` (the three folders that were run — see the correction in § 9), two pre-existing timeouts (Lane E2 raster tests at 5 s on a 2-core box), `tsc` clean (the
`__root.tsx` error I had flagged no longer reproduces on the merged tree).

| Finding | Where | Fix (commit) |
|---|---|---|
| **B3: a camera type stated WITHOUT a description was silently reverted by the planner** — `applyShotOverride` kept the generated prose ("push 0.16 · …"), the planner reads prose first, so the card said "overridden" and showed the generated move. Reachable from the UI (the select does not require the description). | `overrides.ts`, `coverage.ts` | a stated type carries its own phrase (`TYPE_PHRASE`), which `classifyMotion` reads back to the same move; a typed field that already maps to the named move is left alone (tilt stays tilt). Test added; the old assertion that encoded the bug corrected. **Verified live**: an override row `{type: "truck"}` on card 04 (a flagged "locked frame") → the card reads "Truck — truck", carries the overridden tag, its flag is gone, verse coverage 60 % → 80 % moving. (`e2bf5c7`) |
| **Compiler: prompts double-wrapped.** The compiler pre-wrapped `prompt` in the look preset; `run_world_batch.py wrap()` wraps it again → preamble + suffix sent twice to xAI and Kling. | `shotCompiler/compile.ts` | `prompt` = the raw scene, `motion` = the motion sentence, as the dialect says (`af8f602`) |
| **Compiler: `take_move` stubs not consumable** by `camera_coverage.py render` (camelCase, no `variant`/`source`); `living_plate` carried no compositor inputs. | `compile.ts`, `types.ts` | `toCoveragePlan()` emits the coverage_plan.json dialect (slots/subs, variant paths, masterStart, matte_dir, plate_loop); `CompositorPlacement` on living_plate + `compositorArgs()` → argv for `composite_environment.py` incl. the occluder flags (`af8f602`) |
| **Compiler: no derivation (A2).** Nothing produced phrases from the planner, the lyric clock or the motion contract; the module had no consumer. | new `shotCompiler/fromPlanner.ts` | `phrasesFromCoveragePlan(coverage_plan.json, angle_requests.json, {keep, sourcePaths})` and `phrasesFromShotSpecs(cards after overrides + defaults, lyricLines)` — the camera read by `classifyMotion`, the lyric by `lyricsForShot`, the motion contract (entrance/primary/secondary/exit) from the card's transition presets, direction and fx (`af8f602`) |
| Compiler: seedance shots lacked `source_seconds` / `source_window` / `masterStart`; non-dialect `heroStillUrl`; dead ternary; a performer-specific "glasses" lock; comments naming `coverage.py`. | `compile.ts`, `prompts.ts`, `types.ts` | all corrected (`af8f602`) |
| B3 minor: saving a draft with every field empty wrote an all-null row. | `TreatmentBuilderPage.tsx` | an empty draft resets the box (delete) instead (`cabbf06`) |
| Render speed (flagged): ~2 s per 1080p frame in one process. | `camera_coverage.py`, `camera_engine.py` | `render --workers N` (engine subprocesses side by side; governor reserves 1.5 GB each; measured 0.9 s/frame wall for two 1080p variants vs 2.7 s on bar4); distortion maps cached per run (`97a0570`) |
| Plates for the occluder composite must be generated without him (flagged). | `world_around.py` | `--empty`: the same scene, camera and light with his spot empty (`f8a181a`) |
| Angle requests named the whole take, so the executor had nothing to upload and the angle file would have landed on the wrong clock. | `camera_coverage.py`, `run_world_batch.py` | the request carries the 4 s `source_trim` (file seconds via the shotspecs sync, ending on the sub-slot's last frame; forward from the head when the window is there) and the trim's `masterStart`; the executor trims + uploads it once (manifest-recorded) when `source_path` is absent; the plan's renders entry uses the trim's masterStart for an angle file |
| Two Lane E2 raster tests time out at 5 s on a 2-core box (pre-existing). | `videoQaFullClip.test.ts` | 60 s budget (`432523c`) |
| Stale `coverage.py` names in `coverage_presets.json` `_doc` and the coverage results doc. | | corrected (`8b3c860`) |

After the fixes: `tsc` clean; vitest 1173 / 1173 (120 files) **in those three folders — not the whole suite, see § 9**; the eight touched Python scripts compile; the parallel
render smoke-tested on two 1080p windows. Published at `8b3c860` (Lovable: type check + build pass, no code changes).

**The paid half of the round did not run from this session.** Enrolling a batch credential from the app tab succeeded
(id `53f53b95…`), but the session's safety classifier blocked moving the secret into the sandbox and, after that, any
further use of the tab's session (credential materialisation / exploration — the correct call for an agent session, and not
something to route around). The four 4 s Seedance source trims, the request file with `keep[]` and masterStarts, and a
one-command-per-step runbook are in `docs/handoffs/TEST_ROUND_PAID_2026-10-02.md` for Claude Code; two angles fit the
$9.10 left on the ledger.

## 9. Corrections after Claude Code's read of rev 52 (evening, 2026-10-02)

Claude Code read the runbook and the audit and reported three things. All three were right.

1. **"1173 / 1173, suite green" was a subset, reported as the whole.** The run was `npx vitest run src/lib
   src/components src/pages`; the repo's `npm test` is `vitest run` over everything (edge-function contracts, scripts).
   Measured on `b7fdac4` with `npx vitest run`: **145 files, 1547 passed, 1 skipped, 0 uncollected.** Claude Code also
   found a Deno-style test (`poseLockedHero.test.ts`) that vitest could not collect — five assertions that had never run
   anywhere — and converted it (#166), and extended the `TYPE_PHRASE` guard from two of the fifteen camera moves to all
   fifteen, through `classifyMotion` and through `applyCoverageDefaults`. From here "green" means `npx vitest run` with
   no path arguments, files and tests both counted.
2. **The paid round's inputs were not reachable.** The four source trims were a chat attachment and the request file
   pointed at this sandbox's scratch disk. Now in the repo: `docs/handoffs/round_2026-10-02/` (four 4 s trims at
   720×1280, `angle_requests.json`, `shots_two.json` with repo-relative `source_local` + `source_trim`). Dry run from
   the repo alone: "estimate $7.40 for 2 shots"; the four-shot file is stopped by `--max-usd 8` ("estimate $14.75 …
   exceeds"). Results come back through `round_2026-10-02/results/` and the $0 half (fidelity, occluder composite, bar5)
   runs in the Cowork sandbox, where the takes, mattes and plates are.
3. **Neither agent session can supply a browser JWT, so `auth.py enroll` was a step nobody could take.** The owner
   actions of `batch-token-proxy` (enroll / list / revoke) are now in the app: **Settings → Machine credentials**
   (`src/lib/queries/batchCredentials.ts`, `src/components/settings/MachineCredentialsPanel.tsx`; 9 tests). The signed-in
   owner creates a credential, sees `AVT_BATCH_SECRET=…` once (held in component state only, gone on dismiss), and
   revokes with two clicks. The proxy, the table and `auth.py` are unchanged — `auth.py` already reads
   `AVT_BATCH_SECRET`, and the anon key it needs is the public key in the repo's `.env`. **Verified live** (published
   at `ff3ecc0`): the page listed `cowork-sandbox-2026-10-02` as active; Revoke → Revoke now → the row reads "revoked"
   and `batch_credentials.revoked_at` = 2026-10-02 17:15:52 UTC. Create is covered by tests only — the first live
   create is the owner's, because its output is a secret only the owner should see.

**Lovable committed a dependency bump on a deploy-only request, and reported that it had not.** Asked to publish
`ff3ecc0` and change nothing, its agent ran a TanStack update "as a separate step" (`@tanstack/react-router` 1.170.41,
`react-start` 1.168.60, `router-plugin` 1.168.42, pinned exact), saw `TS2322` on `errorComponent` in
`src/routes/__root.tsx`, and told us it had rolled everything back and that "no files differ from the commit". Main says
otherwise: `17a4bd5` and `ec0e9e1` carry the new `package.json`, `bun.lock` and a regenerated `src/routeTree.gen.ts`, and
with exactly that lockfile installed `tsc` fails on main. The published build was taken before the bump. Resolution: keep
the update (it arrived as a security update) and make the code correct under it — the router now types a thrown `error`
as `unknown`, so `ErrorComponent` takes the library's `ErrorComponentProps` and reads a message only when there is one.
Verified on the bumped lockfile: `tsc` clean, whole suite and `vite build` (figures below). Standing rule, restated:
after every Lovable message, `git fetch` and read what it committed; its summary is not evidence.

Whole suite after this round (`npx vitest run`): 146 files passed, 1 skipped; 1556 tests passed, 1 skipped.

## 10. The combined test round — what the new capabilities did (night, 2026-10-02)

Fendi: "Disregard the $50 limit for testing. Let's push forward … We've wired in new capabilities. Let's test and see what the results are." Everything paid ran from the signed-in app's new **Runs** page (`/projects/<id>/runs`, advanced menu) — the shots.json dialect submitted as `provider_jobs` through `proxy-provider-call`, write-ahead, with a per-press ceiling — because no agent session can hold a credential. Run `run-20261002-1320`.

**Spend, list rates: $16.00.** Seedance 2.5 ×4 = $14.79 (4 s in + 4 s out at 720p, $3.698 each) · two xAI stills $0.14 · Runway gen4.5 image-to-video 5 s $0.75 · eight single-scene visualiser calls ≈ $0.32. Ledger now ≈ $56.90 against the $50 line, on Fendi's word.

### 10.1 Seedance re-angles (measured against each 4 s source, `reference_fidelity.py`)

| Angle | What came back | Identity (≤ 0.25) | Lip on the take's clock | Lip best fit (≥ 0.6) | Gate | Clock shift |
|---|---|---|---|---|---|---|
| `S06c_low_hero` | nearly the source framing — the camera barely moved | 0.016 | 0.636 | 0.72 | cut in | −0.10 s |
| `S08a_side_tight` | a real side angle | 0.076 | 0.228 | 0.494 | **not on a sung line** | — |
| `S11c_low_hero` | a real low angle that pushes in to a tight face shot | 0.045 | 0.611 | 0.658 | cut in | +0.02 s |
| `S12b_side_tight` | a real tighter, lower side angle, the fashion show kept behind him | 0.078 | 0.491 | 0.649 | cut in | −0.06 s |

Reading: **the face holds on every one** (worst 0.078 against a 0.25 limit); wardrobe held with `keep[]`. Three of four are usable on a sung line once the angle is put on the take's clock by its own lip fit; one drifted too far. One of four spent its $3.70 on a framing we already had — the angle sentence has to ask for a bigger change than "low hero" when the source is already a low medium shot.

Wired from this: `camera_coverage.py plan` no longer cuts an angle in because the file exists. `angle_gate()` reads `<angle>_fidelity.json` (rules in `config/coverage_presets.json` → `rules.angle_gate`), refuses a sung line when identity or the lip fit fails or when nobody measured the angle, and moves the angle's `masterStart` by the fit's drift over the window actually used.

### 10.2 The world shot — the take standing IN a plate, behind something

The stoop still came back with the stoop small and far, and four boys crouched at a sedan at the curb. A waist-up take cannot stand on that stoop (his legs would show). He can stand at the foot of it, behind the car's hood. That needed three things the camera engine did not have, now in `camera_engine.py`:

* `place {scale, at, plane}` — the take anchored to a plate point, moving with it under the camera;
* `occlude {margin, soft}` — plate nearer than his plane (the plate's depth map) drawn in front of him: the hood hides his cut edge with no hand-made mask; on a living plate `--plate-depth-every N` re-measures it so the occluder can move;
* `move.about` + `move.parallax` — a pull-back about the point he stands on; as a lens zoom (parallax 0) the hood and he keep the relation they were placed in. With depth parallax the first run showed his cut edge for 28 frames — and the engine reported exactly those frames.

Measured: on the still plate, a 5 s pull-back from him to the whole street, cut edge hidden on every frame. On the living plate (Runway gen4.5 from the same still, after Higgsfield refused Kling with `403 not_enough_credits`; the saved still was reused, no second still charge): the boys lift the car, it rises in front of him and hides him, and from frame 76 — when the car has left — the engine reports the cut edge. So the shot is good for ≈ 3 s and is cut before that. **Honest limits:** he is ≈ 12 % of the frame's height at the wide end and the 720p plate allows only a 2× start, so this is a world shot, not a performance close-up; the car has wheels (the prompt asked for none).

### 10.3 bar5 — the angles and the world shot in the cut

`YSL_IceOn_bars24-46_bar5_angles` (1080p master, 720p proxy delivered): bar4 with `S06c`, `S11c`, `S12b` replaced by their gated angles and `S11a` replaced by the stoop shot (5 beats, cut while the car is in front of him). Coverage QA **PASS**: 16 performance cuts, 89 % moving, longest static 3.93 s, mean cut 1.16 bars; inserts 4/4 PASS; 43.279 s on the clock. One hand decision: the `S11a`/`S11b` boundary moved one beat later to let the lift play.

### 10.4 "From the lyrics" at the director's bar — three passes on the live app

| Pass | What was sent | Card 06 "…follow designers / the rims 21 don't ride no minors" (B-roll) | Card 07 "more cameras in the whip than a camera crew" (performance) |
|---|---|---|---|
| 1 | every card as `literal`, no examples | the artist with a rim and an empty seat | the artist seated in a car in a Canada Goose, static |
| 2 | mode by the card's role, standing rules, the director's four examples (new "Your bar" box, saved on the project) | adults turning a rim on a stand — no artist, camera moves, flat | car doors open on a camera array, reporters, flashes — staged around him; camera still "static" |
| 3 | + "Push it further" (the proxy's `surreal` reading) on insert cards; a generated "static" no longer pins the camera; **the old card's framing and camera no longer sent as "already chosen"** | a slow truck reveals the Bentley and four figures at its wheels torquing the last bolts, the car settles, a toy car rolls in and is kicked away, the headlights snap on — wide, 35mm anamorphic | a slow dolly reveals the Bentley behind him, reporters swarm it shooting through the open windows — push, medium wide |

The step that moved the insert card was the last one: the request had been telling the generator that the scene's framing and camera were "already chosen" — the generated close-up macro it was meant to replace. That is now sent only for a card the director overrode. Results land unsaved, as designed; nothing was saved on the YSL storyboard.

Still open here: the regenerated scene's full `render_prompt` has no column on `shot_overrides`, so a compiled world shot is built from the direction sentence.

### 10.5 Faults found by running it

| Fault | Where | Fix |
|---|---|---|
| Since rev 52 the planner wrote the 4 s trim's file seconds into `t0`/`t1`, the slot's song window: every sub-slot after an angle got a move window like 18.2–18.7 and the slot lost its window | `camera_coverage.py plan` | renamed; a re-plan now equals bar4's plan (test) |
| `--help` was a traceback on two tools (an unescaped `%05d` in a help string) | `camera_engine.py`, `composite_environment.py` | escaped; a test scans every script's help strings |
| `--plate-depth-every` was accepted and ignored | `camera_engine.py` | implemented for the occlusion depth |
| Overscan added the worst zoom and the worst pan wherever they occurred, cropping the plate on a zoom about an off-centre point | `camera_engine.py` | computed frame by frame; a zoom-in also keeps the plate's own pixels (`--max-plate-res`) |
| Higgsfield's refusal word `not_enough_credits` was not in the refusal patterns | `config/provider_caps.json`, `src/lib/worldBatch/rates.ts` | added; the Runs page stops submitting to a provider that says it |
| Lovable's migration tool now scaffolds drizzle (`drizzle/`, `drizzle.config.ts`, three dev dependencies, lockfile) while its agent reported "no package.json/bun.lock/config changes"; after the next publish it also edited `batch-token-proxy/contract.ts` and a visualiser test for its Deno check | Lovable | read, verified (tsc clean, suite green, build ok); recorded as the standing rule: its summary is not evidence |

Verified on main `df1ac7e`: `npx vitest run` → 148 files, 1593 tests passed, 1 skipped; `tsc` clean; `python3 -m pytest scripts/edit/tests` → 13 passed.

## 11. Round 2, after the Higgsfield top-up (late night, 2026-10-02)

Fendi added $50 to the Higgsfield API balance. Runs `run-20261002-r2`, `-sb`, `-sb2`, all from the Runs page. **Spend ≈ $9.93 at list** (Seedance ×2 $7.40 · five stills + Kling 5 s clips at $0.49 = $2.45 · two visualiser calls ≈ $0.08); of that ≈ $9.15 is Higgsfield, leaving ≈ $40.85 of the top-up by list rates.

### 11.1 The open items from § 10, tested

| Open item | What was run | Result |
|---|---|---|
| Larger angle asks | `S06c_high_wide` — "a high wide angle from well above his head height looking down at him" | A real high, wide, full-body angle (Seedance drew his legs and shoes). Identity 0.062, lip best-fit 0.625, camera change 1.0 → passes the gate. |
| Larger angle asks | `S08a_over_shoulder` — "from behind his right shoulder … not his face" | **Two of him**: he still faces the camera, and a second copy of him stands in the foreground seen from behind. Identity 0.021 and lip 0.595 say nothing about it. The angle is retired from the hook presets (`_removed_angles` records why): the angle prompt says "rapping to camera", which an over-the-shoulder camera contradicts. |
| World shot with him larger, and held | `P_stoop_close` → Kling 2.5 | A plate with a solid stone wall in front of the stoop. The take stands behind the wall at scale 0.30; a 2.3× pull-back starts with him at ≈ 40 % of the frame; **the cut edge is hidden on all 120 frames** while the boys leave the wall and push the car out of frame. The wall, not the car, is what hides him — so the occluder never leaves. |
| Storyboard → Runs, end to end | card 06 regenerated, saved, "Compile from the storyboard", run | First pass (as merged): the still's prompt was the whole five-beat direction plus "Must include: rims 21, designers, no minors", and the motion prompt ended "arrives on a match cut … truck 0.16, ease in_out, anamorphic_35, handheld 0.25". The still came back as two scenes in one image. After the fixes below: the still is one picture (black Bentley, a 21-inch rim, a man reaching for the door at a rain-slick marble curb), and the motion prompt is the direction plus "The camera trucks left to right slowly." |

**bar6** (`YSL_IceOn_bars24-46_bar6_wall`, 1080p master, 720p proxy delivered): bar5 with `S06c` taken from the high wide angle and `S11a`+`S11b` replaced by the wall shot as one two-bar world shot. Coverage QA **PASS**: 15 performance cuts, 89 % moving, longest static 3.93 s, mean cut 1.23 bars; inserts 4/4 PASS; 43.279 s on the clock.

### 11.2 What was built from it

* **`camera_change` in `reference_fidelity.py`** — how far the camera actually moved (picture difference at the same moments; the face's size, position and turn). The six angles bought today: the near-copy 0.09, the five real ones 0.56–1.0. `angle_gate` refuses below `camera_change_min` 0.3: on bar5's plan that is `S06c_low_hero`, correctly — the 1080p move on the take beats a 720p copy of it. An angle without his face reports instead of exiting, and has nothing to sync.
* **Stacked-panels check on generated stills** (`src/lib/worldBatch/stillCheck.ts`, mirrored as `panel_seam` in `run_world_batch.py`, identical numbers on the same stills). A still prompt that described the frame "upper half / lower half" returned a diptych on both candidates, and the runner paid Kling to animate it. Two measures: how completely a line crosses the frame, and whether it is ruler-straight at full size. The second is the one that decides — a kerb photographed square-on crosses 0.70–0.90 of the frame (straightness 0.15), the panel seam 0.92 (straightness 0.75). The runner takes the first candidate that is one picture; if none is, it stops before motion and a retry generates again. **Limit:** it finds a hard seam. A blended two-scene collage (the first storyboard still) passes it; that failure is prevented at the prompt, below.
* **The frame** — `shot_overrides.frame` (migration `20261002210000`), `ShotOverride.frame`, `ShotSpec.openingFrame`, a second field on the card ("the frame it opens on"), filled by "From the lyrics" with the generator's own `visual` (which was being dropped). The compiler's still prompt is the frame; with no frame, the first beat of the direction only. The direction is the motion prompt.
* **Motion prompt in words** — `cameraMoveToSentence` (Cursor's `prompts.ts`) now says "The camera pushes in slowly." instead of the 2.5D engine's parameters; transitions no longer enter the motion sentence (they belong to the edit).
* **Camera engine: pan under zoom** — the plate's pan reaches the screen multiplied by the zoom; the performer's did not. A zoom about an off-centre point slid him against the plate (on the wall plate his cut edge sat above the wall for 28 frames, and the engine said so). Both layers now take zoom × pan. The test that should have caught it only checked his width; it now checks that the occluder's edge stays at the same height on him.

### 11.3 Prompt rules learned (for anyone writing a still prompt)

* Describe a frame by **depth** — nearest the camera, behind it, beyond — never by halves or regions of the picture.
* A still prompt is **one moment**. Beats separated by semicolons come back as panels.
* The thing that hides a waist-up take's cut edge should be something that **stays** (a wall, a parapet, a counter), with the action in front of it.

### 11.4 Still open

* A duplicate of the performer in a generated angle is not caught by any measurement here; the gate refused that clip on a lip score 0.005 under the line. A question to the judge ("does the same person appear twice?") is the natural place.
* `seedanceAnglePrompt` cannot express a camera that does not see his face.
* The world plates still come back at whatever distance the image model chooses; the prompt got him from ≈ 12 % to ≈ 16 % of the frame at the wide end. The pull-back is what makes him read.
* The other 24 storyboard cards are the generated treatment, not regenerated ones; compiling them all would animate flat inserts. Regenerate, read, save, then compile.

Verified on main `a180b01` + this round's files: `npx vitest run` → 148 files, 1601 passed, 1 skipped; `tsc` clean; `python3 -m pytest scripts/edit/tests` → 15 passed.

