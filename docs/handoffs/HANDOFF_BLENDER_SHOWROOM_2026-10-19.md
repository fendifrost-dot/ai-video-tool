# Handoff: c033 BODY-ONLY placed in the showroom with Blender (19 Oct 2026)

**Status:** CODED + RENDERED offline (room v5, merged in #351, squash `8277701`). Nothing is on the board or in the Cut.
**Fendi's last note (19 Oct, after room v5), OPEN:** "there is bleed I believe from the headlight effect, it looks like I'm coming out of the environment." This is not fixed; see item 0 below. He then asked to continue the build in a new chat from this handoff.
**Update, 19 Oct late (cloud session, branch `claude/blender-showroom-headlight-bleed-ay9p29`):** the bleed is **still OPEN and not diagnosed**. The tests are now **CODED and checked on synthetic inputs** (`bleed_tests.sh`, one command), but **not run on the real shot**. Nothing new was rendered, filed or shown to Fendi. See "Bleed tests: ready, blocked on storage" below; it replaces the manual steps in item 0.
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

## Bleed tests: ready, blocked on storage (19 Oct late)

**Blocker (OBSERVED, VERIFIED by the proxy log):** the cloud environment's network policy refuses
`qoyxgnkvjukovkrvdaiq.supabase.co` (CONNECT answered 403). A signed URL from the AVT MCP is minted fine, but the
container cannot download the inputs or upload renders. It also refuses `download.blender.org`.
- **Fendi (or whoever owns the environment)** adds `qoyxgnkvjukovkrvdaiq.supabase.co` under Network access →
  Allowed domains (environment menu → Edit; https://code.claude.com/docs/en/cloud-environments#network-access).
- Or run this on the Mac, where the earlier renders were made.
- Cheap check before anything else:
  ```
  curl -sS -o /dev/null -w "%{http_code}\n" https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/version
  ```
  Any HTTP status means reachable. `000` with "CONNECT tunnel failed, response 403" means still blocked: stop.

**Done in this session (code only, $0, no media in the repo):**

| File | What |
|------|------|
| `scripts/edit/blender/comp_scene.py` | `--wrap screen\|off\|light`, `--env-dir`, `--wide-env`, `--stats`; `--only` takes a list. Default = v5 as filed. |
| `scripts/edit/blender/room_motion.py` | `--led-depth D` (test 2), `--no-led 1` (a plate with the LED light removed, for fix a). Default = v5. |
| `scripts/edit/blender/showroom_c033.json` | new `comp` block: `wrap: "screen"` (unchanged), fix values, stats windows. No existing value changed. |
| `scripts/edit/blender/bleed_tests.sh` | the three tests plus fixes (a), (b), (a+b) on chosen frames: stills, stats, 2× crops. |
| `scripts/edit/blender/edge_crops.py` | same-box crops at 2×, nearest-neighbour, labelled, side by side. |
| `scripts/edit/blender/bpy_blender.sh` | runs the Blender scripts in `bpy` from PyPI when the Blender binary cannot be downloaded. |
| `scripts/edit/reproduce_c033_showroom_blender.sh` | `TAG` names outputs (default `v5`); renders the LED-free wrap pass only if `comp.wide_env` is set. |

**Checked (VERIFIED on synthetic stand-in stills and a synthetic performer, real Blender `bpy` 4.5.14):**
- With defaults, the edited `comp_scene.py` and `room_motion.py` give **byte-identical** PNG frames and an identical
  decoded MD5 to the merged versions. So the filed v5 MD5s should still reproduce. HYPOTHESIS until a real run shows it.
- `bleed_tests.sh` runs end to end: Blender renders partial plate sequences, every variant writes stills, stats and crops.
- The stats isolate the wrap: `wrapoff` lift is exactly **0.0**; `base` 8.9 and `fixb` 0.36 of 255 on the synthetic edge.
- `comp.wrap` + `comp.wide_env` in the scene file give the same pixels as the flags.
- **NOT checked:** whether `bpy` 4.5.14 renders bit-identical to the tested Blender 4.5.9. The plate MD5 answers it.

**Next agent, in order (stop at the first mismatch and report it):**
1. Reachability check above. Then a Python 3.11 env:
   `uv venv -p 3.11 bl311 && uv pip install -p bl311/bin/python "bpy==4.5.*" "numpy<2.3" opencv-python-headless scipy mediapipe`.
2. Fetch the five inputs (paths in the reproduce script header) plus `30f71856` (v5 static) and `98d1d04e` (v3
   static) for the crops. Never paste the signed URLs anywhere.
3. `IN=… OUT=… BLENDER=scripts/edit/blender/bpy_blender.sh PYBPY=bl311/bin/python PY=bl311/bin/python MOVE=static scripts/edit/reproduce_c033_showroom_blender.sh`
   - Expected: every input `ok`; plate MD5 `ee623d0a5906d76ba41bdf572d5a8484`; decoded MD5 `f0cd5952b6931e122624ca1daadc6aad`.
   - A different plate MD5 with `ok` inputs = the `bpy` build differs (finding: record it). The tests still compare
     variants fairly inside one build, but every new render must then be judged by `verify_scene.py`, not by MD5.
4. `OUT=… BLENDER=… PYBPY=… PY=… MOVE=static FRAMES="40 120 200" V5=v5_static.mp4 V3=v3_static.mp4 scripts/edit/blender/bleed_tests.sh`
   - Expected baseline check: "base vs filed v5: mean abs diff" about **2–3.5 of 255** (ESTIMATE: grain is redrawn,
     plus x264). Far above that = the baseline is not the filed shot. Stop.
   - Read the printed table and `$OUT/bleed/crops_<N>.png`:

   | What you see | Means |
   |---|---|
   | Halo gone in `wrapoff`, `base` lift ≫ `fixa`/`fixb` lift | the wrap is the cause (HYPOTHESIS confirmed) |
   | `ledoff` lift spread (sd) well below `base` | the LED band drives the pulse |
   | Halo still there in `wrapoff` | the wrap is **not** the cause. Do not apply a fix. Report, with crops. |
   | `v3 dark car` shows no halo, `base` does | the lamps behind him are what changed |

5. Pick the smallest fix that removes the halo, in the handoff's order: (a) `fixa`, then (b) `fixb`, then both.
   Set it in `showroom_c033.json` `comp` (`wide_env: "noled/{move}_env"` and/or `wrap: "light"`). That is a DECISION
   value, labelled as such. It is not editing a value to pass a check. Show Fendi the crops (before = `base` /
   `v5 filed`, after = the pick) **before** re-rendering.
6. Re-render with `TAG=v5b` for static, tight, dolly. `verify_scene.py` must hold: static face PSNR median ≥ 36, min
   ≥ 34; tight (`--inner 10`) ~38 / ≥ 35; dolly ≥ 33.5; timing lag-0 **111/111**. The wrap only touches his edge
   band, so the face numbers should not move. A drop means the band reaches the face: stop.
7. Upload as **new** files and insert **new** `project_assets` rows (unassigned edited_clip, `not_for_cut`). Never
   overwrite `30f71856`, `7adff8e9`, `a74c3c90`. Re-query that the three old rows are unchanged. $0: no ledger row.

## Not done: what needs a person or a later session

0. **OPEN, first: the headlight bleed on his outline.** (The tests below are now one command: see "Bleed tests: ready, blocked on storage".)
   - **OBSERVED geometry:** in the matched camera he stands in front of the Ferrari's front-left corner. The left LED strip and left lower lamp (`room_v5.lamp_boxes_1080` boxes 2 and 4, x ≈ 410–456, y ≈ 910–992) sit just behind his body, on the side toward the car.
   - **HYPOTHESIS (cause):** `comp_scene.py` (lines ~98–104) gives him the composite lane's edge band with a 0.5 *screen* wrap of `wide = blur(room, 30)`.
     - Behind him the room now holds bright LED lamps, so the screen wrap lifts his outline toward lamp-white.
     - The rolling LED band then makes that glow pulse.
     - Together that reads as him "coming out of" the room, a halo, not a lit edge.
   - **Test that separates the causes ($0, `--only` frames, `--stills DIR`):**
     1. Re-comp a few frames with the wrap off (`wrap = him`). If the halo goes, it is the wrap.
     2. Re-comp with `room_motion.py`'s LED band off (`led.depth` 0). If only the pulsing goes, the band is driving the wrap.
     3. Compare a crop of his car-side edge at 2× against the plate-v3 render `98d1d04e`, which had dark car paint behind him.
   - **Fix options, in order of preference (DECISION for the next agent, show Fendi before/after crops):**
     - (a) build `wide` from the room **without** the LED layer, or clip it, so lamps cannot feed the wrap;
     - (b) lower the wrap to a normal light wrap (e.g. 0.15–0.25, multiply-darkened where the background is brighter than him);
     - (c) move the car a little along its row (`room_v5.car_anchor_x_px`, and `car_proxy` with it) so no lamp sits right behind him. Fendi allowed moving objects.
   - **Do not** touch his pixels' grade to hide it, re-matte, or regenerate. Re-run `verify_scene.py` after the fix: the face PSNR must not drop (static ≥ 34 min, 36 median).
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
  - Expected decoded MD5 **f0cd5952b6931e122624ca1daadc6aad** (static). Tight: `9fdbad43ce0a658558124e2a104fb152`. Dolly: `111486d18afd9ecc506c20b800b7a162`.
  - The plate on its own: MD5 `ee623d0a5906d76ba41bdf572d5a8484` (`$OUT/plate.mp4`). Compare it first: a different plate means a different Blender particle build or OpenCV.
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
> The Ferrari is shrunk to its 1.589 m spec. Three versions (matched `30f71856`, tight `7adff8e9`, dolly `a74c3c90`)
> are filed in AVT, unassigned. Fendi has not picked one.
>
> **First task: the open bleed.** Fendi: "there is bleed I believe from the headlight effect, it looks like I'm coming
> out of the environment."
> - First check the container can reach `qoyxgnkvjukovkrvdaiq.supabase.co` (the handoff's curl). If not, stop and say so.
> - Follow "Bleed tests: ready, blocked on storage" in the handoff: reproduce static, run `scripts/edit/blender/bleed_tests.sh`, read the table, and apply the smallest fix.
> - Show Fendi before/after crops of his car-side edge, then re-render static, tight and dolly.
> - Re-run `verify_scene.py` (face PSNR must not drop; timing lag-0 must stay 111/111), and file the new versions in AVT as new assets. Never overwrite the old ones.
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
