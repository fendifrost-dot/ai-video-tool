export const ALTER_MODES = ["swap", "motion", "restyle"] as const;
export type AlterMode = (typeof ALTER_MODES)[number];

/** Checker mode. Recast is a motion-transfer preset that changes who is on screen. */
export const CHECK_MODES = ["swap", "recast", "motion", "restyle"] as const;
export type CheckMode = (typeof CHECK_MODES)[number];

export type AlterPreset = {
  name: string;
  group: string;
  mode: AlterMode;
  opening: "O" | "M" | "R";
  check: CheckMode;
  /** true, false, or "optional" (restyles: add a redrawn first frame only if the draft stays photographic). */
  targetFrame: boolean | "optional";
  change: string;
  fill: Record<string, string>;
  refs: string[];
};

export type GrayFrame = { width: number; height: number; data: Uint8Array };

export type MouthPoint = { x: number; y: number };

/** One frame of the mouth. `openness` is lip gap divided by face width. Points are 0..1 in the frame. */
export type MouthFrame = { openness: number; points?: MouthPoint[] };

export type RgbFrame = { width: number; height: number; data: Uint8Array };
