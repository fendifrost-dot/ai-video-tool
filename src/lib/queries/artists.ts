import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Artist,
  ArtistAsset,
  ArtistAssetType,
  ArtistIdentityProfile,
  Json,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/aliases";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const artistsKeys = {
  all: ["artists"] as const,
  list: () => [...artistsKeys.all, "list"] as const,
  detail: (id: string) => [...artistsKeys.all, "detail", id] as const,
  assets: (id: string) => [...artistsKeys.all, "assets", id] as const,
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function useArtists(options?: Omit<UseQueryOptions<Artist[]>, "queryKey" | "queryFn">) {
  return useQuery<Artist[]>({
    queryKey: artistsKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("artists")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export function useArtist(id: string | undefined) {
  return useQuery<Artist | null>({
    queryKey: id ? artistsKeys.detail(id) : ["artists", "detail", "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("artists")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export function useArtistAssets(artistId: string | undefined) {
  return useQuery<ArtistAsset[]>({
    queryKey: artistId ? artistsKeys.assets(artistId) : ["artists", "assets", "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await supabase
        .from("artist_assets")
        .select("*")
        .eq("artist_id", artistId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!artistId,
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export function useCreateArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"artists">, "user_id">,
    ): Promise<Artist> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("artists")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (artist) => {
      qc.invalidateQueries({ queryKey: artistsKeys.list() });
      qc.setQueryData(artistsKeys.detail(artist.id), artist);
    },
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function useUpdateArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"artists">;
    }): Promise<Artist> => {
      const { data, error } = await supabase
        .from("artists")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (artist) => {
      qc.invalidateQueries({ queryKey: artistsKeys.list() });
      qc.setQueryData(artistsKeys.detail(artist.id), artist);
    },
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export function useDeleteArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("artists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, id) => {
      qc.invalidateQueries({ queryKey: artistsKeys.list() });
      qc.removeQueries({ queryKey: artistsKeys.detail(id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Asset create / update / delete
// ---------------------------------------------------------------------------
export function useCreateArtistAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<TablesInsert<"artist_assets">, "user_id">,
    ): Promise<ArtistAsset> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("artist_assets")
        .insert({ ...payload, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: artistsKeys.assets(asset.artist_id) });
    },
  });
}

export function useUpdateArtistAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"artist_assets">;
    }): Promise<ArtistAsset> => {
      const { data, error } = await supabase
        .from("artist_assets")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: artistsKeys.assets(asset.artist_id) });
    },
  });
}


/**
 * Atomically set ONE artist_asset as the primary reference, clearing the
 * flag on all sibling assets for the same artist. Used by the "Lock as
 * primary reference" toggle in the artist UI. The locked asset is what the
 * prompt compiler picks up as the canonical character identity to attach
 * to every image-to-video generation.
 */
export function useSetPrimaryArtistAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assetId,
      artistId,
    }: {
      assetId: string;
      artistId: string;
    }): Promise<ArtistAsset> => {
      // Clear flag on all sibling assets for this artist. We do this first
      // so a transient state where no asset is "primary" is briefly visible
      // — preferable to a transient state where TWO are primary, which would
      // make the compiler's read non-deterministic.
      const { error: clearErr } = await supabase
        .from("artist_assets")
        .update({ is_primary_reference: false })
        .eq("artist_id", artistId)
        .neq("id", assetId);
      if (clearErr) throw clearErr;

      const { data, error } = await supabase
        .from("artist_assets")
        .update({ is_primary_reference: true })
        .eq("id", assetId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: artistsKeys.assets(asset.artist_id) });
    },
  });
}

export function useDeleteArtistAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      artistId: string;
    }): Promise<void> => {
      const { error } = await supabase.from("artist_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_void, { artistId }) => {
      qc.invalidateQueries({ queryKey: artistsKeys.assets(artistId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Canonical-base identity photo
//
// The compose-look pipeline can short-circuit Stage 1 by reusing a saved
// "good identity photo" instead of regenerating from the LoRA. The selected
// URL lives on the artist row as
// `identity_profile_json.canonical_base_image_url` and must be publicly
// fetchable (a Fal-hosted v3b.fal.media URL works; signed Supabase URLs
// expire and break the downstream CC fetch).
// ---------------------------------------------------------------------------

/**
 * Extract the canonical-base image URL from the artist's identity profile.
 * Returns null when unset or when the profile JSON is malformed.
 */
export function getCanonicalBaseImageUrl(
  artist: Pick<Artist, "identity_profile_json"> | null | undefined,
): string | null {
  if (!artist) return null;
  const profile = artist.identity_profile_json;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  const url = (profile as Record<string, unknown>).canonical_base_image_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/**
 * Set (or clear) the artist's canonical_base_image_url. Merges into the
 * existing identity_profile_json so other identity fields are preserved.
 * Pass `null` to clear the canonical base.
 */
export function useSetArtistCanonicalBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artistId,
      imageUrl,
    }: {
      artistId: string;
      imageUrl: string | null;
    }): Promise<Artist> => {
      // Read-modify-write the JSONB column. Supabase PostgREST doesn't
      // expose JSONB-merge over the typed client, so we fetch the current
      // profile, spread, and write the whole object back. The window
      // between read and write is small in practice; if a different field
      // races us we lose the race — same trade-off the existing
      // ArtistIdentityForm makes when saving the whole profile in one shot.
      const { data: current, error: readErr } = await supabase
        .from("artists")
        .select("identity_profile_json")
        .eq("id", artistId)
        .single();
      if (readErr) throw readErr;

      const existing = (current?.identity_profile_json ?? {}) as ArtistIdentityProfile;
      const nextProfile: ArtistIdentityProfile = {
        ...existing,
        canonical_base_image_url: imageUrl,
      };

      const { data, error } = await supabase
        .from("artists")
        .update({ identity_profile_json: nextProfile as unknown as Json })
        .eq("id", artistId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (artist) => {
      qc.invalidateQueries({ queryKey: artistsKeys.list() });
      qc.setQueryData(artistsKeys.detail(artist.id), artist);
    },
  });
}

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------
export const ARTIST_ASSET_TYPES: { value: ArtistAssetType; label: string; group: "face" | "body" | "wardrobe" | "other" }[] = [
  { value: "face_front", label: "Face — front", group: "face" },
  { value: "face_3q_left", label: "Face — 3/4 left", group: "face" },
  { value: "face_3q_right", label: "Face — 3/4 right", group: "face" },
  { value: "face_left", label: "Face — left profile", group: "face" },
  { value: "face_right", label: "Face — right profile", group: "face" },
  { value: "face_top", label: "Face — top", group: "face" },
  { value: "face_bottom", label: "Face — bottom", group: "face" },
  { value: "mouth_open", label: "Mouth — open", group: "face" },
  { value: "mouth_closed", label: "Mouth — closed", group: "face" },
  { value: "expression", label: "Expression", group: "face" },
  { value: "body", label: "Body", group: "body" },
  { value: "hair", label: "Hair", group: "body" },
  { value: "tattoo", label: "Tattoo", group: "body" },
  { value: "wardrobe", label: "Wardrobe", group: "wardrobe" },
  { value: "jewelry", label: "Jewelry", group: "wardrobe" },
  { value: "other", label: "Other", group: "other" },
];

export const FACE_360_SLOTS: ArtistAssetType[] = [
  "face_front",
  "face_3q_left",
  "face_3q_right",
  "face_left",
  "face_right",
  "mouth_open",
  "mouth_closed",
  "expression",
];
