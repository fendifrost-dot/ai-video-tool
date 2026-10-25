# Handoff — SAM 3 person masks behind a flag (Grok-initiated, 23 Oct 2026)

Branch `feat/sam3-person-masks`, one PR, **not merged**. Default behaviour of the put-back scripts is unchanged
(VERIFIED byte-identical). Results, evidence and the PENDING c044 run:
[`docs/research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md`](../research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md).

## Run it

| What | Command |
|---|---|
| Put-back as before | `python3 scripts/edit/body_only_swap.py <orig.mp4> <swap.mp4> <out_dir>` (or `--segmenter mediapipe`, or `AVT_SEGMENTER=mediapipe`) |
| Put-back with SAM 3 | `python3 scripts/edit/body_only_swap.py <orig.mp4> <swap.mp4> <out_dir> --segmenter sam3 [--sam3-prompt "man in cap"] [--sam3-matte-dir DIR] [--sam3-point x,y \| --sam3-box x0,y0,x1,y1] [--sam3-union]` |
| Real him in a clip, SAM 3 matte of the take | `python3 scripts/edit/replace_him_in_clip.py <clip.mp4> <clip_alpha.mp4> <take.mp4> sam3:<take.matte.mp4> <segments.json> <out.mp4> --segmenter sam3 …` (`sam3` alone caches into `--sam3-matte-dir`) |
| A matte file by itself, locally | `python3 scripts/edit/sam3_matte.py <clip.mp4> <out>.matte.mp4 --prompt "man in cap" [--face-frames 0,60] [--device cuda\|mps\|cpu]` |
| A matte file on a GPU (HF Jobs) | `python3 scripts/edit/sam3_matte_runner.py <clip.mp4> <out_dir> --prompt "man in cap" [--face-frames 0,60] [--flavor a10g-small] [--timeout 30m] [--dry-run]` |
| Before/after sheets | `python3 scripts/edit/segmenter_compare.py <clip.mp4> <out_dir> --frames 0,50 [--sam3-matte <matte.mp4> --sam3-face-dir DIR] [--crops name=x,y,w,h …]` |
| Tests | `python3 -m pytest scripts/edit/tests/test_segmenters.py` (numpy, OpenCV, pytest, ffmpeg; no mediapipe, no torch) |

Weights: `facebook/sam3` is gated. The token is read from `HF_TOKEN` (then `HUGGINGFACE_HUB_TOKEN`, then the hub's
cached login) and never printed. No access →
`SAM 3 weights not accessible: request access at https://huggingface.co/facebook/sam3 and set HF_TOKEN (or run with --segmenter mediapipe)`
(exit 3 from `sam3_matte.py`). Python deps for the SAM 3 path: `torch`, `transformers` (the release with
`Sam3VideoModel`), `accelerate`, `huggingface_hub`, `pillow` (listed in the PEP 723 header of `sam3_matte.py`).

## Spend rules carried in the code

- `sam3_matte_runner.py` launches **only** when an HF token already exists; otherwise it prints the how-to and exits 2
  having contacted nothing. `--dry-run` prints the plan. Every launched job: a ledger row from its duration
  (a10g-small $1.00/h; `--timeout 30m` is the cap).
- Nothing in this PR obtains credentials, signs up for anything, or touches edge functions, board picks or Lovable.

## Open items (for whoever holds the HF access)

1. Access to `facebook/sam3` granted → run the PENDING block in the results note (≈ $0.05–0.20), commit the sheets
   under `c044/sam3/`, add the ledger row, flip PENDING to the observed numbers.
2. First real execution of the transformers calls (labelled OBSERVED): if a kwarg differs from the docs the fix is in
   `segmenters.Sam3Backend` only.
3. The face-mask geometry proportions (HYPOTHESIS) against the landmarker on c033 frame 0.
4. Then Fendi's eye on a SAM 3 put-back of a real take before any recipe change (Class C).

## Pointers

- Canonical recipe (unchanged): [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md) (new section "Segmenter flag").
- c044 history: [`HANDOFF_BLENDER_SHOWROOM_2026-10-19.md`](HANDOFF_BLENDER_SHOWROOM_2026-10-19.md) item S.
- Ledger row 192 ($0): [`docs/LEDGER_YSL_TESTING_BUDGET.md`](../LEDGER_YSL_TESTING_BUDGET.md).
