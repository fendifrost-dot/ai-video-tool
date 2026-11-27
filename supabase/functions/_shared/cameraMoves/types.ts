/** Coarse camera family used for the preview and for matching real footage. */
export const MOTION_KINDS = [
  "locked",
  "pan",
  "tilt",
  "dolly",
  "zoom",
  "dolly_zoom",
  "crash_zoom",
  "orbit",
  "crane",
  "pedestal",
  "track",
  "follow",
  "lead",
  "fpv",
  "drone",
  "handheld",
  "whip",
  "dutch",
  "roll",
  "pov",
  "rack",
  "compound",
] as const;

export type MotionKind = (typeof MOTION_KINDS)[number];

export type CameraMove = {
  id: string;
  name: string;
  /** Letter prefix: CAM, ANG, ACT, OBJ, and the rest. */
  category: string;
  family: string;
  says: string;
  use: string;
  numbers: string;
  avoid: string;
  kind: MotionKind;
  /** Angle studies and locked-off shots the source says not to send as a move. */
  studyOnly: boolean;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  pillBytes: number;
  pillSha256: string;
  poster: string;
  upstreamPath: string;
  upstreamUrl: string;
};

export type CatalogFile = {
  attribution: {
    title: string;
    author: string;
    license: string;
    copyright: string;
    repository: string;
    commit: string;
    notice: string;
  };
  moves: CameraMove[];
};

/** Image-plane camera motion, each axis about -1..1. Positive pan yaws right. */
export type MotionSignature = {
  pan: number;
  tilt: number;
  dolly: number;
  zoom: number;
  rise: number;
  orbit: number;
  roll: number;
  shake: number;
  lateral: number;
};

export type SubjectMode = "environment" | "performance_plate" | "non_performance";

export type Likeness = "face_check" | "put_back";

export const CATEGORY_LABELS: Record<string, string> = {
  ACT: "Action",
  ANG: "Angles",
  CAM: "Camera moves",
  FAM: "Famous shots",
  OBJ: "Objects",
  ONE: "One-takes",
  PRD: "Product",
  SC: "Scenes",
  SHOW: "Showcase",
  STORY: "Stories",
};

export const REFERENCE_BUCKET = "project-references";

/** Where a staged pill clip is stored, under the owner's prefix. */
export function referenceStoragePath(userId: string, projectId: string, moveId: string): string {
  return `${userId}/${projectId}/camera-moves/${moveId}/pill.mp4`;
}
