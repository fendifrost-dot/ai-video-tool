import { wellFormedObjectPath } from "../_shared/storageAccess.ts";
import { callControlCenter, controlCenterConfig, type ControlCenterConfig, type ControlCenterResult } from "../_shared/controlCenterClient.ts";
import { planStillRequest, type ResolvedReference } from "../_shared/stillReferences.ts";

export const GEMINI_MODEL = "gemini-nano-banana-2.1";
// Mirrors Control Center: 16,384 input tokens at $1.50/M + 8,192 output tokens (final image, thinking, interim images) at $30/M.
export const GEMINI_COST_BOUND = (16_384 * 1.5 + 8_192 * 30) / 1e6;
export function unsupportedNanoAlias(model: unknown): boolean {
  return typeof model === "string" && /^(gemini|nano[_-]?banana)/i.test(model) && model !== GEMINI_MODEL;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function geminiPlan(pictures: number, resolution: string, maxCostUsd: number) {
  const plan = planStillRequest({ pictures, n: 1, resolution, askedModel: GEMINI_MODEL, defaultModel: GEMINI_MODEL, maxCostUsd, capOf: () => 14, generationRateOf: () => GEMINI_COST_BOUND, models: [{ model: GEMINI_MODEL, usdPerImage: { "1k": GEMINI_COST_BOUND, "2k": GEMINI_COST_BOUND }, usdPerInputImage: 0, basis: "Google list-rate conditional estimate (holds only if billed output <= maxOutputTokens 8192 and input <= 16384 tokens; unverified); actual invoice unknown" }] });
  // The shared plan rounds the estimate to 4 dp (0.270336 -> 0.2703); Control Center gates on the exact bound, so
  // gate here on the exact bound too, or a cap in between would pass AVT and be refused by CC.
  return plan.ok ? { ...plan, overGate: plan.overGate || maxCostUsd < GEMINI_COST_BOUND } : plan;
}
export function validateGeminiRequest(body: { n?: unknown; prompt: unknown; aspectRatio?: unknown; maxCostUsd?: unknown; dryRun?: unknown; jobRowId?: unknown; recoverJobRowId?: unknown }): string | null {
  if (body.recoverJobRowId !== undefined) return typeof body.recoverJobRowId === "string" && UUID.test(body.recoverJobRowId) ? null : "invalid_recover_job";
  if (body.n !== undefined && body.n !== 1) return "gemini_one_candidate_per_request";
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 20_000) return "invalid_prompt";
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") return "invalid_dry_run";
  if (body.maxCostUsd !== undefined && (typeof body.maxCostUsd !== "number" || !Number.isFinite(body.maxCostUsd) || body.maxCostUsd < 0)) return "invalid_cost_cap";
  if (body.aspectRatio !== undefined && !["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].includes(String(body.aspectRatio))) return "invalid_aspect_ratio";
  if (body.dryRun !== true && (typeof body.jobRowId !== "string" || !UUID.test(body.jobRowId))) return "gemini_job_required";
  return null;
}
const CC_REFUSED_BEFORE_GOOGLE = new Set(["INVALID_REQUEST", "PROVIDER_KEY_NOT_CONFIGURED", "AUDIT_UNAVAILABLE", "UNAUTHORISED", "METHOD_NOT_ALLOWED"]);
export type FiledImage = { path: string; previewUrl: string | null; bytes: number; assetId: string | null };
/** A filing failure: `path` is set when the image itself was stored, so the paid output stays recoverable. */
export type FilingFailure = { error: string; path?: string };
type Input = {
  userId: string; projectId: string; prompt: string; resolution: string; aspectRatio: string;
  maxCostUsd: number; dryRun?: boolean; jobRowId?: string; references: ResolvedReference[];
};
// Existing Supabase clients, injected so the spend/ownership sequence is exercised by mocked integration tests.
type Dependencies = {
  // deno-lint-ignore no-explicit-any
  admin: any;
  // deno-lint-ignore no-explicit-any
  userClient: any;
  config?: ControlCenterConfig | null;
  call?: (config: ControlCenterConfig, call: Parameters<typeof callControlCenter>[1]) => Promise<ControlCenterResult>;
  file: (image: { bytes: Uint8Array; mime: string; extraMeta: Record<string, unknown> }) => Promise<FiledImage | FilingFailure>;
};
export async function geminiStill(input: Input, deps: Dependencies): Promise<Record<string, unknown>> {
  const cc = deps.config === undefined ? controlCenterConfig() : deps.config;
  if (!cc) return { ok: false, billed: false, error: "control_center_not_configured" };
  const call = deps.call ?? callControlCenter;
  const sentRefs = input.references.map(({ ref }) => ref);
  const request = { model: GEMINI_MODEL, n: 1, prompt: input.prompt, resolution: input.resolution, aspectRatio: input.aspectRatio, maxCostUsd: input.maxCostUsd, avt_user_id: input.userId, avt_project_id: input.projectId, jobRowId: input.jobRowId };
  if (input.dryRun) {
    try {
      const checked = await call(cc, { endpoint: "image-providers-gemini-generate", body: { ...request, dryRun: true, references: [] }, timeoutMs: 20_000 });
      if (checked.httpStatus !== 200 || checked.payload.ok !== true) return { ok: false, billed: false, error: "gemini_not_ready", detail: checked.payload.errorCode ?? "Control Center probe failed", modelAccessVerified: checked.payload.modelAccessVerified ?? false, googleError: checked.payload.googleError ?? null };
      return { ...checked.payload, dryRun: true, referencesSent: 0, referencesChecked: input.references.length };
    } catch { return { ok: false, billed: false, error: "control_center_unreachable" }; }
  }
  if (!input.jobRowId || !UUID.test(input.jobRowId)) return { ok: false, billed: false, error: "gemini_job_required" };
  // Atomic claim: replaying a job id must never submit a second paid request. A
  // crashed claim stays running for manual reconciliation, not automatic retry.
  const { data: job, error: claimError } = await deps.admin.from("provider_jobs")
    .update({ status: "running" }).eq("id", input.jobRowId).eq("user_id", input.userId)
    .eq("project_id", input.projectId).eq("provider", "gemini").eq("status", "queued")
    .is("external_job_id", null).is("finalized_at", null).select("id, variation_id, request_payload_json").maybeSingle();
  if (claimError || !job) return { ok: false, billed: false, error: "gemini_job_not_claimable", detail: "Use a new queued Gemini job owned by you in this project. Reconcile any prior submission first." };
  const snapshot = { ...(job.request_payload_json ?? {}), lane: "world_still", ...request, references: sentRefs };
  const { error: snapshotError } = await deps.admin.from("provider_jobs").update({ request_payload_json: snapshot }).eq("id", job.id).eq("user_id", input.userId);
  if (snapshotError) return { ok: false, billed: false, error: "job_snapshot_failed", detail: "No provider request submitted; job requires reconciliation." };

  let result: Record<string, unknown> = { ok: false, billed: false };
  let submitted = false;
  // Which step each outcome belongs to; a failure after generation never reads as "nothing was generated".
  const stages: Record<string, string> = { generation: "not_started", upload: "not_started", filing: "not_started", finalize: "not_started" };
  try {
    const references: { url: string; label: string; role: string }[] = [];
    for (const r of input.references) {
      const { data, error } = await deps.userClient.storage.from(r.buckets[0]).createSignedUrl(r.path, 600);
      if (error || !data?.signedUrl) throw new Error("reference_sign_failed");
      references.push({ url: data.signedUrl, label: r.ref.label, role: r.ref.role });
    }
    // Submission intent is on the row BEFORE the billable call: a worker killed mid-call leaves a job that says
    // "submitted, billing unknown", not a silent "running". If this write fails, nothing is sent.
    const submittedAt = new Date().toISOString();
    const { error: intentError } = await deps.admin.from("provider_jobs").update({ response_payload_json: { phase: "submitted", submittedAt, submitted: true, billed: "unknown", possiblyBilled: true, reconcile: RECONCILE_NOTE }, progress_note: `gemini submitted ${submittedAt}; billing unknown until finalized` }).eq("id", job.id).eq("user_id", input.userId);
    if (intentError) throw new Error("job_submission_record_failed");
    submitted = true; // CC might receive it even when its response is lost.
    stages.generation = "submitted";
    const response = await call(cc, { endpoint: "image-providers-gemini-generate", body: { ...request, references }, timeoutMs: 175_000 });
    const { images, ...evidence } = response.payload;
    // Control Center died or answered with something that is not its own envelope (e.g. the platform's
    // WORKER_RESOURCE_LIMIT, 12 Oct 2026): Google may already have billed. Record what is known for reconciliation
    // against CC's audit row (same jobRowId); never retry automatically.
    if (typeof evidence.ok !== "boolean") {
      result = { ok: false, error: "control_center_failed_after_submit", ccHttpStatus: response.httpStatus, ccPlatformCode: typeof evidence.code === "string" && /^[A-Z0-9_]{1,64}$/.test(evidence.code) ? evidence.code : null, billed: "unknown", possiblyBilled: true, actualCostUsd: null, references: sentRefs, reconcile: RECONCILE_NOTE };
      throw new Error("control_center_failed_after_submit");
    }
    // Control Center's own refusals before it calls Google (bad input, no key, no audit row, auth) spend nothing.
    // CC sends these codes only before run(); any sign of submission still wins.
    const refusedBeforeGoogle = response.httpStatus !== 200 && CC_REFUSED_BEFORE_GOOGLE.has(String(evidence.errorCode)) && evidence.possiblyBilled !== true && evidence.billed !== true && evidence.billed !== "unknown";
    result = { ...evidence, ok: response.httpStatus === 200 && evidence.ok === true, ccHttpStatus: response.httpStatus, billed: refusedBeforeGoogle ? false : evidence.billed ?? "unknown", possiblyBilled: refusedBeforeGoogle ? false : typeof evidence.possiblyBilled === "boolean" ? evidence.possiblyBilled : evidence.billed !== false, actualCostUsd: null, references: sentRefs };
    stages.generation = result.ok ? "succeeded" : "failed";
    if (result.ok) {
      if (!Array.isArray(images) || images.length !== 1) throw new Error("invalid_gemini_result");
      const image = images[0] as { data?: string; mimeType?: string };
      if (typeof image.data !== "string" || image.data.length > 12 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType ?? "")) throw new Error("invalid_gemini_result");
      const binary = atob(image.data); const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const filed = await deps.file({ bytes, mime: image.mimeType!, extraMeta: { ...evidence, prompt: input.prompt, actual_cost_usd: null, references: sentRefs, job_id: job.id, variation_id: job.variation_id ?? null, route: "gemini:generateContent" } });
      if ("error" in filed) {
        // Stored but not recorded is recoverable from its path (see recoverGeminiJob); not stored is lost.
        stages.upload = filed.path ? "succeeded" : "failed";
        stages.filing = filed.path ? "failed" : "not_started";
        result.recoverableImagePath = filed.path ?? null;
        result.imageLost = !filed.path;
        result.filingError = filed.error;
        throw new Error("asset_filing_failed");
      }
      stages.upload = "succeeded"; stages.filing = "succeeded";
      result.stills = [filed];
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    result = { ...result, ok: false, error: ["reference_sign_failed", "invalid_gemini_result", "asset_filing_failed", "control_center_failed_after_submit", "job_submission_record_failed"].includes(why) ? why : "gemini_request_failed", billed: submitted ? "unknown" : false, possiblyBilled: submitted, actualCostUsd: null };
    if (why === "control_center_failed_after_submit" || why === "gemini_request_failed") stages.generation = submitted ? "unknown" : "not_started";
  }
  const first = (result.stills as FiledImage[] | undefined)?.[0];
  const { stills: previews, ...recorded } = result;
  // Signed previews are response-only; persist paths/ids, never access tokens.
  if (Array.isArray(previews)) recorded.stills = (previews as FiledImage[]).map(({ path, assetId, bytes }) => ({ path, assetId, bytes }));
  recorded.stages = stages;
  const finalRow = { status: result.ok ? "succeeded" : "failed", response_payload_json: recorded, result_asset_id: first?.assetId ?? null, finalized_at: new Date().toISOString(), progress_note: null, error_text: result.ok ? null : [result.error ?? result.errorCode ?? "gemini_failed", result.ccPlatformCode, result.recoverableImagePath ? `image stored at ${result.recoverableImagePath}` : result.error === "asset_filing_failed" ? "image lost: upload failed" : null].filter(Boolean).join("; ") };
  // Finalization is retried once; a job left "running" after a filed image is the worst outcome short of loss.
  let finishError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    ({ error: finishError } = await deps.admin.from("provider_jobs").update(finalRow).eq("id", job.id).eq("user_id", input.userId).eq("project_id", input.projectId));
    if (!finishError) break;
  }
  stages.finalize = finishError ? "failed" : "succeeded";
  if (finishError) return { ...result, stages, jobRecordSaved: false, finalized: false, jobRowId: job.id, warning: result.ok ? "Image generated and filed, but the job row could not be finalized; it still reads 'running'. Reconcile the job; do not resubmit." : "Paid result may exist; reconcile this job. Do not resubmit automatically." };
  return { ...result, stages, jobRecordSaved: true, finalized: true, jobRowId: job.id };
}

export const RECONCILE_NOTE = "Look up Control Center tool_execution_logs where args->>'jobRowId' = this job. An 'attempted' row with no completion means the answer was lost after submission; a 'failed' row with auditFinalized=false means CC finished but could not record it. No CC row usually means CC refused before calling Google, but a CC audit-write failure is also possible: treat billing as unknown unless the row says otherwise.";

/**
 * Recover a Gemini job whose image was stored but never recorded (asset_filing_failed with recoverableImagePath):
 * confirm the object exists, file the project_assets row, and finalize the job as succeeded. No provider is called.
 */
export async function recoverGeminiJob(input: { userId: string; projectId: string; jobRowId: string }, deps: Pick<Dependencies, "admin"> & { record: (image: { path: string; extraMeta: Record<string, unknown> }) => Promise<FiledImage | FilingFailure> }): Promise<Record<string, unknown>> {
  if (!UUID.test(input.jobRowId)) return { ok: false, error: "gemini_job_required" };
  const { data: job, error } = await deps.admin.from("provider_jobs").select("id, status, result_asset_id, response_payload_json, request_payload_json, variation_id").eq("id", input.jobRowId).eq("user_id", input.userId).eq("project_id", input.projectId).eq("provider", "gemini").maybeSingle();
  if (error || !job) return { ok: false, error: "gemini_job_not_found" };
  const payload = (job.response_payload_json ?? {}) as Record<string, unknown>;
  if (job.result_asset_id) return { ok: true, alreadyRecovered: true, assetId: job.result_asset_id };
  const path = typeof payload.recoverableImagePath === "string" ? payload.recoverableImagePath : null;
  if (!path || job.status !== "failed") return { ok: false, error: "nothing_recoverable", detail: "Only a failed job whose image was stored (recoverableImagePath) can be recovered without regenerating." };
  // The owner can edit their own provider_jobs row, so the recorded path is caller-influenced: it must be well formed
  // and inside this project's own folder (userId/projectId/...), never just the caller's folder.
  if (!wellFormedObjectPath(path) || !path.startsWith(`${input.userId}/${input.projectId}/`)) return { ok: false, error: "recoverable_path_forbidden" };
  const dir = path.slice(0, path.lastIndexOf("/")), name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed, error: listError } = await deps.admin.storage.from("project-references").list(dir, { search: name });
  if (listError || !Array.isArray(listed) || !listed.some((o: { name: string }) => o.name === name)) return { ok: false, error: "recoverable_object_missing" };
  const { stages: _s, stills: _st, recoverableImagePath: _r, filingError: _f, ...evidence } = payload;
  const filed = await deps.record({ path, extraMeta: { ...evidence, recovered_from_job: job.id, variation_id: job.variation_id ?? null, prompt: (job.request_payload_json as Record<string, unknown> | null)?.prompt ?? null, route: "gemini:generateContent" } });
  if ("error" in filed) return { ok: false, error: "asset_record_failed", detail: filed.error };
  // Finalize only if nobody else did meanwhile (result_asset_id still null): two concurrent recoveries otherwise file
  // two asset rows for one paid image. The loser's row is reported so it can be removed, never silently kept.
  const { data: finalized, error: finalizeError } = await deps.admin.from("provider_jobs").update({ status: "succeeded", result_asset_id: filed.assetId, error_text: null, finalized_at: new Date().toISOString(), response_payload_json: { ...payload, ok: true, recoveredAt: new Date().toISOString(), stages: { ...(payload.stages as Record<string, string> ?? {}), filing: "recovered", finalize: "succeeded" } } }).eq("id", job.id).eq("user_id", input.userId).is("result_asset_id", null).select("id");
  if (finalizeError) return { ok: true, assetId: filed.assetId, finalized: false, warning: "Asset recorded but the job row could not be finalized." };
  const finalizedRows = Array.isArray(finalized) ? finalized : finalized ? [finalized] : [];
  if (finalizedRows.length === 0) return { ok: true, assetId: filed.assetId, finalized: false, duplicate: true, warning: "Another recovery finalized this job first; this asset row is a duplicate of the same image." };
  return { ok: true, assetId: filed.assetId, path, finalized: true };
}
