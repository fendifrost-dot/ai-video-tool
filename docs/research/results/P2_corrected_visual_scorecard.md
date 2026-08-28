# P2_corrected — visual / garment scorecard

**Experiment:** `grok-recap-2026-08` v1.0.0  
**Run:** `ed27462b-39c6-9fe6-9d6b-e3a6475809c0`  
**Reviewed:** 2026-08-28  
**Method:** Read-only frame extraction from stored MP4 (anon storage sign + ffmpeg). **No new provider calls.**

**Scale:** 0 = fail · 1 = partial · 2 = good · 3 = indistinguishable

| # | Axis | Score | Label | Note |
|---|------|-------|-------|------|
| 1 | Identity (face, beard, glasses) | 2 | OBSERVED | Same subject vs source t≈2.235s |
| 2 | Body geometry | 2 | OBSERVED | Stable proportions |
| 3 | Pose fidelity | 2 | OBSERVED | Arms-crossed / lean preserved |
| 4 | Motion continuity | 2 | OBSERVED | ~3.7s continuous; minor hand blur |
| 5 | Camera framing | 2 | OBSERVED | Locked-off closet shot |
| 6 | Background | 3 | VERIFIED | Door, closet, boots, hanger graphic preserved |
| 7 | Lighting / shadows | 2 | OBSERVED | No scene relight |
| 8 | Garment swap (navy track + white stripes) | 2 | OBSERVED | Camo → navy track w/ sleeve stripes; construction approximate |
| 9 | Logo / typography | 1 | OBSERVED | Chest logo not legible at 720p |
| 10 | Temporal consistency | 2 | OBSERVED | Mild stripe-edge softness; no full-scene flicker |
| 11 | Edit vs regenerate | 2 | VERIFIED | **MAJOR FAILURE: no** — edit character, not regen |

**Sum (axes 1–10):** 20 / 30

## Technical facts

| | Output | Source |
|--|--------|--------|
| Resolution | 720×1280 **[VERIFIED]** | 1080×1920 **[VERIFIED]** |
| Duration | 3.71 s **[VERIFIED]** | 4.02 s **[VERIFIED]** |

## Verdict

- **API [VERIFIED]:** Combined `video` + `reference_images` accepted (see `P2_corrected_edits_video_plus_reference_images.json`).
- **Visual [OBSERVED]:** Partial pass — strong scene/identity/pose preservation; garment direction correct; logo/stripe micro-detail not production-ready.
- **Architecture C [RECOMMENDATION]:** Research path remains viable; full recap Tests A/B still required before any production decision.

**Spend:** $0.32 (this run only). **Cumulative:** $0.32 / $6.00.
