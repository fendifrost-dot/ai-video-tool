import { describe, expect, it } from "vitest";
import { CAMERA, cameraOverscan, cameraPhases, cameraPose, cameraSourcePoint, cameraTransform } from "./camera";

describe("the handheld camera", () => {
  it("is the same move for the same seed and a different one for another", () => {
    const a = cameraPose(7, 1.3, 720, 1280);
    const b = cameraPose(7, 1.3, 720, 1280);
    const c = cameraPose(8, 1.3, 720, 1280);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(cameraPhases(7)).toHaveLength(12);
  });

  it("stays within its amplitudes at every moment", () => {
    const w = 720;
    const h = 1280;
    const over = cameraOverscan(w, h);
    for (let seed = 1; seed < 6; seed++) {
      for (let t = 0; t < 12; t += 0.05) {
        const p = cameraPose(seed, t, w, h);
        expect(Math.abs(p.dx)).toBeLessThanOrEqual(CAMERA.translate * w + 1e-9);
        expect(Math.abs(p.dy)).toBeLessThanOrEqual(CAMERA.translate * w + 1e-9);
        expect(Math.abs(p.rotate)).toBeLessThanOrEqual((CAMERA.rotate * Math.PI) / 180 + 1e-9);
        expect(p.zoom).toBeGreaterThanOrEqual(over * (1 - CAMERA.breathe) - 1e-9);
        expect(p.zoom).toBeLessThanOrEqual(over * (1 + CAMERA.breathe) + 1e-9);
      }
    }
  });

  it("moves smoothly: no frame-to-frame jump larger than a pixel at 24 fps", () => {
    let prev = cameraPose(3, 0, 720, 1280);
    for (let i = 1; i < 24 * 10; i++) {
      const p = cameraPose(3, i / 24, 720, 1280);
      expect(Math.abs(p.dx - prev.dx)).toBeLessThan(1);
      expect(Math.abs(p.dy - prev.dy)).toBeLessThan(1);
      prev = p;
    }
  });

  it("never shows an edge: every corner of the frame comes from inside the source, at any time", () => {
    for (const [w, h] of [
      [720, 1280],
      [1080, 1920],
      [1920, 1080],
    ]) {
      for (let seed = 1; seed < 4; seed++) {
        for (let t = 0; t < 12; t += 0.07) {
          const p = cameraPose(seed, t, w, h);
          for (const [x, y] of [
            [0, 0],
            [w, 0],
            [0, h],
            [w, h],
          ]) {
            const s = cameraSourcePoint(p, x, y, w, h);
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.x).toBeLessThanOrEqual(w);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeLessThanOrEqual(h);
          }
        }
      }
    }
  });

  it("the transform and its inverse agree, and a still camera is the identity about the centre", () => {
    const w = 720;
    const h = 1280;
    const p = { dx: 3, dy: -2, rotate: 0.01, zoom: 1.05 };
    const [a, b, c, d, e, f] = cameraTransform(p, w, h);
    // the source is drawn at (−w/2, −h/2): its point (sx, sy) lands at the matrix applied to (sx − w/2, sy − h/2)
    const sx = 100;
    const sy = 400;
    const ox = a * (sx - w / 2) + c * (sy - h / 2) + e;
    const oy = b * (sx - w / 2) + d * (sy - h / 2) + f;
    const back = cameraSourcePoint(p, ox, oy, w, h);
    expect(back.x).toBeCloseTo(sx, 6);
    expect(back.y).toBeCloseTo(sy, 6);
    const still = cameraTransform({ dx: 0, dy: 0, rotate: 0, zoom: 1 }, w, h);
    expect(still).toEqual([1, 0, -0, 1, w / 2, h / 2]);
  });

  it("the overscan is modest: a 720×1280 frame is zoomed by less than 7 %", () => {
    const z = cameraOverscan(720, 1280);
    expect(z).toBeGreaterThan(1.02);
    expect(z).toBeLessThan(1.07);
  });
});
