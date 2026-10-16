import { describe, expect, it } from "vitest";
import {
  GRADE,
  alphaScratch,
  cleanEdges,
  boxesForGauss,
  compositeFrame,
  erode,
  gaussianBlur,
  gradeForeground,
  grayFromRgba,
  isGrayscale,
  keyGradient,
  prepareAlpha,
  preparePlate,
  seededRandom,
} from "./pixels";

const gray = (w: number, h: number, v: number) => new Float32Array(w * h).fill(v);
const rgba = (w: number, h: number, r: number, g: number, b: number) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) out.set([r, g, b, 255], i * 4);
  return out;
};

describe("key gradient", () => {
  it("brightens to the right and darkens a touch to the bottom, inside 0–1", () => {
    const g = keyGradient(720, 1280);
    expect(g[0]).toBeCloseTo(120 / 255, 4);
    expect(g[719]).toBeGreaterThan(g[0]);
    expect(g[1279 * 720]).toBeLessThan(g[0]);
    let lo = 1;
    let hi = 0;
    for (const v of g) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeGreaterThanOrEqual(0);
    // a 720-wide frame tops out at 120 + 140·719/720 ≈ 259.8 → 1
    expect(g[719]).toBe(1);
  });
});

describe("blur and erosion", () => {
  it("three boxes approximate the sigma asked for", () => {
    expect(boxesForGauss(1).length).toBe(3);
    expect(boxesForGauss(30).reduce((a, r) => a + r, 0)).toBeGreaterThan(30);
    expect(boxesForGauss(0.5).every((r) => r >= 0 && Number.isInteger(r))).toBe(true);
  });

  it("a blur keeps a flat field flat and keeps the mean of a spot", () => {
    const w = 16;
    const h = 12;
    expect([...gaussianBlur(gray(w, h, 0.4), w, h, 2)].every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(
      true,
    );
    const spot = gray(w, h, 0);
    spot[6 * w + 8] = 1;
    const out = gaussianBlur(spot, w, h, 1.5);
    const sum = [...out].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
    expect(out[6 * w + 8]).toBeLessThan(1);
    expect(out[6 * w + 8]).toBeGreaterThan(out[6 * w + 10]);
  });

  it("erosion of radius r shrinks a white square by r on every side", () => {
    const w = 20;
    const h = 20;
    const sq = gray(w, h, 0);
    for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) sq[y * w + x] = 1;
    const e = erode(sq, w, h, 2);
    expect(e[6 * w + 6]).toBe(1);
    expect(e[5 * w + 6]).toBe(0);
    expect(e[6 * w + 5]).toBe(0);
    expect(e[13 * w + 13]).toBe(1);
    expect(e[14 * w + 13]).toBe(0);
    const one = gray(w, h, 0);
    one[10 * w + 10] = 1;
    expect([...erode(one, w, h, 1)].every((v) => v === 0)).toBe(true);
  });
});

describe("prepareAlpha", () => {
  it("feathers the matte and cuts an edge band that is inside him only", () => {
    const w = 64;
    const h = 64;
    const m = gray(w, h, 0);
    for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) m[y * w + x] = 1;
    const { a1, edge } = prepareAlpha(m, w, h);
    expect(a1[32 * w + 32]).toBeCloseTo(1, 3); // deep inside: still him
    expect(a1[2 * w + 2]).toBe(0); // far outside: nothing
    expect(a1[8 * w + 32]).toBeLessThan(0.6); // the old boundary is eroded and feathered
    expect(edge[32 * w + 32]).toBeLessThan(0.02); // no wrap deep inside
    expect(edge[1 * w + 32]).toBeLessThan(0.02); // no wrap outside — an outer band would be a halo
    expect(edge[11 * w + 32]).toBeGreaterThan(0.1); // the band sits just inside his outline
    // v2: nothing of the band lies where the matte is empty — in v1 the pixels just outside his outline took up to
    // a tenth of the band, and with a white wall behind him in the take that was a white rim on the plate
    for (let y = 0; y < 8; y++) expect(edge[y * w + 32]).toBeLessThanOrEqual(a1[y * w + 32] * 0.5);
    expect(edge[6 * w + 32]).toBe(0);
  });
});

describe("cleanEdges", () => {
  it("unmixes the take's background out of a soft edge: a half-him, half-wall pixel becomes his colour", () => {
    const w = 64;
    const h = 64;
    const raw = gray(w, h, 0);
    for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) raw[y * w + x] = 1;
    for (let x = 8; x < 56; x++) raw[7 * w + x] = 0.5; // the matte's soft top edge
    const s = alphaScratch(w, h);
    const { a1 } = prepareAlpha(raw, w, h, s);
    // him: dark red; the room behind him: white; the soft-edge pixels are half each, as the camera saw them
    const fgg = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const a = raw[i];
      fgg[i * 3] = a * 0.4 + (1 - a) * 1;
      fgg[i * 3 + 1] = a * 0.05 + (1 - a) * 1;
      fgg[i * 3 + 2] = a * 0.05 + (1 - a) * 1;
    }
    cleanEdges(fgg, a1, raw, w, h, s);
    const at = (x: number, y: number) => [...fgg.slice((y * w + x) * 3, (y * w + x) * 3 + 3)];
    const deep = at(32, 32); // deep inside: untouched
    expect(deep[0]).toBeCloseTo(0.4, 5);
    expect(deep[1]).toBeCloseTo(0.05, 5);
    const edge = at(32, 7); // the half pixel: the white is gone, it is his red
    expect(edge[0]).toBeCloseTo(0.4, 1);
    expect(edge[1]).toBeLessThan(0.12);
    // and the feathered matte does not reach the wall at all
    expect(a1[6 * w + 32]).toBe(0);
  });

  it("leaves a full-matte pixel alone (a stripe at a sleeve's edge is not smeared) and lets a thin limb keep its colour", () => {
    const w = 64;
    const h = 64;
    const m = gray(w, h, 0);
    for (let y = 8; y < 40; y++) for (let x = 8; x < 56; x++) m[y * w + x] = 1; // his body
    for (let y = 40; y < 62; y++) for (let x = 30; x < 33; x++) m[y * w + x] = 1; // a 3 px finger hanging off it
    const s = alphaScratch(w, h);
    const { a1 } = prepareAlpha(m, w, h, s);
    const fgg = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) fgg.set([0.4, 0.05, 0.05], i * 3); // him: dark red everywhere
    for (let y = 8; y < 40; y++) for (let x = 50; x < 56; x++) fgg.set([0.95, 0.95, 0.95], (y * w + x) * 3); // a white stripe at his right edge
    for (let y = 40; y < 62; y++) for (let x = 30; x < 33; x++) fgg.set([0.1, 0.6, 0.1], (y * w + x) * 3); // the finger is green
    cleanEdges(fgg, a1, m, w, h, s);
    const at = (x: number, y: number) => [...fgg.slice((y * w + x) * 3, (y * w + x) * 3 + 3)];
    expect(at(52, 20)[0]).toBeCloseTo(0.95, 3); // the stripe: untouched
    expect(at(55, 20)[0]).toBeCloseTo(0.95, 3); // even at the outline, where the matte is full
    expect(at(31, 52)[1]).toBeCloseTo(0.6, 3); // the finger: its own green
    expect(at(30, 52)[1]).toBeCloseTo(0.6, 3);
  });

  it("a white wall behind him never rims him on a dark plate (the c044 failure)", () => {
    const w = 48;
    const h = 48;
    // the matte as the model draws it (measured on c044 frame 84: 3–4 px of partial alpha along the boundary, and
    // only 3 % of the pixels one inside the full matte are wall): full inside, a three-pixel ramp outside
    const m = gray(w, h, 0);
    const ramp = [0.2, 0.5, 0.8];
    for (let y = 8; y < 40; y++)
      for (let x = 8; x < 40; x++) {
        const d = Math.min(x - 8, 39 - x, y - 8, 39 - y); // distance in from the matte's outer edge
        m[y * w + x] = d < 3 ? ramp[d] : 1;
      }
    const s = alphaScratch(w, h);
    const { a1, edge } = prepareAlpha(m, w, h, s);
    const fg = rgba(w, h, 255, 255, 255); // the take: a white room…
    for (let y = 8; y < 40; y++)
      for (let x = 8; x < 40; x++) {
        const d = Math.min(x - 8, 39 - x, y - 8, 39 - y);
        const him = d >= 3 ? 1 : ramp[d]; // …and him, mixed with the wall as the camera saw it
        fg.set([Math.round(60 * him + 255 * (1 - him)), Math.round(40 * him + 255 * (1 - him)), Math.round(30 * him + 255 * (1 - him)), 255], (y * w + x) * 4);
      }
    const fgg = gradeForeground(fg, gray(w, h, 1), w, h, undefined, { ...GRADE, brightness: 0, contrast: 1, saturation: 1 });
    cleanEdges(fgg, a1, m, w, h, s);
    const { soft, wide } = preparePlate(rgba(w, h, 20, 20, 25), w, h); // a night plate
    const out = compositeFrame({ fgg, a1, edge, soft, wide, w, h, grain: 0, random: () => 0.5 });
    // every pixel where the matte is empty is the plate — not a pale rim of the wall
    let brightest = 0;
    for (let i = 0; i < w * h; i++) if (a1[i] === 0) brightest = Math.max(brightest, out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
    expect(brightest).toBeLessThanOrEqual(26);
    // nothing of the wall is let in outside the matte: the feather stops where the matte does
    for (let i = 0; i < w * h; i++) if (m[i] < 0.08) expect(a1[i]).toBe(0);
    // and along his outline nothing is brighter than he is plus the wrap and the warm grade (a white rim would be far above)
    for (let i = 0; i < w * h; i++) if (a1[i] > 0) expect(Math.max(out[i * 4], out[i * 4 + 1], out[i * 4 + 2])).toBeLessThanOrEqual(90);
  });
});

describe("gradeForeground", () => {
  it("with a flat gradient of 1 and no grade, returns the picture unchanged", () => {
    const w = 4;
    const h = 2;
    const fg = rgba(w, h, 200, 100, 50);
    const out = gradeForeground(fg, gray(w, h, 1), w, h, undefined, {
      brightness: 0,
      contrast: 1,
      saturation: 1,
      colorbalance: { rs: 0, gs: 0, bs: 0, rm: 0, gm: 0, bm: 0, rh: 0, gh: 0, bh: 0 },
    });
    expect(out[0] * 255).toBeCloseTo(200, 3);
    expect(out[1] * 255).toBeCloseTo(100, 3);
    expect(out[2] * 255).toBeCloseTo(50, 3);
  });

  it("multiplies by the gradient, darkens by the recipe and warms the shadows", () => {
    const w = 2;
    const h = 1;
    const fg = rgba(w, h, 128, 128, 128);
    const g = new Float32Array([1, 0.5]);
    const out = gradeForeground(fg, g, w, h);
    // the second pixel is half as bright before the grade
    expect(out[3]).toBeLessThan(out[0]);
    // the recipe's brightness is negative: a mid-grey comes out darker than it went in
    expect(out[0]).toBeLessThan(128 / 255);
    // a shadow pixel is warmed: red up, blue down
    const dark = gradeForeground(rgba(1, 1, 40, 40, 40), gray(1, 1, 1), 1, 1);
    expect(dark[0]).toBeGreaterThan(dark[2]);
    expect(GRADE.colorbalance.rs).toBeGreaterThan(0);
  });
});

describe("compositeFrame", () => {
  const w = 3;
  const h = 1;
  const plate = rgba(w, h, 0, 0, 255);
  const { soft, wide } = preparePlate(plate, w, h);
  const fgg = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]);

  it("shows him where the matte is full, the plate where it is empty, and no grain when asked for none", () => {
    const out = compositeFrame({
      fgg,
      a1: new Float32Array([1, 0, 0.5]),
      edge: gray(w, h, 0),
      soft,
      wide,
      w,
      h,
      grain: 0,
      random: () => 0.5,
    });
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...out.slice(4, 8)]).toEqual([0, 0, 255, 255]);
    expect([...out.slice(8, 12)]).toEqual([128, 0, 128, 255]);
  });

  it("lights the edge band with the plate's colour, screened at half strength", () => {
    const out = compositeFrame({
      fgg,
      a1: gray(w, h, 1),
      edge: new Float32Array([0, 1, 0]),
      soft,
      wide,
      w,
      h,
      grain: 0,
      random: () => 0.5,
    });
    // screen(red, blue) = magenta; at half: red + half blue
    expect([...out.slice(4, 8)]).toEqual([255, 0, 128, 255]);
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it("grain is bounded by the strength and repeats with the seed", () => {
    const a = compositeFrame({
      fgg,
      a1: gray(w, h, 1),
      edge: gray(w, h, 0),
      soft,
      wide,
      w,
      h,
      random: seededRandom(7),
    });
    const b = compositeFrame({
      fgg,
      a1: gray(w, h, 1),
      edge: gray(w, h, 0),
      soft,
      wide,
      w,
      h,
      random: seededRandom(7),
    });
    expect([...a]).toEqual([...b]);
    for (let i = 0; i < w; i++) {
      expect(a[i * 4 + 1]).toBeLessThanOrEqual(4); // green was 0: grain adds at most half the strength
      expect(a[i * 4]).toBeGreaterThanOrEqual(251);
    }
  });
});

describe("the alpha video is told from the RGB one by its greyness", () => {
  it("reads a grey picture as grey and a coloured one as not", () => {
    expect(isGrayscale(rgba(8, 8, 90, 91, 89))).toBe(true);
    expect(isGrayscale(rgba(8, 8, 90, 140, 60))).toBe(false);
    expect([...grayFromRgba(rgba(2, 1, 255, 0, 0))]).toEqual([1, 1]);
  });
});
