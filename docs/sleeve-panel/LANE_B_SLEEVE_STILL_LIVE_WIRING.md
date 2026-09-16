# Lane B — Architecture C sleeve still live wiring

**Work-order:** [#84](https://github.com/fendifrost-dot/ai-video-tool/issues/84) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Lineage [#81](https://github.com/fendifrost-dot/ai-video-tool/issues/81) / [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) / [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54).  
**Class:** C (rendering / compositing).  
**Status:** Live 1c `fdb86b18` **CLEARED 6/6**. Live 1a / 1b remain historical **NOT CLEARED 5/6**. Temporal stays disarmed until parent arms.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## Stage 1a live (historical)

Asset `fde270bf-63f2-44ff-a76b-4129a0248708`, `architecture_c_sleeve_still_1a`, **NOT CLEARED 5/6**. FAIL #6: cream/white fill (left luma 202→227, right 134→226). Evidence: PR #80.

## Stage 1b live (historical)

Asset `a4dc7f47-a08d-46e5-b279-ae53fd81e37c`, `architecture_c_sleeve_still_1b`, **NOT CLEARED 5/6**. Evidence: PR #83.

- Left criterion 6 **PASS** (luma 202.24→160.90)
- Right criterion 6 **FAIL** (luma 133.56→157.51; need ≤125.6). `navy_fill_mode: warp`, navy fraction ~0.23. Right covers the already-dark V2 ring; paste still cream-majority.
- Criteria 1–5 PASS; chest reserved 0; C5/C11 0

**[VERIFIED in leftover fixture]** 1b warped a ~0.23 navy crop as-is. Cream-majority paste raises luma on a dark right ring.

## Stage 1c live (authoritative)

Asset `fdb86b18-d4aa-465e-b73f-1d252709739c`, `architecture_c_sleeve_still_1c`, **CLEARED 6/6**. Evidence: this score PR.

- Left criterion 6 **PASS** (luma 202.24→39.93; navyLike 22730/22794)
- Right criterion 6 **PASS** (luma 133.56→39.96; navyLike 11104/11139). `navy_fill_mode: navy_over_cream`, `source_navy_fraction: 1`.
- Criteria 1–5 PASS; chest reserved 0; C5/C11 0

**[VERIFIED]** Live pixels on `2aa1a44c` after 1c. Same seeded quads as 1a/1b. No HTTP 400. $0 / ~5735 ms.

---

## What 1c changes

| Surface | Change |
|---------|--------|
| `src/lib/sleevePanel/navyFill.ts` | Prefer product navy over cream stripe (`preferProductNavyOverCream`); search unless crop is navy-majority (≥0.50) |
| `src/lib/sleevePanel/repair.ts` | Uses 1c `resolveNavyPanelSource` |
| `src/lib/sleevePanel/liveStill.ts` | `architecture_c_sleeve_still_1c` + `navy_over_cream` fill mode |
| `supabase/functions/_shared/sleevePanel/**` | Edge mirror |
| leftover fixture | 1b as-is warp FAILS criterion 6 on dark right; 1c CLEARS 6/6 |

**Not touched:** `logoComposite.ts` C2/C4/C6/C9 1m locks, Control Center, proxy auth, PR #37, V3 / paid Grok, temporal tracking.

---

## Expected metadata (sleeve output)

| Field | Value |
|-------|--------|
| `repair_stage` | `sleeve_panel` |
| `repair.repair_method_version` | `architecture_c_sleeve_still_1c` |
| `repair.contract_version` | `1.0.0` |
| `repair.claim` | `visible_geometry_only` |
| `repair.geometry_note` | `visible_upper_arm_only` |
| `repair.hidden_shoulder_to_cuff_validated` | `false` |
| `repair.consumed_chest_output` | `true` when a chest reserved quad/slot was applied |
| `repair.navy_fill_mode` | `warp` \| `median_navy` \| `navy_over_cream` \| `mixed` |
| `repair.keyframe_id` | `v2-still-0.785` |
| `temporal_tracking_enabled` | `false` |

Chest outputs stay `architecture_c_still_repair_1m`. Do not bump the chest version.

---

## Why `9ed83c01` is UI-disabled (and why that is correct)

**[VERIFIED]** The chest still `<select>` disables any asset with `repair_stage` `logo_chest` or `sleeve_panel`. That is the **logo_chest chaining lock** (defect register §3.4): after stage 1 the selector used to auto-switch to the output, so a re-run painted an already-repaired still.

`9ed83c01` is a `logo_chest` repair output, so it **must** stay disabled in that picker. Selecting it as the chest input would break the chest gate.

**[DECISION]** Sleeve source is a **separate** resolver (`resolvePreferredSleeveStillSource`). It sends `stillAssetId=9ed83c01` (canonical CLEARED 1m) even when the picker cannot select it. In-session chest output, if present, wins. The clean still `2aa1a44c` is fallback only.

Stage 1a / 1b live used `2aa1a44c` because the published runner fell through to the selected clean still. 1c does not require selecting a repair output.

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
7. Accept only if `repair.repair_method_version === architecture_c_sleeve_still_1c` and `hidden_shoulder_to_cuff_validated === false`.
8. Score with `lane-b-sleeve-live-v1` (same 6-pt table as 1a/1b). Criterion 6 must be navy-ward on **both** quads (mean luma drop, navy-like pixels). Left must stay PASS; right must drop (not rise).
9. **HARD STOP.** Do not enable temporal tracking.

A shoulder→cuff / face-high quad must return HTTP **400** `sleeve_panel_geometry_rejected` (not a saved pass).

---

## Deploy

Redeploy **only** `architecture-c-still-repair-proxy`.

- **Required** for live `architecture_c_sleeve_still_1c` + navy-over-cream fill.
- Frontend Publish is **optional for paint** (edge owns fill) but **required** for the `9ed83c01` sleeve-source resolver in the product UI. Until Publish, POST with `stillAssetId=9ed83c01`.
- No V3. No paid Grok. No Control Center. No auth widen. Parent owns Lovable redeploy after READY.

---

## READY / BLOCKED

**CLEARED** for sleeve still on `2aa1a44c` / `fdb86b18`. **BLOCKED** for temporal until parent arms `TEMPORAL_LIVE_ACTIVATION_ARMED` after Class C sign-off.

This cloud VM has no `AVT_USER_ACCESS_TOKEN`. Anon POST remains 401 (auth not widened). Live click / owner JWT is the verify plane — same as chest 1m / sleeve 1a / 1b.

**[VERIFIED]** Isolated leftover fixture: 1b as-is cream-majority warp FAILS criterion 6 on the dark right ring; 1c prefer-navy CLEARS 6/6; C5/C11/reserved untouched; src/_shared fingerprint parity.

**[VERIFIED]** Existing Architecture C Stage 1m chest goldens are not edited.

**[VERIFIED]** Live 1c identity `architecture_c_sleeve_still_1c` + `visible_geometry_only`. Gate **CLEARED 6/6** on criterion 6 both sides (left 202.24→39.93, right 133.56→39.96). 1a `fde270bf` and 1b `a4dc7f47` remain historical NOT CLEARED 5/6.

**Not claimed:** live pixels on preferred chest input `9ed83c01` (this row used clean `2aa1a44c`). Hidden shoulder→cuff. Temporal armed.
