# Wardrobe swap on a performance take: the recipe (living record, started 15 Oct 2026)

Any agent or person putting Fendi into a garment on real performance footage starts **here**. The page records what
was run, on what, with which inputs, and what came out. It is updated after every test.

**APPROVED route (DECISION, Fendi, 15 Oct 2026: "Yes that passes"): Higgsfield Genjutsu object-swap, run C below.**
Fendi judges every new result; an agent never passes its own test (the kill criterion in `CLAUDE.md`).

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## The target (DECISION, Fendi, 15 Oct)

"The main swap for the performance shot was the mastic YSL jacket."

- **Garment:** Saint Laurent Track Jacket, Mastic Cotton Navy Stripe, `character_features` `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`.
- **Product photo** (the truth): `wardrobe-refs/65cf99cb…/2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg`.

| Construction point | Product truth |
|---|---|
| Fabric | smooth woven mastic (sand-beige) cotton, boxy, cropped at the waist, self-coloured banded hem |
| Closure | zipped |
| Collar | stand collar, mastic outside, **navy lining inside** |
| Chest | ONE narrow navy stripe, interrupted by the zip |
| Logo | one small single-line gold script SAINT LAURENT, on the stripe, wearer's **left** chest |
| Sleeves | a navy stripe down the **underside** of each sleeve, armpit to cuff, visible from the front along the sleeve's inner edge; tops of shoulders and sleeves plain |

## Test clip

Take shot 19, asset `cc76f6a3-5489-4e6f-98d2-8cf7efcdf03b`:
- 4.00 s, 1080×1920 at **59.94 fps**;
- take 72.673–76.677 s, which overlaps the v1 section's S08, the hardest shot there (crossed arms).

## Results on the Mastic jacket, 15 Oct (same take, same day)

| # | Route | Inputs | Cost | What came out (OBSERVED, agent) |
|---|---|---|---|---|
| A | **v1 config** (`grok-video-edit-proxy`, xAI `/videos/edits`), Look `ce7f6350` "White Ice", anchor S11 v4c f80, prompt v4b, `full_look` | 5 refs: anchor, on-model, product, collar crop, sleeve crop | $0.32, asset `eb676ab8` | knit-looking body, wide band, garbled stacked yellow lettering, **no sleeve stripes**, front open — it copied the anchor |
| B | same route, **corrected Look** `4e02d942` (anchor = product-true keyframe `5ef1bfe8`, sleeve rule rewritten, `v5-product-true`) | same refs with the new anchor first | $0.32, asset `20425b13` | zipped, stand collar, sleeve stripes now present, but the jacket came out **white not mastic**, stripes moved to the outer sleeves, lettering still garbled, shirt cuffs/hem showing |
| C | **Higgsfield Genjutsu object-swap**, 720p, product photo only, jacket only (his own cap) | 1 ref | ~$2.72, Higgsfield request `b21e4da6-0a6e-4170-aeed-aa18ef03b288` | **mastic colour, narrow chest stripe, script logo on the wearer's left, navy stripes along the sleeves, stand collar, cropped hem**; identity and arm crosses held; face smears in the last ~0.5 s; 720p soft; 3.71 s against 4.00 s (≈7 % fast, as on 1 Oct) |
| — | Grok image edit (keyframe only, not video) | product + on-model | $0.12, look `5ef1bfe8` | product-true jacket on the take's frame 0; arms re-posed slightly (not pose-locked) |

Side-by-sides were posted to Fendi in chat. They are not in the repo: they show a real person and the repo is public.

**What went wrong with the v1 config (VERIFIED by comparing the five references):**
1. The anchor, the highest-priority reference, is a frame of an earlier generated clip and is itself wrong. It has a knit body, a wide band, garbled lettering and no sleeve stripes. The xAI edit reproduces the anchor over the prompt; the v1 notes (rev 35) already recorded "the lane reproduces the anchor image over a contradicting constraint sentence".
2. The Look's sleeve rule ("Its sleeves are PLAIN on the outside … visible only when the arm lifts") told the model to hide the stripe the product shows.
3. The on-model reference is a lighter cream jacket, worn open, on a model in sunglasses. The two detail crops still carry website UI (arrows, close button).
4. In v1, the raw edit was never the final. v20 replaced the generator's lettering with a tracked real wordmark (`scripts/edit/garment_graphic_track.py`) and repaired the hem and cuffs (`hem_repair.py`, `garment_zone_recolor.py`). Fendi still parked the lane on 1 Oct ("the jacket still alters").

**Provider history (from the notes; there is no recorded "Grok vs Higgsfield" winner):**
- 1 Oct, rev 44: "Grok is the garment animator, not the world builder; Higgsfield (and Runway) build worlds".
- 1 Oct, rev 45: Genjutsu stage 1 KEEP on S06. Identity median 0.178 against 0.43–0.59 for the Grok edit lane; all four construction points held. Stages 2–3 were never run.
- No note records a pause "until a newer Grok". The lane was parked "until models mature (~6 months)".

## The recipe (approved 15 Oct; steps 2–4 are the open finishing work)

Fendi passed C. The recipe is:
1. Higgsfield Genjutsu object-swap, 720p, the product photo only, a prompt naming the construction points above, his own cap.
2. Correct the speed: retime the output to the source length. It runs ≈7 % fast every time, so it lands at 3.71 s against 4.00 s.
3. Run the deterministic brand layer on the logo if it reads wrong.
4. Face check on fast motion. The last 0.5 s smeared here.

Test at 1080p ($1.632 per source second) before scaling, to see whether the softness is the model or the resolution.

## How to run it (today, through AVT)

- **Genjutsu:** `proxy-provider-call` with:
  - `endpoint: "video-providers-higgsfield-model"`;
  - body `{mode: "video_to_video", modelVariant: "genjutsu-object-swap", referenceVideoUrl, referenceImageUrls: [product photo], resolution: "720p", promptText, avt_project_id}`.

  Poll status with `video-providers-job-status {provider: "higgsfield", id: <Higgsfield request id>}`; CC's own job id answers 404 there. Gap: the result is not filed in AVT `project_assets`, so it stays on Higgsfield's CDN.
- **xAI edit with a Look:** `grok-video-edit-proxy {lookId, referenceMode: "full_look", …}`. Once the proxy change in this branch is deployed, the Look's own `base_prompt` is used and every result row records the exact prompt and reference files it was made with.

## Do not

- Do not use Look `ce7f6350` as a product reference: its anchor is wrong. Keep it for provenance only.
- Do not judge a raw generator wordmark as final.
- Do not scale any route before Fendi passes it.

## Full look, 15 Oct (Fendi: "complete the full look swapping the Ralph Lauren hat for a YSL hat")

- **Hat:** first run used the Cassandre khaki cap (`c4f87504-…`, the 9 Oct pairing). Fendi's final choice is the Saint Laurent beige/ivory cap (`07e6dcbe-5c56-4e2d-862e-3b22aca8d93d`); see "Hat pairings" below.
- **Reference flaw, fixed 15 Oct:** every earlier YSL cap photo was cut off through the crown, so the brim was missing. That included the Wardrobe rows, `ib_looks_by_scene/uploads/` and the "Looks Decided" artifact (`claude.ai/artifact/Uvf3uuA1DsePRueMfd1z3q`). Fendi sent the full ysl.com product shots. `uploads/cap_*` now hold the whole cap: front, side or 3/4, and a stitch detail, 1170×780 (detail 1170×1170). The artifact (version 10) and the Wardrobe rows were updated to match. Run `678a62a8` used the old cut-off photos.
- **Run:** Genjutsu, 720p, refs = [jacket product photo, cap front (Wardrobe), cap side (repo uploads, raw GitHub URL)], with the run-C wording plus a cap sentence. Higgsfield request `678a62a8-84e5-49bf-beec-75e2d45f4ae1`.
- **Result of `678a62a8` (OBSERVED by the agent; Fendi has not judged it):**
  - Output: `https://d3u0tzju9qaucj.cloudfront.net/45ee058b-986d-49f2-adc9-280bbafe42a2/d0b4cf42-0436-4ebf-ad66-70513d1dc4fe.mp4`, 720×1280, 24 fps, 3.71 s. Not filed in AVT.
  - The navy cap became an olive-khaki cap with a curved brim, worn forwards, on every frame. The jacket held as in run C.
  - The tone-on-tone YSL monogram is not readable at 720p.
  - The face softens on fast motion near the end, as in run C.
  - It was posted to Fendi as take | run C | this run, retimed to 4.00 s.
- **Hat pairings (DECISION, Fendi, 15 Oct; corrected the same evening):**
  - He first said "The khaki hats looks better with the mastic jacket and the black and ivory looks better with the black long jacket". He then said "I was wrong … I meant to use the beige".
  - Final: the Saint Laurent beige/ivory cap goes with the Mastic track jacket, and the Y Varsity black/ivory cap goes with the Bubbled Lambskin coat.
  - The trucker look takes the khaki Cassandre cap. That is the agent's choice; Fendi has not confirmed it.
  - Recorded in `ib_looks_by_scene/decisions.json` (`hatPairings`) and in the artifact (version 12).
  - Run `678a62a8` (khaki) is therefore the wrong hat. Keep it for provenance only.
- **Run with the beige cap:**
  - Genjutsu at 720p, CC job `cdd3142c-fcf5-42bf-ab4f-65297d514ad1`, Higgsfield request `71ff19f4-0944-43fa-8371-677c5f9557e8`.
  - References: the jacket product photo, then the new Wardrobe beige cap photos (front, side, detail).
  - The cap sentence names a light beige gabardine cap with the ivory SAINT LAURENT wordmark.
