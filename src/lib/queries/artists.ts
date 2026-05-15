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
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";

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
