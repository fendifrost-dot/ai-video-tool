// Canonical SHARED video-preflight service — the ONE place every Fal video op
// (trim-video, scale-video, the frame-extraction path) computes its processing
// resolution, transport decision, and the metadata contract. Pure helpers (no
// Deno / DOM globals), so vitest exercises this exactly like _shared/videoCompose.ts
// and _shared/frameExtract.ts. There is deliberately NO per-lane resize logic
// anywhere else: the scrub proxy, the extract proxy's scale step, and any future
// video op all call planPreflight() and honor its plan.
//
// ── WHY THIS EXISTS (the confirmed fix, revised) ───────────────────────────────
// Fal's video ops (trim-video, scale-video, extract-frame) do NOT fail on "4K"
// per se. Verified evidence (2026-08-02): a small 4s / 15.8 MB 4K H.264 clip was
// accepted by trim-video without a 500, while a genuine multi-GB 4K HEVC / 10-bit
// / HDR master produces an undecodable clip. So the real gate is media
// COMPATIBILITY, not resolution: "can downstream AI (WebCodecs decode + the Fal
// ops) SAFELY consume this source?" The factors are codec (HEVC/ProRes), bit
// depth (10-bit), chroma (non-4:2:0), HDR (PQ/HLG/BT.2020), filesize, bitrate,
// and resolution — resolution is ONE input among several, not the trigger.
//
// A source that IS compatible but merely above the ≤1080p downstream ceiling is
// down-scaled ON Fal (transport "fal_scale"). A source that is INCOMPATIBLE
// (the multi-GB 4K HEVC/10-bit/HDR master) cannot be safely processed on Fal at
// all — the down-scale is itself a Fal op that would 500 or emit garbage — so it
// needs a NON-Fal transcode first (transport "non_fal_transcode"). That is the
// PROCESSING COMPATIBILITY GATE (plan.needsProcessing).
//
// ── AUTHORITY: the asset record, not the signed-URL probe ──────────────────────
// The MASTER's stored metadata (width/height/codec/fps/duration/size on the
// project_assets row) is AUTHORITATIVE. The ffmpeg-api/metadata probe of the
// signed Supabase master URL is transport/FALLBACK only — it has been observed to
// return empty width/height for large masters, which used to make planPreflight
// never run (compatibility never evaluated, metadata block persisted null).
// Callers resolve the source via resolveSourceProbe(asset-record, signed-URL
// probe): asset-record fields win field-by-field; the probe fills only the gaps.
//
// ── CONTRACT (implemented here) ────────────────────────────────────────────────
// INPUT : { source probe (asset-authoritative), requested clip range, target op,
//           preferred ceiling }.
// OUTPUT: H.264, 8-bit 4:2:0, ORIGINAL aspect ratio, EVEN dims, ORIGINAL frame rate
//         (unless explicitly normalized), ORIGINAL timing preserved, scale transform
//         recorded, SOURCE ASSET LEFT UNTOUCHED (this module computes a plan; it
//         never mutates the master — callers write a *separate* proxy object).
// HDR   : color_primaries / transfer / matrix are PASSED THROUGH as-is (HLG/BT.2020
//         kept). We do NOT tonemap by default — acceptance ≠ visual correctness, so
//         a clearly-marked hook is left where a tonemap step COULD later be inserted
//         if a benchmark shows color distortion (see maybeTonemapNote / plan.tonemap).
//         HDR still counts as a COMPATIBILITY factor (a color-managed transcode is
//         the safe way to consume it downstream).
//
// See docs/VIDEO_SWAP_ARCHITECTURE.md §4/§6 and CLAUDE.md "LOCKED" section.

// Bump when the plan/metadata SHAPE or the resolution/transport math changes, so
// persisted rows are attributable to the exact preflight logic that produced them
// (§6 #4). vp2: resolution-only "needs transcode" → multi-factor processing-
// compatibility gate; asset-authoritative source resolution; metadata carries the
// versioned compatibility decision (compatibility_version/result/reason/action).
export const PREFLIGHT_VERSION = "vp2";

// Versions the COMPATIBILITY DECISION LOGIC specifically — separate from
// PREFLIGHT_VERSION (which versions the plan/metadata shape + resolution math).
// Bump this WHENEVER the factors, thresholds, or decision rules in
// assessProcessingCompatibility / decideCompatibility change, so a persisted
// decision is always reproducible against the exact logic that made it and future
// improvements never silently change behavior for already-decided assets.
// cg1: codec(HEVC>1080p, ProRes) / 10-bit / non-4:2:0 / HDR / filesize(1GB) /
//      bitrate(80Mbps) / resolution(>DCI-4K); resolution is ONE factor among many.
export const COMPATIBILITY_VERSION = "cg1";

// Default processing ceiling: 1080p long edge. CONFIGURABLE per call / per env.
export const DEFAULT_CEILING_LONG_EDGE = 1920;
// Fallback rung: 720p long edge. Used when the primary ceiling still can't be
// served (e.g. a Fal op rejects at 1080p) — step DOWN, never up.
export const FALLBACK_CEILING_LONG_EDGE = 1280;
// Ordered rungs, high → low. planPreflight clamps a requested ceiling to a sane
// range; nextCeilingRung walks this ladder for retries.
export const CEILING_RUNGS = [DEFAULT_CEILING_LONG_EDGE, FALLBACK_CEILING_LONG_EDGE] as const;

// Fal's video-op INGEST envelope (long edge, px). Kept as ONE compatibility factor
// (combined with a heavy codec it flags the classic 4K-HEVC master). NOTE: this is
// no longer a standalone "Fal can't do 4K" trigger — a compatible H.264 8-bit
// source above this is down-scaled ON Fal. See assessProcessingCompatibility.
export const FAL_INPUT_MAX_LONG_EDGE = 1920;

// ── PROCESSING-COMPATIBILITY THRESHOLDS ────────────────────────────────────────
// Heuristics that separate "Fal + WebCodecs can safely consume this" from "needs a
// non-Fal transcode first". Tuned against verified evidence: a 4s/15.8 MB 4K H.264
// clip (~32 Mbps) was ACCEPTED; multi-GB 4K HEVC/10-bit/HDR masters fail. These are
// deliberately generous so ordinary ≤1080p H.264 deliverables never trip the gate.
//
// Filesize download/decode backstop. Multi-GB masters choke the pull+decode; a
// normal 1080p H.264 deliverable stays well under this.
export const COMPAT_MAX_SIZE_BYTES = 1_000_000_000; // 1 GB
// Bitrate backstop (decode complexity). Above the ~32 Mbps accepted sample with
// wide margin; catches high-bitrate cinema 4K masters.
export const COMPAT_MAX_BITRATE_BPS = 80_000_000; // 80 Mbps
// Resolution so large even a light codec is beyond Fal ingest (DCI-4K / 8K).
export const COMPAT_HARD_MAX_LONG_EDGE = 4096;

// Sane clamp for a configured ceiling. Below 320 is unusable; a ceiling above the
// Fal ingest envelope is pointless (a source already ≤ the envelope wouldn't need
// scaling to it, and the downstream ceiling is ≤1080p by design).
const MIN_CEILING = 320;
const MAX_CEILING = FAL_INPUT_MAX_LONG_EDGE;

export type VideoOp = "trim" | "scale" | "extract";

/**
 * How the requested op should actually be executed:
 *  - "passthrough":        source is ≤ ceiling AND already H.264 8-bit 4:2:0 AND
 *                          compatible → no re-encode needed; serve/trim on Fal.
 *  - "fal_scale":          source is COMPATIBLE and a scale and/or codec normalize
 *                          is needed → run scale-video on Fal (this includes a
 *                          compatible H.264 source ABOVE the 1080p ceiling — Fal
 *                          down-scales it).
 *  - "non_fal_transcode":  source is INCOMPATIBLE (the multi-GB 4K HEVC/10-bit/HDR
 *                          master) → the processing-compatibility gate. Fal can't
 *                          safely process it; needs a non-Fal transcode first. NOT
 *                          faked. See plan.needsProcessing / plan.processingReason.
 */
export type Transport = "passthrough" | "fal_scale" | "non_fal_transcode";

/** What the caller knows about the SOURCE master (dims optional; all optional). */
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
  /** Source duration (seconds). Used to derive bitrate when not given directly. */
  durationSec?: number | null;
  /** Source file size (bytes). A compatibility factor (download/decode choke). */
  sizeBytes?: number | null;
  /** Source overall bitrate (bits/sec). Derived from size/duration when absent. */
  bitrateBps?: number | null;
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
  /** Provenance: source size/bitrate that fed the compatibility gate (nullable). */
  source_size_bytes: number | null;
  source_bitrate_bps: number | null;
  /** The processing-compatibility gate result, persisted for observability. */
  needs_processing: boolean;
  /** Which compatibility factors tripped the gate (empty when compatible). */
  compatibility_reasons: string[];
  // ── The VERSIONED compatibility decision (stakeholder contract) ──────────────
  // Persisted as first-class fields (not just a boolean) so the decision is
  // reproducible and self-describing as the pipeline evolves.
  /** The decision-logic version (COMPATIBILITY_VERSION) that produced the result. */
  compatibility_version: string;
  /** The outcome: "compatible" | "incompatible". */
  compatibility_result: CompatibilityResult;
  /** Human-readable why, e.g. "HEVC 10-bit 2160p, 2GB — incompatible (…)". */
  compatibility_reason: string;
  /** The remedy, e.g. "transcode-to-1080p-h264" | "pass-through". */
  recommended_action: string;
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
  /**
   * True when Fal can SAFELY process the source (== compatible). Renamed intent
   * from the old "ingest envelope" boolean; a compatible source above 1080p is
   * still processable (Fal down-scales it).
   */
  falCanIngest: boolean;
  /** Alias of falCanIngest with the clearer name. */
  falCanProcess: boolean;
  transform: ScaleTransform;
  metadata: PreflightMetadata;
  /**
   * THE PROCESSING-COMPATIBILITY GATE. True when the source is incompatible with
   * Fal + WebCodecs (multi-GB 4K HEVC/10-bit/HDR etc.) and MUST be transcoded
   * off-Fal first. Callers must NOT submit a Fal scale/trim in that case.
   */
  needsProcessing: boolean;
  /** Human-readable why, aggregated from compatibilityReasons. Null when compatible. */
  processingReason: string | null;
  /** The individual factors that tripped the gate (empty when compatible). */
  compatibilityReasons: string[];
  // ── The VERSIONED compatibility decision (mirrors the persisted metadata) ────
  /** The decision-logic version (COMPATIBILITY_VERSION). */
  compatibilityVersion: string;
  /** The outcome: "compatible" | "incompatible". */
  compatibilityResult: CompatibilityResult;
  /** Human-readable why (compact, self-describing). */
  compatibilityReason: string;
  /** The remedy (kebab action token). */
  recommendedAction: string;
  /**
   * @deprecated Back-compat alias of `needsProcessing`. The gate is a media
   * COMPATIBILITY decision now, not a resolution "needs transcode". Kept so
   * existing callers/consumers that read `transcodeRequired` keep working.
   */
  transcodeRequired: boolean;
  /** @deprecated Back-compat alias of `processingReason`. */
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

/** True when the source carries HDR tags (PQ/HLG or BT.2020 primaries). */
export function isHdrSource(source: SourceProbe): boolean {
  const transfer = (source.transfer ?? "").toLowerCase();
  return (
    transfer.includes("arib-std-b67") || // HLG
    transfer.includes("hlg") ||
    transfer.includes("smpte2084") || // PQ
    transfer.includes("pq") ||
    (source.colorPrimaries ?? "").toLowerCase().includes("2020")
  );
}

/** Effective source bitrate (bits/sec): explicit value, else size*8/duration, else null. */
export function effectiveBitrateBps(source: SourceProbe): number | null {
  if (typeof source.bitrateBps === "number" && source.bitrateBps > 0) return source.bitrateBps;
  const size = Number(source.sizeBytes);
  const dur = Number(source.durationSec);
  if (Number.isFinite(size) && size > 0 && Number.isFinite(dur) && dur > 0) {
    return (size * 8) / dur;
  }
  return null;
}

/** The gate outcome — answers "is this asset compatible with the AI pipeline?". */
export type CompatibilityResult = "compatible" | "incompatible";

export interface CompatibilityAssessment {
  /** True when Fal + WebCodecs can SAFELY consume the source as-is. */
  compatible: boolean;
  /** The verbose factors that make it incompatible (empty when compatible). */
  reasons: string[];
  /** Compact tags for the tripped factors (e.g. "HEVC>1080p", "10-bit"). */
  tags: string[];
}

/**
 * THE processing-compatibility decision. Answers "can downstream AI (WebCodecs
 * decode + the Fal ops) safely consume this source?" — considering codec, bit
 * depth, chroma, HDR, filesize, bitrate, and resolution as ONE factor among
 * several (NOT resolution alone). Pure + deterministic so vitest asserts it.
 * Versioned by COMPATIBILITY_VERSION — bump that constant when this changes.
 */
export function assessProcessingCompatibility(source: SourceProbe): CompatibilityAssessment {
  const reasons: string[] = [];
  const tags: string[] = [];
  const push = (tag: string, reason: string) => {
    tags.push(tag);
    reasons.push(reason);
  };
  const codec = (source.codec ?? "").toLowerCase();
  const isHevc =
    codec.includes("hevc") ||
    codec.includes("h265") ||
    codec.includes("h.265") ||
    codec.includes("hvc1") ||
    codec.includes("hev1");
  const isProres = codec.includes("prores");
  const pf = (source.pixelFormat ?? "").toLowerCase();
  const tenBit = pf.includes("10") || pf.includes("p010") || pf.includes("12");
  const notYuv420 = pf.includes("422") || pf.includes("444");
  const sw = Math.round(Number(source.width) || 0);
  const sh = Math.round(Number(source.height) || 0);
  const longEdge = Math.max(sw, sh);
  const bitrate = effectiveBitrateBps(source);
  const size = Number(source.sizeBytes);

  if (tenBit) {
    push(
      "10-bit",
      "10-bit source (e.g. yuv420p10le/p010) — the Fal libx264 + WebCodecs 8-bit pipeline needs an off-Fal 8-bit transcode",
    );
  }
  if (notYuv420) {
    push("4:2:2/4:4:4", "non-4:2:0 chroma (4:2:2/4:4:4) — needs a 4:2:0 transcode for safe downstream decode");
  }
  if (isHdrSource(source)) {
    push(
      "HDR",
      "HDR source (PQ/HLG/BT.2020) — needs a color-managed off-Fal transcode for safe/correct downstream consumption",
    );
  }
  if (isProres) {
    push("ProRes", "ProRes source — the Fal ffmpeg ops can't reliably ingest it; needs an off-Fal transcode");
  }
  if (isHevc && longEdge > FAL_INPUT_MAX_LONG_EDGE) {
    // The classic multi-GB 4K HEVC master — the case that emits an undecodable clip.
    push(
      `HEVC>${FAL_INPUT_MAX_LONG_EDGE}px`,
      `HEVC/H.265 above ${FAL_INPUT_MAX_LONG_EDGE}px long edge (${longEdge}px) — the 4K-HEVC master case Fal cannot process into a decodable clip`,
    );
  }
  if (longEdge > COMPAT_HARD_MAX_LONG_EDGE) {
    push(
      ">DCI-4K",
      `resolution ${longEdge}px long edge exceeds DCI-4K (${COMPAT_HARD_MAX_LONG_EDGE}px) — beyond any Fal ingest even for a light codec`,
    );
  }
  if (Number.isFinite(size) && size > COMPAT_MAX_SIZE_BYTES) {
    push(
      "oversize",
      `filesize ${(size / 1_000_000).toFixed(0)} MB exceeds the ${(COMPAT_MAX_SIZE_BYTES / 1_000_000).toFixed(0)} MB download/decode ceiling`,
    );
  }
  if (bitrate !== null && bitrate > COMPAT_MAX_BITRATE_BPS) {
    push(
      "high-bitrate",
      `bitrate ${(bitrate / 1_000_000).toFixed(0)} Mbps exceeds the ${(COMPAT_MAX_BITRATE_BPS / 1_000_000).toFixed(0)} Mbps decode-complexity ceiling`,
    );
  }

  return { compatible: reasons.length === 0, reasons, tags };
}

/** Map a ceiling long-edge (px) to a friendly "1080p"/"720p" label for actions/reasons. */
export function ceilingLabel(ceilingLongEdge: number): string {
  const c = Math.round(Number(ceilingLongEdge) || 0);
  if (c === 1920) return "1080p";
  if (c === 1280) return "720p";
  if (c === 3840) return "2160p";
  return `${c}px-long-edge`;
}

/** Short codec label for the human-readable descriptor (HEVC/H.264/ProRes/raw). */
function codecLabel(codec?: string | null): string {
  const c = (codec ?? "").toLowerCase();
  if (!c) return "";
  if (c.includes("hevc") || c.includes("h265") || c.includes("h.265") || c.includes("hvc1") || c.includes("hev1"))
    return "HEVC";
  if (c.includes("h264") || c.includes("avc")) return "H.264";
  if (c.includes("prores")) return "ProRes";
  return codec!.trim();
}

/** Compact, human-readable source descriptor, e.g. "HEVC 10-bit 2160p, 2GB". */
export function sourceDescriptor(source: SourceProbe): string {
  const parts: string[] = [];
  const cl = codecLabel(source.codec);
  if (cl) parts.push(cl);
  const pf = (source.pixelFormat ?? "").toLowerCase();
  if (pf) parts.push(pf.includes("10") || pf.includes("p010") || pf.includes("12") ? "10-bit" : "8-bit");
  const sw = Math.round(Number(source.width) || 0);
  const sh = Math.round(Number(source.height) || 0);
  if (sw > 0 && sh > 0) parts.push(`${Math.min(sw, sh)}p`); // short-edge p-notation (2160p, 1080p)
  let head = parts.join(" ");
  const size = Number(source.sizeBytes);
  if (Number.isFinite(size) && size > 0) {
    const sizeLabel =
      size >= 1_000_000_000
        ? `${(size / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}GB`
        : `${Math.round(size / 1_000_000)}MB`;
    head = head ? `${head}, ${sizeLabel}` : sizeLabel;
  }
  return head || "source media (metadata unknown)";
}

/**
 * The VERSIONED, self-describing compatibility decision (stakeholder contract).
 * Combines the pure factor assessment with the transport shape (from the scale
 * transform + ceiling) into the four persisted fields: version, result, a compact
 * human-readable reason, and a recommended remedy action. Pure + deterministic.
 */
export function decideCompatibility(
  source: SourceProbe,
  transform: ScaleTransform,
  ceilingLongEdge: number,
  assessment?: CompatibilityAssessment,
): {
  version: string;
  result: CompatibilityResult;
  reason: string;
  recommendedAction: string;
  reasons: string[];
  tags: string[];
} {
  const a = assessment ?? assessProcessingCompatibility(source);
  const descriptor = sourceDescriptor(source);
  const label = ceilingLabel(resolveCeiling(ceilingLongEdge));

  if (!a.compatible) {
    return {
      version: COMPATIBILITY_VERSION,
      result: "incompatible",
      reason: `${descriptor} — incompatible with the downstream AI pipeline (${a.tags.join(", ")})`,
      recommendedAction: `transcode-to-${label}-h264`,
      reasons: a.reasons,
      tags: a.tags,
    };
  }

  // Compatible: distinguish pass-through vs an on-Fal scale/normalize.
  const needsScale = !transform.passThrough;
  const needsCodecNormalize = !isH264_8bit(source.codec, source.pixelFormat);
  let reason: string;
  let recommendedAction: string;
  if (!needsScale && !needsCodecNormalize) {
    reason = `${descriptor} — compatible (pass-through)`;
    recommendedAction = "pass-through";
  } else if (needsScale) {
    reason = `${descriptor} — compatible (downscale to ${label} on Fal)`;
    recommendedAction = `fal-downscale-to-${label}-h264`;
  } else {
    reason = `${descriptor} — compatible (codec-normalize to H.264 on Fal)`;
    recommendedAction = "fal-normalize-to-h264";
  }
  return {
    version: COMPATIBILITY_VERSION,
    result: "compatible",
    reason,
    recommendedAction,
    reasons: a.reasons,
    tags: a.tags,
  };
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
  if (!isHdrSource(source)) return { tonemap: false, note: null };
  return {
    tonemap: false, // hook stays OFF by default (see function doc).
    note: "HDR source: color tags passed through as-is; NOT tonemapped (hook available if a benchmark shows distortion)",
  };
}

/**
 * The AUTHORITATIVE, tolerant reader of a project_assets row's metadata_json into
 * the source-media fields the preflight service consumes. Reads a canonical
 * `source_media` sub-object first (written back by the extractor after a
 * successful probe — see the callers), then the legacy top-level keys the upload
 * path records (`duration_seconds`, `size_bytes`) and common dim/codec variants.
 * Returns null for any field it can't find, so resolveSourceProbe can fall back
 * to the signed-URL probe per field. Pure — no I/O.
 */
export function readAssetSourceMedia(
  metadataJson: Record<string, unknown> | null | undefined,
): SourceProbe {
  const meta = (metadataJson ?? {}) as Record<string, unknown>;
  const sm = (meta.source_media ?? {}) as Record<string, unknown>;
  const num = (...vals: unknown[]): number | null => {
    for (const v of vals) {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };
  const str = (...vals: unknown[]): string | null => {
    for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  };
  return {
    width: num(sm.width, meta.width, meta.video_width, meta.source_width),
    height: num(sm.height, meta.height, meta.video_height, meta.source_height),
    fps: num(sm.fps, sm.frame_rate, meta.fps, meta.frame_rate),
    codec: str(sm.codec, sm.video_codec, meta.codec, meta.video_codec),
    pixelFormat: str(sm.pixel_format, sm.pixelFormat, meta.pixel_format),
    colorPrimaries: str(sm.color_primaries, meta.color_primaries),
    transfer: str(sm.transfer, meta.transfer),
    matrix: str(sm.matrix, meta.matrix),
    durationSec: num(sm.duration_sec, sm.durationSec, meta.duration_seconds, meta.duration_sec),
    sizeBytes: num(sm.size_bytes, meta.size_bytes, meta.file_size, meta.size),
    bitrateBps: num(sm.bitrate_bps, meta.bitrate_bps, meta.bitrate),
  };
}

export type SourceFieldOrigin = "asset" | "probe" | "none";

export interface ResolvedSourceProbe {
  source: SourceProbe;
  /** Per-field provenance: where each value came from (authority is observable). */
  origin: Record<keyof SourceProbe, SourceFieldOrigin>;
}

/**
 * AUTHORITY INVERSION. Merge the asset-record source media (AUTHORITATIVE) with
 * the signed-URL Fal probe (FALLBACK), field by field: the asset value wins when
 * present; the probe fills only the gaps. This is what makes planPreflight run on
 * the master even when the signed-URL probe returns empty width/height — the exact
 * root cause of the 4K gate never firing and the metadata block persisting null.
 */
export function resolveSourceProbe(
  assetMedia: SourceProbe | null | undefined,
  falProbe?: SourceProbe | null,
): ResolvedSourceProbe {
  const a = assetMedia ?? {};
  const p = falProbe ?? {};
  const keys: (keyof SourceProbe)[] = [
    "width",
    "height",
    "fps",
    "codec",
    "pixelFormat",
    "colorPrimaries",
    "transfer",
    "matrix",
    "durationSec",
    "sizeBytes",
    "bitrateBps",
  ];
  const has = (v: unknown): boolean =>
    v !== null && v !== undefined && !(typeof v === "number" && !(v > 0)) && v !== "";
  const source: SourceProbe = {};
  const origin = {} as Record<keyof SourceProbe, SourceFieldOrigin>;
  for (const k of keys) {
    if (has(a[k])) {
      (source[k] as unknown) = a[k];
      origin[k] = "asset";
    } else if (has(p[k])) {
      (source[k] as unknown) = p[k];
      origin[k] = "probe";
    } else {
      origin[k] = "none";
    }
  }
  return { source, origin };
}

/** Build the SQL-readable metadata contract from a request + computed transform. */
export function buildPreflightMetadata(
  req: PreflightRequest,
  transform: ScaleTransform,
  compatibility?: CompatibilityAssessment,
): PreflightMetadata {
  const compat = compatibility ?? assessProcessingCompatibility(req.source);
  const decision = decideCompatibility(req.source, transform, req.ceilingLongEdge ?? DEFAULT_CEILING_LONG_EDGE, compat);
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
    source_size_bytes:
      typeof req.source.sizeBytes === "number" && req.source.sizeBytes > 0
        ? req.source.sizeBytes
        : null,
    source_bitrate_bps: effectiveBitrateBps(req.source),
    needs_processing: !compat.compatible,
    compatibility_reasons: compat.reasons,
    compatibility_version: decision.version,
    compatibility_result: decision.result,
    compatibility_reason: decision.reason,
    recommended_action: decision.recommendedAction,
    preflight_version: PREFLIGHT_VERSION,
  };
}

/**
 * THE canonical entry point. Given a source probe + clip range + op + ceiling,
 * return the full plan: transport decision, scale transform, metadata contract,
 * and — for a source that fails the processing-compatibility gate — an honest
 * needsProcessing flag with the aggregated reason (never a faked Fal 4K op).
 */
export function planPreflight(req: PreflightRequest): PreflightPlan {
  const ceiling = resolveCeiling(req.ceilingLongEdge);
  const transform = computeScaleTransform(req.source, ceiling);
  const compat = assessProcessingCompatibility(req.source);
  const decision = decideCompatibility(req.source, transform, ceiling, compat);
  const metadata = buildPreflightMetadata({ ...req, ceilingLongEdge: ceiling }, transform, compat);
  const warnings: string[] = [];

  const sw = transform.sourceWidth;
  const sh = transform.sourceHeight;
  const dimsKnown = sw > 0 && sh > 0;

  if (!dimsKnown) {
    warnings.push(
      "source dims unknown — resolution factor skipped; compatibility judged on codec/size/bitrate only. Populate the asset record's source_media (width/height/codec) for an authoritative decision",
    );
  }

  const compatible = compat.compatible;
  const needsProcessing = !compatible;
  const needsScale = !transform.passThrough;
  const needsCodecNormalize = !isH264_8bit(req.source.codec, req.source.pixelFormat);

  let transport: Transport;
  let processingReason: string | null = null;

  if (needsProcessing) {
    // The processing-compatibility gate — the incompatible master (multi-GB 4K
    // HEVC/10-bit/HDR etc.). Fal can't safely process it; report exactly what
    // production needs and do NOT submit a Fal op.
    transport = "non_fal_transcode";
    processingReason =
      `source is not safely processable on Fal — needs a NON-Fal transcode first ` +
      `(target ${transform.proxyWidth || "?"}x${transform.proxyHeight || "?"}; ` +
      `cloud ingest-mezzanine via Mux/Cloudflare or a dedicated ffmpeg worker; local ffmpeg is the interim for T7 masters). ` +
      `Factors: ${compat.reasons.join("; ")}`;
    warnings.push(processingReason);
  } else if (!needsScale && !needsCodecNormalize) {
    transport = "passthrough";
  } else {
    // Compatible but needs a down-scale (incl. a compatible source ABOVE 1080p)
    // and/or a codec normalize → run it on Fal.
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
    falCanIngest: compatible,
    falCanProcess: compatible,
    transform,
    metadata,
    needsProcessing,
    processingReason,
    compatibilityReasons: compat.reasons,
    compatibilityVersion: decision.version,
    compatibilityResult: decision.result,
    compatibilityReason: decision.reason,
    recommendedAction: decision.recommendedAction,
    // Deprecated back-compat aliases (see interface JSDoc).
    transcodeRequired: needsProcessing,
    transcodeReason: processingReason,
    tonemap: tone.tonemap,
    warnings,
  };
}
