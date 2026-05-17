import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  ClipReview,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import { projectAssetsKeys } from "./projectAssets";
import { computeDriftFlags } from "@/lib/clipReviews/driftFlags";

export const clipReviewsKeys = {
  all: ["clip_reviews"] as const,
  forProject: (projectId: string) => [...clipReviewsKeys.all, "project", projectId] as const,
  forAsset: (assetId: string) => [...clipReviewsKeys.all, "asset", assetId] as const,
  byAssetBatch: (stableKey: string) =>
    [...clipReviewsKeys.all, "by_asset", stableKey] as const,
};

/**
 * All clip reviews tied to assets in a project.
 * Joined: needs project_id from project_assets, so this fetches reviews
 * keyed by asset_id and lets the UI pair them.
 */
export function useClipReviewsByAsset(assetIds: string[]) {
  const stableKey = [...assetIds].sort().join(",");
  return useQuery<Record<string, ClipReview>>({
    queryKey: clipReviewsKeys.byAssetBatch(stableKey),
    queryFn: async () => {
      if (assetIds.length === 0) return {};
      const { data, error } = await supabase
        .from("clip_reviews")
        .select("*")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Keep most-recent per asset
      const map: Record<string, ClipReview> = {};
      for (const row of data ?? []) {
        if (!map[row.asset_id]) map[row.asset_id] = row;
      }
      return map;
    },
    enabled: assetIds.length > 0,
  });
}

/**
 * Upsert a clip review. We always insert a new row (history) rather than
 * updating in place — the UI surfaces the most-recent one.
 *
 * Phase A: drift_flags is computed from the scores in the payload (see
 * `computeDriftFlags`) and attached to the insert. If the caller passes an
 * explicit drift_flags array, we honour that — useful for backfill.
 */
export function useSaveClipReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"clip_reviews">, "user_id">,
    ): Promise<ClipReview> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const explicitFlags = (payload as { drift_flags?: unknown }).drift_flags;
      const driftFlags =
        explicitFlags ??
        computeDriftFlags({
          face_consistency_score: payload.face_consistency_score ?? null,
          wardrobe_score: payload.wardrobe_score ?? null,
          lighting_score: payload.lighting_score ?? null,
        });

      const insertPayload = {
        ...payload,
        user_id: user.id,
        drift_flags: driftFlags,
        // Cast to any at the seam — the generated Database type doesn't yet
        // know about the drift_flags column (Lovable's typegen lags by a beat).
      } as unknown as TablesInsert<"clip_reviews">;

      const { data, error } = await supabase
        .from("clip_reviews")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clipReviewsKeys.all });
      qc.invalidateQueries({ queryKey: projectAssetsKeys.all });
    },
  });
}

export function useUpdateClipReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"clip_reviews">;
    }): Promise<ClipReview> => {
      const touchesScores =
        "face_consistency_score" in patch ||
        "wardrobe_score" in patch ||
        "lighting_score" in patch;
      const hasExplicitFlags = "drift_flags" in (patch as Record<string, unknown>);
      const nextPatch: Record<string, unknown> = { ...patch };
      if (touchesScores && !hasExplicitFlags) {
        const { data: current } = await supabase
          .from("clip_reviews")
          .select("face_consistency_score,wardrobe_score,lighting_score")
          .eq("id", id)
          .maybeSingle();
        const merged = { ...(current ?? {}), ...patch } as {
          face_consistency_score: number | null;
          wardrobe_score: number | null;
          lighting_score: number | null;
        };
        nextPatch.drift_flags = computeDriftFlags(merged);
      }
      const { data, error } = await supabase
        .from("clip_reviews")
        .update(nextPatch as unknown as TablesUpdate<"clip_reviews">)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clipReviewsKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Score metrics metadata
// ---------------------------------------------------------------------------
export type ScoreMetric =
  | "face_consistency_score"
  | "realism_score"
  | "lighting_score"
  | "wardrobe_score"
  | "camera_score"
  | "lipsync_score";

export const SCORE_METRICS: { key: ScoreMetric; label: string; description: string }[] = [
  {
    key: "face_consistency_score",
    label: "Face consistency",
    description: "Does the artist look like themselves across this clip?",
  },
  {
    key: "realism_score",
    label: "Realism",
    description: "How natural / un-AI does it look?",
  },
  {
    key: "lighting_score",
    label: "Lighting match",
    description: "Does the lighting match the shot's intent and other clips?",
  },
  {
    key: "wardrobe_score",
    label: "Wardrobe match",
    description: "Are the artist's wardrobe / jewelry / tattoos right?",
  },
  {
    key: "camera_score",
    label: "Camera quality",
    description: "Composition, movement, focus, lens feel.",
  },
  {
    key: "lipsync_score",
    label: "Lip-sync",
    description: "Mouth movements vs. the song. Skip for non-vocal clips.",
  },
];

export function averageScore(review: Partial<ClipReview>): number | null {
  const values: number[] = [];
  for (const m of SCORE_METRICS) {
    const v = review[m.key];
    if (typeof v === "number") values.push(v);
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
