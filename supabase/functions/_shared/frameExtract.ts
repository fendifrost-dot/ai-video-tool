// Server-side clip frame EXTRACTION — pure helpers (no Deno / DOM globals, so
// vitest exercises this exactly like _shared/videoCompose.ts and lucyV2v.ts).
//
// WHY this exists: the client WebCodecs extractor (src/lib/video/extractFrames.ts)
// makes the BROWSER fetch + decode the whole (up to ~2 GB 4K HEVC) master just to
// turn a few seconds into a frame sequence. For large masters that is the exact
// choke the scrub-proxy was built to remove. This module backs a GENERIC server
// shot/frame service (supabase/functions/wardrobe-video-frame-extract-proxy) that
// pulls ONLY the requested [start, start+duration] clip range and extracts frames
// on Fal ffmpeg via the CC `fal-run` transport (same path as reassemble/compose),
// so no full-master download/decode happens anywhere.
//
// This is production infrastructure, NOT throwaway scaffolding: every future video
// op (mask propagation, optical flow, temporal QA, rerender, final assembly) reuses
// the SAME timestamped frame/chunk service + manifest defined here. See
// docs/VIDEO_SWAP_ARCHITECTURE.md §4 ("Phase 2b — what to keep": frame extraction,
// ordered/indexed storage, Fal routing, status tracking) and §6 (engineering
// prereqs: persisted status, resume/skip-completed, reproducibility metadata,
// normalized filename/format).
//
// The Fal input-shaping section (buildFalTrimInput / buildFalExtractInput /
// extractFrameUrls) is verified against fal.ai's ffmpeg-api schemas — see the
// per-function provenance comments.

// ---------------------------------------------------------------------------
// Extraction config + deterministic identity (idempotency foundation).
// ---------------------------------------------------------------------------

export interface ExtractConfig {
  /** Source master asset id (the untouched full-res video). */
  assetId: string;
  /** Clip start, seconds into the master. >= 0. */
  startSec: number;
  /** Clip duration in seconds. > 0. */
  durationSec: number;
  /** Target sample rate. Frame i lands at startSec + i/fps. > 0. */
  fps: number;
  /** Optional output frame width (px, even). Omit to keep source width. */
  width?: number;
  /** Optional output frame height (px, even). Omit to keep source height. */
  height?: number;
}

/** Round a float to a fixed number of decimals for STABLE canonical text. */
function fixed(n: number, dp = 3): string {
  if (!Number.isFinite(n)) throw new Error(`frameExtract: non-finite number ${n}`);
  // Normalize -0 → 0 and clamp tiny FP noise so the same request always hashes
  // to the same id (idempotency depends on byte-identical canonical strings).
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return (r === 0 ? 0 : r).toFixed(dp);
}

/**
 * Canonical, order-stable string for a config. Only the fields that change WHICH
 * frames get produced participate — so a repeat request with the same clip
 * range / fps / dims maps to the same extraction (skip-completed). Width/height
 * are included because different output dims are genuinely different frames.
 */
export function canonicalizeExtractConfig(config: ExtractConfig): string {
  if (!config.assetId) throw new Error("frameExtract: missing assetId");
  if (!(config.startSec >= 0)) throw new Error(`frameExtract: invalid startSec ${config.startSec}`);
  if (!(config.durationSec > 0)) {
    throw new Error(`frameExtract: invalid durationSec ${config.durationSec}`);
  }
  if (!(config.fps > 0)) throw new Error(`frameExtract: invalid fps ${config.fps}`);
  const w = config.width && config.width > 0 ? Math.round(config.width) : 0;
  const h = config.height && config.height > 0 ? Math.round(config.height) : 0;
  return [
    `asset=${config.assetId}`,
    `start=${fixed(config.startSec)}`,
    `dur=${fixed(config.durationSec)}`,
    `fps=${fixed(config.fps)}`,
    `w=${w}`,
    `h=${h}`,
  ].join("|");
}

/**
 * Deterministic short id for an extraction config (FNV-1a over the canonical
 * string, hex). Pure — no crypto/Date/random — so the SAME config always yields
 * the SAME id, which namespaces the frame storage paths and the manifest key.
 * Same id + same paths == idempotency by construction: a rerun writes to the
 * exact same objects and finds the exact same manifest.
 */
export function extractionIdForConfig(config: ExtractConfig): string {
  const s = canonicalizeExtractConfig(config);
  // FNV-1a 32-bit, run twice over the string with different offsets for a 64-bit
  // space (12 hex chars) — collision-negligible for per-asset extraction ids.
  let h1 = 0x811c9dc5;
  let h2 = 0x2166136f;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `ex_${hex(h1)}${hex(h2).slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Frame plan — exact source timestamps + order (a hard requirement).
// ---------------------------------------------------------------------------

export interface PlannedFrame {
  /** 0-based presentation order within the clip. */
  index: number;
  /**
   * EXACT source timestamp (seconds into the ORIGINAL master) this frame
   * represents: startSec + index/fps. Order == index by construction.
   */
  sourceTimestamp: number;
}

/**
 * The ordered set of frames a config asks for. Count = floor(duration*fps),
 * clamped to >= 1, and capped by maxFrames (an OOM/cost guard mirrored from the
 * client extractor). Frame i's source timestamp is startSec + i/fps — the honest
 * timeline position, exact and monotonic.
 */
export function planExtractionFrames(config: ExtractConfig, maxFrames = 900): PlannedFrame[] {
  canonicalizeExtractConfig(config); // validation
  const raw = Math.floor(config.durationSec * config.fps + 1e-6);
  const count = Math.max(1, Math.min(raw, Math.max(1, Math.floor(maxFrames))));
  const frames: PlannedFrame[] = [];
  for (let i = 0; i < count; i++) {
    frames.push({
      index: i,
      // Anchor to start + i/fps (never accumulate) so long clips don't drift.
      sourceTimestamp: Math.round((config.startSec + i / config.fps) * 1e6) / 1e6,
    });
  }
  return frames;
}

/** True when planExtractionFrames would clip the sequence at maxFrames. */
export function extractionTruncated(config: ExtractConfig, maxFrames = 900): boolean {
  const raw = Math.floor(config.durationSec * config.fps + 1e-6);
  return raw > Math.max(1, Math.floor(maxFrames));
}

// ---------------------------------------------------------------------------
// Storage layout — deterministic on (userId, assetId, extractionId, index).
// Zero-padded so lexical order == frame order in Storage listings, matching the
// client uploader's framePath() convention (wardrobeVideoFrames.ts).
// ---------------------------------------------------------------------------

/** Object-path prefix for a clip's frames. */
export function extractFramePrefix(userId: string, assetId: string, extractionId: string): string {
  return `${userId}/${assetId}/extract/${extractionId}/`;
}

/** Zero-padded frame object path. `ext` records the TRUE encoding (§6 #3). */
export function extractFramePath(
  userId: string,
  assetId: string,
  extractionId: string,
  index: number,
  ext = "jpg",
): string {
  return `${extractFramePrefix(userId, assetId, extractionId)}${String(index).padStart(6, "0")}.${ext}`;
}

/** Parse the zero-padded frame index from a frame object path/name (or null). */
export function frameIndexFromPath(path: string): number | null {
  const m = /(\d{6})\.[a-z0-9]+$/i.exec(path);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** True when a set of indices is exactly 0,1,…,n-1 with no gaps (frames complete). */
export function contiguousFromZero(indices: Iterable<number>): boolean {
  const set = new Set<number>(indices);
  if (set.size === 0) return false;
  for (let i = 0; i < set.size; i++) if (!set.has(i)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Extraction MANIFEST — the per-frame record the UI + downstream ops read.
// ---------------------------------------------------------------------------

export interface ManifestFrame {
  /** 0-based presentation order. */
  index: number;
  /** Exact source timestamp (seconds into the master). */
  sourceTimestamp: number;
  /** Storage object path of this frame. */
  path: string;
  /** Output width in px (0 when not yet known / source-native and unmeasured). */
  width: number;
  /** Output height in px (0 when not yet known / source-native and unmeasured). */
  height: number;
  /** True once the frame object is confirmed present in Storage. */
  stored: boolean;
}

export interface ExtractionManifest {
  /** Deterministic extraction id (== session id for this extraction). */
  extractionId: string;
  /** Config hash id equals extractionId; kept explicit for readers. */
  configHash: string;
  assetId: string;
  frameBucket: string;
  framePrefix: string;
  startSec: number;
  durationSec: number;
  fps: number;
  /** Requested output dims (0 == source-native / not overridden). */
  width: number;
  height: number;
  /** Total frames the config plans (before any per-frame stored check). */
  frameCount: number;
  /** True when the plan hit the maxFrames guard. */
  truncated: boolean;
  frames: ManifestFrame[];
  /**
   * The seek+trimmed clip mp4 (the [start, start+duration] range cut out of the
   * master). Present when the extractor ran the trim step (the large-HEVC path).
   * Lane C (whole-clip Lucy v2v) consumes THIS so it runs on exactly the
   * requested range — not the whole master. null on the extract-direct path.
   */
  clipPath: string | null;
  clipBucket: string | null;
  /** Reproducibility metadata (§6 #4): how these frames were produced. */
  repro: ExtractionRepro;
}

export interface ExtractionRepro {
  /** Fal model id the seek+trim ran on (workflow-utilities/trim-video). */
  falTrimModel: string | null;
  /** Fal model id the H.264/dims normalize ran on, if used (scale-video). */
  falScaleModel: string | null;
  /** Fal model id the source probe ran on, if used (ffmpeg-api/metadata). */
  falMetaModel: string | null;
  /** "trim_video" | "trim_scale" — how the clip was produced. */
  mode: string;
  /** Source master storage path (untouched full-res video). */
  sourceAssetPath: string | null;
  /** Probed source codec (from metadata), when available. */
  sourceCodec: string | null;
  /** Probed source fps (from metadata), when available. */
  sourceFps: number | null;
  /** Codec of the trimmed clip the frames were decoded from. */
  clipCodec: string | null;
}

export interface BuildManifestArgs {
  config: ExtractConfig;
  userId: string;
  frameBucket: string;
  repro: ExtractionRepro;
  /** Per-frame measured dims by index, when the extractor knows them. */
  dimsByIndex?: Record<number, { width: number; height: number }>;
  /** Frame indices confirmed present in Storage (resume marks these). */
  storedIndices?: Iterable<number>;
  maxFrames?: number;
  /** Output extension actually produced (records true format, §6 #3). Default jpg. */
  ext?: string;
  /** Trimmed-clip pointer, when the seek+trim step ran. */
  clipPath?: string | null;
  clipBucket?: string | null;
  /**
   * Build frames for EXACTLY these indices instead of the config plan. The edge
   * function passes the indices it found in the frame-storage listing so the
   * final manifest is server-authoritative about what was actually produced
   * (frames are decoded from the trimmed clip, so the real count can differ
   * from floor(duration*fps) by a boundary frame). Omit for the pre-decode
   * (frames_pending) manifest, which advertises the planned set.
   */
  framesOverride?: number[];
}

/**
 * Build the extraction manifest from a config + what's known about the produced
 * frames. Pure: the edge fn supplies measured dims / stored-set; the shape here
 * is identical whether it's a fresh run or a resumed one, so idempotent reruns
 * return a byte-stable manifest for the same inputs.
 */
export function buildExtractionManifest(args: BuildManifestArgs): ExtractionManifest {
  const { config, userId, frameBucket } = args;
  const extractionId = extractionIdForConfig(config);
  const planned = planExtractionFrames(config, args.maxFrames ?? 900);
  const stored = new Set<number>(args.storedIndices ?? []);
  const ext = args.ext ?? "jpg";
  const w = config.width && config.width > 0 ? Math.round(config.width) : 0;
  const h = config.height && config.height > 0 ? Math.round(config.height) : 0;

  // Which indices the manifest lists: the actual produced set when the edge
  // function supplies it, else the config plan (pre-decode advertisement).
  const indices = args.framesOverride
    ? [...new Set(args.framesOverride)].sort((a, b) => a - b)
    : planned.map((p) => p.index);

  const frames: ManifestFrame[] = indices.map((index) => {
    const dims = args.dimsByIndex?.[index];
    return {
      index,
      // Anchor to start + index/fps (exact source timestamp; never accumulate).
      sourceTimestamp: Math.round((config.startSec + index / config.fps) * 1e6) / 1e6,
      path: extractFramePath(userId, config.assetId, extractionId, index, ext),
      width: dims?.width ?? w,
      height: dims?.height ?? h,
      stored: stored.has(index),
    };
  });

  return {
    extractionId,
    configHash: extractionId,
    assetId: config.assetId,
    frameBucket,
    framePrefix: extractFramePrefix(userId, config.assetId, extractionId),
    startSec: config.startSec,
    durationSec: config.durationSec,
    fps: config.fps,
    width: w,
    height: h,
    frameCount: planned.length,
    truncated: extractionTruncated(config, args.maxFrames ?? 900),
    frames,
    clipPath: args.clipPath ?? null,
    clipBucket: args.clipBucket ?? null,
    repro: args.repro,
  };
}

/** Indices from a prior manifest whose frames are already stored (resume set). */
export function storedIndicesFromManifest(
  manifest: ExtractionManifest | null | undefined,
): number[] {
  if (!manifest?.frames) return [];
  return manifest.frames.filter((f) => f.stored).map((f) => f.index);
}

/** Ordered stored frame paths from a manifest (what downstream ops consume). */
export function manifestFramePaths(manifest: ExtractionManifest): string[] {
  return [...manifest.frames].sort((a, b) => a.index - b.index).map((f) => f.path);
}

/** A manifest is COMPLETE when every planned frame is stored. */
export function manifestComplete(manifest: ExtractionManifest): boolean {
  return manifest.frames.length > 0 && manifest.frames.every((f) => f.stored);
}

// ---------------------------------------------------------------------------
// Fal input shaping — CONFIRMED against fal.ai's OpenAPI queue schemas
// (2026-07-29). KEY FINDING: Fal has NO server-side full-frame-sequence
// extractor. `ffmpeg-api/extract-frame` is first/middle/last only; `compose`
// cannot seek into a source. The only server-side clip op is a SEEK+TRIM
// (`workflow-utilities/trim-video`). So the server extracts the CLIP RANGE
// (dodging the 2 GB HEVC master + the scale-video failure the scrub-proxy hit),
// optionally forces H.264 + output dims on that SMALL clip, and the frames are
// decoded from the trimmed clip — never from the master. See file header + the
// wardrobe-video-frame-extract-proxy edge function.
// ---------------------------------------------------------------------------

function assertHttps(url: string, who: string): void {
  if (typeof url !== "string" || !url.trim().startsWith("https://")) {
    throw new Error(`${who}: missing/insecure https url`);
  }
}

/**
 * `fal-ai/workflow-utilities/trim-video` input. Schema: video_url (req),
 * start_time (seconds), end_time (seconds|null), duration (seconds|null —
 * "Duration in seconds from start_time. Ignored if end_time is provided.").
 * We pass start_time + duration (not end_time) so a clip length is explicit.
 */
export function buildTrimInput(
  videoUrl: string,
  startSec: number,
  durationSec: number,
): Record<string, unknown> {
  assertHttps(videoUrl, "buildTrimInput");
  if (!(startSec >= 0)) throw new Error(`buildTrimInput: invalid start ${startSec}`);
  if (!(durationSec > 0)) throw new Error(`buildTrimInput: invalid duration ${durationSec}`);
  return {
    video_url: videoUrl.trim(),
    start_time: Math.round(startSec * 1000) / 1000,
    duration: Math.round(durationSec * 1000) / 1000,
  };
}

/** `fal-ai/ffmpeg-api/metadata` input. media_url (req); we don't need start/end frames. */
export function buildMetadataInput(mediaUrl: string): Record<string, unknown> {
  assertHttps(mediaUrl, "buildMetadataInput");
  return { media_url: mediaUrl.trim(), extract_frames: false };
}

export interface VideoMeta {
  durationSec: number | null;
  fps: number | null;
  codec: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
}

/** Parse `fal-ai/ffmpeg-api/metadata` output (`media:{...}`), tolerating shape. */
export function extractVideoMeta(result: Record<string, unknown>): VideoMeta | null {
  const media = (result?.media ?? result) as Record<string, unknown> | undefined;
  if (!media || typeof media !== "object") return null;
  const res = (media.resolution ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    durationSec: num(media.duration),
    fps: num(media.fps),
    codec: str(media.codec),
    container: str(media.container),
    width: num(res.width),
    height: num(res.height),
  };
}

/**
 * `fal-ai/workflow-utilities/scale-video` input — force H.264 (so the browser
 * can decode the trimmed clip) and, when requested, the output box. This is the
 * SAME model the scrub-proxy uses (already CC-allowlisted); scale-video failed
 * on the 2 GB master but is safe on the SMALL trimmed clip. Both edges must be
 * even and inside the model's 512–2048 range; mode "pad" preserves aspect ratio.
 */
export function buildScaleInput(
  videoUrl: string,
  width: number,
  height: number,
): Record<string, unknown> {
  assertHttps(videoUrl, "buildScaleInput");
  const even = (n: number) => {
    const c = Math.max(512, Math.min(2048, Math.round(n)));
    return c % 2 === 0 ? c : c - 1;
  };
  return {
    video_url: videoUrl.trim(),
    width: even(width),
    height: even(height),
    mode: "pad",
    pad_color: "black",
    codec: "libx264",
    preset: "fast",
    crf: 20, // frames are decoded from this clip, so keep it near-lossless.
  };
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/** Pull the output video URL from a trim/scale result, tolerating shape variance. */
export function extractClipVideoUrl(result: Record<string, unknown>): string | null {
  const video = result?.video as { url?: string } | undefined;
  if (isHttpsUrl(video?.url)) return video!.url!.trim();
  if (isHttpsUrl(result?.video_url)) return String(result.video_url).trim();
  if (isHttpsUrl(result?.url)) return String(result.url).trim();
  const output = result?.output as { url?: string; video_url?: string } | undefined;
  if (isHttpsUrl(output?.url)) return String(output!.url).trim();
  if (isHttpsUrl(output?.video_url)) return String(output!.video_url).trim();
  return null;
}

/** Codecs a browser VideoDecoder/WebCodecs handles for the trimmed clip. */
export function isBrowserDecodableCodec(codec: string | null): boolean {
  if (!codec) return false;
  const c = codec.toLowerCase();
  return c.includes("h264") || c.includes("avc") || c.includes("vp8") || c.includes("vp9");
}
