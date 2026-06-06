import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";

/**
 * Identity face-swap ("Apply My Face"): submits a Fal advanced-face-swap job
 * via the faceswap-proxy edge function (now async — proxy returns a jobId
 * within ~5s), then polls the provider_jobs row until the sibling
 * faceswap-callback edge function marks it succeeded or failed. The callback
 * is what actually inserts the resulting project_assets row.
 *
 * Why polling and not realtime: enabling postgres_changes on provider_jobs
 * requires a publication migration, which is out of scope for this change.
 * A 3s poll for ~5 min has identical perceived UX and zero schema impact.
 */
export type ApplyIdentityInput = {
  artistId: string;
  projectId: string;
  scenePath: string;
  sceneBucket: string;
  sceneAssetId?: string;
  shotId?: string;
  gender?: "male" | "female" | "non-binary";
  workflowType?: "user_hair" | "target_hair";
  faceFeatureId?: string;
};

export type ApplyIdentityResult = {
  ok: true;
  asset: ProjectAsset;
  signed_url: string | null;
  cost_cents: number | null;
  model: string;
};

const POLL_INTERVAL_MS = 3000;
// Fal's advanced face-swap observed at ~270s; allow generous headroom for
// CC + Fal queue + webhook delivery.
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

async function submitFaceswap(
  input: ApplyIdentityInput,
  accessToken: string,
): Promise<{ jobId: string }> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL in env");

  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/faceswap-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      detail = await resp.text().catch(() => "");
    }
    throw new Error(`face-swap submit failed: ${resp.status} ${detail || resp.statusText}`);
  }
  const body = (await resp.json()) as { ok: true; jobId: string };
  if (!body?.jobId) throw new Error("face-swap submit returned no jobId");
  return { jobId: body.jobId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollJobUntilDone(jobId: string): Promise<{
  result_asset_id: string;
  response_payload_json: Record<string, unknown> | null;
}> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("provider_jobs")
      .select("status, error_text, result_asset_id, response_payload_json")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(`face-swap poll failed: ${error.message}`);
    if (data) {
      if (data.status === "succeeded") {
        if (!data.result_asset_id) {
          throw new Error("face-swap succeeded but result_asset_id is missing");
        }
        return {
          result_asset_id: data.result_asset_id,
          response_payload_json: (data.response_payload_json ?? null) as
            | Record<string, unknown>
            | null,
        };
      }
      if (data.status === "failed" || data.status === "cancelled") {
        throw new Error(`face-swap failed: ${data.error_text ?? data.status}`);
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("face-swap timed out waiting for callback");
}

export async function callApplyIdentity(
  input: ApplyIdentityInput,
): Promise<ApplyIdentityResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const { jobId } = await submitFaceswap(input, session.access_token);
  const { result_asset_id, response_payload_json } = await pollJobUntilDone(jobId);

  const { data: asset, error: assetErr } = await supabase
    .from("project_assets")
    .select("*")
    .eq("id", result_asset_id)
    .single();
  if (assetErr || !asset) {
    throw new Error(`face-swap result asset missing: ${assetErr?.message ?? "not found"}`);
  }

  // Best-effort preview URL — bucket lives in the asset metadata (callback
  // writes to project-clips). Failure here doesn't fail the mutation.
  const bucket =
    (asset.metadata_json as Record<string, unknown> | null)?.["bucket"] as
      | string
      | undefined ?? "project-clips";
  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(asset.file_url, 3600);

  const cb = response_payload_json ?? {};
  return {
    ok: true,
    asset: asset as ProjectAsset,
    signed_url: signed?.signedUrl ?? null,
    cost_cents:
      typeof (cb as Record<string, unknown>).cost_cents === "number"
        ? ((cb as Record<string, unknown>).cost_cents as number)
        : null,
    model:
      typeof (cb as Record<string, unknown>).model === "string"
        ? ((cb as Record<string, unknown>).model as string)
        : "fal-ai/face-swap",
  };
}

export function useApplyIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyIdentityInput) => callApplyIdentity(input),
    onSuccess: (result) => {
      qc.invalidateQueries({
        queryKey: projectAssetsKeys.forProject(result.asset.project_id),
      });
    },
  });
}
