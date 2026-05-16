# Control Center Provider Proxy — Architecture

Date: 2026-05-16. Author: this session. Status: design + first build.

AI Video Tool (AVT) never calls a video-generation provider directly. All
provider traffic is brokered by `fendi-control-center` (CC). CC owns the
secrets, the audit trail, and the retry policy. AVT only knows about
CC's REST surface.

## Why a proxy at all

1. **One place for API keys.** Runway, Veo, Pika, Fal, xAI, Higgsfield,
   Anthropic — every key lives in CC's Supabase Edge Function secrets,
   never in AVT's bundle or AVT's Supabase project. Rotations happen in
   one place.
2. **Unified audit log.** Every paid-API call lands in CC's existing
   `tool_execution_logs` table. Cost forensics, debugging, and rate-limit
   diagnosis all run off one table.
3. **Single break-glass.** If a provider goes sideways or starts billing
   unexpectedly we kill traffic by disabling a single CC edge function.
4. **Same pattern Control Center already uses** for OpenAI, Anthropic
   (`_shared/claude.ts`), and the FanFuel hub call (`playlist-research`).

## Two-project topology

```
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │ AI Video Tool (AVT)      │         │ Control Center (CC)      │
   │ Supabase qoyxgnkv...     │         │ Supabase wkzwcfmv...     │
   │                          │         │                          │
   │ user clicks Generate ──▶ │ x-api-  │ /functions/v1/           │
   │ provider_jobs INSERT     │ key────▶│   video-providers/       │
   │ row (status=queued)      │         │   <provider>/generate    │
   │                          │         │                          │
   │  poll: GET .../status ◀──┼─────────┼── tool_execution_logs    │
   │                          │         │   row written            │
   │  on success: download    │         │                          │
   │  result, re-upload to    │         │ calls provider API with  │
   │  project-clips bucket,   │         │   secret from env        │
   │  create project_assets   │         │ returns { jobId,         │
   │  row, link to shot       │         │   status, providerJobId, │
   └──────────────────────────┘         │   costEstimate, ... }    │
                                        └──────────────────────────┘
```

## Authentication

AVT and CC live in **different Supabase projects** (`qoyxgnkvjukovkrvdaiq`
vs `wkzwcfmvnwolgrdpnygc`). AVT user JWTs are signed by AVT's project and
cannot be verified by CC's auth server. So CC's video-proxy functions
follow CC's own existing pattern (see `meta-token-validate`,
`instagram-messaging`, `playlist-research`):

- `verify_jwt = false` in `supabase/config.toml`
- A shared secret `AVT_PROXY_KEY` (high-entropy, set in CC Edge Function
  secrets and in AVT's `.env` as `VITE_AVT_PROXY_KEY` — though the
  outbound call is made server-side from a thin AVT edge function, see
  "AVT-side wrapper" below)
- All requests must carry `x-api-key: <AVT_PROXY_KEY>`; CC rejects with
  401 otherwise

AVT also passes its own user/project identifiers in the request body so
CC can write them into `tool_execution_logs` for cross-system tracing:

```json
{
  "avt_user_id": "<uuid of AVT auth.uid>",
  "avt_project_id": "<uuid of video_projects.id>",
  "avt_prompt_id": "<uuid of prompts.id>",
  "avt_shot_id": "<uuid of shots.id, nullable>",
  "...provider-specific fields below..."
}
```

The API-key shared-secret is acceptable trust-boundary perimeter because:
- Both apps are operated by the same user (Fendi).
- CC never returns provider API keys to AVT.
- The body identifiers are advisory for audit only; the only state CC
  mutates is its own `tool_execution_logs`.

### AVT-side wrapper

To avoid shipping `AVT_PROXY_KEY` in AVT's browser bundle, AVT adds a thin
edge function `supabase/functions/proxy-provider-call/index.ts` that:

1. Validates the calling AVT user JWT (default `verify_jwt = true`).
2. Reads `AVT_PROXY_KEY` from AVT's Edge Function secrets.
3. Forwards the request to CC with `x-api-key` set.
4. Returns the CC response verbatim.

This keeps the secret out of the browser and gives AVT a single
choke-point for retries, timeout policy, and structured logging on the
AVT side.

## Request / response envelope

Every CC video-proxy endpoint accepts a POST with `Content-Type:
application/json` and returns JSON with this shape:

### Success

```json
{
  "ok": true,
  "jobId": "<CC-generated uuid>",
  "providerJobId": "<the id the upstream provider returned>",
  "status": "queued" | "running" | "succeeded" | "failed",
  "resultUrl": "<signed URL if status=succeeded, else null>",
  "costEstimateCents": 350,
  "costFinalCents": null,
  "provider": "runway",
  "modelVariant": "gen3a_turbo",
  "providerMetadata": { ... raw upstream response keys we care about ... }
}
```

- `jobId` is CC's own id (matches a row in CC's
  `tool_execution_logs.id` — kept as `response_json.jobId` for now; if we
  outgrow the audit table for this, see "Future: dedicated video_jobs
  table" below).
- `providerJobId` is upstream — what we'll send to subsequent
  `/jobs/:id/status` polls.
- `status` is normalised across providers (see "Status normalisation").
- `costEstimateCents` is what we expect to pay (computed from declared
  per-second rates and the resolved duration). `costFinalCents` is null
  until the job completes (some providers settle pricing async).
- `provider`, `modelVariant`, `providerMetadata` give AVT enough to
  surface what was actually run, in case the chosen variant differed
  from what the UI requested.

### Error

```json
{
  "ok": false,
  "errorCode": "PROVIDER_KEY_NOT_CONFIGURED"
              | "PROVIDER_API_ERROR"
              | "PROVIDER_NOT_AVAILABLE"
              | "INVALID_INPUT"
              | "RATE_LIMITED"
              | "UNAUTHORISED"
              | "INTERNAL",
  "errorMessage": "<human-readable>",
  "providerStatus": 503,
  "retryable": true | false,
  "retryAfterSeconds": 30
}
```

- `PROVIDER_KEY_NOT_CONFIGURED` is the fail-clean state when the key for
  that provider hasn't been added to CC secrets yet. AVT shows a banner
  saying "Runway API not configured — add `RUNWAY_API_KEY` in Control
  Center to enable Generate."
- `PROVIDER_NOT_AVAILABLE` is the 501 state Grok / Higgsfield return
  while their APIs are gated.

## Status normalisation

Providers return different status taxonomies. CC normalises to one of:

| Normalised | Maps from                                                    |
|------------|--------------------------------------------------------------|
| `queued`   | `PENDING`, `THROTTLED`, `PROCESSING_QUEUED`, `created`       |
| `running`  | `PROCESSING`, `IN_PROGRESS`, `running`                       |
| `succeeded`| `SUCCEEDED`, `COMPLETED`, `done`                             |
| `failed`   | `FAILED`, `ERROR`, `CANCELLED`, `EXPIRED`                    |

AVT's `provider_jobs.status` (enum `provider_job_status` already defined
in AVT's schema) is updated only with these four values plus the
existing `cancelled`.

## Retry policy

- AVT → CC: exponential backoff on 5xx and on `retryable: true`. 3
  attempts, 500ms × 2^attempt + jitter.
- CC → provider: 3 attempts with the same backoff for 429 and 5xx.
- AVT does NOT retry on `PROVIDER_KEY_NOT_CONFIGURED`,
  `PROVIDER_NOT_AVAILABLE`, `INVALID_INPUT`, or `UNAUTHORISED` — those
  surface immediately to the user.

## Audit log shape

Each CC proxy call writes one row to `tool_execution_logs`:

| Column         | Value                                                        |
|----------------|--------------------------------------------------------------|
| `request_id`   | UUID generated per request (echoed in response headers)      |
| `tool_name`    | `video_provider.<provider>.generate` (e.g. `runway.generate`)|
| `args`         | `{ avt_user_id, avt_project_id, avt_prompt_id, avt_shot_id, provider, modelVariant, promptHash, referenceImageUrl? }` — full prompt text intentionally NOT logged to keep row sizes sane and to honour the AVT "prompts are user data" line. The `promptHash` (sha256 of prompt text) lets us correlate without storing the body. |
| `status`       | `attempted` → `succeeded` / `failed`                         |
| `error`        | error message on failure                                     |
| `elapsed_ms`   | wall-clock time CC spent on the request                      |
| `http_status`  | upstream provider HTTP status                                |
| `response_json`| `{ jobId, providerJobId, costEstimateCents, providerMetadata }` |
| `model`        | `<provider>:<modelVariant>` for at-a-glance grouping         |
| `chat_id`      | unused for video-proxy calls                                 |
| `user_message` | the truncated promptText (first 500 chars) for debugging     |

The hash + truncated text combo lets a future cost dashboard segment by
prompt template without exposing whole prompt corpora in the log.

## Cost tracking

CC computes `costEstimateCents` per provider:

| Provider     | Pricing source                          | Notes                          |
|--------------|-----------------------------------------|--------------------------------|
| Runway       | Per-second; gen3a_turbo ~5¢/s          | Compute from `duration`        |
| Veo / Gemini | Per-second tiered                      | Vertex AI pricing list         |
| Pika         | Per-generation flat                    | Document the rate              |
| Fal          | Per-model; FLUX video ~$0.05–0.10/gen  | Read from per-model declaration|
| Grok         | Unknown until API GA                   | Returns null when 501          |
| Higgsfield   | Same                                   | Returns null when 501          |
| Anthropic    | Per-token                              | Treatment generator only       |

The costs are **estimates** — final billing is whatever the upstream
invoice says. We surface the estimate so Fendi can predict per-project
spend.

AVT mirrors the cost into its own `provider_jobs` table by adding a new
column `cost_cents int` (migration via Lovable chat). A materialised
view or RPC sums by project for the UI rollup; see "Cost visibility"
section of the work plan.

## Future: dedicated video_jobs table on CC side

If we outgrow `tool_execution_logs` for video-proxy traffic (lots of
columns get null because they're tax/credit-specific), we can add a
`video_provider_jobs` table on CC mirroring AVT's `provider_jobs` 1:1.
Not needed for v1 — keep one audit surface until volume justifies a
split.

## Endpoints (v1)

| Method | Path                                              | Purpose                                   |
|--------|---------------------------------------------------|-------------------------------------------|
| POST   | `/functions/v1/video-providers/runway/generate`   | text-to-video or image-to-video           |
| POST   | `/functions/v1/video-providers/veo/generate`      | text-to-video, image-to-video, lipsync    |
| POST   | `/functions/v1/video-providers/pika/generate`     | text-to-video or image-to-video           |
| POST   | `/functions/v1/video-providers/fal/generate`      | per-model (FLUX, Mochi, etc.)             |
| POST   | `/functions/v1/video-providers/grok/generate`     | 501 today, future xAI Imagine             |
| POST   | `/functions/v1/video-providers/higgsfield/generate`| 501 today                                |
| GET    | `/functions/v1/video-providers/jobs/:id/status`   | poll a provider job (id = providerJobId)  |
| GET    | `/functions/v1/video-providers/jobs/:id/result`   | get the final signed URL                  |
| POST   | `/functions/v1/ai/draft-treatment`                | Anthropic treatment generator             |

The status / result endpoints take an extra query param `?provider=<name>`
because the providerJobId namespace is provider-scoped.

## Request shapes per provider

All accept the auth/audit fields above plus provider-specific fields.

### Runway (`/runway/generate`)

```json
{
  "promptText": "cinematic shot, ...",
  "mode": "image_to_video" | "text_to_video",
  "referenceImageUrl": "<signed URL of locked reference, required for image_to_video>",
  "modelVariant": "gen3a_turbo",
  "duration": 5,
  "aspectRatio": "16:9" | "9:16",
  "seed": 12345
}
```

### Veo (`/veo/generate`)

```json
{
  "promptText": "Full sentence description ending with a period.",
  "mode": "image_to_video" | "text_to_video" | "lipsync",
  "referenceImageUrl": "<signed URL>",
  "referenceVideoUrl": "<signed URL when lipsync>",
  "modelVariant": "veo-3",
  "duration": 8,
  "aspectRatio": "16:9" | "9:16"
}
```

### Pika (`/pika/generate`)

```json
{
  "promptText": "...",
  "mode": "image_to_video" | "text_to_video",
  "referenceImageUrl": "<signed URL>",
  "modelVariant": "pika-2.0",
  "duration": 4
}
```

### Fal (`/fal/generate`)

```json
{
  "promptText": "...",
  "modelVariant": "fal-ai/flux/dev/video" | "fal-ai/mochi-v1",
  "referenceImageUrl": "<signed URL or null>",
  "settings": { "...fal-model-specific..." }
}
```

### Grok / Higgsfield

Identical shape to Runway. Return `PROVIDER_NOT_AVAILABLE` until APIs
open. Body is still validated so we can wire the UI today and flip on
the upstream call when the keys arrive.

## Error handling at the AVT UI

- **Pre-flight**: AVT checks `apiReady` flag from a future
  `GET /video-providers/health` (or just attempts the call and reads
  `errorCode`).
- **In-flight**: The Generate button shows a spinner; on failure the
  toast surfaces `errorMessage`. The `provider_jobs.error_text` row is
  always populated for forensics.
- **Recovery**: Failed-job rows get a Retry button that re-POSTs the
  same payload. The new attempt is a new `provider_jobs` row linked to
  the same prompt + shot, so we keep a trail of attempts.

## What this doc deliberately does NOT cover

- Per-provider HTTP call details — those live in the function code with
  comments pointing to the upstream docs.
- The render pipeline (timeline_assembly.md handles Phase 2).
- Storage GC for clips uploaded by the proxy but never approved — see
  `audit_pre_api.md` D2 (deferred).
