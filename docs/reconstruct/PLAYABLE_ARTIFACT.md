# Lane H — Playable Architecture C reconstructed MP4

**Issue:** [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111) (child of [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102); parent [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Class:** C (compositing / rendering / export) — isolated playable compose/export.  
**Spend:** $0 · `paidCalls=false` · `grokPerFrame=false` · no SAM-3 live fetch · no new edge.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What this is

The first **playable** Architecture C reconstructed video artifact at the Architecture C working raster **720×1280**, after RECONSTRUCT-1 E2E $0 PASS 9/9 on the 5-frame 80×128 fixture.

```
PlayableClipSpec
  → 720×1280 media pack (real still 2aa1a44c band-crop + unique-RGB master)
  → intended Stage 1h SAM-3 consume (provenance, fail-closed)
  → in-lib temporal propagateRepair in proxy-sized chunks (≤24) + stitch
  → reconstructOriginalMaster per frame
  → ffmpeg H.264 MP4 + E2 hook JSON
  → evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4)) → persist videoQaReportToJson
```

**[DECISION]** No new JWT edge. Live `temporal-propagate-proxy` stays `maxFrames=24` (YELLOW vs canonical 241). This lane does **not** raise the cap. Clips longer than 24 frames are **chunked ≤24, propagated, and stitched** in-lib so reconstruct still sees the full window.  
**[DECISION]** Intended SAM-3 is Stage 1h evidence at 720×1280 (`liveFetch=false`). Size mismatch fails closed — no silent 80×128 fixture.  
**[DECISION]** No paid Grok / V3 / Fal / CC. Chest 1m and sleeve 1c paint stay locked.  
**[DECISION]** Lane E2 owns scoring (`src/lib/eval/**`). Lane H calls `evaluateVideoQa` / `videoQaInputFromReconstructE2e` / `videoQaReportToJson` only. Encode-first with `frames:[]` is INCOMPLETE (`awaiting decoded_frames`); `blockingArtifactProducer` is always false.  
**[DECISION]** Live `temporal-propagate-proxy` stays `maxFrames=24` (YELLOW vs canonical 241). This lane does **not** raise the cap. Option (a) GREEN path: chunk temporal jobs ≤24 and stitch reconstruct. Live 1080×1920 ingest of `76fe7438` remains not claimed.  
**[DECISION]** D2 `reconstruct-lane-h-handoff-v2` is consumed for dims/fps/durationSec; codec/container stay null until this lane muxes.

---

## Artifact

| Field             | Claim                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Path              | [`docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4`](artifacts/playable-76fe7438/reconstructed.mp4) |
| Claims            | [`claims.json`](artifacts/playable-76fe7438/claims.json)                                                          |
| E2 hook           | [`e2-hook.json`](artifacts/playable-76fe7438/e2-hook.json)                                                        |
| E2 video QA       | [`video-qa.json`](artifacts/playable-76fe7438/video-qa.json) — `lane-e2-video-qa-v1`                               |
| D2 handoff v2     | [`lane-h-handoff.json`](artifacts/playable-76fe7438/lane-h-handoff.json)                                           |
| Provenance        | [`provenance.json`](artifacts/playable-76fe7438/provenance.json)                                                  |
| Working raster    | **720×1280**                                                                                                      |
| Frame count       | **72** (entire 3.0 s canonical window @ 24 fps)                                                                   |
| Keyframe          | index **19** (`t=0.785`)                                                                                          |
| Codec / container | H.264 / MP4 (`yuv420p`, `+faststart`)                                                                             |
| Audio             | none on this pack (source has no audio track)                                                                     |
| SHA-256           | `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`                                                 |
| Temporal          | chunk ≤24 + stitch (`chunkCount=4`, `raisedProxyMaxFrames=false`); MP4 SHA **unchanged** after switch              |
| Master provenance | `76fe7438-671d-4428-a7f6-17a45e98c16f`                                                                            |
| SAM-3             | `intended_stage1h_evidence` / `architecture_c_still_1h_sam3` / `liveFetch=false`                                  |

Produce / refresh:

```bash
npm run reconstruct:playable
```

---

## SAM-3 consume (production path)

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Source           | `intended_stage1h_evidence`                                        |
| Evidence         | `src/lib/garment/fixtures/architectureCStill1hSam3Evidence.ts`     |
| Commit           | `df64344c566cdb359468a9c2afd8afb4f7320d97` (Stage 1h measurements) |
| liveFetch        | **false** (no `sam3-segment-proxy` / CC)                           |
| Fallback         | **none** — size mismatch / missing required → **fail closed**      |
| Failure behavior | `fail_closed_size_mismatch` / `fail_closed_missing_required`       |
| Used as          | outfit α ∪ temporal masks; hands/face → repair punch-out           |

Caller-supplied SAM-3 is accepted only at `width×height`. An 80×128 fixture mask on a 720×1280 compose is rejected.

---

## What is / is not claimed

**[VERIFIED]** in-lib: 720×1280 compose, intended SAM-3 consume, in-lib temporal jobs, original-pixel preservation where α===0, playable H.264 MP4 via ffmpeg, E2 hook JSON, Lane E2 `evaluateVideoQa` plug-in (`blockingArtifactProducer=false`).

**[OBSERVED]** Lovable Cloud row for master `76fe7438` is stored as 1080×1920 HDR (`IMG_5633…`); Architecture C stills / SAM-3 / chest 1m / sleeve 1c are **720×1280**. This artifact uses the Architecture C working raster.

**Not claimed (not FAILs):**

- Live storage bytes of master `76fe7438` (1080×1920 HDR) decoded on this VM (JWT / storage sign)
- Live SAM-3 fetch via `sam3-segment-proxy`
- Chest 11/11 / sleeve 6/6 rescore
- Edge redeploy

---

## Stretch — second clip/project

`PlayableClipSpec` is clip-agnostic. A second project supplies `projectId`, `masterClipAssetId`, `stillAssetId`, `width`, `height`, `fps`, `frameCount`, `keyframeIndex` and calls `runPlayableCompose({ spec })`. Compose/encode/E2-hook do not branch on canonical IDs.

---

## Parent live-verify recipe

1. Merge this PR to `main`.
2. Lovable **frontend Publish** from `main`. **Do not** redeploy any edge function from this lane.
3. Sign in at `https://aivideotool.lovable.app` as the AVT owner.
4. Open Hero Frame:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
5. Scroll to **7 · Architecture C — still-first deterministic repair**.
6. Do **not** click chest or sleeve paint.
7. Confirm **Export playable reconstruct $0** is enabled.
8. Click once. Expect toast `PLAYABLE compose 720×1280 frames=8 … paidCalls=false.` plus Lane E2 `evaluateVideoQa` **INCOMPLETE** (encode-first on the committed 72-frame MP4, `awaiting decoded_frames`, `mp4=produced`, `fail=0`, `blockingArtifactProducer=false`, `stillGoldensReopened=false`). Do **not** expect FAIL — the 8-frame UI window is not decoded MP4 rasters.
9. Full-clip MP4 remains the ffmpeg artifact (72 frames) at the path above (`sha256` `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`). Persist path: `evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4))` → `video-qa.json`. Encode-first with `frames:[]` is INCOMPLETE (`awaiting decoded_frames`). Claimed MP4 with `produced=false` is INCOMPLETE (`awaiting mp4`), not FAIL.

**Live re-verify recorded:** 2026-09-16 ~1:19 AM America/Chicago (~06:19 UTC) after merge `f5f7d8a` ([PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129)) + Lovable frontend **Publish**. Signed-in owner, hard refresh, one click on **Export playable reconstruct $0**. Verbatim toast:

```
PLAYABLE compose 720×1280 frames=8 fps=24 preserved=true sam3=intended_stage1h_evidence paidCalls=false. Lane E2 video QA lane-e2-video-qa-v1: INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced paidCalls=false stillGoldensReopened=false.
```

Compose SUCCESS (8-frame UI window). E2 **INCOMPLETE** (not FAIL); `fail=0`; `mp4=produced`; `stillGoldensReopened=false`. Gate MP4 unchanged (`sha256` `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`). Write-up: [`PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md) · JSON: [`live-smoke/playable-export-incomplete.json`](live-smoke/playable-export-incomplete.json). **Not claimed:** decoded-frame E2 PASS (`frames=0`), live 241-frame/1080 ingest, CLEARED real-media gate final.

Publish ≠ edge redeploy.

---

## Ownership / collisions honored

| Surface                           | Action                              |
| --------------------------------- | ----------------------------------- |
| `src/lib/reconstruct/playable/**` | This lane                           |
| `src/lib/eval/**`                 | E2 — consume only, no edits         |
| `src/lib/temporal/**` QA metrics  | C2 — consume `propagateRepair` only |
| `src/lib/pipeline/**`             | G2 — not edited                     |
| logoComposite / sleeve paint      | not edited                          |
| finishing / Astra                 | F2 — not this lane                  |
