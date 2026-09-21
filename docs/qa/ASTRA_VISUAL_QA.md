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
| logo / wordmark | `brand_repair` | deterministic branding repair |
| identity drift | `identity` | identity anchors / generation / compositing |
| closet still visible | `environment` | `scripts/edit/composite_environment.py` |
| bad mask edge | `compositing_mask` | segmentation / compositing |
| bad transition | `edit_fx` | `scripts/edit/ysl_section_fx.py` / assembler |
| wrong source moment | `source_range` | timeline / source-range mapping |
| lips out of sync | `sync` | `performance_syncs` |
| B-roll off-treatment | `broll` | B-roll production |
| soft / low-res | `export_quality` | reconstruction / upscale / export |
| needs a treatment decision | `treatment` | **Fendi** |

## Escalation (no infinite loop)

Route to Fendi when Astra and Claude disagree materially, a fix needs a treatment change, several aesthetically valid fixes exist, a defect persists after targeted repair, Astra flags something technically fine but creatively questionable, or spend/authorization is needed. Otherwise repair and continue.

## Running it (Phase 1, manual)

1. `python3 scripts/qa/build_astra_review_package.py --draft <mp4> --shotspecs <json> --assembly <assembly.json> --draft-id <id> --ref "label=path" … --out pkg/`
2. In the authenticated AVT tab load `scripts/qa/astra_review_runner.browser.js`, select `pkg/parts/*.json` + `pkg/frames/*.jpg` + refs, run `window.astraReview.run({projectId, draftId, files})`.
3. Results land in `project-exports/<user>/<project>/astra-reviews/<draftId>/<part>.json` and in the returned object; aggregate into `AstraReviewSchema`, commit under the draft's results folder.
4. Repair → rerender affected slots → reassemble → rebuild package (v2) → re-run → `diffReviews`.

Cost: list price $10 / 1M input, $50 / 1M output; a full 5-part review of a 43 s draft ≈ 300 images ≈ $5–7. The proxy fails closed above `maxCostUsd` (default $2 per part).

Secrets: `OPENAI_API_KEY` (or `FROST_OPENAI` / `ASTRA_API_KEY`) as an Edge Function secret. The key is never sent to or read by the browser.
