import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildPrimaryReferenceImage,
  normaliseReferenceImages,
  type ReferenceImage,
} from "./referenceImages";
import type { ProductAssetRole } from "./products";
import { productsKeys } from "./products";

// ---------------------------------------------------------------------------
// product_assets — images and docs per product / variant
// ---------------------------------------------------------------------------

export type ProductAsset = {
  id: string;
  product_id: string;
  variant_id: string | null;
  asset_role: ProductAssetRole;
  file_url: string;
  storage_path: string | null;
  reference_images: ReferenceImage[];
  sort_order: number;
  uploaded_at: string;
};

export type ProductAssetInsert = {
  product_id: string;
  variant_id?: string | null;
  asset_role: ProductAssetRole;
  file_url: string;
  storage_path?: string | null;
  sort_order?: number;
};

export const productAssetsKeys = {
  all: ["product_assets"] as const,
  forProduct: (productId: string) =>
    [...productAssetsKeys.all, "product", productId] as const,
};

export type FetchProductAssetResult = {
  storage_path: string;
  file_url: string;
  mime_type: string;
  size_bytes: number;
  bucket: string;
};

export async function fetchProductAssetFromUrl(
  url: string,
  productId: string,
): Promise<FetchProductAssetResult> {
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
      body: JSON.stringify({ url, targetType: "product", productId }),
    },
  );

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string; detail?: string }).detail ??
        (body as { error?: string }).error ??
        `Import failed (${resp.status})`,
    );
  }
  return (await resp.json()) as FetchProductAssetResult;
}

export function useProductAssets(productId: string | undefined) {
  return useQuery<ProductAsset[]>({
    queryKey: productId
      ? productAssetsKeys.forProduct(productId)
      : [...productAssetsKeys.all, "_none_"],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await (supabase as any)
        .from("product_assets")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("uploaded_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ProductAsset[]).map((row) => ({
        ...row,
        reference_images: normaliseReferenceImages(row.reference_images),
      }));
    },
    enabled: !!productId,
  });
}

export function useCreateProductAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProductAssetInsert): Promise<ProductAsset> => {
      const seedRefImg = buildPrimaryReferenceImage({
        url: payload.file_url,
        storage_path: payload.storage_path ?? null,
      });
      const { data, error } = await (supabase as any)
        .from("product_assets")
        .insert({
          product_id: payload.product_id,
          variant_id: payload.variant_id ?? null,
          asset_role: payload.asset_role,
          file_url: payload.file_url,
          storage_path: payload.storage_path ?? null,
          sort_order: payload.sort_order ?? 0,
          reference_images: [seedRefImg],
        })
        .select("*")
        .single();
      if (error) throw error;
      return {
        ...(data as ProductAsset),
        reference_images: normaliseReferenceImages(data.reference_images),
      };
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: productAssetsKeys.forProduct(row.product_id) });
      qc.invalidateQueries({ queryKey: productsKeys.detail(row.product_id) });
    },
  });
}

export function useDeleteProductAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      productId,
    }: {
      id: string;
      productId: string;
    }): Promise<void> => {
      const { error } = await (supabase as any)
        .from("product_assets")
        .delete()
        .eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: productAssetsKeys.forProduct(productId) });
    },
  });
}

export function useImportProductAssetFromUrl() {
  const create = useCreateProductAsset();
  return useMutation({
    mutationFn: async ({
      url,
      productId,
      assetRole,
      variantId,
    }: {
      url: string;
      productId: string;
      assetRole: ProductAssetRole;
      variantId?: string | null;
    }): Promise<ProductAsset> => {
      const fetched = await fetchProductAssetFromUrl(url, productId);
      return create.mutateAsync({
        product_id: productId,
        variant_id: variantId ?? null,
        asset_role: assetRole,
        file_url: fetched.storage_path,
        storage_path: fetched.storage_path,
      });
    },
  });
}
