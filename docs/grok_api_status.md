# Grok / xAI Imagine API status — verified 2026-05-16, AVT wiring 2026-06-20

**Upstream API: OPEN** (xAI video generation, May 2026).  
**AVT client: wired** via Control Center proxy — generation is live when CC has
`Frost_Grok` (or equivalent) configured.

## Architecture

```
Prompt Builder → providerJobs/api.ts → proxy-provider-call (AVT)
  → video-providers-grok-generate (Control Center)
  → xAI POST /v1/videos/generations
  → poll job-status → ingest-provider-job → project_assets
```

AVT does **not** host `video-providers-grok-generate` locally — that function
lives on the **Control Center** Supabase project. AVT whitelists the endpoint
in `proxy-provider-call` and routes through `CONTROL_CENTER_URL`.

## Endpoint (xAI)

- **Submit:**  `POST https://api.x.ai/v1/videos/generations`
- **Poll:**    `GET  https://api.x.ai/v1/videos/{request_id}`

Authenticated with `Authorization: Bearer <Frost_Grok>` on the CC side.

## Capabilities (xAI docs, verified 2026-05-16)

| Capability                | xAI API | AVT client (2026-06-20)        |
| ------------------------- | ------- | ------------------------------ |
| text-to-video             | yes     | yes (`apiReady`, Generate btn) |
| image-to-video (1st frame)| yes     | yes (single locked ref)        |
| reference-to-video        | yes (≤3)| yes (look + Character DNA refs)|
| video editing             | yes     | not wired                      |
| video extension           | yes     | not wired (capability flagged) |
| max duration              | 15s     | clamped via provider_capabilities |
| aspect ratios             | 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 | via settings |
| resolutions               | 480p / 720p | default 720p in formatter |

## Default model: `grok-imagine-video`

Set in `src/lib/providers/grok.ts` and passed when no template override exists.

## AVT wiring (this repo)

| File | Role |
| ---- | ---- |
| `src/lib/providers/grok.ts` | Comma-tag formatter, `apiReady=true`, default settings |
| `src/lib/providerJobs/api.ts` | Multi-ref signing, `reference_to_video` mode, CC payload |
| `supabase/functions/proxy-provider-call/index.ts` | Forwards to CC generate/status/result |
| `supabase/functions/ingest-provider-job/index.ts` | Downloads xAI CDN clips server-side |

## Hero Frame garment-truth lane (2026-06-24)

Full-outfit hero stills use a dedicated AVT edge function — not the video proxy:

```
Hero Frame Studio → grok-image-garment-proxy (AVT)
  → xAI POST /v1/images/edits (grok-imagine-image-quality)
  → look-composites / artist_looks (pipeline_used: grok_image_edit_garment_truth)
```

Env on AVT: `XAI_API_KEY` — **same xAI key** as Control Center `Frost_Grok` (one key for image + video). Aliases: `FROST_GROK`, `GROK_API_KEY`.

| File | Role |
| ---- | ---- |
| `supabase/functions/grok-image-garment-proxy/index.ts` | Multi-image edit, on-model refs, hero frame |
| `src/lib/queries/grokImageGarment.ts` | Client submit + poll |
| `src/lib/heroFrame/grokGarmentPrompt.ts` | Locked full-outfit prompt |
| `src/lib/providers/grok.ts` | `image_edit` capability, `GROK_DEFAULT_IMAGE_MODEL` |

`proxy-provider-call` whitelists `image-providers-grok-edit` for a future CC mirror; hero lane calls AVT directly today.

**Pose conditioning: not available.** `/v1/images/edits` exposes no ControlNet,
mask, seed, strength or structure-preservation parameter, and multi-image inputs
carry no per-image roles — the pose and identity locks in the prompt are prose,
not constraints. Full schema and the realistic alternatives are in
[grok_pose_conditioning.md](./grok_pose_conditioning.md).

## Manual canvas workflow (separate from video gen)

Grok **images** imported on LooksListPage still flow through identity swap
(`faceswap-proxy`) and wardrobe VTON (`wardrobe-vton-proxy`). That path is
intentionally manual/import-first — video generation is the in-app Generate path.

## Cost

Placeholder estimate: **$0.60** per generation (`GROK_CENTS_PER_GENERATION = 60`
on CC until invoices confirm). AVT surfaces `costEstimateCents` from the CC
envelope in toasts and `ProjectCostCard`.

## Not yet wired

- Video edit (`/v1/videos/edits`)
- Video extension (`/v1/videos/extensions`) — UI modes pending
- CC `image-providers-grok-edit` mirror (AVT-native `grok-image-garment-proxy` covers hero lane)
- In-app Grok **image** generation outside Hero Frame Studio (import remains primary)

## Sources

- https://docs.x.ai/developers/model-capabilities/video/generation
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://x.ai/api/imagine
