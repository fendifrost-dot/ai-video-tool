# Handoff: c033 BODY-ONLY placed in the showroom with Blender (19 Oct 2026)

**Status:** CODED + RENDERED offline. Nothing is on the board or in the Cut. Fendi has not yet judged these versions.
**Spend: $1.68** (ledger rows 148–154), all on the room (stills and plates), none on him.

Write-up: [`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`](../research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md)
Canonical method: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md)

## Done (in this PR, with the asset IDs in the write-up)

- **Scene:** `scripts/edit/blender/showroom_c033.json`. Every value is labelled MEASURED / SPEC / ESTIMATE / DECISION.
- **Scripts:** `scripts/edit/blender/`:
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
- **Rendered and filed in AVT (unassigned edited_clip), on plate v3 `256ca1bb`:**
  - matched camera `98d1d04e`;
  - tight 1.6× `63a101f1`;
  - dolly: not rendered (stopped when the plate changed);
  - review clips with the song;
  - the interpolated plate `67159b15`.
- **Storage only:** the `.blend` files and the floor plan.

## Not done: what needs a person or a later session

0. **Fendi rejected the generative room motion** ("looks AI generated and antithetical to our whole approach").
   - The rendered versions sit on the rejected plate v3. Treat them as placement references only.
   - Next is the recommendation in the write-up: the frozen still `20fcf483` with deterministic Blender/comp motion, at $0.
   - Build it only once Fendi says yes. No more Kling plates.
1. **Fendi's eye** on the three versions. Ask in this order:
   - Does he read as standing behind the island?
   - His height against the penguin and the counter.
   - His exposure (+0.8 stop over the measured match).
   - Which framing: wide, dolly or tight.
   - Nothing goes on the board until he picks.
2. **Placing the pick on c033.**
   - It would be a new version on the shot, through the board's own versioning, never by replacing the production clip.
   - Verify by re-querying that only that row changed.
3. **Integration into AVT (not built):**
   - The app has no Blender worker, so this lane runs offline only.
   - The camera measurement (vanishing points) and the performer spot are manual.
   - The body-only put-back is still not in Dress.
4. **Tomorrow's takes:** shoot to the guidance in the write-up (eye-height phone, 3–4 m, tripod, one full-body take).
   - Then run Genjutsu → body-only → this Blender lane per take.
   - A full-body take can stand in open floor with real floor contact.

## How to verify (cheap, distinguishes outcomes)

- **Reproduce one version.** `MOVE=static scripts/edit/reproduce_c033_showroom_blender.sh` with the stored inputs.
  - Expected decoded MD5 **aecb5dbcaadb4e5186e596ac685b2a94** (static). Tight: `f119056faf3e1ff16ab83ef02184f475`. Dolly: never rendered, so no reference MD5.
  - A different MD5 with identical input hashes means a different Blender/ffmpeg/numpy build. Compare the versions before trusting it.
  - A MISMATCH on an input means the wrong file. Do not edit the hashes.
- **`verify_scene.py` on the result.** Expected (static):
  - face PSNR median ~36 dB (min ≥ 34). For tight use `--inner 10`: ~38, min ≥ 35;
  - timing lag-0 fraction **1.0**, min margin > 0 dB.
  - A redrawn or warped face would fall far below 30 dB. A timing slip shows best_lag ≠ 0.

## Guardrails

- Do not re-matte, re-animate the plate or regenerate anything to reproduce. Every input is in storage.
- Do not change `showroom_c033.json` values to make a check pass. A failing check means the inputs or tools differ, and that is the finding.
- Never run a generative pass over his face. Never add lip-sync. Never mark a version accepted for him.
- The repo is public: never commit media of Fendi or the song (renders stay in AVT storage).

## Continuation prompt (copy-ready)

> Continue the c033 showroom work in `fendifrost-dot/ai-video-tool` (Lovable-managed AVT; no standalone Supabase).
> First read `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md`, then the write-up it links and
> `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`.
>
> - **Do not reopen** the approved c033 BODY-ONLY result (`5482b35b`) or the showroom baseline (`8a527bab`).
> - Fendi's verdict on the Blender versions is in chat; apply exactly what he picked:
>   - add the chosen version as a new version on shot c033 through the board's versioning;
>   - leave the production Cut untouched unless he says so;
>   - re-query that only that row changed.
> - **For each new take from the shoot:**
>   1. Genjutsu swap.
>   2. `scripts/edit/body_only_swap.py` (face proof must print 0).
>   3. A matte via `matte-video-proxy`.
>   4. A scene file like `showroom_c033.json`, measured from that take and that plate. Label every value MEASURED/ESTIMATE/DECISION.
>   5. The Blender lane, then `verify_scene.py`.
> - Post every clip to chat. Dry-run any paid step first, report its cost, and log it in `docs/LEDGER_YSL_TESTING_BUDGET.md`.
> - Never redraw his face, never add lip-sync, never change a production selection without his acceptance.
> - Finish with a verification-first handoff in `docs/handoffs/`.

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
