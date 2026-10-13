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

### Arm C: jewellery negative control (run 13 Oct 2026 under the follow-up authorization)

One variable changed from arm B: prompt `exp3-v2` = `exp3-v1` with jewellery removed from the keep-list and an explicit
clause added: "She wears no jewellery of any kind: no earrings, no ear studs, no piercings, no necklace, no rings;
her ears are bare exactly as in <IMAGE_0>." Same arm-B references, same settings. Two runs, 0 failures.

| Run | Job | Asset | thoughts tokens | answer bytes |
|---|---|---|---|---|
| C1 | `05a0129b` | `5b0b5fe2` | 745 | 10,849,400 |
| C2 | `5d28e3b0` | `e87c9468` | 596 | 10,814,804 |

**Second blind review** (a fresh reviewer; B1, B2, C1, C2 under new shuffled names K–N with 2× head crops; mapping
kept back: K = C1, L = B1, M = B2, N = C2). Face strip: [`faces_ORIGINAL_B1_B2_C1_C2.jpg`](images/experiment_3/faces_ORIGINAL_B1_B2_C1_C2.jpg).

| Run | Ear jewellery (2× crop) | Identity | Treatment / horse / light |
|---|---|---|---|
| B1 (L) | **stud** | PASS (narrow oval close to portrait; slightly younger; neutral) | charcoal breeches; textured gloves; no emblem; horse PASS with stray straps; camera-left |
| B2 (M) | **stud** | PARTIAL (rounder, softer face; faint smile closest to portrait) | same |
| C1 (K) | **bare** | PARTIAL (face wider/fuller, heavier jaw, broader nose) | same |
| C2 (N) | **unclear** (faint dot, too small to call) | PASS (narrow oval; brow, eye shape, chin closest) | same |

Second reviewer's identity ranking: **C2 > B1 > B2 > C1**. Common to all four: charcoal breeches, textured gloves,
a grey/silver sheen on the slicked crown absent from the portrait, a dangling strap under the horse's chin, no
emblem or lettering anywhere.

### Verdicts

- **Jewellery (H2: the earring is a prompt effect, not a reference effect): SUPPORTED, weakly.** With the explicit
  clause, C1 is bare and C2 is at worst a faint dot; without it, B1 and B2 both carry a stud. n = 2 per arm; the
  "unclear" on C2 keeps this short of proven. The verbal "keep her jewellery exactly as in <IMAGE_0>" (exp3-v1)
  did not work; the explicit negative list did.
- **Reference competition (H1): still INCONCLUSIVE**, and now with a measured caveat on the method itself: the two
  blind reviewers **disagreed on B1 vs B2** (first: B2 best of four, B1 worst; second: B1 PASS above B2). At this
  framing (knee-height camera, 5 m, face about 2 % of the frame) identity verdicts are not reliable enough to rank
  arms at n = 2. Both reviewers agreed on the stable things: no emblem, camera-left key, horse anatomy, charcoal
  breeches, non-plain gloves.
- **Nothing selected; nothing replaced.** The ORIGINAL stays the only identity authority.

### Recommended next test (RECOMMENDATION, not run; needs new authorization)

Before any further arm comparison, change the test framing: a **medium shot (waist up, face ≥ 15 % of frame)** in
the same yard, so identity can be judged; then repeat A vs B at n = 4 per arm with the `exp3-v2` jewellery clause
in both. Separately, add "true black breeches (not charcoal)" and "plain, smooth, unlined thin leather gloves" to
the treatment text; both drifted in all six images.

_(superseded text below kept for the record)_

Two cheap, single-variable follow-ups, in order: (1) **n = 4 per arm** of the same two arms to see whether the arm
ranking stabilises (8 runs, conditional estimate $2.16); (2) a **jewellery/age negative control**: arm B with the
explicit negative "no earrings, no piercings, no jewellery of any kind" and the ORIGINAL duplicated as `<IMAGE_0>`
and `<IMAGE_3>` (identity weight), to test whether the earring is a reference effect or a prompt effect.

---

## Experiment 4: medium-shot framing, A vs B at n = 4 (protocol written before any paid run, 13 Oct 2026)

Authorization: user, 13 Oct ("full authority to execute any tests and follow up runs"; "there should be more than
enough in Gemini"). Planned spend: 8 runs × $0.270336 conditional estimate = **$2.162688**. Stop rule: max 8 paid
runs plus 1 only for a technical failure; stop early if two consecutive technical failures.

**Why:** experiment 3's blind reviewers disagreed on identity at knee-height framing (face ≈ 2 % of frame). This
test changes the framing so identity can be judged, and keeps everything that demonstrably helped.

| Fixed in both arms | Value |
|---|---|
| Framing | medium shot: saddle to just above her head, face large; horse's neck and head in the lower frame |
| Camera | chest height, 2.5 m, 85 mm; three-quarter front; 2K, 4:5, n = 1 |
| Prompt | `exp4-v1` (below): `exp3-v2` jewellery clause; explicit "true black breeches (not grey, not charcoal)"; "plain smooth thin black leather gloves"; "no loose or dangling straps"; no invented age, no verbal face description; camera-left key |
| Identity authority | ORIGINAL `3fce9cb5…` as `<IMAGE_0>`, unchanged |
| Varies | **Arm A**: `<IMAGE_1>` R1 full `3eee45de`, `<IMAGE_2>` C2 full `a1b2ced9` · **Arm B**: `<IMAGE_1>` outfit_faceless `51f1ca23`, `<IMAGE_2>` horse_tack_faceless `635123bb` |
| Order | A1 B1 A2 B2 A3 B3 A4 B4 |

Prompt `exp4-v1`:

> A real photograph, a medium shot. The woman in <IMAGE_0> sits on a black horse that is standing still, seen from a
> three-quarter front angle. Framing: from the top of the saddle to just above her head, so her face is large and
> clearly visible, with the horse's neck and head in the lower part of the frame. Keep her face, head shape, skin
> tone, age, proportions, hair and makeup exactly as in <IMAGE_0>; do not add, remove or change any of them. She
> wears no jewellery of any kind: no earrings, no ear studs, no piercings, no necklace, no rings; her ears are bare
> exactly as in <IMAGE_0>. Her hair is in the same sleek jet-black high ponytail as in <IMAGE_0>. She wears exactly
> the riding outfit shown in <IMAGE_1>: tailored single-breasted black wool riding blazer, crisp white shirt with
> collar, true black breeches (not grey, not charcoal), plain smooth thin black leather gloves with no texture,
> ribbing or padding, and tall polished black leather riding boots; no emblem, badge or monogram anywhere. The
> horse and its tack follow <IMAGE_2>: a real black horse with a glossy coat, a plain black leather bridle with a
> simple snaffle bit, a plain black leather English saddle; a single pair of plain black reins running unbroken
> from the bit to her gloved hands, with no loose or dangling straps anywhere. She sits upright and looks toward
> the camera with a calm, composed expression. Gravel stable yard with brick buildings behind, softly out of
> focus. Soft overcast daylight; the main light comes from the camera's left, so the left side of her face
> (camera-left) is slightly brighter than the right. Camera at her chest height, 2.5 metres away, 85mm lens,
> true-to-life colour. Real skin texture, real horse coat. Correct human and horse anatomy; two hands with five
> fingers each. Plain unbranded tack and clothing. One rider, one horse. No text, lettering, logo or watermark.

**Evaluation:** two independent blind reviewers, each seeing the ORIGINAL and all eight under shuffled neutral
names with face crops; identity verdict and ranking; ear jewellery literal reading; treatment (breeches colour,
gloves); inter-rater agreement reported. H1 supported if arm B's images rank above arm A's by both reviewers
(e.g. mean rank), refuted if the reverse by both, otherwise inconclusive. Nothing is selected for production from
this test.

### Results

**RUN COMPLETE**: 8 paid runs, 0 technical failures, no extra run. Raw record:
[`data/experiment_4_jobs.json`](data/experiment_4_jobs.json). Images: [`images/experiment_4/`](images/experiment_4/)
([contact sheet](images/experiment_4/contact_sheet_experiment_4.jpg), [face strip](images/experiment_4/faces_ORIGINAL_A1-4_B1-4.jpg)).
Framing came out as specified (face ≈ 15–20 % of frame). Spend: 8 × $0.270336 = **$2.162688** (conditional estimate;
verified charges unknown). All eight `pending`, "TEST ONLY"; nothing selected.

| Run | Job | Asset | thoughts | answer bytes | | Run | Job | Asset | thoughts | answer bytes |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | `9976224d` | `9db78236` | 881 | 11.3 MB | | B1 | `cf0d79a5` | `7ed58453` | 642 | 10.0 MB |
| A2 | `78b9f919` | `e9b5a1f9` | 377 | 9.8 MB | | B2 | `686b7ab8` | `b2dd09f7` | 1,250 | 9.5 MB |
| A3 | `4282d977` | `26bf35d6` | 435 | 10.1 MB | | B3 | `83da6ad4` | `db0d2284` | 540 | 9.9 MB |
| A4 | `ba35cd9b` | `ad3a157b` | 509 | 9.7 MB | | B4 | `257ef649` | `5a00fbbe` | 602 | 9.8 MB |

**Two blind reviewers**, each given the ORIGINAL and the eight under shuffled names P–W with face and torso crops
(mapping withheld: P=A2, Q=A3, R=A4, S=A1, T=B1, U=B3, V=B4, W=B2). Reviewer 1 used free verdicts and a ranking;
reviewer 2 scored five sub-scales out of 25 in reverse order.

| Run | Reviewer 1 identity | R1 rank | Reviewer 2 identity (/25) | R2 rank | Ears (R1 / R2) | Breeches (R1 / R2) |
|---|---|---|---|---|---|---|
| A1 | PARTIAL/FAIL: wider, rounder, younger | 8 | PARTIAL 20 | 5 | bare / unclear+bare | charcoal / true black |
| A2 | PARTIAL: narrower, younger, flatter eyes | 6 | PARTIAL 20 | 7 | unclear+bare / possible stud+bare | charcoal / true black |
| A3 | PARTIAL: broad forehead, close-set eyes, harder | 7 | **PASS 21**, closest jaw/cheekbones | 1 | bare / possible stud+bare | charcoal / charcoal |
| A4 | **PASS**: closest geometry, lips, brows, expression | 1 | PARTIAL 20 | 6 | unclear+bare / possible stud+unclear | charcoal / true black |
| B1 | **PASS**: jaw, lips, smile close | 3 | **PASS 21** | 2 | bare / unclear+bare | charcoal / charcoal |
| B2 | PARTIAL: rounder, wider; **button emblems → FAIL** | 4 | PARTIAL 20; buttons "faint, unclear" | 3 | bare / bare | near-black / true black |
| B3 | PARTIAL: rounder, younger | 5 | PARTIAL 20 | 4 | bare / bare+possible stud | charcoal / true black |
| B4 | **PASS**: eyes, nose closest | 2 | PARTIAL 19: longer, cooler | 8 | unclear / possible stud+bare | charcoal / true black |

Agreement and arm means:

| | Reviewer 1 | Reviewer 2 |
|---|---|---|
| Mean rank, arm A | 5.50 | 4.75 |
| Mean rank, arm B | 3.50 | 4.25 |
| PASS verdicts | A4, B1, B4 | A3, B1 |
| Spearman ρ between reviewers' rankings | **−0.31** (no agreement) | |
| Average rank across both | B1 2.5 · A4 3.5 · B2 3.5 · A3 4.0 · B3 4.5 · B4 5.0 · A1 6.5 · A2 6.5 | |

Common to all eight by both reviewers: textured/quilted gloves (the "plain smooth thin leather" line failed 8/8);
a loose or dangling strap or stirrup leather (the "no loose or dangling straps" line failed 8/8); a grey/silver sheen
at the ponytail base (the "jet-black" line failed in most); camera-left key held 8/8; no readable logo or lettering
(B2's embossed buttons: FAIL for reviewer 1, "unclear" for reviewer 2). Breeches colour: the reviewers disagree
(charcoal 7/8 vs true black 6/8), so that line is unresolved. Ear jewellery with the explicit clause in both arms:
reviewer 1 clearly bare 5/8, unclear 3/8; reviewer 2 free 3/8, "possible stud" 5/8 flagged as unconfirmable dots.
No hoops; no confirmed stud.

### Verdict

- **H1 (sole-face references beat the current arrangement): NOT SUPPORTED at a level that justifies a change.**
  Both reviewers' mean ranks lean toward arm B (3.5 vs 5.5; 4.25 vs 4.75), but the two rankings have ρ = −0.31:
  reviewer 1's best image (A4) is reviewer 2's sixth, reviewer 2's best (A3) is reviewer 1's seventh, and B4 is 2nd
  vs 8th. The between-arm difference is smaller than the between-reviewer disagreement, so the lean is not a
  finding. Combined with experiment 3, the reference arrangement is **not the dominant variable** at this scale.
- **What the medium framing did establish (both reviewers independently):** all eight read as the same woman
  (no identity FAIL from either reviewer; 2–3 PASS each), where the knee-height framing produced none better than
  PARTIAL. Framing and face size move identity more than reference arrangement does.
- **Prompt lines that worked:** no emblem/monogram (7/8 clean; B2's buttons disputed), camera-left key (8/8),
  explicit no-jewellery clause (no confirmed stud in 8; residual ambiguous dots).
- **Prompt lines that did not work** (verbal instruction insufficient): plain smooth gloves (0/8), no loose straps
  (0/8), jet-black ponytail base (grey sheen in most), and possibly true-black breeches (disputed).
- **Nothing selected.** The ORIGINAL stays the only identity authority; no production selection, lock, treatment,
  timeline, export or footage was touched.

### Correction (13 Oct 2026, appended; the text above is kept as written)

The verdict above overstated two things and understated one; this correction supersedes it where they differ.

1. **The prespecified criterion was met.** The protocol said H1 is supported "if arm B's images rank above arm A's
   by both reviewers (e.g. mean rank)". Both did: reviewer 1 B 3.50 vs A 5.50; reviewer 2 B 4.25 vs A 4.75 (lower is
   better). The individual-image disagreement (ρ = −0.31) limits confidence but does not erase the agreement on arm
   averages. The defensible statement is **preliminary support for the sole-face arrangement, with substantial
   uncertainty**: not proof of superiority, and not evidence that references do not matter. "Not supported at a
   level that justifies a change" and "the reference arrangement is not the dominant variable" were stronger than
   the evidence; the forest round therefore uses the sole-face arrangement (see below) rather than arm A.
2. **"Framing moved identity more than references did" was a confound, not a finding.** Between experiment 3 and
   experiment 4 the framing, camera height (knee → chest), distance (5 m → 2.5 m), lens (50 → 85 mm) and the prompt
   (jewellery clause, breeches, gloves, straps) all changed together, so the identity improvement cannot be
   attributed to any one of them. What experiment 4 did establish is improved **visibility for evaluation** (faces
   large enough to judge); whether identity *generation* improved, and why, is untested.
3. **"No identity FAIL" was wrong as stated.** Reviewer 1 recorded A1 as "PARTIAL/FAIL: face wider and rounder,
   noticeably younger"; the table above records it. The accurate statement: no image was an outright FAIL for both
   reviewers; one (A1) was borderline for reviewer 1.

### Recommendation (original; see the correction above for the arrangement decision)

Stop testing reference arrangement; keep the current one (arm A) in production and spend further effort on the
things that moved the result: medium or closer framing for identity-critical stills; the `exp4-v1` prompt
conventions; and, for the lines that verbal prompts could not pin (gloves, straps, hair sheen), reference images
that show exactly those details (a plain-glove crop, a clean-tack crop) rather than more words. Any future
identity ranking should use ≥ 2 blind reviewers and report their agreement, since a single reviewer's ranking at
this image count is not reliable.

---

## Forest round: ground-level burning-forest still (protocol written before any paid run, 13 Oct 2026)

Authorization: user, 13 Oct (existing spending authorization; "finish the remaining validation gap … advance toward
the actual forest scene"). Bounded: 2 candidates, then at most 2 correction runs for a specific defect with a
plausible remedy; ≤ 4 runs ≈ $1.08 conditional estimate. No animation. Nothing selected.

**Reference arrangement (DECISION, from evidence):** the sole-face arrangement. Experiment 4 met its prespecified
criterion (both reviewers' mean rank favoured arm B) with substantial uncertainty (ρ = −0.31 on individual images);
it is the arrangement with the only image both blind reviewers passed on identity (experiment 4 B1). So:
`<IMAGE_0>` = ORIGINAL `3fce9cb5…` (cast; the only face-bearing reference; the identity authority, unchanged);
`<IMAGE_1>` = experiment 4 B1 cropped **below the chin** (derivative asset `6ab0db92…`, label `pose_scene_faceless`,
1856×1843) as the pose / seat / hands / wardrobe / horse-and-tack guide. B1's face is deliberately excluded so B1
cannot become a second identity anchor.

**Framing:** medium shot as in experiment 4 (the framing under which identity was judgeable), ground level, horse's
neck and head in frame, flames and burning trunks around: the treatment's forest shot, not a crop that hides the
horse or the fire.

**Lighting (camera-relative):** the only light is fire. Main fire behind her to camera-right: camera-right side of
face, shoulder and horse's flank lit warm orange; camera-left in deep shadow with a faint orange rim; no daylight,
no blue sky.

**Negative list:** no jewellery (bare ears); no emblem, badge, monogram, logo; no lettering; no path or clearing
shaped like letters or a logo; no loose straps.

Prompt `forest-v1`:

> A real photograph, a medium shot at night at ground level. The woman in <IMAGE_0> sits upright on a black horse
> that is standing still among tall burning pine trees, seen from a three-quarter front angle. Framing: from the top
> of the saddle to just above her head, so her face is large and clearly visible, with the horse's neck and head in
> the lower part of the frame and flames and burning trunks behind and to the sides. Keep her face, head shape,
> skin tone, age, proportions, hair and makeup exactly as in <IMAGE_0>; do not add, remove or change any of them.
> She wears no jewellery of any kind: no earrings, no ear studs, no piercings, no necklace, no rings; her ears are
> bare exactly as in <IMAGE_0>. Her hair is in the same sleek jet-black high ponytail as in <IMAGE_0>. Her seat,
> posture, hands on the reins, riding outfit and the horse's tack follow <IMAGE_1>: tailored single-breasted black
> wool riding blazer, crisp white shirt with collar, black breeches, plain thin black leather gloves, a plain black
> leather bridle with a simple snaffle bit, a plain black leather English saddle, a single pair of plain black reins
> running unbroken from the bit to her gloved hands, with no loose or dangling straps anywhere; no emblem, badge or
> monogram. Lighting: the only light is the fire. The main fire is behind her to the camera's right, so the right
> side of her face, her right shoulder and the horse's right flank (camera-right) are lit warm orange and the
> camera-left side falls into deep shadow with only a faint orange rim; firelight flickers on the horse's glossy
> coat; embers and thin smoke drift through the air; the sky is black. No daylight, no blue sky, no studio light.
> The forest floor is bare earth and ash with scattered embers; no path, no clearing, no shape resembling letters
> or a logo. Camera at her chest height, 2.5 metres away, 85mm lens, true-to-life colour. Real skin texture, real
> horse coat, real fire. Correct human and horse anatomy; two hands with five fingers each. One rider, one horse;
> she looks toward the camera with a calm, composed expression; the horse is alert with its ears forward. No text,
> lettering, logo or watermark.

Settings: `gemini-nano-banana-2.1`, 2K, 4:5, n = 1, `maxCostUsd 0.28`. Evaluation: my own full-resolution inspection
against the requirements, then two blind reviewers on all candidates (identity vs ORIGINAL; jewellery; wardrobe;
horse/tack/hands/posture; firelight direction and physical coherence; lettering/logo shapes; composition), then a
recommendation on readiness for a 1.5–2 s motion shot.

### Results

_(none yet)_
