import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchReferenceImage } from "./wardrobe";
import {
  buildPrimaryReferenceImage,
  createReferenceImageHooks,
  normaliseReferenceImages,
  type ReferenceImage,
} from "./referenceImages";

// ---------------------------------------------------------------------------
// Location library — user-scoped, project-agnostic
// ---------------------------------------------------------------------------
export type LocationCategory =
  | "interior"
  | "exterior"
  | "urban"
  | "nature"
  | "fantasy"
  | "studio";

export const LOCATION_CATEGORIES: LocationCategory[] = [
  "interior",
  "exterior",
  "urban",
  "nature",
  "fantasy",
  "studio",
];

export type LocationItem = {
  id: string;
  user_id: string;
  name: string;
  file_url: string;
  storage_path: string | null;
  tags: string[];
  source_url: string | null;
  category: LocationCategory | null;
  notes: string | null;
  uploaded_at: string;
  /** Multi-angle gallery (Phase 4). NULL on rows that predate the migration. */
  reference_images: ReferenceImage[] | null;
};

export type LocationItemInsert = {
  name: string;
  file_url: string;
  storage_path?: string | null;
  tags?: string[];
  source_url?: string | null;
  category?: LocationCategory | null;
  notes?: string | null;
};

export type LocationItemPatch = Partial<{
  name: string;
  tags: string[];
  source_url: string | null;
  category: LocationCategory | null;
  notes: string | null;
}>;

export const locationsKeys = {
  all: ["locations"] as const,
  list: (category?: LocationCategory) =>
    [...locationsKeys.all, "list", category ?? "_all_"] as const,
  detail: (id: string) => [...locationsKeys.all, "detail", id] as const,
};

export function useLocations(category?: LocationCategory) {
  return useQuery<LocationItem[]>({
    queryKey: locationsKeys.list(category),
    queryFn: async () => {
      let q = (supabase as any).from("location_library").select("*");
      if (category) q = q.eq("category", category);
      q = q.order("uploaded_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as LocationItem[]).map((r) => ({
        ...r,
        reference_images: normaliseReferenceImages(r.reference_images),
      }));
    },
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LocationItemInsert): Promise<LocationItem> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const seedRefImg = buildPrimaryReferenceImage({
        url: payload.file_url,
        storage_path: payload.storage_path ?? null,
      });
      const row = {
        user_id: user.id,
        name: payload.name,
        file_url: payload.file_url,
        storage_path: payload.storage_path ?? null,
        tags: payload.tags ?? [],
        source_url: payload.source_url ?? null,
        category: payload.category ?? null,
        notes: payload.notes ?? null,
        reference_images: [seedRefImg],
      };
      const { data, error } = await (supabase as any)
        .from("location_library")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as LocationItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKeys.all });
    },
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: LocationItemPatch;
    }): Promise<LocationItem> => {
      const { data, error } = await (supabase as any)
        .from("location_library")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as LocationItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKeys.all });
    },
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("location_library")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKeys.all });
    },
  });
}

export function useImportLocationFromUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      name,
      category,
      tags,
      notes,
    }: {
      url: string;
      name: string;
      category?: LocationCategory;
      tags?: string[];
      notes?: string;
    }): Promise<LocationItem> => {
      const fetched = await fetchReferenceImage(url, "location");
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const seedRefImg = buildPrimaryReferenceImage({
        url: fetched.storage_path,
        storage_path: fetched.storage_path,
      });
      const { data, error } = await (supabase as any)
        .from("location_library")
        .insert({
          user_id: user.id,
          name,
          file_url: fetched.storage_path,
          storage_path: fetched.storage_path,
          tags: tags ?? [],
          source_url: url,
          category: category ?? null,
          notes: notes ?? null,
          reference_images: [seedRefImg],
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as LocationItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Reference-image hooks (Phase 4)
// ---------------------------------------------------------------------------
const locationRefImageHooks = createReferenceImageHooks({
  table: "location_library",
  invalidateKeys: () => [locationsKeys.all],
});

export const useAppendLocationReferenceImage = locationRefImageHooks.useAppend;
export const useRemoveLocationReferenceImage = locationRefImageHooks.useRemove;
export const useUpdateLocationReferenceImageAngle = locationRefImageHooks.useUpdateAngle;
