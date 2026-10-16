/**
 * A handheld camera for the composite: a small, smooth, seeded move shared by him and the plate (the camera moves,
 * not either layer), so a take over a still plate stops looking pinned. Pure — the pose at a time is a number of
 * sines; render.ts applies it to each finished frame with a canvas transform.
 *
 * The move is a sum of three sines per channel (a slow drift, a sway, a faint tremor) with seeded phases: it never
 * repeats visibly inside a window, has no jumps, and the same seed gives the same move. The frame is zoomed by an
 * overscan computed from the amplitudes so no edge of the picture ever shows.
 */
import { seededRandom } from "./pixels";

export const CAMERA = {
  version: "handheld-v1-2026-10-16",
  /** Translation amplitude, a fraction of the frame's short side. */
  translate: 0.012,
  /** Rotation amplitude, degrees. */
  rotate: 0.45,
  /** Zoom breathing amplitude, a fraction. */
  breathe: 0.006,
  /** The three sines per channel: hertz and weights (normalised so a channel stays within its amplitude). */
  frequencies: [0.19, 0.43, 1.07],
  weights: [1, 0.5, 0.18],
} as const;

export type CameraSettings = {
  translate: number;
  rotate: number;
  breathe: number;
  frequencies: readonly number[];
  weights: readonly number[];
};

/** Where the camera is at one moment: pixels of shift, radians of roll, the zoom (overscan included). */
export type CameraPose = { dx: number; dy: number; rotate: number; zoom: number };

/** The phases of every sine — 3 per channel for dx, dy, roll, zoom — drawn once from the seed. */
export function cameraPhases(seed: number, n = 12): number[] {
  const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(random() * 2 * Math.PI);
  return out;
}

function sines(t: number, phases: readonly number[], at: number, c: CameraSettings): number {
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < c.frequencies.length; i++) {
    sum += c.weights[i] * Math.sin(2 * Math.PI * c.frequencies[i] * t + phases[at + i]);
    norm += c.weights[i];
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * The zoom that keeps the picture covering the frame through the whole move: enough for the largest shift, the
 * corner's swing at the largest roll, and the smallest breath, with a pixel to spare.
 */
export function cameraOverscan(w: number, h: number, c: CameraSettings = CAMERA): number {
  const short = Math.min(w, h);
  const halfDiag = Math.hypot(w, h) / 2;
  const rot = (c.rotate * Math.PI) / 180;
  // a corner at radius halfDiag swings by about halfDiag·sin(rot); the worst axis is the short one
  const margin = c.translate * short + halfDiag * Math.sin(rot) + 1;
  return (1 + (2 * margin) / short) / (1 - c.breathe);
}

/** The camera at time `t` (seconds from the first frame) for a `w`×`h` frame. */
export function cameraPose(
  seed: number,
  t: number,
  w: number,
  h: number,
  c: CameraSettings = CAMERA,
  phases: readonly number[] = cameraPhases(seed),
): CameraPose {
  const short = Math.min(w, h);
  const k = c.frequencies.length;
  return {
    dx: c.translate * short * sines(t, phases, 0, c),
    dy: c.translate * short * sines(t, phases, k, c),
    rotate: ((c.rotate * Math.PI) / 180) * sines(t, phases, 2 * k, c),
    zoom: cameraOverscan(w, h, c) * (1 + c.breathe * sines(t, phases, 3 * k, c)),
  };
}

/**
 * The canvas transform that draws a `w`×`h` source as the camera sees it: the source scaled by `zoom` and rolled
 * about the frame's centre, then shifted. (`setTransform(a, b, c, d, e, f)` order.)
 */
export function cameraTransform(p: CameraPose, w: number, h: number): [number, number, number, number, number, number] {
  const cos = Math.cos(p.rotate) * p.zoom;
  const sin = Math.sin(p.rotate) * p.zoom;
  const cx = w / 2;
  const cy = h / 2;
  // x' = a·x + c·y + e ; y' = b·x + d·y + f, with the source drawn at (−cx, −cy) so the roll is about the centre
  return [cos, sin, -sin, cos, cx + p.dx, cy + p.dy];
}

/** The source pixel an output pixel of the frame comes from under the pose — the inverse of cameraTransform. */
export function cameraSourcePoint(p: CameraPose, x: number, y: number, w: number, h: number): { x: number; y: number } {
  const cx = w / 2;
  const cy = h / 2;
  const u = x - cx - p.dx;
  const v = y - cy - p.dy;
  const cos = Math.cos(-p.rotate);
  const sin = Math.sin(-p.rotate);
  return { x: (u * cos - v * sin) / p.zoom + cx, y: (u * sin + v * cos) / p.zoom + cy };
}
