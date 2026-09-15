/**
 * 11-point chest still criteria — probe windows and thresholds from Stage 1d–1j
 * forensic scorecards (canonical still 2aa1a44c, 720×1280).
 *
 * Pixel boxes are defined on the reference frame and scaled at evaluate time.
 */

import type { ChestCriterionId, PixelBox } from "./types";

export const CHEST_REF_FRAME = { width: 720, height: 1280 } as const;

/** Canonical measured band quad (Stage 1d–1j). */
export const CANONICAL_BAND_QUAD_NORM: [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] = [
  [0.3, 0.53],
  [0.87, 0.533],
  [0.87, 0.585],
  [0.3, 0.582],
];

/** ChatGPT / 1j target: unfiltered mid-luma ghost ratio inside the quad. */
export const GHOST_RATIO_PASS_CEILING = 0.05;

export const MID_LUMA_MIN = 60;
export const MID_LUMA_MAX = 180;
export const BAND_NAVY_LUMA = 80;
export const CREAM_LUMA = 140;
export const BRIGHT_SKIN_LUMA = 180;
export const PINSTRIPE_REMNANT_MAX = 180;
export const CREASE_MEDIAN_SLACK = 6;
export const GHOST_MEDIAN_SLACK = 20;
export const OUTSIDE_Y_TOP = 600;
export const OUTSIDE_Y_BOTTOM = 800;
export const BAND_MEDIAN_SAMPLE = { x: 450, y: 700 } as const;
export const UNPAINTED_NAVY_MAX_FRAC = 0.05;
export const WORDMARK_NAVY_MIN_FRAC = 0.3;
export const ZIP_CORE_X0 = 418;
export const ZIP_CORE_X1 = 424;

export type ChestCriterionDef = {
  id: ChestCriterionId;
  key: string;
  name: string;
  windows: PixelBox[];
};

export const CHEST_CRITERION_DEFS: ChestCriterionDef[] = [
  {
    id: 1,
    key: "full_band_left_third",
    name: "Full band including left third",
    windows: [{ x0: 216, x1: 285, y0: 678, y1: 749 }],
  },
  {
    id: 2,
    key: "pinstripe_aa_removed",
    name: "Pinstripe + AA removed",
    windows: [
      { x0: 208, x1: 280, y0: 676, y1: 679 },
      { x0: 260, x1: 280, y0: 676, y1: 690 },
    ],
  },
  {
    id: 3,
    key: "crease_removed",
    name: "Crease removed",
    windows: [{ x0: 277, x1: 283, y0: 690, y1: 720 }],
  },
  {
    id: 4,
    key: "cream_preservation",
    name: "Cream-body preservation",
    windows: [{ x0: 280, x1: 330, y0: 673, y1: 676 }],
  },
  {
    id: 5,
    key: "sleeve_forearm",
    name: "Sleeve / forearm preservation",
    windows: [
      { x0: 330, x1: 380, y0: 738, y1: 755 },
      { x0: 389, x1: 392, y0: 746, y1: 748 },
    ],
  },
  {
    id: 6,
    key: "perimeter_right_end",
    name: "Perimeter / right-end protrusion",
    windows: [{ x0: 580, x1: 616, y0: 713, y1: 730 }],
  },
  {
    id: 7,
    key: "wordmark",
    name: "Wordmark present",
    windows: [{ x0: 442, x1: 576, y0: 697, y1: 732 }],
  },
  {
    id: 8,
    key: "centre_single_zip",
    name: "Centre / single zip (tapes absorbed)",
    windows: [
      { x0: 399, x1: 401, y0: 715, y1: 735 },
      { x0: 427, x1: 431, y0: 715, y1: 715 },
    ],
  },
  {
    id: 9,
    key: "no_ghosting",
    name: "No outline ghosting",
    windows: [
      { x0: 255, x1: 345, y0: 696, y1: 712 },
      { x0: 442, x1: 560, y0: 704, y1: 734 },
    ],
  },
  {
    id: 10,
    key: "foreground_occlusion",
    name: "Foreground occlusion (hand / skin)",
    windows: [{ x0: 330, x1: 380, y0: 738, y1: 742 }],
  },
  {
    id: 11,
    key: "outside_region",
    name: "Outside-region preservation",
    windows: [
      { x0: 0, x1: 719, y0: 0, y1: 599 },
      { x0: 0, x1: 719, y0: 800, y1: 1279 },
    ],
  },
];

export const EVIDENCE_CROPS: { id: string; box: PixelBox }[] = [
  { id: "chest_compare", box: { x0: 200, x1: 630, y0: 660, y1: 770 } },
  { id: "pinstripe_topleft", box: { x0: 200, x1: 340, y0: 660, y1: 700 } },
  { id: "crease_lettering", box: { x0: 250, x1: 360, y0: 688, y1: 740 } },
  { id: "right_top_edge", box: { x0: 430, x1: 630, y0: 690, y1: 750 } },
  { id: "sleeve_zip_bottom", box: { x0: 320, x1: 420, y0: 730, y1: 760 } },
  { id: "centre_wedge", box: { x0: 390, x1: 440, y0: 700, y1: 750 } },
];
