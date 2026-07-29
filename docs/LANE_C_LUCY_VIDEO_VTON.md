# Lane C — Decart Lucy video-native try-on, and the Fal warp-endpoint verdict

Companion to [`VIDEO_SWAP_ARCHITECTURE.md`](VIDEO_SWAP_ARCHITECTURE.md) and
[`LANE_B_VIDEO_VTON_BENCHMARK.md`](LANE_B_VIDEO_VTON_BENCHMARK.md). Two research
questions, both correcting the earlier **"there is no batch / video-native VTON on
Fal"** conclusion that Lane B reached too quickly.

Researched **2026-07-28** against Fal's own **machine-readable OpenAPI queue
schemas** (`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`), which
are the authoritative contract (field names, transport, servers) — not the
marketing pages (those sit behind a Vercel checkpoint and rate-limit).

---

## JOB 1 — Decart Lucy: what it actually is on Fal

Lane B dismissed `decart/lucy2-vton/realtime` as "WebRTC webcam-stream only,
incompatible with submit/poll" **without checking**. The dismissal's *conclusion*
about that one endpoint was right — but it was reached without evidence **and it
missed a whole batch Lucy family.** Both are corrected below.

### 1.1 Every confirmed Lucy endpoint (schema-verified)

| Endpoint id | Transport | Input | Garment image? | Usable for us? |
|-------------|-----------|-------|----------------|----------------|
| `decart/lucy-edit/pro` | **Batch** `queue.fal.run` submit/poll | **mp4 URL** + text prompt | ❌ prompt only | ✅ **Lane C** (prompt-driven) |
| `decart/lucy-edit/dev` | **Batch** submit/poll | mp4 URL + prompt | ❌ | ✅ Lane C |
| `decart/lucy-edit/fast` | **Batch** submit/poll | mp4 URL + prompt | ❌ | ✅ Lane C (cheapest — benchmark default) |
| `decart/lucy-restyle` | **Batch** submit/poll | mp4 URL + prompt (≤10 min) | ❌ | ✅ Lane C (long-form) |
| `decart/lucy2-vton/realtime` | **Realtime WebRTC** signaling proxy | live frame stream (`image_url` data-URI) | ✅ `reference_image_url` | ⚠️ wrapper only (§1.5) |
| `decart/lucy-2-5/realtime` | **Realtime WebRTC** | live camera frame | ✅ `reference_image_url` | ⚠️ wrapper only |
| `decart/lucy-edit` (bare), `decart/lucy-2`, `decart/lucy-vton`, `decart/lucy2-vton` | 404 — do not exist | — | — | — |

`fal.ai/lucy-2.1`, `fal.ai/lucy-2`, `fal.ai/lucy-2.5` are **landing pages** for the
realtime endpoints, not separate API slugs.

### 1.2 The realtime VTON endpoint really is realtime-only (now with proof)

`decart/lucy2-vton/realtime`'s own OpenAPI input model, verbatim:

> "Input model for the **Lucy 2 RT signaling proxy**. Uses extra="allow" so
> **WebRTC signaling messages ({type: "offer", sdp: ...})** pass validation
> alongside application messages."

Its fields are `prompt`, `image_url` ("Image data URI or HTTP(S) URL for
**realtime frame input**"), and `reference_image_url` (the garment). **There is no
`video_url` field** — it cannot ingest an mp4. The `queue.fal.run` POST that
appears in its schema is the WebRTC offer/answer handshake proxy, **not** a batch
render job. So: dismissing *this endpoint* as batch-incompatible was correct — but
it is only half the Lucy story.

### 1.3 The batch family the earlier pass missed

`decart/lucy-edit/{pro,dev,fast}` and `decart/lucy-restyle` are **standard Fal
submit/poll video-to-video** jobs — the exact transport AVT already speaks:

- Submit `POST https://queue.fal.run/decart/lucy-edit/pro`
- Poll `GET  https://queue.fal.run/decart/lucy-edit/pro/requests/{id}/status`
- Result `GET https://queue.fal.run/decart/lucy-edit/pro/requests/{id}`

**Input** (`LucyEditProInput` / `LucyRestyleInput`):

| field | type | req | notes |
|-------|------|-----|-------|
| `prompt` | string ≤1500 | ✅ | garment/scene edit instruction |
| `video_url` | URL | ✅ | the prerecorded mp4 to edit |
| `resolution` | enum `["720p"]` | — | pro/restyle only (dev/fast omit) |
| `seed` | int | — | restyle only |
| `sync_mode`, `enhance_prompt` | bool | — | schema defaults are what we want; we don't send them |

**Output**: `{ "video": { "url", "content_type": "video/mp4", "file_name", "file_size" } }`.
Endpoint `about`: *"accepts a … video and a text prompt, then returns an MP4 video
file with H.264 encoding."* `lucy-restyle`: *"Supports longer videos up to 10
minutes."*

### 1.4 Feasibility verdict

- **Batch video-file → video-file via standard Fal submit/poll: YES** — for
  **prompt-driven** garment editing (`decart/lucy-edit/fast` etc.). Lucy is
  temporally native, so this is a real **benchmark option (b)** — a
  video-native v2v candidate — from the locked architecture §5. **No per-frame
  boiling by construction.**
- **Reference-garment-image VTON via batch: NO.** The only endpoints that accept a
  garment *image* are realtime WebRTC (§1.5).
- **⚠️ Hard-rule conflict.** Batch Lucy specifies the garment by **text prompt**,
  which **regenerates** garment pixels. That **violates** CLAUDE.md's *"No
  AI-regeneration of garment imagery; pixel preservation is mandatory."* So Lane C
  is a **benchmark/diagnostic**, expected to **fail** the construction+stripe half
  of the kill criterion (§7) while (uniquely) passing the temporal-consistency
  half. It is **not** a shippable product-accurate swap and is gated off by default.

### 1.5 Realtime reference-image VTON — the wrapper (NOT faked here)

To push a prerecorded mp4 through `decart/lucy2-vton/realtime` (the image-accurate
path) you must build a **server-side WebRTC wrapper**. Concretely it requires:

1. A **WebRTC peer / realtime client** — `fal.realtime.connect("decart/lucy2-vton/realtime", …)`
   from `@fal-ai/client` (node/deno), or a raw peer doing the offer/sdp handshake
   the schema references. This does **not** fit AVT's Deno-edge + CC-`fal-run`
   submit/poll transport at all — it is a persistent peer connection, so it belongs
   in a **dedicated always-on worker** (a Node/Deno service or container), not an
   edge function.
2. **ffmpeg** to decode the mp4 into frames / a raw video track and feed it as the
   inbound media (`image_url` takes one data-URI frame at a time, or a live track).
3. A **frame-capture + reassembly** stage — collect the returned output frames and
   ffmpeg them back into an mp4.
4. **Stream-rate + persistent-connection handling** — it runs at live speed
   (~30 fps, ~$0.02/sec) with per-frame sync, session state, reconnect/backpressure.
   Substantially more complex and less deterministic than a submit/poll job, and it
   records **no reproducibility metadata** (opaque `additionalProperties` output).

There is **no Decart/Fal-provided batch mode that feeds an mp4 into the VTON
model.** The batch `lucy-edit`/`lucy-restyle` models sidestep the stream entirely
but **drop the reference image**. Recommendation: do **not** build the WebRTC
wrapper for a model that (a) regenerates pixels anyway and (b) still fails
pixel-preservation — it buys nothing the locked Lane A (keyframe+propagation)
doesn't, at far higher operational cost. Revisit only if Decart ships an
image-conditioned **batch** VTON.

### 1.6 Pricing / limits (as documented — confirm on the live model page)

`lucy-edit/fast` ~**$0.04/video-sec** (720p, distilled/fast) · `lucy-edit/pro`
~**$0.15/video-sec @720p** · `lucy-restyle` ≤**10-min** input · realtime
**$0.02/sec** ~30 fps. Batch models advertise 720p; only `restyle` states an
explicit max duration.

---

## JOB 2 — Fal dense-flow / warp endpoint for Lane A propagation: NONE

Distinct question: does Fal expose a **dense optical-flow / warp / EbSynth-style
keyframe-propagation** endpoint with **usable outputs** that could be Lane A's
propagation engine (warp an approved keyframe's garment pixels across intermediate
frames)? Exhaustive search of the 2026-07-28 catalog:

**Verdict: NO.** No Fal model returns a usable flow field, warp map, or
example-based propagation output.

| Model | Output | Usable flow/warp? |
|-------|--------|-------------------|
| `fal-ai/rife`, `fal-ai/film/video`, `fal-ai/amt-interpolation` | interpolated frames / mp4 **only** (`{images:[…]}` / `{video:{url}}`) | ❌ **RIFE/FILM/AMT compute flow internally but expose ONLY frames** — no flow output. Excluded exactly as the brief required. |
| `fal-ai/wan-vace-*` (pose/depth/inpaint/reframe) | newly **generated** video | ❌ accepts pose/depth/mask control (**not** optical flow); regenerates pixels — not a keyframe pixel-warp. |
| `fal-ai/wan-motion`, `fal-ai/kling-video/*/motion-control`, `kling-video/o1/video-to-video/edit` | generated video (motion transfer) | ❌ pose-retarget/generative, not flow-warp of a garment keyframe. |
| `fal-ai/video-as-prompt`, `fal-ai/wan/v2.7/reference-to-video` | generated video | ❌ semantic/motion conditioning only. |
| `fal-ai/sam-3/video` | per-object **masklets** (RLE tracks) | ❌ for propagation, but a **useful adjunct**: tracked garment **masks** per frame for region-locked compositing onto original footage. Segmentation, not motion vectors. |

No fal.ai model page exists for RAFT, GMFlow, FlowFormer, PWC-Net, "optical flow",
CoTracker/CoTracker3, TAPIR, point-tracking, EbSynth, or rerender — repeated
`site:fal.ai/models` + keyword searches returned only papers and non-Fal hosts.

**Consequence for Lane A:** the propagation step must be a **custom RAFT (or
GMFlow) + warp, or EbSynth, worker outside Fal** (own GPU/container) — it cannot be
a `PROPAGATION_FAL_MODEL`. `_shared/propagation.ts` already blocks honestly
(`mode:"disabled"`) rather than fake this; that block is now **confirmed
unavoidable on Fal**, not a gap waiting for the right model id. Do **not**
substitute Wan-VACE / Wan-Motion / Kling motion-control — they are generative
re-synthesis and reintroduce the exact garment drift the lock warns against. Fal's
`sam-3/video` masks can still feed the region-locked composite; RIFE/FILM can only
smooth fps *after* a real propagation pass, never *be* it.

---

## What was wired (Lane C) — reversible, env-gated

One new edge function + one pure helper, mirroring the existing single-video Fal
pattern (`make-scrub-proxy-proxy`). Nothing changes unless `LUCY_V2V_FAL_MODEL` is
set.

- `supabase/functions/_shared/lucyV2v.ts` — pure, tested: `classifyLucyTransport`
  (batch vs realtime — realtime is **refused**), `buildLucyV2vBody` (exact
  `LucyEdit`/`LucyRestyle` schema), `extractLucyVideoUrl`, `buildGarmentEditPrompt`.
- `supabase/functions/wardrobe-video-lucy-proxy/` — whole-clip v2v: sign source
  clip → CC `fal-run` submit → `fal-queue-poll` → download mp4 → upload to
  `project-exports/<user>/<asset>/lucy/<session>.mp4` → patch `lucy_status` +
  `lucy_repro`. Records `garment_source:"text_prompt"`, `pixel_preserving:false`.
- `src/lib/queries/wardrobeVideoFrames.ts` → `runLaneCRoundtrip()` — client
  dispatch + poll (no extract/reassemble; Lucy returns a finished clip).

## Deploy checklist (a live agent does this — not this branch)

1. Merge this branch to `main` (code + tests + docs).
2. **CC:** add `decart/lucy-edit/fast` to CC `switchx-restyle`'s fal-run allowlist
   (same pattern as `SCRUB_PROXY_FAL_MODEL` / the Lane B Kolors id); **redeploy CC
   `switchx-restyle`**.
3. **AVT Lovable → Edge Function secrets:** set
   `LUCY_V2V_FAL_MODEL=decart/lucy-edit/fast` (confirm `COMPOSE_LOOK_CC_URL`,
   `SWITCHX_PROXY_SECRET` present).
4. **AVT Lovable → Edge Functions → redeploy** `wardrobe-video-lucy-proxy`
   (Publish ≠ redeploy).
5. Publish frontend (engine is server-selected; no client change needed to run).

## Short-clip test plan (kill-criterion run — same clip as Lane A/B)

Same **2–4 s** source clip + SL-bomber wardrobe item as the other lanes, so all
three judge head-to-head.

- **Inputs**: `asset` = the trimmed 2–4 s source clip in AVT; `wardrobeFeatureId` =
  the **SL bomber** `character_features` row; `artistId` = that item's artist.
- **Run** (client, no code change beyond this branch):

  ```ts
  import { runLaneCRoundtrip } from "@/lib/queries/wardrobeVideoFrames";

  const res = await runLaneCRoundtrip({
    asset,                        // { id, asset_type, file_url } — the 2–4s clip
    wardrobeFeatureId,            // SL bomber (names the garment in the prompt)
    artistId,
    transferMode: "jacket_only",  // bomber = upper-body
    // prompt: "…"                // optional override
  });
  // res.outPath → project-exports/<user>/<asset>/lucy/<session>.mp4
  ```

- **Outputs**: edited clip at `project-exports/<user>/<asset>/lucy/<session>.mp4`;
  asset `lucy_engine = fal-run:decart/lucy-edit/fast`, `lucy_repro` (model, prompt,
  garment label, `garment_source:"text_prompt"`, `pixel_preserving:false`).
- **Judge (kill criterion §7)** — play the clip and compare against Lane A and the
  Lane B (Kolors/IDM-VTON) outputs on the **same** clip:
  - **Flicker / boiling?** Expect Lane C to be the **strongest** here (temporally
    native) — this is the informative result.
  - **Exact bomber construction + stripe/logo placement?** Expect Lane C to
    **fail** — it regenerates from a text prompt, no garment image. That failure is
    the diagnostic point: it isolates *"does video-native temporal consistency
    help?"* from *"is the garment product-accurate?"*.
  - **Identity / natural occlusion?** Note both.

## Honest verdict framing

- **Lane C corrects the record**: a batch, video-native, temporally-consistent v2v
  model **does** exist on Fal (`decart/lucy-edit/*`) and is now reachable through
  AVT's normal transport. The earlier "nothing batch/video-native on Fal" claim was
  wrong about the `lucy-edit` family (right only about `lucy2-vton/realtime`).
- **But it cannot win the kill criterion**, because the batch path is
  prompt-driven — it regenerates the garment and breaks pixel preservation. Its
  value is a clean read on the **temporal** axis and, if temporal consistency
  proves worth the trade, as evidence for pursuing a **video-native model that also
  takes a garment image** (which today means the realtime WebRTC wrapper — §1.5 —
  or a future image-conditioned batch VTON).
- **Lane A propagation stays custom.** JOB 2 confirms no Fal endpoint can warp an
  approved keyframe's garment across frames; that worker is off-Fal by necessity.
