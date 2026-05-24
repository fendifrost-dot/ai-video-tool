import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildPrimaryReferenceImage,
  normaliseReferenceImages,
} from "./referenceImages";
import { characterFeaturesKeys } from "./characterFeatures";
import { artistsKeys } from "./artists";

export type StyleReferenceItem = {
  id: string;
  artist_id: string;
  feature_type: "style_reference";
  label: string;
  file_url: string | null;
  storage_path: string | null;
  is_primary: boolean;
  is_locked: boolean;
  reinforce_on_drift: boolean;
  metadata_json: Record<string, unknown>;
  uploaded_at: string;
  reference_images: ReturnType<typeof normaliseReferenceImages>;
};

export type StyleLoraTrainingState = {
  status?: "pending" | "complete" | "failed";
  started_at?: string;
  completed_at?: string;
  error?: string;
  image_count?: number;
  trigger_word?: string;
  lora_url?: string;
};

export const styleReferenceKeys = {
  all: ["style_references"] as const,
  forArtist: (artistId: string) =>
    [...styleReferenceKeys.all, "artist", artistId] as const,
};

export function styleReferencePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from("style-references").getPublicUrl(storagePath);
  return data.publicUrl;
}

export function useStyleReferences(artistId: string | undefined) {
  return useQuery<StyleReferenceItem[]>({
    queryKey: artistId
      ? styleReferenceKeys.forArtist(artistId)
      : [...styleReferenceKeys.all, "_none_"],
    queryFn: async () => {
      if (!artistId) return [];
      const { data, error } = await (supabase as any)
        .from("character_features")
        .select("*")
        .eq("artist_id", artistId)
        .eq("feature_type", "style_reference")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as StyleReferenceItem[]).map((r) => ({
        ...r,
        reference_images: normaliseReferenceImages(r.reference_images),
      }));
    },
    enabled: !!artistId,
  });
}

export function useCreateStyleReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      artist_id: string;
      label: string;
      file_url: string;
      storage_path: string;
      metadata_json?: Record<string, unknown>;
    }): Promise<StyleReferenceItem> => {
      const seedRefImg = buildPrimaryReferenceImage({
        url: payload.file_url,
        storage_path: payload.storage_path,
      });
      const { data, error } = await (supabase as any)
        .from("character_features")
        .insert({
          artist_id: payload.artist_id,
          feature_type: "style_reference",
          label: payload.label,
          file_url: payload.file_url,
          storage_path: payload.storage_path,
          tags: [],
          source_url: null,
          is_primary: false,
          is_locked: false,
          reinforce_on_drift: false,
          metadata_json: payload.metadata_json ?? {},
          reference_images: [seedRefImg],
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as StyleReferenceItem;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: styleReferenceKeys.forArtist(row.artist_id) });
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(row.artist_id) });
    },
  });
}

export function useDeleteStyleReferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artistId,
      ids,
      storagePaths,
    }: {
      artistId: string;
      ids: string[];
      storagePaths: string[];
    }) => {
      if (ids.length > 0) {
        const { error } = await (supabase as any)
          .from("character_features")
          .delete()
          .in("id", ids);
        if (error) throw error;
      }
      if (storagePaths.length > 0) {
        const { error } = await supabase.storage
          .from("style-references")
          .remove(storagePaths);
        if (error) throw error;
      }
      return { artistId };
    },
    onSuccess: ({ artistId }) => {
      qc.invalidateQueries({ queryKey: styleReferenceKeys.forArtist(artistId) });
      qc.invalidateQueries({ queryKey: characterFeaturesKeys.forArtist(artistId) });
    },
  });
}

export function useTrainStyleLora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      artistId,
      featureIds,
    }: {
      artistId: string;
      featureIds?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("train-style-lora-proxy", {
        body: { artistId, featureIds: featureIds ?? null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { status: string; image_count?: number };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: artistsKeys.detail(vars.artistId) });
    },
  });
}
