/**
 * Provider-jobs runtime: create + poll generation jobs through Control Center.
 *
 * Flow:
 *   1. createGenerationJob() — POSTs to AVT's proxy-provider-call edge function,
 *      which forwards to Control Center's video-providers-<name>-generate
 *      endpoint. Writes a `provider_jobs` row in queued state, then updates it
 *      with the upstream providerJobId.
 *   2. pollJobStatus() — GETs CC's video-providers-job-status?provider=&id=
 *      via the same proxy. Updates the provider_jobs row.
 *   3. triggerServerIngest() — when status=succeeded, asks AVT's
 *      `ingest-provider-job` edge function to download the bytes from CC and
 *      write the project_assets row server-side. Avoids piping 5-10 MB base64
 *      payloads through the browser, which is where the previous
 *      `fetchAndIngestResult` path silently failed.
 *
 * `fetchAndIngestResult()` is kept as a browser-side fallback (and to keep the
 * existing test suite covering the same code path), but `useIngestOnSuccess`
 * now prefers the server-side path.
 */

import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/storage";
import type {
  ProviderName,
  ProviderJobStatus,
  ProviderJob,
} from "@/integrations/supabase/aliases";

/**
 * Endpoint slug for each provider on Control Center. Matches the
 * `supabase/functions/video-providers-<provider>-generate` folder names.
 */
const ENDPOINT_BY_PROVIDER: Partial<Record<ProviderName, string>> = {
  runway: "video-providers-runway-generate",
  veo: "video-providers-veo-generate",
  gemini: "video-providers-veo-generate", // gemini -> veo on the CC side
  pika: "video-providers-pika-generate",
  fal: "video-providers-fal-generate",
  grok: "video-providers-grok-generate",
  higgsfield: "video-providers-higgsfield-generate",
};

export class ProviderCallError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly providerStatus?: number,
    public readonly retryable?: boolean,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

export type GenerationInput = {
  provider: ProviderName;
  projectId: string;
  promptId?: string | null;
  shotId?: string | null;
  promptText: string;
  mode?: "text_to_video" | "image_to_video" | "lipsync";
  referenceImagePath?: string | null;
  modelVariant?: string;
  duration?: number;
  aspectRatio?: string;
  seed?: number;
  settings?: Record<string, unknown>;
};

export type GenerationEnvelope = {
  jobId: string;
  providerJobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrl: string | null;
  costEstimateCents: number | null;
  costFinalCents: number | null;
  provider: string;
  modelVariant: string;
  providerMetadata: Record<string, unknown>;
};

export type IngestServerResult = {
  ok: boolean;
  examined: number;
  ingested: Array<{ jobId: string; assetId: string; sizeBytes: number }>;
  errors: Array<{ jobId: string; error: string }>;
};

async function callProxy<T = Record<string, unknown>>(
  endpoint: string,
  init: { method?: "POST" | "GET"; query?: Record<string, string>; body?: Record<string, unknown> },
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new ProviderCallError("UNAUTHORISED", "Not signed in.");
  }
  const { data, error } = await supabase.functions.invoke<{ ok: boolean } & T>(
    "proxy-provider-call",
    {
      body: {
        endpoint,
        method: init.method ?? "POST",
        query: init.query,
        body: init.body ?? {},
      },
    },
  );
  if (error) {
    throw new ProviderCallError("INTERNAL", error.message || "proxy invoke failed");
  }
  if (!data || data.ok === false) {
    const errData = (data ?? {}) as Record<string, unknown>;
    throw new ProviderCallError(
      String(errData.errorCode ?? "PROVIDER_API_ERROR"),
      String(errData.errorMessage ?? "Provider call failed"),
      Number(errData.providerStatus) || undefined,
      Boolean(errData.retryable),
    );
  }
  return data as T;
}

/**
 * Create a generation job. Writes the `provider_jobs` row, hits CC's
 * generate endpoint, then updates the row with the upstream id and status.
 *
 * Returns the AVT `provider_jobs.id` (UUID) and the upstream provider job id.
 */
export async function createGenerationJob(input: GenerationInput): Promise<{
  providerJobRowId: string;
  envelope: GenerationEnvelope;
}> {
  const endpoint = ENDPOINT_BY_PROVIDER[input.provider];
  if (!endpoint) {
    throw new ProviderCallError(
      "INVALID_INPUT",
      `Provider ${input.provider} is not supported by the Control Center proxy yet.`,
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");

  // Resolve a temporary signed URL for the locked reference if present.
  let referenceImageUrl: string | null = null;
  if (input.referenceImagePath) {
    try {
      referenceImageUrl = await signedUrl("artist-assets", input.referenceImagePath, 3600);
    } catch {
      referenceImageUrl = null;
    }
  }

  // Insert the queued row up-front so we always have an audit trail even if
  // the CC call errors immediately.
  const { data: insertedRow, error: insertError } = await supabase
    .from("provider_jobs")
    .insert({
      user_id: user.id,
      project_id: input.projectId,
      prompt_id: input.promptId ?? null,
      provider: input.provider,
      status: "queued",
      request_payload_json: ({
        promptText: input.promptText,
        mode: input.mode ?? null,
        referenceImagePath: input.referenceImagePath ?? null,
        modelVariant: input.modelVariant ?? null,
        duration: input.duration ?? null,
        aspectRatio: input.aspectRatio ?? null,
        seed: input.seed ?? null,
        shotId: input.shotId ?? null,
        settings: (input.settings ?? null) as unknown,
      } as unknown) as never,
    })
    .select("id")
    .single();
  if (insertError || !insertedRow) {
    throw new ProviderCallError(
      "INTERNAL",
      `Failed to create provider_jobs row: ${insertError?.message ?? "unknown"}`,
    );
  }

  try {
    const envelope = await callProxy<GenerationEnvelope>(endpoint, {
      method: "POST",
      body: {
        avt_project_id: input.projectId,
        avt_prompt_id: input.promptId ?? null,
        avt_shot_id: input.shotId ?? null,
        promptText: input.promptText,
        mode: input.mode,
        referenceImageUrl,
        modelVariant: input.modelVariant,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        seed: input.seed,
        settings: input.settings,
      },
    });

    await supabase
      .from("provider_jobs")
      .update({
        external_job_id: envelope.providerJobId || null,
        status: (envelope.status ?? "queued") as ProviderJobStatus,
        response_payload_json: envelope as unknown as never,
      })
      .eq("id", insertedRow.id);

    return { providerJobRowId: insertedRow.id, envelope };
  } catch (err) {
    const e = err instanceof ProviderCallError ? err : new ProviderCallError("INTERNAL", String(err));
    await supabase
      .from("provider_jobs")
      .update({
        status: "failed",
        error_text: `[${e.errorCode}] ${e.message}`,
      })
      .eq("id", insertedRow.id);
    throw e;
  }
}

/**
 * Poll the status of a job at Control Center. Updates the local
 * provider_jobs row if the status moved.
 */
export async function pollJobStatus(
  providerJobRowId: string,
): Promise<GenerationEnvelope> {
  const { data: row, error } = await supabase
    .from("provider_jobs")
    .select("id, provider, external_job_id, status, request_payload_json")
    .eq("id", providerJobRowId)
    .single();
  if (error || !row) throw new ProviderCallError("INVALID_INPUT", "provider_jobs row not found");
  if (!row.external_job_id) {
    // No upstream id yet — surface current local state without polling.
    return {
      jobId: row.id,
      providerJobId: "",
      status: row.status as GenerationEnvelope["status"],
      resultUrl: null,
      costEstimateCents: null,
      costFinalCents: null,
      provider: row.provider,
      modelVariant: "",
      providerMetadata: {},
    };
  }

  const modelPath = ((row.request_payload_json as Record<string, unknown> | null)?.modelVariant as string) ?? "";
  const query: Record<string, string> = {
    provider: row.provider,
    id: row.external_job_id,
  };
  if (row.provider === "fal" && modelPath) query.modelPath = modelPath;

  const envelope = await callProxy<GenerationEnvelope>(
    "video-providers-job-status",
    { method: "GET", query },
  );

  if (envelope.status !== row.status) {
    await supabase
      .from("provider_jobs")
      .update({
        status: envelope.status as ProviderJobStatus,
        response_payload_json: envelope as unknown as never,
      })
      .eq("id", row.id);
  }

  return envelope;
}

/**
 * Server-side ingest — preferred path. Hands off to the
 * `ingest-provider-job` edge function which does the bytes round-trip in
 * Deno (no browser memory pressure, no atob stack overflow). Returns the
 * envelope including the per-row outcome so the UI can report failures
 * without burying them in a console.error.
 */
export async function triggerServerIngest(
  providerJobRowId: string,
): Promise<IngestServerResult> {
  const { data, error } = await supabase.functions.invoke<IngestServerResult>(
    "ingest-provider-job",
    { body: { jobId: providerJobRowId } },
  );
  if (error) {
    throw new ProviderCallError(
      "INTERNAL",
      `ingest-provider-job invoke failed: ${error.message}`,
    );
  }
  if (!data || data.ok === false) {
    const detail = (data as unknown as Record<string, unknown>)?.error
      ?? "ingest-provider-job returned no payload";
    throw new ProviderCallError("INTERNAL", String(detail));
  }
  return data;
}

/**
 * Backfill mode — sweep every succeeded-but-not-ingested row owned by the
 * caller. Limit defaults to 25 server-side; pass `limit` to raise to the
 * server-side cap (100). Returns the same envelope shape as the single-row
 * trigger.
 */
export async function triggerServerIngestBackfill(
  params?: { limit?: number },
): Promise<IngestServerResult> {
  const { data, error } = await supabase.functions.invoke<IngestServerResult>(
    "ingest-provider-job",
    { body: { all: true, limit: params?.limit ?? 50 } },
  );
  if (error) {
    throw new ProviderCallError(
      "INTERNAL",
      `ingest-provider-job backfill invoke failed: ${error.message}`,
    );
  }
  if (!data || data.ok === false) {
    const detail = (data as unknown as Record<string, unknown>)?.error
      ?? "ingest-provider-job returned no payload";
    throw new ProviderCallError("INTERNAL", String(detail));
  }
  return data;
}

/**
 * Browser-side fallback ingest. Kept for the existing test suite and as a
 * last-resort manual trigger; the server-side `triggerServerIngest` is the
 * primary path.
 *
 * After a job has status=succeeded, fetch the result video bytes via CC's
 * job-result endpoint (inline=1 to get base64), re-upload to AVT's
 * project-clips bucket via upload-asset, and create a project_assets row
 * linked back to the job. Returns the new project_assets.id.
 */
export async function fetchAndIngestResult(
  providerJobRowId: string,
): Promise<string> {
  const { data: row, error } = await supabase
    .from("provider_jobs")
    .select(
      "id, user_id, project_id, prompt_id, provider, external_job_id, request_payload_json, result_asset_id",
    )
    .eq("id", providerJobRowId)
    .single();
  if (error || !row) throw new ProviderCallError("INVALID_INPUT", "provider_jobs row not found");
  if (row.result_asset_id) return row.result_asset_id;
  if (!row.external_job_id) {
    throw new ProviderCallError("INVALID_INPUT", "No upstream provider job id yet — nothing to fetch.");
  }

  const modelPath = ((row.request_payload_json as Record<string, unknown> | null)?.modelVariant as string) ?? "";
  const shotId = ((row.request_payload_json as Record<string, unknown> | null)?.shotId as string) ?? null;
  const query: Record<string, string> = {
    provider: row.provider,
    id: row.external_job_id,
    inline: "1",
  };
  if (row.provider === "fal" && modelPath) query.modelPath = modelPath;

  const result = await callProxy<{
    contentType: string;
    bytes_base64: string;
    sizeBytes: number;
  }>("video-providers-job-result", { method: "GET", query });

  // Decode base64 → bytes
  const bin = atob(result.bytes_base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  // Upload via existing upload-asset edge function (it enforces the
  // user_id-prefix RLS invariant).
  const filename = `generated_${row.provider}_${row.external_job_id.slice(0, 12)}.mp4`;
  const path = `${row.user_id}/${row.project_id}/${row.id}/${filename}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new ProviderCallError("UNAUTHORISED", "Not signed in.");

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-asset`;
  const uploadResp = await fetch(fnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": result.contentType || "video/mp4",
      "X-Bucket": "project-clips",
      "X-Path": path,
      "X-Upsert": "true",
    },
    body: bytes,
  });
  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new ProviderCallError("INTERNAL", `upload-asset failed: ${uploadResp.status} ${text.slice(0, 200)}`);
  }

  const { data: assetRow, error: assetError } = await supabase
    .from("project_assets")
    .insert({
      user_id: row.user_id,
      project_id: row.project_id,
      shot_id: shotId,
      prompt_id: row.prompt_id,
      asset_type: "generated_clip",
      file_url: path,
      source_tool: row.provider,
      approval_status: "pending",
      metadata_json: ({
        bucket: "project-clips",
        file_size_bytes: result.sizeBytes,
        mime_type: result.contentType || "video/mp4",
        provider_job_id: row.id,
        external_job_id: row.external_job_id,
      } as unknown) as never,
    })
    .select("id")
    .single();
  if (assetError || !assetRow) {
    throw new ProviderCallError("INTERNAL", `Failed to insert project_assets row: ${assetError?.message ?? "unknown"}`);
  }

  await supabase
    .from("provider_jobs")
    .update({ result_asset_id: assetRow.id })
    .eq("id", row.id);

  return assetRow.id;
}

export type { ProviderJob };
