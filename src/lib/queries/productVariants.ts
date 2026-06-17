import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { productsKeys } from "./products";

// ---------------------------------------------------------------------------
// product_variants — colorways per product
// ---------------------------------------------------------------------------

export type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku_suffix: string | null;
  colorway_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductVariantInsert = {
  product_id: string;
  name: string;
  sku_suffix?: string | null;
  colorway_json?: Record<string, unknown>;
  is_default?: boolean;
};

export type ProductVariantPatch = Partial<{
  name: string;
  sku_suffix: string | null;
  colorway_json: Record<string, unknown>;
  is_default: boolean;
}>;

export const productVariantsKeys = {
  all: ["product_variants"] as const,
  forProduct: (productId: string) =>
    [...productVariantsKeys.all, "product", productId] as const,
};

export function useProductVariants(productId: string | undefined) {
  return useQuery<ProductVariant[]>({
    queryKey: productId
      ? productVariantsKeys.forProduct(productId)
      : [...productVariantsKeys.all, "_none_"],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductVariant[];
    },
    enabled: !!productId,
  });
}

export function useCreateProductVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductVariantInsert): Promise<ProductVariant> => {
      if (payload.is_default) {
        await (supabase as any)
          .from("product_variants")
          .update({ is_default: false })
          .eq("product_id", payload.product_id);
      }
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .insert({
          product_id: payload.product_id,
          name: payload.name.trim(),
          sku_suffix: payload.sku_suffix ?? null,
          colorway_json: payload.colorway_json ?? {},
          is_default: payload.is_default ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ProductVariant;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: productVariantsKeys.forProduct(row.product_id) });
      qc.invalidateQueries({ queryKey: productsKeys.detail(row.product_id) });
    },
  });
}

export function useUpdateProductVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      productId,
      patch,
    }: {
      id: string;
      productId: string;
      patch: ProductVariantPatch;
    }): Promise<ProductVariant> => {
      if (patch.is_default) {
        await (supabase as any)
          .from("product_variants")
          .update({ is_default: false })
          .eq("product_id", productId);
      }
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ProductVariant;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: productVariantsKeys.forProduct(row.product_id) });
    },
  });
}

export function useDeleteProductVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      productId,
    }: {
      id: string;
      productId: string;
    }): Promise<string> => {
      const { error } = await (supabase as any)
        .from("product_variants")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return productId;
    },
    onSuccess: (productId) => {
      qc.invalidateQueries({ queryKey: productVariantsKeys.forProduct(productId) });
    },
  });
}
