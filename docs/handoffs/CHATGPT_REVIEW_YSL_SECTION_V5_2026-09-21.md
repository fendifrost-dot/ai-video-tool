# CLAUDE → ChatGPT · review handoff · YSL Real Video #1 section v5

**Date:** 2026-09-21 · **Author:** Claude (full takeover of the video lane) · **Requested by:** Fendi ("put a handoff together for ChatGPT to review") · **Repo state:** `main` @ `7dde6fe` (PR #153 merged + one follow-up commit) · **Nothing in this handoff needs a paid call to review.**

> Convention reminder: `docs/handoffs/CLAUDE_LATEST.md` is always Claude's most recent general handoff (rev 21 as of this document). This file is the review-specific brief for ChatGPT. Astra (GPT-6 Astra via the API) is the automated visual reviewer inside the loop; ChatGPT in chat is the design/architecture reviewer. This document is for the latter.

---

## 1. What you are being asked to review

Fendi's mandate is one 30–60 s release-intent section of the real YSL video (bars 24–46, song 47.213–90.492 s): his real performance as the visual spine, the YSL wardrobe actually on him, environment/B-roll/FX around it, a real timeline and export, and a QA loop that runs until the section passes. Everything is on `main` and everything is generalized (Fendi, 2026-09-21: "any code changes need to be applied mechanistically so they work for future video builds — no patches or hard coding specifically for this project").

Five things are up for review, in priority order:

1. **The loop's verdict and where the ceiling actually is.** Three Astra reviews (v1 → v2 → v5) and the verdict is still `REPAIR_REQUIRED`. Blockers went 7 → 0 → 0, but product truth (garment construction and wordmark typography) has not moved because each xAI edit is an independent sample. Section 4 has the evidence; section 6 has the design questions that decide the next move.
2. **The full-outfit lane design** (`grok-video-edit-proxy` Look expansion + reference policy as data). Section 3.1. Is this the right shape for a tool that will run many artists and many Looks?
3. **The generalized B-roll renderer and the templated Astra package builder.** Section 3.2–3.3. Anything still project-shaped that I missed?
4. **Astra's own escalations** (section 5) and whether the loop's escalation rules are being applied honestly.
5. **The spend and the stop rule.** No scale-up to the full song until the section survives the loop; section 7.

---

## 2. Where the section stands (facts, not claims)

| Item | State |
|---|---|
| Draft | `YSL_IceOn_bars24-46_v5` — 1080×1920 @ 24 fps, 43.28 s, album-master audio. Master lives in the sandbox (`ysl/out/`); a 720p preview was sent to Fendi in chat. Contact sheet: `docs/research/results/2026-09-20-ysl-real-video-1/section_v5_contact_sheet.jpg`. |
| Performance slots | 8 (S01, S03, S04, S06, S08, S09, S11, S12). All 8 carry the **whole outfit**, not just the jacket. Pre-hook Look = `artist_looks` `7e7760e6` "Look B — Noir Hook 2" (YSL trucker + Mick Long Jeans + glasses). Hook Look = `ce7f6350` "White Ice — Full Outfit" (Saint Laurent track jacket + SL trousers). |
| B-roll / FX slots | 4 (S02 macro, S05 diamond flash, S07 city lateral push, S10 corridor strobe), all rendered by `scripts/edit/render_broll_slots.py` from `broll_recipes.json`, all on the song clock. |
| Sync | `song = master + 0.8538 s` (GCC-PHAT, 23/30 windows), 122.00 BPM measured. Unchanged since rev 19. |
| Matte / environment | RobustVideoMatting (ONNX, CPU) with fgr decontamination at the edge, alpha smoothstep remap 0.4 → 0.85, static-pixel peel in a 20 px band. Two further peels (colour-match, shadow-ratio) were tried and **rejected** because they bit into the beige shoulder and cap; they are behind flags and off. |
| Astra #3 (on v5) | `REPAIR_REQUIRED`. Scores treatment 5 / coherence 5 / identity 8 / wardrobe 3 / environment 5 / edit 6. 33 defects, 0 blockers, 24 major, 2 minor, 7 notes. 0 resolved vs v2 by defect id, 29 persisting (most tagged "changed manifestation"), 4 new. Full aggregate: `astra/astra_review_v5.json`; raw parts: `astra/review_v5_parts/`. |
| Spend this takeover | xAI $16.40 (32 billed edits). OpenAI ≈ $24 of the $30 Fendi loaded (three full reviews $5.19 / $5.00 / $5.28, two `max_output_tokens` incompletes ≈ $2.3 each, one gateway 504 ≈ $3.5). ≈ $6 OpenAI remains — not enough for a fourth review. |
| Deploy state | The deployed `grok-video-edit-proxy` still has the reference count as a constant. The policy-as-data version is on `main` and needs **one** redeploy; after that, wardrobe/Look/reference changes flow through AVT with no deploy. |

---

## 3. What changed in PR #153 (design review targets)

### 3.1 Full-outfit lane — `supabase/functions/grok-video-edit-proxy/index.ts`

The problem Fendi named: "the outfit swap is only placing the jacket on me and not the entire YSL outfit… it should be in AVT." Outfits already exist in AVT as composed Looks (`artist_looks.composition_recipe_json.wardrobe_feature_ids`), but the video lane only ever sent one flat photo of one piece.

What the proxy does now:

- Request body accepts `lookId`, `referenceMode: "flat" | "full_look"`, and `referencePolicy: { primaryPieceRefs, otherPieceRefs, maxRefs }`.
- Under `full_look` the proxy loads the Look, checks `wardrobeFeatureId` is one of its pieces (the "hero" piece), and builds one reference set per piece: the hero piece gets up to `primaryPieceRefs` images (on-model, flat, and `detail` angle crops — Fendi's ysl.com collar/zip and inside-sleeve crops are attached to the jacket feature as `detail` refs), other pieces get `otherPieceRefs` (their flat ref; the SL trousers piece has only an on-model image, which is the same campaign shot already sent for the jacket, so it resolves to no extra reference).
- Precedence: request `referencePolicy` > Look recipe `reference_policy` > `DEFAULT_REFERENCE_POLICY` (4 / 1 / 5). Code keeps only the provider ceiling `ABSOLUTE_MAX_REFERENCES = 8`.
- The plan records `lookPieces`, `referenceMode`, `lookId`; `project_assets.metadata_json` records `reference_mode` and `look_id` (via `_shared/grokVideoEditRequest.ts`).
- Auth unchanged: user JWT, project ownership check, fail-closed cost gate. Nothing widened.

Prompts (`src/lib/heroFrame/grokVideoEditPrompt.ts`): `V4_FULL_LOOK`, `V4_FULL_LOOK_TRUCKER` (long-sleeve clause after S04 came back short-sleeved), `V4B_FULL_LOOK` (stand collar navy-inside/mastic-outside, zipped, stripe on the inside of the sleeves, glasses not shades). The winning runtime prompt for the hook, "v4c", is the V4B text with the three construction constraints stated first ("THE JACKET IS ZIPPED CLOSED. Its collar STANDS UP. Its sleeves are PLAIN on the outside."). Hit rate went 1/5 → 4/4 on the hook slots. v4c is not yet its own registry constant — **that is a known gap**; it should be `GROK_VIDEO_EDIT_PROMPT_V4C_FULL_LOOK` before anyone reuses it.

**Questions for you:** (a) Is per-piece reference expansion the right unit, or should a Look carry one composed "outfit sheet" image as its primary reference with per-piece refs as secondary? (b) Should `reference_policy` live on the Look recipe by default (per outfit) or on the artist? (c) Is a hard 8-reference ceiling in code acceptable as the only constant, or should even that be a provider-capabilities row?

### 3.2 B-roll renderer — `scripts/edit/render_broll_slots.py` (replaces `ysl_section_fx.py`, deleted)

Data-driven and section-agnostic. For every non-performance ShotSpec it renders exactly one slot (+0.1 s pad; the assembler trims to the frame budget). The recipe is inferred from the ShotSpec (`fx` types/descriptions and `cameraMotion.type`) unless the recipes JSON names one; sources (plates, or a performance render for `render_macro`) come from `broll_recipes.json`; bpm from `spec.section.bpm`, sync from `spec.sync`. A missing recipe **fails closed** — the renderer never invents filler for a slot. Recipes: `still_push`, `still_push_flash`, `still_lateral_push`, `still_strobe`, `render_macro`.

**Questions for you:** Is the inference table (flash/white → `still_push_flash`, glitch/strobe → `still_strobe`, pan/lateral/truck → `still_lateral_push`) the right default surface, or should recipe selection be explicit-only so nothing surprising happens on an unfamiliar treatment?

### 3.3 Astra package builder — `scripts/qa/build_astra_review_package.py`

The reviewer prompt is now templated on a `treatment` block in the ShotSpecs (`artistName`, `authority`, `brand`, `creativeDirection`, `sourceEnvironment`, with neutral fallbacks), so the 15 standing questions and the role text contain nothing YSL- or Fendi-specific by construction. Also: an OUTPUT BUDGET clause on every part (two `max_output_tokens` incompletes cost ≈ $4.6 before this), frame-snapped cut labels (`snap(t)` to frame pts — fixed the one-frame label offset Astra flagged in v2), `--prev-review` (defect identity survives revisions) and `--repair-notes` (claims for Astra to verify, not facts).

`docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json` and `scripts/seed-ysl-section-treatment.ts` carry the block for this section.

### 3.4 Aggregator — `scripts/qa/aggregate_astra_review.py` (merged in #152, used for #3)

Per-part results → `AstraReviewSchema` shape, defects merged by `defect_id` (highest severity wins), `_provenance` (cost, usage, response ids), `_diff_vs_prev` (resolved / persisting / introduced). `watched_video` is `false` and stays honest: the API accepts text + images only, so Astra reviews frame strips (3 fps shots, 12 fps ±0.25 s at cuts, 2 fps sequence).

---

## 4. The loop, honestly

| Rev | Verdict | Scores (treat/coh/id/ward/env/edit) | Defects | Cost | Repair that followed |
|---|---|---|---|---|---|
| v1 | REPAIR_REQUIRED | 4/4/8/3/4/5 | 44, 7 blockers (all matte) | $5.19 | RVM matte, new hook plate, S04 crop, S05/S10/S02 inserts, reference-true jacket prompt |
| v2 | REPAIR_REQUIRED | 6/6/8/4/6/7 | 29, 0 blockers, 20 resolved | $5.00 + $2.3 | matte v3, label snap; wardrobe re-rolls blocked on xAI credit |
| v5 | REPAIR_REQUIRED | 5/5/8/3/5/6 | 33, 0 blockers, 0 resolved, 4 new | $5.28 + $2.3 | full-outfit pass (this PR) |

Why v5 scored slightly below v2 despite the outfit being right on every slot: Astra holds a zero-deviation garment standard and now has more garment to judge. Its summary, verbatim in the aggregate: "Fendi and the two-look structure remain legible, but product fidelity, outfit continuity and moving composites still fail." It marked S12 wordmark scale resolved in substance and S10 corridor visibility repaired, and it explicitly refused to certify S07 cut timing or any musical timing from a silent strip.

Defects by owner (33): `compositing_mask` 9, `wardrobe_generation` 6, `temporal_propagation` 4, `brand_repair` 4, `sync` 4, `edit_fx` 3, `environment` 1, `broll` 1, `source_range` 1. The four new ones: `S08-HEM-CONSTRUCTION-DRIFT` (waistband appears and disappears within the shot), `SEQ-MATTE-FOREGROUND-EROSION` (v3 matte now erodes garment boundaries and locally part of the face on S11/S12 — this is the cost of the peels; see `section_v5_S11_S12_matte_check.jpg`), `S05-FLASH-PEAK-UNVERIFIED` and `S11-GLITCH-UNVERIFIED` (sampling gates, not failures).

My read of the ceiling, which you should check rather than accept: the three owners that will not move with more re-rolls are `wardrobe_generation`, `temporal_propagation` and `brand_repair`, because `/v1/videos/edits` produces an independent sample per cut. Prompt constraints raised the hit rate on the named facts (zipped, collar, sleeves) but cuffs, hem, pocket hardware and letterforms still vary per sample, and there is no deterministic wordmark repair on moving footage yet. `compositing_mask` can still move (shadow-aware refinement is the next matte step), and the `sync` items need a native-rate, audible pass that no frame strip can give.

---

## 5. Astra's escalations to Fendi (routed, not resolved)

1. "After garment and matte correction, request Fendi's full-motion authenticity approval: S08@00:24.250 and S11@00:36.250 currently let extraction and fabricated branding compete with his performance."
2. "Do not approve musical timing from this strip. Review the audible native-frame export, especially the drop, S10/S11 transition and final hard out."

Carried over from #2 and still open: whether S11's look is an intentional third look (it is not — it is the hook Look with a different sample), and whether the pre-hook single-mirror plate reads as a slab (aesthetic; Astra now calls it `SEQ-MIRROR-PROGRESSION-MISSING`, major, owner `environment`).

Fendi has the v5 preview and has been asked to rule at native rate.

---

## 6. Design questions for you (these decide the next round)

1. **Hero-frame-conditioned Look propagation.** The proposal: generate one approved still per Look (image edit with references — the grok.com Build experiment on 2026-09-04 got closest to zero-deviation construction in one pass, but as a regeneration of Fendi, which fails the product lane), then condition every `/videos/edits` call on that frame so all cuts share one garment sample. Open question I cannot answer from the docs: does xAI's video edit endpoint accept a first-frame or image conditioning reference alongside the source video, and if not, is there a provider that does without regenerating the performer?
2. **Deterministic wordmark repair on moving footage.** The still-repair `logoComposite` chain (Architecture C, stages 1b–1l) never cleared its chest gate on a still (10/11 at 1l, C9-right). Is it worth tracking onto video for `brand_repair`, or should the wordmark be treated as generation debt until the generator improves? Astra's list of break intervals is in the answer to Q4 of the aggregate.
3. **Matte direction.** RVM plus peels has traded closet leaks for foreground erosion. Options on the table: shadow-aware refinement (model the door shadow explicitly rather than peeling static pixels), a second matting model ensembled with RVM, or accepting a soft halo and fixing it in the grade. Which would you rank first, given the source is a closet with a white door and a hard shadow?
4. **Stop rule.** The section has now had three reviews at ≈ $5–7 each and the generator-bound owners have not moved. Should the fourth review wait until at least one of (1)–(3) lands, or is a cheaper partial review (shots part only, ≈ $1.5) on a targeted re-roll justified? My position: wait.

---

## 7. Guardrails and what was not touched

Not edited: `fendi-control-center`, `grok-video-research-proxy` auth, any RLS/auth/security policy, PR #37, Product OS / Architecture C still-repair lane. No migrations added (migration `20260920120000` from PR #148 is still unapplied live — Fendi's item). No new xAI or OpenAI spend since Astra #3. Not scaling to the full song.

---

## 8. Files to read, in order

1. `docs/handoffs/CLAUDE_LATEST.md` — rev 21, the full state paragraph and open-items table.
2. `docs/research/results/2026-09-20-ysl-real-video-1/YSL_REAL_VIDEO_1_SECTION_BARS24-46_RESULT_2026-09-21.md` — §Astra visual-QA loop, §Full-outfit pass → v5, §Review #3.
3. `docs/research/results/2026-09-20-ysl-real-video-1/astra/astra_review_v5.json` — the aggregate with `_diff_vs_prev`; `review_v5_parts/` for the raw parts; `repair_notes_v5.txt` for the claims Astra was asked to verify; `pkg_v5_manifest.json` for exactly what it saw.
4. `docs/research/results/2026-09-20-ysl-real-video-1/section_v5_contact_sheet.jpg`, `look1_v4c_zipped_first_pass.jpg`, `look1_v4b_details_pass.jpg`, `look2_v4_full_outfit_pass1.jpg`, `section_v5_S11_S12_matte_check.jpg`, `track_detail_collar_zip.jpg`, `track_detail_sleeve_inside_flat.jpg`.
5. `docs/qa/ASTRA_VISUAL_QA.md` — the loop, routing table, escalation rules, loop log, "nothing project-specific" section.
6. Code: `supabase/functions/grok-video-edit-proxy/index.ts`, `src/lib/heroFrame/grokVideoEditPrompt.ts`, `scripts/edit/render_broll_slots.py`, `scripts/edit/composite_environment.py`, `scripts/edit/assemble_section.py`, `scripts/qa/build_astra_review_package.py`, `scripts/qa/aggregate_astra_review.py`.

## 9. What a reply should contain

Rulings on 6.1–6.4, any design objections to 3.1–3.3, and anything in the PR you consider still project-shaped. If you disagree with my reading of the ceiling in section 4, say which owner you think can still move with the current generator and why. Code changes you recommend go to Cursor or back to Claude via `CLAUDE_LATEST.md` as usual; nothing in this handoff should be built on until Fendi rules on the section 5 items and redeploys the proxy.
