import { describe, expect, it } from "vitest";
import { type RgbaImage } from "./logoComposite";
import {
  colorMatchesProfile,
  drawDebugOverlay,
  GOLD_PROFILE,
  manualKeyframeFor,
  NAVY_PROFILE,
  placeDetail,
  quadFromRect,
  rectFromTarget,
  rgbToHsv,
  parseProductTruth,
  upsertManualKeyframe,
  type ColorProfile,
  type PlacementTarget,
  type ProductTruth,
  type QuadNorm,
} from "./placementEngine";

function solid(w: number, h: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

function fill(img: RgbaImage, y0: number, y1: number, x0: number, x1: number, r: number, g: number, b: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
    }
  }
}

const MAGENTA_PROFILE: ColorProfile = {
  name: "magenta",
  hsv: { hMin: 300, hMax: 330, sMin: 0.25, sMax: 1, vMin: 0.3, vMax: 1 },
};

describe("rgbToHsv / colorMatchesProfile", () => {
  it("classifies navy and gold by HSV profile", () => {
    expect(colorMatchesProfile(25, 30, 95, NAVY_PROFILE)).toBe(true);
    expect(colorMatchesProfile(210, 170, 40, GOLD_PROFILE)).toBe(true);
    expect(colorMatchesProfile(210, 170, 40, NAVY_PROFILE)).toBe(false);
    const hsv = rgbToHsv(210, 170, 40);
    expect(hsv.h).toBeGreaterThan(35);
    expect(hsv.h).toBeLessThan(60);
  });
});

describe("geometry helpers", () => {
  it("round-trips an axis rect through quad and back", () => {
    const rect = { left: 10, top: 20, right: 50, bottom: 40 };
    expect(rectFromTarget({ kind: "quad", points: quadFromRect(rect) })).toEqual(rect);
  });
});

describe("parseProductTruth", () => {
  it("extracts a logo_zone manual_keyframe quad from a raw blob", () => {
    const raw = {
      version: 1,
      details: {
        logo_zone: {
          detail_type: "logo_zone",
          source_bbox_norm: [0.3, 0.3, 0.4, 0.06],
          manual_keyframe: { default: { target_quad_norm: [[0.2, 0.4], [0.7, 0.42], [0.72, 0.5], [0.22, 0.48]] } },
        },
        bogus_detail: { detail_type: "nope" },
      },
    };
    const truth = parseProductTruth(raw)!;
    expect(truth.details?.logo_zone?.manual_keyframe?.default.target_quad_norm[1]).toEqual([0.7, 0.42]);
    expect((truth.details as Record<string, unknown>).bogus_detail).toBeUndefined();
  });

  it("rejects an out-of-range quad and returns null for junk", () => {
    const raw = {
      details: { logo_zone: { detail_type: "logo_zone", manual_keyframe: { default: { target_quad_norm: [[2, 0], [0, 0], [0, 0], [0, 0]] } } } },
    };
    expect(parseProductTruth(raw)!.details?.logo_zone?.manual_keyframe).toBeUndefined();
    expect(parseProductTruth(null)).toBeNull();
    expect(parseProductTruth(42)).toBeNull();
  });
});

describe("manual keyframe store", () => {
  it("upserts and looks up a manual keyframe by id + detail type", () => {
    const target: PlacementTarget = { kind: "point", point: { x: 5, y: 6 } };
    const t1 = upsertManualKeyframe(null, { keyframe_id: "kf1", detail_type: "button", target });
    expect(manualKeyframeFor(t1, "button", "kf1")?.target).toEqual(target);
    expect(manualKeyframeFor(t1, "button", "kf2")).toBeNull();
    // upsert replaces, not duplicates
    const target2: PlacementTarget = { kind: "point", point: { x: 9, y: 9 } };
    const t2 = upsertManualKeyframe(t1, { keyframe_id: "kf1", detail_type: "button", target: target2 });
    expect(t2.manual_keyframes).toHaveLength(1);
    expect(manualKeyframeFor(t2, "button", "kf1")?.target).toEqual(target2);
  });
});

describe("placeDetail — detection per detail type", () => {
  it("logo_zone: detects the navy band and returns a quad", () => {
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 360, 420, 120, 648, 25, 30, 95); // navy chest stripe
    const res = placeDetail({ frame, detailType: "logo_zone", anchorXNorm: 0.5 });
    expect(res.source).toBe("detection");
    expect(res.target?.kind).toBe("quad");
    expect(res.confidence).toBeGreaterThanOrEqual(0.5);
    expect(res.qualityWarning).toBe(false);
  });

  it("chest_band: detects an arbitrary colour band via HSV profile (region)", () => {
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 320, 360, 140, 628, 200, 30, 160); // magenta band
    const truth: ProductTruth = {
      version: 1,
      details: { chest_band: { detail_type: "chest_band", color_profile: MAGENTA_PROFILE } },
    };
    const res = placeDetail({ frame, detailType: "chest_band", productTruth: truth, anchorXNorm: 0.5 });
    expect(res.source).toBe("detection");
    expect(res.target?.kind).toBe("region");
    expect(res.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("zipper_line: fits a path down the gold hardware", () => {
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 200, 900, 380, 392, 210, 170, 40); // vertical gold zipper line
    const res = placeDetail({ frame, detailType: "zipper_line", anchorXNorm: 0.5 });
    expect(res.target?.kind).toBe("path");
    expect(res.confidence).toBeGreaterThan(0.3);
    if (res.target?.kind === "path") {
      expect(res.target.points.length).toBeGreaterThan(2);
      // path tracks the gold column x≈386
      expect(Math.abs(res.target.points[0].x - 386)).toBeLessThan(12);
    }
  });

  it("zipper_pull: bounds the gold blob as a quad", () => {
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 470, 510, 372, 404, 210, 170, 40); // gold pull tab
    const res = placeDetail({ frame, detailType: "zipper_pull" });
    expect(res.target?.kind).toBe("quad");
    const rect = res.target ? rectFromTarget(res.target) : null;
    expect(rect!.left).toBeLessThanOrEqual(373);
    expect(rect!.right).toBeGreaterThanOrEqual(403);
  });

  it("stubbed detail type with no metadata → requires_manual_keyframe (no guess)", () => {
    const frame = solid(768, 1024, 200, 180, 160);
    const res = placeDetail({ frame, detailType: "sleeve_panel" });
    expect(res.target).toBeNull();
    expect(res.fallbackReason).toBe("requires_manual_keyframe");
    expect(res.qualityWarning).toBe(true);
    expect(res.source).toBe("none");
  });

  it("zipper detection consumes the product_truth zipper_color_profile slot", () => {
    // A non-gold zipper: only found when the shared zipper_color_profile slot is
    // wired through to the zipper detector (the clean extension point).
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 200, 900, 380, 392, 200, 30, 160); // magenta zipper hardware
    const truth: ProductTruth = { version: 1, zipper_color_profile: MAGENTA_PROFILE };
    const withSlot = placeDetail({ frame, detailType: "zipper_line", productTruth: truth });
    expect(withSlot.target?.kind).toBe("path");
    expect(withSlot.confidence).toBeGreaterThan(0.3);
    // Without the slot, the default gold profile finds nothing magenta → no guess.
    const withoutSlot = placeDetail({ frame, detailType: "zipper_line" });
    expect(withoutSlot.fallbackReason).toBe("requires_manual_keyframe");
  });
});

describe("placeDetail — priority ordering (manual > metadata > detection > fallback)", () => {
  const navyFrame = () => {
    const frame = solid(768, 1024, 200, 180, 160);
    fill(frame, 360, 420, 120, 648, 25, 30, 95);
    return frame;
  };
  const logoTruth: ProductTruth = {
    version: 1,
    details: { logo_zone: { detail_type: "logo_zone", source_bbox_norm: [0.3, 0.3, 0.4, 0.06] } },
  };

  it("manual placement wins over everything", () => {
    const manual: PlacementTarget = { kind: "quad", points: quadFromRect({ left: 1, top: 2, right: 3, bottom: 4 }) };
    const res = placeDetail({ frame: navyFrame(), detailType: "logo_zone", productTruth: logoTruth, manualPlacement: manual, anchorXNorm: 0.5 });
    expect(res.source).toBe("manual_keyframe");
    expect(res.confidence).toBe(1);
    expect(res.fallbackReason).toBe("");
    expect(res.target).toEqual(manual);
  });

  it("resolves a manual quad from product_truth details.logo_zone.manual_keyframe (priority 1)", () => {
    const quad: QuadNorm = [[0.2, 0.4], [0.7, 0.42], [0.72, 0.5], [0.22, 0.48]];
    const truth: ProductTruth = {
      version: 1,
      details: {
        logo_zone: {
          detail_type: "logo_zone",
          source_bbox_norm: [0.3, 0.3, 0.4, 0.06], // would otherwise be metadata
          manual_keyframe: { default: { target_quad_norm: quad } },
        },
      },
    };
    const res = placeDetail({ frame: navyFrame(), detailType: "logo_zone", productTruth: truth, anchorXNorm: 0.5 });
    expect(res.source).toBe("manual_keyframe");
    expect(res.confidence).toBe(1);
    expect(res.target?.kind).toBe("quad");
    if (res.target?.kind === "quad") {
      expect(res.target.points[0]).toEqual({ x: Math.round(0.2 * 768), y: Math.round(0.4 * 1024) });
    }
  });

  it("confident detection refines metadata", () => {
    const res = placeDetail({ frame: navyFrame(), detailType: "logo_zone", productTruth: logoTruth, anchorXNorm: 0.5 });
    expect(res.source).toBe("detection");
    expect(res.fallbackReason).toBe("detection_refined");
  });

  it("falls back to metadata when detection is weak (no navy present)", () => {
    const tanFrame = solid(768, 1024, 200, 180, 160); // no navy → weak detection
    const res = placeDetail({ frame: tanFrame, detailType: "logo_zone", productTruth: logoTruth, anchorXNorm: 0.5 });
    expect(res.source).toBe("metadata");
    expect(res.fallbackReason).toBe("metadata_placement");
    expect(res.qualityWarning).toBe(true); // low confidence surfaced
    expect(res.target?.kind).toBe("region");
  });

  it("no metadata + weak detection → requires_manual_keyframe", () => {
    const tanFrame = solid(768, 1024, 200, 180, 160);
    const res = placeDetail({ frame: tanFrame, detailType: "logo_zone", anchorXNorm: 0.5 });
    expect(res.fallbackReason).toBe("requires_manual_keyframe");
    expect(res.target).toBeNull();
    expect(res.qualityWarning).toBe(true);
  });

  it("a precomputed detection (SAM stub) overrides the built-in strategy", () => {
    const tanFrame = solid(400, 400, 200, 180, 160);
    const samTarget: PlacementTarget = { kind: "quad", points: quadFromRect({ left: 10, top: 10, right: 90, bottom: 30 }) };
    const res = placeDetail({ frame: tanFrame, detailType: "logo_zone", detection: { target: samTarget, confidence: 0.9 } });
    expect(res.source).toBe("detection");
    expect(res.target).toEqual(samTarget);
  });
});

describe("placeDetail — debug overlay", () => {
  it("returns an overlay the size of the frame with the target drawn", () => {
    const frame = solid(200, 200, 0, 0, 0);
    fill(frame, 90, 110, 40, 160, 25, 30, 95);
    const res = placeDetail({ frame, detailType: "logo_zone", anchorXNorm: 0.5, productTruth: {
      version: 1, details: { logo_zone: { detail_type: "logo_zone", source_bbox_norm: [0.2, 0.45, 0.6, 0.1] } },
    } });
    expect(res.debugOverlay.width).toBe(frame.width);
    expect(res.debugOverlay.height).toBe(frame.height);
    // some pixel differs (the drawn outline)
    let changed = false;
    for (let i = 0; i < frame.data.length; i += 4) {
      if (res.debugOverlay.data[i] !== frame.data[i] || res.debugOverlay.data[i + 1] !== frame.data[i + 1]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it("drawDebugOverlay leaves the original frame untouched", () => {
    const frame = solid(50, 50, 10, 10, 10);
    const before = frame.data[0];
    drawDebugOverlay(frame, { kind: "region", rect: { left: 5, top: 5, right: 40, bottom: 20 } });
    expect(frame.data[0]).toBe(before);
  });
});
