# Lane H — second-clip playable reconstruct portability

**Sprint stretch under [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) / [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)**  
**After:** PLAYABLE-1 [#120](https://github.com/fendifrost-dot/ai-video-tool/pull/120) · E2 INCOMPLETE fix [#129](https://github.com/fendifrost-dot/ai-video-tool/pull/129)  
**Class:** C (compositing / export contract) — isolated playable bind.  
**Spend:** $0 · `paidCalls=false` · `grokPerFrame=false` · no SAM-3 live fetch · no new edge · **no Lovable Publish**.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

Pattern match: F2 [#119](https://github.com/fendifrost-dot/ai-video-tool/pull/119) · E2 [#123](https://github.com/fendifrost-dot/ai-video-tool/pull/123) · D2 [#125](https://github.com/fendifrost-dot/ai-video-tool/pull/125) · G2 [#126](https://github.com/fendifrost-dot/ai-video-tool/pull/126).

---

## Verdict

**[DECISION]** PLAYABLE compose / encode / E2-hook / Lane H handoff are **spec-parameterized**. They do not switch on master `76fe7438`. A second existing clip enters by filling `PlayableClipSpec` (or `playableSpecFromCatalog`).

**[VERIFIED in catalog]** Product OS already names the second existing clip:

| Field | Value |
|-------|--------|
| Catalog | `ysl-ice-on-v2-edited-clip` |
| Clip | `f31bd0f2-884f-42e1-8b08-aa645597b7a6` |
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` (same as canonical) |
| Parent original master | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Source | `src/lib/pipeline/catalog.ts` `SECOND_EXISTING_V2_EDITED_CLIP` |

**[VERIFIED in-lib]** `runPlayableCompose({ spec: secondClipPlayableSpec() })` records `masterClipAssetId=f31bd0f2…`, emits `reconstruct-lane-h-handoff-v2` with that id, and E2-hooks `evaluatorInput.masterClipAssetId` to the 2nd-clip artifact layout. `paidCalls=false`. `LIVE_PROXY_MAX_FRAMES` stays **24**. Chest 1m / sleeve 1c still goldens are **not** rescored (`stillGoldensReopened=false`).

**Live Hero Frame Export on the 2nd clip is NOT CLEARED.**

---

## How PLAYABLE-1 was bound to `76fe7438`

| Surface | Binding |
|---------|---------|
| `canonicalPlayableSpec()` / `heroFramePlayableSpec()` | `masterClipAssetId = CANONICAL_MASTER_CLIP_ID` (`76fe7438…`) |
| `runHeroFramePlayableExport()` | always `heroFramePlayableSpec()` |
| `committedPlayableMp4Ref()` | path/sha of `docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4` (72-frame gate) |
| `scripts/reconstruct-playable-artifact.ts` (pre-stretch) | hardcoded `OUT_DIR` + canonical spec |

**[DECISION]** Those canonical pins stay. They are the PLAYABLE-1 / Hero Frame §7 gate. Portability adds a **catalog bind**, not a replacement.

---

## What is constant (do not fork)

| Surface | Same for every catalog |
|---------|------------------------|
| Compose | `runPlayableCompose({ spec })` |
| Encode | `encodePlayableMp4` (ffmpeg H.264, no clip id in bitstream) |
| E2 hook | `buildPlayableE2Hook` records `masterClipAssetId` from spec |
| D2 handoff v2 | `buildPlayableLaneHHandoff` |
| Proxy cap | `LIVE_PROXY_MAX_FRAMES=24` (YELLOW vs canonical 241 — **do not raise**) |
| Raster recipe | `$0` unique-RGB 720×1280 + still `2aa1a44c` band-crop (`canonical_720x1280_still_derived`) |

**[DECISION]** Do **not** add `composeYsl.ts` / `encodeF31bd0f2.ts`. Ids live in `spec.ts` + `catalogBind.ts`.

---

## What changes per catalog (data, not code)

| Field | Canonical | `ysl-ice-on-v2-edited-clip` |
|-------|-----------|------------------------------|
| `catalogId` | `canonical-ysl-ice-on` | `ysl-ice-on-v2-edited-clip` |
| `masterClipAssetId` | `76fe7438-671d-4428-a7f6-17a45e98c16f` | `f31bd0f2-884f-42e1-8b08-aa645597b7a6` |
| `parentMasterClipAssetId` | (omit) | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Default window | 72 @ 24 fps (Architecture C 3.0 s) | **8** @ 24 fps (Hero-sized fixture) |
| Artifact dir | `playable-76fe7438/` | `playable-f31bd0f2/` |
| Live §7 Export | **CLEARED path** (after Publish of PLAYABLE-1) | **NOT CLEARED** |

Factory: `playableSpecFromCatalog("ysl-ice-on-v2-edited-clip")` / `secondClipPlayableSpec()`.

---

## Committed 2nd-clip fixture

Produce / refresh:

```bash
npm run reconstruct:playable:second-clip
```

| Field | Claim |
|-------|--------|
| Path | [`artifacts/playable-f31bd0f2/reconstructed.mp4`](artifacts/playable-f31bd0f2/reconstructed.mp4) |
| Working raster | **720×1280** |
| Frame count | **8** (short fixture window, not the 72-frame canonical encode) |
| FPS | 24 |
| Codec / container | H.264 / MP4 (`yuv420p`, `+faststart`) |
| Pixels | $0 still-derived unique-RGB + 2aa1a44c band-crop — **not** live Grok V2 `f31bd0f2` bytes |
| SAM-3 | intended Stage 1h evidence at 720×1280 (`liveFetch=false`) |
| Live Export | **NOT CLEARED** |

SHA-256 / byte length are pinned in `SECOND_CLIP_PLAYABLE_MP4_SHA256` after encode (see `claims.json` / `provenance.json`).

| Field | Value |
|-------|--------|
| SHA-256 | `2b5dde758780ddddcd74530225f4c6d600db29be5f7fe2a8847d7191265760fa` |
| Byte length | 387277 |
| Duration | 0.333 s (8 / 24) |

---

## What is / is not claimed

**[VERIFIED]** in-lib: catalog bind uses G2 ids (`ysl-ice-on-v2-edited-clip` / `f31bd0f2`); compose/encode/handoff/E2-hook do not branch on `76fe7438`; 720×1280 preservation where α===0; `maxFrames=24` unchanged; still goldens not reopened.

**[VERIFIED]** `livePlayableExportCleared("ysl-ice-on-v2-edited-clip") === false`. Hero Frame §7 still calls `heroFramePlayableSpec()` (canonical `76fe7438`).

**NOT CLEARED / not claimed (not FAILs):**

- Live **Export playable reconstruct $0** on clip `f31bd0f2` (Hero Frame UI / Lovable Publish)
- Live storage decode of Grok V2 edited_clip `f31bd0f2` or master `76fe7438` (1080×1920 HDR)
- Live SAM-3 fetch
- Raising `temporal-propagate-proxy` `maxFrames` above 24 (YELLOW vs 241)
- Chest 1m 11/11 or sleeve 1c 6/6 rescore on the 2nd clip
- 72-frame Architecture C window encode for `f31bd0f2` (canonical-only)
- 2nd-clip CLEARED still goldens (G2 catalog `chestStillCleared=false` / `sleeveStillCleared=false`)

---

## Kill criteria (portability)

1. Compose / encode / E2-hook / handoff start requiring `76fe7438`.
2. A second catalog needs a new playable TypeScript module besides `catalogBind.ts` / `spec.ts`.
3. Live proxy `maxFrames` is raised to “make the second clip work.”
4. Chest 1m / sleeve 1c still goldens are reopened.
5. Live Hero Frame Export is flipped on for `f31bd0f2` without a separate Class C + Publish.

---

## Ownership / collisions honored

| Surface | Action |
|---------|--------|
| `src/lib/reconstruct/playable/**` | This lane |
| `src/lib/pipeline/catalog.ts` | G2 — **consume ids in tests only**, no edits |
| `src/lib/eval/**` | E2 — consume only |
| `src/lib/temporal/**` QA metrics | C2 — consume `propagateRepair` only |
| logoComposite / sleeve paint | not edited |
| finishing / Astra | F2 — not this lane |
| Lovable Publish / edge | **not this step** |
