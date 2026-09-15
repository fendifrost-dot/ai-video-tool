# Lane C — Temporal Propagation Live Prep

**Work-order:** [#76](https://github.com/fendifrost-dot/ai-video-tool/issues/76) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Lineage [#56](https://github.com/fendifrost-dot/ai-video-tool/issues/56) / PR #61.  
**Class:** C (rendering / keyframe-propagation surface exists in the review table) — **isolated adapters + unit tests**, not production-path activation.  
**Status:** **READY** as live-prep. **NOT** ready to enable temporal tracking or redeploy any edge function from this lane.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What landed

`src/lib/temporal/**` now includes a live-prep layer on top of `propagateRepair` (PR #61).

| Surface                  | Change                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| `canonicalLineage.ts`    | Frozen Stage 1m IDs + CLEARED chest quad                            |
| `approvedQuad.ts`        | Chest CLEARED + reserved PENDING sleeve slots                       |
| `quadAdapter.ts`         | Approved CLEARED quads → in-memory `propagateRepair` jobs           |
| `livePrep.ts`            | Activation gate (`TEMPORAL_LIVE_ACTIVATION_ARMED = false`)          |
| `heroFrameHook.ts`       | Isolated Hero Frame prepare hook — `temporalTrackingEnabled: false` |
| `edgeAdapter.ts`         | Future edge request/authorize contract — no fetch, no auth          |
| `clearedChestFixture.ts` | Synthetic luma clip for the live 1m chest quad                      |
| This doc                 | Deploy notes: what **must wait** for sleeve CLEARED                 |

**Not touched:** `logoComposite` / stillRepairOcclusion / `architecture-c-still-repair-proxy` chest path, `src/lib/sleevePanel/**` / edge sleevePanel, `src/lib/heroFrame/architectureCStillRepair.ts`, pipeline OS, reconstruct, Astra, Control Center, proxy auth, PR #37, V3 / paid Grok.

---

## Canonical lineage (frozen)

| Field               | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| Project             | `764a63d2-93cd-44f3-905f-292f14ab2f51`                  |
| Clean still         | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`                  |
| Keyframe            | `v2-still-0.785`                                        |
| Chest quad          | `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]` |
| Cleared chest asset | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50`                  |
| Chest method        | `architecture_c_still_repair_1m`                        |
| Chest gate          | **CLEARED 11/11**                                       |

**[VERIFIED]** These IDs match Stage 1m live evidence (`docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md`).

---

## Fixture proof (no per-frame Grok)

`clearedChestTranslatingFixture()` is an 80×128 × 5-frame **synthetic luma** clip. The CLEARED chest-band mask translates +2 px/frame. `propagateRepair` emits one `PropagatedFrame` per input frame with `provider` / `grokPerFrame` absent.

**[VERIFIED]** in unit tests: translation, warped quad, `source: canonical | propagated`, `paidCalls: false` on job specs.

Sleeve left/right are **PENDING reserved slots**. The adapter does **not** seed Lane B visible-upper-arm quads (those are not a CLEARED sleeve still).

---

## Activation gate (hard stop)

```
TEMPORAL_LIVE_ACTIVATION_ARMED = false
```

`evaluateTemporalLiveActivation()` default (chest CLEARED, sleeve PENDING, no explicit arm) returns `allowed: false` with:

- `live_activation_not_armed`
- `sleeve_still_not_cleared`
- `explicit_arm_required`

`authorizeTemporalEdgeRequest` uses the same gate. Copying the adapter into an edge function **today** would still refuse dispatch.

`prepareHeroFrameTemporalHook` always returns `temporalTrackingEnabled: false` and `providerCalls: []`. It does **not** edit `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled`.

---

## What MUST wait for sleeve CLEARED

Do **not** do any of the following until a sleeve still on the same lineage (`2aa1a44c` / chest output `9ed83c01`) is **CLEARED** and Class C signs off:

1. Flip `TEMPORAL_LIVE_ACTIVATION_ARMED` to `true`
2. Flip Hero Frame `temporalTrackingEnabled` to `true` (Hero Frame owner — not this module)
3. Redeploy any temporal-capable edge function
4. Feed live extract manifests / footage into `propagateRepair`
5. Treat Lane B sleeve still **CLEARED** (not 1a `fde270bf` NOT CLEARED 5/6) as a temporal go
6. Call Grok per intermediate frame (architecture lock: propagate, don't regenerate)

**[DECISION]** Temporal live stays off while sleeve is PENDING / not yet CLEARED. Matches `VIDEO_SWAP_ARCHITECTURE.md` and pipeline stage `temporal_propagation` (`dependsOn: sleeve_garment_repair` + `still_repair_approved` gate).

---

## When sleeve CLEARED — one edge redeploy away

**[RECOMMENDATION]** Activation recipe (not executed in this PR):

1. Confirm sleeve output on the canonical still lineage is CLEARED (human + Lane E / product gate). Record `repair_method_version` + asset id into a future `ApprovedQuad` for `sleeve_left` / `sleeve_right`.
2. Class C sign-off to flip `TEMPORAL_LIVE_ACTIVATION_ARMED` in `src/lib/temporal/livePrep.ts`.
3. Add a **new isolated** Lovable edge function (suggested name `temporal-propagate-proxy`) that:
   - reuses existing proxy auth (do **not** widen)
   - calls `authorizeTemporalEdgeRequest` then `propagateRepair`
   - accepts luma frames + approved quads only
   - never calls Grok / Fal / CC
4. **Redeploy that one new function** via Lovable → Edge Functions → redeploy.
5. Optional frontend Publish so Hero Frame §7 can call `prepareHeroFrameTemporalHook` then the new edge.
6. Hero Frame owner may then flip `temporalTrackingEnabled` (separate change).

**Do not redeploy from this lane:**

| Function                                                 | Why                                        |
| -------------------------------------------------------- | ------------------------------------------ |
| `architecture-c-still-repair-proxy`                      | Lane B sleeve verify; chest 1m path locked |
| `wardrobe-video-propagate-proxy`                         | Fal engine selector — out of ownership     |
| `grok-image-garment-proxy` / `grok-video-research-proxy` | Paid / research Grok — forbidden           |

Publish ≠ edge redeploy. No V3. No paid Grok. No Control Center.

---

## Hero Frame click path (prep only — $0)

Project: `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`

There is **no new click control** in this PR. After sleeve CLEARED + the recipe above:

1. Keep garment / clip t=`0.785` / chest output `9ed83c01`.
2. Do **not** re-run chest paint.
3. Confirm sleeve CLEARED metadata before enabling tracking.
4. Temporal jobs consume approved quads only — no per-frame Grok.

Until then, Hero Frame §7 must keep **HARD STOP — do not enable temporal tracking** (Lane B live wiring).

---

## READY / BLOCKED

**READY** as isolated live-prep (wiring + tests + deploy notes).

**BLOCKED** for production temporal activation until sleeve still CLEARED on the canonical lineage.

**Live sleeve 1a (2026-09-15):** asset `fde270bf` on `2aa1a44c` is **NOT CLEARED 5/6** (visible cream fill, not navy panel). C5/C11/chest reserved held. `TEMPORAL_LIVE_ACTIVATION_ARMED` stays **false**. Score: `docs/sleeve-panel/LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md`.

**[VERIFIED]** Unit tests in `src/lib/temporal/*.test.ts` (existing 20 + live-prep cases). No I/O doubles. No provider-live. No real-media.

**Not claimed:** live pixels as CLEARED, edge dispatch, Hero Frame tracking on, sleeve quad approval.
