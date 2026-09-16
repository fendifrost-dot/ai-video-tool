# PLAYABLE-1 live export — E2 INCOMPLETE 2/9 (not FAIL 6/9)

**Date:** 2026-09-16 ~1:19 AM America/Chicago (~2026-09-16 06:19 UTC)  
**Author:** Cursor (Lane H / E2 live evidence) · **Spend:** **$0**  
**Issues:** sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · related [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) · umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)  
**Class:** **A** (docs / evidence only). No `src/` paint. No Lovable edits. No edge redeploy. No still-gate reopen.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — compose SUCCESS + E2 **INCOMPLETE 2/9** [V]

Authenticated Hero Frame §7 **Export playable reconstruct $0** click on the published frontend after [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) merged to `main` and Lovable **frontend Publish**.

| Check | Result |
|-------|--------|
| Button visible / enabled | **PASS** — `export-toast-1.png` / `export-toast-2.png` |
| One click after hard refresh | **PASS** — signed in; clicked once |
| Compose | **SUCCESS** — 8-frame UI window, `paidCalls=false` |
| Lane E2 `lane-e2-video-qa-v1` | **INCOMPLETE 2/9** — `fail=0` `skip=7` `frames=0` `mp4=produced` |
| Prior false FAIL 6/9 (`mp4=none`) | **fixed** by PR #129 — this click is not FAIL |
| HTTP 401 / sign-in wall | **none** |
| Paid Grok / per-frame Grok | **none** |
| Still goldens reopened | **no** (`stillGoldensReopened=false`) |

Machine-readable copy: [`live-smoke/playable-export-incomplete.json`](./live-smoke/playable-export-incomplete.json).  
Screenshots: attached to this evidence run as `playable-export-evidence/export-toast-1.png` and `export-toast-2.png` (described below). Prior Hero Frame smoke PRs (#93 / #97 / #101) stored JSON probes, not PNGs when this VM did not hydrate the binary uploads; the same happened here — the two export-toast captures were attached to the run and transcribed, but PNG bytes were not on this disk to `git add`.  
Click recipe: [`PLAYABLE_ARTIFACT.md`](./PLAYABLE_ARTIFACT.md) § Parent live-verify recipe.

---

## Exact toast [V]

Verbatim, one click after hard refresh, signed in:

```
PLAYABLE compose 720×1280 frames=8 fps=24 preserved=true sam3=intended_stage1h_evidence paidCalls=false. Lane E2 video QA lane-e2-video-qa-v1: INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced paidCalls=false stillGoldensReopened=false.
```

### How to read that toast [D]

| Token | Meaning |
|-------|---------|
| `PLAYABLE compose 720×1280 frames=8 … paidCalls=false` | 8-frame UI-window compose **SUCCESS** |
| `INCOMPLETE 2/9` | `passCount/total` including SKIPs — **2 PASS + 0 FAIL + 7 SKIP**, not a 7-criterion miss |
| `fail=0` | No FAIL criterion. This is **not** the prior false **FAIL 6/9** (`mp4=none`, 8 in-memory frames) |
| `skip=7` | Encode-first: visual probes SKIP while awaiting decoded MP4 rasters |
| `frames=0` | No decoded-frame E2 score (`awaiting decoded_frames`) |
| `mp4=produced` | Scoring attached a produced reconstructed MP4 (the committed gate file) |
| `stillGoldensReopened=false` | Chest 11/11 / sleeve 6/6 not rescored |

`INCOMPLETE 2/9` with `fail=0` is the encode-first contract: two spend/lock PASSes (`paid_calls_false`, `still_goldens_not_reopened`) and seven SKIPs. It is **not** a product FAIL.

---

## Lineage [V]

| Field | Value |
|-------|--------|
| Code under test | `main` @ `f5f7d8a31a695786a1b2496e37745ea7aa4bd64c` — merge of [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) (`6678803` fix(H+E2)) |
| Frontend | Lovable **Publish** of that merge to https://aivideotool.lovable.app |
| Edge | **none** from this lane. Publish ≠ edge redeploy |
| Prior false FAIL | Live toast before #129: `FAIL 6/9 frames=8 mp4=none` — 6 PASS + 1 FAIL (`centroidDriftPx` on the **8-frame in-memory window**) + 2 SKIP. Fixed by attaching `committedPlayableMp4Ref()` encode-first |
| Session | signed-in AVT owner (durable account; **Sign out** visible) |
| Still gates | chest 1m CLEARED 11/11 + sleeve 1c CLEARED 6/6 — **not reopened** |

Publish ≠ edge redeploy. This record does **not** redeploy anything.

---

## Canonical IDs [V]

| Field | Value |
|-------|--------|
| URL | `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Canonical master clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Button | **Export playable reconstruct $0** |
| Hero timestamp (player) | `t=0.785` (recommended `0.785`) |
| Chest | `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11 |
| Sleeve | `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6 |

---

## Gate playable MP4 (committed file — unchanged) [V]

This live click does **not** mint a new MP4. The gate artifact remains the committed ffmpeg file:

| Field | Value |
|-------|--------|
| Path | [`docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4`](artifacts/playable-76fe7438/reconstructed.mp4) |
| Working raster | **720×1280** |
| Frame count | **72** |
| fps | **24** |
| Duration | **3.0 s** |
| Codec / pixel format | H.264 / `yuv420p` |
| Container | MP4 (`mov,mp4,…`) |
| Byte length | 486769 |
| SHA-256 | `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b` |
| Provenance master | `76fe7438-671d-4428-a7f6-17a45e98c16f` |

Probed on this evidence branch from `main` @ `f5f7d8a` (`ffprobe` + `sha256sum`). Matches [`provenance.json`](artifacts/playable-76fe7438/provenance.json) and committed [`video-qa.json`](artifacts/playable-76fe7438/video-qa.json) (`verdict: INCOMPLETE`, `failCount: 0`, `mp4.produced: true`, `awaiting: ["decoded_frames"]`).

---

## Click path [V]

1. Sign in at `https://aivideotool.lovable.app` as the AVT owner.
2. Hard refresh Hero Frame:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
3. Scroll to **7 · Architecture C — still-first deterministic repair**.
4. Do **not** click chest or sleeve paint.
5. Confirm **Export playable reconstruct $0** is enabled.
6. Click **Export playable reconstruct $0** once.

---

## Screenshots [O]

Source attachments on this evidence run were labeled `playable-export-evidence/export-toast-1.png` and `playable-export-evidence/export-toast-2.png` (uploads; 2026-09-16 ~1:19 AM America/Chicago). Expected commit path: [`live-smoke/playable-export-evidence/`](./live-smoke/playable-export-evidence/). Binaries were not hydrated onto this VM disk (same Class A JSON-probe pattern as PR #101 `docs/reconstruct/live-smoke/`). Visual content below is from those attachments.

### `export-toast-1.png`

Signed-in AVT shell (Projects selected; **Sign out** in the footer). Hero Frame §7 PLAYABLE reconstruct export panel (purple) after the click. Status copy under **Export playable reconstruct $0** is the verbatim toast (compose SUCCESS + E2 `INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced`). JSON panel shows `schemaVersion: avt.reconstruct.playable.e2-hook.v1`, `scoringOwner: lane_e2`, `playableVersion: 1.0.0`, `mediaKind: canonical_720x1280_still_derived`. DIRECTOR PHASE 1 overlay is present (Hold to talk; read-only). No 401 / sign-in banner. No paid-generation copy.

### `export-toast-2.png`

Same signed-in session, wider §7 stack: chest picker lock copy (`CLEARED 1m 9ed83c01…`), emerald **Run temporal propagate** gate, cyan **Run reconstruct E2E $0** gate, then the PLAYABLE panel with the same verbatim compose + E2 INCOMPLETE status. DIRECTOR PHASE 1 overlay overlaps the lower PLAYABLE block. No chest/sleeve paint click.

---

## What is / is not claimed [D]

**Claimed (this record):**

- Live 8-frame UI-window compose SUCCESS after #129 Publish (`paidCalls=false`).
- Live E2 **INCOMPLETE** (not FAIL); `fail=0`; `mp4=produced`; `stillGoldensReopened=false`.
- #129 removed the prior false FAIL 6/9 with `mp4=none`.
- Gate MP4 remains the committed 72-frame H.264 file (sha256 `71f54599…`, master `76fe7438`).

**Not claimed (not FAILs):**

- Full decoded-frame E2 PASS (`frames=0` / awaiting `decoded_frames`)
- Live 241-frame / 1080 ingest of master `76fe7438`
- CLEARED real-media gate final (Lane R locks stay **UNCLAIMED** — [`docs/regression/REAL_MEDIA_LOCKS.md`](../regression/REAL_MEDIA_LOCKS.md))
- Live SAM-3 fetch
- Chest 11/11 / sleeve 6/6 rescore
- A new edge redeploy / a newly encoded MP4 from this click

---

## Hard locks honored [D]

- No chest / sleeve paint edits. No new still-repair POST. No still-golden rescore.
- No Lovable-managed code. No `architecture-c-still-repair-proxy` / `temporal-propagate-proxy` / `sam3-segment-proxy` redeploy.
- No V3 / paid Grok / Fal / Control Center / proxy-auth widen / PR #37.
- No live SAM-3 fetch (`sam3.liveFetch` stays false).
- Real-media lock JSON not edited (`inventPassForbidden`).
