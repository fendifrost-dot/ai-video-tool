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
  logoSubQuadInBand,
  overlayZipFromSource,
  type QuadPts,
  type RgbaImage,
} from "./logoComposite";
import {
  applyOcclusionAlphaComposite,
  buildOutfitMinusOccludersAlpha,
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
        source.data[i] = 28;
        source.data[i + 1] = 32;
        source.data[i + 2] = 95;
      }
    }
  }
  // Near-black navy outlier column (stage-1d speckle seed at ~x=280 analogue).
  const speckX = Math.round(bandLeft + 64);
  for (let y = Math.floor(bandTop) + 2; y <= Math.ceil(bandBot) - 2; y++) {
    const i = (y * W + speckX) * 4;
    source.data[i] = 8;
    source.data[i + 1] = 10;
    source.data[i + 2] = 48; // still passes isNavyPixel (b>r+8)
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

const STAGE1F_COVER = {
  fillMode: "quad_navy_union" as const,
  columnFollow: false,
  maxExpandFrac: 0.05,
  featherPx: 3,
  navyUnionMarginPx: 12,
  navyDilatePx: 4,
  navyEdgeDilatePx: 2,
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
    const midX = Math.round((Math.min(...band.map((p) => p.x)) + Math.max(...band.map((p) => p.x))) / 2);
    const y = Math.ceil(Math.max(...band.map((p) => p.y))) + 8;
    const x = midX + 50;
    const i = (y * source.width + x) * 4;
    expect(covered.data[i]!).toBe(source.data[i]!);
  });

  it("zip overlay restores tape without leaving an unpainted rectangular slit", () => {
    const { source, band } = buildCanonicalSynthetic();
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
    const covered = coverTargetQuad(source, band, STAGE1F_COVER);
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
});
