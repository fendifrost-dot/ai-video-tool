import { describe, expect, it } from "vitest";
import {
  bboxToQuadNorm,
  logoPlacementFromProductDetails,
  metadataWithProductDetails,
  migrateLegacyToProductDetails,
  productTruthFromProductDetails,
  resolveLogoPlacementFromMetadata,
  resolveProductDetails,
  upsertLogoProductDetail,
} from "./productDetails";

describe("productDetails migration", () => {
  it("migrates logo_placement into product_details[]", () => {
    const details = migrateLegacyToProductDetails({
      logo_placement: {
        logo_asset_id: "asset-1",
        source_bbox_norm: [0.1, 0.2, 0.3, 0.05],
      },
    });
    expect(details).toHaveLength(1);
    expect(details[0].detail_type).toBe("wordmark");
    expect(details[0].asset_id).toBe("asset-1");
    expect(details[0].placement?.source_bbox_norm).toEqual([0.1, 0.2, 0.3, 0.05]);
  });

  it("preserves manual_keyframe from product_truth during migration", () => {
    const quad = bboxToQuadNorm([0.2, 0.3, 0.4, 0.1]);
    const details = migrateLegacyToProductDetails({
      logo_placement: { source_bbox_norm: [0.1, 0.2, 0.3, 0.05] },
      product_truth: {
        version: 1,
        details: {
          logo_zone: {
            detail_type: "logo_zone",
            manual_keyframe: { default: { target_quad_norm: quad } },
          },
        },
      },
    });
    expect(details[0].placement?.manual_keyframe?.default.target_quad_norm).toEqual(quad);
    expect(details[0].placement?.warp_mode).toBe("perspective");
  });

  it("prefers product_details when present", () => {
    const details = resolveProductDetails({
      product_details: [{ detail_type: "wordmark", asset_id: "x" }],
      logo_placement: { source_bbox_norm: [0.5, 0.5, 0.1, 0.1] },
    });
    expect(details[0].asset_id).toBe("x");
  });
});

describe("productDetails back-compat", () => {
  it("derives LogoPlacement from product_details", () => {
    const placement = logoPlacementFromProductDetails([
      {
        detail_type: "wordmark",
        asset_id: "a",
        placement: { source_bbox_norm: [0.2, 0.3, 0.4, 0.05] },
      },
    ]);
    expect(placement?.logo_asset_id).toBe("a");
    expect(placement?.source_bbox_norm[0]).toBe(0.2);
  });

  it("resolveLogoPlacementFromMetadata falls back to logo_placement", () => {
    const p = resolveLogoPlacementFromMetadata({
      logo_placement: { source_bbox_norm: [0.1, 0.1, 0.2, 0.2] },
    });
    expect(p?.source_bbox_norm[2]).toBe(0.2);
  });

  it("metadataWithProductDetails writes legacy mirrors", () => {
    const placement = {
      source_bbox_norm: [0.1, 0.2, 0.3, 0.04] as [number, number, number, number],
      logo_asset_id: "png-1",
    };
    const details = upsertLogoProductDetail([], placement);
    const meta = metadataWithProductDetails({}, details, placement);
    expect(Array.isArray(meta.product_details)).toBe(true);
    expect(meta.logo_placement).toEqual(placement);
    expect((meta.product_truth as { details?: { logo_zone?: unknown } }).details?.logo_zone).toBeTruthy();
  });

  it("productTruthFromProductDetails maps zipper_teeth color profile", () => {
    const truth = productTruthFromProductDetails([
      {
        detail_type: "zipper_teeth",
        color_profile: {
          hsv: { hMin: 30, hMax: 50, sMin: 0.1, sMax: 0.4, vMin: 0.2, vMax: 0.7 },
        },
      },
    ]);
    expect(truth?.zipper_color_profile?.hsv.hMin).toBe(30);
  });
});
