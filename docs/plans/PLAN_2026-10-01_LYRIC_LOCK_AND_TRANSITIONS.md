# Plan — from "promising sample" to "what I'm saying is on screen"

Written 2026-10-01 after the first sample of the new build (`docs/research/results/2026-10-01-sample-build/`). Fendi: the creativity is great but the clips don't line up with the lyrics, and that alignment is what he'll want to deliver most of the time; the storyboard needs the lyrics per box, a manual override, and a per-box regenerate-from-the-lyrics; and transitions need to be mastered or get a dedicated tool. Part A closes out the stall audit. Parts B and C are the product work. Part D is the slot for Fendi's own next steps.

Every item names its files, its cost, and what it depends on. "Scripts lane" = deterministic Python in `scripts/`, runs today; "app" = React + edge functions, deployed through Lovable from main; "CC" = Control Center.

---

## Part A — the audit items (status and what remains)

| # | Issue | Status | What remains |
|---|---|---|---|
| A1 | Compositor OOM (5.5 GB) | **done** — disk-backed masks/mattes, chunked prior; 2.1 GB measured | none; re-measure if frame size or `--temporal` grows |
| A2 | No resource governor | **done** — `scripts/_lib/jobs.py`, entered by compositor, gate, batch runners | add it to `camera_engine.py` and `grade_to_bank.py` when they next change (both are frame-streaming already and have not been killed) |
| A3 | Paid submit lost to a crash | **done** — write-ahead manifest, `--resubmit-unknown` reconciliation | a CC route that lists recent `tool_execution_logs` by provider/model/time would make reconciliation automatic instead of a human SQL check (CC, small; needs the lock lifted for one read-only function) |
| A4 | Provider caps and balance | **done** for caps and stop-on-refusal (`config/provider_caps.json`) | a balance pre-flight: Runway exposes `GET /v1/organization` (credits); route it through CC `video-providers-job-status`-style read so a batch refuses to start when the estimate exceeds the balance (CC, small) |
| A5 | Batch work runs on the hourly browser token | **built, awaiting commit** (Fendi delegated the decision 2026-10-02: "choose the best route") | route chosen: a revocable **batch credential** — `batch-token-proxy` edge function + `batch_credentials` table (migration) + `scripts/_lib/auth.py` used by every runner. Enrolled once from a live session, the credential mints an ordinary user session server-side (magic-link hash verified in-process, nothing emailed), rate-limited 12/h, logged per mint, revocable; no existing proxy widens and no new secret is needed. The commit of these files was blocked by the session's safety classifier (auth-minting code); the patch is in the handoff (`batch-identity/0001-batch-identity.patch`) for Fendi or a Claude Code session to apply, then Lovable deploys the function and runs the migration, then `python3 scripts/_lib/auth.py enroll "sandbox runner"` once with a browser JWT |
| A5b | Multi-angle from a real take | **done** — Seedance 2.5 reference-to-video (`docs/research/results/2026-10-02-seedance-multiangle/`) | a `seedance_ref` route in the batch runner; duration = source; wardrobe constants in the prompt; `reference_fidelity.py` gate before a sung line |
| A6 | Ten-minute composites on 2 CPU cores | **roadmap** | the render worker (GPU, queue, shot spec as the job) — the only real fix; ≈ 25× on a T4 |
| A7 | 16:9 plates cropped to 9:16 lose edge action | **one field** | plates in the shot list get `"aspect": "9:16"`; Kling text-to-video ignores aspect, so plates go still-first too (xAI 9:16 still → Kling i2v), same route as worlds |
| A8 | Two concepts fail physics every time (kids carrying a car, the snowman) | **restage** | car on a flatbed the kids walk beside; snowman as a rigid mask that never deforms; both are prompt data, no code |

---

## Part B — lyric-locked storyboard

The root cause of "the clips don't line up with what I'm saying": the pipeline has **no lyric timing**. `video_projects.lyrics` is one text blob; shots carry a `timeline` but nothing says which words are sung inside it; the visualiser was fed lines by hand; the batch shot list was hand-written. Everything below hangs off fixing that first.

### B1. Lyric timing — the foundation (scripts lane first, then app) — **done 2026-10-02** (`align_lyrics.py`, `lyric_lines` migration applied, YSL seeded; results in `docs/research/results/2026-10-02-lyric-lock-and-transitions/`)

What: every lyric line gets `start`/`end` on the song clock, and every word inside it too.
How: forced alignment of the lyrics text against the song's vocal — `whisperx` (or `stable-ts`) with the known lyrics as the transcript, run once per song, output `lyric_lines` rows `{project_id, section, line_index, text, start, end, words:[{w,start,end}]}`. Deterministic, $0, ≈ 2 min per song on CPU. A manual LRC/SRT import is the fallback for a song the aligner struggles with (ad-libs, heavy effects).
Where: `scripts/lyrics/align_lyrics.py` (new) → a new table `lyric_lines` (migration; RLS = owner, same shape as `project_assets`) → `src/lib/queries/lyricLines.ts`. The existing `treat/lyric_windows_section.json` becomes an export of this table, not a hand file.
Depends on: nothing. Enables everything else in B.

### B2. Lyrics inside every storyboard box (app) — **done 2026-10-02, live**

What: a shot whose `timeline` is 11–15 s shows the lines (and the partial words at the edges) sung in 11–15 s, in the card, above the treatment text; a shot with no lyrics says "instrumental"; the hook is marked as hook.
Where: `ShotCard.tsx` gains a `lyrics` block fed by `ShotStoryboard.tsx` from `lyric_lines` ∩ `spec.timeline` (pure function in `src/lib/treatment/lyricsForShot.ts`, unit-tested). No new state; it is a join on the timeline.
Depends on: B1.

### B3. Manual override of the generated treatment, per box (app)

What: in the card, the treatment text becomes editable; what Fendi types is saved as `treatmentOverride` on the shot and is what every downstream step uses (visualiser prompts, the batch shot list, the render prompt); the generated text stays visible underneath as "generated" so he can revert. An override is never overwritten by a regenerate.
Where: `ShotSpec` gains `treatmentOverride: string | null` (schema + DB column `shots.treatment_override`); `ShotCard.tsx` edit mode; `shotSpec.ts` `effectiveTreatment(spec)` helper used everywhere prompts are built.
Depends on: nothing (B2 makes it useful).

### B4. "Regenerate from the lyrics" per box (app + the visualiser)

What: a button on the card: "Generate from these lyrics". It sends the box's lyric lines (B2), the shot kind (performance plate / world / garment character), the look preset, and Fendi's override text if any, to `lyric-visualizer-proxy` in a new **literal mode**: the scene must depict the nouns and actions in the lines (the rims, the kids, the car, the reporters), one subject per shot, in the bar's register; it returns one scene card for this box only, written back as the generated treatment (never over an override).
Where: `lyric-visualizer-proxy` gains `mode: "literal" | "surreal" | "performance"` and a single-shot request shape (`{lines, kind, look, constraints}`); the prompt template puts the lines' concrete nouns in a required-elements list the model must echo back (so fidelity is checkable, B5). Card button + mutation in `src/lib/queries/treatment.ts`. Cost ≈ $0.04 per regenerate on grok-4-fast.
Depends on: B1, B2, B3.

### B5. Brief fidelity — the third gate axis

What: the gate currently answers "photographed?" and "on the bar?". It now also answers "does the clip show what the card said?": the judge receives the scene card's required-elements list and reports which are present, which absent, and a `brief_fidelity` 0–1; a clip under 0.7 is REVIEW regardless of realism. This is what turns "creative but off-lyric" into a measurable reject.
Where: `realism_gate.py --brief <card.json>`; the judge prompt gains the checklist; the report gains `brief`. `run_world_batch.py` passes each shot's card automatically.
Depends on: B4's required-elements list (the card carries it).

### B6. The batch reads the storyboard, not a hand-written list

What: `run_world_batch.py --from-project <id> --section <name>` builds its shot list from the shots table — one world/plate shot per storyboard box that needs generation, prompt = effective treatment (override wins), lyrics attached for the brief check, aspect from the project. The sample's `shots.json` files become exports, not inputs.
Where: `scripts/broll/shotlist_from_project.py` (new, reads via the user JWT like everything else; a batch identity (A5) removes the hourly limit).
Depends on: B1–B5.

### B7. The hook has no master cuts

The lines Fendi's exemplars belong to (H1–H8) sit at ≈ 23–55 s, before bars 24–46; the only master cuts are the verse section. Cutting the hook needs the master (1.84 GB, in storage) pulled once and the cut list extended — scripts lane, deterministic, ≈ 30 min of machine time, no spend. Without it the lyric-locked worlds for the hook have no performance to sit beside.

Order inside B: B1 → B2 → B3 → B4 → B5 → B6, with B7 in parallel. B1–B3 are a day of work; B4–B6 another; the first lyric-locked sample is possible after B4 even with a hand shot list.

---

## Part C — transitions

Today the shot spec declares seven transition types (`cut, crossfade, fade_black, fade_white, whip_pan, glitch, flash`) and the assembler implements three of them as ffmpeg fades plus a two-frame flash. A music-video cut lives on the grid; the transitions have to too.

### C1. A transitions engine in the assembler (scripts lane) — **done 2026-10-02** (`transitions.py`, `transition_presets.json`, assembler handles)

What: `scripts/edit/transitions.py` — every transition is a function of (outgoing frames, incoming frames, duration on the beat grid, params) producing frames; applied by `assemble_section.py` across each cut so the song clock never moves (the transition straddles the cut point, half in each shot, exact frame budget kept). The library, all deterministic: hard cut on the beat; crossfade; dip to black/white; flash frame; whip-pan with directional motion blur (reusing `camera_engine.py`'s whip); speed ramp into the cut (ramp the last beat of the outgoing shot); zoom-punch (scale the incoming shot from 1.15 → 1.0 over two frames); match cut by motion vector (pick the cut frame where the two shots' flow directions agree); light leak and film burn overlays (procedural, grain-matched to the look bank); strobe/stutter on sixteenth notes; luma wipe; glitch (block displacement + channel split, not just a white frame). ffmpeg's `xfade` covers the simple ones; the rest are frame-level in numpy.
Where: `scripts/edit/transitions.py` (new), `assemble_section.py` calls it; `config/transition_presets.json` names each with default duration in beats, parameters, and the look it suits.
Cost: $0.

### C2. Transitions as data on the storyboard (app) — **done 2026-10-02 (presets on the cards; picker lands with B3's override block)**

Landed: `TransitionSchema.preset` (name from `config/transition_presets.json`; the DB family stays in `type`), `src/lib/treatment/transitions.ts` (mirror of the presets + `section_defaults`, sync-tested; `transitionInFromPreset(name, bpm)`, `transitionPresetLabel`), `applyCoverageDefaults` fills the section's transition on its first card, `ShotCard` names the preset with its beats. The per-card picker is a select in the B3 override block (Claude Code brief).

What: each card's `transitionIn` gets the full preset list with duration in beats (not seconds — the grid is 122 BPM, one beat = 0.49 s), and a per-section default ("hook: whip-pans and flashes on the 1; verse: hard cuts on the 1, crossfades on the 3"). Beat-quantised durations end up exact on the clock.
Where: `shotSpec.ts` `TransitionSchema` gains `beats`, `preset`, `params`; `ShotCard.tsx` picker; the DB enum `shot_transition_type` extends.

### C3. An audition page

What: a page that takes Fendi's cut, shows each cut point with the outgoing and incoming shots, and lets him pick a transition and preview it in place — the sample renders only the four seconds around the cut (≈ 2 s of compute each), so trying ten transitions on a cut costs seconds, not a re-render. His picks write back to the cards (C2).
Where: app page `TransitionsPage.tsx`; preview via a new edge function `transition-preview-proxy` that calls the scripts-lane engine (needs the render worker to be instant; until then it renders in the sandbox on request).

### C4. Cut-point QA — **partly done 2026-10-02 (coverage side)**

Landed: `scripts/qa/coverage_qa.py` on the rendered section (static share, longest static run, cadence, repeats) and `measureCoverage` on the storyboard (same rules, same numbers, shown where the treatment is written: the storyboard strip + per-card flags). Still open: the beat-landing / lyric-boundary / whip-spacing checks in `native_media_qa.py`.

What: deterministic checks in `native_media_qa.py`: every cut lands within ±1 frame of a beat (or is flagged as intentional), no transition crosses a lyric line boundary unless the card says so, no two whip-pans within a bar. The report is part of every assembly.

Order inside C: C1 → C2 → C4 → C3. C1 alone upgrades the next sample.

---

## Part E — Coverage: movement and angle changes as the norm (Fendi, 2026-10-02)

"Music videos are almost always filled with lots of camera movement and switching of angles … I would have to do each performance shot 3–6× to get the different camera angle cuts … this should be the norm for the tool, not the exception."

| # | Item | Status |
|---|---|---|
| E1 | `config/coverage_presets.json` — per section: move vocabulary with odds, cut cadence in bars, generated-angle share, angle sentences, transition on the 1; rules: static share ≤ 12 %, longest static run ≤ 4 s, no consecutive repeat of a move or a framing, pushes and pulls alternate, framing rotation | **done** |
| E2 | `scripts/edit/camera_coverage.py plan` — every performance slot → sub-slots on the bar grid, a move per cut drawn deterministically under the rules, generated-angle requests for the Seedance lane, `shotspecs_coverage.json` + `renders_coverage.json` for the assembler | **done** |
| E3 | `scripts/edit/camera_coverage.py render` — the 2D virtual camera over the finished slot clip (zoom / pan / roll / handheld + the lens stack), or the 2.5D camera (`camera_engine.py`) when a matte export exists | **done** (2D measured on bar2; 2.5D needs matte exports per take — `composite_environment.py --export-matte`) |
| E4 | Generated angles per line (Seedance 2.5 reference-to-video, `run_world_batch.py --route seedance_ref`, requests written by the planner) | **waits on the batch credential** |
| E5 | `scripts/qa/coverage_qa.py` — moving share, longest static run, consecutive repeats, cut cadence; PASS/FAIL against the presets | **done** |
| E6 | App: `applyCoverageDefaults` gives every performance card a move and a framing at treatment time (the director's own choice wins) | **done, tested** |
| E7 | The story-led motion template Fendi supplied (`config/treatment_templates/motion_story_v1.json` + seed prompt template) feeding the generators' per-scene motion contract | **template + seed done; generator wiring with B4 (Claude Code brief)** |
| E8 | Adjustments after bar3 (2026-10-02): the generators write the camera as prose and left `type=static` on every card, so E6 never fired on a real treatment → `classifyMotion` / `MOTION_WORDS` read the prose into the move vocabulary (app + planner, same patterns); draws stay inside the static share/run budget; `measureCoverage` + the storyboard strip and card flags; the planner honours the director's written camera on a slot's first cut and enforces `max_static_run_s`; `scripts/edit/coverage.py` renamed `camera_coverage.py` (it shadowed the `coverage` package for rembg/numba) | **done, tested** |
| E9 | 2.5D moves on living plates: `camera_engine.py` takes a VIDEO plate (depth from its first frame) and the compositor's plate grade travels with the matte export (`grade.json`); `composite_environment.py` gains performer placement (`--fg-place`) and the FOREGROUND OCCLUDER layer (`--occluder-auto` box → rembg cutout of the plate object, `--occluder-from-plate` mask, `--occluder-below` horizon, `--occluder` RGBA cutout; sources union) so waist-up takes read full-body behind a car / stoop rail — measured on S11 + the stoop plate | **done; bar4 (1080p, 2.5D) rendering** |

## Part D — Fendi's next steps

(Fendi inserts his own items here; everything above is sequenced so that B1 and C1 can start immediately and A5 waits on his decision.)

---

## Sequencing proposal

Week 1: A5 commit + enrol · B1 lyric timing · C1 transitions engine · A7/A8 plate and restage data · B7 hook cuts. Week 2: B2–B4 storyboard (lyrics, override, regenerate) · C2 transitions on cards · first lyric-locked sample on the hook. Week 3: B5 brief-fidelity axis · B6 batch-from-storyboard · C4 cut-point QA · C3 audition page. The render worker (A6) is its own track and is what makes C3 and the ten-minute composites disappear.
