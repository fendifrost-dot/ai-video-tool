# YSL mask defects v0 — PROVISIONAL

**Not a frozen benchmark.** Full source SHA-256 and per-item SHA-256 are missing, so under [`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`](../../REPRODUCIBLE_BENCHMARK_SYSTEM.md) v1.0 this is an unverified sample. Do not use it to certify a model. An agent does not approve it.

Algorithm `ysl-defect-catalog-v0.1`. Scorecard: [`scorecard.md`](scorecard.md). Machine-readable set: [`catalog.json`](catalog.json). Actual cost of this pass: **$0.00**.

Class C (benchmarks) in [`docs/ARCHITECTURE_REVIEW.md`](../../ARCHITECTURE_REVIEW.md). Three sign-offs before any merge. This PR does not merge, does not publish, and does not change production behavior.

## What is already built

PR [#381](https://github.com/fendifrost-dot/ai-video-tool/pull/381) (`feat/sam3-person-masks`) is the flag-gated harness:

- `--segmenter {mediapipe,sam3}` on `body_only_swap.py` and `replace_him_in_clip.py`. Default remains `mediapipe`.
- `segmenter_compare.py` writes the contact sheet and `summary.json` (person pixels, face result, and, once a matte exists, SAM 3 pixels and IoU).
- `sam3_matte_runner.py` is the only GPU launcher. This catalog does not call it.

This branch adds the labeled set and `scripts/edit/ysl_mask_benchmark.py`, which scores that set and prints a plan. `--launch-gpu` exits 3 and submits nothing.

## Selected items

Eight documentary winners, plus one slot left empty on purpose. Song times on take `2f3723d0` are derived from song 75.885 s at frame 0 and 59.94 fps. They were not re-read from the file. Confidence is the score margin, not a pixel measurement. "Quote absent" means no Fendi sentence is on that winner.

| Slot | Category | What it is | Baseline | Defect / current |
|---|---|---|---|---|
| Missing black shoe | segmentation | c044 take `2f3723d0`, frames 50 and 90 (song 76.719 s, 77.387 s). MediaPipe labels the shoe accessory and stops short of the toe and sole. | MediaPipe crops on PR #381 | Defect dressed take `2b0f9208`. Board pick is black v6 `a563f683`. `c6454e98` is the later shoe-overhang fix, not the broken file. |
| Dark rim | segmentation | Same take, review frames 50 and 90. The rim Fendi named is the **veed** matte edge (`--choke`), not the MediaPipe multiclass mask. | veed job `8aa82631` (not in git) | Dressed v6 `eb492043` before the choke; choke result `888f7349`. |
| Double outline | compositing | Fendi on the lip-sync plate `35c85578`: "a double outline of me". Soft matte ghost of cap and head. Montage stretches are clip frames 36–62 and 84–96. The face redraw on that plate is **generation**, parked separately. | veed matte of `35c85578` | Defect dressed v3 `21b9b341`. Current board pick `a563f683`. |
| Small face | segmentation | Frames 0, 50, 90, 180. `summary.json` says the landmarker found him only through head zoom ×4. About 54 px wide. Not a profile turn. | `c044/mediapipe/summary.json` | The detection record itself. |
| Profile face | segmentation | **HYPOTHESIS.** c009 take `2ba10a60`, montage frames 51–79 (song 16.26–17.43 s), because metadata stores `clip_face`. The landmarker was not re-run. | manual rect, values not copied | Current output `be49e5b0`. |
| Hat flicker | generation | Frames 1, 12, 24, 36. The 12-frame GOP of the mp4v intermediate pulsed the cap. Not mask jitter. | handoff trace | Fixed put-back filed as dressed v9 `c0619701`. |
| Sleeve hold | generation | c033 source `c45e30c6-1922-4ca2-8e61-ca3852f5741e`. Clothes update at 22.25 fps on the approved file. No second candidate in the truncated set, so confidence is Low. | the recipe | Approved final `5482b35b-a4e6-4ad6-90a2-852afa01d87c`. |
| Protected brim | segmentation | Fendi: black space where the hat should be. The original brim sits inside the face oval, which the put-back keeps. A SAM 3 mask that paints over it fails the face proof. | brow cut | Defect v9 `c0619701`. Board pick `a563f683`. |

Mask frame-to-frame IoU is **not** a selected defect. No such measurement exists. `temporal_iou` in the runner is the metric to compute after a matte is local.

Generation items parked on purpose, and not treated as mask bugs: glasses inside the protected face, mouth redraw on `35c85578`, Genjutsu's garment rebuild, recolor `384bd8ed`, Nike identity on montage `60cd0232`.

**DECISION.** T7 is not mounted here, so the candidate universe is the ledger, the showroom handoff, the face-preserving recipe, and the MediaPipe sheets already on PR #381. Every frame of every take was not scored.

## Ready to run ($0)

On a machine that already has the c044 take and `AVT_MODELS` (this VM does not):

```
python3 scripts/edit/ysl_mask_benchmark.py --plan
python3 scripts/edit/segmenter_compare.py <c044 take> <out> --frames 0,50,90,180
```

The MediaPipe half for frames 0, 50, 90, and 180 is already committed:

`docs/research/results/2026-10-23-sam3-person-masks/c044/mediapipe/`

`comparable_from_summary` reads that `summary.json`. SAM 3 fields are null. Person pixels on frame 50 are 79274. Face is `head zoom x4` on all four frames.

Do not run `body_only_swap.py` or a new Dress from this plan. Any later put-back still has to print `max |out-original| on face/hair/skin: 0` before encode. MediaPipe stays the default.

## Approval needed before any GPU

| Run | Required | What | Cap | Expected | Blocker |
|---|---|---|---|---:|---|
| `sam3-c044-take` | yes | SAM 3 matte of take `2f3723d0` on HF Jobs `a10g-small`, timeout 30 m, then `segmenter_compare.py --sam3-matte` and `temporal_iou` locally at $0. Command already written in the PR #381 results note. | $0.50 | $0.05–$0.20 | `facebook/sam3` gated. Access requested 2026-10-23, still pending. |
| `sam3-c009-take-optional` | no | Same shape of job for take `2ba10a60`, only after a $0 landmarker log and after the c044 sheets are reviewed. | $0.50 | $0.05–$0.20 | Same gate, and no c009 MediaPipe sheet yet. |

Both dollar figures are **HYPOTHESIS**. The $1.00/h rate is the comment in `scripts/edit/sam3_matte_runner.py`. This pass did not re-fetch Hugging Face prices. 30 m × $1.00/h is the cap already coded on that runner. No Fal call. No second wardrobe generation.

## Tests and cost

`python -m pytest scripts/edit/tests/test_ysl_mask_benchmark.py` — 9 passed, no weights, no network, no clip. The CI job `python-segmenters` runs that file with the existing segmenter tests.

The byte-identical `body_only_swap` / `replace_him` checks were not re-executed in this VM: those tests set `HOME` to a temp directory, and OpenCV here is only on the user site, so the child process cannot import it. The scripts themselves were not edited. CI installs OpenCV onto the interpreter path and is the run that covers them.

Ledger row 183. Spent: **$0**.

## Blockers

1. No full SHA-256 of the source files or of the selected frames. Prefixes in the recipe and on PR #381 were not recomputed. The set cannot be frozen.
2. Human approval of the scorecard has not happened.
3. SAM 3 weights are still gated.
4. The veed alphas and the c009 `clip_face` numbers are cited, not stored in git.
5. Profile-face on c009 is a hypothesis until the landmarker is run on frames 51–79.
6. Mask temporal flicker is unmeasured.

## Coordination

[Control Center issue #78](https://github.com/fendifrost-dot/fendi-control-center/issues/78) is a messaging failure: the issue #77 assessment did not reach Agent Hub. This catalog does not depend on that delivery and does not change Control Center.

Direction comes from the approved audit, PR #379. Sampler is out of scope.
