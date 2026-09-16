# RECONSTRUCT-1 E2E $0 — live click path

**Issue:** [#98](https://github.com/fendifrost-dot/ai-video-tool/issues/98) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50); lineage [#89](https://github.com/fendifrost-dot/ai-video-tool/issues/89) / PR #92)  
**Class:** C (compositing / rendering) + thin Hero Frame UI. Isolated reconstruct E2E + Lane E video eval.  
**Status:** **PASS 9/9** live click after merge + frontend **Publish** of PR #99 — [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100) · [`E2E_LIVE_SUCCESS_2026-09-15.md`](E2E_LIVE_SUCCESS_2026-09-15.md). **No edge function.**

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What this is

Architecture C **gate 4** product path: live temporal propagation → in-lib original-master reconstruct → automated PASS/FAIL JSON. Spend stays **$0**.

```
Hero Frame §7  →  "Run reconstruct E2E $0"
  1. POST temporal-propagate-proxy  (JWT, paidCalls=false, luma fixture + CLEARED quads)
  2. consume jobs structurally (no Lane C authorize edit)
  3. stamp CLEARED chest 1m + sleeve 1c onto unique-RGB original-master stand-in frames
  4. reconstructOriginalMaster per frame (SAM-3 fixture α ∪ trusted temporal masks)
  5. Lane E reconstruct-video eval → PASS/FAIL JSON in the UI
```

**[DECISION]** No new JWT edge. Composite stays in-lib (`runReconstructE2e` → `reconstructMasterClip`).  
**[DECISION]** No live SAM-3 fetch. `sam3.liveFetch` remains `false`.  
**[DECISION]** No paid Grok / V3. `paidCalls=false`, `grokPerFrame=false`.  
**[DECISION]** Do not reopen chest 11/11 or sleeve 6/6 still goldens. Video eval never calls `evaluateChestStill`.

---

## Investigation (what PR #92 actually wired)

| Surface | On `main` after PR #92? |
|---------|-------------------------|
| `reconstructOriginalMaster` / `reconstructMasterClip` | YES — in-lib |
| `dispatchOriginalMasterReconstruct` + `explicitArm` | YES — in-lib wire protocol (64×64 cap) |
| `RECONSTRUCT_LIVE_WIRING_ARMED` | YES (`true`) |
| Hero Frame reconstruct button | **NO** — docs said “not a production UI runner” |
| Edge proxy | **NO** — by design |
| Lane E video eval | **NO** — chest/sleeve still evaluators only |

This PR adds the missing UI + E2E glue + video eval. It does **not** replace Lane D math.

---

## Ownership

| Path | Role |
|------|------|
| `src/lib/reconstruct/e2e.ts` | Consume temporal jobs + reconstruct onto original-master stand-in |
| `src/lib/reconstruct/heroFrameRun.ts` | Product gate / copy / score wrapper |
| `src/lib/eval/reconstructVideoEvaluator.ts` | PASS/FAIL JSON (9 criteria) |
| `src/components/video/HeroFrameReconstructRunControl.tsx` | §7 button |
| `src/components/video/ArchitectureCStillRepairRunner.tsx` | Thin mount under temporal control |

### Identified shared surfaces — **not edited**

- `src/lib/garment/logoComposite.ts` / `stillRepairOcclusion.ts`
- `src/lib/sleevePanel/**`
- `src/lib/heroFrame/architectureCStillRepair.ts` (read `temporalTrackingEnabled` only)
- `src/lib/temporal/livePrep.ts` / `edgeAdapter.ts`
- `supabase/functions/architecture-c-still-repair-proxy/`
- `supabase/functions/temporal-propagate-proxy/` internals
- `supabase/functions/sam3-segment-proxy/`
- chest / sleeve still goldens and evidence files

Hard locks: no Lovable-outside-repo edits, no Control Center, no proxy-auth widen, no PR #37, no V3 / paid Grok.

---

## Canonical IDs (unchanged)

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Original master clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Clean still | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Keyframe | `v2-still-0.785` |
| Chest | `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11 |
| Sleeve | `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6 |

---

## Exact live click recipe (parent)

1. Merge this PR to `main`.
2. Lovable **frontend Publish** from `main`. **Do not** redeploy any edge function from this lane.
3. Sign in at `https://aivideotool.lovable.app` as the AVT owner.
4. Open Hero Frame:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
5. Scroll to **7 · Architecture C — still-first deterministic repair**.
6. Confirm **Run temporal propagate** is still enabled (do **not** click chest or sleeve paint).
7. Confirm **Run reconstruct E2E $0** is visible and enabled  
   (`temporalTrackingEnabled=true`, `reconstructArmed=true`, `explicitArm=true`, `canDispatch=true`).
8. Click **Run reconstruct E2E $0** once.

### Expected artifacts

Toast / status line:

```
RECONSTRUCT-1 PASS 9/9 frames=<n> paidCalls=false grokPerFrame=false.
```

JSON panel (`data-testid="hero-frame-reconstruct-run-json"`):

- `verdict: "PASS"`
- `paidCalls: false`
- `grokPerFrame: false`
- `sam3LiveFetch: false`
- `stillGoldensReopened: false`
- `escalate: null`
- `source: "live_temporal_jobs"`

Capture for evidence: before-click PNG, after-click PNG, toast text, JSON body. Same pattern as [`docs/temporal/LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`](../temporal/LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md).

**Live SUCCESS recorded:** 2026-09-15 ~21:13 America/Chicago — toast `RECONSTRUCT-1 PASS 9/9 frames=5 paidCalls=false grokPerFrame=false.` JSON `verdict=PASS`, `frameCount=5`, `paidCalls=false`, `grokPerFrame=false`, `escalate=null`, `stillGoldensReopened=false`. Write-up: [`E2E_LIVE_SUCCESS_2026-09-15.md`](E2E_LIVE_SUCCESS_2026-09-15.md) · JSON: [`live-smoke/e2e-pass.json`](live-smoke/e2e-pass.json).

Optional: click **Run temporal propagate** first (already SUCCESS). The reconstruct button **re-POSTs** temporal itself so one click is the E2E.

### 401

If the toast is `401 — sign in required`, the session JWT is missing. Sign in again. Do not treat that as an architecture blocker.

---

## Automated eval (no still reopen)

Harness entry (unit / fixture, always on):

```bash
npx vitest run src/lib/eval/reconstructVideoEvaluator.test.ts src/lib/reconstruct/e2e.test.ts src/lib/reconstruct/heroFrameRun.test.ts
```

Criteria (Lane E reconstruct-video v1):

1. `paid_calls_false`
2. `grok_per_frame_false`
3. `sam3_live_fetch_false`
4. `canonical_ids`
5. `original_preserved_unauthorized`
6. `independent_alpha_zero_bytes`
7. `generated_is_not_master`
8. `temporal_masks_consumed`
9. `still_goldens_not_reopened`

**Escalate only** if original-pixel preservation fails after a successful reconstruct (`escalate.kind = architectural_blocker`). That is a compositing contract break — do **not** reopen chest/sleeve paint.

---

## Not claimed (not FAILs)

- Live 720×1280 pixels of master `76fe7438` (this $0 path uses unique-RGB stand-in frames sized to the temporal raster; full-res master ingest is a later Class C).
- Live SAM-3 fetch.
- Chest 11/11 / sleeve 6/6 rescore.
- An MP4 file of clip `76fe7438`.

**[DECISION]** Those gaps are documented, not still-gate work.

---

## Parent deploy

| Action | Required? |
|--------|-----------|
| Merge to `main` | YES |
| Lovable frontend **Publish** | YES — new §7 button |
| Redeploy `temporal-propagate-proxy` | **NO** (already live from #88) |
| Redeploy `architecture-c-still-repair-proxy` | **NO** (paint locked) |
| Redeploy `sam3-segment-proxy` | **NO** |
| New edge function | **NO** |

Publish ≠ edge redeploy.

---

## Hard locks honored

- No paid Grok / V3 / Fal / Control Center.
- No chest / sleeve still-repair algorithm or CLEARED evidence edits.
- No `TEMPORAL_LIVE_ACTIVATION_ARMED` / `authorizeTemporalEdgeRequest` edits.
- No Lovable-managed code.
- Canonical IDs unchanged.
