# Lane B — Visible sleeve-panel repair

**Work-order:** [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50).  
**Live wiring:** [#74](https://github.com/fendifrost-dot/ai-video-tool/issues/74) — see [`LANE_B_SLEEVE_STILL_LIVE_WIRING.md`](./LANE_B_SLEEVE_STILL_LIVE_WIRING.md).

---

## Mission

Deterministic **visible** sleeve-panel repair against **static fixtures**. Prove geometry that is actually visible on the crossed-arms canonical pose. Never claim hidden shoulder→cuff.

## Ownership

| In | Out |
|----|-----|
| `src/lib/sleevePanel/*` | `src/lib/garment/logoComposite.ts` (chest cover) |
| `docs/sleeve-panel/*` | `src/lib/heroFrame/architectureCStillRepair.ts` |
| Isolated contract + fixtures + tests | `supabase/functions/architecture-c-still-repair-proxy/**` |
| | `ArchitectureCStillRepairRunner` |
| | `fendi-control-center` |
| | `grok-video-research-proxy` auth |
| | V3 / paid Grok / PR #37 |

Isolated engine landed first so chest work could finish. Live wiring (#74) now consumes this contract from `compositeSleevePanelsOntoStill` **without** editing chest paint.

## What the fixture encodes [DECISION]

Synthetic 80×64 still (`crossed_arms_visible_sleeve_v1`):

- Cream torso and crossed upper arms.
- V2-style **horizontal navy ring + horizontal cream pinstripe** on each visible upper arm (the topology defect).
- Distal forearm / cuff cream regions marked **hidden**.
- Chest-band navy rect reserved for an optional chest-output slot.

Synthetic flat ref: **vertical** navy panel + **vertical** cream pinstripe.

Repair is a pass when visible quads receive the vertical panel (column pinstripe) and hidden / chest-reserved pixels are byte-identical to the input.

## Acceptance evidence

| Criterion | Status | Where |
|-----------|--------|--------|
| Isolated modules (no chest-path edit) | **VERIFIED** | this PR file list |
| Deterministic visible repair on fixtures | **VERIFIED** | `repair.test.ts` |
| Hidden geometry not claimed / not painted | **VERIFIED** | `visibleGeometry.test.ts`, `repair.test.ts` |
| Contract + chest-output slot | **VERIFIED** | `contract.test.ts`, contract doc |
| No paid Grok / no CC / no proxy-auth change | **VERIFIED** | no such files in the diff |

**Not claimed:** live V2 still `2aa1a44c`, product runner, temporal tracking, full armhole→cuff, chest still-gate.

## Status

Isolated engine landed (PR #60). Live 1a NOT CLEARED 5/6 on FAIL #6 (PR #80). Live 1b NOT CLEARED 5/6 — left PASS, right cream-majority over dark V2 ring (PR #83). Stage 1c (`architecture_c_sleeve_still_1c`, #84) prefers product navy over cream stripe.
