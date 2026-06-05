import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";

/**
 * Identity face-swap ("Apply My Face"): takes a project scene image and the
 * artist's primary Character-DNA face, runs Fal's advanced face-swap via the
 * faceswap-proxy edge function, and persists the result as a new
 * `generated_still` project asset (status: pending) linked back to the source.
 */
export type ApplyIdentityInput = {
  artistId: string;
  projectId: string;
  /** Storage path of the target scene image (the project asset's file_url). */
  scenePath: string;
  /** Bucket the scene image lives in (use bucketForAssetType). */
  sceneBucket: string;
  /** Source asset id, for provenance (parent_asset_id). */
  sceneAssetId?: string;
  shotId?: string;
  /** Defaults to the artist profile (male, user_hair) in the proxy. */
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

export async function callApplyIdentity(
  input: ApplyIdentityInput,
): Promise<ApplyIdentityResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL in env");

  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/faceswap-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
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
    throw new Error(`face-swap failed: ${resp.status} ${detail || resp.statusText}`);
  }
  return (await resp.json()) as ApplyIdentityResult;
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
