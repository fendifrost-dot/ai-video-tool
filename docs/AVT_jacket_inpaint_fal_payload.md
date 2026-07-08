# Jacket-Only Inpaint — Exact Repeatable Fal Payload (v2 gate)

**Implements:** `docs/AVT_Wardrobe_Swap_Build_Spec_v2.md` §4 (Primary lane — Jacket-Only Masked Inpainting).
**Edge function:** `supabase/functions/jacket-inpaint-proxy/index.ts` (server-side; Fal key never client-side).
**Status:** payload is authoritative; **not yet executed** — see §7 "How the gate gets run".

The whole point: **stop re-rendering the garment.** Only jacket pixels change; face/glasses/cap/hands/pants/background stay the *real captured pixels*. That last guarantee is enforced **deterministically** (§4), not trusted to diffusion.

---

## 0. Pipeline at a glance

```
hero frame (1080×1920, real)              SL Track Jacket ref (0feb028f)
        │                                          │
        ▼                                          │
[1] fal-ai/evf-sam  ── jacket mask ────────┐       │
        │                                  │       │
        ▼ (optional)                       │       │
[2] fal-ai/imageutils/depth ── depth map ──┤       │
        │                                  ▼       ▼
        └────────────► [3] fal-ai/flux-general/inpainting
                            image_url = hero frame
                            mask_url  = jacket mask (step 1)
                            ip_adapters[0].image_url = SL ref
                            controlnets[0] = depth (step 2)
                            FIXED SEED
                                   │
                                   ▼  (raw inpaint — VAE shifts ALL pixels)
                        [4] DETERMINISTIC feathered masked recomposite
                            out = source·(1−α) + inpaint·α   (α = feathered jacket mask)
                            ⇒ outside the mask the bytes are the ORIGINAL frame
                                   │
                                   ▼
                        [5] unify 1080×1920  →  saved hero still
```

Steps 1–3 are Fal calls. **Step 4 is the non-negotiable determinism gate** and runs in the edge function with ImageScript — it is what makes criterion (b) *"only jacket pixels changed"* literally true rather than hopefully true.

Spec steps 3–4 (real-pixel face/glasses restore + Tier-1 logo overlay) are **not needed to pass the gate**: because the recomposite keeps every non-jacket pixel byte-identical to the source, the face, glasses, pose and scene are already the real pixels. Those steps become polish once topology passes, and are added on the approved still.

---

## 1. Fixed constants (repeatability)

| Constant | Value | Why |
|---|---|---|
| `SEED` | `777` | Fixed seed → identical runs. Change **only** to explore; log it. |
| Working resolution | `1080 × 1920` | Unified HD. 4K deferred to a final pass. |
| Mask feather | `12 px` (range 8–16) | Feathered alpha for a seamless seam; deterministic. |
| Mask prompt | `"cream off-white track jacket, upper torso, sleeves"` | evf-sam target. |
| Garment ref | wardrobe `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` (product MOD-003 `4529ddf8-…`) | cream body, navy shoulder stripe, "Saint Laurent" chest script. |

---

## 2. Step 1 — jacket mask (`fal-ai/evf-sam`)

Text-prompted SAM. Returns a binary mask PNG. We include what to segment; the *exclusions* (face, neck, hands, grey cap, orange pants, rings, background) are naturally excluded because they are not the jacket — evf-sam segments only the prompted garment.

```jsonc
POST https://queue.fal.run/fal-ai/evf-sam
{
  "image_url": "<SIGNED_URL: hero frame 1080×1920>",
  "prompt": "cream off-white track jacket, upper torso clothing, sleeves",
  "mask_only": true,
  "expand_mask": 4,        // small dilation so the seam sits INSIDE fabric, not on skin
  "fill_holes": true
}
```

Output: `{ "image": { "url": "<MASK_PNG_URL>", ... } }` → this is `mask_url` for step 3 **and** the α source for step 4 (after feathering).

> If evf-sam ever grabs the grey cap or a hand, add a `negative_prompt: "cap, hat, hand, skin, face, pants"` and/or lower `expand_mask`.

---

## 3. Step 2 — depth control image (`fal-ai/imageutils/depth`) *(optional but recommended)*

`flux-general/inpainting` ControlNet needs a **preprocessed** control map, not the raw frame.

```jsonc
POST https://queue.fal.run/fal-ai/imageutils/depth
{ "image_url": "<SIGNED_URL: hero frame 1080×1920>" }
```

Output: `{ "image": { "url": "<DEPTH_MAP_URL>" } }` → `controlnets[0].control_image_url`.

> Depth is the single best structure-lock for garment drape/panels. Fal's `flux-general` runs **one** controlnet at a time; to also lock body pose, swap to the `controlnet_unions` form (§6). For the first gate run, depth-only is the robust default. It can also be toggled **off** for a cheaper IP-Adapter-only first pass.

---

## 4. Step 3 — the inpaint (`fal-ai/flux-general/inpainting`)

```jsonc
POST https://queue.fal.run/fal-ai/flux-general/inpainting
{
  "image_url": "<SIGNED_URL: hero frame 1080×1920>",
  "mask_url":  "<MASK_PNG_URL from step 1>",

  "prompt": "Saint Laurent Track Jacket, cream off-white body, navy shoulder stripe, precise 'Saint Laurent' chest script, matching collar, sleeve panels, fabric drape and lighting on the body, high garment fidelity",
  "negative_prompt": "face, glasses, hands, cap, orange pants, background, deformation, extra clothing, wrong pose, logo distortion, warped text",

  "strength": 0.85,             // spec 0.75–0.9
  "guidance_scale": 5.0,        // spec 4–7
  "num_inference_steps": 30,    // spec 25–35
  "seed": 777,                  // FIXED
  "num_images": 1,
  "output_format": "png",
  "image_size": { "width": 1088, "height": 1920 }, // see NOTE — must be ÷16

  "ip_adapters": [
    {
      "path": "XLabs-AI/flux-ip-adapter-v2",
      "image_encoder_path": "openai/clip-vit-large-patch14",
      "image_url": "<SIGNED_URL: SL Track Jacket reference (0feb028f)>",
      "scale": 0.9              // spec 0.8–1.0
    }
  ],

  // ControlNet is OPTIONAL and OFF by default (see NOTE below). When enabled:
  "controlnets": [
    {
      "path": "jasperai/Flux.1-dev-Controlnet-Depth",  // HF repo id — NOT "depth"
      "control_image_url": "<DEPTH_MAP_URL from step 2>",
      "conditioning_scale": 0.65,
      "end_percentage": 0.8
    }
  ]
}
```

> **NOTE — `controlnets[].path` is a HuggingFace repo id, not a shorthand.** `flux-general/inpainting` loads the ControlNet via diffusers `FluxControlNetModel.from_pretrained(path)`, so `path: "depth"` fails at execution: *"depth is not a valid model identifier listed on huggingface.co/models"* (confirmed live). **Verified repo:** `jasperai/Flux.1-dev-Controlnet-Depth` — a diffusers-format Flux depth ControlNet that consumes Midas/Leres depth maps (matches `fal-ai/imageutils/depth`); recommended `conditioning_scale` 0.3–0.7. Alt: `Shakker-Labs/FLUX.1-dev-ControlNet-Depth`. The edge function keeps ControlNet **OFF by default** (`controlnet:"none"`) so the first pass is IP-Adapter + mask only; enable per-call with `controlnet:"depth"` once the IP-Adapter-only baseline passes. Canny wired to `Shakker-Labs/FLUX.1-dev-ControlNet-Canny` (not yet run-verified).

Output: `{ "images": [ { "url": "<INPAINT_PNG_URL>" } ], "seed": 777 }`.

> **NOTE — dimensions must be multiples of 16.** Flux latents are 16-aligned; **1080 is not** (1080/16 = 67.5), which makes `flux-general/inpainting` FAIL at execution (surfaces via CC as `fal_response_failed`). The edge function therefore **pads** the scene, mask, and depth map to **1088×1920** (edge-replicate for scene/depth, zero for the mask), runs the inpaint at 1088×1920, then **crops the result back to exactly 1080×1920** before the recomposite — so the top-left 1080-wide region stays pixel-aligned to the real source. On any failure the function stores Fal's full raw response body in `artist_looks.error_message` + `composition_recipe_json.generation_metadata.fal_error_raw` (with `failed_step`), so failures are diagnosable without re-running.

**This raw output must NOT be used as-is** — flux re-encodes the whole frame through the VAE, so pixels *outside* the mask drift (face/scene subtly change). Step 4 fixes that.

### Deterministic feathered masked recomposite (step 4 — edge function, ImageScript)

```
S = decode(source hero frame)         resized to 1080×1920
G = decode(inpaint result)            resized to 1080×1920
M = decode(mask)                      resized to 1080×1920, single channel
α = boxBlurFeather(M, radius = 12px)  → 0..1 per pixel

for every pixel p:
    OUT[p] = S[p] · (1 − α[p])  +  G[p] · α[p]
```

- Where `α = 0` (everything that is **not** jacket) → `OUT[p] == S[p]` exactly ⇒ **face, glasses, cap, hands, pants, background are the original captured bytes.** This is the hard proof for gate criterion (b).
- Where `α = 1` (jacket interior) → fully the transferred garment.
- The 12 px feathered ring is the only blended zone (Tier-3 seam integration — diffusion/blend acceptable here).

Export `OUT` as PNG 1080×1920 → the hero still to judge.

---

## 5. Success gate (judge the saved still, per spec §9 / §2)

| # | Gate question | How it's answered |
|---|---|---|
| a | **Garment TOPOLOGY correct** — seams, panels, navy shoulder stripe, collar break, cuffs, hem in the right place & proportion (topology **>** logo) | visual inspection of the still vs the SL on-model ref |
| b | **Only jacket pixels changed**; face/glasses/pose/scene are real | guaranteed by §4 recomposite; verify by diffing OUT vs source → non-zero delta only inside the feathered mask |
| c | **Resolution** = 1080×1920 | image header of the saved still |

Do **not** proceed to the video/motion pipeline until (a)+(b)+(c) pass on one still.

---

## 6. Upgrade: pose **and** depth via `controlnet_unions`

`flux-general` runs one classic controlnet, but a **union** model takes several control inputs at once. Preprocess an OpenPose map (`fal-ai/image-preprocessors/openpose`) alongside depth, then:

```jsonc
"controlnet_unions": [
  {
    "path": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro",
    "controls": [
      { "control_image_url": "<DEPTH_MAP_URL>", "control_type": "depth" },
      { "control_image_url": "<OPENPOSE_MAP_URL>", "control_type": "pose" }
    ]
  }
]
```
(Drop the top-level `controlnets` when using `controlnet_unions`.) Reserve for when depth-only topology is soft — it adds cost and failure surface.

---

## 7. How the gate gets run (and why not from this sandbox)

Per the locked AVT rules (`claude_code_handoff_avt_hero_frame_phase2_gate.md`): **all model work goes through AVT/CC edge functions — never a Claude sandbox, never secrets in the clear.** So the Fal calls above live inside `jacket-inpaint-proxy`, which routes every Fal model through **Control Center** via `X-Proxy-Secret` (the same `COMPOSE_LOOK_CC_URL` + `SWITCHX_PROXY_SECRET` that `wardrobe-vton-proxy` uses) and polls the generic `fal-queue-poll`. The Fal key lives only in CC.

**CC must expose one small, generic action** (the models themselves are what CC may be missing):

```jsonc
// CC switchx-restyle — submit-only, same response shape as the vton-frame action
{ "action": "fal-run", "model": "fal-ai/flux-general/inpainting", "input": { …§4 payload… } }
   → { "status_url": "...", "response_url": "..." }
// then the EXISTING generic CC fal-queue-poll drives it to completion:
{ "status_url": "...", "response_url": "..." } → { "status": "COMPLETED", "result": { … } }
```

The three model ids this lane submits through that action: `fal-ai/evf-sam`, `fal-ai/imageutils/depth`, `fal-ai/flux-general/inpainting`. If CC only whitelists VTON/faceswap models today, these are exactly what to add.

**Reference `fal-run` handler for CC's `switchx-restyle`** (drop-in; `fal-queue-poll` already handles the rest):

```ts
// inside switchx-restyle, alongside the existing `vton-frame` action:
if (action === "fal-run") {
  const ALLOWED = new Set([
    "fal-ai/evf-sam",
    "fal-ai/imageutils/depth",
    "fal-ai/imageutils/canny",
    "fal-ai/image-preprocessors/openpose",
    "fal-ai/flux-general/inpainting",
    "fal-ai/flux-lora/inpainting",   // SWAP for flux-general/inpainting's persistent 502
  ]);
  const { model, input } = body;
  if (!ALLOWED.has(model)) return json(400, { error: "model_not_allowed", model });
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { "Authorization": `Key ${Deno.env.get("FAL_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const q = await submit.json();
  if (!submit.ok || !q.status_url || !q.response_url) {
    return json(502, { error: "fal_submit_failed", detail: q });
  }
  return json(200, { status_url: q.status_url, response_url: q.response_url, model });
}
```

Run path:

1. Set `COMPOSE_LOOK_CC_URL` + `SWITCHX_PROXY_SECRET` on the AVT project (already present for `wardrobe-vton-proxy`) and ensure CC supports the `fal-run` action + the three models above.
2. Deploy `jacket-inpaint-proxy` (Lovable edge redeploy).
3. Invoke it once for the hero frame + wardrobe `0feb028f` (app button or an authenticated `curl` with a user JWT).
4. It saves the still to `look-composites` and returns a signed URL.
5. That signed URL is downloaded and the still is judged against §5 **first-hand** (topology / pixel-isolation / resolution).

Every run logs: mask coverage %, `ip_adapter.scale`, `controlnet.conditioning_scale`, `guidance_scale`, `seed`, mask feather, and **per-step `step_timings_ms`** — for repeatability (spec §6) and latency diagnosis.

### Timeout / queue handling (hard 400s ceiling)

Supabase Edge Functions have a **400s wall-clock limit** on paid plans; `EdgeRuntime.waitUntil` does **not** extend it. So the whole Fal chain races **one shared deadline** (`GLOBAL_FAL_BUDGET_MS = 355s`, reserving ~45s for the CPU-side recomposite + upload) rather than per-step budgets that could individually exceed 400s and leave no time to persist output. Transient CC/Fal gateway blips (the `fal_submit_failed` **502** and 5xx/network drops on submit, poll, and result download) are retried with exponential backoff (`fetchWithRetry`, 2s→4s→8s); a 4xx validation error is permanent and surfaced immediately. On a budget timeout the row records `failed_step` + partial `step_timings_ms`. If cold Flux alone ever blows the 355s budget, the only way past 400s is a **fal-webhook / callback refactor** (submit Flux with a webhook like `faceswap-callback`, finish the crop+recomposite in the callback) — deferred unless the tuned in-function path proves insufficient.

---

## 8. Sources

- [fal-ai/flux-general/inpainting API](https://fal.ai/models/fal-ai/flux-general/inpainting/api)
- [fal-ai/evf-sam API](https://fal.ai/models/fal-ai/evf-sam/api)
- [XLabs-AI/flux-ip-adapter-v2](https://huggingface.co/XLabs-AI/flux-ip-adapter-v2)
