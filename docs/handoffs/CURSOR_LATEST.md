# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Lane H + E2 — decode playable MP4 → `frames>0` (not live INCOMPLETE-only)

Sprint **#102** / umbrella **#50**. Advance past live encode-first INCOMPLETE (`frames=0`). Isolated playable decode + E2 plug-in. **Do not reopen chest 1m or sleeve 1c.** `paidCalls=false`. **No Lovable Publish.** **No merge.**

**[VERIFIED]** Live `frames=0` is encode-first: `runHeroFramePlayableExport` sets `includeDecodedFrames: false` so the 8-frame UI window is not scored as the 72-frame H.264 gate (that was false FAIL 6/9). E2 does not decode MP4.

**[VERIFIED in-lib]** H-owned `decodePlayableMp4` (node/ffmpeg) + `evaluatePlayableVideoQa({ decodedFrames })` scores the committed `playable-76fe7438` bytes (or a tiny fixture / injected pack) with **`frames>0`**, `mp4_artifact_scored=PASS`, `stillGoldensReopened=false`. Empty decode keeps **INCOMPLETE** `awaiting decoded_frames`.

**Live click after Publish of this PR:** still **INCOMPLETE** `frames=0` — browser has no ffmpeg; the control does not import `decodeMp4.ts`. GREEN here is CI/node decode, not a new live toast.

Write-up: [`docs/reconstruct/PLAYABLE_DECODE.md`](docs/reconstruct/PLAYABLE_DECODE.md)  
PR: [#132](https://github.com/fendifrost-dot/ai-video-tool/pull/132) (READY, do not merge, do not Publish).

## Lane H stretch — 2nd-clip playable portability (`f31bd0f2`)

Sprint **#102** / umbrella **#50**. After PLAYABLE-1 **#120** and E2 INCOMPLETE **#129**. Isolated `src/lib/reconstruct/playable/**` + docs. **Do not reopen chest 1m or sleeve 1c.** `paidCalls=false`. **No Lovable Publish.**

**[VERIFIED in-lib]** Catalog `ysl-ice-on-v2-edited-clip` / clip `f31bd0f2-884f-42e1-8b08-aa645597b7a6` (G2 `SECOND_EXISTING_V2_EDITED_CLIP`) fills `PlayableClipSpec`. Compose / encode / E2-hook / Lane H handoff v2 do **not** switch on master `76fe7438`. `LIVE_PROXY_MAX_FRAMES` stays **24**.

**Live Hero Frame Export on the 2nd clip is NOT CLEARED.** §7 still uses `heroFramePlayableSpec()` + `committedPlayableMp4Ref()` (canonical 72-frame `playable-76fe7438`).

8-frame 720×1280 fixture: `docs/reconstruct/artifacts/playable-f31bd0f2/`. Pixels are the $0 still-derived unique-RGB pack — **not** live Grok V2 bytes.

Write-up: [`docs/reconstruct/PLAYABLE_PORTABILITY.md`](docs/reconstruct/PLAYABLE_PORTABILITY.md)

## Live re-verify — Hero Frame export E2 INCOMPLETE 2/9 (after PR #129 Publish)

Work-order: sprint **#102** · related **#128** / merged PR **#129** (`f5f7d8a`) · umbrella **#50**. **Class A docs.** `paidCalls=false`. No paint / edge / Lovable runtime.

**When:** 2026-09-16 ~1:19 AM America/Chicago (~06:19 UTC). Signed in, hard refresh, one click on **Export playable reconstruct $0** at `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`.

Verbatim toast:

```
PLAYABLE compose 720×1280 frames=8 fps=24 preserved=true sam3=intended_stage1h_evidence paidCalls=false. Lane E2 video QA lane-e2-video-qa-v1: INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced paidCalls=false stillGoldensReopened=false.
```

| Read | Result |
|------|--------|
| Compose | **SUCCESS** — 8-frame UI window |
| E2 | **INCOMPLETE 2/9** (not FAIL); `fail=0`; `skip=7`; `frames=0`; `mp4=produced`; `stillGoldensReopened=false` |
| Prior false FAIL 6/9 (`mp4=none`) | **fixed** by #129 |
| Gate MP4 | committed `docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4` — 720×1280, 72 frames, 24 fps, 3.0s, H.264, `sha256` `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`, provenance master `76fe7438` |

**Not claimed:** decoded-frame E2 PASS (`frames=0`), live 241-frame/1080 ingest, CLEARED real-media gate final (locks stay UNCLAIMED).

Write-up: `docs/reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`  
JSON: `docs/reconstruct/live-smoke/playable-export-incomplete.json`

**Publish ≠ edge redeploy.** This evidence PR does **not** Publish or redeploy.

### Prior false FAIL (pre-#129, kept for lineage)

Live toast before the fix: `FAIL 6/9 frames=8 mp4=none`. **[VERIFIED]** `FAIL 6/9` is `passCount/total` including SKIPs (6 PASS + 1 FAIL `centroidDriftPx` on the **8-frame in-memory window** + 2 SKIP), not 3 FAILs. H now attaches `committedPlayableMp4Ref()` encode-first; E2 treats claimed `reconstructed_mp4` with `produced !== true` as INCOMPLETE, never FAIL.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73) | YES (`9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B sleeve still **1c** | YES (PR #85 / #86) | YES (`fdb86b18`) | **CLEARED 6/6 — LOCKED** |
| Temporal live activation | YES (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | YES — `temporal-propagate-proxy` OPTIONS 200 / JWT only | **YES** |
| Hero Frame `temporalTrackingEnabled` | YES (`true` + `prepareHeroFrameTemporalDispatch` → `explicitArm`) | frontend Publish | **YES** |
| Hero Frame §7 Temporal Run control | YES (PR #95, `782adac`) | frontend Publish | **YES** |
| Temporal `$0` **click** smoke | YES (PR #97) | live product UI | **SUCCESS** — 3 jobs, `paidCalls=false` |
| Lane D original-master live wiring | YES (PR #92) | n/a — in-lib | YES (library) |
| **RECONSTRUCT-1 E2E $0** | YES (PR #99, `58b8a49`) | frontend Publish | **PASS 9/9** — `paidCalls=false`, `frames=5` |
| **Lane D2 reconstruct video QA** | YES (PR #118, issue **#108**) | n/a — in-lib, no Publish | **PASS 15/15** unique-RGB 720×1280 |
| **Lane E2 video QA** | YES (PR **#116** / **#123** / **#129** + H decode PR) | live §7 export after Publish | **INCOMPLETE 2/9** live (`frames=0`); **in-lib decode** scores `frames>0` off committed MP4 bytes |
| **Lane H playable 720×1280 MP4** | YES (PR **#120** / **#129**) | frontend Publish of #129 | **LIVE INCOMPLETE** — 2026-09-16 ~1:19 AM CT; decode wiring is node/Vitest |
| Lane C2 temporal video QA (full clip) | YES (PR #113, issue **#107**) | n/a — in-lib | **READY** — 241-frame metrics, `paidCalls=false` |
| Lane C2 chunked proxy QA + 2nd clip | YES (PR #127, issue **#124**) | n/a — in-lib | **READY** — ≤24-frame windows, seams YELLOW named |
| Lane R real-media lock placeholders | YES (PR #121, issue **#115**) | n/a — docs/tests | **UNCLAIMED** — live export re-verify does **not** claim these |
| **Lane H 2nd-clip portability** | YES (PR **#131**) | n/a — in-lib, no Publish | **READY in-lib** — catalog `f31bd0f2`; live Export on 2nd clip **NOT CLEARED** |

## Lane D2 — Reconstruction video QA

Work-order: GitHub **#108** (parent **#102**, umbrella **#50**, lineage **#100** / **#99**). Isolated `src/lib/reconstruct/**`. **Do not reopen chest 1m or sleeve paint.** No Lovable code edits. No eval / temporal / pipeline / export implementation.

| Field | Value |
|-------|--------|
| `paidCalls` / `grokPerFrame` / `sam3LiveFetch` | `false` |
| Native 720×1280 translating | **PASS 15/15** frames=8 |
| Full-clip 720×1280 @ 24 fps | **PASS 15/15** frames=24 |
| Live-shaped 80×128 × 5 onto 720×1280 | **PASS 15/15** (nearest-neighbor temporal upsample) |
| Unauthorized leaks | **0** |
| Lane H handoff | `reconstruct-lane-h-handoff-v1` — frame RGBA + fps/audio passthrough; **H owns MP4** |
| Escalate / still-golden reopen | **none** |

Write-up: `docs/reconstruct/VIDEO_QA.md`  
JSON: `docs/reconstruct/video-qa/preservation-720x1280.json`

**Publish ≠ edge redeploy.** No UI change → **no frontend Publish required**. No still-repair / temporal / SAM-3 redeploy.

**Not claimed:** live camera pixels of master `76fe7438`, live SAM-3 fetch, still-golden rescore, MP4 encode (Lane H).

## Lane C2 — Temporal video QA (full canonical clip)

Work-order: GitHub **#107** (sprint **#102**, umbrella **#50**). Measurement-only. **Do not reopen chest 1m or sleeve paint.** **Do not raise `maxFrames=24`.**

In-lib `propagateRepair` on a 241-frame synthetic luma stand-in of master `76fe7438` (native 1080×1920 / 59.94 fps / keyframe index 47). JSON schema `temporal-video-qa-v1`: drift / flicker / coverage / occlusion continuity + SAM-3-shaped continuity (`sam3LiveFetch=false`). Authenticated 5-frame `temporal-propagate-proxy` path stays locked (`paidCalls=false`, `explicitArm` required). 241-frame wire clip is still rejected.

Write-up: `docs/temporal/VIDEO_QA.md`  
Schema: `docs/temporal/video-qa/schema.json`  
Emit: `npx tsx scripts/temporal-video-qa.mts`

**YELLOW:** proxy `maxFrames=24` vs canonical 241; live 1080×1920 ingest; Lane E2 should consume this schema; SAM-3 is not live-fetched.

**Not claimed:** live native pixels of `76fe7438`, live SAM-3 fetch, still-golden rescore, MP4 encode, proxy cap raise.

## Lane C2 — Chunked proxy QA + second-clip portability

Work-order: GitHub **#124** (prior **#107** / PR **#113**, sprint **#102**, merged PR **#127**). `src/lib/temporal/**` QA only. **Do not raise `maxFrames=24`.** No Lovable edits.

≤24-frame overlap-1 windows, seed reindexed to local 0, `explicitArm` / `paidCalls=false`, stitched globals. Second clip spec `temporal-qa-second-clip-synthetic` (72 @ 24 fps). **YELLOW:** proxy re-paints CLEARED quads each window — translating seams prove chunking is insufficient without a carried-mask wire field.

**Not claimed:** live native pixels, live SAM-3, `maxFrames` raise, Lovable proxy wire change.

## PLAYABLE-1 — 720×1280 reconstructed MP4

Work-order: GitHub **#111** (parent **#102** / **#50**). Isolated compose/export. **Do not reopen chest 1m or sleeve paint.**

| Field | Value |
|-------|--------|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Master clip provenance | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Working raster | **720×1280** @ 24 fps · **72** frames · **3.000 s** |
| Codec | H.264 `yuv420p` / MP4 (`mov,mp4,…`) |
| Audio | none (source pack has no audio) |
| SAM-3 | `intended_stage1h_evidence` / `liveFetch=false` / fail-closed |
| Preservation | `originalPixelsPreservedWhereUnauthorized=true` |
| Spend | `paidCalls=false` `grokPerFrame=false` |
| Temporal | chunk ≤24 + stitch (`raisedProxyMaxFrames=false`; YELLOW 241 vs 24) |
| E2 contract | `evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4))` → persist `videoQaReportToJson` |
| Artifact | `docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4` |

**Publish ≠ edge redeploy.** No still-repair / temporal / SAM-3 redeploy from this lane.

**Not claimed:** live storage decode of `76fe7438` (DB row is 1080×1920 HDR); live SAM-3 fetch. Live proxy full-clip stays **YELLOW** (`maxFrames=24` vs canonical 241) — Lane H does **not** raise the cap. GREEN path: chunk ≤24 + stitch. Architecture C window is 72-frame / 720×1280 still-derived.

Write-up: [`docs/reconstruct/PLAYABLE_ARTIFACT.md`](docs/reconstruct/PLAYABLE_ARTIFACT.md) · 2nd-clip stretch: [`docs/reconstruct/PLAYABLE_PORTABILITY.md`](docs/reconstruct/PLAYABLE_PORTABILITY.md)

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- garment `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f`
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
