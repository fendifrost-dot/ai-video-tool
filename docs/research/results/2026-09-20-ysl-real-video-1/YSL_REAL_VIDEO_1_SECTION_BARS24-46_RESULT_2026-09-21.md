# YSL Real Video #1 · 30–60 s production validation · bars 24–46 · RESULT

**Date:** 2026-09-20 → 21 · **Author:** Claude (full takeover) · **Section:** song 47.213–90.492 s (43.28 s, bars 24–46, pre-hook + hook block) · **Spend:** see ledger below.

## What was proven

| Mandate test | Result |
|---|---|
| Song ↔ performance sync from real media | **DONE.** `song = master + 0.8538 s`, windowed GCC-PHAT, 23/30 windows consistent, drift −0.3 ppm. Record + reproducible script in PR #148. Grid 122.00 BPM measured (140 BPM seed was a hypothesis). |
| Source-range editorial model | **DONE.** `performance_syncs` + `timeline_items.source_*` (additive migration, not yet applied live) and the pure `performanceSync.ts` mapping; every shot in the treatment resolves master ranges from the song clock, none typed by hand. |
| Real editorial cutting on the song clock | **DONE.** 12 slots, cuts on bar downbeats; assembly places each render by `songToPerformance(t) − masterStart` and cuts the album WAV for the same range (`scripts/edit/assemble_section.py`, exact frame budgets per slot). |
| YSL wardrobe ON Fendi (moving footage) | **DONE — 8/8 performance slots passed Gate 0.** xAI `/v1/videos/edits` via the authenticated `grok-video-edit-proxy`, flat product photo as the single reference. Look 1 (Saint Laurent track jacket, hook, bars 32–46) prompt `v3-jacket-only`; Look 2 (YSL trucker jacket, pre-hook, bars 24–32) prompt `trucker-v1`. Identity, pose, hands, camera and background preserved; garment temporally stable. |
| ≥ 1 convincing second look | **DONE.** Two looks, both convincing on the real performance. |
| Environment transformation | **DONE (deterministic).** Person matte (U²-Net human seg + static-background prior + temporal median) over Grok Imagine plates ("cold fitting room / mirror panel"), `scripts/edit/composite_environment.py`. The v2v "change the background" pass was tested once and **rejected** (face relit into darkness, identity lost). |
| ≥ 1 purposeful B-roll cut | **DONE.** S02 real macro of the trucker jacket (fashion language on the verse); S07 night-city insert (Grok Imagine still, animated). |
| ≥ 1 transition / FX | **DONE.** S05 ice-hit white-out across the look change into the drop; S10 1/8-note mirror strobe; glitch flash into S11. |
| Return from B-roll to synced performance | **DONE** after S02, S05, S07, S10. |
| Real timeline / export | **DONE.** 1080×1920 @ 24 fps H.264 + AAC from the album master, `section_bars24-46.mp4` + `.assembly.json` (per-slot offsets). |

## Gate 0 log (moving footage)

| Shot | Look | Attempt | Asset | Cost | Decision | Note |
|---|---|---|---|---|---|---|
| S06 | 1 | 1 | `d36c0309` | $0.56 | accepted | first Gate-0 pass; row inserted manually after proxy insert failed on `shotId:"S06"` |
| S08 | 1 | 1 | `236f30f5` | $0.56 | **rejected** | chest band broken/partial through the arm-crossing |
| S08 | 1 | 2 | `2daf6190` | $0.56 | accepted | full band, stable |
| S11 | 1 | 1 | `ab3ba0f2` | $0.56 | accepted | |
| S12 | 1 | 1 | `efa48177` | $0.40 | accepted (conditional) | wordmark rendered larger than the reference |
| S09 | 1 | 1 | `8db0030f` | $0.32 | accepted | own cut (master 74.868–78.835) replaces the stale V2 clip |
| S01 | 2 | 1 | `ac4ca37d` | $0.40 | accepted | trucker: collar, silver buttons, chest flap pockets, black tee at throat |
| S03 | 2 | 1 | `a4f84701` | $0.56 | accepted | |
| S04 | 2 | 1 | `e9fb4348` | $0.32 | accepted | |
| S06 env | 1 | 1 | `255417f1` | $0.56 | **rejected** | v2v environment pass destroys identity → composite instead |

All xAI outputs are time-aligned to their source cut from frame 0 (checked by frame matching, `alignment_check.json`); xAI trims ~0.26 s from the tail, absorbed by the 0.5 s handles.

## Ledger (new spend in this takeover)

xAI video edits: 10 billed runs = **$4.80**. Grok Imagine (browser, consumer plan): plates + B-roll, $0 API. Everything else deterministic, $0. Prior handoff claim of ~$0.54 was not verifiable from the repo (no ledger file existed); per-asset `metadata_json.actual_cost_usd` is the only cost record, and every run above carries `metadata_json.provenance` (provider, model, purpose, shot, attempt, cost, decision, reason).

## Problems found → generalized fixes

1. `grok-video-edit-proxy` billed before validating `shotId` (uuid column) → output orphaned. Fix: fail-closed uuid check before any xAI call (`invalid_shot_id`). Needs redeploy.
2. V3 prompt described the on-model reference (shirt, tie, trousers) while the lane sends only the flat photo → registered `GROK_VIDEO_EDIT_PROMPT_V3_JACKET_ONLY` (jacket only, keep trousers/shoes). Same shape used for the trucker.
3. No environment lane existed that preserves identity → `composite_environment.py` (matte + plate) instead of a second generative pass.
4. No timeline → MP4 renderer existed → `assemble_section.py` (song-clock, exact frame budgets, refuses filler).
5. Grok Imagine videos are not retrievable from the sandbox (assets.grok.com 403; images are on a public CDN). B-roll video therefore came from real footage + animated stills; Chrome-download → linked Mac path needs Fendi's folder approval.

## Limitations (honest)

* 720×1280 native from xAI, upscaled to 1080×1920 — soft next to the 1080 master; not 4K.
* Wordmark legibility varies with motion (S12 oversized; fast-motion frames garble letters).
* Matte edges: hair/cap fine; occasional 1–2-px halo at cuffs on fast arm moves.
* Foreground/plate lighting direction is approximate (frontal closet light on Fendi vs left key in the plate); grade compensates, a true relight does not exist in this pipeline.
* The migration is not applied to the live DB; the treatment lives in the repo JSON, not yet in `timeline_items`.

## Scaling recommendation

The lane is production-usable per shot at ≈ $0.08/s of output with a ~1-in-8 retry rate at Gate 0. Full song (≈ 190 s performance) ≈ $16–20 in xAI edits plus retries — inside the $50 cap. Before scaling: apply the migration, write the section into `timeline_items` (source ranges + output assets), move `composite_environment.py` and `assemble_section.py` behind a worker so the UI can trigger them, and get real B-roll video out of Grok Imagine (download path or API lane).

---

## Astra visual-QA loop · v1 → v2 → v3 (2026-09-21, Claude)

The section went through the completed-draft review loop (`docs/qa/ASTRA_VISUAL_QA.md`). Astra (`gpt-6-astra`, frame strips, `watched_video:false`) reviewed the real render, not metadata.

**Review #1 (`YSL_IceOn_bars24-46_v1`, $5.19): REPAIR_REQUIRED.** 44 defects, 7 blockers — every blocker was the matte: U²-Net dropped the legs at the jacket hem on dark trousers (S08/S09 body dropouts, S06 arm erosion, S11 waist cutout) and the closet leaked beside the silhouette; plus the hook room never escalated (single mirror, no glints), the S04 1.25× crop was missing, S05/S10 were performance cross-fades instead of the specified performer-free inserts, S02's macro swung through a hand, Look 1 was wide-band/centred-white (prompt error — the flat reference has ONE narrow navy stripe with a small gold SAINT LAURENT on the wearer's left, plain shoulders), wordmark scale/placement drifted, and garment construction reset across cuts. Identity 8/10 throughout. Evidence: `astra/astra_review_v1.json`, `astra/review_v1_parts/`.

**Repair → v2 (all deterministic, $0, except wardrobe):**
* Matte: `composite_environment.py` now uses **RobustVideoMatting** (MobileNetV3 ONNX, CPU ~7 fps, auto-downloaded) — a video matter with recurrent state — instead of U²-Net/isnet; the rembg path stays as `--matte rembg`. Result: no dropouts, no closet, full body every frame (`S08_matte_rvm_v2.jpg` vs `S08_matte_u2net_v1_vs_v2rembg.jpg`). The intermediate "union of two segmenters + boundary-band background prior" rewrite is kept for the record: it fixed the dropouts but passed Fendi's shadow on the door as body.
* Hook plate: new Grok Imagine still — row of angled mirror panels, blue-white rim, glints, haze (`plates_hook_v2_candidates.jpg`, #2 chosen).
* `assemble_section.py`: per-slot punch-in from the ShotSpec (`cameraMotion.description` "1.25× crop") or `renders.json` `zoom`.
* `ysl_section_fx.py`: S05 = diamond-refraction still, push + bloom, white-out into S06's flash-in; S10 = infinity-mirror corridor still with a hard 1/8-note strobe (even eighths cold push, odd eighths mirrored negative ice flash decaying to black); S02 = locked still-life macro of the trucker's chest pocket/placket (every 2 s window of the trucker shots has a hand crossing the chest — measured on the matte); S07 unchanged (`plates_inserts_candidates.jpg`, `fx_v2_S02_S05_S10.jpg`).
* Wardrobe: Look 1 re-generated with the reference-true prompt `v3c-jacket-only-reference-true` for S06/S08/S09/S12 (`look1_v3c_wardrobe_runs.jpg`; S06 is the closest garment yet: sand-beige, narrow stripe, small gold wearer-left mark, plain shoulders). S08/S12 came back with a shirt collar + epaulettes, S09 with an outer-sleeve stripe; the collar-fix re-rolls (`v3c2`) and **S11 were refused by xAI: `permission-denied — team … has used all available credits or reached its monthly spending limit`**. S11 therefore still carries the v1 (`v3-jacket-only`) garment in v2. Spend that landed: v3b $1.52 (3 runs, still wrong lettering) + v3c $1.84 (4 runs).

**Review #2 (`YSL_IceOn_bars24-46_v2`, $5.00 + $2.3 sunk on one `max_output_tokens` incomplete part): REPAIR_REQUIRED**, scores treatment 4→6, coherence 4→6, identity 8, wardrobe 3→4, environment 4→6, edit 5→7. **20 defects resolved** (all 7 blockers, the hook escalation ×3, S04 crop ×2, S05 insert ×3, S10 insert ×4, S02 hand swing, S11 waist), 25 persisting, 4 new (edge halo minor, S06→S08 garment reset across the S07 cutaway, a 1-frame cut-label offset in the review package itself, S10 strobe "unverifiable" because the 2 fps strip sampled its white eighths). Astra's answer to question 15: "structurally a real Fendi performance enhanced by AVT — not a replacement-performer montage; visually it still advertises the AI process: garment variants, malformed branding and source leaks". Escalations to Fendi: do not accept S11's different garment as an intentional third look; a native-rate audiovisual pass of S10/the drop before sign-off (the frame strip cannot certify musical timing). `astra/astra_review_v2.json` (`_diff_vs_prev` inside), `astra/review_v2_parts/`, `astra/repair_notes_v2.txt`.

**Repair → v3 (this commit; Astra re-review deferred until the wardrobe re-rolls can run):** matte v3 — RVM's own decontaminated foreground colour across the fringe (no closet bleed), alpha remapped 0.4→0.85 (smoothstep) so the half-transparent shadow/door fringe drops out, a **static-pixel peel** in the 20-px matte band (pixels that never change across the clip — hanging closet clothes, door-edge fragments RVM attaches to the silhouette — are background; removed the white fragment beside S08's shoulder without touching the jacket), 2-px keep-dilation. Two peels were tested and rejected: a colour-match peel against the temporal-median background (bit into the sand-beige shoulder where jacket ≈ door colour) and a shadow-ratio peel (bit into the shoulder and cap); both stay in the script behind `--rvm-peel` / `--shadow-spread`, off by default. Builder: samples snapped to frame pts, cut labels use the assembler's rounded cut frame. `YSL_IceOn_bars24-46_v3.mp4` assembled from `renders_v3.json` (`section_v3.assembly.json`, `section_v3_contact_sheet.jpg`).

**Still open, by owner:** `wardrobe_generation` + `temporal_propagation` — S11 re-roll, collar fixes for S08/S12, sleeve fix for S09 (xAI credit; ~$0.56 per 7 s shot) — construction will keep varying shot-to-shot until the lane is conditioned on one hero frame; `brand_repair` — no deterministic wordmark repair for moving footage exists yet (v3c lettering is gold, wearer-left, but malformed/oversized); `environment` — Astra reads the pre-hook single mirror as a dark slab (aesthetic alternatives exist → Fendi); `sync` — one-frame lip sync and musical landing are not certifiable from silent frame strips (Fendi's native-rate check). OpenAI spend on Astra so far ≈ $16 of the $30 credit (two full reviews, one incomplete part, one 504-sunk attempt).

**Full-outfit lane (added 2026-09-21 after Fendi: "the outfit swap is only placing the jacket on me and not the entire YSL outfit — it should be in AVT").** The lane replaced only the jacket by design (flat photo only, prompt keeps trousers/shoes) after the V3 prompt that described shirt/tie/trousers without their reference broke on moving footage. The outfits are composed Looks in AVT (`artist_looks.wardrobe_feature_ids`). `grok-video-edit-proxy` now accepts `lookId` → one flat reference per piece (+ on-model for the first piece under `referenceMode:"full_look"`, ≤ 4 refs) and records `look_id` / `reference_mode` on the asset; `GROK_VIDEO_EDIT_PROMPT_V4_FULL_LOOK` describes the campaign look (jacket open, striped shirt, striped tie, black pleated trousers). Not run yet: xAI limit + Fendi's choice of Looks. Expect every full-outfit run to be a fresh sample (≈ $0.56 per 7 s shot; 8 slots ≈ $4–5) and expect the trousers/shirt to add their own construction drift; the matte and the environment pipeline are unaffected (they key on the person, not the garment).

## Full-outfit pass → v5 (2026-09-21, after Fendi's xAI top-up)

**Lane:** `grok-video-edit-proxy` with `lookId` + `referenceMode: "full_look"` (redeployed by Fendi). Looks: pre-hook = *Look B — Noir Hook 2* (`7e7760e6`: trucker + Mick Long Jeans + glasses), hook = *White Ice — Full Outfit (jacket + SL trousers)* (`ce7f6350`, created for this lane). Glasses kept, not the campaign shades (Fendi).

**Pass 1 (`v4-full-look-*`, 8 runs, $3.68):** 8/8 slots landed the whole outfit with identity intact (`look1_v4_full_outfit_pass1.jpg`, `look2_v4_full_outfit_pass1.jpg`). Gate-0 fail: S04's trucker came back short-sleeved → re-rolled with a long-sleeve clause ($0.32, passed). Hook jackets came back OPEN over the shirt/tie with fold-down collars — the on-model photo shows the jacket that way. **Fendi's correction (with three ysl.com crops):** stripe on the INSIDE of the sleeves, STAND collar (navy inside, mastic outside), jacket ZIPPED like the reference. The crops were attached to the jacket feature in AVT as `detail` references (`track_detail_collar_zip.jpg`, `track_detail_sleeve_inside_flat.jpg`); the proxy's hero-piece reference count had to change in code for them to reach xAI (one redeploy) — and that is the structural bug Fendi called out: **reference policy must be data**. Fixed in this PR: `referencePolicy` on the request / `reference_policy` in the Look recipe, code keeps only the provider cap.

**Pass 2 (`v4b`, 5 hook runs, $2.40):** S06 matched the reference in one roll (zipped, stand collar, shirt + tie at the neck, gold mark wearer-left); S08/S09/S11/S12 still came back open. **Pass 3 (`v4c`, 4 runs, $1.84):** the construction facts moved to the FIRST sentence of the prompt ("THE JACKET IS ZIPPED CLOSED. Its collar STANDS UP. Its sleeves are PLAIN on the outside.") — 4/4 landed (`look1_v4b_details_pass.jpg`, `look1_v4c_zipped_first_pass.jpg`). Lesson for the prompt registry: construction constraints go first, garment poetry after. Remaining drift: S08's sleeves render lighter than its body; S01's trucker is a lighter grey wash than S03/S04.

**v5** = pass-1 pre-hook (S01/S03/S04b) + v4b S06 + v4c S08/S09/S11/S12, matte v3, B-roll from the new generic `render_broll_slots.py` (`broll_recipes.json`), same plates/assembly (`section_v5.assembly.json`, `section_v5_contact_sheet.jpg`). xAI this round: $8.24. Astra review #3 on v5 with the v2 defect list: see `astra/astra_review_v5.json`.

**Review #3 (`YSL_IceOn_bars24-46_v5`, $5.28 + ≈$2.3 sunk on one incomplete transitions part): REPAIR_REQUIRED**, scores treatment 6→5, coherence 6→5, identity 8, wardrobe 4→3, environment 6→5, edit 7→6. Astra marked **nothing resolved** from v2: all 29 defects re-reported as "PRESENT, changed manifestation" (the outfit is on him, but every shot is still a different approximation — cuffs, collar depth, hem, sleeve tone, lettering shapes), plus four new: `S08-HEM-CONSTRUCTION-DRIFT` (waistband seam appears/disappears within the shot), `SEQ-MATTE-FOREGROUND-EROSION` (S11/S12 34.6–41.8 s; Claude's frame check `section_v5_S11_S12_matte_check.jpg` shows a pale shoulder halo at 36.5–37.0 s and a blurred hand at 41.5 s, no face loss at 1080p — disputed at native resolution, listed for Fendi), and two verification gates (S05 flash peak, S11 glitch) that a 2–12 fps strip cannot certify. Escalations: full-motion authenticity approval by Fendi after garment/matte correction; musical timing only from the audible native export.

**Where the loop stands (honest):** the deterministic subsystems have converged — matte dropouts and closet leaks are gone (blockers 7 → 0), the hook room, inserts, crop and macro are on treatment. What Astra keeps failing is **product truth on moving footage**: each xAI edit is an independent sample, so construction and lettering vary shot to shot no matter how the prompt is ordered (v4 → v4b → v4c improved the hit rate from 1/5 to 4/4 on the zip/collar/sleeve facts, but cuffs, hem and typography still drift). That ceiling is the generator's, not the pipeline's. The lever that changes it is the one the still-repair lane already argues for: **condition every shot on one approved hero frame per Look** (still-first, then propagate), plus a deterministic wordmark repair for moving footage. Matte: the remaining halo is the performer's shadow on the door, which every segmenter reads as body; a shadow-aware refinement (trimap + colour model, or RVM at a higher downsample ratio) is the next matte task. Spend: xAI $16.40 total this takeover, OpenAI ≈ $24 of the $30 credit.

## Ruling round (2026-09-21, after Astra #3) — mechanisms changed at $0

ChatGPT's ruling (`docs/VIDEO_LANE_CHATGPT_YSL_V5_RULING_2026-09-21.md`): stop buying re-rolls and reviews; change the mechanism. What changed, with evidence in this folder:

| Ruling | Mechanism | Evidence |
|---|---|---|
| §4 deterministic moving-brand repair | `scripts/edit/garment_graphic_track.py` on S08 v4c: the band segment with the wordmark cropped from the product photo (`track_flat`), anchored on frame 30, tracked with the affine model, colour-matched once to the anchor plane, shaded by the footage, occluded by the crossing arm. QA: confidence mean 0.93 / min 0.39, corner jitter 1.3 px mean / 2.7 px p95, 0 frames lost, 0 frames dropped, occlusion mean 5 %. | `S08_wordmark_track_qa_sheet.jpg`, `S08_wordmark_track.json`; side-by-side clip sent to Fendi in chat |
| §5 shadow-aware matte | `composite_environment.py --refine shadow` on S11/S12/S08 (`env6/`): the door halo along the shoulders goes, cap/face/glasses edges unchanged (no erosion). | `section_v5_S11_matte_shadow_aware_edges.jpg` (source · v5 matte · shadow-aware, four edge crops at 2×); `section_v5_S08_matte_shadow_aware_edges.jpg` — on S08 the waist-side leak Astra called `HOOK-SOURCE-LEAK` is essentially unchanged: it sits inside RVM's confident core, which the refinement never touches by design, so it is a segmentation error for the propagation/hero lane to remove, not a band problem |
| §6 B-roll deterministic | `render_broll_slots.py --plan` wrote the four recipes into the ShotSpecs; render from the recorded recipes is decoded-md5-identical to the v5 B-roll. | `docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json` (`generation.parameters.broll`) |
| §3 Look truth hierarchy | Both Looks carry `hero_feature_id`, `reference_policy`, `constraints`, `spec` as data; the proxy composes constraints first and the spec last; provider ceiling in `_shared/providerCapabilities.ts`. | proxy dry run after Fendi's redeploy will show `referencePlan` / `promptComposition` |
| §2 canonical Look | Contract verified documentarily: no first-frame conditioning on `/videos/edits`. Propagation lane designed for $0 execution on the v5 edits. | `docs/CANONICAL_LOOK_PROPAGATION_DESIGN_2026-09-21.md` |
| §7 Astra boundary | Builder states what silent sampled frames cannot certify; aggregator lists `_native_media_qa_required`. | `scripts/qa/build_astra_review_package.py` (`UNOBSERVABLE`, `EVIDENCE_BOUNDARY`) |

Known limit of the brand layer today: the generator drew the S08 band longer than the true garment, so a stub of its lettering survives to the right of the patch in a few frames — the layer covers the plane anchored on the reference geometry and reports the rest; the fix for that stub is the garment (canonical-Look propagation), not a bigger patch. No new xAI or OpenAI spend this round. Astra #4 held.

## Propagation test (2026-09-21, $0) — S06, one hero → real footage

`scripts/edit/propagate_keyframe.py`. One hero (S06 edit f72) carried across the master by chained dense flow: within ±8 frames the garment is one realisation (78 % of the garment carried within ±10 frames, occluded 4 %), flicker 10 % lower than the xAI edit, generator drift measured at 19/255 near the hero and 36/255 across the shot. Reach at ≥ 80 % coverage: 6 frames back, 3 forward → re-anchor cadence ≈ 12–16 frames on this dance footage; DIS chained, DIS direct and RAFT-small direct all fall off at the same rate, so the motion is the limiter, not the flow engine. Seven heroes at a 24-frame cadence cover 64 % with flicker 25 % lower than the edit but visible switches (they are seven different samples). Full numbers: `S06_propagation_single_hero_qa.json`, `S06_propagation_7_heroes_qa.json`; frames: `S06_propagation_qa_sheet.jpg`; design and cost reasoning: `docs/CANONICAL_LOOK_PROPAGATION_DESIGN_2026-09-21.md` §5. Verdict against the locked kill criterion: viable at a 12–16-frame cadence with heroes that share one realisation (E2), not viable with one hero per shot.

Also this round: the redeployed `grok-video-edit-proxy` verified by dry run — reads the Looks' `constraints` (composed first), `spec` (composed last), `reference_policy`, `hero_feature_id`; reference plan = on-model, flat, two detail crops (4 refs). One data/code mismatch found and fixed: a `detail` crop whose label contained "worn" was promoted to on-model by the label heuristic — an explicit `angle` is now authoritative in both copies of the reference sorter.

## Canonical-Look round → v6 (2026-09-21, ≈ $6.3 of the $50 testing budget)

**E2 (hero stills, $1.68).** 14 scene frames of S06 → `grok-image-garment-proxy` with the approved anchor (S11 v4c f80) as `<IMAGE_1>` + one flat product reference. Provider limit found and pinned: `xai:images/edits` accepts at most 3 input images (5 → HTTP 400, unbilled). The stills share the anchor's realisation (`S06_hero_stills_qa.json`, `S06_hero_stills_sheet.jpg`: anchor similarity flat across stills) but the generator moves arms/hands relative to the scene frame, so a still cannot be pasted back as a pose-locked hero; `propagate_keyframe.py --hero-stills` (silhouette intersection + head exclusion) removes the ghosts but the moved-arm frames remain unusable. E2 is kept as tooling, not as the production path.

**E1 (anchor as the Look's outfit sheet, ≈ $4.6).** Setting the approved Look-on-artist frame as `outfit_sheet_path` on the Look row — data only, the deployed proxy already sends the outfit sheet first with the "approved realisation" sentence — makes `/videos/edits` reproduce that realisation across shots. All 8 performance slots re-rolled: hook S06/S08/S09/S11/S12 on the S11 anchor, pre-hook S01/S03/S04 on the S04 v4b f60 anchor (`look_e1_anchored_S01_S03_S09.jpg`). One retry (S09: first anchored roll grew a hood and a vertical placket stripe; `v4c-anchor-e1b` adds one negative sentence for the crossed-arm pose). Residual deviation: S09's folded forearms show a sleeve stripe on the visible side.

**Brand layer + matte + assembly.** `garment_graphic_track.py` gained multi-anchor ownership, a quad shape gate (collapsed fits lose the frame) and the island stray-mark eraser (the generator's extra "SAINT LAURENT" glyphs above the band are inpainted; the tie, hands and the real stripe are untouched because they touch the band edge). Applied to S06 (2 anchors), S08, S09, S11, S12 (3 anchors + eraser; `S12_wordmark_track_qa_sheet.jpg`, `S09_wordmark_track_qa_sheet.jpg`). All eight slots composited with `--refine shadow`; B-roll rendered from the recorded plan against the v6 renders (`renders_v6.json`); `section_v6.assembly.json`, `section_v6_vs_v5_contact_sheet.jpg`. v6 = 43.279 s, 1080×1920 @ 24, album audio, sent to Fendi as a 720p preview.

**What v6 changes for the loop.** The garment is now one realisation per Look across cuts (the defect class Astra #3 flagged as generator-bound). Not yet re-reviewed: Astra #4 needs Fendi's OpenAI top-up (≈ $5–7 for a targeted shot review, inside the $50).
