import { listMoves } from "./catalog.ts";
import type { CameraMove, MotionKind, MotionSignature } from "./types.ts";

const ZERO: MotionSignature = {
  pan: 0,
  tilt: 0,
  dolly: 0,
  zoom: 0,
  rise: 0,
  orbit: 0,
  roll: 0,
  shake: 0,
  lateral: 0,
};

const BY_KIND: Record<MotionKind, MotionSignature> = {
  locked: { ...ZERO, shake: 0.05 },
  pan: { ...ZERO, pan: 0.9, orbit: 0.1 },
  tilt: { ...ZERO, tilt: 0.9 },
  dolly: { ...ZERO, dolly: 0.9, zoom: 0.1 },
  zoom: { ...ZERO, zoom: 0.9 },
  dolly_zoom: { ...ZERO, dolly: -0.75, zoom: 0.9 },
  crash_zoom: { ...ZERO, zoom: 1 },
  orbit: { ...ZERO, orbit: 0.95, lateral: 0.25 },
  crane: { ...ZERO, rise: 0.9, tilt: 0.3 },
  pedestal: { ...ZERO, rise: 0.7 },
  track: { ...ZERO, lateral: 0.9 },
  follow: { ...ZERO, dolly: 0.45, shake: 0.15 },
  lead: { ...ZERO, dolly: -0.35, shake: 0.1 },
  fpv: { ...ZERO, dolly: 0.7, pan: 0.4, roll: 0.35, shake: 0.55 },
  drone: { ...ZERO, dolly: 0.55, rise: 0.45, orbit: 0.2 },
  handheld: { ...ZERO, shake: 0.85, pan: 0.1 },
  whip: { ...ZERO, pan: 1, shake: 0.25 },
  dutch: { ...ZERO, roll: 0.85 },
  roll: { ...ZERO, roll: 1 },
  pov: { ...ZERO, pan: 0.35, dolly: 0.3, shake: 0.4 },
  rack: { ...ZERO, zoom: 0.15 },
  compound: { ...ZERO, orbit: 0.4, dolly: 0.35, pan: 0.25, rise: 0.2 },
};

function axisSign(hint: string, kind: MotionKind, signature: MotionSignature): MotionSignature {
  const text = hint.toLowerCase();
  const next = { ...signature };
  if (kind === "dolly" && /\b(pull|out|away|reveal)\b/.test(text))
    next.dolly = -Math.abs(next.dolly);
  if (
    (kind === "crane" || kind === "pedestal" || kind === "tilt" || kind === "drone") &&
    /\b(down|dive|fall|drop)\b/.test(text)
  ) {
    next.rise = -Math.abs(next.rise);
    next.tilt = -Math.abs(next.tilt);
  }
  return next;
}

export function signatureFor(move: CameraMove): MotionSignature {
  return axisSign(`${move.name} ${move.numbers} ${move.says}`, move.kind, BY_KIND[move.kind]);
}

export function motionEnergy(signature: MotionSignature): number {
  const values = Object.values(signature);
  return Math.hypot(...values);
}

function cosine(a: MotionSignature, b: MotionSignature): number {
  const left = Object.values(a);
  const right = Object.values(b);
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    aa += left[i] * left[i];
    bb += right[i] * right[i];
  }
  if (aa < 1e-6 || bb < 1e-6) return aa < 1e-6 && bb < 1e-6 ? 1 : 0;
  return dot / Math.sqrt(aa * bb);
}

export type MoveMatch = {
  id: string;
  name: string;
  kind: MotionKind;
  score: number;
  studyOnly: boolean;
};

/**
 * Rank library moves against an estimated signature.
 * A 2D estimate cannot separate an orbit from a pan, or a crane from a tilt.
 * The score is a suggestion for a background plate, not a measured camera solve.
 */
export function matchMoves(signature: MotionSignature, limit = 5): MoveMatch[] {
  const energy = motionEnergy(signature);
  const ranked = listMoves()
    .map((move) => {
      const library = signatureFor(move);
      let score = cosine(signature, library);
      if (energy < 0.18 && move.kind === "locked") score += 0.35;
      return { id: move.id, name: move.name, kind: move.kind, score, studyOnly: move.studyOnly };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked.slice(0, Math.max(1, limit));
}
