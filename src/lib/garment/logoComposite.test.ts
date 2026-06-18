import { describe, expect, it } from "vitest";
import {
  alphaComposite,
  detectChestBand,
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

describe("detectChestBand", () => {
  it("finds a navy horizontal band in upper torso", () => {
    const img = solid(400, 600, 200, 180, 160);
    const y0 = 140;
    const y1 = 200;
    for (let y = y0; y < y1; y++) {
      for (let x = 80; x < 320; x++) {
        const i = (y * 400 + x) * 4;
        img.data[i] = 25;
        img.data[i + 1] = 30;
        img.data[i + 2] = 95;
      }
    }
    const band = detectChestBand(img);
    expect(band).not.toBeNull();
    expect(band!.top).toBeGreaterThanOrEqual(100);
    expect(band!.bottom).toBeLessThanOrEqual(280);
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
});
