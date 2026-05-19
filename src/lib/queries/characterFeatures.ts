import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildPrimaryReferenceImage,
  createReferenceImageHooks,
  normaliseReferenceImages,
  type ReferenceImage,
} from "./referenceImages";

// ---------------------------------------------------------------------------
// Local row shape
// ---------------------------------------------------------------------------
// We keep this hand-rolled until Lovable's typegen catches up with the new
// character_features table. The Database type from supabase/types.ts doesn't
// know about it yet, so the queries cast to `any` at the seam and return
// strongly-typed rows from there.

export type FeatureType =
  | "face"
  | "teeth"
  | "hands"
  | "tattoos"
  | "jewelry"
  | "hair"
  | "body";

export type CharacterFeature = {
  id: string;
  artist_id: string;
  feature_type: FeatureType;
  label: string;
  file_url: string | null;
  storage_path: string | null;
  is_primary: boolean;
  is_locked: boolean;
  reinforce_on_drift: boolean;
  metadata_json: Record<string, unknown>;
  uploaded_at: string;
  /**
   * Multi-angle gallery added in Phase 4 of the fidelity roadmap. NULL on
   * rows that predate the migration (back-compat — file_url is the primary
   * reference in that case). On new writes the first entry pairs with
   * file_url / storage_path.
   */
  reference_images: ReferenceImage[] | null;
};

export type CharacterFeatureInsert = Omit<
  CharacterFeature,
  "id" | "uploaded_at" | "reference_images"
> & {
  id?: string;
  uploaded_at?: string;
  reference_images?: ReferenceImage[] | null;
};

export type CharacterFeaturePatch = Partial<Omit<CharacterFeature, "id" | "artist_id">>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const characterFeaturesKeys = {
  all: ["character_features"] as const,
  forArtist: (artistId: string) =>
    [...characterFeaturesKeys.all, "artist", artistId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
export function useCharacterFeatures(artistId: string | undefined) {
  return useQuery<CharacterFeature[]>({
    queryKey: artistId
      ? characterFeaturesKeys.forArtist(artistId)
      : [...characterFeaturesKeys.all, "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await (supabase as any)
        .from("character_features")
        .select("*")
        .eq("artist_id", artistId)
        .order("uploaded_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CharacterFeature[]).map((r) => ({
        ...r,
        reference_images: normaliseReferenceImages(r.reference_images),
      }));
    },
    enabled: !!artistId,
  });
}

// ---------------------------------------------------------------------------
// Create — sets reference_images[0] alongside file_url for new rows so the
// multi-angle column stays in sync from day one of the row's life.
// ---------------------------------------------------------------------------
export function useCreateCharacterFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CharacterFeatureInsert): Promise<CharacterFeature> => {
      const seed = payload.file_url
        ? [
            buildPrimaryReferenceImage({
              url: payload.file_url,
              storage_path: payload.storage_path,
            }),
          ]
        : null;
      const row = {
        ...payload,
        reference_images: payload.reference_images ?? seed,
      };
      const { data, error } = await (supabase as any)
        .from("character_features")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as CharacterFeature;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: characterFeaturesKeys.forArtist(row.artist_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Update — used for toggles (is_primary, is_locked, reinforce_on_drift)
// ---------------------------------------------------------------------------
export function useUpdateCharacterFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      artistId,
    }: {
      id: string;
      patch: CharacterFeaturePatch;
      artistId: string;
    }): Promise<CharacterFeature> => {
      const { data, error } = await (supabase as any)
        .from("character_features")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CharacterFeature;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({
        queryKey: characterFeaturesKeys.forArtist(vars.artistId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export function useDeleteCharacterFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, artistId }: { id: string; artistId: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("character_features")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({
        queryKey: characterFeaturesKeys.forArtist(vars.artistId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Reference-image hooks (Phase 4) — bound to character_features. Wardrobe +
// Jewelry both read from this table, so they share these hooks. The
// `artistId` invalidation key is passed in at call-time because the binding
// is computed once per render: we pass the keys factory as a closure.
//
// IMPORTANT — the hook bundle below uses a *fixed* invalidation key (all
// character_features queries). The wider invalidation is intentional: a
// reference-image change touches a single row, but every consumer caching
// that row by artistId should re-render. A per-artist binding would require
// the call site to pass artistId, but the artistId on a feature is fixed
// post-creation so we can just invalidate the parent prefix.
// ---------------------------------------------------------------------------
const characterFeatureRefImageHooks = createReferenceImageHooks({
  table: "character_features",
  invalidateKeys: () => [characterFeaturesKeys.all],
});

export const useAppendFeatureReferenceImage = characterFeatureRefImageHooks.useAppend;
export const useRemoveFeatureReferenceImage = characterFeatureRefImageHooks.useRemove;
export const useUpdateFeatureReferenceImageAngle = characterFeatureRefImageHooks.useUpdateAngle;

// ---------------------------------------------------------------------------
// Helpers used by the compiler and the UI
// ---------------------------------------------------------------------------

/**
 * Pick the canonical locked feature paths in deterministic priority order.
 * Used by the prompt compiler to populate referenceImagePaths.
 *
 * Order: face → hands → jewelry → tattoos → hair → teeth → body. Within each
 * feature type, prefer is_primary first, then any is_locked. Duplicates by
 * file_url are de-duped while preserving the first occurrence.
 */
export const FEATURE_TYPE_PRIORITY: FeatureType[] = [
  "face",
  "hands",
  "jewelry",
  "tattoos",
  "hair",
  "teeth",
  "body",
];

export function pickLockedFeaturePaths(features: CharacterFeature[]): string[] {
  const byType = new Map<FeatureType, CharacterFeature[]>();
  for (const f of features) {
    if (!f.is_locked) continue;
    if (!f.file_url) continue;
    const arr = byType.get(f.feature_type) ?? [];
    arr.push(f);
    byType.set(f.feature_type, arr);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of FEATURE_TYPE_PRIORITY) {
    const candidates = byType.get(t) ?? [];
    // Primary first, then locked-only
    candidates.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    for (const c of candidates) {
      if (!c.file_url) continue;
      if (seen.has(c.file_url)) continue;
      seen.add(c.file_url);
      out.push(c.file_url);
    }
  }
  return out;
}
