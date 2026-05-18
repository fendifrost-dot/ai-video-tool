import type { WardrobeFeatureType } from "@/lib/queries/wardrobe";

export const WARDROBE_TAXONOMY: Record<
  WardrobeFeatureType,
  { label: string; description: string }
> = {
  wardrobe_top: {
    label: "Tops",
    description: "Shirts, tees, knits, blouses, hoodies.",
  },
  wardrobe_bottom: {
    label: "Bottoms",
    description: "Pants, jeans, shorts, skirts.",
  },
  wardrobe_outerwear: {
    label: "Outerwear",
    description: "Jackets, coats, blazers, vests.",
  },
  wardrobe_footwear: {
    label: "Footwear",
    description: "Sneakers, boots, dress shoes, sandals.",
  },
  wardrobe_accessory: {
    label: "Accessories",
    description: "Hats, belts, sunglasses, bags, scarves.",
  },
};

export const WARDROBE_TYPES_ORDERED: WardrobeFeatureType[] = [
  "wardrobe_top",
  "wardrobe_bottom",
  "wardrobe_outerwear",
  "wardrobe_footwear",
  "wardrobe_accessory",
];
