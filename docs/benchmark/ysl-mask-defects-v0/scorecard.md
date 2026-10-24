# YSL mask-defect scorecard

**Status: PROVISIONAL.** Not frozen. Full source SHA-256 and per-item SHA-256 are MISSING, so this is an unverified sample under `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md` v1.0. An agent does not approve it.

Algorithm: `ysl-defect-catalog-v0.1`. Actual cost of producing this scorecard: **$0.00**.

**DECISION (truncation).** T7 media is not on this machine. The candidate universe is the documentary set: ledger rows that name these defects, the c044/c009 paragraphs in docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md, docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, and the MediaPipe sheets already on PR #381. Every frame of every take was not loaded or scored.

## Selected items

| Slot | Winner | Runner-up | Margin | Confidence | Category | Source | When | Baseline | Defect output | Current output |
|---|---|---|---:|---|---|---|---|---|---|---|
| `missing_black_shoe` | `shoe-floor-c044` | `shoe-wall-blob-c044` | 2 | Med | segmentation | `2f3723d0` | f50 → song 76.719s; f90 → song 77.387s | mediapipe | `2b0f9208` | `a563f683` |
| `black_halo_dark_rim` | `halo-veed-rim-c044` | `halo-mediapipe-cells-c044` | 1 | Med | segmentation | `2f3723d0` | f50 → song 76.719s; f90 → song 77.387s | veed | `eb492043` | `888f7349` |
| `double_silhouette` | `ghost-lipsync-matte-c044` | `ghost-telea-fill` | 5 | High | compositing | `35c85578` | montage clip frames 36-62 and 84-96; post-fix check frames 45 and 62 | veed | `21b9b341` | `a563f683` |
| `small_face_landmarker` | `small-face-c044` | `small-face-c033-fallback` | 1 | Med, quote absent | segmentation | `2f3723d0` | f0 → song 75.885s; f50 → song 76.719s; f90 → song 77.387s; f180 → song 78.888s | mediapipe_face_landmarker | `—` | `—` |
| `profile_face_manual` | `profile-c009-clip-face` | `profile-clip-face-no-shot` | 4 | High, quote absent | segmentation | `2ba10a60` | montage clip frames 51-79; song 16.26-17.43 s | manual_rect | `—` | `be49e5b0` |
| `edge_flicker_encode` | `flicker-hat-gop-c044` | `flicker-residual-cadence-c044` | 2 | Med | generation | `2f3723d0` | f1 → song 75.902s; f12 → song 76.085s; f24 → song 76.285s; f36 → song 76.486s | encode_trace | `c6454e98` | `c0619701` |
| `edge_flicker_generative_hold` | `hold-c033-clothes-22fps` | `—` | — | Low, quote absent | generation | `c45e30c6-1922-4ca2-8e61-ca3852f5741e` | full approved file, 240 frames; sleeve hold at 22.25 fps | recipe | `—` | `5482b35b-a4e6-4ad6-90a2-852afa01d87c` |
| `protected_brim` | `brim-protected-c044` | `brim-navy-fringe-c033` | 1 | Med | segmentation | `2f3723d0` | 4x crops of the put-back; frame indexes not listed in the handoff | face_protection_cut | `c0619701` | `a563f683` |
| `edge_flicker_mask_temporal` | — | — | — | — | untested | unselected | — | — | — | — |

Song times on take `2f3723d0` are **DERIVED** from song 75.885 s at frame 0 and fps 59.94005994005994. They were not re-read from the file.

## Full scores

### `missing_black_shoe`

Winner `shoe-floor-c044` total 9, runner-up `shoe-wall-blob-c044` total 7, margin 2, confidence Med. The winner carries a Fendi quote.

- `shoe-floor-c044` (selectable) named_rejection=2 source_asset=1 timecode=2 baseline=2 output_asset=1 category_explicit=1 total=9 — OBSERVED: docs/research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md; docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md (cause 1)
- `shoe-wall-blob-c044` (selectable) named_rejection=1 source_asset=1 timecode=2 baseline=2 output_asset=0 category_explicit=1 total=7 — OBSERVED: docs/research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md

### `black_halo_dark_rim`

Winner `halo-veed-rim-c044` total 8, runner-up `halo-mediapipe-cells-c044` total 7, margin 1, confidence Med. The winner carries a Fendi quote.

- `halo-veed-rim-c044` (selectable) named_rejection=2 source_asset=1 timecode=2 baseline=1 output_asset=1 category_explicit=1 total=8 — OBSERVED: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md (cause 2); scripts/edit/replace_him_in_clip.py --choke help
- `halo-mediapipe-cells-c044` (selectable) named_rejection=1 source_asset=1 timecode=2 baseline=2 output_asset=0 category_explicit=1 total=7 — OBSERVED: docs/research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md

### `double_silhouette`

Winner `ghost-lipsync-matte-c044` total 7, runner-up `ghost-telea-fill` total 2, margin 5, confidence High. The winner carries a Fendi quote.

- `ghost-lipsync-matte-c044` (selectable) named_rejection=2 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=7 — OBSERVED: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md; docs/LEDGER_YSL_TESTING_BUDGET.md rows 177-178
- `ghost-telea-fill` (selectable) named_rejection=1 source_asset=0 timecode=0 baseline=0 output_asset=0 category_explicit=1 total=2 — VERIFIED: scripts/edit/replace_him_in_clip.py module docstring

### `small_face_landmarker`

Winner `small-face-c044` total 7, runner-up `small-face-c033-fallback` total 6, margin 1, confidence Med. Evidence ceiling: no Fendi quote on the winner, so the margin is not proof of the defect.

- `small-face-c044` (selectable) named_rejection=1 source_asset=1 timecode=2 baseline=2 output_asset=0 category_explicit=1 total=7 — VERIFIED: docs/research/results/2026-10-23-sam3-person-masks/c044/mediapipe/summary.json
- `small-face-c033-fallback` (selectable) named_rejection=1 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=6 — VERIFIED: docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md limitations

### `profile_face_manual`

Winner `profile-c009-clip-face` total 5, runner-up `profile-clip-face-no-shot` total 1, margin 4, confidence High. Evidence ceiling: no Fendi quote on the winner, so the margin is not proof of the defect.

- `profile-c009-clip-face` (selectable) named_rejection=0 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=5 — HYPOTHESIS: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md says c009 stores clip_face in metadata. scripts/edit/replace_him_in_clip.py says clip_face is the generated face when the landmarker misses it (profile, cap). This run did not execute the landmarker on c009.
- `profile-clip-face-no-shot` (selectable) named_rejection=0 source_asset=0 timecode=0 baseline=0 output_asset=0 category_explicit=1 total=1 — HYPOTHESIS: scripts/edit/replace_him_in_clip.py argparse help for clip_face. No asset.

### `edge_flicker_encode`

Winner `flicker-hat-gop-c044` total 8, runner-up `flicker-residual-cadence-c044` total 6, margin 2, confidence Med. The winner carries a Fendi quote.

- `flicker-hat-gop-c044` (selectable) named_rejection=2 source_asset=1 timecode=2 baseline=1 output_asset=1 category_explicit=1 total=8 — OBSERVED: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md; docs/LEDGER_YSL_TESTING_BUDGET.md row 180
- `flicker-residual-cadence-c044` (selectable) named_rejection=1 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=6 — OBSERVED: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md

### `edge_flicker_generative_hold`

Winner `hold-c033-clothes-22fps` total 6, runner-up `—` total —, margin —, confidence Low. Evidence ceiling: no Fendi quote on the winner, so the margin is not proof of the defect.

- `hold-c033-clothes-22fps` (selectable) named_rejection=1 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=6 — VERIFIED: docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md

### `protected_brim`

Winner `brim-protected-c044` total 7, runner-up `brim-navy-fringe-c033` total 6, margin 1, confidence Med. The winner carries a Fendi quote.

- `brim-protected-c044` (selectable) named_rejection=2 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=7 — OBSERVED: docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md
- `brim-navy-fringe-c033` (selectable) named_rejection=1 source_asset=1 timecode=1 baseline=1 output_asset=1 category_explicit=1 total=6 — VERIFIED: docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md limitations

### `edge_flicker_mask_temporal`

Not selected. This slot is a metric holder, not a claimed defect.

- `mask-temporal-untested` (not selectable) named_rejection=0 source_asset=1 timecode=2 baseline=0 output_asset=0 category_explicit=1 total=4 — HYPOTHESIS: No measurement of mask IoU between consecutive frames is in the ledger or the MediaPipe summary.

## Face protection

Required proof, unchanged: `max |out-original| on face/hair/skin == 0`. Replace original face, mouth, beard, or hands. A higher person IoU that eats the protected brim is not a pass. Default segmenter remains `mediapipe`.

## Parked generation (not mask items)

- `glasses-kept` (generation): The outfit glasses reference does not affect the final. His own glasses stay because they sit inside the protected face. Not a mask miss.
- `mouth-lipsync-35c85578` (generation): fal-ai/sync-lipsync/v2 redrew faces on 35c85578. Mouth timing on a body-only file is the take's. Do not open a new lip-sync run from this catalog.
- `garment-is-genjutsu-rebuild` (generation): The garment in a body-only result is still Genjutsu's rebuild. Stripes, logos, and construction are generation, judged per shot. No new wardrobe generation until this catalog is the baseline Fendi is looking at.
- `recolor-384bd8ed` (generation): Cap recolor and darker jeans, asset 384bd8ed, dressed v10 d945e659, rejected. Ledger 181. Not a segmentation item.
- `nike-identity-60cd0232` (generation): Ledger 101: cream shoe swap on montage 60cd0232 left the Nike AF1s. Region swap 03794fcc at 3.3-4.05 s was a later generation pass, Fendi approved that pair. Not the missing-shoe mask on take 2f3723d0.

## Approval-needed runs (not started)

| Run | Required | Hardware | Hard cap | Expected | Status |
|---|---|---|---:|---|---|
| `sam3-c044-take` | True | HF Jobs a10g-small | $0.50 | $0.05–$0.20 (HYPOTHESIS) | NOT_RUN |
| `sam3-c009-take-optional` | False | HF Jobs a10g-small | $0.50 | $0.05–$0.20 (HYPOTHESIS) | NOT_RUN |

The $1.00/h a10g-small rate is **HYPOTHESIS**: it is the comment in `scripts/edit/sam3_matte_runner.py`, not a price fetched for this scorecard. Timeout 30 m × $1.00/h = $0.50 hard cap per job. Nothing here was launched.

## Lineage

- benchmark_version: ysl-mask-defects-v0
- derived_from: Ledger, showroom handoff, face-preserving recipe, PR #381 MediaPipe sheets
- algorithm_version: ysl-defect-catalog-v0.1
- source_sha256: MISSING
- per_item_sha256: MISSING
- created: 2026-10-24
- purpose: Provisional labeled set for a future mask comparison. Not a frozen benchmark.

## Freeze checklist

- [ ] Full candidate set of frames loaded (this pass truncated on purpose)
- [x] Scoring method written and applied to every catalog candidate
- [x] Winner, runner-up, and margin recorded per selectable slot
- [x] Confidence assigned from the margin
- [x] Scorecard produced for a person to read
- [ ] Human approval — stopped here
- [ ] Frozen provenance package (source SHA-256 and per-item SHA-256 still MISSING)
- [ ] chmod 444 and SHA256SUMS

Coordination: https://github.com/fendifrost-dot/fendi-control-center/issues/78 — Issue 78 is a Control Center messaging failure: the issue 77 assessment did not reach Agent Hub. This AVT catalog does not depend on that delivery and does not change Control Center.
