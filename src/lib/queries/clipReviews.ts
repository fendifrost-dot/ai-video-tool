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

export const clipReviewsKeys = {
  all: ["clip_reviews"] as const,
  forProject: (projectId: string) => [...clipReviewsKeys.all, "project", projectId] as const,
  forAsset: (assetId: string) => [...clipReviewsKeys.all, "asset", assetId] as const,
};

/**
 * All clip reviews tied to assets in a project.
 * Joined: needs project_id from project_assets, so this fetches reviews
 * keyed by asset_id and lets the UI pair them.
 */
export function useClipReviewsByAsset(assetIds: string[]) {
  const stableKey = [...assetIds].sort().join(",");
  return useQuery<Record<string, ClipReview>>({
    queryKey: ["clip_reviews", "by_asset", stableKey],
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

      const { data, error } = await supabase
        .from("clip_reviews")
        .insert({ ...payload, user_id: user.id })
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
      const { data, error } = await supabase
        .from("clip_reviews")
        .update(patch)
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
