import { describe, expect, it } from "vitest";
import {
  alphaComposite,
  bandFromNormBbox,
  coverTargetOnBand,
  detectChestBand,
  keyNavyBackground,
  logoCompositeMetaCore,
  logoQuality,
  resizeRgba,
  targetRectForLogo,
  type RgbaImage,
} from "./logoComposite";

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

function paintNavyBand(img: RgbaImage, y0: number, y1: number, x0: number, x1: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 25;
      img.data[i + 1] = 30;
      img.data[i + 2] = 95;
    }
  }
}

function paintRect(
  img: RgbaImage,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  r: number,
  g: number,
  b: number,
) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
    }
  }
}

/** Paint a navy stripe of `thickness` whose center line tilts by `slope` (a
 * turned-pose diagonal). yAtX0 is the center y at x0. */
function paintDiagonalNavy(
  img: RgbaImage,
  x0: number,
  x1: number,
  yAtX0: number,
  slope: number,
  thickness: number,
) {
  for (let x = x0; x < x1; x++) {
    const cy = Math.round(yAtX0 + (x - x0) * slope);
    for (let y = cy - thickness / 2; y < cy + thickness / 2; y++) {
      const yy = Math.round(y);
      if (yy < 0 || yy >= img.height) continue;
      const i = (yy * img.width + x) * 4;
      img.data[i] = 25;
      img.data[i + 1] = 30;
      img.data[i + 2] = 95;
    }
  }
}

describe("detectChestBand", () => {
  it("finds a navy horizontal band in upper torso", () => {
    const img = solid(400, 600, 200, 180, 160);
    paintNavyBand(img, 140, 200, 80, 320);
    const band = detectChestBand(img);
    expect(band).not.toBeNull();
    expect(band!.top).toBeGreaterThanOrEqual(100);
    expect(band!.bottom).toBeLessThanOrEqual(280);
  });

  it("prefers chest stripe over collar when both are navy", () => {
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 180, 280, 120, 648);
    paintNavyBand(img, 360, 420, 120, 648);
    const band = detectChestBand(img)!;
    expect(band.bottom).toBeLessThanOrEqual(450);
    expect(band.top).toBeGreaterThanOrEqual(300);
    expect(band.bottom - band.top).toBeLessThanOrEqual(120);
  });

  it("isolates the lower wide stripe when a narrow placket bridges collar→stripe", () => {
    // Collar lining (wide) + narrow vertical placket + chest stripe (wide).
    // The placket bridges them into one tall navy run at the weak threshold;
    // detection must still land on the lower wide stripe, not the collar.
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 210, 270, 120, 648); // collar lining (wide)
    paintNavyBand(img, 270, 360, 360, 408); // narrow placket bridge
    paintNavyBand(img, 360, 430, 120, 648); // exterior chest stripe (wide)
    const band = detectChestBand(img)!;
    expect(band.top).toBeGreaterThanOrEqual(340); // not the collar at ~210
    expect(band.bottom).toBeLessThanOrEqual(440);
    expect(band.bottom - band.top).toBeLessThanOrEqual(110);
  });

  it("locks onto a LOWER diagonal stripe on a turned pose, not the collar above", () => {
    // Turned pose: wide collar/shoulder navy up top, and the real chest stripe
    // lower and tilted. The full-width scan would pick the wide collar; anchoring
    // on the SKU x-center finds the diagonal stripe where the logo belongs.
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 250, 300, 150, 620); // wide collar/shoulder distractor
    paintDiagonalNavy(img, 150, 620, 380, 0.18, 24); // lower diagonal chest stripe
    const band = detectChestBand(img, 0.65)!; // anchor right-of-center
    expect(band.top).toBeGreaterThanOrEqual(400); // on the stripe, not collar ~250
    expect(band.bottom).toBeLessThanOrEqual(520);
    expect(band.confidence).toBeGreaterThanOrEqual(0.5); // confident → no fallback
  });

  it("detects a high horizontal stripe front-on (upper chest)", () => {
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 320, 360, 140, 628); // wide horizontal stripe, upper chest
    const band = detectChestBand(img, 0.5)!;
    expect(band.top).toBeGreaterThanOrEqual(300);
    expect(band.bottom).toBeLessThanOrEqual(380);
    expect(band.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("reports LOW confidence for a small collar patch with no chest stripe", () => {
    // Only a small navy collar patch near the neckline — not a torso-crossing
    // stripe. Detection must NOT confidently place here; the caller falls back.
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 200, 235, 320, 450); // small collar patch (~17% width)
    const band = detectChestBand(img, 0.5);
    expect(band).not.toBeNull();
    expect(band!.confidence).toBeLessThan(0.5); // below the fallback threshold
  });

  it("tolerates partial-arm occlusion across the stripe and stays confident", () => {
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 430, 470, 140, 628); // wide chest stripe
    paintRect(img, 430, 470, 380, 470, 200, 180, 160); // arm occludes a chunk
    const band = detectChestBand(img, 0.65)!;
    expect(band.top).toBeGreaterThanOrEqual(410);
    expect(band.bottom).toBeLessThanOrEqual(490);
    expect(band.confidence).toBeGreaterThanOrEqual(0.5); // occlusion tolerated
  });

  it("returns null when there is no navy anywhere in the scan region", () => {
    const img = solid(768, 1024, 200, 180, 160);
    expect(detectChestBand(img, 0.5)).toBeNull();
  });

  it("places the target on the stripe at the anchor, not on tan above", () => {
    const img = solid(768, 1024, 200, 180, 160);
    paintNavyBand(img, 250, 300, 150, 620);
    paintDiagonalNavy(img, 150, 620, 380, 0.18, 24);
    const band = detectChestBand(img, 0.65)!;
    const rect = targetRectForLogo(img, band, 4, "upper_left_chest", null, null, 0.65);
    const cy = Math.round((rect.top + rect.bottom) / 2);
    const cx = Math.round((rect.left + rect.right) / 2);
    // The pixel under the logo center is navy (on the stripe), not tan.
    const i = (cy * 768 + cx) * 4;
    expect(img.data[i + 2]).toBeGreaterThan(80);
    expect(img.data[i]).toBeLessThan(60);
  });
});

describe("resizeRgba", () => {
  it("uses bilinear interpolation (smooth downscale)", () => {
    const src = solid(10, 10, 0, 0, 0);
    for (let y = 0; y < 10; y++) {
      for (let x = 5; x < 10; x++) {
        const i = (y * 10 + x) * 4;
        src.data[i] = 255;
      }
    }
    const out = resizeRgba(src, 5, 5);
    const mid = out.data[(2 * 5 + 2) * 4];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
  });
});

describe("keyNavyBackground", () => {
  it("keys navy pixels to transparent", () => {
    const logo = solid(20, 10, 25, 30, 95);
    const keyed = keyNavyBackground(logo);
    expect(keyed.data[3]).toBe(0);
    logo.data[0] = 255;
    logo.data[1] = 0;
    logo.data[2] = 0;
    const keyed2 = keyNavyBackground(logo);
    expect(keyed2.data[3]).toBe(255);
  });

  it("feathers the semi-navy fringe but keeps bright letter ink opaque", () => {
    const logo = solid(5, 5, 25, 30, 95); // navy ground
    paintRect(logo, 2, 3, 2, 3, 240, 235, 220); // bright letter at center
    paintRect(logo, 0, 1, 0, 1, 80, 82, 85); // semi-navy edge fringe at corner
    const keyed = keyNavyBackground(logo);
    const at = (x: number, y: number) => keyed.data[(y * 5 + x) * 4 + 3];
    expect(at(2, 2)).toBe(255); // letter ink stays fully opaque
    expect(at(4, 4)).toBe(0); // pure navy keyed out
    expect(at(0, 0)).toBeGreaterThan(0); // fringe feathered, not hard-edged
    expect(at(0, 0)).toBeLessThan(255);
  });
});

describe("coverTargetOnBand", () => {
  it("fills target rect with band navy before composite", () => {
    const base = solid(100, 100, 200, 180, 160);
    paintNavyBand(base, 40, 60, 20, 80);
    const band = { left: 20, top: 40, right: 80, bottom: 60 };
    const target = { left: 30, top: 45, right: 60, bottom: 55 };
    const covered = coverTargetOnBand(base, band, target);
    const i = (50 * 100 + 45) * 4;
    expect(covered.data[i + 2]).toBeGreaterThan(80);
    expect(covered.data[i]).toBeLessThan(50);
  });

  it("covers the VTON wordmark (light letters with navy gaps) across the stripe", () => {
    // VTON renders its own garbled wordmark on the stripe: light serif letters
    // with navy between them. The cover fills between navy extents, bridging the
    // letter gaps, so the whole word is erased even outside the paste target.
    const base = solid(100, 100, 200, 180, 160);
    paintNavyBand(base, 40, 60, 10, 90);
    for (const lx of [30, 40, 50, 60, 70]) {
      paintRect(base, 48, 54, lx, lx + 3, 240, 235, 220); // light letter strokes
    }
    const band = { left: 10, top: 40, right: 90, bottom: 60 };
    const target = { left: 20, top: 45, right: 35, bottom: 55 }; // away from a letter
    const covered = coverTargetOnBand(base, band, target);
    const hole = (50 * 100 + 71) * 4; // a former letter pixel, now navy
    expect(covered.data[hole + 2]).toBeGreaterThan(80);
    expect(covered.data[hole]).toBeLessThan(60);
  });

  it("does not paint tan beyond the stripe (no halo) when a sleeve sits far off", () => {
    const base = solid(100, 100, 200, 180, 160);
    paintNavyBand(base, 40, 60, 10, 70); // stripe
    paintNavyBand(base, 40, 60, 90, 98); // far navy sleeve, wide tan gap between
    const band = { left: 10, top: 40, right: 98, bottom: 60 };
    const target = { left: 30, top: 45, right: 50, bottom: 55 };
    const covered = coverTargetOnBand(base, band, target, 0.4); // anchor on the stripe
    const tan = (50 * 100 + 80) * 4; // tan gap between stripe and sleeve
    expect(covered.data[tan]).toBeGreaterThan(150); // still tan, not navy halo
  });
});

describe("alphaComposite", () => {
  it("pastes opaque logo pixels onto base", () => {
    const base = solid(100, 100, 10, 10, 10);
    const logo = solid(20, 10, 255, 0, 0);
    const out = alphaComposite(base, logo, { left: 10, top: 10, right: 30, bottom: 20 });
    const i = (15 * 100 + 15) * 4;
    expect(out.data[i]).toBe(255);
    expect(out.data[i + 1]).toBe(0);
  });
});

describe("targetRectForLogo", () => {
  it("places logo in upper-left of band by default", () => {
    const band = { left: 100, top: 50, right: 300, bottom: 120 };
    const rect = targetRectForLogo(
      { width: 400, height: 600, data: new Uint8Array() },
      band,
      2,
      "upper_left_chest",
    );
    expect(rect.left).toBeGreaterThanOrEqual(band.left);
    expect(rect.left).toBeLessThan(band.left + 40);
  });

  it("honors per-SKU min_target_height_px", () => {
    const band = { left: 100, top: 300, right: 500, bottom: 360 };
    const rect = targetRectForLogo(
      { width: 768, height: 1024, data: new Uint8Array() },
      band,
      3,
      "upper_left_chest",
      null,
      80,
    );
    expect(rect.bottom - rect.top).toBeGreaterThanOrEqual(80);
  });

  it("anchors the logo right-of-center from the source bbox x-center", () => {
    const img = { width: 800, height: 1024, data: new Uint8Array() };
    const band = { left: 100, top: 400, right: 700, bottom: 460 };
    const rect = targetRectForLogo(img, band, 4, "upper_left_chest", null, null, 0.65);
    const center = (rect.left + rect.right) / 2;
    expect(center).toBeGreaterThan(img.width / 2); // right-of-center
    expect(rect.left).toBeGreaterThanOrEqual(band.left);
    expect(rect.right).toBeLessThanOrEqual(band.right);
  });

  it("clamps the anchor so the logo stays inside the stripe", () => {
    const img = { width: 800, height: 1024, data: new Uint8Array() };
    const band = { left: 100, top: 400, right: 700, bottom: 460 };
    const rect = targetRectForLogo(img, band, 4, "upper_left_chest", null, null, 0.98);
    expect(rect.right).toBeLessThanOrEqual(band.right);
    expect(rect.left).toBeGreaterThanOrEqual(band.left);
  });
});

describe("logoQuality", () => {
  it("flags an upscaled low-res front_crop as a quality warning", () => {
    const q = logoQuality(20, 80, "front_crop");
    expect(q.upscaled).toBe(true);
    expect(q.quality_warning).toBe(true);
    expect(q.scale_ratio).toBeGreaterThan(1);
  });

  it("treats a downscaled high-res asset as clean", () => {
    const q = logoQuality(200, 60, "asset");
    expect(q.upscaled).toBe(false);
    expect(q.quality_warning).toBe(false);
  });

  it("does not warn when an asset is mildly upscaled (still crisp source)", () => {
    const q = logoQuality(60, 80, "asset");
    expect(q.upscaled).toBe(true);
    expect(q.quality_warning).toBe(false);
  });

  it("warns and records the fallback when the stripe was not confidently found", () => {
    const q = logoQuality(200, 60, "asset", 0.2, true);
    expect(q.placement_fallback).toBe(true);
    expect(q.stripe_confidence).toBe(0.2);
    expect(q.quality_warning).toBe(true);
  });

  it("warns on low stripe confidence even without an explicit fallback flag", () => {
    const q = logoQuality(200, 60, "asset", 0.3, false);
    expect(q.quality_warning).toBe(true);
  });

  it("is clean for a confident, well-sized asset placement", () => {
    const q = logoQuality(200, 60, "asset", 0.85, false);
    expect(q.stripe_confidence).toBe(0.85);
    expect(q.placement_fallback).toBe(false);
    expect(q.quality_warning).toBe(false);
  });
});

describe("bandFromNormBbox", () => {
  it("maps a normalized SKU bbox to a pixel band (fallback target)", () => {
    const img = { width: 1000, height: 500, data: new Uint8Array() };
    const band = bandFromNormBbox(img, [0.5, 0.4, 0.2, 0.1]);
    expect(band).toEqual({ left: 500, top: 200, right: 700, bottom: 250 });
  });
});

describe("logoCompositeMetaCore", () => {
  it("persists quality and quality_warning into the recipe metadata", () => {
    const meta = logoCompositeMetaCore({
      method: "bbox_affine_alpha_blend",
      logo_source: "front_crop",
      band: { left: 1, top: 2, right: 3, bottom: 4 },
      target: { left: 5, top: 6, right: 7, bottom: 8 },
      quality: logoQuality(20, 80, "front_crop"),
    });
    expect(meta.quality).toBeDefined();
    expect((meta.quality as { quality_warning: boolean }).quality_warning).toBe(true);
    expect(meta.quality_warning).toBe(true); // surfaced at top level for easy reads
    expect(meta.logo_source).toBe("front_crop");
    expect(meta.band).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
  });
});
