/**
 * Product Detail Placement Engine (Vitest mirror).
 *
 * ONE reusable engine that, given a VTON frame and a detail type, returns where
 * a product detail should be placed — as a quad/region/path/point — with a
 * confidence, a fallback reason, a quality warning, and a debug overlay.
 *
 * Placement priority (locked, from the Product Truth directive):
 *   1. manual keyframe placement   (highest trust, used directly)
 *   2. product placement metadata  (SKU bbox/quad from product_truth_json)
 *   3. detection refinement        (HSV/colour region; SAM is a pluggable stub)
 *   4. fallback
 * Low-confidence rule: if the best detection is below threshold AND there is no
 * manual placement AND no metadata → DO NOT GUESS. Return
 * fallbackReason = "requires_manual_keyframe" and set qualityWarning, so a human
 * keyframe can be supplied and then stored in product_truth_json for propagation.
 *
 * The edge engine (supabase/functions/_shared/placementEngine.ts) mirrors this
 * and additionally houses compositeLogoOntoVton (the first engine consumer).
 */

import {
  bandFromNormBbox,
  detectChestBand,
  isNavyPixel,
  type PixelMatch,
  type PixelRect,
  type RgbaImage,
} from "./logoComposite";

// ---------------------------------------------------------------------------
// Detail types + target shapes
// ---------------------------------------------------------------------------

export type DetailType =
  | "logo_zone"
  | "chest_band"
  | "zipper_line"
  | "zipper_pull"
  | "sleeve_panel"
  | "button"
  | "patch";

export const DETAIL_TYPES: DetailType[] = [
  "logo_zone",
  "chest_band",
  "zipper_line",
  "zipper_pull",
  "sleeve_panel",
  "button",
  "patch",
];

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

export type PlacementTarget =
  | { kind: "quad"; points: Quad }
  | { kind: "region"; rect: PixelRect }
  | { kind: "path"; points: Point[] }
  | { kind: "point"; point: Point };

export type PlacementSource = "manual_keyframe" | "metadata" | "detection" | "fallback" | "none";

export type FallbackReason =
  | ""
  | "manual_keyframe"
  | "metadata_placement"
  | "detection_refined"
  | "low_detection_confidence"
  | "requires_manual_keyframe"
  | "no_strategy";

export type DetectionResult = { target: PlacementTarget; confidence: number } | null;

// ---------------------------------------------------------------------------
// product_truth_json schema additions
// ---------------------------------------------------------------------------

/** HSV ranges: h 0–360 (wrap-aware), s/v 0–1. */
export type HsvRange = {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
};
export type ColorProfile = { name?: string; hsv: HsvRange };

/** Four normalized corner points (TL, TR, BR, BL) in [0,1] VTON space. */
export type QuadNorm = [[number, number], [number, number], [number, number], [number, number]];

/** Manual keyframe entries keyed by keyframe id ("default" for a single still). */
export type ManualKeyframeMap = Record<string, { target_quad_norm: QuadNorm }>;

export type DetailPlacementSpec = {
  detail_type: DetailType;
  /** SKU placement bbox on the flat ref (normalized x,y,w,h). */
  source_bbox_norm?: [number, number, number, number] | null;
  /** Optional manual target quad in VTON space (normalized points). */
  target_quad_norm?: QuadNorm | null;
  /** Manual keyframe placements (priority 1), keyed by keyframe id / "default". */
  manual_keyframe?: ManualKeyframeMap | null;
  placement_hint?: string | null;
  /** Colour profile for HSV detection (navy band, gold zipper, …). */
  color_profile?: ColorProfile | null;
  min_confidence?: number | null;
};

export type ManualKeyframePlacement = {
  keyframe_id: string;
  detail_type: DetailType;
  target: PlacementTarget;
  created_at?: string | null;
};

export type ProductTruth = {
  version: number;
  details?: Partial<Record<DetailType, DetailPlacementSpec>>;
  /** Typed slot consumed by the (later) zipper recolor stage — not used now. */
  zipper_color_profile?: ColorProfile | null;
  /** Manual placements keyed by keyframe id, for propagation to nearby frames. */
  manual_keyframes?: ManualKeyframePlacement[];
};

export function emptyProductTruth(): ProductTruth {
  return { version: 1, details: {}, zipper_color_profile: null, manual_keyframes: [] };
}

/** Store a manual keyframe placement (replacing any existing one for the same
 *  keyframe id + detail type). Returns a new ProductTruth — for propagation. */
export function upsertManualKeyframe(
  truth: ProductTruth | null | undefined,
  kf: ManualKeyframePlacement,
): ProductTruth {
  const base = truth ?? emptyProductTruth();
  const kept = (base.manual_keyframes ?? []).filter(
    (k) => !(k.keyframe_id === kf.keyframe_id && k.detail_type === kf.detail_type),
  );
  return { ...base, version: base.version ?? 1, manual_keyframes: [...kept, kf] };
}

export function manualKeyframeFor(
  truth: ProductTruth | null | undefined,
  detailType: DetailType,
  keyframeId: string | null | undefined,
): ManualKeyframePlacement | null {
  if (!truth || !keyframeId) return null;
  return (
    (truth.manual_keyframes ?? []).find(
      (k) => k.keyframe_id === keyframeId && k.detail_type === detailType,
    ) ?? null
  );
}

function isQuadNorm(v: unknown): v is QuadNorm {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1),
    )
  );
}

/**
 * Lenient parser for the product_truth_json blob stored on product/wardrobe
 * metadata. Tolerant of partial/legacy shapes — only the fields the engine reads
 * are extracted (per-detail specs incl. manual_keyframe quads). Returns null for
 * an unusable blob.
 */
export function parseProductTruth(raw: unknown): ProductTruth | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: ProductTruth = { version: typeof o.version === "number" ? o.version : 1, details: {} };
  const detailsRaw = o.details;
  if (detailsRaw && typeof detailsRaw === "object") {
    for (const [key, value] of Object.entries(detailsRaw as Record<string, unknown>)) {
      if (!DETAIL_TYPES.includes(key as DetailType) || !value || typeof value !== "object") continue;
      const dv = value as Record<string, unknown>;
      const spec: DetailPlacementSpec = { detail_type: key as DetailType };
      if (Array.isArray(dv.source_bbox_norm) && dv.source_bbox_norm.length === 4) {
        spec.source_bbox_norm = dv.source_bbox_norm.map(Number) as [number, number, number, number];
      }
      if (isQuadNorm(dv.target_quad_norm)) spec.target_quad_norm = dv.target_quad_norm;
      if (dv.manual_keyframe && typeof dv.manual_keyframe === "object") {
        const mkf: ManualKeyframeMap = {};
        for (const [kfId, entry] of Object.entries(dv.manual_keyframe as Record<string, unknown>)) {
          const e = entry as Record<string, unknown> | null;
          if (e && isQuadNorm(e.target_quad_norm)) mkf[kfId] = { target_quad_norm: e.target_quad_norm };
        }
        if (Object.keys(mkf).length > 0) spec.manual_keyframe = mkf;
      }
      if (typeof dv.min_confidence === "number") spec.min_confidence = dv.min_confidence;
      out.details![key as DetailType] = spec;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function quadFromRect(rect: PixelRect): Quad {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
}

export function rectFromTarget(target: PlacementTarget): PixelRect {
  if (target.kind === "region") return target.rect;
  const pts =
    target.kind === "quad"
      ? target.points
      : target.kind === "path"
        ? target.points
        : [target.point];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of pts) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { left, top, right, bottom };
}

function quadFromNorm(
  img: RgbaImage,
  q: [[number, number], [number, number], [number, number], [number, number]],
): Quad {
  return q.map(([nx, ny]) => ({
    x: Math.round(nx * img.width),
    y: Math.round(ny * img.height),
  })) as Quad;
}

// ---------------------------------------------------------------------------
// HSV colour primitives + detectors
// ---------------------------------------------------------------------------

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/** True when (r,g,b) falls inside the profile's HSV ranges (hue is wrap-aware). */
export function colorMatchesProfile(r: number, g: number, b: number, profile: ColorProfile): boolean {
  const { h, s, v } = rgbToHsv(r, g, b);
  const { hMin, hMax, sMin, sMax, vMin, vMax } = profile.hsv;
  if (s < sMin || s > sMax || v < vMin || v > vMax) return false;
  return hMin <= hMax ? h >= hMin && h <= hMax : h >= hMin || h <= hMax; // wrap
}

export function profileMatcher(profile: ColorProfile): PixelMatch {
  return (r, g, b) => colorMatchesProfile(r, g, b, profile);
}

/** Navy chest stripe (matches the RGB isNavyPixel primitive in HSV terms). */
export const NAVY_PROFILE: ColorProfile = {
  name: "navy",
  hsv: { hMin: 200, hMax: 260, sMin: 0.25, sMax: 1, vMin: 0.12, vMax: 0.55 },
};
/** Gold / brass zipper hardware (warm hue, mid-high value). */
export const GOLD_PROFILE: ColorProfile = {
  name: "gold",
  hsv: { hMin: 35, hMax: 60, sMin: 0.25, sMax: 1, vMin: 0.45, vMax: 1 },
};

// ---------------------------------------------------------------------------
// Detection strategies (registry)
// ---------------------------------------------------------------------------

export type DetectContext = {
  anchorXNorm?: number | null;
  colorProfile?: ColorProfile | null;
  spec?: DetailPlacementSpec | null;
};

export type DetectStrategy = (frame: RgbaImage, ctx: DetectContext) => DetectionResult;

/** logo_zone: reuse the proven navy band detector, returned as an axis quad. */
function detectLogoZone(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const band = detectChestBand(frame, ctx.anchorXNorm, isNavyPixel);
  if (!band) return null;
  return { target: { kind: "quad", points: quadFromRect(band) }, confidence: band.confidence };
}

/** chest_band: the SAME band detector driven by an HSV colour profile (general
 *  across colours), returned as a region. */
function detectChestBandRegion(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const profile = ctx.colorProfile ?? NAVY_PROFILE;
  const band = detectChestBand(frame, ctx.anchorXNorm, profileMatcher(profile));
  if (!band) return null;
  return {
    target: { kind: "region", rect: { left: band.left, top: band.top, right: band.right, bottom: band.bottom } },
    confidence: band.confidence,
  };
}

/** zipper_line: find the vertical run of gold/specular hardware and fit a path
 *  down its median-x per scanned row. Simple but functional; confidence from
 *  vertical coverage. No zipper compositing is built here. */
function detectZipperLine(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const profile = ctx.colorProfile ?? GOLD_PROFILE;
  const match = profileMatcher(profile);
  const { width, height, data } = frame;
  const y0 = Math.floor(height * 0.18);
  const y1 = Math.floor(height * 0.95);
  const points: Point[] = [];
  let hitRows = 0;
  for (let y = y0; y < y1; y += Math.max(1, Math.floor(height / 200))) {
    let sx = 0;
    let n = 0;
    for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x++) {
      const i = (y * width + x) * 4;
      if (match(data[i], data[i + 1], data[i + 2])) {
        sx += x;
        n++;
      }
    }
    if (n > 0) {
      points.push({ x: Math.round(sx / n), y });
      hitRows++;
    }
  }
  if (points.length < 2) return null;
  const scanned = Math.max(1, Math.floor((y1 - y0) / Math.max(1, Math.floor(height / 200))));
  const confidence = Math.max(0, Math.min(1, hitRows / scanned));
  return { target: { kind: "path", points }, confidence };
}

/** zipper_pull: densest gold cluster → bounding quad (the pull tab). */
function detectZipperPull(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const profile = ctx.colorProfile ?? GOLD_PROFILE;
  const match = profileMatcher(profile);
  const { width, height, data } = frame;
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!match(data[i], data[i + 1], data[i + 2])) continue;
      n++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (n === 0 || right <= left || bottom <= top) return null;
  // A pull is a compact blob: confidence from fill density within its bbox.
  const density = n / Math.max(1, (right - left) * (bottom - top));
  const confidence = Math.max(0, Math.min(1, density));
  return {
    target: { kind: "quad", points: quadFromRect({ left, top, right: right + 1, bottom: bottom + 1 }) },
    confidence,
  };
}

/** Typed stub for detail types whose detection is not implemented yet. The
 *  registry is real; these return null so placeDetail uses metadata or asks for
 *  a manual keyframe rather than guessing. */
function detectStub(_frame: RgbaImage, _ctx: DetectContext): DetectionResult {
  return null;
}

export const DETECTION_REGISTRY: Record<DetailType, DetectStrategy> = {
  logo_zone: detectLogoZone,
  chest_band: detectChestBandRegion,
  zipper_line: detectZipperLine,
  zipper_pull: detectZipperPull,
  sleeve_panel: detectStub,
  button: detectStub,
  patch: detectStub,
};

/** Pluggable SAM-3 (or any external) detector interface. Not wired now; when a
 *  precomputed DetectionResult is passed via input.detection it is preferred. */
export type SamDetector = (frame: RgbaImage, detailType: DetailType) => DetectionResult;

// ---------------------------------------------------------------------------
// Debug overlay
// ---------------------------------------------------------------------------

const OVERLAY_COLOR: [number, number, number] = [255, 0, 200];

function setPx(img: RgbaImage, x: number, y: number, c: [number, number, number]) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = 255;
}

function drawLine(img: RgbaImage, a: Point, b: Point, c: [number, number, number]) {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < dx + dy + 4; guard++) {
    setPx(img, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Return a copy of the frame with the target region/quad/path drawn, for QA. */
export function drawDebugOverlay(frame: RgbaImage, target: PlacementTarget | null): RgbaImage {
  const out: RgbaImage = {
    width: frame.width,
    height: frame.height,
    data: new Uint8Array(frame.data),
  };
  if (!target) return out;
  if (target.kind === "region" || target.kind === "quad") {
    const quad = target.kind === "quad" ? target.points : quadFromRect(target.rect);
    for (let k = 0; k < 4; k++) drawLine(out, quad[k], quad[(k + 1) % 4], OVERLAY_COLOR);
  } else if (target.kind === "path") {
    for (let k = 0; k < target.points.length - 1; k++) {
      drawLine(out, target.points[k], target.points[k + 1], OVERLAY_COLOR);
    }
  } else {
    const p = target.point;
    for (let d = -3; d <= 3; d++) {
      setPx(out, p.x + d, p.y, OVERLAY_COLOR);
      setPx(out, p.x, p.y + d, OVERLAY_COLOR);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// placeDetail — the engine entry point
// ---------------------------------------------------------------------------

export const DEFAULT_MIN_CONFIDENCE = 0.5;

export type DetailRefs = { front?: RgbaImage | null; detail?: RgbaImage | null } | null;

export type PlaceDetailInput = {
  frame: RgbaImage;
  detailType: DetailType;
  productTruth?: ProductTruth | null;
  refs?: DetailRefs;
  manualPlacement?: PlacementTarget | null;
  manualKeyframeId?: string | null;
  /** Precomputed detection (e.g. SAM-3) — preferred over the built-in strategy. */
  detection?: DetectionResult;
  anchorXNorm?: number | null;
  minConfidence?: number | null;
};

export type PlaceDetailResult = {
  detailType: DetailType;
  target: PlacementTarget | null;
  confidence: number;
  source: PlacementSource;
  fallbackReason: FallbackReason;
  qualityWarning: boolean;
  qualityDetail: string;
  debugOverlay: RgbaImage;
};

function specFor(truth: ProductTruth | null | undefined, detailType: DetailType): DetailPlacementSpec | null {
  return truth?.details?.[detailType] ?? null;
}

const ZIPPER_DETAIL_TYPES: DetailType[] = ["zipper_line", "zipper_pull"];

/** Resolve the colour profile for detection: the per-detail spec wins, then —
 *  for zipper detail types — the shared product_truth_json zipper_color_profile
 *  slot. This is the clean extension point the zipper detail types plug into. */
function resolveColorProfile(
  detailType: DetailType,
  spec: DetailPlacementSpec | null,
  truth: ProductTruth | null | undefined,
): ColorProfile | null {
  if (spec?.color_profile) return spec.color_profile;
  if (ZIPPER_DETAIL_TYPES.includes(detailType)) return truth?.zipper_color_profile ?? null;
  return null;
}

/** Resolve a manual quad from the per-detail manual_keyframe map (by id then
 *  "default") as a quad PlacementTarget, or null. */
function manualQuadFromSpec(
  frame: RgbaImage,
  spec: DetailPlacementSpec | null,
  keyframeId?: string | null,
): PlacementTarget | null {
  const mkf = spec?.manual_keyframe;
  if (!mkf) return null;
  const entry = (keyframeId && mkf[keyframeId]) || mkf["default"] || null;
  if (!entry?.target_quad_norm) return null;
  return { kind: "quad", points: quadFromNorm(frame, entry.target_quad_norm) };
}

function metadataTarget(
  frame: RgbaImage,
  spec: DetailPlacementSpec | null,
): PlacementTarget | null {
  if (!spec) return null;
  if (spec.target_quad_norm) {
    return { kind: "quad", points: quadFromNorm(frame, spec.target_quad_norm) };
  }
  if (spec.source_bbox_norm) {
    return { kind: "region", rect: bandFromNormBbox(frame, spec.source_bbox_norm) };
  }
  return null;
}

function finish(
  detailType: DetailType,
  frame: RgbaImage,
  target: PlacementTarget | null,
  confidence: number,
  source: PlacementSource,
  fallbackReason: FallbackReason,
  qualityWarning: boolean,
  qualityDetail: string,
): PlaceDetailResult {
  return {
    detailType,
    target,
    confidence,
    source,
    fallbackReason,
    qualityWarning,
    qualityDetail,
    debugOverlay: drawDebugOverlay(frame, target),
  };
}

/**
 * Resolve where a product detail should be placed on a VTON frame, honouring the
 * locked priority manual → metadata → detection → fallback. Always returns a
 * target (or null with requires_manual_keyframe), a confidence, a fallback
 * reason, a quality warning, and a debug overlay.
 */
export function placeDetail(input: PlaceDetailInput): PlaceDetailResult {
  const { frame, detailType } = input;
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const spec = specFor(input.productTruth, detailType);

  // 1) Manual keyframe (priority 1): explicit override, then the per-detail
  // manual_keyframe map (by id or "default"), then the manual_keyframes array.
  const manual =
    input.manualPlacement ??
    manualQuadFromSpec(frame, spec, input.manualKeyframeId) ??
    manualKeyframeFor(input.productTruth, detailType, input.manualKeyframeId)?.target ??
    null;
  if (manual) {
    return finish(detailType, frame, manual, 1, "manual_keyframe", "", false, "manual keyframe placement");
  }

  // Run detection (precomputed override wins, e.g. SAM-3).
  const ctx: DetectContext = {
    anchorXNorm: input.anchorXNorm,
    colorProfile: resolveColorProfile(detailType, spec, input.productTruth),
    spec,
  };
  const det = input.detection ?? DETECTION_REGISTRY[detailType](frame, ctx);
  const meta = metadataTarget(frame, spec);
  const threshold = spec?.min_confidence ?? minConfidence;

  // 2/3) Confident detection refines/overrides metadata.
  if (det && det.confidence >= threshold) {
    const reason: FallbackReason = meta ? "detection_refined" : "";
    return finish(detailType, frame, det.target, det.confidence, "detection", reason, false, "detected");
  }

  // 2) Metadata placement (SKU truth) — used even when detection is weak.
  if (meta) {
    const conf = det?.confidence ?? 0;
    const warn = !det || det.confidence < threshold;
    return finish(
      detailType,
      frame,
      meta,
      conf,
      "metadata",
      "metadata_placement",
      warn,
      warn ? "low detection confidence; used SKU placement metadata" : "used SKU placement metadata",
    );
  }

  // 4) No manual, no metadata, weak/no detection → do NOT guess.
  return finish(
    detailType,
    frame,
    null,
    det?.confidence ?? 0,
    det ? "fallback" : "none",
    "requires_manual_keyframe",
    true,
    "no confident detection and no SKU placement; a manual keyframe is required",
  );
}
