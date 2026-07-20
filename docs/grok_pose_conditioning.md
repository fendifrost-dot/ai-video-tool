# Pose conditioning on the Grok image-edit lane — feasibility finding

**Verified 2026-07-19** against xAI's own generated REST schema.
**Question:** can we make `grok-image-garment-proxy` hold the hero frame's pose?
**Answer: no. Not with any parameter the xAI image API exposes.**

## Finding

The xAI image API has exactly two endpoints — `POST /v1/images/generations` and
`POST /v1/images/edits`. There is **no masked/inpainting endpoint at all**, and
the edits endpoint accepts **no pose or structure conditioning of any kind**.

Complete request-body schema for `/v1/images/edits`
([source](https://docs.x.ai/developers/rest-api-reference/inference/images)):

| Param             | Type           | Req | Values |
| ----------------- | -------------- | --- | ------ |
| `prompt`          | string         | yes | any |
| `image`           | object         | \*  | `{url}` or `{file_id}` |
| `images`          | array          | \*  | array of the same object, **max 3** |
| `model`           | string \| null | no  | `grok-imagine-image`, `grok-imagine-image-quality` |
| `aspect_ratio`    | enum           | no  | `1:1`,`3:4`,`4:3`,`9:16`,`16:9`,`2:3`,`3:2`,`9:19.5`,`19.5:9`,`9:20`,`20:9`,`1:2`,`2:1`,`auto` |
| `resolution`      | enum           | no  | `1k`, `2k` |
| `n`               | integer \| null| no  | — |
| `response_format` | string \| null | no  | `url`, `b64_json` |
| `storage_options` | object         | no  | `{filename, expires_after, public_url}` |
| `user`            | string \| null | no  | — |

\* `image` and `images` are mutually exclusive; one is required.

**Absent from the schema:** `mask`, `seed`, `strength` / `image_strength` /
`denoise`, `controlnet` / `control_image` / OpenPose / depth / canny,
`guidance_scale`, `negative_prompt`, and any per-image role or weight field.

This is *"absent from a complete enumerated schema"*, which is stronger than
*"not documented"* — the page lists the full body schema with types and enums,
not an excerpt. Caveat: no machine-readable OpenAPI spec is published
(`api.x.ai/openapi.json` and the usual variants all 404), so treat this as
high-confidence rather than proven-by-spec.

### Multi-image inputs carry no roles

[Multi-image editing](https://docs.x.ai/developers/model-capabilities/images/multi-image-editing)
assigns no role, type or weight to array members. The only documented ordering
semantic is that the output aspect ratio follows the first input image. There is
no way to tell the API "IMAGE_0 is the subject and structure, IMAGE_1 is a
garment swatch" — that distinction is expressible **only as prose in `prompt`**.

That is why the pose and identity locks in `GROK_GARMENT_TRUTH_PROMPT` don't
hold. They are not constraints; they are persuasion, and the model is free to
ignore them. Escalating the prompt wording further is not a fix — we have
already spent commits on that (`fdd9369` and before) and pose still drifts
toward the reference model's stance.

### One payload note

We currently send `images: [{url, type: "image_url"}]`. `type` is **not** in the
schema — it appears only in prose guide examples. It is presumably ignored.
Unverified either way; left alone because the call works today.

## What would actually fix pose

Ranked. All are reachable from this repo's existing fal.ai integration.

1. **Extend the existing masked-inpaint lane to the full outfit.**
   `supabase/functions/jacket-inpaint-proxy` already runs
   `fal-ai/flux-general/inpainting` and is wired end to end. Masked inpainting
   keeps the original frame's pixels everywhere outside the mask, so face, pose,
   camera and background are preserved *by construction* rather than by
   instruction — the same argument that makes the face composite in `a018ac0`
   work. Generalising its garment mask from jacket-only to full-outfit fixes
   pose drift without needing pose conditioning at all. **Lowest new
   integration cost, highest confidence.** This is the recommendation.

2. **`fal-ai/flux-general/image-to-image` with ControlNet.** Accepts
   `controlnets[]` (`control_image_url`, `conditioning_scale`,
   `start_percentage`, `end_percentage`), `controlnet_unions` (Union Pro modes
   include pose, depth, canny) and `strength`. Every knob xAI lacks. Needs a
   skeleton from a separate preprocessor pass — note this repo does **not**
   currently call any OpenPose preprocessor, so that is new wiring, not a reuse.

3. **`fal-ai/z-image/turbo/controlnet/lora`.** Cheaper and newer, with
   preprocessing bundled (`preprocess: none|canny|depth|pose`, plus
   `control_scale` / `control_start` / `control_end`), so no separate detector
   call. Less integration than #2 if we want true pose conditioning.

4. **Stay on the VTON lanes** (`idm-vton`, `cat-vton`, Leffa — all already
   wired). Pose-preserving by construction since they only transfer garment
   pixels. They lose to Grok on garment fidelity, which is why the Grok lane
   exists; worth re-measuring against #1 before spending on #2/#3.

## Decision needed

Grok cannot be made to hold pose via parameters. Either move the structural step
off Grok (#2/#3), or keep Grok for garment fidelity and repair its output with
masking (#1). No code has been written for either — this is a decision doc.

Nothing here needs a SQL migration or a new secret; options #1–#3 all run on the
`FAL_KEY` already configured for the inpaint and face-swap lanes.

## Sources

- https://docs.x.ai/developers/rest-api-reference/inference/images
- https://docs.x.ai/developers/model-capabilities/images/editing
- https://docs.x.ai/developers/model-capabilities/images/multi-image-editing
- https://fal.ai/models/fal-ai/flux-general/image-to-image/api
- https://fal.ai/models/fal-ai/z-image/turbo/controlnet/lora
