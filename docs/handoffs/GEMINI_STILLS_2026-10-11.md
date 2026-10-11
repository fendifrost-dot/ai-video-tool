# Nano Banana via Control Center — 11 October 2026

## State

CODED, NOT MERGED, NOT DEPLOYED. AVT implementation `be9ee5cdfe89006d489e1d1c61884367cfdfd7c7` on `codex/gemini-stills`, based on main `1349b224e695957cd8275aa1b58c9162fd785def`.
CC implementation `715fdd5521062dd1131db1e0f192cacdfc61964a`, branch `codex/gemini-stills` in `fendifrost-dot/fendi-control-center`. CC's detailed handoff is `docs/HANDOFF_GEMINI_STILLS.md`. Published through the authenticated GitHub connector; implementation tree hashes match the locally tested trees exactly. This handoff commit adds documentation only.

This implements the user's request for a Gemini Nano Banana route through Control Center. Runway also documents Nano Banana 2/Pro API models; its existing AVT route is video-only. Direct Google 2.1 was chosen to preserve the requested generation rather than substitute Runway's 2/Pro aliases. API/model access and funded balance are **not verified**. Higgsfield web-credit exhaustion did not establish API exhaustion. Do not request a refill without checking the account that would actually be billed.

## What changes

- `world-still-proxy`, explicit `model:"gemini-nano-banana-2.1"`, calls CC's new image endpoint using existing server-to-server auth. Grok defaults/model-cap escalation remain intact. Runway/Higgsfield Nano Banana aliases are refused rather than silently becoming Grok.
- One candidate per call, 1K/2K, up to 14 references, bounded Google token/byte limits and no auto-retries. Server reports direct Google billing and estimate/actual distinction. It does not promise image quality or identity fidelity from mocked tests.
- A paid call requires a queued, owned `provider:"gemini"` job. Atomic claim prevents duplicate submissions with that job ID. Snapshot preserves existing variation/treatment metadata; results are filed unselected in `project-references` and associated only with that job. No production cast, wardrobe, performance clips, selections, timing, export or active variation changes.
- Imported `prop-refs` references work by project asset ID with a strict caller-UID folder check, plus user-session signing and CC host/path checks. No arbitrary URL inputs, cross-owner paths or silently omitted references. Existing legacy files under a different UID can be refused; do not weaken ownership to force them through.
- Stored image MIME/extension follows the provider output. A failed asset row insertion is a failure, not a fake successful filing. Signed preview URLs are returned but not persisted on the job.
- No database migration, no change to provider enum (Gemini already exists), no frontend provider picker added. This first integration is callable through the existing MCP still function using the explicit model field. It does not change the current UI's default image model.

## Local evidence

- Clean npm ci, app typecheck, production build and full existing unit/mocked-integration suite passed; existing skip remains. Final signed-preview persistence fix separately passed the focused Gemini suite.
- New AVT coverage: **4 unit, 8 mocked integration, 0 provider-live, 0 real-media benchmark, 0 deployment smoke**. Existing reference suite also passed. Checks cover default Grok preservation, imported reference ownership, dry-run, private signing, owned job claim, duplicate calls, transport/gateway ambiguity, CC refusal, persistent provenance and no signed tokens in job records. A follow-up on the PR explicitly marks a gateway failure without billing evidence as possibly billed; focused tests passed after that correction.
- Edge entry bundled with esbuild and local graph typechecked with ambient Deno/CDN declarations. Not a live Deno boot. `node scripts/mcp/build-catalog.mjs --check` passed.
- RLS integration script accompanies the change: `scripts/qa/gemini_storage_rls.mjs`. **Not run**: two existing disposable identities/objects are needed. Run this before deployment approval; an RLS-001 failure remains a blocker, not a passing unit test.
- Spend $0. No provider media requests, uploads to Google or production database edits were performed in this implementation task.

## Review/deploy gates

Class C under `CLAUDE.md` and `docs/ARCHITECTURE_REVIEW.md`: architecture, product and security approvals are all outstanding. See RISK_REGISTER entry GEMINI-STILL-1. Do not merge or call this live before those reviews and the outstanding storage check.

After approval, merge/deploy CC first. AVT Lovable project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8`, backend `qoyxgnkvjukovkrvdaiq`: redeploy **world-still-proxy** and **avt-mcp** (updated function catalogue description) from the reviewed merge. No SQL, frontend Publish or Lovable AI build needed. Coordinate with active production agents. Publish does not redeploy edge functions.

## Free dry-run, after deployment

Through the existing AVT MCP function invocation, call `world-still-proxy` with:

```json
{
  "projectId": "764a63d2-93cd-44f3-905f-292f14ab2f51",
  "model": "gemini-nano-banana-2.1",
  "prompt": "Reference-delivery readiness check. Do not generate.",
  "n": 1,
  "resolution": "2k",
  "aspectRatio": "9:16",
  "maxCostUsd": 0.15,
  "dryRun": true,
  "references": [{
    "source": "project_asset",
    "id": "3fce9cb5-012f-4158-aecb-6615343eb2f3",
    "role": "cast",
    "label": "Approved Nano Banana portrait"
  }]
}
```

Expected 200 with `ok:true`, `model:"gemini-nano-banana-2.1"`, `provider:"gemini"`, `billingAccount:"Google Gemini API"`, `dryRun:true`, `billed:false`, `referencesAccepted:true`, `maxReferences:14`, `referencesChecked:1`, `referencesSent:0`, `credentialsConfigured:true`, `modelAccessVerified:false`, `actualCostUsd:null`. No image signed/downloaded/uploaded/generated; no job row required or written. A 200 envelope with `ok:false` is a failure.

Missing CC deployment/configuration must return `gemini_not_ready`/`control_center_not_configured`, not Grok fallback. A foreign project's reference must fail before signing. CC unauthenticated POST should be 401 `UNAUTHORISED`; 404/503 is not a passing deploy check.

## Later paid smoke — only when reference-transfer and generation authorisation cover it

The prior attempted reference upload had an automatic approval rejection. This code work does not override it; do not use the new route to bypass the block.

For an authorised test, create **one new** `provider_jobs` row owned by the signed-in user, correct project/variation, `provider:"gemini"`, `status:"queued"`, no external_job_id/finalized_at. Preserve the intended treatment revision in its request payload. Invoke the same still route with `dryRun:false`, `jobRowId`, a real approved prompt and a $0.15-or-higher explicit cap. This route accepts n=1 only. CC's list-rate upper estimate is $0.147456 (AVT reference planning rounds to $0.1475), not a guarantee of an invoice amount.

Expect one pending unselected project asset, source_tool Gemini, correct image MIME, input reference IDs and usage/modelVersion provenance; job status succeeded and finalised with result_asset_id. A replay of the same job must return `gemini_job_not_claimable` without another provider call. A missing/failed countTokens answer must stop before generateContent. Inspect output realism and identity separately; do not declare the new Google route identical to the prior Higgsfield wrapper merely because both say Nano Banana 2.1.

If the response is lost, do not create a retry automatically: inspect AVT job/asset and CC audit records. A claimed job can require manual reconciliation after a crash. Never record unknown billing as zero. Do not auto-select the test portrait or animate it.

## Source/account distinctions

Google docs: `https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1`, `https://ai.google.dev/gemini-api/docs/generate-content/image-generation`, `https://ai.google.dev/gemini-api/docs/pricing`, `https://ai.google.dev/api/tokens` (read 11 Oct 2026).
Runway: `https://docs.dev.runwayml.com/guides/models/` lists `gemini_image3.1_flash` (2), `gemini_image3_pro` (Pro), legacy `gemini_2.5_flash`. No Runway account balance was checked, and no Runway image endpoint is added by this change.

Report PR/merge/deploy status, exact probe outcomes, RLS result, account/model access evidence, and any authorised test's asset/job/usage. Do not call local tests proof of realism, provider availability, billing or live deployment.
