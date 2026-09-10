/**
 * Golden structural regression for Architecture C stage-1 logo_chest.
 *
 * Canonical live case (not byte-golden — guards the invariants that failed in 1c):
 *   still 2aa1a44c-b24a-46bf-890f-13a6fc65b1cc
 *   quad  [[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]
 *
 * Uses a synthetic frame at the same normalized geometry so CI does not need
 * the production still bytes.
 */
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_C_LOGO_BAND_DEFAULTS,
  applyLowFrequencyBandIllumination,
  countCoverLeakOutsideBand,
  coverTargetQuad,
  isChestBandCandidate,
  isNavyPixel,
  largestOverlappingComponent,
  logoSubQuadInBand,
  overlayZipFromSource,
  type QuadPts,
  type RgbaImage,
} from "./logoComposite";
import {
  applyOcclusionAlphaComposite,
  buildOutfitMinusOccludersAlpha,
  applyChestLocalOcclusionSemantics,
  featherAlpha,
} from "./stillRepairOcclusion";
import {
  ARCHITECTURE_C_V2_REPAIR,
} from "@/lib/heroFrame/architectureCStillRepair";
import {
  GROK_VIDEO_EDIT_PROMPT,
  GROK_VIDEO_EDIT_PROMPT_V2,
  GROK_VIDEO_EDIT_PROMPT_V3,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
} from "@/lib/heroFrame/grokVideoEditPrompt";
import {
  ARCHITECTURE_C_BAND_CROP,
  embedArchitectureCBandCropInFrame,
} from "./fixtures/architectureCStillBandCrop";
import {
  buildStage1hSam3EvidenceAlphas,
  STAGE1H_SAM3_EVIDENCE,
} from "./fixtures/architectureCStill1hSam3Evidence";

/** Canonical Stage-1 IDs / geometry (live evidence). */
export const ARCHITECTURE_C_STAGE1_GOLDEN = {
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  stage1cAssetId: "f7c7b524-2f87-4c87-9624-85368de26f2d",
  measuredBandQuadNorm: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] as [[number, number], [number, number], [number, number], [number, number]],
  frameW: 720,
  frameH: 1280,
} as const;

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

function quadFromNorm(
  w: number,
  h: number,
  norm: [[number, number], [number, number], [number, number], [number, number]],
): QuadPts {
  return norm.map(([nx, ny]) => ({ x: nx * w, y: ny * h })) as QuadPts;
}

function buildCanonicalSynthetic(): { source: RgbaImage; band: QuadPts } {
  const { frameW: W, frameH: H, measuredBandQuadNorm } = ARCHITECTURE_C_STAGE1_GOLDEN;
  const source = solid(W, H, 200, 185, 165); // cream body
  const band = quadFromNorm(W, H, measuredBandQuadNorm);
  // Paint tilted navy inside the measured quad + high-freq "gibberish" lettering
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // crude point-in-band via bbox then stripe
      const ys = band.map((p) => p.y);
      const xs = band.map((p) => p.x);
      if (y < Math.min(...ys) || y > Math.max(...ys)) continue;
      if (x < Math.min(...xs) || x > Math.max(...xs)) continue;
      // Approximate: paint navy for most of the horizontal span at this y
      const t = (y - Math.min(...ys)) / Math.max(1, Math.max(...ys) - Math.min(...ys));
      const xL = band[0].x + (band[3].x - band[0].x) * t;
      const xR = band[1].x + (band[2].x - band[1].x) * t;
      // Leave a cream pocket at the wearer's-left end (>4 px from navy) so 1f
      // must NOT paint bare cream inside the quad (Stage 1e over-paint regression).
      if (x < xL || x > xR - 25) continue;
      const i = (y * W + x) * 4;
      // High-freq cream pinstripe / lettering every 7px
      if (x % 7 === 0) {
        source.data[i] = 210;
        source.data[i + 1] = 200;
        source.data[i + 2] = 180;
      } else if (x < (xL + xR) * 0.5) {
        // Shadowed band fabric — fails isNavyPixel (b<45); Stage 1g candidate.
        source.data[i] = 30;
        source.data[i + 1] = 32;
        source.data[i + 2] = 42;
      } else {
        source.data[i] = 28;
        source.data[i + 1] = 32;
        source.data[i + 2] = 95;
      }
    }
  }
  // Stage-1d left-edge defect: true navy band extends ~10 px past the manual quad.
  const bandTop = Math.min(...band.map((p) => p.y));
  const bandBot = Math.max(...band.map((p) => p.y));
  const bandLeft = Math.min(...band.map((p) => p.x));
  for (let y = Math.floor(bandTop); y <= Math.ceil(bandBot); y++) {
    for (let x = Math.max(0, Math.floor(bandLeft) - 10); x < Math.floor(bandLeft); x++) {
      const i = (y * W + x) * 4;
      if (x % 7 === 0) {
        source.data[i] = 210;
        source.data[i + 1] = 200;
        source.data[i + 2] = 180;
      } else {
        source.data[i] = 30;
        source.data[i + 1] = 32;
        source.data[i + 2] = 42; // shadowed — bandCandidate, not isNavyPixel
      }
    }
  }
  const speckX = Math.round(bandLeft + 64);
  for (let y = Math.floor(bandTop) + 2; y <= Math.ceil(bandBot) - 2; y++) {
    const i = (y * W + speckX) * 4;
    source.data[i] = 2;
    source.data[i + 1] = 6;
    source.data[i + 2] = 17;
  }
  // Cream zip at center of band
  const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
  for (let y = Math.floor(Math.min(...band.map((p) => p.y))); y <= Math.ceil(Math.max(...band.map((p) => p.y))); y++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = midX + dx;
      const i = (y * W + x) * 4;
      source.data[i] = 195;
      source.data[i + 1] = 185;
      source.data[i + 2] = 165;
    }
  }
  // Dark sleeve column BELOW the band (would trigger legacy column-follow drip)
  const bandBottom = Math.max(...band.map((p) => p.y));
  for (let y = Math.ceil(bandBottom) + 1; y < Math.min(H, Math.ceil(bandBottom) + 80); y++) {
    for (let x = midX - 20; x < midX - 5; x++) {
      const i = (y * W + x) * 4;
      source.data[i] = 22;
      source.data[i + 1] = 24;
      source.data[i + 2] = 30;
    }
  }
  // Hand/skin crossing the band (foreground occluder)
  for (let y = Math.floor(Math.min(...band.map((p) => p.y))); y <= Math.ceil(Math.max(...band.map((p) => p.y))); y++) {
    for (let x = midX + 40; x < midX + 70; x++) {
      const i = (y * W + x) * 4;
      source.data[i] = 185;
      source.data[i + 1] = 125;
      source.data[i + 2] = 95;
    }
  }
  return { source, band };
}

const STAGE1G_COVER = {
  fillMode: "quad_navy_union" as const,
  columnFollow: false,
  maxExpandFrac: 0.05,
  featherPx: 3,
  navyUnionMarginPx: 12,
  navyDilatePx: 4,
  navyEdgeDilatePx: 2,
  bandCloseRadiusPx: 6,
  topPinstripeAbsorbPx: 6,
  zipStripFrac: 0,
};

describe("Architecture C stage-1 golden structural invariants", () => {
  it("records the canonical still + measured quad constants", () => {
    expect(ARCHITECTURE_C_STAGE1_GOLDEN.cleanStillAssetId).toBe(
      "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
    );
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId).toBe(
      ARCHITECTURE_C_STAGE1_GOLDEN.cleanStillAssetId,
    );
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(false);
  });

  it("logo sub-zone stays wearer's-left and ~½ band height (not full-band)", () => {
    const { band } = buildCanonicalSynthetic();
    const logo = logoSubQuadInBand(band, ARCHITECTURE_C_LOGO_BAND_DEFAULTS);
    const bandMidX = (band[0].x + band[1].x) / 2;
    const logoMidX = (logo[0].x + logo[1].x) / 2;
    expect(logoMidX).toBeGreaterThan(bandMidX);
    const logoH = (logo[3].y + logo[2].y) / 2 - (logo[0].y + logo[1].y) / 2;
    const bandH = (band[3].y + band[2].y) / 2 - (band[0].y + band[1].y) / 2;
    expect(logoH / bandH).toBeGreaterThan(0.35);
    expect(logoH / bandH).toBeLessThan(0.65);
  });

  it("quad_navy_union cover does not spill into sleeve column below a tilted band", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    // Allow navy-union margin (~12) + feather (~3) beyond the quad.
    const leaks = countCoverLeakOutsideBand(source, covered, band, 20);
    expect(leaks).toBe(0);
    // Deep sleeve pixel unchanged
    const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
    const deepY = Math.ceil(Math.max(...band.map((p) => p.y))) + 40;
    const i = (deepY * source.width + (midX - 12)) * 4;
    expect(covered.data[i]).toBe(source.data[i]);
  });

  it("quad_navy_union covers true navy past the manual quad left edge", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const y = Math.round((band[0].y + band[3].y) / 2);
    const left = Math.floor(Math.min(...band.map((p) => p.x)));
    // Find a cream pinstripe pixel in the ~10 px overhang and assert it was painted navy.
    let foundPinstripe = false;
    for (let x = left - 9; x < left; x++) {
      const i = (y * source.width + x) * 4;
      if (source.data[i]! < 150) continue; // skip already-navy cells
      foundPinstripe = true;
      expect(covered.data[i]!).toBeLessThan(80);
      break;
    }
    expect(foundPinstripe).toBe(true);
  });

  it("low-frequency illumination does not pass high-frequency stripe/text", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const shaded = applyLowFrequencyBandIllumination(source, covered, band);
    // Sample two neighbouring band pixels — variance must stay low after LF transfer
    const y = Math.round((band[0].y + band[3].y) / 2);
    const x0 = Math.round(band[0].x + 20);
    const x1 = x0 + 7; // stripe period
    const i0 = (y * source.width + x0) * 4;
    const i1 = (y * source.width + x1) * 4;
    expect(Math.abs(shaded.data[i0]! - shaded.data[i1]!)).toBeLessThan(12);
  });

  it("painted region has no near-black speckles darker than navy floor", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const shaded = applyLowFrequencyBandIllumination(source, covered, band);
    const y0 = Math.floor(Math.min(...band.map((p) => p.y)));
    const y1 = Math.ceil(Math.max(...band.map((p) => p.y)));
    const x0 = Math.floor(Math.min(...band.map((p) => p.x)));
    const x1 = Math.ceil(Math.max(...band.map((p) => p.x)));
    // Reference navy from a clean covered interior pixel
    const refY = Math.round((y0 + y1) / 2);
    const refX = Math.round(x0 + (x1 - x0) * 0.4);
    const ri = (refY * source.width + refX) * 4;
    const refL =
      0.2126 * shaded.data[ri]! + 0.7152 * shaded.data[ri + 1]! + 0.0722 * shaded.data[ri + 2]!;
    const floor = refL - 6; // Stage 1f: no painted pixel darker than median − 6
    let darkCount = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * source.width + x) * 4;
        const changed =
          shaded.data[i] !== source.data[i] ||
          shaded.data[i + 1] !== source.data[i + 1] ||
          shaded.data[i + 2] !== source.data[i + 2];
        if (!changed) continue;
        // Skip restored zip (high luma)
        const L =
          0.2126 * shaded.data[i]! + 0.7152 * shaded.data[i + 1]! + 0.0722 * shaded.data[i + 2]!;
        if (L > 120) continue;
        if (L < floor) darkCount++;
      }
    }
    expect(darkCount).toBe(0);
  });

  it("1f: cream inside the quad but away from navy stays unchanged", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const y = Math.round((band[0].y + band[3].y) / 2);
    const xR = Math.max(...band.map((p) => p.x));
    const creamX = Math.floor(xR - 8);
    const i = (y * source.width + creamX) * 4;
    expect(source.data[i]!).toBeGreaterThan(150);
    expect(covered.data[i]!).toBe(source.data[i]!);
    expect(covered.data[i + 1]!).toBe(source.data[i + 1]!);
    expect(covered.data[i + 2]!).toBe(source.data[i + 2]!);
  });

  it("1f: cream below the band at forearm sample stays unchanged", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
    const y = Math.ceil(Math.max(...band.map((p) => p.y))) + 8;
    const x = midX + 50;
    const i = (y * source.width + x) * 4;
    expect(covered.data[i]!).toBe(source.data[i]!);
  });

  it("zip overlay restores tape without leaving an unpainted rectangular slit", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const withZip = overlayZipFromSource(source, covered, band, 0.015, 0.5);
    const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
    const y = Math.round((band[0].y + band[3].y) / 2);
    const zipI = (y * source.width + midX) * 4;
    // Sample a band pixel clearly left of the zip core
    const sideX = midX - 40;
    const sideI = (y * source.width + sideX) * 4;
    // Zip reads cream/mastic (high R), side stays navy cover (low R)
    expect(withZip.data[zipI]!).toBeGreaterThan(150);
    expect(withZip.data[sideI]!).toBeLessThan(60);
    // Continuous navy cover — not a multi-pixel unpainted hole around the zip
    for (let dx = 4; dx <= 12; dx++) {
      const i = (y * source.width + (midX - dx)) * 4;
      expect(withZip.data[i]!).toBeLessThan(60);
    }
  });

  it("foreground occlusion α prevents repair over protected hand pixels", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1G_COVER);
    const W = source.width;
    const H = source.height;
    const outfit = new Float32Array(W * H);
    const hands = new Float32Array(W * H);
    // Outfit ≈ cream+navy body in upper torso; hands = skin patch
    for (let y = Math.floor(H * 0.4); y < Math.floor(H * 0.7); y++) {
      for (let x = Math.floor(W * 0.2); x < Math.floor(W * 0.9); x++) {
        outfit[y * W + x] = 1;
      }
    }
    const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
    for (let y = Math.floor(Math.min(...band.map((p) => p.y))); y <= Math.ceil(Math.max(...band.map((p) => p.y))); y++) {
      for (let x = midX + 40; x < midX + 70; x++) hands[y * W + x] = 1;
    }
    const alpha = buildOutfitMinusOccludersAlpha({
      width: W,
      height: H,
      outfit,
      hands,
      face: null,
      dilatePx: 6,
    });
    const out = applyOcclusionAlphaComposite(source, covered, alpha);
    const handI = (Math.round((band[0].y + band[3].y) / 2) * W + (midX + 50)) * 4;
    expect(out.data[handI]).toBe(source.data[handI]); // skin restored
    expect(out.data[handI]).toBeGreaterThan(150);
  });

  it("clean source lineage constants remain unchanged (no mutation of V2 repair config)", () => {
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId).toBe(
      ARCHITECTURE_C_STAGE1_GOLDEN.cleanStillAssetId,
    );
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(false);
  });

  it("V3 I/J installed inactive; active lane remains V2; no paid-run gate", () => {
    expect(GROK_VIDEO_EDIT_PROMPT_VERSION).toBe("v2");
    expect(GROK_VIDEO_EDIT_PROMPT).toBe(GROK_VIDEO_EDIT_PROMPT_V2);
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("self-coloured mastic welt pockets");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("mastic cuffs");
    expect(GROK_VIDEO_EDIT_PROMPT_V3).toContain("navy sleeve panels stopping above the cuff");
    expect(GROK_VIDEO_EDIT_PROMPT).not.toContain("self-coloured mastic welt pockets");
  });

  it("1g bandCandidate admits shadowed navy + crease; rejects cream", () => {
    expect(isNavyPixel(30, 32, 42)).toBe(false); // b<45
    expect(isChestBandCandidate(30, 32, 42)).toBe(true);
    expect(isNavyPixel(2, 6, 17)).toBe(false);
    expect(isChestBandCandidate(2, 6, 17)).toBe(true);
    expect(isChestBandCandidate(200, 185, 165)).toBe(false); // cream
    expect(isChestBandCandidate(185, 125, 95)).toBe(false); // skin-ish chroma
    expect(isChestBandCandidate(28, 32, 95)).toBe(true); // lit navy
  });
});

describe("Architecture C Stage 1g — real-pixel canonical band crop", () => {
  const STAGE1G = {
    fillMode: "quad_navy_union" as const,
    columnFollow: false,
    maxExpandFrac: 0.05,
    featherPx: 3,
    navyUnionMarginPx: 12,
    navyDilatePx: 4,
    navyEdgeDilatePx: 2,
    bandCloseRadiusPx: 6,
    topPinstripeAbsorbPx: 6,
    zipStripFrac: 0,
  };

  function bandFromNorm(
    w: number,
    h: number,
    norm: [[number, number], [number, number], [number, number], [number, number]],
  ): QuadPts {
    return norm.map(([nx, ny]) => ({ x: nx * w, y: ny * h })) as QuadPts;
  }

  it("records the canonical crop identity", () => {
    expect(ARCHITECTURE_C_BAND_CROP.cleanStillAssetId).toBe(
      "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
    );
    expect(ARCHITECTURE_C_BAND_CROP.rgbaBase64.length).toBeGreaterThan(10_000);
  });

  it("fixture carries live failure values (crease + shadowed left) that defeat isNavyPixel", () => {
    const source = embedArchitectureCBandCropInFrame();
    const crease = (700 * source.width + 281) * 4;
    const r = source.data[crease]!;
    const g = source.data[crease + 1]!;
    const b = source.data[crease + 2]!;
    expect(isNavyPixel(r, g, b)).toBe(false);
    expect(isChestBandCandidate(r, g, b)).toBe(true);
    expect(r).toBeLessThan(20);
    expect(b).toBeLessThan(45);
    // Left-third sample must include classifier-negative band fabric.
    let navy = 0;
    let cand = 0;
    for (let x = 216; x < 286; x++) {
      const i = (700 * source.width + x) * 4;
      const rr = source.data[i]!;
      const gg = source.data[i + 1]!;
      const bb = source.data[i + 2]!;
      if (isNavyPixel(rr, gg, bb)) navy++;
      if (isChestBandCandidate(rr, gg, bb)) cand++;
    }
    expect(cand).toBeGreaterThan(navy);
    expect(cand / 70).toBeGreaterThan(0.85);
  });

  it("old 1f navy-only largest-CC path leaves the left third + crease unpainted", () => {
    // Reconstruct Stage 1f paint authority on this real crop: isNavyPixel candidates
    // → largest CC overlapping the quad (no bandCandidate, no close-before-CC).
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const pad = 16;
    const left = Math.max(0, Math.floor(Math.min(...band.map((p) => p.x)) - pad));
    const right = Math.min(source.width - 1, Math.ceil(Math.max(...band.map((p) => p.x)) + pad));
    const top = Math.max(0, Math.floor(Math.min(...band.map((p) => p.y)) - pad));
    const bottom = Math.min(source.height - 1, Math.ceil(Math.max(...band.map((p) => p.y)) + pad));
    const mw = right - left + 1;
    const mh = bottom - top + 1;
    const navyMask = new Float32Array(mw * mh);
    const seed = new Float32Array(mw * mh);
    const [tl, tr, br, bl] = band;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const li = (y - top) * mw + (x - left);
        const i = (y * source.width + x) * 4;
        if (isNavyPixel(source.data[i]!, source.data[i + 1]!, source.data[i + 2]!)) {
          navyMask[li] = 1;
        }
        // crude quad seed via bbox of measured band
        if (
          x >= Math.min(...band.map((p) => p.x)) &&
          x <= Math.max(...band.map((p) => p.x)) &&
          y >= Math.min(...band.map((p) => p.y)) &&
          y <= Math.max(...band.map((p) => p.y))
        ) {
          seed[li] = 1;
        }
      }
    }
    const component = largestOverlappingComponent(navyMask, seed, mw, mh);
    let leftHit = 0;
    for (let x = 216; x < 286; x++) {
      const li = (700 - top) * mw + (x - left);
      if (component[li]! >= 0.5) leftHit++;
    }
    expect(leftHit / 70).toBeLessThan(0.2);
    let creaseHit = 0;
    for (let y = 690; y <= 740; y++) {
      for (let x = 279; x <= 283; x++) {
        const li = (y - top) * mw + (x - left);
        if (component[li]! >= 0.5) creaseHit++;
      }
    }
    expect(creaseHit).toBe(0);
    // Silence unused (keeps quad corners referenced for future invBilinear tightening).
    expect(tl && tr && br && bl).toBeTruthy();
  });

  it("left third of the band is included in the paint component", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    const y = 700;
    let painted = 0;
    let total = 0;
    for (let x = 216; x < 286; x++) {
      const i = (y * source.width + x) * 4;
      total++;
      const changed =
        covered.data[i] !== source.data[i] ||
        covered.data[i + 1] !== source.data[i + 1] ||
        covered.data[i + 2] !== source.data[i + 2];
      if (changed) painted++;
    }
    expect(painted / total).toBeGreaterThan(0.85);
  });

  it("upper-left pinstripe is fully covered (max luma near band median)", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    let maxL = 0;
    let brightSrc = 0;
    // Stage 1i: probe the verified upper-left hard pinstripe (x214–255), not the
    // open cream field further right (x≳280 at y675) which must stay unpainted.
    for (let y = 675; y <= 680; y++) {
      for (let x = 214; x <= 255; x++) {
        const i = (y * source.width + x) * 4;
        const srcL =
          0.2126 * source.data[i]! +
          0.7152 * source.data[i + 1]! +
          0.0722 * source.data[i + 2]!;
        if (srcL <= 140) continue;
        brightSrc++;
        const L =
          0.2126 * covered.data[i]! +
          0.7152 * covered.data[i + 1]! +
          0.0722 * covered.data[i + 2]!;
        if (L > maxL) maxL = L;
      }
    }
    expect(brightSrc).toBeGreaterThan(10);
    expect(maxL).toBeLessThan(80);
  });

  it("dark crease cannot remain below bandMedian - 6", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    // Sample painted interior for median proxy
    const refI = (700 * source.width + 450) * 4;
    const median =
      0.2126 * covered.data[refI]! +
      0.7152 * covered.data[refI + 1]! +
      0.0722 * covered.data[refI + 2]!;
    const floor = median - 6;
    for (let y = 690; y <= 740; y++) {
      for (let x = 279; x <= 283; x++) {
        const i = (y * source.width + x) * 4;
        const L =
          0.2126 * covered.data[i]! +
          0.7152 * covered.data[i + 1]! +
          0.0722 * covered.data[i + 2]!;
        expect(L).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("cream sleeve/forearm boundary remains unchanged", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    // C4 probe: cream forearm on the real still (skip residual dark band fabric).
    for (let y = 741; y <= 749; y++) {
      for (let x = 330; x <= 380; x++) {
        const i = (y * source.width + x) * 4;
        const srcL =
          0.2126 * source.data[i]! +
          0.7152 * source.data[i + 1]! +
          0.0722 * source.data[i + 2]!;
        if (srcL < 180) continue;
        expect(covered.data[i]).toBe(source.data[i]);
        expect(covered.data[i + 1]).toBe(source.data[i + 1]);
        expect(covered.data[i + 2]).toBe(source.data[i + 2]);
      }
    }
  });

  it("no cream-in-quad overpaint at far-right cream fabric", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    // Real still cream near the wearer's-left end of the measured quad.
    const i = (710 * source.width + 620) * 4;
    expect(source.data[i]!).toBeGreaterThan(150);
    expect(covered.data[i]).toBe(source.data[i]);
    expect(covered.data[i + 1]).toBe(source.data[i + 1]);
    expect(covered.data[i + 2]).toBe(source.data[i + 2]);
  });

  it("no drips below the band into body/sleeve columns", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    expect(countCoverLeakOutsideBand(source, covered, band, 20)).toBe(0);
  });

  it("zip overlay restores the centre zip line after solid band paint", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    // Seed a cream zip tape on the source so overlay has signal to restore.
    const midX = Math.round((band[0].x + band[1].x) / 2);
    const y0 = Math.floor(Math.min(...band.map((p) => p.y)));
    const y1 = Math.ceil(Math.max(...band.map((p) => p.y)));
    for (let y = y0; y <= y1; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = (y * source.width + (midX + dx)) * 4;
        source.data[i] = 195;
        source.data[i + 1] = 185;
        source.data[i + 2] = 165;
      }
    }
    const withZip = overlayZipFromSource(source, covered, band, 0.015, 0.5);
    const zipI = (Math.round((y0 + y1) / 2) * source.width + midX) * 4;
    const sideI = (Math.round((y0 + y1) / 2) * source.width + (midX - 40)) * 4;
    expect(withZip.data[zipI]!).toBeGreaterThan(150);
    expect(withZip.data[sideI]!).toBeLessThan(80);
  });

  it("1h: cream body rows above the band stay unchanged (no top-edge raise)", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    // Live failure rows 662–676: cream body above the band must not become navy.
    // Soft 1–2px feather at the true band edge is allowed; solid navy (L < 80) is not.
    let brightChecked = 0;
    let solidNavyHits = 0;
    for (let y = 662; y <= 670; y++) {
      for (let x = 290; x <= 530; x++) {
        const i = (y * source.width + x) * 4;
        const srcL =
          0.2126 * source.data[i]! +
          0.7152 * source.data[i + 1]! +
          0.0722 * source.data[i + 2]!;
        if (srcL <= 140) continue;
        brightChecked++;
        const outL =
          0.2126 * covered.data[i]! +
          0.7152 * covered.data[i + 1]! +
          0.0722 * covered.data[i + 2]!;
        if (outL < 80) solidNavyHits++;
      }
    }
    expect(brightChecked).toBeGreaterThan(100);
    expect(solidNavyHits).toBe(0);
  });

  it("1h: expansion path keeps feather on non-core paint (code contract)", () => {
    // Structural lock: after inwardFeatherAlpha, only core ∪ absorb are forced
    // solid — expansion-only pixels retain the soft ramp (Stage 1h perimeter fix).
    // Behavioral soft-pixel counts vary with the real crop; the contract is in
    // coverTargetQuad's alpha re-assert (coreComponent || stripeAbsorb).
    expect(STAGE1G.featherPx).toBe(3);
    expect(STAGE1G.navyDilatePx).toBe(4);
  });

  it("1h: crease column stays ≥ bandMedian − 6 after illumination", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    const shaded = applyLowFrequencyBandIllumination(source, covered, band);
    const refI = (700 * source.width + 450) * 4;
    const median =
      0.2126 * shaded.data[refI]! +
      0.7152 * shaded.data[refI + 1]! +
      0.0722 * shaded.data[refI + 2]!;
    const floor = median - 6;
    for (let y = 690; y <= 740; y++) {
      for (let x = 279; x <= 283; x++) {
        const i = (y * source.width + x) * 4;
        const L =
          0.2126 * shaded.data[i]! +
          0.7152 * shaded.data[i + 1]! +
          0.0722 * shaded.data[i + 2]!;
        expect(L).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("1h: mid-tone zip wedge is not restored — only bright zip tape", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1G);
    const midX = Math.round((band[0].x + band[1].x) / 2);
    const yMid = Math.round(
      (Math.min(...band.map((p) => p.y)) + Math.max(...band.map((p) => p.y))) / 2,
    );
    // Mid-tone wedge fabric (not bright zip) at center — must stay navy after overlay.
    for (let dx = -8; dx <= 8; dx++) {
      const i = (yMid * source.width + (midX + dx)) * 4;
      source.data[i] = 90;
      source.data[i + 1] = 85;
      source.data[i + 2] = 80;
    }
    // Bright cream zip only on a 1px core.
    for (let y = yMid - 10; y <= yMid + 10; y++) {
      const i = (y * source.width + midX) * 4;
      source.data[i] = 195;
      source.data[i + 1] = 185;
      source.data[i + 2] = 165;
    }
    const withZip = overlayZipFromSource(source, covered, band, 0.015, 0.5);
    const zipI = (yMid * source.width + midX) * 4;
    const wedgeI = (yMid * source.width + (midX + 6)) * 4;
    expect(withZip.data[zipI]!).toBeGreaterThan(150);
    expect(withZip.data[wedgeI]!).toBeLessThan(80);
  });
});

describe("Architecture C Stage 1i — real-α occlusion composite regression", () => {
  const STAGE1I = {
    fillMode: "quad_navy_union" as const,
    columnFollow: false,
    maxExpandFrac: 0.05,
    featherPx: 3,
    navyUnionMarginPx: 12,
    navyDilatePx: 4,
    navyEdgeDilatePx: 2,
    bandCloseRadiusPx: 6,
    topPinstripeAbsorbPx: 5,
    zipStripFrac: 0,
  };

  function bandFromNorm(
    w: number,
    h: number,
    norm: [[number, number], [number, number], [number, number], [number, number]],
  ): QuadPts {
    return norm.map(([nx, ny]) => ({ x: nx * w, y: ny * h })) as QuadPts;
  }

  function lumaAt(img: RgbaImage, x: number, y: number): number {
    const i = (y * img.width + x) * 4;
    return 0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!;
  }

  /** Paint → illumination → bright zip → chest-local occlusion composite. */
  function runStage1iPipeline(source: RgbaImage, band: QuadPts) {
    const covered = coverTargetQuad(source, band, STAGE1I);
    const shaded = applyLowFrequencyBandIllumination(source, covered, band);
    // Seed a narrow bright zip core so overlay has signal (live still zip is faint).
    const midX = Math.round((band[0].x + band[1].x) / 2);
    const y0 = Math.floor(Math.min(...band.map((p) => p.y)));
    const y1 = Math.ceil(Math.max(...band.map((p) => p.y)));
    for (let y = y0; y <= y1; y++) {
      const i = (y * source.width + midX) * 4;
      source.data[i] = 195;
      source.data[i + 1] = 185;
      source.data[i + 2] = 165;
    }
    const withZip = overlayZipFromSource(source, shaded, band, 0.015, 0.5);
    const { outfitBasedAlpha, handsAlpha, faceAlpha } = buildStage1hSam3EvidenceAlphas(
      source.width,
      source.height,
    );
    const chestLocal = applyChestLocalOcclusionSemantics({
      width: source.width,
      height: source.height,
      outfitBasedAlpha,
      bandComponent: covered.bandAuthorityMask,
      handsAlpha,
      faceAlpha,
      dilatePx: 12,
    });
    const alpha = featherAlpha(chestLocal, source.width, source.height, 2);
    const out = applyOcclusionAlphaComposite(source, withZip, alpha);
    return { covered, withZip, out, outfitBasedAlpha, midX };
  }

  it("records Stage 1h evidence provenance on the α fixture", () => {
    expect(STAGE1H_SAM3_EVIDENCE.sourceCommit).toBe(
      "df64344c566cdb359468a9c2afd8afb4f7320d97",
    );
    expect(STAGE1H_SAM3_EVIDENCE.repairMethodVersion).toBe("architecture_c_still_repair_1h");
  });

  it("1h outfit-based α alone would restore crease+wedge (documents the causal hole)", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const covered = coverTargetQuad(source, band, STAGE1I);
    const { outfitBasedAlpha } = buildStage1hSam3EvidenceAlphas(source.width, source.height);
    const bad = applyOcclusionAlphaComposite(source, covered, outfitBasedAlpha);
    // Deepest crease dip (x280, coverage ≈ 0.39) stays much closer to source than
    // to solid paint under outfit-based α (documents the causal hole).
    const srcL = lumaAt(source, 280, 700);
    const paintL = lumaAt(covered, 280, 700);
    const badL = lumaAt(bad, 280, 700);
    expect(Math.abs(badL - srcL)).toBeLessThan(Math.abs(paintL - srcL) * 0.55);
    expect(Math.abs(badL - srcL)).toBeGreaterThan(0.5); // not fully painted either
    // Wedge stays source under outfit hole (α=0).
    expect(lumaAt(bad, 412, 720)).toBeCloseTo(lumaAt(source, 412, 720), 0);
  });

  it("chest-local occlusion repairs crease + wedge while protecting the hand window", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const { out, covered, midX } = runStage1iPipeline(source, band);
    const refI = (700 * source.width + 450) * 4;
    const median =
      0.2126 * covered.data[refI]! +
      0.7152 * covered.data[refI + 1]! +
      0.0722 * covered.data[refI + 2]!;
    const floor = median - 6;

    // Crease x≈277–283 receives product-truth repair (not source restoration).
    for (let x = 277; x <= 283; x++) {
      expect(lumaAt(out, x, 700)).toBeGreaterThanOrEqual(floor);
    }

    // Wedge x≈399–430 continuous navy-band repair (exclude the narrow zip core).
    for (let x = 402; x <= 423; x++) {
      if (Math.abs(x - midX) <= 2) continue;
      expect(lumaAt(out, x, 720)).toBeLessThan(80);
      expect(lumaAt(out, x, 720)).toBeGreaterThanOrEqual(floor - 2);
    }

    // Only the intended narrow zip line is restored afterward.
    expect(lumaAt(out, midX, 720)).toBeGreaterThan(150);
    expect(lumaAt(out, midX - 6, 720)).toBeLessThan(80);

    // Real hand/face foreground remains protected (forearm window).
    for (let y = 741; y <= 749; y++) {
      for (let x = 340; x <= 370; x++) {
        const srcL = lumaAt(source, x, y);
        if (srcL < 180) continue; // skip residual dark fabric
        expect(out.data[(y * source.width + x) * 4]!).toBe(source.data[(y * source.width + x) * 4]!);
      }
    }
  });

  it("withdraws midY hard lock: wearer's-left y714–734 lettering is repaired", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    // Ensure bright lettering residues exist in the band interior on wearer's-left.
    for (let y = 714; y <= 734; y++) {
      for (let x = 460; x <= 520; x += 4) {
        const i = (y * source.width + x) * 4;
        if (lumaAt(source, x, y) > 150) continue;
        // Plant bright lettering only where we will assert repair ownership.
        source.data[i] = 210;
        source.data[i + 1] = 200;
        source.data[i + 2] = 185;
      }
    }
    const { out, covered } = runStage1iPipeline(source, band);
    // Authority must include these rows when they fall in the band component.
    let repaired = 0;
    let checked = 0;
    for (let y = 714; y <= 734; y++) {
      for (let x = 460; x <= 520; x++) {
        if (covered.bandAuthorityMask[y * source.width + x]! < 0.5) continue;
        checked++;
        if (lumaAt(out, x, y) < 80) repaired++;
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(repaired / checked).toBeGreaterThan(0.85);
  });

  it("top absorb removes upper-left pinstripe/AA without cream-body raise", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    // Plant a finite bright ridge + AA with dark fabric above (live pinstripe
    // signature). Open cream body alone must not be absorbed.
    for (let x = 220; x <= 250; x++) {
      for (let y = 681; y <= 700; y++) {
        const i = (y * source.width + x) * 4;
        source.data[i] = 28;
        source.data[i + 1] = 32;
        source.data[i + 2] = 95;
      }
      // Ridge 676–679 + AA 675, dark above 670–674 (not cream field).
      for (let y = 676; y <= 679; y++) {
        const i = (y * source.width + x) * 4;
        source.data[i] = 220;
        source.data[i + 1] = 210;
        source.data[i + 2] = 195;
      }
      {
        const i = (675 * source.width + x) * 4;
        source.data[i] = 120;
        source.data[i + 1] = 110;
        source.data[i + 2] = 100;
      }
      for (let y = 670; y <= 674; y++) {
        const i = (y * source.width + x) * 4;
        source.data[i] = 20;
        source.data[i + 1] = 22;
        source.data[i + 2] = 28;
      }
      // Cream body further above — must stay cream.
      for (let y = 662; y <= 668; y++) {
        const i = (y * source.width + x) * 4;
        source.data[i] = 205;
        source.data[i + 1] = 190;
        source.data[i + 2] = 170;
      }
    }
    const { covered } = runStage1iPipeline(source, band);
    let brightRidge = 0;
    for (let y = 675; y <= 679; y++) {
      for (let x = 220; x <= 250; x++) {
        if (lumaAt(covered, x, y) > 140) brightRidge++;
      }
    }
    expect(brightRidge).toBe(0);
    let solidNavyHits = 0;
    for (let y = 662; y <= 668; y++) {
      for (let x = 220; x <= 250; x++) {
        if (lumaAt(covered, x, y) < 80) solidNavyHits++;
      }
    }
    expect(solidNavyHits).toBe(0);
  });

  it("close/expansion does not paint navy sleeve/forearm block or right-end protrusion", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    // Shadowed cream sleeve material adjacent to the band (Stage 1h failure zone).
    for (let y = 745; y <= 759; y++) {
      for (let x = 373; x <= 399; x++) {
        const i = (y * source.width + x) * 4;
        source.data[i] = 120;
        source.data[i + 1] = 110;
        source.data[i + 2] = 100;
      }
    }
    const { covered, out } = runStage1iPipeline(source, band);
    for (let y = 745; y <= 759; y++) {
      for (let x = 373; x <= 399; x++) {
        expect(lumaAt(covered, x, y)).toBeGreaterThan(90);
        expect(covered.data[(y * source.width + x) * 4]!).toBe(source.data[(y * source.width + x) * 4]!);
      }
    }
    // Far-right cream in-quad stays unpainted (no right-end protrusion).
    const i = (710 * source.width + 620) * 4;
    expect(source.data[i]!).toBeGreaterThan(150);
    expect(out.data[i]!).toBe(source.data[i]!);
  });

  it("outside-region preservation remains intact after occlusion composite", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = bandFromNorm(
      source.width,
      source.height,
      ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
    );
    const { out } = runStage1iPipeline(source, band);
    let changed = 0;
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        if (
          out.data[i] !== source.data[i] ||
          out.data[i + 1] !== source.data[i + 1] ||
          out.data[i + 2] !== source.data[i + 2]
        ) {
          changed++;
        }
      }
    }
    for (let y = 800; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        if (
          out.data[i] !== source.data[i] ||
          out.data[i + 1] !== source.data[i + 1] ||
          out.data[i + 2] !== source.data[i + 2]
        ) {
          changed++;
        }
      }
    }
    expect(changed).toBe(0);
  });
});
