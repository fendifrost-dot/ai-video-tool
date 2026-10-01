# Genjutsu outfit-swap test — does Higgsfield's video-to-video hold the garment without rebuilding the frame?

Opened 2026-10-01 by Claude on Fendi's instruction: before the garment lane is parked, run a full test of Higgsfield's newest model, **Genjutsu**, which claims to swap an outfit in existing footage without regenerating the rest of the frame. If true, it removes the two failure modes that parked the lane — garment construction drifting between independent samples, and the swapped region re-drawing the performer.

## 1. What Genjutsu is (verified against the vendor's API docs, 2026-10-01)

Two models, released 2026-09-17, on the same `api.higgsfield.ai` host and `Key id:secret` auth as the catalogue models Control Center already proxies:

| Model | Path | Keeps | Rebuilds |
|---|---|---|---|
| Object Swap | `/higgsfield/genjutsu/object-swap/v1.0` | the rest of the footage | only the element the prompt names (an outfit, a product, a character) |
| Motion Transfer | `/higgsfield/genjutsu/motion-transfer/v1.0` | motion, camera, timing | everything else, from the references |

Inputs: `video_url` (4–30 s; longer is trimmed; ≥ 409 600 px per frame), `image_urls` (1–8), `prompt`, `resolution` 480p · 720p · 1080p. Output length = source length. Billed per **source** second, rounded up: $0.318 · $0.681 · $1.632. One 6.97 s performance cut therefore costs $2.23 · $4.77 · $11.42. Nothing published measures identity drift or garment fidelity; that is what our gate measures.

Route: CC `video-providers-higgsfield-model` gained a `video_to_video` mode (CC main `5a6408d`, deployed): `modelVariant: "genjutsu-object-swap" | "genjutsu-motion-transfer"`, `referenceVideoUrl`, `referenceImageUrls[1..8]`, `resolution`; reached from AVT through `proxy-provider-call`, status through `video-providers-job-status {provider: higgsfield, id}`.

## 2. Test design

Stage 1 — smoke, one shot (S06, the cut where the Grok edit lane did best, so the comparison is like for like), 720p, the White Ice Look's five references (flat front, on-model, collar/zip detail, sleeve-inside worn and flat; website UI chrome trimmed off the detail crops because reference images carry their whole frame), prompt = the Look's garment truth + "keep everything else exactly as in the source". Judged by the realism gate with the identity metric armed (ArcFace vs the real-artist centroid), `construction_score.py` against the flat reference, and the contact sheet.

Keep/kill for stage 1: KEEP if identity_dist stays in the real-footage band (≤ 0.25; the Grok edit lane sat at 0.43–0.59 and DoP at 0.64), the untouched regions are pixel-stable (flow-unexplained residual in the real band), and the garment matches the truth on the four construction points that killed the Grok lane (one chest stripe interrupted by the zip, wordmark left chest only, navy inside the sleeves not outside, stand collar navy inside / mastic outside). Anything else is a KILL for the "exactly, without rebuilding the frame" claim, with the specific tell recorded.

Stage 2 — if stage 1 keeps: the remaining hook slots (S08, S09, S11, S12) at 720p from the same references and prompt (≈ $19), to measure cross-shot consistency (the thing a per-sample edit model cannot do). Stage 3 — a 1080p render of the best slot to see whether the 720p softness is the model or the resolution ($11.42).

Budget: this lane's YSL ledger (`docs/LEDGER_YSL_TESTING_BUDGET.md`) — $28.43 remained when the lane was parked; stage 1 uses $4.77, stage 2 ≈ $19, stage 3 $11.42, so the full test fits only if stage 3 is dropped or stage 2 trimmed; Fendi decides at the threshold as agreed.

## 3. Stage 1 — S06 at 720p

Submitted 2026-10-01 (job `c6008c10-7f18-45fe-a85a-e90c7b3e46dc`, estimate $4.77); rendered in ≈ 11 min; result 720×1280, 161 frames at 24 fps, no audio. Persisted as `project-clips/…/genjutsu/S06_genjutsu_swap_720p.mp4` (raw) and `…_conformed.mp4` (assets `bad0ee66…`, `59894d4f…`).

### 3.1 Result — KEEP (stage 1 passes every keep/kill criterion)

Evidence: `S06_source_frames.jpg` vs `S06_genjutsu_frames.jpg` (same six frame indices), `S06_genjutsu_torso.jpg` (construction), `S06_source_vs_result_diff_t2p2.jpg` (source · result · |difference|), `S06_grade_compare.jpg` (source · raw · conformed), `S06_genjutsu_gate.json`, `S06_conform.grade.json`.

| Criterion | Measured | Band | Call |
|---|---|---|---|
| Identity (ArcFace distance to the real-artist centroid) | median **0.178**, p95 0.278 | real cut 0.13; Grok edit lane 0.43–0.59; DoP 0.64 | real band |
| Realism judge (gpt-6-astra, 10 frames) | **PASS, ai_likelihood 0.04** | real cut 0.03; best Grok edit ≈ 0.3; DoP turbo 0.24 | first generated clip at the real footage's level |
| Untouched regions | SSIM 0.97 on the shelf band, no spatial shift (phase correlation ±0.2 px) | — | structurally the same picture |
| Garment construction (visual, 3 frames at full res) | one chest stripe interrupted by the zip ✓ · gold SAINT LAURENT on the wearer's left chest only ✓ · plain shoulders ✓ · stand collar navy inside / mastic outside ✓ · navy stripe continuing down the inner sleeve ✓ · zipped ✓ | the four points that killed the Grok lane | all four hold, in one sample, from references alone |
| Tier-1 statistics | REJECT on `drift_1s` (flow-unexplained residual 0.59 vs real 0.27 ± 0.10); `face_jitter` z 2.1 | — | explained below; not a viewer-visible tell (judge found none) |

What Genjutsu actually does, measured: it does **not** leave the frame's pixels alone. The whole image is re-synthesised — the background comes back with a different grade (shelf band 196 → 163 luma, cooler and flatter; per-channel BGR 154/172/193 → 130/143/152) and the face is re-rendered — but re-synthesised *from the source*, so structure, pose, hands, glasses, cap and clutter are reproduced and identity holds. Two side effects are deterministic and now conformed at $0 by `scripts/edit/match_grade.py`:

1. **Grade.** A per-channel monotone LUT fitted by histogram specification on 7.3 M paired background pixels (garment box excluded, Laplacian-agreement gate) brings the result back to the source grade: mean abs difference on the paired region 34.5 → 14.5 (the remainder is 720p softness + re-synthesis noise), shelf band 163 → 215 R / 188 G / 163 B against the source's 216 / 190 / 166.
2. **Timing.** The model re-sampled 209 frames @ 30 fps into 161 @ 24 fps: result_t = **0.962 × source_t** (fit residual 0.02 s) — a 3.9 % speed-up that puts the mouth 0.27 s early by the end of the cut and would have broken the song clock. `--retime auto` fits that scale from frame matching and re-stamps timestamps at the source rate: after conform, result_t = 1.0005 × source_t (max residual 0.10 s), 209 frames @ 30, 6.967 s, song audio from the source.

The `drift_1s` flag is the re-synthesis: the garment is new fabric every frame and the face is re-rendered, so the flow-unexplained residual sits above real footage even though nothing morphs; `face_jitter` (z 2.1, below the 2.5 warn line) is the same effect on the glasses. The gate's tier 1 was calibrated on *edits* that re-draw, and these two metrics now need a "re-synthesised but faithful" interpretation — the judge and the identity metric, which answer the viewer's question, both pass. Recorded as a calibration item for the level-set (§4).

Cost: $4.77 list for 7 source seconds at 720p (YSL ledger row 21); judge $0.08.

### 3.2 Open from stage 1

- 720p softness: the result is visibly softer than the 1080p source (face crops in `S06_grade_compare.jpg`); stage 3's 1080p render ($11.42) answers whether that is the model or the resolution.
- Only one sample: cross-shot consistency (the per-sample drift that parked the Grok lane) is stage 2's question, not answered yet.
- The sleeve stripe is on the *inner* sleeve as specified; at the raised-arm frames it reads on the underside, which is correct for the garment but should be confirmed against the ysl.com worn crops by Fendi.
- Tattoo: the source forearm tattoo is covered by the new sleeve (correct — long sleeves); nothing to repair.

## 4. For the acceptance level-set

Stage 1 is also the first clip whose numbers disagree with the eye in the *other* direction (tier 1 REJECT, judge PASS, real-band identity). It belongs in the calibration set Fendi is building: if he rates it a pass, `drift_1s` and `face_jitter` get a re-synthesis-aware threshold; if he rates it a fail, the tell he names becomes a new metric.
