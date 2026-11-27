import type { MotionSignature } from "./types.ts";

export type GrayFrame = { width: number; height: number; data: Uint8Array };

const GRID = 16;

function cell(frame: GrayFrame, gx: number, gy: number): number {
  const x0 = Math.floor((gx * frame.width) / GRID);
  const x1 = Math.floor(((gx + 1) * frame.width) / GRID);
  const y0 = Math.floor((gy * frame.height) / GRID);
  const y1 = Math.floor(((gy + 1) * frame.height) / GRID);
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += frame.data[y * frame.width + x] ?? 0;
      count++;
    }
  }
  return count ? sum / count : 0;
}

function grid(frame: GrayFrame, scale = 1, shiftX = 0, shiftY = 0): number[] {
  const values: number[] = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const u = (gx + 0.5) / GRID;
      const v = (gy + 0.5) / GRID;
      const su = 0.5 + (u - 0.5) / scale + shiftX;
      const sv = 0.5 + (v - 0.5) / scale + shiftY;
      const sx = Math.min(GRID - 1, Math.max(0, Math.round(su * GRID - 0.5)));
      const sy = Math.min(GRID - 1, Math.max(0, Math.round(sv * GRID - 0.5)));
      values.push(cell(frame, sx, sy));
    }
  }
  return values;
}

function sad(left: number[], right: number[]): number {
  let total = 0;
  for (let i = 0; i < left.length; i++) total += Math.abs(left[i] - right[i]);
  return total / left.length;
}

function pairShift(previous: GrayFrame, next: GrayFrame): { dx: number; dy: number; zoom: number } {
  const base = grid(previous);
  let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const score = sad(base, grid(next, 1, dx / GRID, dy / GRID));
      if (score < best.score) best = { dx, dy, score };
    }
  }
  const same = sad(base, grid(next, 1, best.dx / GRID, best.dy / GRID));
  const tighter = sad(base, grid(next, 1.18, best.dx / GRID, best.dy / GRID));
  const wider = sad(base, grid(next, 0.86, best.dx / GRID, best.dy / GRID));
  let zoom = 0;
  if (tighter + 1.5 < same && tighter < wider) zoom = 0.7;
  else if (wider + 1.5 < same && wider < tighter) zoom = -0.7;
  return { dx: best.dx, dy: best.dy, zoom };
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Coarse motion from grayscale frames. Positive pan means the picture slid left,
 * which is a camera yaw to the right. This is not a 3D solve.
 */
export function estimateMotion(frames: GrayFrame[]): MotionSignature {
  if (frames.length < 2) {
    return { pan: 0, tilt: 0, dolly: 0, zoom: 0, rise: 0, orbit: 0, roll: 0, shake: 0, lateral: 0 };
  }
  const shifts: { dx: number; dy: number; zoom: number }[] = [];
  for (let i = 1; i < frames.length; i++) shifts.push(pairShift(frames[i - 1], frames[i]));
  const mid = (values: number[]) =>
    values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const dx = mid(shifts.map((shift) => shift.dx));
  const dy = mid(shifts.map((shift) => shift.dy));
  const zoom = mid(shifts.map((shift) => shift.zoom));
  const variance =
    shifts.reduce((sum, shift) => sum + (shift.dx - dx) ** 2 + (shift.dy - dy) ** 2, 0) /
    shifts.length;
  return {
    pan: clamp(-dx / 3),
    tilt: clamp(-dy / 3),
    dolly: 0,
    zoom: clamp(zoom),
    rise: 0,
    orbit: 0,
    roll: 0,
    shake: clamp(Math.sqrt(variance) / 2),
    lateral: 0,
  };
}
