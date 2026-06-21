/**
 * Unified product detail model (Brand Fidelity v2 — Phase 2).
 * Deno edge mirror of src/lib/garment/productDetails.ts — keep in lockstep.
 */

import { parseLogoPlacement, type LogoPlacement } from "./logoComposite.ts";
import {
  parseProductTruth,
  type ColorProfile,
  type DetailPlacementSpec,
  type ProductTruth,
  type QuadNorm,
} from "./placementEngine.ts";

export type ProductDetailType =
  | "logo"
  | "wordmark"
  | "zipper_pull"
  | "zipper_teeth"
  | "button"
  | "patch"
  | "sleeve_stripe"
  | "label"
  | "embroidery";

export type AnchorType = "stripe" | "placket" | "collar" | "sleeve" | "freeform";
export type WarpMode = "affine" | "perspective" | "tps" | "mesh";
export type BlendMode = "normal" | "luminance_preserve";
export type TrackingMode = "optical_flow" | "feature" | "static";

export type ProductDetailPlacement = {
  manual_keyframe?: Record<string, { target_quad_norm: QuadNorm }>;
  source_bbox_norm?: [number, number, number, number];
  warp_mode?: WarpMode;
};

export type ProductDetailRender = {
  blend_mode?: BlendMode;
  feather_px?: number;
};

export type ProductDetailColorProfile = {
  finish?: string;
  reflectivity?: number;
  delta_e_max?: number;
  hsv?: ColorProfile["hsv"];
  name?: string;
};

export type ProductDetail = {
  detail_type: ProductDetailType;
  asset_id?: string | null;
  /** Explicit high-res flat-front asset to crop the wordmark from (front_crop source). */
  front_asset_id?: string | null;
  anchor_type?: AnchorType;
  placement?: ProductDetailPlacement;
  render?: ProductDetailRender;
  color_profile?: ProductDetailColorProfile;
  tracking_mode?: TrackingMode;
  occlusion_priority?: number;
};

const LOGO_DETAIL_TYPES = new Set<ProductDetailType>(["logo", "wordmark"]);

function isQuadNorm(v: unknown): v is QuadNorm {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1),
    )
  );
}

function parseNormBbox(raw: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const nums = raw.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return undefined;
  const [x, y, w, h] = nums;
  if (w <= 0 || h <= 0) return undefined;
  return [x, y, w, h];
}

export function parseProductDetail(raw: unknown): ProductDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const detailType = o.detail_type;
  if (typeof detailType !== "string") return null;

  const detail: ProductDetail = { detail_type: detailType as ProductDetailType };
  if (typeof o.asset_id === "string") detail.asset_id = o.asset_id;
  if (typeof o.front_asset_id === "string") detail.front_asset_id = o.front_asset_id;
  if (typeof o.anchor_type === "string") detail.anchor_type = o.anchor_type as AnchorType;
  if (typeof o.tracking_mode === "string") {
    detail.tracking_mode = o.tracking_mode as TrackingMode;
  }
  if (typeof o.occlusion_priority === "number") detail.occlusion_priority = o.occlusion_priority;

  if (o.placement && typeof o.placement === "object") {
    const p = o.placement as Record<string, unknown>;
    const placement: ProductDetailPlacement = {};
    const bbox = parseNormBbox(p.source_bbox_norm);
    if (bbox) placement.source_bbox_norm = bbox;
    if (typeof p.warp_mode === "string") placement.warp_mode = p.warp_mode as WarpMode;
    if (p.manual_keyframe && typeof p.manual_keyframe === "object") {
      const mkf: Record<string, { target_quad_norm: QuadNorm }> = {};
      for (const [kfId, entry] of Object.entries(p.manual_keyframe as Record<string, unknown>)) {
        const e = entry as Record<string, unknown> | null;
        if (e && isQuadNorm(e.target_quad_norm)) {
          mkf[kfId] = { target_quad_norm: e.target_quad_norm };
        }
      }
      if (Object.keys(mkf).length > 0) placement.manual_keyframe = mkf;
    }
    detail.placement = placement;
  }

  if (o.render && typeof o.render === "object") {
    const r = o.render as Record<string, unknown>;
    detail.render = {
      blend_mode: r.blend_mode === "luminance_preserve" ? "luminance_preserve" : "normal",
      feather_px: typeof r.feather_px === "number" ? r.feather_px : undefined,
    };
  }

  if (o.color_profile && typeof o.color_profile === "object") {
    detail.color_profile = o.color_profile as ProductDetailColorProfile;
  }

  return detail;
}

export function parseProductDetails(raw: unknown): ProductDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseProductDetail).filter((d): d is ProductDetail => d != null);
}

export function findLogoDetail(details: ProductDetail[]): ProductDetail | null {
  return details.find((d) => LOGO_DETAIL_TYPES.has(d.detail_type)) ?? null;
}

export function migrateLegacyToProductDetails(
  metadata: Record<string, unknown>,
): ProductDetail[] {
  const existing = parseProductDetails(metadata.product_details);
  if (existing.length > 0) return existing;

  const placement = parseLogoPlacement(metadata.logo_placement);
  const truth = parseProductTruth(metadata.product_truth);
  const details: ProductDetail[] = [];

  if (placement) {
    const ptLogo = truth?.details?.logo_zone;
    details.push({
      detail_type: "wordmark",
      asset_id: placement.logo_asset_id ?? null,
      front_asset_id: placement.front_asset_id ?? null,
      anchor_type: "stripe",
      placement: {
        source_bbox_norm: placement.source_bbox_norm,
        warp_mode: ptLogo?.manual_keyframe ? "perspective" : "affine",
        manual_keyframe: ptLogo?.manual_keyframe ?? undefined,
      },
      render: { blend_mode: "normal", feather_px: 3 },
      tracking_mode: "static",
      occlusion_priority: 10,
    });
  }

  if (truth?.zipper_color_profile) {
    details.push({
      detail_type: "zipper_teeth",
      anchor_type: "placket",
      color_profile: {
        name: truth.zipper_color_profile.name,
        hsv: truth.zipper_color_profile.hsv,
        finish: "tonal_mastic",
        reflectivity: 0.15,
        delta_e_max: 8,
      },
      tracking_mode: "static",
      occlusion_priority: 5,
    });
  }

  return details;
}

export function resolveProductDetails(
  metadata: Record<string, unknown> | null | undefined,
): ProductDetail[] {
  if (!metadata) return [];
  const parsed = parseProductDetails(metadata.product_details);
  if (parsed.length > 0) return parsed;
  return migrateLegacyToProductDetails(metadata);
}

export function logoPlacementFromProductDetails(
  details: ProductDetail[],
): LogoPlacement | null {
  const logo = findLogoDetail(details);
  if (!logo?.placement?.source_bbox_norm) return null;
  return parseLogoPlacement({
    logo_asset_id: logo.asset_id ?? null,
    front_asset_id: logo.front_asset_id ?? null,
    source_bbox_norm: logo.placement.source_bbox_norm,
    placement_hint: "upper_left_chest",
    target_region: "chest_band",
  });
}

export function productTruthFromProductDetails(details: ProductDetail[]): ProductTruth | null {
  const logo = findLogoDetail(details);
  const zipper = details.find((d) => d.detail_type === "zipper_teeth");
  if (!logo && !zipper) return null;

  const truth: ProductTruth = { version: 1, details: {} };
  if (logo?.placement) {
    const spec: DetailPlacementSpec = {
      detail_type: "logo_zone",
      source_bbox_norm: logo.placement.source_bbox_norm ?? null,
      manual_keyframe: logo.placement.manual_keyframe ?? null,
      target_quad_norm: null,
    };
    truth.details!.logo_zone = spec;
  }
  if (zipper?.color_profile?.hsv) {
    truth.zipper_color_profile = {
      name: zipper.color_profile.name,
      hsv: zipper.color_profile.hsv,
    };
  }
  return truth;
}

export function resolveLogoPlacementFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): LogoPlacement | null {
  if (!metadata) return null;
  const fromDetails = logoPlacementFromProductDetails(resolveProductDetails(metadata));
  const legacy = parseLogoPlacement(metadata.logo_placement);
  if (fromDetails) {
    // Honor the explicit product_details front_asset_id; fall back to the legacy
    // logo_placement.front_asset_id so the high-res front link isn't lost.
    if (!fromDetails.front_asset_id && legacy?.front_asset_id) {
      return { ...fromDetails, front_asset_id: legacy.front_asset_id };
    }
    return fromDetails;
  }
  return legacy;
}

export function resolveProductTruthFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): unknown {
  if (!metadata) return null;
  const fromDetails = productTruthFromProductDetails(resolveProductDetails(metadata));
  if (fromDetails) return fromDetails;
  return metadata.product_truth ?? null;
}
