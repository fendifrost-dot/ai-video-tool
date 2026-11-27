export const ALTER_MODES = ["swap", "motion", "restyle"] as const;
export type AlterMode = (typeof ALTER_MODES)[number];

/** Checker mode. Recast is a motion-transfer preset that changes who is on screen. */
/** Action is AVT's own: something new happens in the take (a second person, a block) while the performer keeps his performance. */
export const CHECK_MODES = ["swap", "recast", "motion", "restyle", "action"] as const;
export type CheckMode = (typeof CHECK_MODES)[number];

export type AlterPreset = {
  name: string;
  group: string;
  mode: AlterMode;
  opening: "O" | "M" | "R" | "A";
  check: CheckMode;
  /** true, false, or "optional" (restyles: add a redrawn first frame only if the draft stays photographic). */
  targetFrame: boolean | "optional";
  change: string;
  fill: Record<string, string>;
  refs: string[];
};

export type GrayFrame = { width: number; height: number; data: Uint8Array };

export type MouthPoint = { x: number; y: number };

/**
 * One frame of the mouth. `openness` is lip gap divided by face width. `points` are his lip landmarks in FACE
 * coordinates (origin mid-face, one unit = the face width; scripts/alter/track_mouth.py writes them), so a distance
 * between two frames' points is a mouth-shape error in face widths. `found: false` = no face on that frame.
 */
export type MouthFrame = { openness: number; points?: MouthPoint[]; found?: boolean };

export type RgbFrame = { width: number; height: number; data: Uint8Array };
