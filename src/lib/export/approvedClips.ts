import type { ProjectAsset } from "@/integrations/supabase/aliases";

export function isClipAsset(a: ProjectAsset): boolean {
  return (
    a.asset_type === "generated_clip" ||
    a.asset_type === "edited_clip" ||
    a.asset_type === "social_cutdown"
  );
}

/**
 * Most-recent approved clip per shot_id (generated_clip / edited_clip / social_cutdown).
 */
export function approvedClipsByShot(
  assets: ProjectAsset[],
): Record<string, ProjectAsset> {
  const map: Record<string, ProjectAsset> = {};
  for (const a of assets) {
    if (a.approval_status === "approved" && a.shot_id && isClipAsset(a)) {
      const prior = map[a.shot_id];
      if (!prior || a.created_at > prior.created_at) {
        map[a.shot_id] = a;
      }
    }
  }
  return map;
}
