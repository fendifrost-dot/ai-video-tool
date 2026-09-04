# Architecture C — Post-deploy still-first verification + V3 I/J (Cursor)

**Date:** 2026-09-04 · **Author:** Cursor · **Spend:** $0 · total **$12.80 / $20**
**Deployed code under score:** `8ebfe830b799d4cd56244ea40b6336d5dae381fb`
**Corrections land:** this PR tip (pre-redeploy) · **edge redeploy: required**

Evidence labels: **[V]** verified · **[O]** observed · **[D]** decision · **[R]** recommendation

## Live stage-1 output (deployed `8ebfe83`) [V]

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Clean still (input) | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Keyframe | `v2-still-0.785` · `frame_time_sec: 0.785` |
| Measured band quad | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| Stage-1c output asset | `f7c7b524-2f87-4c87-9624-85368de26f2d` |
| Lineage | `parent_asset_id` = clean still; `source_still_asset_id` same; `repair_stage: logo_chest` |
| Proxy hit | Confirmed by behaviour: `target_quad` = logo **sub-quad** (wearer's-left), not full band |
| Temporal | `temporal_tracking_enabled: false` |

No prior repaired still was used as input. Product lane only. No xAI spend.

## Defect scorecard vs flat product reference [V]

| Item | Verdict | Notes |
|------|---------|--------|
| Wordmark position | **PASS** | Wearer's-left segment, not zipper-centred |
| Wordmark scale | **PASS** | ≈ ½ band height (`target_height_px` ≈ 34.8 vs prior 71) |
| Chest-band continuity | **FAIL** | Column-follow navy drips ~52 px below band; cream sleeve leak |
| Zip continuity | **PARTIAL** | Mid strip preserved as raw slit, not continuous zip through navy |
| Shading | **FAIL** | Per-pixel luma ghosts old lettering/pinstripe; sticker blotches |
| Hand occlusion | **FAIL** | Skin heuristic partial; cannot protect cream sleeve / crossed arm |

**SAM-3 escalation required?** **YES** — interim skin heuristic insufficient → `outfit − dilate(hands) − dilate(face)`.
**Chest stage strong enough for `sleeve_panel`?** **NO** — hard stop.
**Band leak class [O]:** primarily **compositing expansion** (column-follow), not the measured quad itself; shading failure is separate (high-frequency luma path).

## Corrections landed (awaiting ChatGPT authorize + edge redeploy) [D]

Code addresses Stage-1C items 1–6 on branch tip:
- low-frequency defect-masked shading + gain clamp
- quad-only / band-normal expansion (`fillMode: "quad"`)
- feathered zip overlay (`zipUNorm`)
- **SAM-3 complete-mask occlusion** (outfit + hands + face required; `occlusion_source: "sam3"` only when all succeed)
- requested vs effective band metadata
- golden structural fixture on still `2aa1a44c` + measured quad

Canonical `logo_chest` / Stage-1D is **fail-closed**: incomplete/unavailable SAM-3 → HTTP 422 `occlusion_unavailable`, **no** project_assets insert. Skin heuristic remains available only when the caller explicitly sets `allowSkinHeuristicFallback: true` (not the Stage-1D default).

After Lovable edge redeploy of `architecture-c-still-repair-proxy`, Claude re-runs stage 1d on the same clean still/quad.

## V3 I/J maintenance [V]

- Inactive `GROK_VIDEO_EDIT_PROMPT_V3` updated with mastic welt pockets + mastic cuffs + navy panels stop above cuff
- Collar/zip V3 clauses unchanged
- V1/V2 history preserved; **active = V2**; tests prove inactive + no paid-run gate

## Confirmation

**V2 active · V3 inactive · spend $0 · temporal off · no sleeve · no V3 paid run**
