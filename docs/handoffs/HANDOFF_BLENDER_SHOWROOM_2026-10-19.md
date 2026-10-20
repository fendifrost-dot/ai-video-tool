# Handoff: c033 BODY-ONLY placed in the showroom with Blender (19 Oct 2026)

**Status:** CODED + RENDERED offline (room v5, merged in #351, squash `8277701`). Nothing is on the board or in the Cut.
**Fendi's note (19 Oct, after room v5):** "there is bleed I believe from the headlight effect, it looks like I'm coming out of the environment."
**Fixed on 20 Oct as v6.** The comp's edge wrap was lowered from 0.5 to 0.15 (`lens.wrap`). See item 0. Fendi: "That one is solid."
**v7 (20 Oct):** a livelier penguin in place. Fendi: "not enough movement still … it can walk away from me".
**v8 (20 Oct):** the penguin walked away. Fendi: "That looks terrible … Remove the penguin from the scene altogether … It looks AI generated and cheesy."
**v9 (20 Oct, CODED + RENDERED, current; Fendi has not judged it):** no penguin; the clean still shows the cabinets and floor where it stood. Static `436ffebe`, tight `835a050b`, dolly `567e8ff7` (VERIFIED: face 36.3 / 38.3 / 36.5 dB median, timing 111/111 each). Do not bring back a cut-out animal (see the write-up's v9 section).
**Spend: $1.82** (ledger rows 148–155), all on the room (stills and plates), none on him.

Write-up: [`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`](../research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md)
Canonical method: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md)

## Done (in this PR, with the asset IDs in the write-up)

- **Scene:** `scripts/edit/blender/showroom_c033.json`. Every value is labelled MEASURED / SPEC / ESTIMATE / DECISION.
- **Scripts:** `scripts/edit/blender/`:
  - `room_layers.py`, `snow.py`, `room_motion.py` (room v5: the room moves with no generative video)
  - `prep_performer.py`
  - `build_scene.py` (Blender 4.5.9 LTS)
  - `measure_plate_light.py`
  - `comp_scene.py`
  - `verify_scene.py`
  - `review_clips.py`
- **Reproduce:** `scripts/edit/reproduce_c033_showroom_blender.sh` (`MOVE=static|dolly|tight`). It checks the inputs by sha256 and prints the decoded MD5.
- **Fendi's notes, all applied:**
  - His height (6 ft 3 in): he is sized from it, and the room is scaled 0.95 at his direction.
  - "The penguin is perfectly still": it now moves in place.
  - A blue Ferrari Purosangue with LED flicker.
  - Snow in the wind, and a UFO chasing a flying Tesla Roadster outside: **rejected** in plates v3 and v4 ("scrap the UFO and Tesla").
  - "Looks AI generated and antithetical to our whole approach": room v5 replaces every generative motion with Blender and fixed curves:
    - Blender particle snow in a gusting wind;
    - branch sway;
    - rolling-shutter LED bands (his "natural rolling flicker", not flashing);
    - the penguin's own pixels moved.
  - "The Ferrari appear to be larger than the other truck": measured at 1.92 m against a 1.589 m spec, now shrunk ×0.828 on the same spot.
- **Rendered and filed in AVT (unassigned edited_clip), room v5 (plate `0fc2cf8c`):**
  - matched camera `30f71856` (with song `2df713e3`, side-by-side `8883b4d2`, face pair `a6d442b5`);
  - tight `7adff8e9` (with song `9254ba24`, face pair `7a9ad53f`);
  - dolly `a74c3c90` (with song `f46ba962`, side-by-side `afb9ed1e`, face pair `6c257bdb`).
- **Superseded, on the rejected plate v3:** matched `98d1d04e`, tight `63a101f1`.
- **Storage only:** the `.blend` files and the floor plan.

## Not done: what needs a person or a later session

0. **The headlight bleed: fixed in v6, awaiting Fendi's eye.**
   - **Test run ($0, frames 60/120/180):** the comp with the wrap at 0.5, at 0.15 and off.
   - **OBSERVED:** at 0.5 the wrap lifted his outline by up to 16–18 levels.
     - It left a pale rim around his cap, jaw and shoulders against the snowy window.
     - On the car side the rim followed the Ferrari's lamps and their rolling band.
   - **DECISION:** wrap 0.15 (`showroom_c033.json`, `lens.wrap`). Only `comp_scene.py` re-ran.
   - **VERIFIED after the fix:** static 36.4 / 34.2 dB, tight 38.2 / 35.9 (10 px in), dolly 36.5 / 33.6; mouth timing lag 0 on 111 / 111 for all three.
   - **v6 files:** static `81989353`, tight `7c341552`, dolly `49bdba39` (with-song reviews in the write-up). The v5 files are superseded.
   - **Still open (low priority):** the tight shot's 5 px outline dip (29.9 dB on frame 184) is not the wrap. See the write-up's correction.
   - **Ask Fendi:** is the halo gone, and does his edge still sit in the room? Lower or raise `lens.wrap` (0–0.5) and re-run `comp_scene.py` only.
1. **Room v5 awaits Fendi's eye** after the bleed fix. Ask:
   - whether the LED bands read as the camera phenomenon he means;
   - whether the Ferrari's size and the penguin's moves read right;
   - whether the snow density is right.
   Every one of these is a value in `showroom_c033.json` (`room_v5`). Retune there and rerun; no generation is needed.
2. **Fendi's eye** on the three versions. Ask in this order:
   - Does he read as standing behind the island?
   - His height against the penguin and the counter.
   - His exposure (+0.8 stop over the measured match).
   - Which framing: wide, dolly or tight.
   - Nothing goes on the board until he picks.
3. **Placing the pick on c033.**
   - It would be a new version on the shot, through the board's own versioning, never by replacing the production clip.
   - Verify by re-querying that only that row changed.
4. **Integration into AVT (not built):**
   - The app has no Blender worker, so this lane runs offline only.
   - The camera measurement (vanishing points) and the performer spot are manual.
   - The body-only put-back is still not in Dress.
5. **Tomorrow's takes:** shoot to the guidance in the write-up (eye-height phone, 3–4 m, tripod, one full-body take).
   - Then run Genjutsu → body-only → this Blender lane per take.
   - A full-body take can stand in open floor with real floor contact.

## How to verify (cheap, distinguishes outcomes)

- **Reproduce one version.** `MOVE=static scripts/edit/reproduce_c033_showroom_blender.sh` with the stored inputs (room v5).
  - Expected decoded MD5 (v9, current) **22401387639530934a3e5ac3d6c658e5** (static). Tight: `f27057454327c0763204bc0177c8d538`. Dolly: `61b922fb0788a92941c08e48e951bb4e`.
  - v6 (with the penguin, wrap 0.15): static `4eacb289…`, tight `b9ba7cae…`, dolly `ef590cb5…`.
  - v5 (wrap 0.5): static `f0cd5952…`, tight `9fdbad43…`, dolly `111486d1…`.
  - The plate on its own: the v5 plate was MD5 `ee623d0a5906d76ba41bdf572d5a8484`. The v9 plate (no penguin) is not yet reproduced from scratch: run the script and record its MD5 (`$OUT/plate.mp4`). Compare it first: a different plate means a different Blender particle build or OpenCV.
  - Plate v3 versions: the script at commit `75c1279` (MD5 `aecb5dbc…` static).
  - A different MD5 with identical input hashes means a different Blender/ffmpeg/numpy build. Compare the versions before trusting it.
  - A MISMATCH on an input means the wrong file. Do not edit the hashes.
- **`verify_scene.py` on the result.** Expected (static):
  - face PSNR median ~36 dB (min ≥ 34; dolly ≥ 33.5). For tight use `--inner 10`: ~38, min ≥ 35;
  - timing lag-0 fraction **1.0**, min margin > 0 dB.
  - A redrawn or warped face would fall far below 30 dB. A timing slip shows best_lag ≠ 0.

## Guardrails

- Do not re-matte, re-animate the plate or regenerate anything to reproduce. Every input is in storage.
- Do not change `showroom_c033.json` values to make a check pass. A failing check means the inputs or tools differ, and that is the finding.
- Never run a generative pass over his face. Never add lip-sync. Never mark a version accepted for him.
- The repo is public: never commit media of Fendi or the song (renders stay in AVT storage).

## Continuation prompt (copy-ready)

> Continue the c033 showroom Blender build in `fendifrost-dot/ai-video-tool` (Lovable-managed AVT; no standalone
> Supabase, no supabase CLI). Read first, in order:
> 1. `CLAUDE.md`;
> 2. `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md` (this file);
> 3. the write-up it links (`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`);
> 4. `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`.
>
> **State:** room v5 is merged. The room is a frozen still split into layers; the only motion is Blender particle snow,
> a branch sway, a rolling-shutter LED band on the Ferrari's lamps and small rigid moves of the penguin's own pixels.
> The Ferrari is shrunk to its 1.589 m spec. Fendi's headlight-bleed note is fixed in v6 (edge wrap 0.15).
> Fendi had the penguin removed ("AI generated and cheesy"). The v9 versions, with no penguin (matched `436ffebe`, tight `835a050b`, dolly `567e8ff7`), are filed in AVT, unassigned.
> Fendi has not picked one.
>
> **First task:** get Fendi's eye on v6.
> - Is the halo gone?
> - LED bands, Ferrari size, snow, framing.
> - Never bring back a cut-out or puppeted animal.
> - Retune values in `showroom_c033.json` (no generation needed) and re-render what changed.
> - Re-verify with `verify_scene.py` and file new versions as new assets.
>
> **Rules:**
> - No image-to-video on the room. Every motion stays Blender or a seeded curve in `showroom_c033.json` (`room_v5`).
> - Never redraw his face, never add lip-sync, and do not reopen the approved BODY-ONLY result (`5482b35b`) or the baseline (`8a527bab`).
> - Nothing goes on the board or in the Cut until Fendi picks a version. Then add it as a new version on c033 and re-query that only that row changed.
> - Post every clip and still to chat as it exists.
> - Dry-run any paid step, report its cost, log it in `docs/LEDGER_YSL_TESTING_BUDGET.md` (last row 155, total $449.12), and ask before spending over $50.
> - Never commit media of Fendi or the song (the repo is public), and never paste a token or a signed URL.
> - Label every claim VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.
> - Reproduce with `scripts/edit/reproduce_c033_showroom_blender.sh`. The plate MD5 `ee623d0a…` is VERIFIED bit-identical from storage.
> - Finish with a verification-first update of this handoff.

## Review request for Grokbot / ChatGPT (optional, paste as is)

> Please review a VFX placement for a music video. A real performer (locked-off iPhone take, framed thighs-up) is placed
> in an AI-generated showroom (locked-off, 24 fps image-to-video).
>
> - **Placement:** behind a kitchen island, so the island hides the hip cut. He is 1.905 m tall; the room is scaled so the island is 0.865 m.
> - **Plate camera, measured from vanishing points:** 29 mm full-frame equivalent, level, 1.65 m high.
> - **Performer:** a camera-facing card at 4.42 m, sized from his stated height; 1.5 m in front of a penguin.
> - **Light:** a measured white-balance/exposure match (+0.8 stop for the nearby downlight). Flashes in the room are followed at 80 %.
> - **Lens:** depth of field f/2 from a depth pass.
> - **Not done:** no shadow, because geometry says it falls behind the island.
>
> What would make it read more like it was filmed there, without regenerating his face or inventing camera angles?
