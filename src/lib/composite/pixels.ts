/**
 * The composite, pixel by pixel — the recipe that passed the 15 Oct integration test (variant D of the ffmpeg chain in
 * docs/recipes/PLATE_REALISM_PROMPT.md), written out so the browser can run it on a dressed take. Every step is a pure
 * function on typed arrays; nothing here touches a canvas, a codec or the network.
 *
 * The chain, for one frame of him (RGBA from the dressed take) and his matte (one grey channel from the alpha video):
 *   1. the matte is eroded a pixel and feathered (σ 1.0) — a1;
 *   2. an INNER edge band is cut from it: a1 minus a1 eroded four pixels and blurred (σ 5), kept only where a1 is
 *      the larger (one-sided), blurred again (σ 1.5) and multiplied by a1 so none of it lies outside him — edge;
 *   2b. his outline is cleaned of the take's own background (v2, 16 Oct): the colour a few pixels inside him is
 *      pulled outward over the feather, so a white wall behind him in the take never rims him on the plate;
 *   3. his pixels are multiplied by a key gradient (brighter on the key side) and graded to the plate: luma down a
 *      touch, contrast up a touch, colour a touch less, shadows warmed, highlights warmed, blues pulled;
 *   4. the plate is defocused slightly (σ 1.2) and, separately, blurred wide (σ 30) to light him;
 *   5. he goes over the soft plate through a1; the wide plate is screened onto him at half strength and laid back
 *      over the result through the edge band only (an OUTER band would be a halo);
 *   6. a little grain over everything, new every frame.
 *
 * Everything is 0–1 floats between steps; the frame leaves as 8-bit RGBA.
 */

/** One channel of a w×h picture, 0–1. */
export type Gray = Float32Array;
/** Three channels of a w×h picture, interleaved r g b, 0–1. */
export type Rgb = Float32Array;

/** How he is graded to the plate: eq's three, then colorbalance's shadow / midtone / highlight shifts per channel. */
export type Grade = {
  brightness: number;
  contrast: number;
  saturation: number;
  colorbalance: {
    rs: number;
    gs: number;
    bs: number;
    rm: number;
    gm: number;
    bm: number;
    rh: number;
    gh: number;
    bh: number;
  };
};

/** The grade the test settled on. Kept as data so a run records exactly what it used. */
export const GRADE: Grade = {
  brightness: -0.05,
  contrast: 1.04,
  saturation: 0.9,
  colorbalance: {
    rs: 0.08,
    gs: 0.02,
    bs: -0.08,
    rm: 0.05,
    gm: 0,
    bm: -0.06,
    rh: 0.06,
    gh: 0,
    bh: -0.04,
  },
};

export const RECIPE = {
  version: "plate-composite-v2-2026-10-16",
  keyGradient: "clip(120 + 140·x/w − 35·y/h, 0, 255) / 255, multiplied",
  matte: { erode: 1, featherSigma: 1.0 },
  /** `confined`: the band is one-sided and multiplied by a1 — v1's band reached outside him and rimmed him white. */
  edge: { erode: 4, insideSigma: 5, bandSigma: 1.5, confined: true },
  /** His outline takes the colour from `erode` pixels inside him, spread over σ — never the take's own background. */
  decontaminate: { erode: 2, sigma: 4 },
  plate: { softSigma: 1.2, wrapSigma: 30 },
  wrap: { mode: "screen", opacity: 0.5 },
  grain: 7,
  grade: GRADE,
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The key gradient: brighter toward the right (the key side), a touch darker toward the bottom. */
export function keyGradient(w: number, h: number): Gray {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (35 * y) / h;
    for (let x = 0; x < w; x++) {
      const v = 120 + (140 * x) / w - fy;
      out[y * w + x] = (v < 0 ? 0 : v > 255 ? 255 : v) / 255;
    }
  }
  return out;
}

/** The radii of `n` box blurs that together approximate a Gaussian of `sigma` (Kutskir's construction). */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl -= 1;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}

/** One box blur of radius r along rows, edges replicated. A radius of 0 is a copy. */
function boxBlurH(src: Gray, dst: Gray, w: number, h: number, r: number): void {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const first = src[row];
    const last = src[row + w - 1];
    let sum = first * (r + 1);
    for (let x = 0; x < r; x++) sum += src[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      const add = x + r < w ? src[row + x + r] : last;
      const drop = x - r - 1 >= 0 ? src[row + x - r - 1] : first;
      sum += add - drop;
      dst[row + x] = sum * k;
    }
  }
}

/** One box blur of radius r along columns, edges replicated. */
function boxBlurV(src: Gray, dst: Gray, w: number, h: number, r: number): void {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    const first = src[x];
    const last = src[(h - 1) * w + x];
    let sum = first * (r + 1);
    for (let y = 0; y < r; y++) sum += src[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      const add = y + r < h ? src[(y + r) * w + x] : last;
      const drop = y - r - 1 >= 0 ? src[(y - r - 1) * w + x] : first;
      sum += add - drop;
      dst[y * w + x] = sum * k;
    }
  }
}

/** A Gaussian blur of one channel (three box passes). `out` and `tmp` may be reused between calls; `out` may be `src`. */
export function gaussianBlur(
  src: Gray,
  w: number,
  h: number,
  sigma: number,
  out: Gray = new Float32Array(w * h),
  tmp: Gray = new Float32Array(w * h),
): Gray {
  if (sigma <= 0) {
    if (out !== src) out.set(src);
    return out;
  }
  let cur = src;
  for (const r of boxesForGauss(sigma)) {
    boxBlurH(cur, tmp, w, h, r);
    boxBlurV(tmp, out, w, h, r);
    cur = out;
  }
  return out;
}

/** The minimum over a (2r+1)² square — what r passes of a 3×3 erosion amount to. `out` may be `src`. */
export function erode(
  src: Gray,
  w: number,
  h: number,
  r: number,
  out: Gray = new Float32Array(w * h),
  tmp: Gray = new Float32Array(w * h),
): Gray {
  if (r <= 0) {
    if (out !== src) out.set(src);
    return out;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = Infinity;
      const lo = Math.max(0, x - r);
      const hi = Math.min(w - 1, x + r);
      for (let i = lo; i <= hi; i++) if (src[row + i] < m) m = src[row + i];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = Infinity;
      const lo = Math.max(0, y - r);
      const hi = Math.min(h - 1, y + r);
      for (let i = lo; i <= hi; i++) if (tmp[i * w + x] < m) m = tmp[i * w + x];
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Scratch space one frame's alpha work needs, allocated once. */
export type AlphaScratch = { a: Gray; b: Gray; c: Gray; d: Gray; e: Gray; f: Gray };
export function alphaScratch(w: number, h: number): AlphaScratch {
  return {
    a: new Float32Array(w * h),
    b: new Float32Array(w * h),
    c: new Float32Array(w * h),
    d: new Float32Array(w * h),
    e: new Float32Array(w * h),
    f: new Float32Array(w * h),
  };
}

/** The matte as the composite uses it: feathered (a1) and its inner edge band (edge). Both written into `s.a` and `s.b`. */
export function prepareAlpha(
  alpha: Gray,
  w: number,
  h: number,
  s: AlphaScratch = alphaScratch(w, h),
): { a1: Gray; edge: Gray } {
  erode(alpha, w, h, RECIPE.matte.erode, s.a, s.c);
  gaussianBlur(s.a, w, h, RECIPE.matte.featherSigma, s.a, s.c); // a1
  erode(s.a, w, h, RECIPE.edge.erode, s.b, s.c);
  gaussianBlur(s.b, w, h, RECIPE.edge.insideSigma, s.b, s.c); // the matte pulled inside him
  // one-sided: where the pulled-in matte is the larger (outside his feathered outline) there is no band at all
  for (let i = 0; i < w * h; i++) s.d[i] = Math.max(0, s.a[i] - s.b[i]);
  gaussianBlur(s.d, w, h, RECIPE.edge.bandSigma, s.b, s.c); // edge
  // and nothing the blur spread past his outline survives: the band lights him, never the plate beside him
  for (let i = 0; i < w * h; i++) s.b[i] *= s.a[i];
  return { a1: s.a, edge: s.b };
}

/**
 * His outline, cleaned of the take's background. A matte's soft edge covers pixels that are part him, part whatever
 * stood behind him when he was filmed (a white wall in the 15 Oct takes); laid over a dark plate through the feather,
 * that mix is a pale rim. So the colour `decontaminate.erode` pixels inside him is spread outward (a normalised
 * blur of σ `decontaminate.sigma`) and takes over wherever the eroded core is not full. In place on `fgg` (0–1 rgb);
 * `s.c`–`s.f` are scratch, `a1` is read only.
 */
export function cleanEdges(fgg: Rgb, a1: Gray, w: number, h: number, s: AlphaScratch): Rgb {
  const n = w * h;
  const core = erode(a1, w, h, RECIPE.decontaminate.erode, s.e, s.c);
  const weight = gaussianBlur(core, w, h, RECIPE.decontaminate.sigma, s.f, s.c);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) s.d[i] = fgg[i * 3 + c] * core[i];
    gaussianBlur(s.d, w, h, RECIPE.decontaminate.sigma, s.d, s.c);
    for (let i = 0; i < n; i++) {
      const k = core[i];
      if (k >= 1) continue; // deep inside him: his own pixel
      const den = weight[i];
      if (den < 1e-4) continue; // nowhere near him: the plate shows here anyway
      const inside = s.d[i] / den;
      fgg[i * 3 + c] = fgg[i * 3 + c] * k + inside * (1 - k);
    }
  }
  return fgg;
}

/** ffmpeg colorbalance's weights: how much of a shadow, midtone and highlight adjustment a pixel of lightness l takes. */
function balanceWeights(l: number): [number, number, number] {
  const a = 4;
  const b = 1 / 3;
  const scale = 0.7;
  const s = clamp01((b - l) * a + 0.5) * scale;
  const m = clamp01((l - b) * a + 0.5) * clamp01((1 - b - l) * a + 0.5) * scale;
  const hh = clamp01((l + b - 1) * a + 0.5) * scale;
  return [s, m, hh];
}

/**
 * His pixels lit and graded: multiplied by the key gradient, then luma/contrast/saturation (as eq does, on Y'CbCr),
 * then colour balance by lightness band. Writes 0–1 rgb into `out`.
 */
export function gradeForeground(
  fg: Uint8ClampedArray | Uint8Array,
  grad: Gray,
  w: number,
  h: number,
  out: Rgb = new Float32Array(w * h * 3),
  grade: Grade = GRADE,
): Rgb {
  const { brightness, contrast, saturation } = grade;
  const cb = grade.colorbalance;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const g = grad[i];
    let r = (fg[i * 4] / 255) * g;
    let gg = (fg[i * 4 + 1] / 255) * g;
    let b = (fg[i * 4 + 2] / 255) * g;
    // eq: on luma and chroma (BT.709), as the filter does after the picture is handed to it as yuv
    const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const pb = ((b - y) / 1.8556) * saturation;
    const pr = ((r - y) / 1.5748) * saturation;
    const y2 = (y - 0.5) * contrast + 0.5 + brightness;
    r = y2 + 1.5748 * pr;
    b = y2 + 1.8556 * pb;
    gg = (y2 - 0.2126 * r - 0.0722 * b) / 0.7152;
    r = clamp01(r);
    gg = clamp01(gg);
    b = clamp01(b);
    // colorbalance: the lightness decides which band's shift a pixel takes
    const l = (Math.max(r, gg, b) + Math.min(r, gg, b)) * 0.5;
    const [ws, wm, wh] = balanceWeights(l);
    out[i * 3] = clamp01(r + cb.rs * ws + cb.rm * wm + cb.rh * wh);
    out[i * 3 + 1] = clamp01(gg + cb.gs * ws + cb.gm * wm + cb.gh * wh);
    out[i * 3 + 2] = clamp01(b + cb.bs * ws + cb.bm * wm + cb.bh * wh);
  }
  return out;
}

/** The plate as the composite uses it: slightly defocused (what he stands in front of) and blurred wide (what lights his edge). */
export function preparePlate(
  plate: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): { soft: Rgb; wide: Rgb } {
  const n = w * h;
  const soft = new Float32Array(n * 3);
  const wide = new Float32Array(n * 3);
  const ch = new Float32Array(n);
  const o = new Float32Array(n);
  const t = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) ch[i] = plate[i * 4 + c] / 255;
    gaussianBlur(ch, w, h, RECIPE.plate.softSigma, o, t);
    for (let i = 0; i < n; i++) soft[i * 3 + c] = o[i];
    gaussianBlur(ch, w, h, RECIPE.plate.wrapSigma, o, t);
    for (let i = 0; i < n; i++) wide[i * 3 + c] = o[i];
  }
  return { soft, wide };
}

/** A small deterministic generator (mulberry32) so a run can be repeated exactly and a test can check it. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One finished frame: him (graded) over the soft plate through a1, the wide plate screened onto his edge band, grain
 * over all. `random` gives the grain (0–1 per call); the same seed gives the same frame.
 */
export function compositeFrame(
  input: {
    fgg: Rgb;
    a1: Gray;
    edge: Gray;
    soft: Rgb;
    wide: Rgb;
    w: number;
    h: number;
    grain?: number;
    random: () => number;
  },
  out: Uint8ClampedArray = new Uint8ClampedArray(input.w * input.h * 4),
): Uint8ClampedArray {
  const { fgg, a1, edge, soft, wide, w, h, random } = input;
  const grain = (input.grain ?? RECIPE.grain) / 255;
  const op = RECIPE.wrap.opacity;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const a = a1[i];
    const e = edge[i];
    const noise = (random() - 0.5) * grain;
    for (let c = 0; c < 3; c++) {
      const f = fgg[i * 3 + c];
      const p = soft[i * 3 + c];
      const pw = wide[i * 3 + c];
      const screen = 1 - (1 - f) * (1 - pw);
      const wrap = f * (1 - op) + screen * op;
      const base = p * (1 - a) + f * a;
      const v = base * (1 - e) + wrap * e + noise;
      out[i * 4 + c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The red channel of an RGBA picture as 0–1 grey — how the alpha video is read (its three channels are the same). */
export function grayFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  out: Gray = new Float32Array(rgba.length / 4),
): Gray {
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
  return out;
}

/** Whether a picture is grey (no pixel's channels differ by more than a hair): how the alpha video is told from the RGB one. */
export function isGrayscale(rgba: Uint8ClampedArray | Uint8Array, tolerance = 3): boolean {
  const n = rgba.length / 4;
  let off = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    if (Math.abs(r - g) > tolerance || Math.abs(g - b) > tolerance) off += 1;
  }
  return off <= n * 0.001;
}
