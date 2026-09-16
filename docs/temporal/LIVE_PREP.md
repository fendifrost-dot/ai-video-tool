# Lane C — Temporal Live Activation

**Work-order:** [#87](https://github.com/fendifrost-dot/ai-video-tool/issues/87) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Lineage [#76](https://github.com/fendifrost-dot/ai-video-tool/issues/76) / PR #78 (live-prep, armed was false). Sleeve evidence [#86](https://github.com/fendifrost-dot/ai-video-tool/pull/86).  
**Class:** C (rendering / keyframe-propagation + new JWT edge). Isolated adapters + unit tests + one new edge function.  
**Status:** **ARMED** on `main` @ `200bea9`. `temporal-propagate-proxy` is live (JWT only). `$0` smoke procedure: [`LIVE_SMOKE.md`](./LIVE_SMOKE.md) — this VM **BLOCKED** on owner JWT.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What landed

| Surface                              | Change                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| `livePrep.ts`                        | `TEMPORAL_LIVE_ACTIVATION_ARMED = true`                    |
| `canonicalLineage.ts`                | Frozen 1m chest + live 1c sleeve IDs / documented seeds    |
| `approvedQuad.ts`                    | CLEARED chest + CLEARED sleeve left/right                  |
| `edgeAdapter.ts` / `edgeDispatch.ts` | `authorizeTemporalEdgeRequest` then `propagateRepair`      |
| `heroFrameHook.ts`                   | Prepares 3 jobs; **`temporalTrackingEnabled` stays false** |
| `temporal-propagate-proxy`           | Isolated JWT edge. No Grok / Fal / CC                      |
| This doc                             | Edge-only deploy notes + Hero Frame owner flip             |

**Not touched:** `logoComposite` / stillRepairOcclusion / `architecture-c-still-repair-proxy` chest path, `src/lib/sleevePanel/**` paint / edge sleevePanel, `src/lib/heroFrame/architectureCStillRepair.ts`, pipeline OS, reconstruct, Astra, Control Center, proxy auth, PR #37, V3 / paid Grok.

---

## Canonical lineage (frozen)

| Field                | Value                                                   |
| -------------------- | ------------------------------------------------------- |
| Project              | `764a63d2-93cd-44f3-905f-292f14ab2f51`                  |
| Clean still          | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`                  |
| Keyframe             | `v2-still-0.785`                                        |
| Chest quad           | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| Cleared chest asset  | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50`                  |
| Chest method         | `architecture_c_still_repair_1m`                        |
| Chest gate           | **CLEARED 11/11**                                       |
| Cleared sleeve asset | `fdb86b18-d4aa-465e-b73f-1d252709739c`                  |
| Sleeve method        | `architecture_c_sleeve_still_1c`                        |
| Sleeve gate          | **CLEARED 6/6** (evidence PR #86)                       |
| Sleeve left seed     | `[[0.03,0.50],[0.26,0.505],[0.25,0.615],[0.03,0.61]]`   |
| Sleeve right seed    | `[[0.88,0.505],[0.99,0.50],[0.99,0.615],[0.88,0.61]]`   |

**[VERIFIED]** Chest IDs match Stage 1m live evidence. Sleeve IDs / seeds match PR #86 live 1c scorecard (`docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md` on that PR). Preferred chest output `9ed83c01` was **not** the live 1c `stillAssetId`; temporal still consumes the documented visible-upper-arm seeds.

---

## Activation gate

```
TEMPORAL_LIVE_ACTIVATION_ARMED = true
```

`evaluateTemporalLiveActivation()` default (chest CLEARED, sleeve CLEARED, armed, no explicitArm) returns `allowed: false` with:

- `explicit_arm_required`

`armedActivationForCanonicalLineage()` (`explicitArm: true`) returns `allowed: true`.

`authorizeTemporalEdgeRequest` / `dispatchTemporalPropagate` use the same gate. The new edge function still refuses dispatch unless the body sets `explicitArm: true`.

---

## Hero Frame owner flip (landed — [#90](https://github.com/fendifrost-dot/ai-video-tool/issues/90))

Lane C `prepareHeroFrameTemporalHook` still returns `temporalTrackingEnabled: false` (temporal module does not own the product flag).

Hero Frame owner now flips `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` to **true** in `src/lib/heroFrame/architectureCStillRepair.ts`. Product UI calls `prepareHeroFrameTemporalDispatch()` which sets `explicitArm: true` when the product flag and `TEMPORAL_LIVE_ACTIVATION_ARMED` are both true.

**[DECISION]** Still-repair edge mirror stays **false**. `architecture-c-still-repair-proxy` 500s `tracking_flag_misconfigured` if that copy is true. Temporal dispatch is `temporal-propagate-proxy`, not still-repair. No still-repair edge redeploy from the Hero Frame flip. Do not edit chest/sleeve paint as part of that flip.

---

## Parent deploy — one new edge function only

**[RECOMMENDATION]** After merge:

1. Lovable → **Edge Functions → redeploy `temporal-propagate-proxy`**.
2. Do **not** redeploy `architecture-c-still-repair-proxy` unless a separate Lane B need requires it (chest 1m + sleeve 1c paint are locked).
3. Optional frontend Publish so Hero Frame can call the hook then the new edge. Publish ≠ edge redeploy.
4. Hero Frame owner flip is a separate frontend change (#90) — not an edge redeploy.

The function:

- reuses existing user-JWT proxy auth (`verify_jwt = true` + `getUser`) — **not widened**
- calls `authorizeTemporalEdgeRequest` then `propagateRepair`
- accepts luma frames + approved quads only
- never calls Grok / Fal / CC

**Do not redeploy from this lane:**

| Function                                                 | Why                                        |
| -------------------------------------------------------- | ------------------------------------------ |
| `architecture-c-still-repair-proxy`                      | Lane B sleeve verify; chest 1m path locked |
| `wardrobe-video-propagate-proxy`                         | Fal engine selector — out of ownership     |
| `grok-image-garment-proxy` / `grok-video-research-proxy` | Paid / research Grok — forbidden           |

No V3. No paid Grok. No Control Center.

---

## Fixture proof (no per-frame Grok)

`clearedChestTranslatingFixture()` is an 80×128 × 5-frame **synthetic luma** clip. CLEARED chest + sleeve 1c quads each emit `PropagatedFrame`s with `provider` / `grokPerFrame` absent.

**[VERIFIED]** in unit tests: arm gate, authorize path, three jobs (`chest`, `sleeve_left`, `sleeve_right`), `paidCalls: false`.

---

## READY / BLOCKED

**READY** as isolated live activation (armed=true + edge source + tests + edge-only deploy notes).

**READY** for Hero Frame product tracking (`temporalTrackingEnabled = true` when armed; dispatch uses `explicitArm`). Still-repair edge flag stays false.

**Not claimed:** live footage ingest, still-repair edge flag flip, paid/provider calls.

**$0 live smoke (2026-09-16):** procedure + expected `explicitArm: true` body with chest `9ed83c01` + sleeve `fdb86b18` is in [`LIVE_SMOKE.md`](./LIVE_SMOKE.md). This VM: OPTIONS **200**, anon POST **401** `unauthenticated`, no owner JWT — **BLOCKED** on JWT like prior still verifies. Hero Frame §7 has **no** temporal run button (`prepareHeroFrameTemporalDispatch` is display-only). Parent computerUse: confirm gate → copy owner JWT → `./scripts/temporal-live-smoke.sh`. Reconstruct stays separate. Do **not** redeploy `architecture-c-still-repair-proxy`.

**Live sleeve 1b (2026-09-15):** asset `a4dc7f47` on `2aa1a44c` is **NOT CLEARED 5/6** (criterion 6 right luma 133.6→157.5; left navy-ward PASS). C5/C11/chest reserved held. Historical. Score: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1B_LIVE_RESULT_2026-09-15.md`.

**Live sleeve 1c (2026-09-16):** asset `fdb86b18` on `2aa1a44c` is **CLEARED 6/6** (criterion 6 both sides navy-ward: left 202.24→39.93, right 133.56→39.96). C5/C11/chest reserved held. Sleeve paint stays locked. Score: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md`.

**[VERIFIED]** Unit tests in `src/lib/temporal/*.test.ts`. No I/O doubles. No provider-live. No real-media.
