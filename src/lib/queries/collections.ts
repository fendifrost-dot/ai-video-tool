import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product } from "./products";
import { productsKeys } from "./products";

export type Collection = {
  id: string;
  user_id: string;
  name: string;
  season: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CollectionProduct = {
  id: string;
  collection_id: string;
  product_id: string;
  sort_order: number;
  created_at: string;
  products?: Product;
};

export const collectionsKeys = {
  all: ["collections"] as const,
  detail: (id: string) => [...collectionsKeys.all, "detail", id] as const,
};

export function useCollections() {
  return useQuery<Collection[]>({
    queryKey: collectionsKeys.all,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("collections")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Collection[];
    },
  });
}

export function useCollection(id: string | undefined) {
  return useQuery<Collection | null>({
    queryKey: id ? collectionsKeys.detail(id) : [...collectionsKeys.all, "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("collections")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Collection | null;
    },
    enabled: !!id,
  });
}

export function useCollectionProducts(collectionId: string | undefined) {
  return useQuery<CollectionProduct[]>({
    queryKey: collectionId
      ? [...collectionsKeys.detail(collectionId), "products"]
      : [...collectionsKeys.all, "products", "_none_"],
    queryFn: async () => {
      if (!collectionId) return [];
      const { data, error } = await (supabase as any)
        .from("collection_products")
        .select("*, products(*)")
        .eq("collection_id", collectionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CollectionProduct[];
    },
    enabled: !!collectionId,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      season?: string | null;
    }): Promise<Collection> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const { data, error } = await (supabase as any)
        .from("collections")
        .insert({
          user_id: user.id,
          name: payload.name.trim(),
          season: payload.season?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Collection;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: collectionsKeys.all });
    },
  });
}

export function useAddProductToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collectionId,
      productId,
      sortOrder,
    }: {
      collectionId: string;
      productId: string;
      sortOrder?: number;
    }) => {
      const { error } = await (supabase as any).from("collection_products").insert({
        collection_id: collectionId,
        product_id: productId,
        sort_order: sortOrder ?? 0,
      });
      if (error) throw error;
      return collectionId;
    },
    onSuccess: (collectionId) => {
      qc.invalidateQueries({ queryKey: collectionsKeys.detail(collectionId) });
    },
  });
}

export function useRemoveProductFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      collectionId,
      rowId,
    }: {
      collectionId: string;
      rowId: string;
    }) => {
      const { error } = await (supabase as any)
        .from("collection_products")
        .delete()
        .eq("id", rowId);
      if (error) throw error;
      return collectionId;
    },
    onSuccess: (collectionId) => {
      qc.invalidateQueries({ queryKey: collectionsKeys.detail(collectionId) });
    },
  });
}
