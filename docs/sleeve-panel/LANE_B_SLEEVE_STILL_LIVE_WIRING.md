# Lane B — Architecture C sleeve still live wiring

**Work-order:** [#81](https://github.com/fendifrost-dot/ai-video-tool/issues/81) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Lineage [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) / [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54).  
**Class:** C (rendering / compositing).  
**Status:** **READY** for $0 live sleeve re-verify after Lovable **Edge Functions → redeploy** of `architecture-c-still-repair-proxy` only.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## Stage 1a live (historical)

Asset `fde270bf-63f2-44ff-a76b-4129a0248708`, `architecture_c_sleeve_still_1a`, **NOT CLEARED 5/6**. FAIL #6: cream/white fill (left luma 202→227, right 134→226). Evidence: PR #80.

**[H → now coded]** `DEFAULT_FLAT_SLEEVE_SOURCE_BBOX = [0.05, 0.35, 0.12, 0.35]` sampled cream/white on the SL flat. 1b resolves navy-ward.

---

## What 1b changes

| Surface | Change |
|---------|--------|
| `src/lib/sleevePanel/navyFill.ts` | Navy-majority crop warps as-is; cream crop searches a vertical navy strip; else median product navy fill |
| `src/lib/sleevePanel/repair.ts` | Uses `resolveNavyPanelSource` — never pastes cream/white as panel truth |
| `src/lib/sleevePanel/liveStill.ts` | `architecture_c_sleeve_still_1b` + `navy_fill_mode` |
| `supabase/functions/_shared/sleevePanel/**` | Edge mirror (incl. `navyFill.ts`) |
| `compositeSleevePanelsOntoStill` | Passes navy-fill metadata. **Does not** call logoComposite |
| Hero Frame §7 | Sleeve `stillAssetId` is CLEARED `9ed83c01` even though the chest picker disables it |

**Not touched:** `logoComposite.ts` C2/C4/C6/C9 1m locks, Control Center, proxy auth, PR #37, V3 / paid Grok, temporal tracking.

---

## Expected metadata (sleeve output)

| Field | Value |
|-------|--------|
| `repair_stage` | `sleeve_panel` |
| `repair.repair_method_version` | `architecture_c_sleeve_still_1b` |
| `repair.contract_version` | `1.0.0` |
| `repair.claim` | `visible_geometry_only` |
| `repair.geometry_note` | `visible_upper_arm_only` |
| `repair.hidden_shoulder_to_cuff_validated` | `false` |
| `repair.consumed_chest_output` | `true` when a chest reserved quad/slot was applied |
| `repair.navy_fill_mode` | `warp` \| `median_navy` \| `mixed` |
| `repair.keyframe_id` | `v2-still-0.785` |
| `temporal_tracking_enabled` | `false` |

Chest outputs stay `architecture_c_still_repair_1m`. Do not bump the chest version.

---

## Why `9ed83c01` is UI-disabled (and why that is correct)

**[VERIFIED]** The chest still `<select>` disables any asset with `repair_stage` `logo_chest` or `sleeve_panel`. That is the **logo_chest chaining lock** (defect register §3.4): after stage 1 the selector used to auto-switch to the output, so a re-run painted an already-repaired still.

`9ed83c01` is a `logo_chest` repair output, so it **must** stay disabled in that picker. Selecting it as the chest input would break the chest gate.

**[DECISION]** Sleeve source is a **separate** resolver (`resolvePreferredSleeveStillSource`). It sends `stillAssetId=9ed83c01` (canonical CLEARED 1m) even when the picker cannot select it. In-session chest output, if present, wins. The clean still `2aa1a44c` is fallback only.

Stage 1a live used `2aa1a44c` because the published runner fell through to the selected clean still. 1b does not require selecting a repair output.

---

## Hero Frame click path (canonical $0 re-verify)

Project: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`

1. Sign in as the durable owner (`3ca10935-…`).
2. Open **7 · Architecture C — still-first deterministic repair**.
3. Keep garment `0feb028f-…` and clip t=`0.785`.
4. Leave the chest still picker on clean `2aa1a44c`. **Do not** try to select `9ed83c01` there (it stays disabled — chest chaining lock). Sleeve button sends `9ed83c01` automatically after frontend Publish of this PR. Until Publish: POST `stage=sleeve_panel` with `stillAssetId=9ed83c01-…` from a signed-in owner session.
5. Enter **visible upper-arm** quads (numeric). **Do not** use the old face-high placeholders (y≈0.36–0.50).

| Side | TL | TR | BR | BL |
|------|----|----|----|----|
| Left | 0.030, 0.500 | 0.260, 0.505 | 0.250, 0.615 | 0.030, 0.610 |
| Right | 0.880, 0.505 | 0.990, 0.500 | 0.990, 0.615 | 0.880, 0.610 |

6. Click **2 · Repair sleeve_panel (manual, upper arm)**.
7. Accept only if `repair.repair_method_version === architecture_c_sleeve_still_1b` and `hidden_shoulder_to_cuff_validated === false`.
8. Score with `lane-b-sleeve-live-v1` (same 6-pt table as 1a). Criterion 6 must be navy-ward (mean luma drop, navy-like pixels).
9. **HARD STOP.** Do not enable temporal tracking.

A shoulder→cuff / face-high quad must return HTTP **400** `sleeve_panel_geometry_rejected` (not a saved pass).

---

## Deploy

Redeploy **only** `architecture-c-still-repair-proxy`.

- **Required** for live `architecture_c_sleeve_still_1b` + navy-ward fill.
- Frontend Publish is **optional for paint** (edge owns fill) but **required** for the `9ed83c01` sleeve-source resolver in the product UI. Until Publish, POST with `stillAssetId=9ed83c01`.
- No V3. No paid Grok. No Control Center. No auth widen.

---

## READY / BLOCKED

**READY** for $0 live sleeve re-verify after that edge redeploy.

This cloud VM has no `AVT_USER_ACCESS_TOKEN`. Anon POST remains 401 (auth not widened). Live click / owner JWT is the verify plane — same as chest 1m / sleeve 1a.

**[VERIFIED]** Isolated fixtures: cream 1a-default bbox paints navy, not cream; hidden reject; chest reserved untouched; C5/C11 windows byte-identical on a 720×1280 synthetic with DEFAULT bbox; 6-pt gate CLEARED on that synthetic; src/_shared fingerprint parity.

**[VERIFIED]** Existing Architecture C Stage 1m chest goldens are not edited.

**Not claimed:** live pixels on `9ed83c01` after this PR (needs edge redeploy + owner session). 1a live `fde270bf` remains NOT CLEARED 5/6.
