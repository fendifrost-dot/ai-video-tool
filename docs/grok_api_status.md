# Grok / xAI Imagine API status — verified 2026-05-16

**Status: OPEN.** The Grok Imagine video generation API is publicly
available to API customers as of May 2026. AVT routes through the
real API; no browser-automation fallback was built.

## Endpoint

- **Submit:**  `POST https://api.x.ai/v1/videos/generations`
- **Poll:**    `GET  https://api.x.ai/v1/videos/{request_id}`

Both authenticated with `Authorization: Bearer <Frost_Grok>`.

## Capabilities (per xAI docs, last verified 2026-05-16)

| Capability               | Available |
| ------------------------ | --------- |
| text-to-video            | yes       |
| image-to-video (1st frame)| yes      |
| reference-to-video       | yes (up to 3 ref images) |
| video editing            | yes (`/v1/videos/edits`) |
| video extension          | yes (`/v1/videos/extensions`) |
| max duration             | 15s per gen, 2-10s per extension |
| aspect ratios            | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` |
| resolutions              | `480p` (default), `720p` |

## Default model: `grok-imagine-video`

Quality Mode is now available for enterprise tiers (higher realism,
better text rendering). We default to standard mode.

## Wiring on our side

- `supabase/functions/video-providers-grok-generate/index.ts` posts to
  `/v1/videos/generations` and returns the `request_id` as `providerJobId`.
- `supabase/functions/video-providers-job-status/index.ts` polls
  `GET /v1/videos/{id}` and maps xAI's status (`pending|done|failed|expired`)
  onto our normalised status (`queued|running|succeeded|failed`).
- `supabase/functions/video-providers-job-result/index.ts` fetches the
  hosted `video.url` (xAI returns a temporary `vidgen.x.ai/...mp4`).

## Notes

- Videos are returned at temporary URLs — AVT must download promptly
  (we ingest into `project-clips` immediately via the standard flow).
- Cost per generation is not yet exposed in the response; we use a
  $0.60 placeholder estimate (`GROK_CENTS_PER_GENERATION = 60`).
  Update against real invoices.
- No reference-to-video or video-edit endpoints are wired yet — only
  the basic text-to-video / image-to-video paths.

## Sources

- https://docs.x.ai/developers/model-capabilities/video/generation (May 12, 2026)
- https://docs.x.ai/developers/model-capabilities/video/image-to-video
- https://x.ai/api/imagine
- https://x.ai/news/grok-imagine-api
