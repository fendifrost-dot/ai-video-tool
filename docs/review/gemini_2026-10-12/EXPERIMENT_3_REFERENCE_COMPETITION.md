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

_(none yet)_
