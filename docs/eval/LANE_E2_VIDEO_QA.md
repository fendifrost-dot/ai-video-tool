# Lane E2 — Video-level automated evaluator

**Issue:** [#105](https://github.com/fendifrost-dot/ai-video-tool/issues/105) (child of sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102); umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))  
**Owner:** Lane E2 — `src/lib/eval/**` + this directory  
**Spec:** `lane-e2-video-qa-v1`  
**JSON Schema:** [`lane-e2-video-qa.schema.json`](lane-e2-video-qa.schema.json)  
**Class:** C (evaluation / fidelity thresholds). Thresholds are **PROVISIONAL** operational gates, not frozen canonical video goldens.  
**Spend:** `paidCalls=false`

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Mission

Upgrade evaluation from still-centric checks to **video-level QA**. Lane H produces the reconstructed MP4; E2 scores decoded frames plus MP4 provenance. The evaluator is generated **alongside** H — missing decode is `INCOMPLETE` with `blockingArtifactProducer: false`, never a reason to stall MP4 encode.

Chest 11/11 and sleeve 6/6 stay **LOCKED**. This module never calls `evaluateChestStill`. If video evidence suggests a still regression, **escalate** (`stillGoldensReopened: false`) — do not silently reopen goldens.

**[DECISION]** `evaluateVideoQa` is **project/clip-id agnostic**. Provenance IDs are recorded, never allowlisted. A second existing clip scores through the same probes.

---

## Full-clip 720×1280 fixture path (H / C2 / D2)

Hang real-media probes here — not on still goldens:

|             |                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Module      | `src/lib/eval/fixtures/fullClip720.ts`                                                                    |
| Raster      | **720×1280** (shape of the canonical still/video raster; synthetic unique-RGB, not live `76fe7438` bytes) |
| Frames      | 8 @ 24 fps                                                                                                |
| Hook        | `VIDEO_QA_REAL_MEDIA_HOOK` / `fullClip720FromDecodedFrames`                                               |
| Second clip | `secondClipFullClipInput()` — alternate project + master IDs                                              |
| Decode      | **false** — H supplies decoded RGBA + α                                                                   |

See [`fixtures/README.md`](fixtures/README.md).

```ts
import { evaluateVideoQa, fullClip720FromDecodedFrames, secondClipFullClipInput } from "@/lib/eval";

evaluateVideoQa(secondClipFullClipInput()); // $0 portability proof

evaluateVideoQa(
  fullClip720FromDecodedFrames(
    decoded720x1280Frames,
    {
      produced: true,
      path,
      mimeType: "video/mp4",
    },
    { masterClipAssetId: anyClipId },
  ),
);
```

---

## How Lane H plugs in

```ts
import {
  evaluateVideoQa,
  videoQaInputFromReconstructE2e,
  videoQaInputFromFrames,
  videoQaReportToJson,
  materializeVideoQaFiles,
} from "@/lib/eval";

// After RECONSTRUCT-1 E2E (frames in memory). Attach MP4 provenance when encode finishes.
const input = videoQaInputFromReconstructE2e(e2e, {
  produced: true,
  artifactId,
  path, // storage path or local artifact path
  sha256,
  byteLength,
  mimeType: "video/mp4",
});
const report = evaluateVideoQa(input);
const json = videoQaReportToJson(report); // persist next to the MP4
const files = materializeVideoQaFiles(report); // report.json + diagnostic PPM/BMP crops

// H may produce the MP4 first, then decode:
const pending = evaluateVideoQa(
  videoQaInputFromFrames({
    frames: [],
    mp4: { produced: true, path, mimeType: "video/mp4" },
  }),
);
// pending.verdict === "INCOMPLETE"
// pending.awaiting includes "decoded_frames"
// pending.blockingArtifactProducer === false  → keep encoding
```

**[DECISION]** E2 does **not** decode MP4 in-process (no `src/lib/video` / ffmpeg ownership). H (or an injected decoder owned by H) supplies RGBA rasters + per-frame α. The real-media gate is: given a produced reconstructed MP4 **and** decoded frames, E2 emits a complete PASS/FAIL JSON.

**[DECISION]** Lane H decode lives in `src/lib/reconstruct/playable/decodeMp4.ts` (node/ffmpeg) and `src/lib/reconstruct/playable/decodeMp4Browser.ts` (WebCodecs), plus `evaluatePlayableVideoQa({ decodedFrames })` (browser-safe plug-in). Live Export samples at most 8 frames of the 72-frame gate. See [`docs/reconstruct/PLAYABLE_DECODE.md`](../reconstruct/PLAYABLE_DECODE.md) and [`docs/reconstruct/PLAYABLE_BROWSER_DECODE.md`](../reconstruct/PLAYABLE_BROWSER_DECODE.md). Missing decode remains `INCOMPLETE` / `awaiting decoded_frames`.

**[DECISION]** A claimed `reconstructed_mp4` with `produced !== true` is **INCOMPLETE** (`awaiting: ["mp4"]`), never FAIL, even if in-memory frames are present. `mp4_artifact_scored` and the six visual probes SKIP. `blockingArtifactProducer` stays false. Frames-only (`kind: reconstructed_frames`, no mp4 object) still scores visuals. Encode-first with `produced: true` and `frames: []` stays INCOMPLETE awaiting `decoded_frames`.

Structural frame contract:

| Field                                  | Required for complete score                             |
| -------------------------------------- | ------------------------------------------------------- |
| `original` / `reconstructed` RGBA      | yes                                                     |
| `authorizedAlpha` `[0,1]` length `w*h` | original-master, outside-change, mask XOR, jitter, seam |
| `repairAlpha`                          | per-frame repair coverage (SKIP if omitted)             |
| `segmentationAlpha`                    | optional                                                |

---

## Criteria (`lane-e2-video-qa-v1`)

| id                                 | Probe                                                                  | PASS when                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `paid_calls_false`                 | Spend lock                                                             | `paidCalls === false`                                                           |
| `still_goldens_not_reopened`       | Still lock                                                             | always PASS (never calls chest/sleeve still gates)                              |
| `mp4_artifact_scored`              | Real-media hook                                                        | MP4 `produced` + decoded frames present; SKIP if frames-only, awaiting decode, or claimed MP4 not produced |
| `per_frame_repair_coverage`        | Repair α > 0.5 fraction                                                | coverage ≤ 0.85 and frame-to-frame \|Δ\| ≤ 0.25                                 |
| `original_master_preservation`     | α === 0 RGB vs original                                                | 0 unauthorized changed pixels                                                   |
| `unintended_outside_region_change` | Same bytes, product wording                                            | same hard gate as preservation                                                  |
| `mask_discontinuity`               | XOR of binarized α                                                     | mean ≤ 0.12 and max ≤ 0.25                                                      |
| `temporal_jitter_drift`            | Outside excess luma vs original motion; inside boiling; centroid drift | excess ≤ 1; inside mean \|Δluma\| ≤ 40; centroid ≤ 4 px                         |
| `seam_edge_instability`            | \|Δluma\| on soft-α / mask-boundary pixels                             | mean ≤ 25                                                                       |

Thresholds are **[DECISION] PROVISIONAL**, derived from documented formulas + synthetic fixture margins (happy-path excess = 0; leak/flicker/jump fixtures fail the named probe). They are **not** a frozen canonical-clip golden.

Overall verdict:

- `FAIL` if any criterion FAILs
- `INCOMPLETE` if no FAIL but `awaiting` or `unexplained` is non-empty
- `PASS` otherwise

`blockingArtifactProducer` is **always false**.

---

## Claude investigates only unexplained failures

**[DECISION]** Ordinary deterministic FAILs carry `failureReason` on the criterion. Do **not** page Claude for those.

Claude (or a human forensic pass) investigates **only** `unexplained[]`:

- missing / truncated raster
- original vs reconstructed size mismatch
- α length mismatch
- NaN / non-finite α samples that prevent classification

`claudeInvestigates: "unexplained_only"` is part of the JSON contract so orchestrators can route automatically.

---

## Still-golden lock / preservation FAIL escalation

**[DECISION]** `original_master_preservation` FAIL (unauthorized α === 0 pixels drifted from original RGB) is a **compositing contract break**, not a still-gate miss.

Contract (frozen example: [`preservation-escalate.example.json`](preservation-escalate.example.json)):

```json
{
  "stillGoldensReopened": false,
  "escalate": {
    "kind": "architectural_blocker",
    "message": "Original-master pixels drifted outside authorized α. Assign to reconstruct/compositing — do not reopen chest 11/11 or sleeve 6/6 still goldens.",
    "stillGoldensReopened": false
  }
}
```

| Field                           | Value                   | Why                                                     |
| ------------------------------- | ----------------------- | ------------------------------------------------------- |
| `report.stillGoldensReopened`   | `false`                 | E2 never calls `evaluateChestStill` / sleeve 6/6        |
| `escalate.kind`                 | `architectural_blocker` | Lane D2 / reconstruct owns unauthorized-pixel identity  |
| `escalate.stillGoldensReopened` | `false`                 | Escalate ≠ reopen. Do not silently rescore 11/11 or 6/6 |
| `unexplained`                   | `[]`                    | Classified FAIL — **Claude does not investigate**       |
| `claudeInvestigates`            | `unexplained_only`      | Ordinary `failureReason` stays on the criterion         |

Constant: `PRESERVATION_FAIL_ESCALATE` in `src/lib/eval/videoQaCriteria.ts`.

`still_golden_regression_suspected` is reserved for a later full-video evidence pack. It still must not reopen 11/11 or 6/6.

---

## Diagnostic crops

Worst-frame selection (documented algorithm, not a golden):

1. **outside_change** — frame with max unauthorized changed pixels; crop = bounding box of leaked pixels + 2 px pad
2. **seam** — frame with max seam pixel count; crop = seam bounding box + pad
3. **abs_diff** — luma abs-diff of a representative scored frame

Materialized as PPM + BMP via existing Lane E encoders.

---

## Ownership

| Path                                        | Role                                              |
| ------------------------------------------- | ------------------------------------------------- |
| `src/lib/eval/videoQaTypes.ts`              | Input / report / JSON types                       |
| `src/lib/eval/videoQaCriteria.ts`           | Provisional thresholds                            |
| `src/lib/eval/videoQaMetrics.ts`            | Pure probes                                       |
| `src/lib/eval/videoQaEvaluator.ts`          | `evaluateVideoQa`                                 |
| `src/lib/eval/videoQaAdapter.ts`            | Lane H plug-in from reconstruct E2E / frames      |
| `src/lib/eval/videoQaArtifacts.ts`          | JSON + crops                                      |
| `src/lib/eval/videoQaFixtures.ts`           | `$0` synthetic packs                              |
| `src/lib/eval/videoQaEvaluator.test.ts`     | Unit / fixture proofs                             |
| `src/lib/eval/fixtures/fullClip720.ts`      | 720×1280 synthetic clip + second-clip + hang hook |
| `src/lib/eval/videoQaFullClip.test.ts`      | Full-clip / portability / escalate contract       |
| `src/lib/eval/reconstructVideoEvaluator.ts` | Unchanged architectural 9-criterion E2E gate      |

### Not edited

Paint, temporal core, reconstruct math, pipeline OS, finishing, Control Center, proxy auth, paid Grok.

The architectural reconstruct eval (`lane-e-reconstruct-video-v1`, 9/9 E2E) remains. E2 **adds** `lane-e2-video-qa-v1` on top.

---

## Live Hero Frame export

**[OBSERVED]** 2026-09-16 ~1:19 AM America/Chicago (~06:19 UTC) after PR #129 Publish. Encode-first INCOMPLETE (no browser decode):

`Lane E2 video QA lane-e2-video-qa-v1: INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced paidCalls=false stillGoldensReopened=false.`

Write-up: [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md).

**[OBSERVED]** 2026-09-16 ~2:05 AM America/Chicago (~07:05 UTC) after [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133) merge `7dc04ad` + Lovable frontend Publish. Signed-in **Export playable reconstruct $0**. Verbatim E2 fragment:

`Lane E2 video QA lane-e2-video-qa-v1: PASS 3/9 fail=0 skip=6 frames=8 mp4=produced paidCalls=false stillGoldensReopened=false. browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 (not the 8-frame UI compose; full 72f is node/ffmpeg CI).`

That is a **bounded WebCodecs sample** of the committed 72-frame MP4 (`sha256` `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`): `mp4_artifact_scored` PASS + spend/lock PASSes; six visual probes SKIP (no α on lossy H.264). **Not** a full 72-frame live score on that click. Code default is now 72 (`LIVE_PLAYABLE_DECODE_MAX_FRAMES`); claimed toast after a later Publish is `fullDecode frames=72 source=72` or a documented fallback — [`PLAYABLE_BROWSER_DECODE.md`](../reconstruct/PLAYABLE_BROWSER_DECODE.md). Full write-up of the sample click: [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md).

---

## Not claimed

- Live 720×1280 decode of master `76fe7438` (H supplies that MP4; this suite scores a **synthetic** 720×1280 sequence of the same shape)
- In-process ffmpeg / mp4Demux inside `src/lib/eval/**` (H owns `decodeMp4.ts` / `decodeMp4Browser.ts`; E2 still does not decode)
- Full 72-frame browser decode of the gate MP4 (live caps at 8; CI/node can take all 72)
- Chest 11/11 or sleeve 6/6 rescore
- Architecture C paint correctness
- Temporal optical-flow internals
- Clip-id allowlisting inside `evaluateVideoQa` (provenance is opaque)
