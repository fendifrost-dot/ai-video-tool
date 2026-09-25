# Pose-locked hero contract (2026-09-25)

Status: **checkpoint A** — the deterministic hero gate is calibrated on existing assets ($0), the hero scheduler measures the carrier's reach, the provider-neutral interface exists, the first paid experiment is designed and costed; no paid call has been made. Directive: ChatGPT via Fendi, "NEXT PHASE: POSE-LOCKED HERO CONTRACT" (after rev 31 / checkpoint B).

## 1. Why this exists

Architecture C (rev 31) carries ONE garment realisation reliably only a few frames from a hero; it cannot fix product truth because the E1 heroes it carries are the generator's own realisations. So the bottleneck moved to the hero: AVT needs **canonical garment truth in the exact pose of the real performance** at scheduled anchor frames, and a gate that refuses any hero that got the garment right by moving Fendi.

```
real performance frame → pose-locked hero generation → deterministic hero QA → passing canonical hero
   → Architecture C ±local window → next pose-locked hero → Architecture C → shot
```
The generator creates truth. Architecture C carries truth.

## 2. The two laws (what the gate enforces)

**Pose-lock law.** A hero must preserve the source frame's identity, head position, face geometry, torso, shoulders, arms, hands, legs, body silhouette, camera framing and perspective. It may change the garment (construction, material, details, garment-local shading). It may not solve placement by re-posing the performer. A beautiful image in the wrong pose is a FAILURE. Pose lock is fail-closed.

**Garment-truth law.** A passing hero must match the canonical Look (approved Look-on-artist realisation > product imagery > accepted E1 motion > treatment > prompt) on measurable construction features: collar, closure/zip state, chest band, pockets, seams, cuffs, hem, hardware, silhouette, material, stripe placement, wordmark placement.

## 3. The gate — `scripts/qa/hero_gate.py`

One command scores any candidate against its source frame and the anchor and returns six independent checks and one verdict (`gate.json`, `gate_sheet.jpg`):

| # | check | measurement | source of truth |
|---|---|---|---|
| 1 | POSE FIDELITY | MediaPipe pose landmarks (33) on source and candidate; displacement of every landmark the source sees in **torso units** (shoulder–hip length): strict set (head, shoulders, elbows, wrists, index fingers) max ≤ 0.20 and **mean ≤ 0.06**, head max ≤ 0.06, upper-arm/forearm **angle change ≤ 20°**, hips ≤ 0.35, legs ≤ 0.30 (where seen); no landmarks on the candidate = pose lost | source frame |
| 2 | IDENTITY FIDELITY | source face box (from its landmarks): SSIM ≥ 0.75 and Lab residual ≤ 22 | source frame |
| 3 | SILHOUETTE | RVM person alphas; IoU ≥ 0.75 over the **anatomy region** (head box cut at the chin + hand-sized discs; the torso and legs belong to the garment and may change outline), p90 boundary displacement ≤ 0.10 torso; iou_total reported | source frame |
| 4 | GARMENT CONSTRUCTION | `construction_score.py`'s anchor model (Lab classes, stripe landmark, garment-relative zones, foreign-class intrusion) on the region the candidate changed: score ≥ 0.65, every zone ≥ 0.35 | anchor |
| 5 | MATERIAL / PRODUCT TRUTH | body-class ΔE ≤ 10 and stripe-class ΔE ≤ 16 to the anchor's classes, knit texture energy ratio 0.4–2.5, stripe height / garment width ratio 0.5–1.8 | anchor |
| 6 | ANATOMY INTEGRITY | hands stay hands: at the candidate's own hand landmarks the pixels keep the source hand's chroma (Δab ≤ 10, ΔL ≤ 60; ratio to the source's own fraction ≥ 0.4) — a sleeve, cuff or body panel over a hand fails; strict landmarks still present; one connected silhouette (largest component ≥ 95 %) | source frame |

**POSE LOCK = check 1 AND check 2** (the law names face geometry: a frontal re-render of a turned, singing face passes the coarse landmarks — E2 f114 — and is caught by the face test). **Verdict = FAIL if pose lock fails; else PASS only if all six pass.** Thresholds are data (`--thresholds`), defaults as above; `--expect` turns a calibration set into a test (exit 1 on disagreement).

**Calibration (2026-09-25, `docs/research/results/2026-09-20-ysl-real-video-1/hero_gate_calibration/`, 14 candidates, all expectations met):**

| candidate | expected | measured |
|---|---|---|
| A. S08 source frame f86 vs itself | pose PASS, garment FAIL | pose PASS (0.00), identity 1.00, construction: no stripe landmark → FAIL |
| B. accepted E1 frames S08 f86 / f22 / f146, S11 f40 | pose PASS | strict max 0.04–0.16, mean 0.02–0.04, arm ≤ 18°, SSIM 0.80–0.89 → pose PASS ×4 (f22 fails construction only: motion-blurred frame, zone 0.35 floor) |
| C. old E2 stills S06 f6 / f18 / f30 / f78 / f114 | pose FAIL | mean 0.05–0.47, arm 4–122°, head 0.03–0.31, SSIM 0.31–0.48 → pose lock FAIL ×5 (f114: landmarks within tolerance, face re-rendered → identity fails → lock fails) |
| D. wrong frame (S08 f0 vs f86), wrong shot (S11 anchor vs S08 f86) | pose FAIL | mean 0.37 / 0.41, arm 133° / 94° → FAIL |
| E. approved anchor vs its master | PASS | pose 0.04 / 2°, SSIM 0.84, construction 1.00, material ΔE 0 → PASS |
| F. Aleph 2.0 S08 f86 vs master f86 | (observed) | pose PASS (0.06 / 9°), SSIM 0.90, construction 0.80 → **PASS** |

The E2 stills the old `hero_stills_qa.py` accepted 14/14 (no pose test) are now rejected on pose lock — the calibration criterion "if the gate cannot distinguish B from C it is not ready" is met with margin (E1 strict mean ≤ 0.04 vs E2 ≥ 0.05 with head/arm/face failures on every still).

**Known blind spots (recorded, not hidden).** (a) Invented structure of the garment's own colour — Aleph's extra seams and pocket outlines at other frames, malformed wordmark glyphs — is not seen by the colour-class scorer; a long-edge structure probe on the eroded body class returned 0 for every candidate (seams are shading, not body-class pixels). Structural truth stays with the brand layer (wordmark is re-applied deterministically) and with Astra at the end, per the directive. (b) Identity is a pixel/SSIM test: it catches a re-posed or replaced face, not a subtle re-render (Aleph f86 scores 0.90, above two E1 frames). (c) Hands at the frame edge or with the index finger unseen are skipped, not judged.

## 4. The scheduler — `scripts/edit/hero_schedule.py`

Heroes are placed from the carrier's **measured** reach on the shot, not a cadence. Every 6th frame is tried as a hero; the propagator's own chain (drift-gated confidence) is run outward; the confident-pixel masks are kept so heroes combine the way the carrier does (two-hero blend = union coverage); greedy set cover picks the fewest heroes such that every frame's union coverage ≥ the target; frames no trial hero reaches are reported. Each scheduled hero is exported as the master frame PNG + region mask — the source the generator must edit and the gate must score against.

S08 (161 frames, 6.7 s; region = the accepted E1's garment mask):

| standard | heroes | mean single-hero reach | frames never reachable | union coverage mean |
|---|---|---|---|---|
| coverage ≥ 0.8, conf 0.75, motion gate on | **22** (every ~7 frames) | −2.7 / +3.1 | 24 (fast hands: f21–34, f50–65) | 0.90 |
| coverage ≥ 0.7, conf 0.75, motion gate off | **15** | −5.1 / +5.8 | 2 | 0.88 |
| master only (RVM torso region), ≥ 0.8 | 23 | −3.0 / +3.7 | 19 | — |

So "±8 frames" (rev 31) is the mean-coverage reach; at ≥ 0.8 per frame on this motion the carrier needs a hero every 6–8 frames. Cost consequence: a 7 s performance shot needs 15–22 pose-locked heroes (× candidates per hero) — the scaling number for the paid decision.

## 5. Provider-neutral interface — `supabase/functions/_shared/poseLockedHero.ts`

`buildHeroRequest(PoseLockedHeroRequest)` → `{ provider, edgeFunction, mechanism, body, prompt }`. The request is abstract (source frame, Look, canonical realisation, product refs, identity refs, constraints); the registry `HERO_PROVIDERS` maps mechanisms to the existing edge functions with their evidence; `rankHeroProviders()` orders by the strength of the geometry guarantee (mask > try-on > prompt > none), then cost. The pose-lock law is composed FIRST into every prompt (same constraints-first rule as the video lane), the Look's construction facts next, the descriptive body last. Tests: `poseLockedHero.test.ts` (5, deno). Every candidate a lane returns goes through `hero_gate.py`; the contract's rule is stated in `HERO_GATE_RULE`.

| provider id | edge function | mechanism | evidence for geometry | evidence for garment truth | status |
|---|---|---|---|---|---|
| `fal_inpaint_masked` | `jacket-inpaint-proxy` | mask (SAM-3 garment mask, fal flux inpainting, pose controlnet, face guard) | held by construction — pixels outside the mask are the source | unproven against the anchor; the Guarded-Grok chain needed a Grok render for appearance and flux-general timed out (~946 s) | available; **gap: no field for the approved realisation as conditioning** |
| `fal_vton` | `wardrobe-vton-proxy` | try-on (IDM-VTON / CAT-VTON) | pose and identity held (2026-08-17 head-to-head) | garment topology FAILED (seams, band, brand) — renders a flat garment, not the approved realisation | available |
| `xai_image_edit` | `grok-image-garment-proxy` | prompt (whole-image edit, ≤ 5 images, no mask, no pose parameter documented) | E2: arms re-posed and face turned in most of 14 stills — every one now fails the gate | best of any lane with the anchor as `<IMAGE_1>` (one realisation, similarity 0.74, spread 0.11) | available |
| `runway_image_reference` | `proxy-provider-call` → CC | none (gen4_image / gen4_image_turbo / gemini_2.5_flash: ≤ 3 tagged references composed by prompt) | the source frame would be a reference, not a lock | untested | unverified; no CC image function yet |

## 6. First paid experiment (designed, NOT run — needs authorisation under the $50 rule)

Question: **can we create ONE frame that passes both pose lock and canonical garment truth?**

- Source: one S08 anchor frame from the schedule — **f84** (scheduled hero, garment fully visible, arms crossed low, identity clear; the accepted E1 at f86 scores 0.789, the best of the shot, so garment truth is achievable in this pose). Exported by the scheduler as `hero_source_00084.png`.
- Mechanisms, in evidence order, smallest fair set:
  1. `xai_image_edit` with the pose-lock law composed first and the approved realisation as `<IMAGE_1>` (the lane whose garment truth is proven; the gate now removes its known failure mode instead of accepting it): **3 candidates ≈ $0.36** (grok-imagine-image-2.0 with 3 images).
  2. `fal_inpaint_masked` on the same frame, prompt-only appearance (the mask guarantees geometry; the question is garment truth): **2 candidates ≈ $0.10**, only if the CC fal allowlist still carries `fal-ai/flux-lora/inpainting` (it did for the Guarded-Grok lane).
  Seedance is not chosen by default (untested, video-only, $0.45/s); Aleph is a video editor whose f86 frame passes the gate but re-designs details at other frames (rev 28); Omni's failure was a provider timeout, not evidence either way, and it is video-only.
- Gate every candidate with `hero_gate.py` (same anchor, same thresholds as the calibration). PASS → feed the hero into `propagate_keyframe.py --hero-stills 84:<hero.png>` on S08 and measure the ±window (coverage, temporal residual, sharpness, hands) — checkpoint B. No pass in 5 candidates → stop those mechanisms (checkpoint C for the lane), report which law each failed.
- Budget: ≈ $0.50 total; ledger row appended with the result. Astra: not used (≈ $1.90 OpenAI credit reserved).

## 7. What is not in this checkpoint

No paid call; no E1 scaling; no Astra; no S06 matte work (parallel agent). The masked lane's conditioning gap (approved realisation into `jacket-inpaint-proxy`) and a Control Center image function for Runway's reference models are the two engineering items that would widen the provider set; neither is needed for the first paid question.
