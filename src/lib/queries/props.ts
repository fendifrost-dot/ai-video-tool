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
// Prop library — user-scoped, project-agnostic
// ---------------------------------------------------------------------------
export type PropCategory =
  | "vehicle"
  | "instrument"
  | "animal"
  | "object"
  | "logo"
  | "other";

export const PROP_CATEGORIES: PropCategory[] = [
  "vehicle",
  "instrument",
  "animal",
  "object",
  "logo",
  "other",
];

export type PropItem = {
  id: string;
  user_id: string;
  name: string;
  file_url: string;
  storage_path: string | null;
  tags: string[];
  source_url: string | null;
  category: PropCategory | null;
  notes: string | null;
  uploaded_at: string;
  /** Multi-angle gallery (Phase 4). NULL on rows that predate the migration. */
  reference_images: ReferenceImage[] | null;
};

export type PropItemInsert = {
  name: string;
  file_url: string;
  storage_path?: string | null;
  tags?: string[];
  source_url?: string | null;
  category?: PropCategory | null;
  notes?: string | null;
};

export type PropItemPatch = Partial<{
  name: string;
  tags: string[];
  source_url: string | null;
  category: PropCategory | null;
  notes: string | null;
}>;

export const propsKeys = {
  all: ["props"] as const,
  list: (category?: PropCategory) =>
    [...propsKeys.all, "list", category ?? "_all_"] as const,
  detail: (id: string) => [...propsKeys.all, "detail", id] as const,
};

export function useProps(category?: PropCategory) {
  return useQuery<PropItem[]>({
    queryKey: propsKeys.list(category),
    queryFn: async () => {
      let q = (supabase as any).from("prop_library").select("*");
      if (category) q = q.eq("category", category);
      q = q.order("uploaded_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as PropItem[]).map((r) => ({
        ...r,
        reference_images: normaliseReferenceImages(r.reference_images),
      }));
    },
  });
}

export function useCreateProp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PropItemInsert): Promise<PropItem> => {
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
        .from("prop_library")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as PropItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propsKeys.all });
    },
  });
}

export function useUpdateProp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: PropItemPatch;
    }): Promise<PropItem> => {
      const { data, error } = await (supabase as any)
        .from("prop_library")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as PropItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propsKeys.all });
    },
  });
}

export function useDeleteProp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("prop_library")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propsKeys.all });
    },
  });
}

export function useImportPropFromUrl() {
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
      category?: PropCategory;
      tags?: string[];
      notes?: string;
    }): Promise<PropItem> => {
      const fetched = await fetchReferenceImage(url, "prop");
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const seedRefImg = buildPrimaryReferenceImage({
        url: fetched.storage_path,
        storage_path: fetched.storage_path,
      });
      const { data, error } = await (supabase as any)
        .from("prop_library")
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
      return data as PropItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: propsKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Reference-image hooks (Phase 4)
// ---------------------------------------------------------------------------
const propRefImageHooks = createReferenceImageHooks({
  table: "prop_library",
  invalidateKeys: () => [propsKeys.all],
});

export const useAppendPropReferenceImage = propRefImageHooks.useAppend;
export const useRemovePropReferenceImage = propRefImageHooks.useRemove;
export const useUpdatePropReferenceImageAngle = propRefImageHooks.useUpdateAngle;
