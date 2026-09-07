/**
 * Real-pixel chest-band crop fixture for Architecture C Stage 1g.
 *
 * Geometry matches clean still `2aa1a44c` crop: x 190–639, y 660–760 (450×101)
 * inside the 720×1280 frame. Pixel values reconstructed from Stage 1f live
 * measurements (Claude 2026-09-07): shadowed navy (b<45) in the left third,
 * crease RGB≈(2,6,17) at x≈279–283, upper-left pinstripe, cream sleeve.
 *
 * Live still bytes are not in-repo; this fixture exists so the golden suite
 * cannot pass on lit-navy-only synthetics the way Stage 1f did.
 *
 * Built procedurally (not a base64 dump) so the Stage 1g failure modes stay
 * explicit and reviewable: shadowed candidates, the dark crease, top pinstripe,
 * and an *open* far-right cream pocket (not an enclosed hole close() would fill).
 */

export const ARCHITECTURE_C_BAND_CROP = {
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  originX: 190,
  originY: 660,
  width: 450,
  height: 101,
  frameW: 720,
  frameH: 1280,
  measuredBandQuadNorm: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] as [[number, number], [number, number], [number, number], [number, number]],
} as const;

function setRgb(data: Uint8Array, i: number, r: number, g: number, b: number): void {
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}

/**
 * Decode/build the crop as RGBA. Coordinates below are in full-frame space;
 * only the crop window is returned.
 */
export function decodeArchitectureCBandCrop(): {
  width: number;
  height: number;
  data: Uint8Array;
  originX: number;
  originY: number;
} {
  const { originX: ox, originY: oy, width: W, height: H } = ARCHITECTURE_C_BAND_CROP;
  const data = new Uint8Array(W * H * 4);

  // Cream body fill
  for (let i = 0; i < W * H; i++) setRgb(data, i * 4, 200, 185, 165);

  // Band rows in frame coords (matches measured quad ± a few px of real fabric).
  const bandY0 = 678;
  const bandY1 = 749;
  const bandX0 = 216;
  const bandXNavyEnd = 600; // open cream pocket x=601..625 inside quad
  const bandX1 = 625;

  for (let fy = bandY0; fy <= bandY1; fy++) {
    for (let fx = bandX0; fx <= bandX1; fx++) {
      const x = fx - ox;
      const y = fy - oy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;

      // Open cream pocket on the far right of the measured quad (Stage 1f guard).
      // Open downward into forearm cream — must NOT be an enclosed hole.
      if (fx >= bandXNavyEnd + 1) {
        setRgb(data, i, 200, 185, 165);
        continue;
      }

      // Dark crease that defeats isNavyPixel (b<45) — x≈279–283.
      if (fx >= 279 && fx <= 283) {
        setRgb(data, i, 2, 6, 17);
        continue;
      }

      // Upper-left bright pinstripe residual (top few rows of the band).
      if (fy <= bandY0 + 2 && fx >= 216 && fx <= 330) {
        setRgb(data, i, 210, 200, 185);
        continue;
      }

      // Occasional thin pinstripe inside left third (breaks naive 4-CC without close).
      if (fx < 420 && fx % 11 === 0 && fy > bandY0 + 2) {
        setRgb(data, i, 205, 195, 175);
        continue;
      }

      // Centre tie/zip wedge — dark low-chroma (may be absorbed into closed band).
      if (fx >= 448 && fx <= 472 && Math.abs(fx - 460) + (fy - ((bandY0 + bandY1) / 2)) * 0.35 < 14) {
        setRgb(data, i, 8, 10, 18);
        continue;
      }

      if (fx < 420) {
        // Shadowed navy — fails isNavyPixel (b<45); admitted by isChestBandCandidate.
        const shade = fx < 286 ? 30 : 28;
        setRgb(data, i, shade, shade + 2, 42 + (fx % 3));
      } else {
        // Lit navy — passes isNavyPixel.
        setRgb(data, i, 28, 32, 95);
      }
    }
  }

  // Cream forearm / sleeve boundary just below the band (must stay unchanged).
  for (let fy = 750; fy < oy + H; fy++) {
    for (let fx = 330; fx <= 380; fx++) {
      const x = fx - ox;
      const y = fy - oy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      setRgb(data, (y * W + x) * 4, 200, 185, 165);
    }
  }

  // Extend open cream pocket downward so close() cannot treat it as a hole.
  for (let fy = bandY1 + 1; fy < Math.min(oy + H, bandY1 + 12); fy++) {
    for (let fx = bandXNavyEnd + 1; fx <= bandX1; fx++) {
      const x = fx - ox;
      const y = fy - oy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      setRgb(data, (y * W + x) * 4, 200, 185, 165);
    }
  }

  return { width: W, height: H, data, originX: ox, originY: oy };
}

/** Embed the crop into a full-frame 720×1280 cream canvas for coverTargetQuad. */
export function embedArchitectureCBandCropInFrame(): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const crop = decodeArchitectureCBandCrop();
  const Wf = ARCHITECTURE_C_BAND_CROP.frameW;
  const Hf = ARCHITECTURE_C_BAND_CROP.frameH;
  const data = new Uint8Array(Wf * Hf * 4);
  for (let i = 0; i < Wf * Hf; i++) {
    setRgb(data, i * 4, 200, 185, 165);
  }
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const si = (y * crop.width + x) * 4;
      const di = ((crop.originY + y) * Wf + (crop.originX + x)) * 4;
      data[di] = crop.data[si]!;
      data[di + 1] = crop.data[si + 1]!;
      data[di + 2] = crop.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  return { width: Wf, height: Hf, data };
}
