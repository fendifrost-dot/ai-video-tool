import { callControlCenter, controlCenterConfig, type ControlCenterConfig, type ControlCenterResult } from "../_shared/controlCenterClient.ts";
import { planStillRequest, type ResolvedReference } from "../_shared/stillReferences.ts";

export const GEMINI_MODEL = "gemini-nano-banana-2.1";
export const GEMINI_COST_BOUND = (16_384 * 1.5 + 4_096 * 30) / 1e6;
export function unsupportedNanoAlias(model: unknown): boolean {
  return typeof model === "string" && /^(gemini|nano[_-]?banana)/i.test(model) && model !== GEMINI_MODEL;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function geminiPlan(pictures: number, resolution: string, maxCostUsd: number) {
  return planStillRequest({ pictures, n: 1, resolution, askedModel: GEMINI_MODEL, defaultModel: GEMINI_MODEL, maxCostUsd, capOf: () => 14, generationRateOf: () => GEMINI_COST_BOUND, models: [{ model: GEMINI_MODEL, usdPerImage: { "1k": GEMINI_COST_BOUND, "2k": GEMINI_COST_BOUND }, usdPerInputImage: 0, basis: "Google token-budget upper estimate; actual invoice unknown" }] });
}
export function validateGeminiRequest(body: { n?: unknown; prompt: unknown; aspectRatio?: unknown; maxCostUsd?: unknown; dryRun?: unknown; jobRowId?: unknown }): string | null {
  if (body.n !== undefined && body.n !== 1) return "gemini_one_candidate_per_request";
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 20_000) return "invalid_prompt";
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") return "invalid_dry_run";
  if (body.maxCostUsd !== undefined && (typeof body.maxCostUsd !== "number" || !Number.isFinite(body.maxCostUsd) || body.maxCostUsd < 0)) return "invalid_cost_cap";
  if (body.aspectRatio !== undefined && !["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].includes(String(body.aspectRatio))) return "invalid_aspect_ratio";
  if (body.dryRun !== true && (typeof body.jobRowId !== "string" || !UUID.test(body.jobRowId))) return "gemini_job_required";
  return null;
}
export type FiledImage = { path: string; previewUrl: string | null; bytes: number; assetId: string | null };
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
  file: (image: { bytes: Uint8Array; mime: string; extraMeta: Record<string, unknown> }) => Promise<FiledImage | { error: string }>;
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
      if (checked.httpStatus !== 200 || checked.payload.ok !== true) return { ok: false, billed: false, error: "gemini_not_ready", detail: checked.payload.errorCode ?? "Control Center probe failed" };
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
  try {
    const references: { url: string; label: string; role: string }[] = [];
    for (const r of input.references) {
      const { data, error } = await deps.userClient.storage.from(r.buckets[0]).createSignedUrl(r.path, 600);
      if (error || !data?.signedUrl) throw new Error("reference_sign_failed");
      references.push({ url: data.signedUrl, label: r.ref.label, role: r.ref.role });
    }
    submitted = true; // CC might receive it even when its response is lost.
    const response = await call(cc, { endpoint: "image-providers-gemini-generate", body: { ...request, references }, timeoutMs: 175_000 });
    const { images, ...evidence } = response.payload;
    result = { ...evidence, ok: response.httpStatus === 200 && evidence.ok === true, actualCostUsd: null, references: sentRefs };
    if (result.ok) {
      if (!Array.isArray(images) || images.length !== 1) throw new Error("invalid_gemini_result");
      const image = images[0] as { data?: string; mimeType?: string };
      if (typeof image.data !== "string" || image.data.length > 12 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType ?? "")) throw new Error("invalid_gemini_result");
      const binary = atob(image.data); const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const filed = await deps.file({ bytes, mime: image.mimeType!, extraMeta: { ...evidence, prompt: input.prompt, actual_cost_usd: null, references: sentRefs, job_id: job.id, variation_id: job.variation_id ?? null, route: "gemini:generateContent" } });
      if ("error" in filed) throw new Error("asset_filing_failed");
      result.stills = [filed];
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    result = { ...result, ok: false, error: ["reference_sign_failed", "invalid_gemini_result", "asset_filing_failed"].includes(why) ? why : "gemini_request_failed", billed: submitted ? "unknown" : false, possiblyBilled: submitted, actualCostUsd: null };
  }
  const first = (result.stills as FiledImage[] | undefined)?.[0];
  const { stills: previews, ...recorded } = result;
  // Signed previews are response-only; persist paths/ids, never access tokens.
  if (Array.isArray(previews)) recorded.stills = (previews as FiledImage[]).map(({ path, assetId, bytes }) => ({ path, assetId, bytes }));
  const { error: finishError } = await deps.admin.from("provider_jobs").update({ status: result.ok ? "succeeded" : "failed", response_payload_json: recorded, result_asset_id: first?.assetId ?? null, finalized_at: new Date().toISOString(), error_text: result.ok ? null : String(result.error ?? result.errorCode ?? "Gemini failed") }).eq("id", job.id).eq("user_id", input.userId).eq("project_id", input.projectId);
  if (finishError) return { ...result, jobRecordSaved: false, warning: "Paid result may exist; reconcile this job. Do not resubmit automatically." };
  return { ...result, jobRecordSaved: true, jobRowId: job.id };
}
