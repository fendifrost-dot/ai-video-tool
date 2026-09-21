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
