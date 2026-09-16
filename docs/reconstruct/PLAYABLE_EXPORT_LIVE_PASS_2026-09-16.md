# PLAYABLE-1 live export — E2 PASS 3/9 (WebCodecs sample after #133 Publish)

**Date:** 2026-09-16 ~2:05 AM America/Chicago (~2026-09-16 07:05 UTC)  
**Author:** Cursor (Lane H / E2 live evidence) · **Spend:** **$0**  
**Issues:** sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) · related [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) (encode-first INCOMPLETE) · [PR #132](https://github.com/fendifrost-dot/ai-video-tool/pull/132) (node/ffmpeg CI decode) · [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133) (browser WebCodecs)  
**Class:** **A** (docs / evidence only). No `src/` paint. No Lovable edits. No edge redeploy. No still-gate reopen. **No Publish from this record.**

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Verdict — compose SUCCESS + E2 **PASS 3/9** [V]

Authenticated Hero Frame §7 **Export playable reconstruct $0** click on the published frontend after [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133) merged to `main` (`7dc04ad`) and Lovable **frontend Publish**.

| Check | Result |
|-------|--------|
| Button visible / enabled | **PASS** — `export-pass-toast-2026-09-16.png` |
| One click after hard refresh | **PASS** — signed in; clicked once |
| Compose | **SUCCESS** — 8-frame UI window, `paidCalls=false` |
| Lane E2 `lane-e2-video-qa-v1` | **PASS 3/9** — `fail=0` `skip=6` `frames=8` `mp4=produced` |
| Browser decode | **`webcodecs`** — `720×1280` liveSample `maxFrames=8` of `source=72` |
| Prior encode-first INCOMPLETE 2/9 (`frames=0`) | **cleared for this sample path** by PR #133 + Publish — this click is PASS, not INCOMPLETE |
| HTTP 401 / sign-in wall | **none** |
| Paid Grok / per-frame Grok | **none** |
| Still goldens reopened | **no** (`stillGoldensReopened=false`) |

Machine-readable copy: [`live-smoke/playable-export-pass.json`](./live-smoke/playable-export-pass.json).  
Screenshot (committed): [`live-smoke/playable-export-evidence/export-pass-toast-2026-09-16.png`](./live-smoke/playable-export-evidence/export-pass-toast-2026-09-16.png).  
Prior INCOMPLETE record: [`PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](./PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md).  
Click recipe: [`PLAYABLE_ARTIFACT.md`](./PLAYABLE_ARTIFACT.md) § Parent live-verify recipe.

---

## Exact toast [V]

Verbatim, one click after hard refresh, signed in (~2026-09-16 2:05 AM CT / 07:05 UTC), `main` ~`7dc04ad`:

```
PLAYABLE compose 720×1280 frames=8 fps=24 preserved=true sam3=intended_stage1h_evidence paidCalls=false. Lane E2 video QA lane-e2-video-qa-v1: PASS 3/9 fail=0 skip=6 frames=8 mp4=produced paidCalls=false stillGoldensReopened=false. browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 (not the 8-frame UI compose; full 72f is node/ffmpeg CI).
```

### How to read that toast [D]

| Token | Meaning |
|-------|---------|
| `PLAYABLE compose 720×1280 frames=8 … paidCalls=false` | 8-frame UI-window compose **SUCCESS** (unchanged window; **not** scored as MP4 rasters) |
| `PASS 3/9` | `passCount/total` including SKIPs — **3 PASS + 0 FAIL + 6 SKIP**, not a 6-criterion miss |
| `fail=0` | No FAIL criterion |
| `skip=6` | Visual probes SKIP (no α on lossy H.264 `yuv420p`; pairing the 8-frame compose onto the 72-frame gate is refused) |
| `frames=8` | WebCodecs sample of the **72-frame gate MP4**, capped at `LIVE_PLAYABLE_DECODE_MAX_FRAMES=8` — **not** the 8-frame UI compose |
| `mp4=produced` | Scoring attached a produced reconstructed MP4 (the committed gate file) |
| `stillGoldensReopened=false` | Chest 11/11 / sleeve 6/6 not rescored |
| `browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72` | `formatPlayableBrowserDecodeNote` after a successful bounded decode of `/reconstruct/playable-76fe7438.mp4` |

`PASS 3/9` with `fail=0` is the documented sample-decode contract: three PASSes (`paid_calls_false`, `still_goldens_not_reopened`, `mp4_artifact_scored`) and six visual SKIPs. It is **not** a full-clip 72-frame score.

---

## Lineage [V]

| Field | Value |
|-------|--------|
| Code under test | `main` @ `7dc04ad6e305c63fc2f5ad00c91dd21bceb6b2e2` — merge of [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133) (`abc8510` feat(H+E2) browser WebCodecs) |
| Frontend | Lovable **Publish** of that merge to https://aivideotool.lovable.app |
| Edge | **none** from this lane. Publish ≠ edge redeploy |
| Prior INCOMPLETE | Live toast after #129 Publish (~1:19 AM CT): `INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced` — encode-first, no browser decode. Record: [`PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](./PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md) |
| Prior false FAIL | Pre-#129: `FAIL 6/9 frames=8 mp4=none` — 8-frame in-memory window scored as the gate. Fixed by attaching `committedPlayableMp4Ref()` encode-first |
| Session | signed-in AVT owner (durable account; **Sign out** visible) |
| Still gates | chest 1m CLEARED 11/11 + sleeve 1c CLEARED 6/6 — **not reopened** |

Publish ≠ edge redeploy. This record does **not** Publish or redeploy anything.

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
| Publish mirror | `https://aivideotool.lovable.app/reconstruct/playable-76fe7438.mp4` (same-origin `public/` tree) |
| Working raster | **720×1280** |
| Frame count | **72** |
| fps | **24** |
| Duration | **3.0 s** |
| Codec / pixel format | H.264 / `yuv420p` |
| Container | MP4 (`mov,mp4,…`) |
| Byte length | 486769 |
| SHA-256 | `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b` |
| Provenance master | `76fe7438-671d-4428-a7f6-17a45e98c16f` |

Probed on this evidence branch from `main` @ `7dc04ad` (`ffprobe` + `sha256sum` on the committed file). **[V]** Live GET of the published mirror returned the **same** sha256 and byte length. Matches [`provenance.json`](artifacts/playable-76fe7438/provenance.json). Committed [`video-qa.json`](artifacts/playable-76fe7438/video-qa.json) stays the encode-first INCOMPLETE snapshot (`awaiting: ["decoded_frames"]`) — this live click does **not** rewrite that file.

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

## Screenshot [O]

Committed under [`live-smoke/playable-export-evidence/`](./live-smoke/playable-export-evidence/) (upload from the live click; 2026-09-16 ~2:05 AM America/Chicago).

### `export-pass-toast-2026-09-16.png`

Signed-in AVT shell (Projects selected; **Sign out** in the footer). Hero Frame §7 PLAYABLE reconstruct export panel (purple) after the click. Status copy under **Export playable reconstruct $0** is the verbatim toast (compose SUCCESS + E2 `PASS 3/9 fail=0 skip=6 frames=8 mp4=produced` + `browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 …`). JSON panel shows `schemaVersion: avt.reconstruct.playable.e2-hook.v1`, `scoringOwner: lane_e2`, `scoringModules: src/lib/eval/**`, `playableVersion: 1.0.0`, `mediaKind: canonical_720x1280_still_derived`. DIRECTOR PHASE 1 overlay is present (Hold to talk; read-only). Cyan **Run reconstruct E2E $0** gate is visible above the PLAYABLE panel. No 401 / sign-in banner. No paid-generation copy. No chest/sleeve paint click.

---

## What is / is not claimed [D]

**Claimed / CLEARED (this record):**

- Live 8-frame UI-window compose SUCCESS after #133 Publish (`paidCalls=false`).
- Live WebCodecs **sample** decode of the committed gate MP4 → E2 **PASS** `frames=8` `fail=0` `mp4=produced` `stillGoldensReopened=false`.
- `browserDecode=webcodecs` `720×1280` `liveSample` `maxFrames=8` of `source=72` (explicitly **not** the 8-frame UI compose).
- Gate MP4 remains the committed 72-frame H.264 file (sha256 `71f54599…`, master `76fe7438`), including the live Publish mirror.

**Not claimed (not FAILs):**

- Full 72-frame live browser score of the gate MP4 (memory cap; full 72f is node/ffmpeg CI)
- Live 241-frame / 1080 ingest of master `76fe7438`
- 2nd-clip live Hero Frame Export (`f31bd0f2` / `ysl-ice-on-v2-edited-clip`)
- Raising `temporal-propagate-proxy` `maxFrames` above 24
- CLEARED real-media gate final (Lane R locks stay **UNCLAIMED** — [`docs/regression/REAL_MEDIA_LOCKS.md`](../regression/REAL_MEDIA_LOCKS.md))
- Live SAM-3 fetch
- Chest 11/11 / sleeve 6/6 rescore
- A new edge redeploy / a newly encoded MP4 from this click
- Rewriting committed `video-qa.json`

---

## Hard locks honored [D]

- No chest / sleeve paint edits. No new still-repair POST. No still-golden rescore.
- No Lovable-managed code. No `architecture-c-still-repair-proxy` / `temporal-propagate-proxy` / `sam3-segment-proxy` redeploy.
- No V3 / paid Grok / Fal / Control Center / proxy-auth widen / PR #37.
- No live SAM-3 fetch (`sam3.liveFetch` stays false).
- `LIVE_PROXY_MAX_FRAMES` stays **24**.
- Real-media lock JSON not edited (`inventPassForbidden`).
