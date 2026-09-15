# Architecture C — Sleeve still Stage 1c (`architecture_c_sleeve_still_1c`)

**Date:** 2026-09-15 · **Author:** Cursor Lane B · **Spend:** $0 · **Issue:** #84 (lineage #81 / #74 / #54, parent #50)  
**Status:** **READY** for parent merge + Lovable **Edge Functions → redeploy** of `architecture-c-still-repair-proxy` only + $0 live re-verify.

Chest still gate: **CLEARED 11/11** (PR #73, asset `9ed83c01`, `architecture_c_still_repair_1m`). Not reopened. Temporal unarmed.

Sleeve 1a live: **NOT CLEARED 5/6** (asset `fde270bf`, PR #80). Historical.  
Sleeve 1b live: **NOT CLEARED 5/6** (asset `a4dc7f47`, PR #83). Left PASS; right FAIL.

## Ownership

| In | Out |
|----|-----|
| `src/lib/sleevePanel/**` | `src/lib/garment/logoComposite.ts` |
| `_shared/sleevePanel/**` + `compositeSleevePanelsOntoStill` | chest `repair_method_version` 1m |
| sleeve branch of `architecture-c-still-repair-proxy` | Control Center / proxy auth / PR #37 / V3 |
| Hero Frame §7 sleeve source resolver (version string only) | temporal tracking |

## FAIL #6 root cause [VERIFIED in fixtures + live 1b]

1b `resolveNavyPanelSource` warped a crop with navy fraction **~0.23** (`NAVY_CROP_MIN_FRACTION = 0.18`). Cream-majority paste:

| Side | Src luma | 1b out | Gate |
|------|----------|--------|------|
| Left (cream) | 202.24 | **160.90** | PASS (drop ≥8) |
| Right (already-dark V2 ring) | 133.56 | **157.51** | FAIL (need ≤125.6; navyLike 2636/11139) |

Right covers a dark ring; cream paste raises mean luma.

## 1c paint [DECISION]

Prefer **product navy over cream stripe**:

1. Search for a vertical navy strip unless the requested crop is already navy-majority (≥0.50).
2. `preferProductNavyOverCream`: replace non-navy source pixels with median product navy. Keep sampled navy.
3. Else median product navy fill (never cream/white).

Geometry reject for shoulder→cuff is unchanged. Claim stays `visible_geometry_only`.

Fixture `stage1bRightLeftover`: 1b-style as-is warp **FAILS** criterion 6 on the dark right ring; 1c repair **CLEARS** 6/6 including C5/C11/chest reserved.

## Click path + metadata

See [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`](../../../sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md).
