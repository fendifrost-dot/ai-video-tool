# Astra visual QA — completed-draft review loop (Phase 1)

**Status:** 2026-09-21 · Claude · reviewer = **GPT-6 Astra** via OpenAI API (`gpt-6-astra`) through the user-JWT-only edge function `astra-visual-review-proxy`. First target: `YSL_IceOn_bars24-46_v1`.

## The loop

```
TREATMENT → PRODUCTION → ASSEMBLY → automated QA → ASTRA VISUAL QA → structured defect report
        → CLAUDE repair (owning subsystem) → rerender affected shots only → reassemble → ASTRA re-review → PASS / continue
```

Astra is a reviewer, not the creative director. It compares **intent** (Treatment + ShotSpecs + garment truth + source truth + assembled timeline) with **what is visible**. Fendi is final creative authority. Claude builds.

## Tooling constraint (verified 2026-09-21)

`gpt-6-astra` on the API accepts **text + images only** — no `input_video`, and an mp4 is rejected as a file. The documented way to review video with Astra is dense, timestamped frame sequences. `scripts/qa/build_astra_review_package.py` therefore turns the actual rendered draft into:

| Part | Sampling | Purpose |
|---|---|---|
| `shots-<ids>` (groups of 4) | 3 fps (6 fps for slots < 2.5 s) | Level 1 — shot conformance, wardrobe QA |
| `transitions` | ±0.25 s at 12 fps around every cut | Level 2 — transition / edit review |
| `sequence` | 2 fps across the whole draft | Level 3 — sequence / treatment conformance + the 15 standing questions |

Every part carries the full intent package as text (treatment direction, looks, one expected line per ShotSpec, the assembled timeline manifest) plus the reference images (flat product photos = garment truth, an untouched master frame = identity anchor, the source contact sheet = source truth). `watched_video` in the stored review is set honestly: `false` for frame-strip review, `true` only if a future path passes the video itself.

## Contract

`src/lib/qa/astraVisualReview.ts` — Zod schema (`AstraReviewSchema`): overall scores, per-shot EXPECTED / OBSERVED / VERDICT (`PASS|FAIL|PARTIAL|UNCERTAIN`) with confidence, per-transition verdicts, sequence defects with stable `defect_id`, severity, draft `time_range`, `recommended_owner` (routing enum) and `recommended_action`, `answers`, `final_verdict` (`PASS|REPAIR_REQUIRED|HUMAN_REVIEW_REQUIRED`), `escalate_to_fendi`. `diffReviews()` tracks defect identity across revisions (resolved / persisting / introduced). `repairableDefects()` excludes treatment-level items and notes.

## Defect routing

| Astra finding | `recommended_owner` | Fix lane |
|---|---|---|
| wrong wardrobe / garment not on body | `wardrobe_generation` | grok-video-edit lane / hero frame |
| garment morphing, flicker | `temporal_propagation` | temporal repair |
| logo / wordmark | `brand_repair` | `scripts/edit/garment_graphic_track.py` — canonical graphic tracked on the garment plane (deterministic, occlusion-aware) |
| identity drift | `identity` | identity anchors / generation / compositing |
| closet still visible | `environment` | `scripts/edit/composite_environment.py` |
| bad mask edge | `compositing_mask` | `scripts/edit/composite_environment.py` (`--refine shadow`: known-background unmixing + structure test) |
| bad transition | `edit_fx` | `scripts/edit/render_broll_slots.py` (recorded recipe) / assembler |
| wrong source moment | `source_range` | timeline / source-range mapping |
| lips out of sync | `sync` | `performance_syncs` — and anything Astra marks `UNVERIFIABLE FROM SAMPLES` goes to native-media QA / Fendi, never to a repair lane |
| B-roll off-treatment | `broll` | B-roll production |
| soft / low-res | `export_quality` | reconstruction / upscale / export |
| needs a treatment decision | `treatment` | **Fendi** |

## Evidence boundary (ruling 2026-09-21 §7)

The material is silent, sampled frames. The package builder tells Astra what that can and cannot establish (`UNOBSERVABLE` list in `build_astra_review_package.py`): musical timing and downbeat landing, audio/lip sync, one-native-frame cut precision, sub-sample motion (flicker, strobe cadence, glitch duration), native-resolution sharpness. For those Astra answers `UNVERIFIABLE FROM SAMPLES` with confidence ≤ 0.3 and names the native-media check that would settle it; if filed as a defect it is a `note` owned by `sync`/`edit_fx` with that prefix, and the aggregator lists it under `_native_media_qa_required` instead of routing it to a repair lane. Do not weaken this to get a cleaner verdict.

## Escalation (no infinite loop)

Route to Fendi when Astra and Claude disagree materially, a fix needs a treatment change, several aesthetically valid fixes exist, a defect persists after targeted repair, Astra flags something technically fine but creatively questionable, or spend/authorization is needed. Otherwise repair and continue.

## Loop log — `YSL_IceOn_bars24-46`

| Rev | Astra verdict | Scores (treat / coh / identity / wardrobe / env / edit) | Defects | Cost | What Claude repaired next |
|---|---|---|---|---|---|
| v1 | REPAIR_REQUIRED | 4 / 4 / 8 / 3 / 4 / 5 | 44 (7 blockers: body dropouts + closet leaks) | $5.19 | matte → RobustVideoMatting; hook plate with several mirror panels; S04 1.25× crop; S05 diamond insert; S10 corridor strobe; S02 locked macro; Look 1 re-generated reference-true (v3c) |
| v2 | REPAIR_REQUIRED | 6 / 6 / 8 / 4 / 6 / 7 | 29 (0 blockers; **20 resolved**, 4 new: edge halo, S06→S08 garment reset, cut-label offset, S10 strobe unverified) | $5.00 (+$2.3 for one `max_output_tokens` incomplete part) | matte v3 (RVM fgr decontamination, alpha 0.4→0.85 remap, static-pixel peel in the matte band); frame-label snap in the builder; wardrobe re-rolls **blocked on xAI credit** |
| v5 | REPAIR_REQUIRED | 5 / 5 / 8 / 3 / 5 / 6 | 33 (0 blockers; 0 resolved, 29 persisting "changed manifestation", 4 new: S08 hem drift, matte foreground erosion S11/S12, two verification gates) | $5.28 (+≈$2.3 for one incomplete transitions part) | the FULL OUTFIT pass (jacket-only → whole Look via `lookId`, Fendi's ysl.com detail crops as references, construction facts first in the prompt) got the outfit on him but Astra holds the zero-deviation standard: wardrobe 4→3 because every shot is still a different approximation of the garment. Generator-bound; next lever is a hero-frame-conditioned lane, not more prompt rolls. Matte fringe/shadow halo persists (alpha remap did not close it). |

Aggregates and per-part results: `docs/research/results/2026-09-20-ysl-real-video-1/astra/` (`astra_review_v1.json`, `astra_review_v2.json` with `_diff_vs_prev`).

What the loop taught us (generalized):
* **Defect identity across revisions works only if Astra is handed the previous defect list** — `build_astra_review_package.py --prev-review` puts the prior `defect_id`s in every part with the rule "same id if still present, do not list resolved ones, new ids for new problems"; `scripts/qa/aggregate_astra_review.py --prev` then computes resolved / persisting / introduced. Without it Astra invents ids for the same finding (v1 had `S04-CROP-MISSING` and `S04-MISSING-125-CROP` from two parts).
* **Repair notes are claims, not facts** — they go in as "verify in the frames"; Astra did downgrade one claim (PERF-MATTE-COVERAGE "partially repaired, not closed").
* **Output budget**: the sequence part with 15 questions + prior defects exceeded `max_output_tokens: 16000` (`incomplete`, still billed ≈ $2.3). The re-run with `reasoningEffort: "medium"` and an explicit "under 9000 tokens, ≤ 45 words per item" clause completed at $1.08. The proxy should raise the cap; until then the builder's sequence instructions carry the budget clause.
* **Sampling can create phantom findings**: the 2 fps sequence strip landed on the white eighths of the S10 strobe (Astra: "S10 white in both samples"), while the 6 fps shot strip passed S10. Frame labels also lagged content by one frame at cuts (`SEQ-CUT-BOUNDARY-OFFSET`) because `ffmpeg -ss t` returns the first frame with pts ≥ t; the builder now snaps every sample to its frame and labels the assembler's actual cut frame.
* **Ownership routing held**: every v2 defect landed on the subsystem that could fix it; the ones Claude cannot close alone are `wardrobe_generation` / `temporal_propagation` (stochastic per-clip xAI edits — construction differs shot to shot; needs either credit for re-rolls or a hero-frame-conditioned lane) and `brand_repair` (no deterministic wordmark repair exists for moving footage yet).

## Nothing project-specific in the tooling

The builder templates its brief and the 15 standing questions on a `treatment` block in the ShotSpecs file — `artistName`, `authority`, `brand`, `creativeDirection`, `sourceEnvironment` — with neutral fallbacks, so the same script reviews any artist's section. B-roll/FX renders come from `scripts/edit/render_broll_slots.py`, which reads each B-roll ShotSpec (fx / cameraMotion) plus a per-section `broll_recipes.json` (plates and macro sources) — the old id-by-id `ysl_section_fx.py` is gone. Garment truth stays in the prompt registry (data per garment), the wardrobe lane itself takes any Look (`lookId`).

## Running it (Phase 1, manual)

1. `python3 scripts/qa/build_astra_review_package.py --draft <mp4> --shotspecs <json> --assembly <assembly.json> --draft-id <id> --ref "label=path" … [--prev-review astra_review_v1.json --repair-notes notes.txt] --out pkg/`
2. In the authenticated AVT tab load `scripts/qa/astra_review_runner.browser.js`, select `pkg/parts/*.json` + `pkg/frames/*.jpg` + refs, run `window.astraReview.run({projectId, draftId, files})`.
3. Results land in `project-exports/<user>/<project>/astra-reviews/<draftId>/<part>.json` and in the returned object; `python3 scripts/qa/aggregate_astra_review.py --parts 'review_v2/*.json' --manifest pkg/manifest.json --project-id <uuid> --out astra_review_v2.json --prev astra_review_v1.json` aggregates into `AstraReviewSchema` (+ `_diff_vs_prev`); commit under the draft's results folder.
4. Repair → rerender affected slots → reassemble → rebuild package (v2) → re-run → `diffReviews`.

Latency: the edge gateway cuts requests at ~150 s and a 50–90-frame Astra part takes longer, so the proxy runs OpenAI in **background mode**: `mode: "submit"` returns a `responseId` immediately, `mode: "poll"` returns `status` until `completed`, then stores the review. The runner submits all parts, then polls every 15 s.

Cost: list price $10 / 1M input, $50 / 1M output; a full 5-part review of a 43 s draft ≈ 300 images ≈ $5–7. The proxy fails closed above `maxCostUsd` (default $2 per part).

Secrets: `OPENAI_API_KEY` (or `FROST_OPENAI` / `ASTRA_API_KEY`) as an Edge Function secret. The key is never sent to or read by the browser.
