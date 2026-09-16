# Temporal Run click smoke — SUCCESS (Hero Frame §7)

**Date:** 2026-09-15 ~19:51 America/Chicago (~2026-09-16 00:51 UTC)  
**Author:** Cursor (Lane C / Hero Frame evidence) · **Spend:** **$0**  
**Issue:** [#96](https://github.com/fendifrost-dot/ai-video-tool/issues/96) (lineage [#94](https://github.com/fendifrost-dot/ai-video-tool/issues/94) / [PR #95](https://github.com/fendifrost-dot/ai-video-tool/pull/95), [#93](https://github.com/fendifrost-dot/ai-video-tool/pull/93), parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Class:** **A** (docs / evidence only). No `src/` paint. No Lovable edits. No edge redeploy.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — **SUCCESS** [V]

Authenticated Hero Frame §7 **Run temporal propagate** click on the published frontend after PR #95.

| Check | Result |
|-------|--------|
| Button visible / enabled | **PASS** — `before-run.png` |
| One click dispatched | **PASS** — `after-run.png` |
| Job count | **3** (`Dispatched 3 job(s).`) |
| `paidCalls` | **`false`** |
| `grokPerFrame` | **`false`** |
| HTTP 401 / sign-in wall | **none** |
| Paid generation | **none** |
| Asset IDs in UI toast | **none shown** |

Machine-readable copy: [`live-smoke/click-smoke.json`](./live-smoke/click-smoke.json).  
Screenshots: attached to this evidence run as `temporal-smoke-evidence/before-run.png` and `after-run.png` (described below). PR #93 smoke stored JSON probes, not PNGs; this VM did not hydrate the binary attachments, so they are not committed.  
API / JWT script procedure (PR #93, this VM still JWT-blocked): [`LIVE_SMOKE.md`](./LIVE_SMOKE.md).

**Not claimed:** live footage CLEARED, reconstruct / original-master composite, per-frame Grok, a new still-repair mint, a new edge redeploy.

---

## Lineage [V]

| Field | Value |
|-------|--------|
| Code under test | `main` @ `782adac` — merge of [PR #95](https://github.com/fendifrost-dot/ai-video-tool/pull/95) (`0dacac6` Run control + `42a97a4` prettier) |
| Frontend | Lovable **Publish** of that merge to https://aivideotool.lovable.app |
| Edge | `temporal-propagate-proxy` — JWT-only redeploy from #88 (unchanged by this smoke) |
| Prior smoke | PR #93 — OPTIONS **200** / anon POST **401**; **BLOCKED on owner JWT** on the cloud VM |
| Session | signed-in AVT owner (durable account; **Sign out** visible) |

Publish ≠ edge redeploy. This record does **not** redeploy anything.

---

## Canonical IDs [V]

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Clip (UI player / Lane D master) | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Hero timestamp | `t=0.785` (recommended `0.785`) |
| Chest (dispatch body, from #95) | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` / `architecture_c_still_repair_1m` / CLEARED 11/11 |
| Sleeve (dispatch body, from #95) | `fdb86b18-d4aa-465e-b73f-1d252709739c` / `architecture_c_sleeve_still_1c` / CLEARED 6/6 |

PR #95 wires the button to `prepareHeroFrameTemporalDispatch` / `buildHeroFrameTemporalPropagateBody` then `callTemporalPropagate` with the **canonical synthetic luma fixture** + CLEARED chest/sleeve quads (`explicitArm: true`). The on-screen 0:03 clip is the project player; this smoke does **not** claim that live pixels were ingested.

---

## Click path [V]

1. Sign in at `https://aivideotool.lovable.app` as the AVT owner.
2. Open Hero Frame:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
3. Scroll to **7 · Architecture C — still-first deterministic repair**.
4. Confirm **Run temporal propagate** is visible and enabled (gate: `temporalTrackingEnabled=true`, `armed=true`, `explicitArm=true`, `canDispatch=true`).
5. Do **not** click chest or sleeve paint.
6. Click **Run temporal propagate** once.

Observed toast / result copy [V]:

```
Dispatched 3 job(s). paidCalls=false grokPerFrame=false.
```

---

## Screenshots [O]

Source attachments on this evidence run were labeled `temporal-smoke-evidence/before-run.png` and `temporal-smoke-evidence/after-run.png` (2026-09-15 ~19:51 America/Chicago). Binaries were not hydrated onto this VM disk (same Class A JSON-probe pattern as PR #93 `live-smoke/`). Visual content below is from those attachments.

### `before-run.png`

Signed-in AVT shell (Projects selected; **Sign out** in the footer). 0:03 player on clip `76fe7438` (subject in the white jacket). Hero Frame still controls at `t=0.785`. Emerald temporal gate copy reports the product gate on (`temporalTrackingEnabled` / `armed` / `explicitArm` / `canDispatch` all true; DIRECTOR PHASE 1). **Run temporal propagate** is visible as an enabled control next to **Hold to talk**. No dispatch toast yet.

### `after-run.png`

Same frame after one click. Status line under the run control:

`Dispatched 3 job(s). paidCalls=false grokPerFrame=false.`

No 401 / sign-in banner. No chest/sleeve asset UUIDs in the toast. No paid-generation copy.

---

## Relation to PR #93 JWT probes [D]

| Surface | Status |
|---------|--------|
| Cloud-VM script `./scripts/temporal-live-smoke.sh` without `AVT_USER_ACCESS_TOKEN` | still **BLOCKED on JWT** (OPTIONS 200 / anon 401) — [`LIVE_SMOKE.md`](./LIVE_SMOKE.md) |
| Published product click (this record) | **SUCCESS** — owner session supplied the JWT in-app |

The product click is the intended `$0` live path after PR #95 Publish. The script remains the parent computerUse fallback when a JWT can be copied from DevTools.

---

## Hard locks honored [D]

- No chest / sleeve paint edits. No new still-repair POST.
- No Lovable-managed code. No `architecture-c-still-repair-proxy` redeploy.
- No V3 / paid Grok / Fal / Control Center / proxy-auth widen / PR #37.
- Reconstruct / original-master stays separate (clip `76fe7438` is the player, not this POST).
- No live extract ingest claimed.
