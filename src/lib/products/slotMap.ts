import type { ProductSlot } from "@/lib/queries/products";
import type { WardrobeFeatureType } from "@/lib/queries/wardrobe";

export const PRODUCT_SLOT_TO_WARDROBE: Record<ProductSlot, WardrobeFeatureType> = {
  top: "wardrobe_top",
  bottom: "wardrobe_bottom",
  outerwear: "wardrobe_outerwear",
  footwear: "wardrobe_footwear",
  accessory: "wardrobe_accessory",
  dress: "wardrobe_top",
};

export const WARDROBE_TO_PRODUCT_SLOT: Record<WardrobeFeatureType, ProductSlot> = {
  wardrobe_top: "top",
  wardrobe_bottom: "bottom",
  wardrobe_outerwear: "outerwear",
  wardrobe_footwear: "footwear",
  wardrobe_accessory: "accessory",
};

export type ProductPick = {
  product_id: string;
  variant_id?: string | null;
  slot: ProductSlot;
};

export function fitProfileToDescription(
  fit: Record<string, unknown> | null | undefined,
): string | null {
  if (!fit || typeof fit !== "object") return null;
  const parts: string[] = [];
  const keys = [
    "fit",
    "silhouette",
    "hem_length",
    "sleeve_length",
    "closure",
    "fabric_weight",
    "layering_type",
  ] as const;
  for (const k of keys) {
    const v = fit[k];
    if (typeof v === "string" && v.trim()) parts.push(`${k.replace(/_/g, " ")}: ${v.trim()}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}
