import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadBytesToBucket } from "@/lib/storage";
import { normaliseReferenceImages } from "./referenceImages";
import {
  suggestNextProductSku,
  productsKeys,
  type Product,
} from "./products";
import { productAssetsKeys } from "./productAssets";
import type { WardrobeItem } from "./wardrobe";
import { WARDROBE_TO_PRODUCT_SLOT } from "@/lib/products/slotMap";

export const wardrobeLinksKeys = {
  all: ["product_wardrobe_links"] as const,
  forFeature: (featureId: string) =>
    [...wardrobeLinksKeys.all, "feature", featureId] as const,
};

export function useWardrobeProductLink(wardrobeFeatureId: string | undefined) {
  return useQuery<{ product_id: string; products: Product } | null>({
    queryKey: wardrobeFeatureId
      ? wardrobeLinksKeys.forFeature(wardrobeFeatureId)
      : [...wardrobeLinksKeys.all, "_none_"],
    queryFn: async () => {
      if (!wardrobeFeatureId) return null;
      const { data, error } = await (supabase as any)
        .from("product_wardrobe_links")
        .select("product_id, products(*)")
        .eq("character_feature_id", wardrobeFeatureId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: !!wardrobeFeatureId,
  });
}

async function copyToProductAssets(
  userId: string,
  productId: string,
  sourcePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("wardrobe-refs")
    .download(sourcePath);
  if (error) throw error;
  const ext = sourcePath.split(".").pop() || "jpg";
  const dest = `${userId}/${productId}/promoted_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await uploadBytesToBucket(
    "product-assets",
    dest,
    data,
    data.type || "image/jpeg",
  );
  return dest;
}

export async function promoteWardrobeItemToProduct(
  item: WardrobeItem,
): Promise<Product> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not signed in");

  const { data: existing } = await (supabase as any)
    .from("product_wardrobe_links")
    .select("product_id")
    .eq("character_feature_id", item.id)
    .maybeSingle();
  if (existing?.product_id) {
    const { data: prod } = await (supabase as any)
      .from("products")
      .select("*")
      .eq("id", existing.product_id)
      .single();
    if (prod) return prod as Product;
  }

  const sku = await suggestNextProductSku();
  const slot = WARDROBE_TO_PRODUCT_SLOT[item.feature_type];

  const { data: product, error: prodErr } = await (supabase as any)
    .from("products")
    .insert({
      user_id: user.id,
      sku,
      name: item.label,
      slot,
      status: item.is_locked ? "approved" : "approved",
      metadata_json: {
        promoted_from_wardrobe_id: item.id,
        dimensions_description: (item as { dimensions_description?: string })
          .dimensions_description ?? null,
        ...(item.metadata_json ?? {}),
      },
    })
    .select("*")
    .single();
  if (prodErr) throw prodErr;

  const productId = (product as Product).id;
  const refs = normaliseReferenceImages(item.reference_images);
  const paths =
    refs.length > 0
      ? refs.map((r) => r.storage_path ?? r.url).filter(Boolean) as string[]
      : [item.storage_path ?? item.file_url].filter(Boolean) as string[];

  for (let i = 0; i < paths.length; i++) {
    const copied = await copyToProductAssets(user.id, productId, paths[i]);
    await (supabase as any).from("product_assets").insert({
      product_id: productId,
      asset_role: i === 0 ? "front" : "inspiration",
      file_url: copied,
      storage_path: copied,
      sort_order: i,
    });
  }

  await (supabase as any).from("product_wardrobe_links").insert({
    product_id: productId,
    character_feature_id: item.id,
  });

  return product as Product;
}

export function usePromoteWardrobeToProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: promoteWardrobeItemToProduct,
    onSuccess: (product, item) => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      qc.invalidateQueries({ queryKey: wardrobeLinksKeys.forFeature(item.id) });
      qc.invalidateQueries({ queryKey: productAssetsKeys.forProduct(product.id) });
    },
  });
}

export function useBulkPromoteWardrobe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: WardrobeItem[]) => {
      const results: Product[] = [];
      for (const item of items) {
        results.push(await promoteWardrobeItemToProduct(item));
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKeys.all });
      qc.invalidateQueries({ queryKey: wardrobeLinksKeys.all });
    },
  });
}
