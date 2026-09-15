# Lane B — Architecture C sleeve still live wiring

**Work-order:** [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Lineage [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54).  
**Class:** C (rendering / compositing).  
**Status:** Live $0 row scored **NOT CLEARED 5/6** (asset `fde270bf`). See [`LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md`](./LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md). `TEMPORAL_LIVE_ACTIVATION_ARMED` stays false.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What landed

`src/lib/sleevePanel/**` is now the **authoritative visible-geometry contract** for the production `sleeve_panel` stage.

| Surface | Change |
|---------|--------|
| `src/lib/sleevePanel/liveStill.ts` | Live adapter: canonical crossed-arms masks + chest reserved slot + `architecture_c_sleeve_still_1a` |
| `supabase/functions/_shared/sleevePanel/**` | Edge mirror (Deno `.ts` imports). Parity test required. |
| `compositeSleevePanelsOntoStill` | Calls Lane B repair. **Does not** call `coverTargetQuad` / `warpQuadAlpha` / logoComposite. |
| `architecture-c-still-repair-proxy` | Sleeve branch records Lane B metadata; maps geometry rejects to HTTP 400. Auth unchanged. |
| Hero Frame §7 | Seeded visible-upper-arm quads, placement warnings, prefers `logo_chest` output as sleeve input. |

**Not touched:** `logoComposite.ts` C2/C4/C6/C9 1m locks, Control Center, proxy auth, PR #37, V3 / paid Grok, temporal tracking.

---

## Expected metadata (sleeve output)

| Field | Value |
|-------|--------|
| `repair_stage` | `sleeve_panel` |
| `repair.repair_method_version` | `architecture_c_sleeve_still_1a` |
| `repair.contract_version` | `1.0.0` |
| `repair.claim` | `visible_geometry_only` |
| `repair.geometry_note` | `visible_upper_arm_only` |
| `repair.hidden_shoulder_to_cuff_validated` | `false` |
| `repair.consumed_chest_output` | `true` when a chest reserved quad/slot was applied |
| `repair.keyframe_id` | `v2-still-0.785` |
| `temporal_tracking_enabled` | `false` |

Chest outputs stay `architecture_c_still_repair_1m`. Do not bump the chest version.

---

## Hero Frame click path (canonical $0 verify)

Project: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`

1. Sign in as the durable owner (`3ca10935-…`).
2. Open **7 · Architecture C — still-first deterministic repair**.
3. Keep garment `0feb028f-…` and clip t=`0.785`.
4. **Do not** re-run chest unless you need a fresh 1m row. Prefer existing chest output `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` (PR #73, CLEARED 11/11). After frontend Publish the runner prefers that `logo_chest` asset automatically. Until Publish: either run **1 · Repair chest_band + logo_zone** in-session on clean still `2aa1a44c` (creates a new 1m row, $0) **or** POST the sleeve body with `stillAssetId=9ed83c01-…` from a signed-in owner session.
5. Enter **visible upper-arm** quads (numeric). **Do not** use the old face-high placeholders (y≈0.36–0.50).

| Side | TL | TR | BR | BL |
|------|----|----|----|----|
| Left | 0.030, 0.500 | 0.260, 0.505 | 0.250, 0.615 | 0.030, 0.610 |
| Right | 0.880, 0.505 | 0.990, 0.500 | 0.990, 0.615 | 0.880, 0.610 |

6. Click **2 · Repair sleeve_panel (manual, upper arm)**.
7. Accept only if `repair.repair_method_version === architecture_c_sleeve_still_1a` and `hidden_shoulder_to_cuff_validated === false`.
8. **HARD STOP.** Do not enable temporal tracking.

A shoulder→cuff / face-high quad must return HTTP **400** `sleeve_panel_geometry_rejected` (not a saved pass).

---

## Deploy

Redeploy **only** `architecture-c-still-repair-proxy`.

- **Required** for live `architecture_c_sleeve_still_1a` + geometry gate.
- Frontend Publish is **optional**: it seeds the new quads / prefers `9ed83c01`. The published runner can still drive the new edge if quads are typed as above.
- No V3. No paid Grok. No Control Center. No auth widen.

---

## READY / BLOCKED

**SCORED** live $0 row `fde270bf`: **NOT CLEARED 5/6**. Identity/geometry/C5/C11/chest reserved hold. Visible navy-ward repair fails (cream fill). `TEMPORAL_LIVE_ACTIVATION_ARMED` stays false.

This cloud VM has no `AVT_USER_ACCESS_TOKEN`. Anon POST remains 401 (auth not widened). Repair was not re-run.

**[VERIFIED]** Isolated + live-adapter unit tests: visible repair, hidden reject, chest reserved untouched, C5/C10/C11 windows byte-identical on a 720×1280 synthetic, src/_shared fingerprint parity.

**[VERIFIED]** Existing Architecture C Stage 1m chest goldens are not edited.

**Live score (2026-09-15):** asset `fde270bf` on clean still `2aa1a44c` (preferred `9ed83c01` UI-disabled). Identity + geometry + C5/C11/chest reserved **PASS**. Visible navy-ward repair **FAIL** (cream fill, luma rose). Gate **NOT CLEARED 5/6**. Paint not changed in the score PR.
