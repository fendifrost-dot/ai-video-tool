import type { CoverAspect, FlightArrow, FlightGuides, PathKind, Point } from "./types";

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function classifyCoverAspect(width: number, height: number): CoverAspect {
  if (!(width > 0) || !(height > 0)) return "square";
  const ratio = width / height;
  if (ratio >= 1.15) return "wide";
  if (ratio <= 0.87) return "tall";
  return "square";
}

/**
 * Rule of thumb from the flight guide:
 *   wide cover → horizontal path; square → circle loop or diagonal.
 */
export function suggestPathKind(aspect: CoverAspect): PathKind {
  if (aspect === "wide" || aspect === "tall") return "horizontal";
  return "circle";
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += dist(points[i - 1], points[i]);
  }
  return len;
}

/** Sample a point at fraction t along the polyline (0 = start, 1 = end). */
export function pointAt(points: Point[], t: number): Point | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const target = clamp01(t) * pathLength(points);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (walked + seg >= target || i === points.length - 1) {
      const remain = seg === 0 ? 0 : (target - walked) / seg;
      const u = clamp01(remain);
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * u,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * u,
      };
    }
    walked += seg;
  }
  return points[points.length - 1];
}

/** Screen-space tangent angle at fraction t (radians, 0 = right). */
export function tangentAt(points: Point[], t: number): number {
  if (points.length < 2) return 0;
  const p0 = pointAt(points, Math.max(0, t - 0.02));
  const p1 = pointAt(points, Math.min(1, t + 0.02));
  if (!p0 || !p1) return 0;
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * Downsample a freehand stroke so consecutive points are at least `minDist`
 * apart (normalized). Always keeps the first and last samples.
 */
export function simplifyPath(points: Point[], minDist = 0.008): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (dist(out[out.length - 1], points[i]) >= minDist) {
      out.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > 0) out.push(last);
  return out;
}

export function quadrantLabel(p: Point): string {
  const x = p.x < 0.33 ? "left" : p.x > 0.66 ? "right" : "center";
  const y = p.y < 0.33 ? "top" : p.y > 0.66 ? "bottom" : "middle";
  if (x === "center" && y === "middle") return "center";
  return `${y} ${x}`;
}

/**
 * Signed turning of consecutive segments, using heading change rather than
 * raw cross product (short chords on a large loop would otherwise look
 * "straight"). Positive = clockwise in screen space (y grows downward).
 */
export function turningHint(points: Point[]): string {
  if (points.length < 3) return "straight";
  let signed = 0;
  let abs = 0;
  for (let i = 2; i < points.length; i++) {
    const ax = points[i - 1].x - points[i - 2].x;
    const ay = points[i - 1].y - points[i - 2].y;
    const bx = points[i].x - points[i - 1].x;
    const by = points[i].y - points[i - 1].y;
    const aLen = Math.hypot(ax, ay);
    const bLen = Math.hypot(bx, by);
    if (aLen < 1e-8 || bLen < 1e-8) continue;
    const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    signed += angle;
    abs += Math.abs(angle);
  }
  if (abs < 0.35) return "straight";
  const ratio = signed / abs;
  if (Math.abs(ratio) < 0.35) return "S-curve";
  return signed > 0 ? "clockwise curve" : "counterclockwise curve";
}

/**
 * Auto-fill for the [INSERT PATH] block from geometry. Users should still
 * name key cover elements (subject, type, collage panels) when they matter.
 */
export function describeFlightPath(points: Point[], options?: { keyElements?: string }): string {
  if (points.length < 2) return "";
  const start = quadrantLabel(points[0]);
  const end = quadrantLabel(points[points.length - 1]);
  const turn = turningHint(points);
  const mid = pointAt(points, 0.5);
  const midLabel = mid ? quadrantLabel(mid) : "the main subject";
  const landmarks = options?.keyElements?.trim();
  const via = landmarks
    ? `past ${landmarks}`
    : `past the artwork's main subject near the ${midLabel}`;
  return `Start at the ${start} of the cover → ${turn} ${via} → Endpoint at the ${end}`;
}

export function buildPresetPath(kind: PathKind): Point[] {
  if (kind === "horizontal") {
    const points: Point[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      points.push({
        x: 0.08 + t * 0.84,
        y: 0.5 + Math.sin(t * Math.PI) * 0.06,
      });
    }
    return points;
  }
  if (kind === "diagonal") {
    const points: Point[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      points.push({
        x: 0.12 + t * 0.76,
        y: 0.14 + t * 0.72 + Math.sin(t * Math.PI) * 0.04,
      });
    }
    return points;
  }
  // Circle / loop — square-cover default.
  const points: Point[] = [];
  const cx = 0.5;
  const cy = 0.5;
  const rx = 0.32;
  const ry = 0.32;
  for (let i = 0; i <= 48; i++) {
    const theta = -Math.PI / 2 + (i / 48) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(theta) * rx,
      y: cy + Math.sin(theta) * ry,
    });
  }
  return points;
}

/** Place 3 viewing arrows (start → middle → end) along the path, pointing along travel. */
export function placePresetArrows(points: Point[]): FlightArrow[] {
  if (points.length < 2) return [];
  return [0.08, 0.5, 0.92].map((t) => {
    const p = pointAt(points, t) ?? points[0];
    return { x: p.x, y: p.y, angle: tangentAt(points, t) };
  });
}

export function buildPresetGuides(kind: PathKind): FlightGuides {
  const path = buildPresetPath(kind);
  return { path, arrows: placePresetArrows(path) };
}

export function nearestPathT(points: Point[], p: Point): number {
  if (points.length < 2) return 0;
  const total = pathLength(points);
  if (total === 0) return 0;
  let bestT = 0;
  let bestD = Infinity;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = dist(a, b);
    const samples = Math.max(2, Math.ceil(seg / 0.02));
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        bestT = total === 0 ? 0 : (walked + seg * u) / total;
      }
    }
    walked += seg;
  }
  return clamp01(bestT);
}

export const MIN_PATH_LENGTH = 0.18;
export const RECOMMENDED_ARROW_COUNT = { min: 2, max: 3 } as const;

export function validateFlightGuides(guides: FlightGuides): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (guides.path.length < 2) {
    issues.push("Draw one continuous red flight line.");
  } else if (pathLength(guides.path) < MIN_PATH_LENGTH) {
    issues.push("The red line is too short — extend the route across the cover.");
  }
  const n = guides.arrows.length;
  if (n === 0) {
    issues.push("Add 2–3 white arrows along the line for camera viewing direction.");
  } else if (n === 1) {
    issues.push("Add at least one more white arrow (start → middle → end).");
  } else if (n > RECOMMENDED_ARROW_COUNT.max) {
    issues.push("Use at most 3 white arrows — extras confuse the model.");
  }
  return { ok: issues.length === 0, issues };
}
