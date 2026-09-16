# Lane D2 — Reconstruction video QA

**Issue:** [#108](https://github.com/fendifrost-dot/ai-video-tool/issues/108) (child of [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102); umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50); lineage [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100) / PR #99)  
**Class:** C (compositing / rendering) — isolated reconstruct QA + adapter defects. **No edge function. No Lovable code edits.**  
**Status:** automated **PASS 15/15** on 720×1280 unique-RGB frames (8-frame native, 24-frame full-clip, live-shaped 80×128 × 5 onto 720×1280). Live camera pixels of `76fe7438` remain **not claimed**.

Evidence: [`video-qa/preservation-720x1280.json`](video-qa/preservation-720x1280.json).  
Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## What this is

Sprint 2 Lane D2: run RECONSTRUCT-1 against **real temporal-shaped outputs**, not only the 4/5-frame 32×24 / 80×128 unique-RGB stand-in used by the Hero Frame E2E $0 click.

```
temporal-shaped jobs (native 720×1280 or live 80×128)
  + unique-RGB original-master frames at 720×1280
  + CLEARED chest/sleeve stamps (fixture RGB)
  + scaled identity punch-out inside the SAM-3 band
  → reconstructMasterClip
  → 15-criterion video QA + Lane H provenance handoff
```

**[DECISION]** Spend stays **$0**. `paidCalls=false`, `grokPerFrame=false`, `sam3LiveFetch=false`.  
**[DECISION]** Unique-RGB stand-ins at the canonical 720×1280 raster prove the compositing contract. They are **not** live camera bytes of `76fe7438`.  
**[DECISION]** JSON wire dispatch stays capped at 64×64 / 8 frames. Production-raster reconstruct is in-lib (`reconstructMasterClip` / `runReconstructVideoQa`).  
**[DECISION]** Lane H owns MP4 mux/encode. This lane emits `reconstruct-lane-h-handoff-v1` provenance only.

---

## Reconstruction-owned defects fixed

| Defect | Fix |
|--------|-----|
| SAM-3 identity punch-out used 32×24 `IDENTITY_RECT` pixel coords on any raster, so at 720×1280 the “face” box sat in the upper frame and missed the authorized garment band | `fixtureIdentityRect` uses normalized coords inside the SAM-3 band |
| `mergeAuthorization` threw when temporal mask size ≠ original frame size, so live 80×128 jobs could not composite onto 720×1280 originals | nearest-neighbor `scaleAlphaNearest` (no feather / dilate) |
| Quad stamps re-rasterized every frame (too expensive for 720×1280 clips) | cache chest/sleeve quad masks once per `reconstructMasterClip` |
| E2E pack always synthesized unique-RGB at the **temporal** raster | `packFromTemporalJobs(..., { originalFrames })` + `runReconstructE2e({ originalFrames })` |

---

## Automated criteria (15)

Harness:

```bash
npx vitest run src/lib/reconstruct/videoQa.test.ts src/lib/reconstruct/adapters.test.ts src/lib/reconstruct/e2e.test.ts
```

1. `paid_calls_false`
2. `grok_per_frame_false`
3. `sam3_live_fetch_false`
4. `original_preserved_unauthorized` — α === 0 copies original RGB
5. `independent_alpha_zero_bytes` — re-check without trusting the clip flag
6. `generated_is_not_master`
7. `identity_repair_preserved`
8. `background_corners_preserved`
9. `seam_no_unauthorized_leak` — 4-connected α===0 neighbors of the transform stay original
10. `frame_continuity_unauthorized`
11. `resolution_matches_master` — 720×1280 stays 720×1280
12. `fps_passthrough` — 24, metadata only
13. `audio_untouched` — reconstruct never mutates audio
14. `temporal_masks_consumed`
15. `still_goldens_not_reopened`

Escalate only if original-pixel preservation fails (`escalate.kind = architectural_blocker`). Do **not** reopen chest/sleeve still paint.

---

## Lane H MP4 provenance (interface only)

`src/lib/reconstruct/exportHandoff.ts` → `buildReconstructLaneHHandoff`.

| Reconstruct provides | Lane H owns |
|----------------------|-------------|
| Ordered frame RGBA (`reconstructProvides: "frame_rgba_sequence"`) | MP4 encode / mux |
| `originalPixelsPreservedWhereUnauthorized` + `unauthorizedLeakCount` | Review/export artifact |
| `fps` passthrough (24) | Container timing |
| `audio.passthrough: true`, `reconstructTouchesAudio: false` | Audio mux |

This lane does **not** import `src/lib/export/**`.

---

## Recorded runs (evidence JSON)

| Run | Raster | Frames | Temporal | Verdict |
|-----|--------|--------|----------|---------|
| `native_720x1280_translating` | 720×1280 | 8 | native translating chest | **PASS 15/15** |
| `full_clip_720x1280_24` | 720×1280 | 24 (1 s @ 24 fps) | native translating chest | **PASS 15/15** |
| `live_shaped_80x128_onto_720x1280` | originals 720×1280 | 5 | live-shaped 80×128 × 5, nearest-neighbor upsample | **PASS 15/15** |

The 0:03 player is 72 frames at 24 fps. The reconstruct loop is the same as the 24-frame run; 72 is not a separate algorithm.

---

## Not claimed (not FAILs)

- Live camera pixels of master `76fe7438` (no T7 / Lovable ingest in this lane).
- Live SAM-3 fetch.
- Chest 11/11 / sleeve 6/6 rescore.
- An MP4 file (Lane H).
- Hero Frame click path at 720×1280 (still the 80×128 luma fixture unless H/C pass originals).

---

## Ownership / hard locks

Owned: `src/lib/reconstruct/**`, this doc, `docs/reconstruct/video-qa/*`.

Not edited: `src/lib/eval/**` (E2), `src/lib/temporal/**` authorize (C2), `src/lib/pipeline/**` (G2), `src/lib/export/**` (H), chest/sleeve paint, Lovable, CC, proxy auth, PR #37, paid Grok.

Publish ≠ edge redeploy. **No edge redeploy** from this lane. Frontend Publish is **not** required (no UI change).
