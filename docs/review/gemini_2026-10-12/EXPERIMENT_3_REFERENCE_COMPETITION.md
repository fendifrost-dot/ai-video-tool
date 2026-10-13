# Experiment 3 — reference competition (protocol, written before any paid run)

Status: **PROTOCOL** (no paid run yet). Results are appended below as they happen, never edited above this line.

## Hypothesis (from the independent review of the second pass)

Identity drift (narrower face, younger, added jewellery) recurs when **more than one reference carries a face**. In the
second pass every generated reference (R1, C2) carried a Gemini-drawn face alongside the approved portrait, and the
prompt added a verbal face description and an invented age ("early thirties") that competed with the portrait.

**H1:** with the ORIGINAL portrait as the *only* face-bearing reference (garment and horse references cropped below
the chin) and no verbal face description, identity drift is smaller at the same scene/framing.

## Controls — one variable at a time

| Fixed in both arms | Value |
|---|---|
| Scene | stage C: black horse standing square, gravel stable yard, brick buildings, soft daylight |
| Framing | three-quarter front, camera at rider's knee height, 5 m, 50 mm, hooves to just above head |
| Lighting | key light **camera-left**, soft overcast daylight (camera-relative convention, see review) |
| Settings | `gemini-nano-banana-2.1`, 2K, aspect 4:5, n=1, `maxOutputTokens` 8,192, thinking Medium |
| Prompt | identical text, except the `<IMAGE_n>` roles differ only in whether the reference is full or cropped |
| Identity authority | `3fce9cb5-012f-4158-aecb-6615343eb2f3` (ORIGINAL), always `<IMAGE_0>`, never replaced |

| Varies | Arm A (current arrangement) | Arm B (sole-face arrangement) |
|---|---|---|
| `<IMAGE_1>` garment | R1 full frame `3eee45de-…` (face visible) | **R1 faceless crop** (derivative, box x 0.25 y 0.21 w 0.52 h 0.77) |
| `<IMAGE_2>` horse/tack | C2 full frame `a1b2ced9-…` (face visible) | **C2 faceless crop** (derivative, box x 0.12 y 0.20 w 0.83 h 0.78) |

Derivatives are made with the `asset-derivative` edge function from the caller's own assets, labelled
`outfit_faceless` and `horse_tack_faceless`, `approval_status: pending`, `metadata.lane: derivative`. They are new
rows; R1, C2 and the ORIGINAL are not modified. No production selection, wardrobe lock or treatment is touched.

## Prompt (both arms; no age, no verbal face description, no jewellery description)

> A real photograph. The woman in <IMAGE_0> sits on a black horse that is standing still. Keep her face, head shape,
> skin tone, age, proportions, hair, makeup and jewellery exactly as in <IMAGE_0>; do not add, remove or change any
> of them. Her hair is in the same sleek high ponytail as in <IMAGE_0>. She wears exactly the riding outfit shown in
> <IMAGE_1>: tailored single-breasted black wool riding blazer, crisp white shirt with collar, close-fitting black
> breeches, thin plain black leather gloves and tall polished black leather riding boots; no emblem, badge or
> monogram anywhere. The horse and its tack follow <IMAGE_2>: a real, well-proportioned black horse with a glossy
> coat, a plain black leather bridle with a simple snaffle bit, a plain black leather English saddle with a black
> saddle pad. Seen from a three-quarter front angle so both her face and the horse's head are clearly visible. She
> sits upright and balanced, the near-side boot in the stirrup with the heel down, both gloved hands low in front of
> the saddle holding a single pair of plain black reins that run unbroken to the bit, and looks toward the camera
> with a calm, composed expression. The horse's ears are forward, all four legs and hooves visible, standing square on
> a gravel stable yard with brick buildings behind. Soft overcast daylight; the main light comes from the camera's
> left, so the left side of her face (camera-left) is slightly brighter than the right. Camera at the rider's knee
> height, 5 metres away, 50mm lens, framed from the horse's hooves to just above the rider's head, true-to-life
> colour. Real skin texture, real horse coat. Physically correct contact between rider, saddle, stirrup, reins and
> horse; correct human and horse anatomy with natural proportions, the rider in correct scale to the horse; two hands
> with five fingers each. Plain unbranded tack and clothing. One rider, one horse. No text, lettering, logo or
> watermark.

Reference labels (both arms): `<IMAGE_0>` cast "The woman, approved original portrait (the only source of her face)";
`<IMAGE_1>` garment "Riding outfit guide only"; `<IMAGE_2>` prop "Black horse and tack guide only".

## Stopping rule and budget

- Order: A1, B1, then A2, B2 (a second pair, so a verdict never rests on one image per arm).
- **Maximum 4 paid runs**, plus **1** extra only for a technical failure (no image, refused, lost). Never a re-run for
  "didn't like it".
- Conditional estimate per run $0.270336 (holds only if billed output ≤ 8,192 tokens; unverified). 4 runs ≤ $1.08;
  5 runs ≤ $1.35. Remaining authorization before this experiment: **$1.87** (second brief $3.00 minus $1.13 committed
  upper bound). After the experiment: ≥ $0.52.
- Stop early if A1 and B1 both fail technically twice, or if the independent reviewer rates B1 and B2 both worse than
  A1 and A2 on identity (H1 refuted; no further runs).
- No animation, no Phase D forest runs in this experiment.

## Evaluation

Every candidate (all 4–5 images) is reviewed by an **independent reviewer agent** that has not seen the prompts,
against the ORIGINAL only, with the same rubric as `REVIEWS.md` (identity: face shape, age, complexion, jewellery;
treatment: emblem/monogram, gloves; horse: anatomy, tack, rider scale; lighting: camera-left key). Verdict per image
PASS / PARTIAL / FAIL with the reason. Face crops at full resolution are produced for the reviewer as before.

Verdict for H1: supported if both B images beat their paired A images on identity without losing on treatment;
refuted if the reverse; **inconclusive** otherwise (and that is a valid, reportable outcome).

## Results

Status: **RUN COMPLETE** (4 paid runs, 0 technical failures, no extra run used). Order as planned: A1, B1, A2, B2.
Raw record: [`data/experiment_3_jobs.json`](data/experiment_3_jobs.json). Images: [`images/experiment_3/`](images/experiment_3/)
([contact sheet](images/experiment_3/contact_sheet_experiment_3.jpg), [face strip ORIGINAL·A1·A2·B1·B2](images/experiment_3/faces_ORIGINAL_A1_A2_B1_B2.jpg)).

| Run | Arm | Job | Asset | `<IMAGE_1>` | `<IMAGE_2>` | finish | thoughts tokens | answer bytes |
|---|---|---|---|---|---|---|---|---|
| A1 | A | `953fcfbe` | `afa5f5d6` | R1 full `3eee45de` | C2 full `a1b2ced9` | STOP | 1,054 | 12,647,573 |
| B1 | B | `f0692310` | `b7f704ea` | outfit_faceless `51f1ca23` | horse_tack_faceless `635123bb` | STOP | 47 | 10,769,451 |
| A2 | A | `dc4e16be` | `9bce6056` | R1 full | C2 full | STOP | 0 | 11,102,109 |
| B2 | B | `7f06d241` | `41f3298d` | outfit_faceless | horse_tack_faceless | STOP | 319 | 10,731,752 |

Identical for all four: `<IMAGE_0>` ORIGINAL `3fce9cb5` (cast), prompt `exp3-v1` (text above, 1,930 chars, 488 text
tokens), 3 references = 3,360 image tokens, 1,262 counted input tokens before the call, 2K 4:5, `maxCostUsd 0.28`.
Both derivatives were made with `asset-derivative` from the caller's own assets (boxes in the table above); R1, C2
and the ORIGINAL are unchanged and no production selection, wardrobe lock, treatment, timeline, export or footage was
touched. All four results are `approval_status: pending`, scene titles start with "TEST ONLY".

**Spend:** 4 × $0.270336 conditional estimate = **$1.081344**; remaining authorization after the experiment
**$0.788656** (of $1.87). Verified charges: unknown (no invoice access); every row says `billed: "unknown"`.

**Durability, live (OBSERVED):** B1, A2 and B2 ran on the `5a04c33` deploy: their job rows carry `submittedAt`
(intent written before the call) and `stages` all `succeeded`. A1 ran on `42eb608`: `finalized_at` set but the
stored `stages.finalize` reads `not_started` (the wart fixed in #241).

**Reviewer's own first look (OBSERVED, not the verdict):** faces are small in frame in all four (knee-height camera,
5 m); B2's face reads closest to the portrait's width; A1, A2 and B1 read narrower.

### Blind independent review

The reviewer saw the ORIGINAL and the four candidates under shuffled neutral names (`candidate_1..4`) with
full-resolution face / torso / horse crops, and did not see the prompts, arms or this file. Mapping (kept from the
reviewer until after the report): candidate_1 = **A2**, candidate_2 = **B1**, candidate_3 = **A1**, candidate_4 = **B2**.

| Run | Identity | Treatment | Horse & tack | Lighting | Anatomy |
|---|---|---|---|---|---|
| A1 (cand. 3) | **PARTIAL (close)**: oval face, nose, lips, brow arch close; complexion slightly lighter/cooler; serious expression; jaw a touch narrower; no jewellery | PARTIAL: breeches charcoal not black; gloves plain leather but a small stitched mark on the back (flag) | PASS; strap hanging under saddle | camera-left, consistent with yard | right hand hidden; OK |
| B1 (cand. 2) | **PARTIAL**: face longer and reads **older**; heavier eye makeup; fuller lips; wider cheekbones; **stud earring added** | PARTIAL: breeches charcoal; gloves perforated sport style | PASS; stray strap | camera-left; mild compositing suspicion (face crisper than yard) | right hand a dark blob |
| A2 (cand. 1) | **PARTIAL**: fuller/rounder cheeks and jaw, reads a few years **younger**, pout instead of slight smile; possible faint dot at left ear, unconfirmed | PARTIAL: breeches charcoal; gloves ribbed knit cuff | PASS; stray strap | camera-left; face marginally flatter, no hard edge | right hand hidden |
| B2 (cand. 4) | **PARTIAL (closest)**: face shape, cheekbones, brows, nose and slight smile match best; complexion matches; **stud earring added**; chin marginally sharper | PARTIAL: breeches charcoal; gloves textured/mesh back | PASS; long stray strap | camera-left, consistent | left thumb slightly odd |

Reviewer's identity ranking, closest to furthest: **B2 > A1 > A2 > B1**. No two candidates indistinguishable.
Common to all four: charcoal rather than black breeches; no plain thin leather glove; a stray strap at the saddle
front; **no badge, monogram, logo or lettering on any blazer, saddle, pad or bridle** (the R1 emblem did not recur).
Camera-left key light held in all four (the camera-relative convention worked).

### Verdict on H1 (reference competition)

**INCONCLUSIVE** (per the rule above). Pairwise: B2 beat A2, but A1 beat B1. Within-arm spread (B2 best, B1 worst)
is larger than any between-arm difference, so at n = 2 per arm the reference arrangement is **not shown** to be the
dominant variable. Two observations cut against the hypothesis as stated: both arm-B images **added a stud earring**
that the portrait does not have, while neither arm-A image clearly did; and the "older" drift appeared in B1 and the
"younger" drift in A2, so the age drift is not tied to face-bearing guide references. One observation favours it:
the single best structural match (B2) came from the sole-face arrangement.

What the prompt change did deliver, in all four: no emblem/monogram (the second-pass R1 treatment failure did not
recur), key light on the stated side, horse anatomy and rider scale PASS. Jewellery drift and age drift persisted
despite "keep her … age … and jewellery exactly as in <IMAGE_0>", so the verbal instruction alone does not pin them.

**Not a replacement for anything.** The ORIGINAL stays the only identity authority; none of the four is selected.

### Recommended next test (RECOMMENDATION, not run; needs new authorization)

Two cheap, single-variable follow-ups, in order: (1) **n = 4 per arm** of the same two arms to see whether the arm
ranking stabilises (8 runs, conditional estimate $2.16); (2) a **jewellery/age negative control**: arm B with the
explicit negative "no earrings, no piercings, no jewellery of any kind" and the ORIGINAL duplicated as `<IMAGE_0>`
and `<IMAGE_3>` (identity weight), to test whether the earring is a reference effect or a prompt effect.
