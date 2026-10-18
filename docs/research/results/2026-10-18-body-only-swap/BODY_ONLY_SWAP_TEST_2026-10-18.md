# Body-only clothing swap: the face stays original pixels (18 Oct 2026)

**APPROVED by Fendi, 18 Oct 2026.** This is now the canonical method: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../../../recipes/FACE_PRESERVING_CLOTHING_SWAP.md). Approved final asset `5482b35b`.

Context: Claudia's pipeline handoff (18 Oct) names face integrity as pain point 1. Every generative step that touches Fendi's face changes it, and that includes the Genjutsu clothing swap: it re-renders the whole frame, with a ~15 px shift and a redrawn face. Fendi pointed to the c044 dressed take as the bar ("clothing swap perfect and mouth movement untouched").

**Spend: $0.** Existing files only (the c033 source cut and its existing Genjutsu output). No provider call.

## What was tested

`scripts/edit/body_only_swap.py <original> <genjutsu_output> <out_dir>`:

- **Alignment:** the Genjutsu output (already time-conformed to the source length) is aligned to the original frame at the same time. The fit is an ECC affine on the background, so Genjutsu's shift and rescale are undone.
- **Labelling:** a MediaPipe multiclass segmenter labels hair, body skin, face skin, clothes and accessories in both frames. The MediaPipe face landmarker gives the face shape.
- **From the swap:** clothes and accessories, plus the cap (above the brow line, over the head).
- **Always original:**
  - the face from the eyebrows down (eyes, glasses, nose, mouth, beard);
  - face skin and hair below the brows;
  - skin wherever the swap also shows skin (hands, neck).
  - A swap sleeve over the original bare arm wins, so the long-sleeve jacket is not cut by his short-sleeve shirt.

## Result on c033 (240 frames, 4.000 s, 1080×1920, 59.94 fps)

- **VERIFIED:** the max difference between output and original inside the protected face/hand region is **0 on every frame**. This is measured before the final video encode; the encode compresses every pixel equally, as any export does.
- **VERIFIED:** the repo copy of the script reproduces the tested output bit for bit (decoded-frame MD5).
- **OBSERVED (frame review):**
  - Jacket, jeans and tan cap come through.
  - Sleeves are correct on both arms.
  - The face, glasses and beard are the original take's, while in Genjutsu's whole-frame output they are redrawn.
  - Mouth timing is the original take's by construction.
- **Known artifacts (OBSERVED):**
  - **Cap edge:** a faint navy fringe in a few frames, where the original cap is larger than the swapped one.
  - **Clothing frame rate:** the clothes update at the swap's 22.25 fps (each swap frame is held for ~2.7 source frames). Watch the sleeves for judder at 1×.
  - **Background:** where the new garment's silhouette differs from the original, the swap's regraded background shows. That disappears once the background is replaced (composite lane).

## Answers to the handoff

- **Handoff question 2 (pixel-perfect face through a wardrobe swap):** yes, at $0. Run the Genjutsu swap whole-frame as today, then put only the garment back over the original pixels with this script. It is not a re-aligned face paste-back: the face is never moved or redrawn.
- **Why c044 looked "perfect":** c044 is the same whole-frame Genjutsu lane. Its face is re-rendered from his own frames, so identity and mouth timing hold. The body-only step removes even that re-render.

## Next (not done)

1. **Fendi's eye** on the three-way comparison (shared in the session, not in this public repo): cap fringe, and sleeve judder at 1×.
2. **Done as a first pass, 18 Oct:** composite `8a527bab` over the moving showroom plate. See "Moving environment" in `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`. It awaits Fendi's eye. The original plan was the moving environment on this same output: matte (composite lane), a moving plate (the existing "Animate the plate" press, a paid image-to-video, dry-run first) and a grade. This is the handoff's pain point 2.
3. **Tomorrow's new takes** (tripod, plain background) go through the same three steps: Genjutsu, then body-only, then composite.
