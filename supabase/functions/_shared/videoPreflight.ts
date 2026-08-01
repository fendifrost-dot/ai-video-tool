// Canonical SHARED video-preflight service — the ONE place every Fal video op
// (trim-video, scale-video, the frame-extraction path) computes its processing
// resolution, transport decision, and the metadata contract. Pure helpers (no
// Deno / DOM globals), so vitest exercises this exactly like _shared/videoCompose.ts
// and _shared/frameExtract.ts. There is deliberately NO per-lane resize logic
// anywhere else: the scrub proxy, the extract proxy's scale step, and any future
// video op all call planPreflight() and honor its plan.
//
// ── WHY THIS EXISTS (the confirmed fix) ────────────────────────────────────────
// Fal's video ops (trim-video, scale-video, extract-frame) accept inputs up to
// ~1080×1920 and 500 only at 2160×3840 (4K). The failure is RESOLUTION of the
// SOURCE, not file size and not HDR. So the single correct gate is: "is the source
// within Fal's ingest envelope?" If yes → Fal handles it (pass-through when already
// ≤ the processing ceiling, or a Fal scale/codec normalize otherwise). If no (a 4K
// master) → Fal cannot do the downscale either, because the downscale is itself a
// Fal scale/trim on a 4K input — the very thing that 500s. That case needs a
// NON-Fal transcode (see transport "non_fal_transcode" + §"the >ceiling case").
//
// ── CONTRACT (implemented here) ────────────────────────────────────────────────
// INPUT : { source probe, requested clip range, target op, preferred ceiling }.
// OUTPUT: H.264, 8-bit 4:2:0, ORIGINAL aspect ratio, EVEN dims, ORIGINAL frame rate
//         (unless explicitly normalized), ORIGINAL timing preserved, scale transform
//         recorded, SOURCE ASSET LEFT UNTOUCHED (this module computes a plan; it
//         never mutates the master — callers write a *separate* proxy object).
// HDR   : color_primaries / transfer / matrix are PASSED THROUGH as-is (HLG/BT.2020
//         kept). We do NOT tonemap by default — acceptance ≠ visual correctness, so
//         a clearly-marked hook is left where a tonemap step COULD later be inserted
//         if a benchmark shows color distortion (see maybeTonemapNote / plan.tonemap).
//
// See docs/VIDEO_SWAP_ARCHITECTURE.md §4/§6 and CLAUDE.md "LOCKED" section.

// Bump when the plan/metadata shape or the resolution math changes, so persisted
// rows are attributable to the exact preflight logic that produced them (§6 #4).
export const PREFLIGHT_VERSION = "vp1";

// Default processing ceiling: 1080p long edge. CONFIGURABLE per call / per env.
export const DEFAULT_CEILING_LONG_EDGE = 1920;
// Fallback rung: 720p long edge. Used when the primary ceiling still can't be
// served (e.g. a Fal op rejects at 1080p) — step DOWN, never up.
export const FALLBACK_CEILING_LONG_EDGE = 1280;
// Ordered rungs, high → low. planPreflight clamps a requested ceiling to a sane
// range; nextCeilingRung walks this ladder for retries.
export const CEILING_RUNGS = [DEFAULT_CEILING_LONG_EDGE, FALLBACK_CEILING_LONG_EDGE] as const;

// Fal's video-op INGEST envelope (long edge, px). Inputs at/below this are
// accepted; a 4K master (3840 long edge) 500s. This is the resolution gate that
// decides fal vs. non-fal transport — the confirmed root cause.
export const FAL_INPUT_MAX_LONG_EDGE = 1920;

// Sane clamp for a configured ceiling. Below 320 is unusable; a ceiling above the
// Fal ingest envelope is pointless (Fal couldn't ingest a source that large to
// scale it, and a source already ≤ the envelope wouldn't need scaling to it).
const MIN_CEILING = 320;
const MAX_CEILING = FAL_INPUT_MAX_LONG_EDGE;

export type VideoOp = "trim" | "scale" | "extract";

/**
 * How the requested op should actually be executed:
 *  - "passthrough":        source is ≤ ceiling AND already H.264 8-bit 4:2:0 → no
 *                          re-encode needed; serve/trim the source directly on Fal.
 *  - "fal_scale":          Fal CAN ingest the source (≤ envelope) and a scale and/or
 *                          codec normalize is needed → run scale-video on Fal.
 *  - "non_fal_transcode":  source is ABOVE Fal's ingest envelope (the 4K master) →
 *                          Fal can't downscale it (the downscale is itself a Fal op
 *                          on a 4K input). Needs a non-Fal transcode first. NOT faked.
 */
export type Transport = "passthrough" | "fal_scale" | "non_fal_transcode";

/** What the caller probed about the SOURCE master (dims required; rest optional). */
export interface SourceProbe {
  /** Source pixel width. ≤0 / missing == unknown (plan degrades conservatively). */
  width?: number | null;
  /** Source pixel height. ≤0 / missing == unknown. */
  height?: number | null;
  /** Source frame rate; preserved into proxy_fps unless normalizeFps is set. */
  fps?: number | null;
  /** Source video codec (e.g. "hevc", "h264", "prores"). */
  codec?: string | null;
  /** Source pixel format (e.g. "yuv420p", "yuv420p10le"). Drives 8-bit decision. */
  pixelFormat?: string | null;
  /** HDR tags — passed through UNCHANGED (never tonemapped by default). */
  colorPrimaries?: string | null;
  transfer?: string | null;
  matrix?: string | null;
}

/** The [start, start+duration] range requested out of the master. */
export interface ClipRange {
  startSec: number;
  durationSec: number;
}

export interface PreflightRequest {
  source: SourceProbe;
  clip: ClipRange;
  operation: VideoOp;
  /** Preferred processing ceiling (long edge, px). Default 1080p; clamped sane. */
  ceilingLongEdge?: number;
  /** Explicit fps normalization. Omit/null → ORIGINAL frame rate preserved. */
  normalizeFps?: number | null;
}

/** The resolution decision + exact scale factors (recorded for reproducibility). */
export interface ScaleTransform {
  sourceWidth: number;
  sourceHeight: number;
  proxyWidth: number;
  proxyHeight: number;
  /** proxyWidth/sourceWidth, proxyHeight/sourceHeight (1 on pass-through). */
  scaleX: number;
  scaleY: number;
  /** True when no down-scale is applied (source already ≤ ceiling). */
  passThrough: boolean;
}

/**
 * The SQL-readable metadata contract. Persisted onto the asset/job metadata so
 * every proxy is fully attributable and reproducible (§6 #4). Field names are the
 * snake_case the DB stores.
 */
export interface PreflightMetadata {
  source_width: number;
  source_height: number;
  proxy_width: number;
  proxy_height: number;
  scale_x: number;
  scale_y: number;
  source_start_time: number;
  source_duration: number;
  /** Proxy frame rate: normalized value when set, else the ORIGINAL source fps. */
  proxy_fps: number | null;
  /** OUTPUT codec of the produced proxy (contract: always H.264). */
  codec: string;
  /** OUTPUT pixel format of the produced proxy (contract: 8-bit 4:2:0). */
  pixel_format: string;
  /** HDR tags carried through from the source, UNCHANGED. */
  color_primaries: string | null;
  transfer: string | null;
  matrix: string | null;
  /** Provenance: the source's own codec (distinct from the output `codec`). */
  source_codec: string | null;
  preflight_version: string;
}

export interface PreflightPlan {
  operation: VideoOp;
  /** The (clamped) ceiling this plan targeted. */
  ceilingLongEdge: number;
  transport: Transport;
  /** True when a down-scale is applied (source long edge > ceiling). */
  needsScale: boolean;
  /** True when a codec/bit-depth normalize is needed (source not H.264 8-bit). */
  needsCodecNormalize: boolean;
  /** True when Fal can ingest the source at all (long edge ≤ FAL envelope). */
  falCanIngest: boolean;
  transform: ScaleTransform;
  metadata: PreflightMetadata;
  /**
   * True for the 4K case: the source is above Fal's ingest envelope, so the
   * down-scale MUST happen off-Fal first. Callers must NOT submit a Fal scale/trim
   * for this source — they need a non-Fal mezzanine (see plan.transcodeReason).
   */
  transcodeRequired: boolean;
  transcodeReason: string | null;
  /** Never true by default — the tonemap hook is intentionally off (see header). */
  tonemap: boolean;
  /** Human-readable notes (unknown dims, HDR-passthrough, transcode guidance). */
  warnings: string[];
}

/** Largest EVEN integer ≤ round(n), floored at 2. H.264 requires even dims. */
export function toEvenDim(n: number): number {
  const r = Math.round(n);
  const e = r % 2 === 0 ? r : r - 1;
  return Math.max(2, e);
}

/** Clamp a requested ceiling into the sane [MIN_CEILING, MAX_CEILING] range, even. */
export function resolveCeiling(requested?: number | null): number {
  const raw = Number(requested);
  const c = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CEILING_LONG_EDGE;
  return toEvenDim(Math.max(MIN_CEILING, Math.min(MAX_CEILING, c)));
}

/**
 * The next rung DOWN from a given ceiling (for a retry when the current rung still
 * fails), or null when already at/below the lowest rung. Walks CEILING_RUNGS and
 * any lower value snaps to the fallback rung.
 */
export function nextCeilingRung(ceiling: number): number | null {
  for (const rung of CEILING_RUNGS) {
    if (rung < ceiling) return rung;
  }
  return null;
}

/** True when the source is already H.264, 8-bit 4:2:0 (a genuine pass-through). */
export function isH264_8bit(codec?: string | null, pixelFormat?: string | null): boolean {
  const c = (codec ?? "").toLowerCase();
  const isH264 = c.includes("h264") || c.includes("avc");
  if (!isH264) return false;
  const p = (pixelFormat ?? "").toLowerCase();
  // Unknown pixel format on an H.264 stream is overwhelmingly 8-bit 4:2:0; only
  // flag a normalize when the format is KNOWN to be 10-bit / not 4:2:0.
  if (!p) return true;
  const tenBit = p.includes("10") || p.includes("p010") || p.includes("12");
  const notYuv420 = p.includes("422") || p.includes("444");
  return !tenBit && !notYuv420;
}

/**
 * Compute the scale transform for a source under a ceiling. Preserves aspect
 * ratio, forces EVEN output dims, and never up-scales. On pass-through the proxy
 * dims equal the source dims verbatim (no re-encode → dims untouched).
 */
export function computeScaleTransform(
  source: SourceProbe,
  ceilingLongEdge: number,
): ScaleTransform {
  const sw = Math.round(Number(source.width) || 0);
  const sh = Math.round(Number(source.height) || 0);
  const ceiling = resolveCeiling(ceilingLongEdge);

  // Unknown source dims → cannot scale; treat as pass-through and let the caller
  // warn. (planPreflight surfaces the "unknown dims" warning.)
  if (sw <= 0 || sh <= 0) {
    return {
      sourceWidth: sw,
      sourceHeight: sh,
      proxyWidth: sw,
      proxyHeight: sh,
      scaleX: 1,
      scaleY: 1,
      passThrough: true,
    };
  }

  const longEdge = Math.max(sw, sh);
  if (longEdge <= ceiling) {
    // Already within the ceiling → no down-scale. Dims pass through untouched.
    return {
      sourceWidth: sw,
      sourceHeight: sh,
      proxyWidth: sw,
      proxyHeight: sh,
      scaleX: 1,
      scaleY: 1,
      passThrough: true,
    };
  }

  // Down-scale so the LONG edge lands on the ceiling; short edge scales with it.
  const scale = ceiling / longEdge;
  let proxyWidth: number;
  let proxyHeight: number;
  if (sw >= sh) {
    proxyWidth = toEvenDim(ceiling);
    proxyHeight = toEvenDim(sh * scale);
  } else {
    proxyHeight = toEvenDim(ceiling);
    proxyWidth = toEvenDim(sw * scale);
  }
  return {
    sourceWidth: sw,
    sourceHeight: sh,
    proxyWidth,
    proxyHeight,
    // Exact realized factors (may differ by <1px worth from even-rounding — recorded honestly).
    scaleX: proxyWidth / sw,
    scaleY: proxyHeight / sh,
    passThrough: false,
  };
}

/**
 * INTENTIONALLY-OFF tonemap hook. Per the contract we keep HDR (HLG/BT.2020) tags
 * as-is and do NOT tonemap by default — Fal ACCEPTING an HDR clip is not proof the
 * colors are correct. If a benchmark later shows HDR→SDR distortion, a tonemap
 * step (e.g. zscale/tonemap in a non-Fal transcode) would be inserted HERE and
 * this would return true for HDR sources. Until then it is always false.
 */
export function maybeTonemapNote(source: SourceProbe): { tonemap: boolean; note: string | null } {
  const transfer = (source.transfer ?? "").toLowerCase();
  const isHdr =
    transfer.includes("arib-std-b67") || // HLG
    transfer.includes("hlg") ||
    transfer.includes("smpte2084") || // PQ
    transfer.includes("pq") ||
    (source.colorPrimaries ?? "").toLowerCase().includes("2020");
  if (!isHdr) return { tonemap: false, note: null };
  return {
    tonemap: false, // hook stays OFF by default (see function doc).
    note: "HDR source: color tags passed through as-is; NOT tonemapped (hook available if a benchmark shows distortion)",
  };
}

/** Build the SQL-readable metadata contract from a request + computed transform. */
export function buildPreflightMetadata(
  req: PreflightRequest,
  transform: ScaleTransform,
): PreflightMetadata {
  return {
    source_width: transform.sourceWidth,
    source_height: transform.sourceHeight,
    proxy_width: transform.proxyWidth,
    proxy_height: transform.proxyHeight,
    scale_x: transform.scaleX,
    scale_y: transform.scaleY,
    source_start_time: Number(req.clip.startSec) || 0,
    source_duration: Number(req.clip.durationSec) || 0,
    proxy_fps:
      req.normalizeFps && req.normalizeFps > 0
        ? Number(req.normalizeFps)
        : req.source.fps && req.source.fps > 0
          ? Number(req.source.fps)
          : null,
    codec: "h264", // OUTPUT — contract fixes H.264.
    pixel_format: "yuv420p", // OUTPUT — contract fixes 8-bit 4:2:0.
    color_primaries: req.source.colorPrimaries ?? null,
    transfer: req.source.transfer ?? null,
    matrix: req.source.matrix ?? null,
    source_codec: req.source.codec ?? null,
    preflight_version: PREFLIGHT_VERSION,
  };
}

/**
 * THE canonical entry point. Given a source probe + clip range + op + ceiling,
 * return the full plan: transport decision, scale transform, metadata contract,
 * and — for a source above Fal's ingest envelope — an honest transcodeRequired
 * flag with the reason (never a faked Fal 4K downscale).
 */
export function planPreflight(req: PreflightRequest): PreflightPlan {
  const ceiling = resolveCeiling(req.ceilingLongEdge);
  const transform = computeScaleTransform(req.source, ceiling);
  const metadata = buildPreflightMetadata({ ...req, ceilingLongEdge: ceiling }, transform);
  const warnings: string[] = [];

  const sw = transform.sourceWidth;
  const sh = transform.sourceHeight;
  const dimsKnown = sw > 0 && sh > 0;
  const longEdge = Math.max(sw, sh);

  if (!dimsKnown) {
    warnings.push(
      "source dims unknown — assuming Fal-ingestable pass-through; probe the master to decide accurately",
    );
  }

  const falCanIngest = !dimsKnown ? true : longEdge <= FAL_INPUT_MAX_LONG_EDGE;
  const needsScale = !transform.passThrough;
  const needsCodecNormalize = !isH264_8bit(req.source.codec, req.source.pixelFormat);

  let transport: Transport;
  let transcodeRequired = false;
  let transcodeReason: string | null = null;

  if (dimsKnown && !falCanIngest) {
    // The 4K case. Fal can't ingest the source, so it can't perform the down-scale
    // either. Report honestly what production needs — do NOT submit a Fal op.
    transport = "non_fal_transcode";
    transcodeRequired = true;
    transcodeReason =
      `source long edge ${longEdge}px exceeds Fal's ingest envelope (${FAL_INPUT_MAX_LONG_EDGE}px); ` +
      `down-scale to ${transform.proxyWidth}x${transform.proxyHeight} must run on a NON-Fal transcode ` +
      `(cloud ingest-mezzanine via Mux/Cloudflare or a dedicated ffmpeg worker; local ffmpeg is the interim for T7 masters)`;
    warnings.push(transcodeReason);
  } else if (!needsScale && !needsCodecNormalize) {
    transport = "passthrough";
  } else {
    transport = "fal_scale";
  }

  const tone = maybeTonemapNote(req.source);
  if (tone.note) warnings.push(tone.note);

  return {
    operation: req.operation,
    ceilingLongEdge: ceiling,
    transport,
    needsScale,
    needsCodecNormalize,
    falCanIngest,
    transform,
    metadata,
    transcodeRequired,
    transcodeReason,
    tonemap: tone.tonemap,
    warnings,
  };
}
