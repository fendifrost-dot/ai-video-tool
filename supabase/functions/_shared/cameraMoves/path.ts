import type { MotionKind } from "./types.ts";

export type CameraSample = {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  roll: number;
  fov: number;
};

export type Segment = { x1: number; y1: number; x2: number; y2: number; tone: number };

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function ease(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function pullOf(hint: string): number {
  return /\b(pull|out|away|reveal)\b/.test(hint) ? -1 : 1;
}

function downOf(hint: string): number {
  return /\b(down|dive|fall|drop)\b/.test(hint) ? -1 : 1;
}

/** A camera sample at t in 0..1. `hint` is the move name plus its numbers, for in/out and up/down. */
export function sampleMove(kind: MotionKind, t: number, hint = ""): CameraSample {
  const e = ease(t);
  const h = hint.toLowerCase();
  const pull = pullOf(h);
  const down = downOf(h);
  const look = { lookX: 0, lookY: 1.45, lookZ: 0 };
  const wobble = Math.sin(t * Math.PI * 8) * 0.08;
  switch (kind) {
    case "orbit": {
      const a = 0.4 + e * 2.4;
      return {
        x: Math.sin(a) * 6.5,
        y: 1.7 + e * 0.3,
        z: Math.cos(a) * 6.5,
        ...look,
        roll: 0,
        fov: 35,
      };
    }
    case "crane":
      return { x: 0.4, y: 1.6 + down * e * 6, z: 9 - e * 1.5, ...look, roll: 0, fov: 28 };
    case "pedestal":
      return { x: 0, y: 1.2 + down * e * 1.6, z: 5.5, ...look, roll: 0, fov: 40 };
    case "dolly":
      return { x: 0.2, y: 1.6, z: 8 - pull * e * 5, ...look, roll: 0, fov: 40 };
    case "zoom":
      return { x: 0, y: 1.6, z: 7, ...look, roll: 0, fov: 48 - pull * e * 28 };
    case "dolly_zoom":
      return { x: 0, y: 1.6, z: 4.5 + e * 4, ...look, roll: 0, fov: 55 - e * 30 };
    case "crash_zoom":
      return { x: 0, y: 1.6, z: 7, ...look, roll: 0, fov: t < 0.62 ? 46 : 46 - (t - 0.62) * 80 };
    case "pan": {
      const yaw = (e - 0.5) * 0.9;
      return {
        x: 0,
        y: 1.6,
        z: 8,
        lookX: Math.sin(yaw) * 6,
        lookY: 1.45,
        lookZ: -2 + Math.cos(yaw) * 2,
        roll: 0,
        fov: 40,
      };
    }
    case "tilt":
      return {
        x: 0,
        y: 1.6,
        z: 6,
        lookX: 0,
        lookY: 0.4 + down * e * 3.2,
        lookZ: 0,
        roll: 0,
        fov: 40,
      };
    case "track":
      return {
        x: -4 + e * 8,
        y: 1.5,
        z: 6,
        lookX: -2 + e * 4,
        lookY: 1.4,
        lookZ: 0,
        roll: 0,
        fov: 40,
      };
    case "follow":
      return {
        x: 0.3,
        y: 1.5,
        z: 7 - e * 2,
        lookX: 0,
        lookY: 1.4,
        lookZ: -1 - e * 3,
        roll: 0,
        fov: 35,
      };
    case "lead":
      return { x: 0, y: 1.55, z: 3.2 - e * 1.4, lookX: 0, lookY: 1.45, lookZ: 2, roll: 0, fov: 40 };
    case "fpv": {
      const a = t * Math.PI * 2;
      return {
        x: Math.sin(a) * 2.2,
        y: 1.1 + Math.sin(a * 2) * 0.4,
        z: 5 - e * 3,
        lookX: Math.sin(a + 0.4) * 2,
        lookY: 1.2,
        lookZ: -2,
        roll: Math.sin(a) * 0.35,
        fov: 22,
      };
    }
    case "drone":
      return {
        x: Math.sin(e * 1.2) * 4,
        y: 8 - down * e * 6,
        z: 14 - e * 8,
        ...look,
        roll: Math.sin(e * 3) * 0.12,
        fov: 28,
      };
    case "handheld":
      return {
        x: wobble,
        y: 1.55 + wobble * 0.4,
        z: 4.2,
        lookX: wobble * 2,
        lookY: 1.5,
        lookZ: 0,
        roll: wobble * 0.4,
        fov: 38,
      };
    case "whip": {
      const swing = t < 0.45 ? 0 : t < 0.62 ? (t - 0.45) / 0.17 : 1;
      return { x: 0, y: 1.6, z: 7, lookX: -4 + swing * 8, lookY: 1.45, lookZ: 0, roll: 0, fov: 40 };
    }
    case "dutch":
      return { x: 0.4, y: 1.3, z: 5, ...look, roll: 0.15 + e * 0.35, fov: 35 };
    case "roll":
      return { x: 0, y: 1.7, z: 6, ...look, roll: e * Math.PI * 2, fov: 35 };
    case "pov":
      return {
        x: Math.sin(t * 6) * 0.4,
        y: 1.65,
        z: 2 - e * 1.2,
        lookX: Math.sin(t * 4) * 2,
        lookY: 1.5,
        lookZ: -4,
        roll: wobble,
        fov: 32,
      };
    case "rack":
      return {
        x: 0.6,
        y: 1.6,
        z: 5.5,
        lookX: t < 0.5 ? -0.8 : 0.8,
        lookY: 1.4,
        lookZ: 0,
        roll: 0,
        fov: 50,
      };
    case "compound": {
      const a = 0.5 + e * 1.6;
      return {
        x: Math.sin(a) * 5,
        y: 1.8 + e * 1.4,
        z: 8 - e * 3,
        ...look,
        roll: 0,
        fov: 36 - e * 8,
      };
    }
    case "locked":
    default:
      return { x: 0.2, y: 1.6, z: 7, ...look, roll: 0, fov: 35 };
  }
}

type Point = { x: number; y: number; z: number };

function pillAndFloor(): { points: Point[]; tone: number }[][] {
  const lines: { points: Point[]; tone: number }[][] = [];
  const floor: { points: Point[]; tone: number }[] = [];
  for (let i = -4; i <= 4; i++) {
    floor.push({
      points: [
        { x: i * 1.5, y: 0, z: -6 },
        { x: i * 1.5, y: 0, z: 4 },
      ],
      tone: 70,
    });
    floor.push({
      points: [
        { x: -6, y: 0, z: i * 1.2 },
        { x: 6, y: 0, z: i * 1.2 },
      ],
      tone: 70,
    });
  }
  lines.push(floor);
  const capsule: { points: Point[]; tone: number }[] = [];
  const rings = 7;
  for (let r = 0; r < rings; r++) {
    const y = 0.25 + (r / (rings - 1)) * 2;
    const radius = 0.28 + Math.sin((r / (rings - 1)) * Math.PI) * 0.12;
    const pts: Point[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      pts.push({ x: Math.cos(a) * radius, y, z: Math.sin(a) * radius });
    }
    capsule.push({ points: pts, tone: r % 2 === 0 ? 210 : 40 });
  }
  lines.push(capsule);
  return lines;
}

const LINES = pillAndFloor();

function projectPoint(
  sample: CameraSample,
  point: Point,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const fx = sample.lookX - sample.x;
  const fy = sample.lookY - sample.y;
  const fz = sample.lookZ - sample.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl };
  const worldUp = { x: 0, y: 1, z: 0 };
  let rx = worldUp.y * forward.z - worldUp.z * forward.y;
  let ry = worldUp.z * forward.x - worldUp.x * forward.z;
  let rz = worldUp.x * forward.y - worldUp.y * forward.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * forward.z - rz * forward.y;
  const uy = rz * forward.x - rx * forward.z;
  const uz = rx * forward.y - ry * forward.x;
  const vx = point.x - sample.x;
  const vy = point.y - sample.y;
  const vz = point.z - sample.z;
  const camX = vx * rx + vy * ry + vz * rz;
  const camY = vx * ux + vy * uy + vz * uz;
  const camZ = vx * forward.x + vy * forward.y + vz * forward.z;
  if (camZ < 0.15) return null;
  const cos = Math.cos(sample.roll);
  const sin = Math.sin(sample.roll);
  const rolledX = camX * cos - camY * sin;
  const rolledY = camX * sin + camY * cos;
  const focal = height / 2 / Math.tan((sample.fov * Math.PI) / 360);
  return {
    x: width / 2 + (rolledX / camZ) * focal,
    y: height / 2 - (rolledY / camZ) * focal,
  };
}

/** 2D segments for one frame of the blockout preview. No three.js, no network. */
export function previewSegments(
  kind: MotionKind,
  t: number,
  hint: string,
  width: number,
  height: number,
): Segment[] {
  const sample = sampleMove(kind, t, hint);
  const segments: Segment[] = [];
  for (const group of LINES) {
    for (const line of group) {
      let previous: { x: number; y: number } | null = null;
      for (const point of line.points) {
        const next = projectPoint(sample, point, width, height);
        if (previous && next) {
          segments.push({
            x1: previous.x,
            y1: previous.y,
            x2: next.x,
            y2: next.y,
            tone: line.tone,
          });
        }
        previous = next;
      }
    }
  }
  return segments;
}
