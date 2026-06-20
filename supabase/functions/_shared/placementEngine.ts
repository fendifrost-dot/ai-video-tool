/**
 * Product Detail Placement Engine (Deno edge).
 *
 * ONE reusable engine: given a VTON frame and a detail type, return where a
 * product detail should be placed (quad/region/path/point) with a confidence,
 * fallback reason, quality warning, and debug overlay. Mirrors
 * src/lib/garment/placementEngine.ts; this edge copy additionally houses
 * compositeLogoOntoVton — the first engine consumer (logo_zone).
 *
 * Placement priority (locked): manual keyframe → metadata (SKU bbox/quad) →
 * detection (HSV; SAM pluggable stub) → fallback. Low-confidence rule: weak
 * detection AND no manual AND no metadata → fallbackReason
 * "requires_manual_keyframe" (no guess); a later manual keyframe is stored in
 * product_truth_json for propagation.
 */

import {
  alphaComposite,
  bandFromNormBbox,
  coverTargetOnBand,
  decodeToRgba,
  coverTargetQuad,
  detectChestBand,
  encodePng,
  isNavyPixel,
  keyGlyphForeground,
  logoQuality,
  targetRectForLogo,
  warpQuadAlpha,
  type LogoPlacement,
  type LogoQuality,
  type PixelMatch,
  type PixelRect,
  type QuadPts,
  type RgbaImage,
} from "./logoComposite.ts";

const MIN_STRIPE_CONFIDENCE = 0.5;

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

export type HsvRange = {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
};
export type ColorProfile = { name?: string; hsv: HsvRange };

export type QuadNorm = [[number, number], [number, number], [number, number], [number, number]];
export type ManualKeyframeMap = Record<string, { target_quad_norm: QuadNorm }>;

export type DetailPlacementSpec = {
  detail_type: DetailType;
  source_bbox_norm?: [number, number, number, number] | null;
  target_quad_norm?: QuadNorm | null;
  /** Manual keyframe placements (priority 1), keyed by keyframe id / "default". */
  manual_keyframe?: ManualKeyframeMap | null;
  placement_hint?: string | null;
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
  zipper_color_profile?: ColorProfile | null;
  manual_keyframes?: ManualKeyframePlacement[];
};

export function emptyProductTruth(): ProductTruth {
  return { version: 1, details: {}, zipper_color_profile: null, manual_keyframes: [] };
}

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
 * metadata. Extracts only the fields the engine reads (per-detail specs incl.
 * manual_keyframe quads). Returns null for an unusable blob.
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

function quadNormFromBbox(
  b: [number, number, number, number],
): [[number, number], [number, number], [number, number], [number, number]] {
  const [x, y, w, h] = b;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
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

export function colorMatchesProfile(r: number, g: number, b: number, profile: ColorProfile): boolean {
  const { h, s, v } = rgbToHsv(r, g, b);
  const { hMin, hMax, sMin, sMax, vMin, vMax } = profile.hsv;
  if (s < sMin || s > sMax || v < vMin || v > vMax) return false;
  return hMin <= hMax ? h >= hMin && h <= hMax : h >= hMin || h <= hMax;
}

export function profileMatcher(profile: ColorProfile): PixelMatch {
  return (r, g, b) => colorMatchesProfile(r, g, b, profile);
}

export const NAVY_PROFILE: ColorProfile = {
  name: "navy",
  hsv: { hMin: 200, hMax: 260, sMin: 0.25, sMax: 1, vMin: 0.12, vMax: 0.55 },
};
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

function detectLogoZone(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const band = detectChestBand(frame, ctx.anchorXNorm, isNavyPixel);
  if (!band) return null;
  return { target: { kind: "quad", points: quadFromRect(band) }, confidence: band.confidence };
}

function detectChestBandRegion(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const profile = ctx.colorProfile ?? NAVY_PROFILE;
  const band = detectChestBand(frame, ctx.anchorXNorm, profileMatcher(profile));
  if (!band) return null;
  return {
    target: { kind: "region", rect: { left: band.left, top: band.top, right: band.right, bottom: band.bottom } },
    confidence: band.confidence,
  };
}

function detectZipperLine(frame: RgbaImage, ctx: DetectContext): DetectionResult {
  const profile = ctx.colorProfile ?? GOLD_PROFILE;
  const match = profileMatcher(profile);
  const { width, height, data } = frame;
  const y0 = Math.floor(height * 0.18);
  const y1 = Math.floor(height * 0.95);
  const step = Math.max(1, Math.floor(height / 200));
  const points: Point[] = [];
  let hitRows = 0;
  for (let y = y0; y < y1; y += step) {
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
  const scanned = Math.max(1, Math.floor((y1 - y0) / step));
  const confidence = Math.max(0, Math.min(1, hitRows / scanned));
  return { target: { kind: "path", points }, confidence };
}

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
  const density = n / Math.max(1, (right - left) * (bottom - top));
  const confidence = Math.max(0, Math.min(1, density));
  return {
    target: { kind: "quad", points: quadFromRect({ left, top, right: right + 1, bottom: bottom + 1 }) },
    confidence,
  };
}

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

function metadataTarget(frame: RgbaImage, spec: DetailPlacementSpec | null): PlacementTarget | null {
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

export function placeDetail(input: PlaceDetailInput): PlaceDetailResult {
  const { frame, detailType } = input;
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const spec = specFor(input.productTruth, detailType);

  const manual =
    input.manualPlacement ??
    manualQuadFromSpec(frame, spec, input.manualKeyframeId) ??
    manualKeyframeFor(input.productTruth, detailType, input.manualKeyframeId)?.target ??
    null;
  if (manual) {
    return finish(detailType, frame, manual, 1, "manual_keyframe", "", false, "manual keyframe placement");
  }

  const ctx: DetectContext = {
    anchorXNorm: input.anchorXNorm,
    colorProfile: resolveColorProfile(detailType, spec, input.productTruth),
    spec,
  };
  const det = input.detection ?? DETECTION_REGISTRY[detailType](frame, ctx);
  const meta = metadataTarget(frame, spec);
  const threshold = spec?.min_confidence ?? minConfidence;

  if (det && det.confidence >= threshold) {
    const reason: FallbackReason = meta ? "detection_refined" : "";
    return finish(detailType, frame, det.target, det.confidence, "detection", reason, false, "detected");
  }

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

// ---------------------------------------------------------------------------
// Logo composite — first engine consumer (detailType logo_zone)
// ---------------------------------------------------------------------------

export type LogoCompositeResult = {
  bytes: Uint8Array;
  method: "bbox_affine_alpha_blend" | "perspective_quad_warp";
  warp_mode: "affine" | "perspective";
  band: PixelRect;
  target: PixelRect;
  /** Resolved 4-corner target quad (pixel coords, TL,TR,BR,BL). */
  target_quad: [number, number][];
  logo_source: "asset" | "front_crop";
  quality: LogoQuality;
  placement_source: PlacementSource;
  fallback_reason: FallbackReason;
  placement_confidence: number;
  debug_overlay_bytes: Uint8Array | null;
};

function quadToPairs(q: Quad): [number, number][] {
  return q.map((p) => [p.x, p.y]) as [number, number][];
}

/**
 * Composite the brand wordmark onto a VTON frame by asking the placement engine
 * for the logo_zone (manual keyframe quad → manual target_bbox → SKU source_bbox
 * → navy stripe detection → fallback), then rendering the keyed/asset logo there.
 * A manual quad uses a perspective (inverse-mapped bilinear) warp so the wordmark
 * follows a diagonal/curved stripe; everything else uses the axis-aligned affine
 * path (bit-exact with the prior behaviour for the live detection case).
 */
export async function compositeLogoOntoVton(
  vtonBytes: Uint8Array,
  logoBytes: Uint8Array,
  placement: LogoPlacement,
  logoSource: "asset" | "front_crop",
  productTruthRaw?: unknown,
): Promise<LogoCompositeResult> {
  const base = await decodeToRgba(vtonBytes);
  let logoImg = await decodeToRgba(logoBytes);
  if (logoSource === "front_crop") {
    // Glyph-only key: drop BOTH navy + tan crop backgrounds, keep cream/gold
    // wordmark — so a loose source bbox never paints a background sliver.
    logoImg = keyGlyphForeground(logoImg);
  }
  const logoAspect = logoImg.width / Math.max(logoImg.height, 1);
  const [sx, , sw] = placement.source_bbox_norm;
  const anchorXNorm = sx + sw / 2;

  // Merge the SKU logo placement with any product_truth_json (manual keyframe
  // quad lives in details.logo_zone.manual_keyframe). The logo_zone spec always
  // carries source_bbox + navy profile so detection/fallback still work.
  const pt = parseProductTruth(productTruthRaw);
  const ptLogo = pt?.details?.logo_zone ?? null;
  const truth: ProductTruth = {
    version: 1,
    ...(pt ?? {}),
    details: {
      ...(pt?.details ?? {}),
      logo_zone: {
        detail_type: "logo_zone",
        source_bbox_norm: ptLogo?.source_bbox_norm ?? placement.source_bbox_norm,
        target_quad_norm: ptLogo?.target_quad_norm ?? null,
        manual_keyframe: ptLogo?.manual_keyframe ?? null,
        color_profile: NAVY_PROFILE,
        min_confidence: ptLogo?.min_confidence ?? MIN_STRIPE_CONFIDENCE,
      },
    },
  };
  // Legacy axis target_bbox is treated as an explicit manual quad.
  const manualPlacement: PlacementTarget | null = placement.target_bbox_norm
    ? { kind: "quad", points: quadFromNorm(base, quadNormFromBbox(placement.target_bbox_norm)) }
    : null;

  const eng = placeDetail({
    frame: base,
    detailType: "logo_zone",
    productTruth: truth,
    anchorXNorm,
    manualPlacement,
  });

  let bandRect: PixelRect;
  let target: PixelRect;
  let targetQuad: Quad;
  let composited: RgbaImage;
  let warpMode: "affine" | "perspective";

  if (eng.source === "manual_keyframe" && eng.target && eng.target.kind === "quad") {
    // Perspective warp onto the manual quad (follows a diagonal/curved stripe).
    warpMode = "perspective";
    targetQuad = eng.target.points;
    const quadPts = targetQuad as unknown as QuadPts;
    bandRect = rectFromTarget(eng.target);
    target = bandRect;
    const covered = coverTargetQuad(base, quadPts);
    composited = warpQuadAlpha(covered, logoImg, quadPts, 3);
  } else {
    warpMode = "affine";
    if (eng.source === "detection" && eng.target) {
      // Sub-place the logo inside the detected stripe band.
      bandRect = rectFromTarget(eng.target);
      target = targetRectForLogo(
        base,
        bandRect,
        logoAspect,
        placement.placement_hint ?? "upper_left_chest",
        null,
        placement.min_target_height_px,
        anchorXNorm,
      );
    } else {
      // Metadata/fallback bbox is the logo box directly.
      const fallbackNorm = placement.target_bbox_norm ?? placement.source_bbox_norm;
      target = eng.target ? rectFromTarget(eng.target) : bandFromNormBbox(base, fallbackNorm);
      bandRect = target;
    }
    targetQuad = quadFromRect(target);
    const covered = coverTargetOnBand(base, bandRect, target, anchorXNorm);
    composited = alphaComposite(covered, logoImg, target);
  }

  const bytes = await encodePng(composited);

  const placementFallback = eng.source !== "detection" && eng.source !== "manual_keyframe";
  const quality = logoQuality(
    logoImg.height,
    target.bottom - target.top,
    logoSource,
    eng.confidence,
    placementFallback,
  );

  let debugOverlayBytes: Uint8Array | null = null;
  try {
    debugOverlayBytes = await encodePng(eng.debugOverlay);
  } catch (_) {
    debugOverlayBytes = null;
  }

  return {
    bytes,
    method: warpMode === "perspective" ? "perspective_quad_warp" : "bbox_affine_alpha_blend",
    warp_mode: warpMode,
    band: bandRect,
    target,
    target_quad: quadToPairs(targetQuad),
    logo_source: logoSource,
    quality,
    placement_source: eng.source,
    fallback_reason: eng.fallbackReason,
    placement_confidence: eng.confidence,
    debug_overlay_bytes: debugOverlayBytes,
  };
}
