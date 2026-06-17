import type {
  ProductAssetRole,
  ProductSlot,
  ProductStatus,
} from "@/lib/queries/products";

export const PRODUCT_SLOTS_ORDERED: ProductSlot[] = [
  "outerwear",
  "top",
  "bottom",
  "dress",
  "footwear",
  "accessory",
];

export const PRODUCT_SLOT_LABELS: Record<ProductSlot, string> = {
  top: "Top",
  bottom: "Bottom",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessory: "Accessory",
  dress: "Dress",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  concept: "Concept",
  approved: "Approved",
  in_production: "In production",
  archived: "Archived",
};

/** Roles surfaced in Design Studio asset upload UI. */
export const DESIGN_STUDIO_ASSET_ROLES: ProductAssetRole[] = [
  "design_concept",
  "inspiration",
  "mood_board",
  "logo_placement_experiment",
  "front",
  "back",
  "side",
  "detail",
  "on_model_reference",
];

export const MANUFACTURING_ASSET_ROLES: ProductAssetRole[] = [
  "tech_flat_front",
  "tech_flat_back",
  "tech_flat_side",
  "material_swatch",
  "manufacturer_spec",
];

export const ALL_PRODUCT_ASSET_ROLES: ProductAssetRole[] = [
  ...DESIGN_STUDIO_ASSET_ROLES,
  ...MANUFACTURING_ASSET_ROLES,
];

export const PRODUCT_ASSET_ROLE_LABELS: Record<ProductAssetRole, string> = {
  design_concept: "Design concept",
  inspiration: "Inspiration",
  mood_board: "Mood board",
  logo_placement_experiment: "Logo placement",
  front: "Front",
  back: "Back",
  side: "Side",
  detail: "Detail",
  on_model_reference: "On-model reference",
  tech_flat_front: "Tech flat — front",
  tech_flat_back: "Tech flat — back",
  tech_flat_side: "Tech flat — side",
  material_swatch: "Material swatch",
  manufacturer_spec: "Manufacturer spec",
};
