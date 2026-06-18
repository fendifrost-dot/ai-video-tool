import { describe, expect, it } from "vitest";
import {
  alphaComposite,
  coverTargetOnBand,
  detectChestBand,
  keyNavyBackground,
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
});
