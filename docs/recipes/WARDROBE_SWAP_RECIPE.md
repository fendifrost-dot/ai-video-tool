# Wardrobe swap on a performance take: the recipe (living record, started 15 Oct 2026)

> **SUPERSEDED IN PART (18 Oct 2026):** the canonical method is [`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md).
> - Genjutsu (this page's run C) is still the swap engine.
> - Its whole-frame output is now an **intermediate**. The final picture is the body-only put-back: the garment goes over the original frames, and his face, mouth and hands stay the take's own pixels.
> - Step 4 below ("face check on fast motion") is resolved by that method.
> - The rest of this page stays as the record of what was tested.

Any agent or person putting Fendi into a garment on real performance footage starts **here**. The page records what
was run, on what, with which inputs, and what came out. It is updated after every test.

**APPROVED route (DECISION, Fendi, 15 Oct 2026: "Yes that passes"): Higgsfield Genjutsu object-swap, run C below. APPROVED full look ("Ok perfect"): Mastic jacket + Saint Laurent beige/ivory cap, Higgsfield request `71ff19f4`, see the end of this page.**
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
4. ~~Face check on fast motion. The last 0.5 s smeared here.~~ **Superseded 18 Oct:** keep the original face with [`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md).

Test at 1080p ($1.632 per source second) before scaling, to see whether the softness is the model or the resolution.

## How to run it (today, through AVT)

- **In the app (the production path, from 15 Oct):** Storyboard → open the performance shot → **Dress this shot**.
  - It sends only the shot's window of the take, with handles (0.5 s head / 0.75 s tail minimum, grown to the billed
    seconds).
  - It sends the scene's outfit pieces, in the order above (jacket product photo, then the cap with its angles, at most
    4), with the recipe's words built from the pieces.
  - It shows the exact cost before sending, and has a dry run.
  - The server conforms the ~7 % fast result to the cut's length (lossless), files it as a dressed take in sync, and
    puts it on the shot as an alternate.
  - A finished swap made outside the app is filed with `importFinishedDress`, at no spend.
  - See [`DRESS_AND_INSERT_WORKFLOW.md`](DRESS_AND_INSERT_WORKFLOW.md) for the rules, the costs and the checks.
- **By hand (research only), Genjutsu:** `proxy-provider-call` with:
  - `endpoint: "video-providers-higgsfield-model"`;
  - body `{mode: "video_to_video", modelVariant: "genjutsu-object-swap", referenceVideoUrl, referenceImageUrls: [product photo], resolution: "720p", promptText, avt_project_id}`.

  Poll status with `video-providers-job-status {provider: "higgsfield", id: <Higgsfield request id>}`; CC's own job id answers 404 there. By hand the result is not filed in AVT; file it with `importFinishedDress` (above).
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
- **Result of `71ff19f4` — APPROVED (DECISION, Fendi, 15 Oct: "Ok perfect"). This is the full look for the Mastic performance shots:**
  - Output: `https://d3u0tzju9qaucj.cloudfront.net/45ee058b-986d-49f2-adc9-280bbafe42a2/88283b9f-4545-4c68-9d40-1f4f63d557f7.mp4`, 720×1280, 24 fps, 3.71 s. Not filed in AVT.
  - The cap is light beige with a soft crown and a curved brim, worn forwards, on every frame. The jacket held as in run C.
  - The ivory SAINT LAURENT wordmark on the cap front is not visible.
  - The face softens on fast motion at the end, as before.
  - Posted to Fendi as take | this run, retimed to 4.00 s.

## Production: the Chicago windows of candidate 6 (15 Oct, evening)

The first production use of the approved look: five performance windows at 79th & Lafayette (c041, c044, c045, c046,
c047 of variation `358363e6`), cut from the master take `70304981` with handles, the approved prompt and the four
approved references (`promptVersion recipe-71ff19f4`), each with a write-ahead `provider_jobs` row the deployed tick
files. The cuts went up through Higgsfield's own media store because the MCP cannot put raw bytes into AVT.

| Shot | Song start | Cut | Request | Outcome |
|---|---|---|---|---|
| c047 | 82.025 | 4.955 s | `4c549907` | **ran**: filed as asset `f540b6be` (`derived_from.method dressed`, output 4.7083 s, conformed 4.9551 s, ratio 1.052415, song_start 82.025), an unselected alternate on the shot |
| c041 | 71.215 | 3.954 s, then 4.004 s | `1600b766`, then `682398db`, then **`6b1e6ea8`** | refused twice (below), then **ran after the top-up**: asset `2f55f4fa` (output 3.7083 s, conformed 4.0039 s, ratio 1.079694), sync at 71.215, assignment `912e6c7a` unselected |
| c044 | 75.885 | same | `aa1e363f`, then `7f75961b`, then **`b7babd92`** | refused twice, then ran: asset `6d8043a2` (same numbers), sync at 75.885, assignment `f49996d8` unselected |
| c045 | 77.855 | same | `70c23600`, then `1212bdf5`, then **`9b9feb5f`** | refused twice, then ran: asset `e6788d22`, sync at 77.855, assignment `7b1816da` unselected |
| c046 | 79.82 | same | `07a0deb9`, then `3bd0f9c8`, then **`9407b44b`** | refused twice, then ran: asset `92c15951`, sync at 79.82, assignment `c2f3b2d9` unselected |

All four 4.004 s sources came back 3.7083 s (ratio 1.079694, the same ~8 % speed-up as every run before); the tick
conformed each to 4.0039 s by container timescale with no audio dropped. Side-by-sides (take | dressed) and a stills
sheet were posted to Fendi at 07:36 UTC; he judges them.

Two findings, both VERIFIED from the provider's own answers:

1. **Higgsfield refuses a source under 4.0 s at intake** — "Your video is too short. Please upload a video that is at
   least 4 seconds long." The planner's billing guard had put every minimum window at 3.95 s, so all four 4-second
   windows were refused while the 4.955 s one ran. Fixed the same evening in `src/lib/storyboard/dress.ts` (the window
   is never under 4 s) and `src/lib/media/mp4Cut.ts` (the file ends at the length asked for). The failed submits were
   refused at intake and should be unbilled; confirm on the invoice.
2. **The Higgsfield organisation balance behind Control Center's key ran out** after c047. The four 4.004 s re-runs were
   refused with "Your credit balance is too low to complete this request. Please top up your balance and try again."
   Fendi topped the balance up (07:27 UTC) and the same four cuts, still in Higgsfield's media store (`08c08157`,
   `4f433e99`, `2d4a6aa6`, `e9f0aacc`), were resubmitted as new rows and all ran within six minutes (ledger row 35).

All five Chicago windows are now dressed and filed as unselected alternates. Fendi judges them; the agent does not.

## Production: cold front and clean entrance, grouped windows (15 Oct, night)

Under Fendi's standing rule of 07:45 UTC ("no more passing off to me for judgement — you can build freely") the agent
dressed the two remaining performance stretches and judged the results itself against the kill criterion (identity,
garment construction, cap/logo, no flicker or morph). Two looks, two prompts, same route as Chicago (write-ahead
`provider_jobs` row → CC `video-providers-higgsfield-model` → the deployed tick files the asset, its derived sync and
an unselected assignment on the window's first shot; the agent then adds unselected assignments for the other covered
shots).

**Grouping (DECISION, agent):** one Genjutsu run covers 3–5 adjacent 1.5–3 s shots instead of one run per shot. Fewer
runs, fewer seams, and the model holds a garment better over one continuous 8–11 s source than over five separate
4 s minimums. The row's `shotId` is the first shot; `settings.dress.coveredShots[]` lists all of them. Sources were cut
from the hero take `70304981` (sync `28dbe292`, offset 0.8538 s) with 0.5–0.75 s handles, planned by `dressWindow`.

| Window | Shots | Song start | Source | Billed | Row | Request | Asset | Verdict |
|---|---|---|---|---|---|---|---|---|
| coldW1 | c055–c058 | 99.46 | 7.958 s | 8 | `1d85966a` | `68659ffd` | `e09b1a3a` (conformed 7.9583, ratio 1.032432) | **REJECTED** — coat right and stable, navy cap never replaced |
| coldW2 | c059–c061 | 105.355 | 8.959 s | 9 | `bb22ab6f` | `7d3a3807` | `0e995b73` (8.9591, 1.028801) | **REJECTED** — cap plain navy for ~4 s then morphs into the Y cap; a round patch appears on the left sleeve |
| coldW3 | c062–c066 | 112.225 | 10.961 s | 11 | `7991930d` | `fe70e1de` | `1a83a167` (10.9608, 1.023574) | **PASS** — coat and Y cap on every frame, face/glasses intact |
| entrW1 | c085–c087 | 162.9 | 7.958 s | 8 | `0d2c193a` | `b24be21b` | `011a1323` (7.9583, 1.032432) | **PASS** — trench open over the confetti shirt, bucket hat, glasses showing |
| entrW2 | c088–c090 | 169.035 | 9.960 s | 10 | `d085e5c7` | `92263bb5` | `ed28aba0` (9.9596, 1.025881) | **PASS** — same, steady over 10 s |
| entrW3 | c092–c093 | 177.185 | 5.956 s | 6 | `fe39bff4` | `05f69f84` | `51c1156c` (5.956, 1.04339) | **PASS** — same; the shirt print reads clearly |

Coat look `0b4ae771` (`recipe-coat-v1-2026-10-15`): coat `90e177d5` (product front) + Y Varsity cap `40588200` (front),
`ba3cb919` (three-quarter), `f0450201` (side). Trench look `d17c59f3` (`recipe-trench-v1-2026-10-15`): trench `b802304a`
(front), `cb8f8a28` (on model), confetti shirt `3faf5d0f`, bucket hat `6ea8416d`. The prompts are in each row's
`settings.dress.prompt`.

Findings (OBSERVED from the filed clips, dense 2 fps frame sheets):

1. **The trench recipe ran 3 for 3; the coat recipe 1 for 3.** In both coat failures the *coat* was right and the *cap*
   was the problem — a small object described second in the prompt. Chicago's cap (described second as well) held
   5 for 5, so this is the Y Varsity cap specifically: a black cap replacing a navy cap is a low-contrast swap the model
   can skip.
2. **Longer sources speed up less:** output/source ratio 1.023–1.043 for 6–11 s sources against 1.0797 for every 4 s
   source. The tick's container-timescale conform absorbs either.
3. **Re-runs (ledger rows 37–39).** coldW1 and coldW2 were resubmitted with `recipe-coat-v2-capfirst-2026-10-15` — the cap
   clause first, "from the very first frame to the last", "no patch, badge or logo anywhere on the coat". The first pair
   (rows `cde54409`, `501f3dc1`) was refused at intake ("Your credit balance is too low", $0, row 37). After Fendi's
   16 Oct top-up the same requests went again as new rows (row 38, $11.58):

   | Window | Row | Request | Asset | Verdict (agent, 2 fps dense sheet + cap crops) |
   |---|---|---|---|---|
   | coldW2 | `c2c869b3` | `420c9d91` | `82e04339` (8.9591, 1.028801) | **PASS** — Y cap from frame 0 (faint and oblique in the first second while he faces three-quarter away, clear whenever the front faces camera), coat right, no sleeve patch, face/glasses/beard intact. Assignments on c059 (tick), c060, c061 (agent). |
   | coldW1 | `486a6d06` | `580d3b05` | `0de457ac` (7.9583, 1.032432) | **REJECTED** — the cap is black from the first frame now (the wording fixed the colour swap) but carries no ivory Y on any frame; coat right. |

   So cap-first wording took the coat recipe from 1/3 to 2/4 on these windows; the failure mode moved from "cap not
   swapped" to "cap swapped without its mark". The next lever, per the plan, is reference order: coldW1 went a third
   time as row `81cc8a5e` (request `7c3b60c5`, `recipe-coat-v3-caprefs-first-2026-10-16`: the three cap images first,
   the coat fourth, prompt text unchanged except the image numbers; row 39, $5.45). Verdict: asset `514901e3` **REJECTED** — coat right; the cap is black from frame 0 but its ivory mark sits at the APEX
   of the crown, undersized, and only becomes a proper front-panel Y in the last ~1.5 s (a morph). Three rejections on
   this one source: in coldW1 he faces three-quarter away with the camera low for the first seconds, so the front panels
   are rarely square to the lens — the model never gets a clean look at where the Y goes. coldW2 and coldW3 (front-on
   openings) passed. Next lever tried: two 4 s windows (the 4 s Chicago sources held the cap 5/5) — ledger row 40, $6.81. A (take
   98.6062–102.6102, c055–c056, row `b2fa6986`, asset `d51e37e3`): **REJECTED**, plain black cap, no Y. B (take
   102.4102–106.5642, c057–c058, row `f6475ae0`, asset `2e45bf14`): **REJECTED**, cap not replaced at all. Coat right in
   both.

   **DECISION (agent, 16 Oct 02:00 UTC): no more Genjutsu re-runs on coldW1.** Five runs on this eight-second stretch of
   the hero take (full window ×3, halves ×2; three prompt/reference variants) and the cap failed every time while the
   same recipe held the cap on coldW2, coldW3 and all five Chicago windows. The variable is the source, not the prompt:
   from 98.6 s to 106.6 s he faces three-quarter away from a low camera and tilts his head, so the front panels are
   never square to the lens and the model has nowhere to put the Y. The kill criterion says redesign, not scale. Two
   ways to cover c055–c058 with the right cap, in order of preference:
   1. **Deterministic cap-logo composite** — the LOCKED architecture already keeps "the deterministic brand/logo
      composite for stripe/logo": track the cap's front panel on the coat-right take `d51e37e3` / `0de457ac` (black cap,
      no mark — the cleanest base) and composite the ivory Y from the product reference, with the plate composite lane
      after it. Not built yet; it is a tool build, not a prompt.
   2. **Re-cover the beats from a front-facing stretch** — the lyric beats at 100.36–106.26 can be re-cut from a
      different take or from coldW2's PASS (`82e04339`, song 105.355→) where it overlaps; a timeline decision, not a
      dressing one.
   All rejected assets stay filed (`approval_status rejected`, reason in `notes`) as provenance; nothing was overwritten.

Covered-shot assignments added for the passing windows (all `role performance`, `is_primary false`, variation
`358363e6`): coldW3 → c063, c064, c065, c066; entrW1 → c086, c087; entrW2 → c089, c090; entrW3 → c093; coldW2
(`82e04339`) → c060, c061.
