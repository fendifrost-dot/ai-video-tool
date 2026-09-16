# RECONSTRUCT-1 E2E $0 — PASS 9/9 (Hero Frame §7)

**Date:** 2026-09-15 ~21:13 America/Chicago (~2026-09-16 02:13 UTC)  
**Author:** Cursor (Lane D / Hero Frame evidence) · **Spend:** **$0**  
**Issue:** [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100) (lineage [#98](https://github.com/fendifrost-dot/ai-video-tool/issues/98) / [PR #99](https://github.com/fendifrost-dot/ai-video-tool/pull/99), [#96](https://github.com/fendifrost-dot/ai-video-tool/issues/96) / [PR #97](https://github.com/fendifrost-dot/ai-video-tool/pull/97), parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Class:** **A** (docs / evidence only). No `src/` paint. No Lovable edits. No edge redeploy. No still-gate reopen.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — **PASS 9/9** [V]

Authenticated Hero Frame §7 **Run reconstruct E2E $0** click on the published frontend after PR #99.

| Check | Result |
|-------|--------|
| Button visible / enabled | **PASS** — `before-reconstruct-e2e.png` |
| One click dispatched | **PASS** — `after-reconstruct-e2e-pass.png` |
| Toast | `RECONSTRUCT-1 PASS 9/9 frames=5 paidCalls=false grokPerFrame=false.` |
| JSON `verdict` | **`PASS`** |
| JSON `frameCount` | **`5`** |
| JSON `paidCalls` | **`false`** |
| JSON `grokPerFrame` | **`false`** |
| JSON `escalate` | **`null`** |
| JSON `stillGoldensReopened` | **`false`** |
| HTTP 401 / sign-in wall | **none** |
| Paid Grok / per-frame Grok | **none** |
| Still goldens reopened | **no** |

Machine-readable copy: [`live-smoke/e2e-pass.json`](./live-smoke/e2e-pass.json).  
Screenshots: attached to this evidence run as `reconstruct-e2e-evidence/before-reconstruct-e2e.png` and `after-reconstruct-e2e-pass.png` (described below). Prior temporal smoke PRs (#93 / #97) stored JSON probes, not PNGs; this VM did not hydrate the binary attachments, so they are not committed.  
Click recipe (pre-PASS): [`E2E_LIVE.md`](./E2E_LIVE.md).

**Not claimed:** live 720×1280 pixels of master `76fe7438`, live SAM-3 fetch, chest 11/11 / sleeve 6/6 rescore, an MP4 of clip `76fe7438`, a new edge redeploy.

---

## Lineage [V]

| Field | Value |
|-------|--------|
| Code under test | `main` @ `58b8a49` — merge of [PR #99](https://github.com/fendifrost-dot/ai-video-tool/pull/99) (`c0cbc1b` RECONSTRUCT-1 E2E) |
| Frontend | Lovable **Publish** of that merge to https://aivideotool.lovable.app |
| Edge | none from this lane. `temporal-propagate-proxy` remains the JWT-only redeploy from #88 (unchanged) |
| Prior product click | PR #97 — temporal **Run temporal propagate** SUCCESS (`paidCalls=false`, 3 jobs) |
| Session | signed-in AVT owner (durable account; **Sign out** visible) |
| Still gates | chest 1m CLEARED 11/11 + sleeve 1c CLEARED 6/6 — **not reopened** |

Publish ≠ edge redeploy. This record does **not** redeploy anything.

---

## Canonical IDs [V]

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Canonical master clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Hero timestamp (player) | `t=0.785` (recommended `0.785`) |
| Chest | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` / `architecture_c_still_repair_1m` / CLEARED 11/11 |
| Sleeve | `fdb86b18-d4aa-465e-b73f-1d252709739c` / `architecture_c_sleeve_still_1c` / CLEARED 6/6 |

PR #99 wires **Run reconstruct E2E $0** to POST `temporal-propagate-proxy` (`paidCalls=false`, canonical synthetic luma fixture + CLEARED quads) then `runHeroFrameReconstructFromTemporalJson` (in-lib original-master composite + Lane E reconstruct-video eval). The on-screen 0:03 clip is the project player; this PASS does **not** claim live 720×1280 master pixels were ingested.

---

## Click path [V]

1. Sign in at `https://aivideotool.lovable.app` as the AVT owner.
2. Open Hero Frame:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
3. Scroll to **7 · Architecture C — still-first deterministic repair**.
4. Confirm **Run reconstruct E2E $0** is visible and enabled (gate: `temporalTrackingEnabled=true`, `reconstructArmed=true`, `explicitArm=true`, `canDispatch=true`).
5. Do **not** click chest or sleeve paint.
6. Click **Run reconstruct E2E $0** once.

Observed toast / result copy [V]:

```
RECONSTRUCT-1 PASS 9/9 frames=5 paidCalls=false grokPerFrame=false.
```

Observed JSON panel fields [V] (`data-testid="hero-frame-reconstruct-run-json"`; truncated on screen, authoritative keys recorded):

```
verdict=PASS
frameCount=5
paidCalls=false
grokPerFrame=false
escalate=null
stillGoldensReopened=false
```

---

## Screenshots [O]

Source attachments on this evidence run were labeled `reconstruct-e2e-evidence/before-reconstruct-e2e.png` and `reconstruct-e2e-evidence/after-reconstruct-e2e-pass.png` (2026-09-15 ~21:13 America/Chicago). Binaries were not hydrated onto this VM disk (same Class A JSON-probe pattern as PR #97 `docs/temporal/live-smoke/`). Visual content below is from those attachments.

### `before-reconstruct-e2e.png`

Signed-in AVT shell (Projects selected; **Sign out** in the footer). Hero Frame Studio for project **YSL (Ice On)**. 0:03 player on clip `76fe7438` (subject in the white jacket). Hero Frame still controls at `t=0.785`. Emerald temporal gate copy reports the product gate on. Sky/cyan reconstruct gate copy reports **RECONSTRUCT-1 product gate is on** (`temporalTrackingEnabled` / `reconstructArmed` / `explicitArm` / `canDispatch`; DIRECTOR PHASE 1). **Run reconstruct E2E $0** is visible as an enabled control next to **Hold to talk**. No PASS toast / JSON panel yet.

### `after-reconstruct-e2e-pass.png`

Same signed-in session after one click. Status line under the reconstruct control:

`RECONSTRUCT-1 PASS 9/9 frames=5 paidCalls=false grokPerFrame=false.`

JSON panel shows `verdict=PASS`, `frameCount=5`, `paidCalls=false`, `grokPerFrame=false` (remaining keys truncated in the capture; `escalate=null` and `stillGoldensReopened=false` are part of the authoritative live record). No 401 / sign-in banner. No paid-generation copy.

---

## Relation to temporal click SUCCESS [D]

| Surface | Status |
|---------|--------|
| Temporal §7 **Run temporal propagate** | **SUCCESS** — issue #96 / PR #97 |
| Reconstruct §7 **Run reconstruct E2E $0** | **PASS 9/9** — this record |
| Cloud-VM script `./scripts/temporal-live-smoke.sh` without `AVT_USER_ACCESS_TOKEN` | still **BLOCKED on JWT** — not required to re-prove this click |

The reconstruct button **re-POSTs** temporal itself, then composites in-lib. One click is the E2E. Still goldens stay locked.

---

## Hard locks honored [D]

- No chest / sleeve paint edits. No new still-repair POST. No still-golden rescore.
- No Lovable-managed code. No `architecture-c-still-repair-proxy` / `temporal-propagate-proxy` / `sam3-segment-proxy` redeploy.
- No V3 / paid Grok / Fal / Control Center / proxy-auth widen / PR #37.
- No live SAM-3 fetch (`sam3.liveFetch` stays false).
- No live 720×1280 ingest of master `76fe7438` claimed (unique-RGB stand-in at temporal raster size).
