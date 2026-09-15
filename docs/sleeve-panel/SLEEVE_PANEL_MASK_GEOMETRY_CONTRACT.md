# Sleeve-panel mask / geometry contract (Lane B)

**Issue:** [#54](https://github.com/fendifrost-dot/ai-video-tool/issues/54) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)).  
**Owner:** `src/lib/sleevePanel/` only.  
**Class:** C (rendering / compositing) for merge; this document is Class A.  
**Contract version:** `1.0.0`.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## Purpose

Give sleeve-panel repair a **narrow, versioned input/output contract** so a later chest-repair stage can hand this lane a still + reserved mask **without** this lane owning, importing, or modifying Architecture C chest code.

**[DECISION]** Lane B does not depend on chest merge. Chest output is an optional reserved slot.

**[DECISION]** Canonical V2 pose is crossed arms. This contract validates **visible upper-arm** geometry only. Hidden shoulder→cuff is always unvalidated.

---

## Claim (hard)

| Field | Value |
|--------|--------|
| `claim` | `visible_geometry_only` |
| `pose` | `crossed_arms` |
| `validated` | `visible_upper_arm` |
| `unvalidated` | `hidden_shoulder_to_cuff`, `forearm_occluded`, `cuff_unseen` |
| `hiddenShoulderToCuffValidated` | **always `false`** |

A consumer that treats a Lane B pass as “full armhole→cuff proven” is misreading the contract.

---

## Input

`SleevePanelStageInput` (`src/lib/sleevePanel/contract.ts`):

| Field | Role |
|--------|------|
| `contractVersion` | Must be `"1.0.0"` |
| `still` | RGBA still (fixture or later chest-output still) |
| `flatRef` | Flat product ref used as navy-panel source pixels |
| `visibleMask` | Paint-eligible visible upper-arm pixels |
| `hiddenMask` | Hidden / occluded / cuff — never painted |
| `panels[]` | Manual `left` / `right` target quads + source bbox. No detection guess. |
| `visibility` | Must declare the claim table above |
| `chestOutput?` | Optional `chest_output_ref` slot (below) |

Manual quads are required. Empty `panels` → `sleeve_panels_required`.

---

## Chest-output consumption slot

```ts
{
  kind: "chest_output_ref",
  contractVersion: "1.0.0",
  stage: "logo_chest",          // only logo_chest is accepted
  sourceStillId?: string,
  chestOutputAssetId?: string,
  repairMethodVersion?: string, // opaque string; not imported from chest modules
  reservedMask?: BinaryMask,    // do-not-paint
  chestBandQuadNorm?: QuadNorm  // adjacency only; not painted
}
```

**[DECISION]** Lane B may **subtract** `reservedMask` from the paint set. It does **not** read chest pixels as garment truth and does **not** call chest repair.

`parseChestOutputSlot(unknown)` is the only adapter. Wrong `kind`, version, or `stage` → `null`.

---

## Output

`SleevePanelStageOutput`:

- repaired `still` (clone; input buffer is not mutated)
- `paintedMask`
- per-side painted / rejected-hidden / rejected-chest-reserved counts
- `claims.visibleGeometryRepaired`
- `claims.hiddenShoulderToCuffValidated: false`
- `consumedChestOutput`

---

## Geometry rejection

A target quad is rejected (`sleeve_panel_geometry_rejected`) when any of:

- hidden ∩ quad / quad > 5% → `hidden_geometry_unvalidated`
- visible ∩ quad / quad < 85% → `insufficient_visible_coverage`
- centroid not inside `visibleMask`
- empty raster

**[VERIFIED]** in `src/lib/sleevePanel/visibleGeometry.test.ts` and `repair.test.ts` against the static crossed-arms fixture.

---

## Chest-output wiring (Issue #74)

**[DECISION]** After Stage 1m chest CLEARED 11/11, the product runner / edge sleeve stage:

1. Takes the chest-repair PNG (prefer `9ed83c01`) or the same-frame clean still as `still`.
2. Fills `chestOutput.reservedMask` from the live measured band quad (`LIVE_CHEST_RESERVED_QUAD_NORM`).
3. Places **visible-upper-arm** quads only (`SEEDED_VISIBLE_SLEEVE_QUADS`).
4. Calls `repairVisibleSleevePanelsOnStill` → `repairVisibleSleevePanels`.

`repair_method_version` for this wiring is `architecture_c_sleeve_still_1c` (not a chest 1m bump). Hidden shoulder→cuff stays unvalidated. Stage 1a (`architecture_c_sleeve_still_1a`) and 1b (`architecture_c_sleeve_still_1b`) are historical: live FAIL #6 (1a both-side cream; 1b right cream-majority over dark V2 ring).
