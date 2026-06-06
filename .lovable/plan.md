# Async Faceswap Refactor — File-by-File Plan

Mirrors the proven `compose-look-proxy` + `compose-look-callback` pattern (and `train-style-lora-*`). Synchronous CC call is replaced by submit + webhook callback because Fal jobs run ~270s, well beyond Supabase edge functions' idle cap.

## Architecture

```text
Browser ──► faceswap-proxy (submit)  ──► CC faceswap-generate (submit-only)
                │                                  │
                │ insert provider_jobs             │ submit job to Fal,
                │ status='queued', return jobId    │ register Fal webhook ->
                ▼                                  │ AVT faceswap-callback
        realtime subscribe to                     ▼
        provider_jobs row             Fal finishes ─► faceswap-callback
                ▲                                  │
                └──── status='completed' ◄─────────┘
                      result_asset_id set
```

## File-by-file changes

### 1. `supabase/functions/faceswap-proxy/index.ts` — rewrite as submit-only
- Keep: auth (bearer JWT → getUser), input validation, face DNA resolution, signing scenePath + face refs (45 min TTL).
- Change downstream call to CC `faceswap-generate` with new body: include `callbackUrl` pointing at `${SUPABASE_URL}/functions/v1/faceswap-callback?job_id=<providerJobRowId>` and the shared `X-Proxy-Secret`. Mode: submit-only (expect `{ ok, providerJobId }` back fast, no `imageUrl`).
- INSERT `provider_jobs` row first (so the callback URL can reference its id):
  - `user_id`, `project_id`, `provider='fal'`, `status='queued'`, `external_job_id=null` (filled by callback or by CC response), `request_payload_json={ capability:'identity_apply', scenePath, sceneBucket, sceneAssetId, shotId, faceFeatureId, gender, workflowType }`.
- Return within ~5s: `{ ok:true, jobId: providerJobRowId, externalJobId: cc.providerJobId ?? null }`.
- Drop: result download, project-references upload, project_assets insert, preview URL signing (all move to callback).

### 2. `supabase/functions/faceswap-callback/index.ts` — NEW
Modeled on `compose-look-callback/index.ts`.
- `POST`, CORS, OPTIONS.
- Auth via `X-Proxy-Secret` header (constant-time compare to `COMPOSE_LOOK_PROXY_SECRET`). Re-use the same secret to avoid a new env var, matching the existing helpers pattern.
- Query param `job_id` = `provider_jobs.id`. Look up the row (service role); if not found → 404; if already completed → 200 idempotent ack.
- Body: `{ status:'completed'|'failed', fal_image_url?, content_type?, width?, height?, model?, provider_job_id?, cost_cents?, error? }`.
- Failure path: update `provider_jobs` → `status='failed'`, `error_text=<msg>`; return 200.
- Success path:
  1. Read `request_payload_json` from the row to recover `project_id`, `shot_id`, `sceneAssetId`, `sceneBucket`, `scenePath`, `faceFeatureId`, `user_id`.
  2. Download `fal_image_url` (sniff mime, mirror compose-look-callback).
  3. Upload to `project-clips` bucket at `${user_id}/${project_id}/faceswap/faceswap_${ts}_${rand}.${ext}` via service role.
  4. Insert `project_assets` row: `asset_type='generated_still'`, `source_tool='fal'`, `approval_status='pending'`, `parent_asset_id=sceneAssetId`, full `metadata_json` (capability `identity_apply`, model, provider_job_id, cost_cents, face_feature_id, source_scene_path/bucket, width, height, content_type).
  5. Update `provider_jobs` → `status='completed'`, `result_asset_id=<new asset>`, `external_job_id=body.provider_job_id ?? existing`, `response_payload_json=body`.
- Inline `constantTimeEqual` + `sniffMime` (same as compose-look-callback — edge functions don't share modules across function dirs).

### 3. `supabase/config.toml` — add public block for the callback
```toml
[functions.faceswap-callback]
verify_jwt = false
```
(matches `compose-look-callback`; Fal/CC posts have no user JWT.)

### 4. `src/lib/queries/faceswap.ts` — submit + realtime wait
- `callApplyIdentity` (rename internally to "submit + await") changes:
  1. POST to `faceswap-proxy` → `{ jobId }`.
  2. Open a Supabase realtime channel filtered to `provider_jobs` where `id=eq.${jobId}`; also issue an immediate `select` to handle the race where the callback fires before the subscription is live.
  3. Resolve on `status='completed'` (fetch `result_asset_id` → `project_assets` row, sign a preview URL for return-value compatibility). Reject on `status='failed'` with `error_text`. Hard timeout 360s as a safety net (longer than observed 274s Fal time + buffer).
  4. Unsubscribe in `finally`.
- Return shape stays `{ ok, asset, signed_url, cost_cents, model }` so AssetCard doesn't change.
- `useApplyIdentity` keeps the same `onSuccess` invalidation.

### 5. `src/components/assets/AssetCard.tsx` — no behavior change
- Existing `isPending` already shows "Applying…". Confirm no edits beyond what the mutation hook already drives. (No code change expected unless verifying the button label/disabled state.)

## Out of scope
No changes to: schemas/migrations, other edge functions, other routes/pages, RLS, storage buckets (project-clips already exists).

## Coordination with CC (your sibling chat — not done by this agent)
CC's `faceswap-generate` must be switched to submit-only and accept `callbackUrl` + shared secret, register Fal's webhook to POST `{ status, fal_image_url, model, provider_job_id, cost_cents, width, height, content_type }` to that URL with `X-Proxy-Secret`. The AVT side is built to that contract.

## Deploy sequence after approval
1. Write the three files above.
2. Deploy `faceswap-proxy` and `faceswap-callback` (Lovable auto-deploys; explicit redeploy call to be safe).
3. Publish frontend.
4. Report deploy status + the callback URL to hand to CC.

Approve and I'll execute.