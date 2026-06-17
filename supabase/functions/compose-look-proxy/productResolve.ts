// Product pick resolution for compose-look-proxy (Phase 3).

export type ProductPickInput = {
  product_id: string;
  variant_id?: string | null;
  slot?: string;
};

export type ResolvedWardrobeRef = {
  id: string;
  feature_type: string;
  label: string;
  storage_path: string | null;
  file_url: string | null;
  bucket: string;
  dimensions_description: string | null;
  reference_images: Array<{
    id: string;
    url: string | null;
    storage_path: string | null;
    angle: string | null;
  }>;
};

const SLOT_TO_FEATURE: Record<string, string> = {
  top: "wardrobe_top",
  bottom: "wardrobe_bottom",
  outerwear: "wardrobe_outerwear",
  footwear: "wardrobe_footwear",
  accessory: "wardrobe_accessory",
  dress: "wardrobe_top",
};

import {
  orderedRefPathsForComposer,
  pickVtonGarmentPath,
} from "./garmentReference.ts";

// VTON garment URL: flat front beats on-model lifestyle shots.
const PREFERRED_ASSET_ROLES = [
  "front",
  "design_concept",
  "inspiration",
  "on_model_reference",
] as const;

function normaliseRefImages(raw: unknown): ResolvedWardrobeRef["reference_images"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : crypto.randomUUID();
      return {
        id,
        url: typeof r.url === "string" ? r.url : null,
        storage_path: typeof r.storage_path === "string" ? r.storage_path : null,
        angle: typeof r.angle === "string" ? r.angle : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

function fitProfileToDescription(fit: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const k of [
    "fit",
    "silhouette",
    "hem_length",
    "sleeve_length",
    "closure",
    "fabric_weight",
    "layering_type",
  ]) {
    const v = fit[k];
    if (typeof v === "string" && v.trim()) {
      parts.push(`${k.replace(/_/g, " ")}: ${v.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

// deno-lint-ignore no-explicit-any
export async function resolveProductPicks(
  client: any,
  picks: ProductPickInput[],
  userId: string,
): Promise<ResolvedWardrobeRef[]> {
  if (!picks.length) return [];
  const productIds = [...new Set(picks.map((p) => p.product_id))];

  const { data: products, error: prodErr } = await client
    .from("products")
    .select("id, sku, name, slot, metadata_json, fit_profile_json")
    .in("id", productIds)
    .eq("user_id", userId);
  if (prodErr) throw new Error(`products_query_failed: ${prodErr.message}`);

  const productById = new Map(
    (products ?? []).map((p: Record<string, unknown>) => [String(p.id), p]),
  );

  const { data: allAssets } = await client
    .from("product_assets")
    .select(
      "id, product_id, variant_id, asset_role, file_url, storage_path, reference_images, sort_order",
    )
    .in("product_id", productIds);

  const { data: allVariants } = await client
    .from("product_variants")
    .select("id, product_id, is_default")
    .in("product_id", productIds);

  const out: ResolvedWardrobeRef[] = [];

  for (const pick of picks) {
    const product = productById.get(pick.product_id);
    if (!product) continue;

    const variants = (allVariants ?? []).filter(
      (v: Record<string, unknown>) => String(v.product_id) === pick.product_id,
    );
    let variantId = pick.variant_id ?? null;
    if (!variantId) {
      const def = variants.find((v: Record<string, unknown>) => v.is_default === true);
      variantId = def ? String(def.id) : null;
    }

    const assets = (allAssets ?? []).filter((a: Record<string, unknown>) => {
      if (String(a.product_id) !== pick.product_id) return false;
      if (!variantId) return true;
      return a.variant_id == null || String(a.variant_id) === variantId;
    });

    let best: Record<string, unknown> | null = null;
    for (const role of PREFERRED_ASSET_ROLES) {
      best = assets.find((a: Record<string, unknown>) => a.asset_role === role) ?? null;
      if (best) break;
    }
    if (!best && assets.length > 0) best = assets[0];
    if (!best) continue;

    const slot = String(pick.slot ?? product.slot ?? "top");
    const meta = (product.metadata_json ?? {}) as Record<string, unknown>;
    const fit = (product.fit_profile_json ?? {}) as Record<string, unknown>;
    const dimensions =
      (typeof meta.dimensions_description === "string" && meta.dimensions_description) ||
      fitProfileToDescription(fit) ||
      null;

    const refImages = normaliseRefImages(best.reference_images);
    const legacyPath = (best.storage_path ?? best.file_url) as string | null;
    const path = pickVtonGarmentPath(refImages, legacyPath);
    const allPaths = orderedRefPathsForComposer(refImages, legacyPath);
    const enrichedRefs =
      allPaths.length > 0
        ? allPaths.map((p, i) => {
          const existing = refImages.find(
            (r) => r.storage_path === p || r.url === p,
          );
          return (
            existing ?? {
              id: crypto.randomUUID(),
              url: p,
              storage_path: p,
              angle: i === 0 ? "front" : null,
            }
          );
        })
        : refImages;
    out.push({
      id: String(product.id),
      feature_type: SLOT_TO_FEATURE[slot] ?? "wardrobe_top",
      label: `${product.sku} · ${product.name}`,
      storage_path: path,
      file_url: path,
      bucket: "product-assets",
      dimensions_description: dimensions,
      reference_images: enrichedRefs,
    });
  }

  return out;
}
