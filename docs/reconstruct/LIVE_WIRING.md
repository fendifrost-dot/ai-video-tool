# Lane D — Original-master live wiring

**Issue:** [#89](https://github.com/fendifrost-dot/ai-video-tool/issues/89) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50); lineage [#55](https://github.com/fendifrost-dot/ai-video-tool/issues/55) / PR #58)  
**Class:** C (compositing / rendering) — isolated adapters + `$0` fixtures.  
**Status:** **PASS 9/9** live click (issue [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100)) — wiring armed; dispatch still requires `explicitArm`. **No edge function.** Hero Frame §7 E2E: [`E2E_LIVE.md`](E2E_LIVE.md) · [`E2E_LIVE_SUCCESS_2026-09-15.md`](E2E_LIVE_SUCCESS_2026-09-15.md).

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What this is

Architecture C **gate 4**: SAM-3 + composite onto original master `76fe7438-…` after chest CLEARED, sleeve CLEARED, and temporal ARMED.

```
original master frames (76fe7438)
  + generated = original stamped with CLEARED chest (9ed83c01) + sleeve (fdb86b18)
  + SAM-3 outfit α (caller-supplied / fixture — never live-fetched)
  + temporal propagated masks (consumed structurally)
  → reconstructOriginalMaster per frame
```

**[DECISION]** Grok's full rerender still cannot become the master. Generated pixels are CLEARED still stamps, admitted only where SAM-3 ∪ trusted temporal α authorizes them. `authorized α === 0` copies original RGB bytes.

**[DECISION]** This lane does **not** call `sam3-segment-proxy` (Control Center SwitchX). SAM-3 is an input contract (`liveFetch: false`).

**[DECISION]** No new JWT edge. Composite is in-lib (`dispatchOriginalMasterReconstruct`). Live 720×1280 rasters would be a later Class C if product needs an edge.

---

## Ownership

| Path | Role |
|------|------|
| `src/lib/reconstruct/canonicalLineage.ts` | Copied project / master clip / chest / sleeve IDs |
| `src/lib/reconstruct/liveWiring.ts` | Gate + deploy notes (`RECONSTRUCT_LIVE_WIRING_ARMED`) |
| `src/lib/reconstruct/adapters.ts` | Stamp stills, merge SAM-3 + temporal, `reconstructMasterClip` |
| `src/lib/reconstruct/dispatch.ts` | Wire parse → authorize → reconstruct |
| `src/lib/reconstruct/fixtures/liveWiringFixture.ts` | `$0` 4-frame pack |
| `src/lib/reconstruct/*.test.ts` | Gate + preservation + dispatch |

### Identified shared surfaces — **not edited**

- `src/lib/garment/logoComposite.ts` / `stillRepairOcclusion.ts`
- `src/lib/sleevePanel/**`
- `src/lib/temporal/livePrep.ts` (`TEMPORAL_LIVE_ACTIVATION_ARMED`)
- `src/lib/temporal/edgeAdapter.ts` (`authorizeTemporalEdgeRequest`)
- `supabase/functions/architecture-c-still-repair-proxy/`
- `supabase/functions/sam3-segment-proxy/`
- `supabase/functions/temporal-propagate-proxy/`
- `src/lib/pipeline/**` (Lane G stub stays a stub)
- `src/lib/heroFrame/architectureCStillRepair.ts`

Hard locks: no Lovable-outside-repo edits, no Control Center, no proxy-auth widen, no PR #37, no V3 / paid Grok.

---

## Canonical IDs (unchanged)

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Original master clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Clean still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Keyframe | `v2-still-0.785` |
| Chest | `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11 |
| Sleeve | `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6 |

---

## Activation gate

```
RECONSTRUCT_LIVE_WIRING_ARMED = true
```

Default (chest CLEARED, sleeve CLEARED, temporal armed after PR #88, no `explicitArm`) → `allowed: false`, `waitingFor: ["explicit_arm_required"]`.

`armedWiringForCanonicalLineage()` (`explicitArm: true`) → `allowed: true`.

Temporal arm is a **copied boolean** (`TEMPORAL_ARMED_AFTER_PR_88`). This lane does not import or edit `TEMPORAL_LIVE_ACTIVATION_ARMED`.

Untrusted temporal frames (`confidence < 0.6` or `reanchorRecommended`) do not expand authorization.

---

## Parent deploy — **no edge function**

**[DECISION]** After merge:

1. **Do not** Lovable-redeploy any edge function from this lane.
2. **Do not** redeploy `architecture-c-still-repair-proxy` (chest/sleeve paint locked).
3. **Do not** redeploy `temporal-propagate-proxy` from this lane (Lane C / PR #88 parent deploy).
4. **Do not** redeploy or call `sam3-segment-proxy` (CC).
5. Publish ≠ edge redeploy. Frontend **Publish** of PR #99 made Hero Frame §7 **Run reconstruct E2E $0** live (issue #98). Live click **PASS 9/9** is issue [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100). No edge redeploy from this lane.

Lane G may later bind `dispatchOriginalMasterReconstruct` / `reconstructMasterClip` into the `original_master_reconstruction` slot. That is **not** this PR.

---

## What this is not

- Not a live SAM-3 call.
- Not a flip of Hero Frame `temporalTrackingEnabled`.
- Not a rewrite of chest/sleeve paint or temporal authorize.
- Not live 720×1280 ingest of master `76fe7438` (Hero Frame E2E uses unique-RGB stand-in frames; D2 proves unique-RGB 720×1280 in-lib — [`VIDEO_QA.md`](VIDEO_QA.md)).
