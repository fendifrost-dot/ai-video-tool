/**
 * The runner's effects in the signed-in browser: the owner's session, the proxy, the jobs table, storage. Kept apart
 * from runner.ts so the rules there stay testable without any of it.
 */
import { supabase } from "@/lib/supabase";
import { buildStoragePath, signedUrl, uploadToBucket } from "@/lib/storage";
import { statusFromEnvelope, type BatchJobRow, type RunnerDeps } from "./runner";
import { panelSeam, type PanelSeam } from "./stillCheck";

/** The still as a small luma picture, read through its signed link (the bucket allows cross-origin reads). */
async function stillSeam(url: string): Promise<PanelSeam | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const loaded = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!loaded || !img.naturalWidth || !img.naturalHeight) return null;
  // the still at its own size: the check needs the seam's one-pixel straightness, which a thumbnail averages away
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) luma[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  return panelSeam(luma, w, h);
}

/** Read the proxy's own error text out of a non-2xx invoke (supabase-js hands back the Response as error.context). */
async function detailOf(error: unknown, data: unknown): Promise<string> {
  const fromBody = (b: unknown): string | null => {
    const o = b as Record<string, unknown> | null;
    if (!o) return null;
    const parts = [o.errorCode, o.errorMessage ?? o.error, o.detail].filter((x) => typeof x === "string" && x) as string[];
    return parts.length ? parts.join(": ") : null;
  };
  const direct = fromBody(data);
  if (direct) return direct;
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown>; status?: number } } | null)?.context;
    const body = ctx?.json ? await ctx.json() : null;
    const viaCtx = fromBody(body);
    if (viaCtx) return `${ctx?.status ?? ""} ${viaCtx}`.trim();
  } catch {
    // the body was not JSON; fall through to the transport message
  }
  return (error as { message?: string } | null)?.message || "the call failed without a reason";
}

export async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in.");
  return data.user.id;
}

export async function browserRunnerDeps(): Promise<RunnerDeps> {
  const userId = await requireUserId();
  return {
    userId,
    sign: (bucket, path) => signedUrl(bucket, path, 86400),
    inspectStill: async (path) => stillSeam(await signedUrl("project-references", path, 600)),
    generateStills: async (body) => {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("world-still-proxy", { body });
      if (error || !data) return { ok: false, error: await detailOf(error, data) };
      return data as Awaited<ReturnType<RunnerDeps["generateStills"]>>;
    },
    insertJob: async (row) => {
      const { data, error } = await supabase
        .from("provider_jobs")
        .insert({ user_id: userId, ...row, request_payload_json: row.request_payload_json as never })
        .select("id")
        .single();
      if (error || !data) throw new Error(`could not record the job: ${error?.message ?? "no row returned"}`);
      return data.id;
    },
    updateJob: async (id, patch) => {
      const { error } = await supabase.from("provider_jobs").update(patch as never).eq("id", id);
      if (error) throw new Error(`could not update the job record: ${error.message}`);
    },
    callProxy: async (endpoint, body) => {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("proxy-provider-call", {
        body: { endpoint, method: "POST", body },
      });
      if (error || !data || data.ok === false) throw new Error(await detailOf(error, data));
      return data;
    },
  };
}

/** Put a shot's source clip (the real take) in project-clips and return its path. */
export async function uploadSourceClip(projectId: string, runId: string, shotId: string, file: File): Promise<string> {
  const userId = await requireUserId();
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const path = buildStoragePath(userId, projectId, "seedance", `${runId}_${shotId}_src.${ext}`);
  await uploadToBucket("project-clips", path, file, { upsert: true });
  return path;
}

/** Put a shot's still in project-references and return its path. */
export async function uploadStill(projectId: string, runId: string, shotId: string, file: File): Promise<string> {
  const userId = await requireUserId();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = buildStoragePath(userId, projectId, "worlds", `${runId}_${shotId}_still.${ext}`);
  await uploadToBucket("project-references", path, file, { upsert: true });
  return path;
}

/** A clip's duration in seconds, read by the browser's own decoder (null when it cannot be read in time). */
export function clipSeconds(file: File, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (n: number | null) => {
      URL.revokeObjectURL(url);
      resolve(n);
    };
    const t = setTimeout(() => done(null), timeoutMs);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      clearTimeout(t);
      done(Number.isFinite(v.duration) ? Number(v.duration.toFixed(3)) : null);
    };
    v.onerror = () => {
      clearTimeout(t);
      done(null);
    };
    v.src = url;
  });
}

/** Mark a submit that never reported back as failed, after the operator has checked the provider. */
export async function markJobFailed(rowId: string, reason: string): Promise<void> {
  const { error } = await supabase.from("provider_jobs").update({ status: "failed", error_text: reason }).eq("id", rowId);
  if (error) throw new Error(error.message);
}

/** Ask the provider where one job stands and write it on the row. Returns the row's new state. */
export async function pollBatchJob(row: Pick<BatchJobRow, "id" | "provider" | "external_job_id">): Promise<"running" | "succeeded" | "failed"> {
  if (!row.external_job_id) return "running";
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("proxy-provider-call", {
    body: { endpoint: "video-providers-job-status", method: "GET", query: { provider: row.provider, id: row.external_job_id } },
  });
  if (error || !data) throw new Error(await detailOf(error, data));
  const state = statusFromEnvelope(data);
  if (state !== "running") {
    const patch: Record<string, unknown> = { status: state, response_payload_json: data };
    if (state === "failed") patch.error_text = String(data.errorMessage ?? data.status ?? "the provider reported a failure").slice(0, 500);
    const { error: upErr } = await supabase.from("provider_jobs").update(patch as never).eq("id", row.id);
    if (upErr) throw new Error(upErr.message);
  }
  return state;
}
