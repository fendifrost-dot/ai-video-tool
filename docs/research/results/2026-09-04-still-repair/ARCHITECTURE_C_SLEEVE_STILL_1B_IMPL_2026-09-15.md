# Architecture C — Sleeve still Stage 1b (`architecture_c_sleeve_still_1b`)

**Date:** 2026-09-15 · **Author:** Cursor Lane B · **Spend:** $0 · **Issue:** #81 (lineage #74 / #54, parent #50)  
**Status:** **READY** for $0 live sleeve re-verify after edge redeploy of `architecture-c-still-repair-proxy`.

Chest still gate: **CLEARED 11/11** (PR #73, asset `9ed83c01`, `architecture_c_still_repair_1m`). Not reopened.

Sleeve 1a live: **NOT CLEARED 5/6** (asset `fde270bf`, PR #80). FAIL #6 only — cream/white fill.

## Ownership

| In | Out |
|----|-----|
| `src/lib/sleevePanel/**` | `src/lib/garment/logoComposite.ts` |
| `_shared/sleevePanel/**` + `compositeSleevePanelsOntoStill` | chest `repair_method_version` 1m |
| sleeve branch of `architecture-c-still-repair-proxy` | Control Center / proxy auth / PR #37 / V3 |
| Hero Frame §7 sleeve source resolver | temporal tracking |

## FAIL #6 root cause [VERIFIED in fixtures]

`DEFAULT_FLAT_SLEEVE_SOURCE_BBOX = [0.05, 0.35, 0.12, 0.35]` on the crossed-arms fixture flat is cream-majority (navy panel starts further in). 1a warped that crop as-is → cream/white quads, luma rose. Live 1a matched: left 202→227, right 134→226.

## 1b paint [DECISION]

`resolveNavyPanelSource`:

1. If requested crop navy fraction ≥ 0.18 → warp as-is (preserves vertical pinstripe on a navy-majority crop).
2. Else search a vertical navy strip on that side of the same flat.
3. Else fill with the flat's median product navy (never cream/white).

Geometry reject for shoulder→cuff is unchanged. Claim stays `visible_geometry_only`.

## Lineage [DECISION]

Chest still picker continues to disable repair outputs (logo_chest chaining lock). Sleeve sends `9ed83c01` via `resolvePreferredSleeveStillSource` without selecting it in that picker.

## Click path + metadata

See [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`](../../../sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md).
