import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  characterFeaturesKeys,
  useAppendFeatureReferenceImage,
  useRemoveFeatureReferenceImage,
  useUpdateFeatureReferenceImageAngle,
  type CharacterFeature,
} from "./characterFeatures";
import {
  buildPrimaryReferenceImage,
  normaliseReferenceImages,
} from "./referenceImages";
import { isWardrobeDeprecated } from "./products";

// ---------------------------------------------------------------------------
// Wardrobe = a subset of character_features where feature_type ∈ wardrobe_*
// ---------------------------------------------------------------------------
// Sharing the underlying table keeps the artist-scope and locking semantics
// consistent with Character DNA. The hooks here are thin filters / writers
// that hide the feature_type discrimination from the UI layer.

export type WardrobeFeatureType =
  | "wardrobe_top"
  | "wardrobe_bottom"
  | "wardrobe_outerwear"
  | "wardrobe_footwear"
  | "wardrobe_accessory";

export const WARDROBE_FEATURE_TYPES: WardrobeFeatureType[] = [
  "wardrobe_top",
  "wardrobe_bottom",
  "wardrobe_outerwear",
  "wardrobe_footwear",
  "wardrobe_accessory",
];

export const isWardrobeFeatureType = (t: string): t is WardrobeFeatureType =>
  WARDROBE_FEATURE_TYPES.includes(t as WardrobeFeatureType);

export type WardrobeItem = Omit<CharacterFeature, "feature_type"> & {
  feature_type: WardrobeFeatureType;
  tags: string[];
  source_url: string | null;
};

export type WardrobeItemInsert = {
  artist_id: string;
  feature_type: WardrobeFeatureType;
  label: string;
  file_url: string;
  storage_path: string | null;
  tags?: string[];
  source_url?: string | null;
  is_primary?: boolean;
  is_locked?: boolean;
  reinforce_on_drift?: boolean;
  metadata_json?: Record<string, unknown>;
};

export type WardrobeItemPatch = Partial<{
  label: string;
  tags: string[];
  source_url: string | null;
  is_primary: boolean;
  is_locked: boolean;
  reinforce_on_drift: boolean;
  metadata_json: Record<string, unknown>;
}>;

// ---------------------------------------------------------------------------
// Fetch — all wardrobe items for an artist, optionally filtered by sub-type
// ---------------------------------------------------------------------------
export const wardrobeKeys = {
  all: ["wardrobe"] as const,
  forArtist: (artistId: string) => [...wardrobeKeys.all, "artist", artistId] as const,
};

export function useWardrobe(artistId: string | undefined) {
  return useQuery<WardrobeItem[]>({
    queryKey: artistId ? wardrobeKeys.forArtist(artistId) : [...wardrobeKeys.all, "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await (supabase as any)
        .from("character_features")
        .select("*")
        .eq("artist_id", artistId)
        .in("feature_type", WARDROBE_FEATURE_TYPES)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as WardrobeItem[]).map((r) => ({
        ...r,
        reference_images: normaliseReferenceImages(r.reference_images),
      }));
    },
    enabled: !!artistId,
  });
}

// ---------------------------------------------------------------------------
// Create — also seeds reference_images[0] so the multi-angle column stays
// consistent with file_url from the first write. See referenceImages.ts for
// the back-compat rationale.
// ---------------------------------------------------------------------------
export function useCreateWardrobeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WardrobeItemInsert): Promise<WardrobeItem> => {
      if (isWardrobeDeprecated()) {
        throw new Error(
          "New wardrobe items are disabled. Promote existing items to Products or use Design Studio.",
        );
      }
      const seedRefImg = buildPrimaryReferenceImage({
        url: payload.file_url,
        storage_path: payload.storage_path,
      });
      const row = {
        artist_id: payload.artist_id,
        feature_type: payload.feature_type,
        label: payload.label,
        file_url: payload.file_url,
        storage_path: payload.storage_path,
        tags: payload.tags ?? [],
        source_url: payload.source_url ?? null,
        is_primary: payload.is_primary ?? false,
        is_locked: payload.is_locked ?? false,
        reinforce_on_drift: payload.reinforce_on_drift ?? true,
        metadata_json: payload.metadata_json ?? {},
        reference_images: [seedRefImg],
      };
      const { data, error } = await (supabase as any)
        .from("character_features")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as WardrobeItem;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: wardrobeKeys.forArtist(row.artist_id) });
      // Also invalidate the underlying character_features cache so the
      // CharacterDNATabs counts stay accurate.
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(row.artist_id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function useUpdateWardrobeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      artistId,
    }: {
      id: string;
      patch: WardrobeItemPatch;
      artistId: string;
    }): Promise<WardrobeItem> => {
      const { data, error } = await (supabase as any)
        .from("character_features")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as WardrobeItem;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: wardrobeKeys.forArtist(vars.artistId) });
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(vars.artistId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export function useDeleteWardrobeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; artistId: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("character_features")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: wardrobeKeys.forArtist(vars.artistId) });
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(vars.artistId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Reference-image hooks — wardrobe shares character_features with Jewelry +
// Character DNA, so we re-export the bound hooks from characterFeatures.ts.
// Wardrobe-scoped invalidation happens automatically via the all-
// character_features invalidate prefix.
//
// Wardrobe-specific re-exports under aliased names so call sites read
// naturally inside wardrobe UI components.
// ---------------------------------------------------------------------------
export const useAppendWardrobeReferenceImage = useAppendFeatureReferenceImage;
export const useRemoveWardrobeReferenceImage = useRemoveFeatureReferenceImage;
export const useUpdateWardrobeReferenceImageAngle = useUpdateFeatureReferenceImageAngle;

// ---------------------------------------------------------------------------
// URL fetch — calls the fetch-reference-image edge function then inserts a row
// ---------------------------------------------------------------------------
export type FetchReferenceImageResult = {
  storage_path: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  bucket: string;
};

export async function fetchReferenceImage(
  url: string,
  targetType: "wardrobe" | "location" | "prop",
  artistId?: string,
): Promise<FetchReferenceImageResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData.session;
  if (!session) throw new Error("Not signed in");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL in env");

  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/fetch-reference-image`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, targetType, artistId }),
    },
  );

  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.error ?? body?.reason ?? body?.detail ?? "";
    } catch {
      detail = await resp.text().catch(() => "");
    }
    throw new Error(
      `fetch-reference-image failed: ${resp.status} ${detail || resp.statusText}`,
    );
  }

  return (await resp.json()) as FetchReferenceImageResult;
}

/**
 * Fetch + insert one wardrobe item in a single mutation. The component
 * passes the URL, sub-type and label; this hook handles the edge-function
 * call, the row insert and the cache invalidations.
 */
export function useImportWardrobeFromUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artistId,
      url,
      featureType,
      label,
      tags,
    }: {
      artistId: string;
      url: string;
      featureType: WardrobeFeatureType;
      label: string;
      tags?: string[];
    }): Promise<WardrobeItem> => {
      if (isWardrobeDeprecated()) {
        throw new Error(
          "Wardrobe URL import is disabled. Use Design Studio or Product Library instead.",
        );
      }
      const fetched = await fetchReferenceImage(url, "wardrobe", artistId);
      const seedRefImg = buildPrimaryReferenceImage({
        url: fetched.storage_path,
        storage_path: fetched.storage_path,
      });
      const { data, error } = await (supabase as any)
        .from("character_features")
        .insert({
          artist_id: artistId,
          feature_type: featureType,
          label,
          file_url: fetched.storage_path,
          storage_path: fetched.storage_path,
          tags: tags ?? [],
          source_url: url,
          is_primary: false,
          is_locked: false,
          reinforce_on_drift: true,
          metadata_json: {
            mime_type: fetched.mime_type,
            size_bytes: fetched.size_bytes,
            imported_from_url: true,
          },
          reference_images: [seedRefImg],
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as WardrobeItem;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: wardrobeKeys.forArtist(row.artist_id) });
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(row.artist_id) });
    },
  });
}
