# SAM 3 person masks behind a flag — c044 before/after (23 Oct 2026)

Grok-initiated, approved by Fendi 23 Oct 2026. Branch `feat/sam3-person-masks`, not merged. $0 spent.

## Why

Fendi's rejections on c044 (PRs #362–#378) trace to the masks the put-back scripts make with MediaPipe
`selfie_multiclass_256x256` + `face_landmarker`:

| Rejection | Evidence | Mask cause |
|---|---|---|
| "the shoes have black space resembling a bad crop" (#375) | the original black patent shoe's toe and heel showed past the cream sneaker | the segmenter missed the dark shoe on the dark floor |
| "black space around me, the masking isn't accurate", "a double outline of me" (#374/#375) | worked around with `--choke/--despill` | the matte edge carried the take's wall shadow and floor |
| `first face detection at frame None`; mouth-still check OBSERVED not VERIFIED (#362/#371) | worked around with `AVT_HEAD_ZOOM=4` and manual `clip_face` rects | the landmarker misses small and profile faces |

Note on #374/#375: `replace_him_in_clip.py` does not segment with MediaPipe; its mattes are Fal
`veed/video-background-removal` files (ledger 175, 177, 179–181) and it uses the landmarker only for the face gain.
The dark rim is that matte's edge. The SAM 3 flag covers it the same way: either alpha argument may be `sam3`.

## What landed (code)

- `scripts/edit/segmenters.py` — backend selection (`--segmenter {mediapipe,sam3}`, env `AVT_SEGMENTER`, default
  mediapipe), the `Matte` contract (float32 (N, H, W) in [0, 1], fps; saved as grey H.264 + JSON sidecar), the SAM 3
  backend (transformers `Sam3VideoModel` text prompt on the whole clip; `Sam3TrackerVideoModel` when a point/box seed
  is given; `Sam3Model` for the single-frame face mask), gated-access handling, category refinement, face geometry
  from a face mask.
- `scripts/edit/body_only_swap.py` — argparse; under `sam3` the person region of both clips is refined by the matte
  (background inside the matte → clothes; MediaPipe-person outside the matte grown 2 px → background) and the face
  oval/brow/eye rows come from a SAM 3 "face" mask when the landmarker finds nothing. MediaPipe still labels
  skin/hair/face, so the proof `max |out-original| on face/hair/skin: 0` holds either way.
- `scripts/edit/replace_him_in_clip.py` — `clip_alpha` / `take_alpha` may be `sam3` or `sam3:<cache.mp4>` under
  `--segmenter sam3`; the face gain falls back to the SAM 3 face mask before the manual `clip_face` rect.
- `scripts/edit/sam3_matte.py` — one clip → matte file, locally (CUDA / MPS / CPU) or as the HF Jobs uv script.
- `scripts/edit/sam3_matte_runner.py` — Hugging Face Jobs launcher (a10g-small by default); exits 2 with instructions
  when no HF token exists; nothing is contacted. Modal was not chosen: the gated weights already need an HF token, a
  Modal token would be a second account for the same minutes.
- `scripts/edit/segmenter_compare.py` — the before/after sheets below.
- `scripts/edit/tests/test_segmenters.py` (+ a stub `mediapipe` package) — 20 tests without weights or network;
  CI job `python-segmenters` in `.github/workflows/ci.yml`.

## Verification

| Claim | Label | Evidence |
|---|---|---|
| Default path unchanged | **VERIFIED** | Old (`f0ff0bf`) and new scripts run on the same synthetic clips under the stub segmenter: decoded MD5 `f6a0b94b…` = `f6a0b94b…` (`body_only_swap`), `4466a67b…` = `4466a67b…` (`replace_him_in_clip`, with `--choke 2 --despill 4 --grain 3`). The test `test_body_only_swap_default_path_is_byte_identical_and_sam3_keeps_the_proof` repeats the no-flag / `--segmenter mediapipe` / `AVT_SEGMENTER=mediapipe` equality in CI. |
| Face proof under `sam3` | **VERIFIED on the synthetic clip** | `--segmenter sam3 --sam3-matte-dir` with precomputed mattes prints `max |out-original| on face/hair/skin: 0`. |
| Gated access fails fast | **VERIFIED** | `Sam3Backend._from_pretrained` turns `GatedRepoError` / HTTP 401 / 403 into `SAM 3 weights not accessible: request access at https://huggingface.co/facebook/sam3 and set HF_TOKEN (or run with --segmenter mediapipe)`; the token value never appears in the message or stdout (test). |
| Runner spends nothing without credentials | **VERIFIED** | With no `HF_TOKEN`, no hub token and no cached login the runner prints the how-to and exits 2 without creating the output folder (test). |
| transformers SAM 3 calls | **OBSERVED** (from the published docs, not executed) | `init_video_session` / `add_text_prompt` / `propagate_in_video_iterator` / `postprocess_outputs` (`object_ids`, `scores`, `boxes`, `masks`), `Sam3TrackerVideoProcessor.add_inputs_to_inference_session` / `post_process_masks`, `Sam3Processor.post_process_instance_segmentation`. First real run is the PENDING item. |
| Face geometry from a face mask (brow at 0.25 of the mask height, eyes at 0.40) | **HYPOTHESIS** | Only used when the landmarker finds nothing. Test: compare the rows against the landmarker's on a frame where both work (c033, frame 0). |

## c044 — MediaPipe "before" (made here, 23 Oct, real MediaPipe 1.1.1 on CPU)

Clip: the c044 take window `2f3723d0` (`c044_IMG6229_take_1080x1920_5994.mp4`, sha256 `f0ebd39f…`, 243 frames
59.94, his face ≈ 55 px wide at 1080). Command:

```
AVT_MODELS=<models> python3 scripts/edit/segmenter_compare.py c044_IMG6229_take_1080x1920_5994.mp4 out/mediapipe \
  --frames 0,50,90,180 --scale 0.5 \
  --crops shoe_floor=420,1460,260,180 shoe_wall=330,1290,220,200 face=400,820,170,170 edge=360,930,220,320
```

Files: `c044/mediapipe/compare_{000,050,090}.jpg` (frame | categories with the face oval), `crop_*_050.png`,
`crop_shoe_floor_090.png`, `summary.json`.

OBSERVED on the sheets:
- **Face:** on every sampled frame (0, 50, 90, 120, 180, 239) the landmarker finds his face only through the head
  zoom ×4 retry (`face: head zoom x4`), never in the plain search box. Without `AVT_HEAD_ZOOM` this clip is the
  `first face detection at frame None` case.
- **Shoe on the floor** (`crop_shoe_floor_050.png`): the segmenter labels the shoe "accessory" but the mask stops
  short of the toe and of the sole along the floor; those black pixels are outside him. That is the strip the
  put-back left as "black space".
- **Raised shoe on the wall** (`crop_shoe_wall_050.png`): inside the mask, but as a rounded blob; the sole and heel
  shape is gone.
- **Edge** (`crop_edge_050.png`): the 256×256 model's boundary is coarse at 1080 (≈4 px cells), the jacket outline
  does not follow the shoulder and sleeve, and the right hand is only partly labelled skin.
- Person pixels per frame ≈ 79–80 k (summary.json).

## c044 — SAM 3 "after": **DONE 24 Oct** — see `SAM3_C044_RESULTS_2026-10-24.md` (the text below is the original 23 Oct plan)

Not run: `facebook/sam3` is gated and access is still being requested; this machine had no `HF_TOKEN`, no
`~/.cache/huggingface/token`, no `~/.modal.toml`, no `hf`/`modal` CLI at launch, and the brief forbids obtaining
credentials. Nothing was launched, nothing spent.

When access is granted (one command, then the sheets; expect ≈ $0.05–0.20 of a10g-small, add a ledger row):

```
export HF_TOKEN=<token with read access to facebook/sam3>     # never in chat, code or commits
CLIP="/Volumes/T7/AVT VIDEO CLIPS/sam3_c044_2026-10-23/c044_IMG6229_take_1080x1920_5994.mp4"
OUT="/Volumes/T7/AVT VIDEO CLIPS/sam3_c044_2026-10-23/sam3"
python3 scripts/edit/sam3_matte_runner.py "$CLIP" "$OUT" --prompt "man in cap" --face-frames 0,50,90,180
#   (local GPU/MPS instead: python3 scripts/edit/sam3_matte.py "$CLIP" "$OUT/c044_IMG6229_take_1080x1920_5994.mp4.matte.mp4" --prompt "man in cap" --face-frames 0,50,90,180)
AVT_MODELS=<models> python3 scripts/edit/segmenter_compare.py "$CLIP" "$OUT/compare" --frames 0,50,90,180 --scale 0.5 \
  --sam3-matte "$OUT/c044_IMG6229_take_1080x1920_5994.mp4.matte.mp4" --sam3-face-dir "$OUT" \
  --crops shoe_floor=420,1460,260,180 shoe_wall=330,1290,220,200 face=400,820,170,170 edge=360,930,220,320
```

Then the put-back itself on the dressed line (the swap `b10be8bf` pasted back, for the proof and the shoe):

```
AVT_HEAD_ZOOM=4 AVT_MODELS=<models> python3 scripts/edit/body_only_swap.py "$CLIP" \
  "/Volumes/T7/AVT VIDEO CLIPS/sam3_c044_2026-10-23/c044_IMG6229_swap_pasted_1080x1920.mp4" "$OUT/put_back" \
  --segmenter sam3 --sam3-matte-dir "$OUT"          # the swap's matte is computed and saved there on first use
```

Acceptance for the "after": the floor shoe's toe and sole inside the matte on frames 50/90; the raised shoe's sole
shape kept; IoU and the orange/cyan counts in `summary.json`; `max |out-original| on face/hair/skin: 0` printed;
`segmenter sam3: face geometry from the SAM 3 face mask on 0 lookups` (the landmarker still finds him with the head
zoom; the fallback is for the profile shots). Commit the sheets next to the MediaPipe ones under `c044/sam3/`.

## Not done / decisions

- No change to approved board picks; c044 stays black v6 `a563f683`.
- No edge function touched, no redeploy, no Lovable change.
- Class B: an opt-in backend in the offline put-back scripts; the default path is byte-identical. If the SAM 3 path is
  ever made the default or written into the approved recipe, that is Class C (rendering) and needs the three sign-offs.
