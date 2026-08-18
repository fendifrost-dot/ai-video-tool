// Wardrobe video propagation — client orchestration.
//
// Phase 2a: extract → upload → reassemble (no swap; proves the encoder roundtrip).
// Phase 2b: extract → upload → per-frame garment swap → reassemble. The swap is
// REFERENCE-LOCKED — every frame is conditioned on the same approved garment
// image (wardrobe-video-swap-proxy), so the outfit is identical frame to frame.
// switchx-restyle is single-image with no temporal state, so reference-lock is
// the consistency mechanism (see supabase/functions/_shared/frameSwap.ts and
// docs/AVT_masked_garment_swap_LOCKED.md for the masked-lock 2c strengthening).
import { supabase } from "@/lib/supabase";
import { getSessionWithTimeout, getAccessTokenWithTimeout } from "@/lib/authSession";
import { bucketForAssetType } from "@/lib/queries/projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { extractFramesFromUrl, type ExtractFramesOptions } from "@/lib/video/extractFrames";
import { applyGrokGarmentTruthAndWait } from "@/lib/queries/grokImageGarment";

const FRAME_BUCKET = "project-exports";
const SIGN_TTL = 3600;
const UPLOAD_CONCURRENCY = 4;
const SWAP_POLL_INTERVAL_MS = 5000;
const SWAP_POLL_TIMEOUT_MS = 12 * 60 * 1000;

/**
 * Explicit clip range to extract SERVER-SIDE (Fal ffmpeg via CC), instead of the
 * browser downloading + decoding the whole (up to ~2 GB 4K HEVC) master. This is
 * the PRIMARY path for large masters — see supabase/functions/_shared/frameExtract.ts
 * and wardrobe-video-frame-extract-proxy. The client WebCodecs path
 * (extractFramesFromUrl) stays as the fallback for small LOCAL files.
 */
export interface ServerExtractConfig {
  /** Clip start, seconds into the master. >= 0. */
  startSec: number;
  /** Clip duration in seconds. > 0. */
  durationSec: number;
  /** Optional output frame width (px, even). Omit to keep source width. */
  width?: number;
  /** Optional output frame height (px, even). Omit to keep source height. */
  height?: number;
}

export interface RoundtripInput {
  asset: Pick<ProjectAsset, "id" | "asset_type" | "file_url">;
  /** Decimate to at most this fps (omit to keep the master's rate). */
  targetFps?: number;
  /** OOM guard forwarded to the extractor. */
  maxFrames?: number;
  /** Lay the master's audio over the reassembled clip. Default true. */
  includeAudio?: boolean;
  /** Progress callback: fraction 0..1 through the frame uploads. */
  onProgress?: (uploaded: number, total: number) => void;
  /**
   * When set, the [startSec, startSec+durationSec] frames are extracted on the
   * SERVER (no whole-master browser download/decode). `targetFps` is required in
   * this mode (frame i lands at startSec + i/targetFps). Omit to use the legacy
   * client WebCodecs extractor (small local files only).
   */
  serverExtract?: ServerExtractConfig;
}

export interface RoundtripResult {
  sessionId: string;
  frameCount: number;
  fps: number;
  truncated: boolean;
  /** Output object path the reassemble job writes to (project-exports bucket). */
  outPath: string;
}

export interface SwapRoundtripInput extends RoundtripInput {
  /** Wardrobe item whose garment reference is locked onto every frame. */
  wardrobeFeatureId: string;
  artistId: string;
  transferMode?: "full_look" | "jacket_only";
  vtonModel?: "idm-vton" | "cat-vton";
}

export interface SwapRoundtripResult extends RoundtripResult {
  engine: string;
  swappedPrefix: string;
}

/**
 * Client mirror of the sanitized diagnostic a video proxy persists into
 * metadata_json.fal_diagnostics[op] (authoritative shape in
 * supabase/functions/_shared/falDiagnostics.ts). Only the fields the UI surfaces
 * are typed here. Secrets are already stripped server-side — this is safe to show.
 */
export interface ClientFalDiagnostic {
  phase?: string;
  classification?: string;
  message?: string;
  /** Our HTTP status to CC. */
  cc_http_status?: number | null;
  /** Upstream Fal status (the account-block signal: 401/402/403 vs 5xx). */
  fal_status?: number | string | null;
  provider_status?: string | null;
  provider_error?: string | null;
  model?: string | null;
  request_id?: string | null;
  fal_request_id?: string | null;
  recorded_at?: string;
}

/**
 * Thrown when a polled lane reaches "failed" WITH a structured diagnostic. The
 * runner surfaces `diagnostic` (status + classification + short message); the
 * full record stays in the DB.
 */
export class FalRunError extends Error {
  readonly op: string;
  readonly diagnostic: ClientFalDiagnostic | null;
  constructor(message: string, op: string, diagnostic: ClientFalDiagnostic | null) {
    super(message);
    this.name = "FalRunError";
    this.op = op;
    this.diagnostic = diagnostic;
  }
}

/**
 * The PROCESSING-COMPATIBILITY gate tripped: the master is incompatible with the
 * Fal + WebCodecs path (multi-GB 4K HEVC / 10-bit / HDR …) and MUST be transcoded
 * off-Fal to an H.264 8-bit mezzanine first.
 *
 * This is TERMINAL AND IMMEDIATE. The whole point of the gate is to fail fast
 * instead of submitting a Fal op that 500s — so the one case the gate exists to
 * catch must never be waited out on the poll timeout. `needs_transcode` is not a
 * ready state and not a "failed" state, so before this existed it fell through
 * pollAssetStatus and surfaced 12 minutes later as a bare "extract_status timed
 * out", hiding the reason the server had already written to the asset row.
 */
export class VideoNeedsProcessingError extends Error {
  readonly assetId: string;
  readonly op: string;
  /** Compact self-describing why, from the versioned compatibility decision. */
  readonly compatibilityReason: string | null;
  /** The remedy (kebab action token), e.g. "transcode-to-h264-8bit-1080p". */
  readonly recommendedAction: string | null;
  /** The individual factors that tripped the gate. */
  readonly compatibilityReasons: string[];
  readonly compatibilityVersion: string | null;
  constructor(
    assetId: string,
    op: string,
    detail: {
      compatibilityReason?: string | null;
      recommendedAction?: string | null;
      compatibilityReasons?: string[] | null;
      compatibilityVersion?: string | null;
    },
  ) {
    const why =
      detail.compatibilityReason?.trim() ||
      (detail.compatibilityReasons ?? []).filter(Boolean).join("; ") ||
      "source is incompatible with the Fal/WebCodecs processing path";
    const action = detail.recommendedAction?.trim();
    super(
      `Video needs a non-Fal transcode before processing: ${why}.` +
        (action ? ` Recommended action: ${action}.` : ""),
    );
    this.name = "VideoNeedsProcessingError";
    this.assetId = assetId;
    this.op = op;
    this.compatibilityReason = detail.compatibilityReason ?? null;
    this.recommendedAction = detail.recommendedAction ?? null;
    this.compatibilityReasons = detail.compatibilityReasons ?? [];
    this.compatibilityVersion = detail.compatibilityVersion ?? null;
  }
}

/**
 * The persisted status string stays "needs_transcode" — it is a client contract
 * shared with ScrubProxyStatus (src/lib/video/scrubProxy.ts). Only the concept
 * was renamed to a compatibility gate.
 */
const NEEDS_PROCESSING_STATUS = "needs_transcode";

/** The dispatch response shape the extract proxy returns when the gate trips. */
interface ExtractDispatchResponse {
  ok?: boolean;
  status?: string;
  extractionId?: string;
  needsProcessing?: boolean;
  processingReason?: string | null;
  compatibilityReasons?: string[];
  compatibilityVersion?: string;
  compatibilityResult?: string;
  compatibilityReason?: string;
  recommendedAction?: string;
  transport?: string;
  warnings?: string[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Build the gate error from the DISPATCH BODY — the server returns HTTP 200 with
 * status "needs_transcode" plus the full compatibility decision, so the client
 * knows on the very first round-trip and never enters the poll loop at all.
 */
function needsProcessingFromDispatch(
  assetId: string,
  op: string,
  body: ExtractDispatchResponse,
): VideoNeedsProcessingError {
  return new VideoNeedsProcessingError(assetId, op, {
    compatibilityReason: str(body.compatibilityReason) ?? str(body.processingReason),
    recommendedAction: str(body.recommendedAction),
    compatibilityReasons: body.compatibilityReasons ?? [],
    compatibilityVersion: str(body.compatibilityVersion),
  });
}

/**
 * Build the gate error from the PERSISTED asset metadata — the belt to the
 * dispatch braces. Covers the gate tripping out-of-band (another tab, an earlier
 * run, a server that answered before we started polling). The `*_preflight_*`
 * keys are namespaced by the lane's status key ("extract_status" → "extract").
 */
function needsProcessingFromMeta(
  assetId: string,
  statusKey: string,
  meta: Record<string, unknown>,
): VideoNeedsProcessingError {
  const p = statusKey.endsWith("_status") ? statusKey.slice(0, -"_status".length) : statusKey;
  const reasons = meta[`${p}_preflight_compatibility_reasons`];
  return new VideoNeedsProcessingError(assetId, p, {
    compatibilityReason:
      str(meta[`${p}_preflight_compatibility_reason`]) ??
      str(meta[`${p}_preflight_reason`]) ??
      str(meta[`${p}_preflight_transcode_reason`]),
    recommendedAction: str(meta[`${p}_preflight_recommended_action`]),
    compatibilityReasons: Array.isArray(reasons) ? reasons.map(String) : [],
    compatibilityVersion: str(meta[`${p}_preflight_compatibility_version`]),
  });
}

/** zero-padded so lexical order == frame order in Storage listings. */
function framePath(userId: string, assetId: string, sessionId: string, index: number): string {
  return `${userId}/${assetId}/frames/${sessionId}/${String(index).padStart(6, "0")}.jpg`;
}

async function uploadInPool<T>(
  items: T[],
  worker: (item: T, i: number) => Promise<void>,
  concurrency: number,
  onDone?: (completed: number) => void,
): Promise<void> {
  let next = 0;
  let completed = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
      completed++;
      onDone?.(completed);
    }
  });
  await Promise.all(runners);
}

interface UploadedFrames {
  userId: string;
  sessionId: string;
  framePaths: string[];
  fps: number;
  total: number;
  truncated: boolean;
}

/** Extract the master's frames (client WebCodecs) and upload them in order. */
async function extractAndUploadFrames(input: RoundtripInput): Promise<UploadedFrames> {
  const session = await getSessionWithTimeout();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const masterBucket = bucketForAssetType(input.asset.asset_type);
  const { data: signed, error: signErr } = await supabase.storage
    .from(masterBucket)
    .createSignedUrl(String(input.asset.file_url), SIGN_TTL);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Could not sign master: ${signErr?.message ?? "no url"}`);
  }

  const extractOpts: ExtractFramesOptions = {
    targetFps: input.targetFps,
    maxFrames: input.maxFrames,
  };
  const extracted = await extractFramesFromUrl(signed.signedUrl, extractOpts);
  if (extracted.frames.length === 0) throw new Error("No frames extracted");

  const sessionId = crypto.randomUUID();
  const total = extracted.frames.length;

  await uploadInPool(
    extracted.frames,
    async (frame) => {
      const path = framePath(userId, input.asset.id, sessionId, frame.index);
      const { error } = await supabase.storage.from(FRAME_BUCKET).upload(path, frame.blob, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });
      if (error) throw new Error(`Frame upload failed (${frame.index}): ${error.message}`);
    },
    UPLOAD_CONCURRENCY,
    (done) => input.onProgress?.(done, total),
  );

  const framePaths = extracted.frames.map((f) =>
    framePath(userId, input.asset.id, sessionId, f.index),
  );
  return {
    userId,
    sessionId,
    framePaths,
    fps: extracted.fps,
    total,
    truncated: extracted.truncated,
  };
}

// Client mirror of the server ExtractionManifest (authoritative copy lives in
// supabase/functions/_shared/frameExtract.ts). Only the fields the client
// consumes are typed here.
interface ClientManifestFrame {
  index: number;
  path: string;
}
export interface ClientExtractionManifest {
  extractionId: string;
  fps: number;
  frameCount: number;
  truncated: boolean;
  frames: ClientManifestFrame[];
  frameBucket: string;
  framePrefix: string;
  /** Trimmed [start, start+duration] clip mp4 — Lane C's whole-clip input. */
  clipPath: string | null;
  clipBucket: string | null;
}

type ServerUploadedFrames = UploadedFrames & {
  clipPath: string | null;
  clipBucket: string | null;
};

function orderedManifestPaths(manifest: ClientExtractionManifest): string[] {
  return [...manifest.frames].sort((a, b) => a.index - b.index).map((f) => f.path);
}

/**
 * SERVER-SIDE clip extraction. Fal has NO server-side full-frame extractor
 * (confirmed 2026-07-29 — see supabase/functions/_shared/frameExtract.ts), so
 * the split is:
 *   • SERVER (edge fn): seek+trim the [start,duration] range out of the master
 *     on Fal and normalize it to a small H.264 clip. The 2 GB / 4K-HEVC master
 *     is pulled by FAL, never by the browser — that is the whole point.
 *   • CLIENT (here): decode that SMALL trimmed clip with WebCodecs (a few MB of
 *     H.264, not the master) and upload the frames, then finalize the manifest.
 * Idempotent + resumable: the extraction id keys the clip + every frame path, so
 * a re-run skips the trim (clip already stored) and skips frames already
 * uploaded. When the clip already has its frames, this returns WITHOUT any
 * client download at all.
 */
async function extractClipFramesServer(
  input: RoundtripInput,
  opts: { clipOnly?: boolean } = {},
): Promise<ServerUploadedFrames> {
  const cfg = input.serverExtract!;
  if (!(input.targetFps && input.targetFps > 0)) {
    throw new Error("serverExtract requires targetFps (frame i = startSec + i/targetFps)");
  }
  const session = await getSessionWithTimeout();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  // 1. Dispatch the server-side seek+trim (idempotent — skips if the clip exists).
  //    The response is CONSUMED, not discarded: an incompatible master answers
  //    HTTP 200 with status "needs_transcode" and we must stop right here.
  await dispatchExtract(input.asset.id, {
    assetId: input.asset.id,
    startSec: cfg.startSec,
    durationSec: cfg.durationSec,
    fps: input.targetFps,
    width: cfg.width,
    height: cfg.height,
    maxFrames: input.maxFrames,
  });

  // 2. Wait for the trimmed clip. "frames_pending" == clip ready, frames not yet
  //    uploaded; "ready" == frames already present (idempotent short-circuit).
  let meta = await pollAssetStatus(
    input.asset.id,
    "extract_status",
    "extract_error",
    ["ready", "frames_pending"],
    "extract",
  );
  let manifest = meta.extract_manifest as ClientExtractionManifest | undefined;
  if (!manifest?.framePrefix) throw new Error("Extractor produced no manifest");

  const status = String(meta.extract_status ?? "");

  // Lane C only needs the trimmed CLIP (whole-clip v2v), not decoded frames —
  // stop as soon as the clip is ready and skip the client decode entirely.
  if (opts.clipOnly) {
    if (!manifest.clipPath || !manifest.clipBucket) {
      throw new Error("Extractor did not produce a trimmed clip");
    }
    return {
      userId,
      sessionId: manifest.extractionId,
      framePaths: status === "ready" ? orderedManifestPaths(manifest) : [],
      fps: manifest.fps,
      total: manifest.frameCount,
      truncated: manifest.truncated,
      clipPath: manifest.clipPath,
      clipBucket: manifest.clipBucket,
    };
  }

  if (status !== "ready") {
    // 3. Decode the SMALL trimmed clip (not the master) and upload its frames.
    if (!manifest.clipPath || !manifest.clipBucket) {
      throw new Error("Extractor did not produce a trimmed clip to decode");
    }
    const { data: clipSigned, error: clipErr } = await supabase.storage
      .from(manifest.clipBucket)
      .createSignedUrl(manifest.clipPath, SIGN_TTL);
    if (clipErr || !clipSigned?.signedUrl) {
      throw new Error(`Could not sign trimmed clip: ${clipErr?.message ?? "no url"}`);
    }
    const extracted = await extractFramesFromUrl(clipSigned.signedUrl, {
      targetFps: input.targetFps,
      maxFrames: input.maxFrames,
    });
    if (extracted.frames.length === 0) throw new Error("No frames decoded from trimmed clip");

    const prefix = manifest.framePrefix;
    const bucket = manifest.frameBucket;
    const total = extracted.frames.length;
    await uploadInPool(
      extracted.frames,
      async (frame) => {
        const path = `${prefix}${String(frame.index).padStart(6, "0")}.jpg`;
        const { error } = await supabase.storage.from(bucket).upload(path, frame.blob, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true, // idempotent re-upload; skip-completed is by the finalize list
        });
        if (error) throw new Error(`Frame upload failed (${frame.index}): ${error.message}`);
      },
      UPLOAD_CONCURRENCY,
      (done) => input.onProgress?.(done, total),
    );

    // 4. Finalize: the edge fn re-lists storage and flips the manifest to ready.
    await dispatchExtract(input.asset.id, {
      assetId: input.asset.id,
      startSec: cfg.startSec,
      durationSec: cfg.durationSec,
      fps: input.targetFps,
      width: cfg.width,
      height: cfg.height,
      maxFrames: input.maxFrames,
      finalize: true,
    });
    meta = await pollAssetStatus(
      input.asset.id,
      "extract_status",
      "extract_error",
      ["ready"],
      "extract",
    );
    manifest = meta.extract_manifest as ClientExtractionManifest | undefined;
    if (!manifest?.frames?.length) throw new Error("Finalized manifest has no frames");
  }

  const framePaths = orderedManifestPaths(manifest);
  input.onProgress?.(framePaths.length, framePaths.length);
  return {
    userId,
    sessionId: manifest.extractionId,
    framePaths,
    fps: manifest.fps,
    total: manifest.frameCount,
    truncated: manifest.truncated,
    clipPath: manifest.clipPath,
    clipBucket: manifest.clipBucket,
  };
}

/** Server extractor when a clip range is given; else the client WebCodecs path. */
async function resolveFrames(input: RoundtripInput): Promise<UploadedFrames> {
  if (input.serverExtract) return extractClipFramesServer(input);
  return extractAndUploadFrames(input);
}

async function postEdge<T = Record<string, unknown>>(
  fn: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`${fn} failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  return (await resp.json()) as T;
}

/**
 * POST the frame-extract proxy and SHORT-CIRCUIT on the compatibility gate.
 *
 * The gate answers HTTP 200 (it is a decision, not an error), so the dispatch
 * body is the earliest possible signal — one round-trip instead of 12 minutes of
 * polling a status that will never become "ready".
 */
async function dispatchExtract(
  assetId: string,
  payload: Record<string, unknown>,
): Promise<ExtractDispatchResponse> {
  const body = await postEdge<ExtractDispatchResponse>(
    "wardrobe-video-frame-extract-proxy",
    payload,
  );
  if (body?.status === NEEDS_PROCESSING_STATUS || body?.needsProcessing === true) {
    throw needsProcessingFromDispatch(assetId, "extract", body);
  }
  return body;
}

async function dispatchReassemble(
  assetId: string,
  sessionId: string,
  framePaths: string[],
  frameBucket: string,
  fps: number,
  includeAudio: boolean,
): Promise<string> {
  const body = await postEdge<{ outPath?: string }>("wardrobe-video-reassemble-proxy", {
    assetId,
    sessionId,
    framePaths,
    frameBucket,
    fps,
    includeAudio,
  });
  return body.outPath ?? "";
}

/**
 * Poll an asset's metadata_json until `key` reaches a ready state (resolves the
 * meta) or "failed" (throws with the recorded error). Times out. `terminalReady`
 * lets a caller also treat other non-failure terminal states as done (Lane A's
 * propagate step can end "incomplete" when some frames are blocked/re-anchor).
 */
async function pollAssetStatus(
  assetId: string,
  key: string,
  errorKey: string,
  terminalReady: string[] = ["ready"],
  diagKey?: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + SWAP_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("project_assets")
      .select("metadata_json")
      .eq("id", assetId)
      .maybeSingle();
    const meta = (data?.metadata_json ?? {}) as Record<string, unknown>;
    const status = String(meta[key] ?? "");
    if (terminalReady.includes(status)) return meta;
    // "needs_transcode" is TERMINAL — it is neither ready nor failed, so without
    // this it fell through to the 12-minute timeout and reported a bare
    // "<key> timed out", throwing away the compatibility decision the server had
    // already persisted. Surface that decision instead, immediately.
    if (status === NEEDS_PROCESSING_STATUS) {
      throw needsProcessingFromMeta(assetId, key, meta);
    }
    if (status === "failed") {
      const diag = diagKey
        ? ((meta.fal_diagnostics as Record<string, ClientFalDiagnostic> | undefined)?.[diagKey] ??
          null)
        : null;
      const base = String(meta[errorKey] ?? `${key} failed`);
      throw new FalRunError(diag?.message ?? base, diagKey ?? key, diag);
    }
    await new Promise((r) => setTimeout(r, SWAP_POLL_INTERVAL_MS));
  }
  throw new Error(`${key} timed out`);
}

/**
 * Phase 2a — extract → upload → reassemble (no swap). Returns once reassemble is
 * DISPATCHED; poll metadata_json.reassemble_status for "ready".
 */
export async function runFrameRoundtrip(input: RoundtripInput): Promise<RoundtripResult> {
  const up = await resolveFrames(input);
  const outPath = await dispatchReassemble(
    input.asset.id,
    up.sessionId,
    up.framePaths,
    FRAME_BUCKET,
    up.fps,
    input.includeAudio ?? true,
  );
  return {
    sessionId: up.sessionId,
    frameCount: up.total,
    fps: up.fps,
    truncated: up.truncated,
    outPath,
  };
}

/**
 * Phase 2b — extract → upload → per-frame reference-locked swap → reassemble.
 * Waits for the swap to finish (polls swap_status) before dispatching reassemble
 * on the swapped frames. Returns once reassemble is dispatched.
 */
export async function runFrameSwapRoundtrip(
  input: SwapRoundtripInput,
): Promise<SwapRoundtripResult> {
  const up = await resolveFrames(input);

  const swap = await postEdge<{ swappedPrefix: string; swappedBucket: string; engine: string }>(
    "wardrobe-video-swap-proxy",
    {
      assetId: input.asset.id,
      sessionId: up.sessionId,
      framePaths: up.framePaths,
      frameBucket: FRAME_BUCKET,
      artistId: input.artistId,
      wardrobeFeatureId: input.wardrobeFeatureId,
      transferMode: input.transferMode ?? "jacket_only",
      vtonModel: input.vtonModel,
    },
  );

  const meta = await pollAssetStatus(
    input.asset.id,
    "swap_status",
    "swap_error",
    ["ready"],
    "swap",
  );
  const prefix = String(meta.swap_swapped_prefix ?? swap.swappedPrefix);
  const swappedBucket = String(meta.swap_swapped_bucket ?? swap.swappedBucket ?? FRAME_BUCKET);
  const swappedPaths = up.framePaths.map((_, i) => `${prefix}${String(i).padStart(6, "0")}.jpg`);

  const outPath = await dispatchReassemble(
    input.asset.id,
    up.sessionId,
    swappedPaths,
    swappedBucket,
    up.fps,
    input.includeAudio ?? true,
  );

  return {
    sessionId: up.sessionId,
    frameCount: up.total,
    fps: up.fps,
    truncated: up.truncated,
    outPath,
    engine: swap.engine,
    swappedPrefix: prefix,
  };
}

// ---------------------------------------------------------------------------
// LANE A — Grok keyframe generation + temporal propagation.
// docs/VIDEO_SWAP_ARCHITECTURE.md §3 (the LOCKED production path).
//
//   extract → generate approved Grok KEYFRAMES (existing grok-image-garment-
//   proxy) → PROPAGATE garment across intermediates (wardrobe-video-propagate-
//   proxy) → reassemble.
//
// This is NOT Phase 2b (independent per-frame swap). Only the middle generation
// step differs: keyframes are the ground truth, intermediates are warp-derived.
// ---------------------------------------------------------------------------

/** Locked cadence band (mirrors supabase/functions/_shared/keyframePlan.ts — keep in sync). */
const KEYFRAME_CADENCE_MIN = 12;
const KEYFRAME_CADENCE_MAX = 24;
const KEYFRAME_CADENCE_DEFAULT = 18;

/**
 * Keyframe indices for a clip: first + last always, one every `cadence` frames,
 * plus any forced anchors (pose changes / scene cuts). Mirrors planKeyframes()
 * in _shared/keyframePlan.ts (authoritative; the propagate proxy re-derives
 * segments from these indices server-side).
 */
export function planLaneAKeyframeIndices(
  frameCount: number,
  cadenceFrames = KEYFRAME_CADENCE_DEFAULT,
  forcedAnchors: number[] = [],
): number[] {
  if (!(frameCount > 0))
    throw new Error(`planLaneAKeyframeIndices: invalid frameCount ${frameCount}`);
  if (frameCount === 1) return [0];
  const cadence = Math.min(
    KEYFRAME_CADENCE_MAX,
    Math.max(
      KEYFRAME_CADENCE_MIN,
      Math.round(Number.isFinite(cadenceFrames) ? cadenceFrames : KEYFRAME_CADENCE_DEFAULT),
    ),
  );
  const set = new Set<number>([0, frameCount - 1]);
  for (let i = cadence; i < frameCount - 1; i += cadence) set.add(i);
  for (const a of forcedAnchors) {
    const idx = Math.floor(a);
    if (Number.isFinite(idx) && idx >= 0 && idx < frameCount) set.add(idx);
  }
  return [...set].sort((a, b) => a - b);
}

export interface LaneAKeyframe {
  index: number;
  path: string;
  bucket: string;
  lookId: string;
}

export interface LaneARoundtripInput extends RoundtripInput {
  wardrobeFeatureId: string;
  artistId: string;
  projectId?: string;
  /** Scheduled keyframe cadence (clamped to 12–24). Default 18. */
  cadenceFrames?: number;
  /** Extra keyframe indices at detected pose changes / scene cuts. */
  forcedAnchors?: number[];
  /**
   * Human-approval gate for each generated keyframe (the locked lane approves
   * keyframes before propagation). Return false to reject — rejection aborts the
   * run so a bad keyframe never propagates. Default: auto-approve.
   */
  approveKeyframe?: (kf: LaneAKeyframe) => boolean | Promise<boolean>;
  /** Progress across keyframe generation. */
  onKeyframe?: (done: number, total: number, kf: LaneAKeyframe) => void;
}

export interface LaneARoundtripResult extends RoundtripResult {
  keyframeIndices: number[];
  keyframes: LaneAKeyframe[];
  propagateEngine: string;
  propagateEngineActive: boolean;
  /** Non-null when propagation is blocked (e.g. no flow model wired). */
  propagateBlockReason: string | null;
  /** Frames still needing a fresh Grok keyframe (flow breaks). */
  reanchorNeeded: number[];
  /** propagate rollup: "ready" (all frames) or "incomplete" (some blocked). */
  propagateStatus: string;
}

/**
 * Phase — Lane A. Extract → generate approved Grok keyframes → propagate garment
 * across intermediates → (if complete) reassemble. Returns the plan + status
 * even when propagation blocks (no engine wired), so the caller can see exactly
 * what Lane A needs without faking a video.
 */
export async function runLaneARoundtrip(input: LaneARoundtripInput): Promise<LaneARoundtripResult> {
  const up = await resolveFrames(input);

  // 1. KEYFRAMES — reuse the proven Grok garment-truth hero pipeline, one call
  //    per planned keyframe index, using that ORIGINAL frame as the scene.
  const keyframeIndices = planLaneAKeyframeIndices(
    up.total,
    input.cadenceFrames,
    input.forcedAnchors,
  );
  const keyframes: LaneAKeyframe[] = [];
  for (let n = 0; n < keyframeIndices.length; n++) {
    const idx = keyframeIndices[n];
    const look = await applyGrokGarmentTruthAndWait({
      artistId: input.artistId,
      wardrobeFeatureId: input.wardrobeFeatureId,
      scenePath: up.framePaths[idx],
      sceneBucket: FRAME_BUCKET,
      projectId: input.projectId,
      name: `Lane A keyframe · frame ${idx}`,
    });
    const path = (look.generated_storage_path ?? look.generated_image_url) as string | null;
    if (!path) throw new Error(`Keyframe ${idx}: Grok produced no image`);
    const kf: LaneAKeyframe = { index: idx, path, bucket: "look-composites", lookId: look.id };
    // Approval gate — a rejected keyframe must not propagate.
    const approved = input.approveKeyframe ? await input.approveKeyframe(kf) : true;
    if (!approved) throw new Error(`Keyframe ${idx} rejected — aborting before propagation`);
    keyframes.push(kf);
    input.onKeyframe?.(n + 1, keyframeIndices.length, kf);
  }

  // 2. PROPAGATE — warp the approved keyframe garment across intermediates.
  const prop = await postEdge<{
    prefix: string;
    engine: string;
    engineActive: boolean;
    engineBlockReason: string | null;
    reanchorNeeded: number[];
  }>("wardrobe-video-propagate-proxy", {
    assetId: input.asset.id,
    sessionId: up.sessionId,
    framePaths: up.framePaths,
    frameBucket: FRAME_BUCKET,
    keyframes: keyframes.map((k) => ({ index: k.index, path: k.path, bucket: k.bucket })),
    artistId: input.artistId,
    wardrobeFeatureId: input.wardrobeFeatureId,
    cadenceFrames: input.cadenceFrames ?? KEYFRAME_CADENCE_DEFAULT,
  });

  const meta = await pollAssetStatus(
    input.asset.id,
    "propagate_status",
    "propagate_error",
    ["ready", "incomplete"],
    "propagate",
  );
  const propagateStatus = String(meta.propagate_status ?? "");
  const prefix = String(meta.propagate_prefix ?? prop.prefix);
  const reanchorNeeded = (meta.propagate_reanchor_needed as number[]) ?? prop.reanchorNeeded ?? [];

  // 3. REASSEMBLE — only when every frame is present. Build the exact ordered
  //    path set from the per-frame record (ext varies: filename normalize).
  let outPath = "";
  if (propagateStatus === "ready") {
    const frameRec = (meta.propagate_frames ?? {}) as Record<string, { ext?: string }>;
    const propagatedPaths = up.framePaths.map(
      (_, i) => `${prefix}${String(i).padStart(6, "0")}.${frameRec[String(i)]?.ext ?? "jpg"}`,
    );
    outPath = await dispatchReassemble(
      input.asset.id,
      up.sessionId,
      propagatedPaths,
      FRAME_BUCKET, // propagate proxy writes into project-exports
      up.fps,
      input.includeAudio ?? true,
    );
  }

  return {
    sessionId: up.sessionId,
    frameCount: up.total,
    fps: up.fps,
    truncated: up.truncated,
    outPath,
    keyframeIndices,
    keyframes,
    propagateEngine: String(meta.propagate_engine ?? prop.engine),
    propagateEngineActive: prop.engineActive,
    propagateBlockReason: prop.engineBlockReason ?? null,
    reanchorNeeded,
    propagateStatus,
  };
}

// ---------------------------------------------------------------------------
// LANE C — Decart Lucy video-native video-to-video (BATCH) benchmark lane.
// docs/LANE_C_LUCY_VIDEO_VTON.md + docs/VIDEO_SWAP_ARCHITECTURE.md §5 (Lane B
// option b: "video-native VTON / video-to-video model").
//
// Whole clip in → whole clip out (no frame extract/swap/reassemble): Lucy is
// temporally native, so there is no per-frame boiling by construction. That
// temporal behaviour is exactly what the benchmark measures against Lane A/B.
//
// HONEST BOUNDARY: batch Lucy is PROMPT-DRIVEN (no garment image), so it
// REGENERATES the garment and cannot preserve the SL-bomber construction/stripe.
// It is EXPECTED to fail the construction half of the kill criterion (arch §7)
// while passing the flicker half — a diagnostic, not the shippable swap. Off
// unless LUCY_V2V_FAL_MODEL is set on the server (fully reversible).
// ---------------------------------------------------------------------------

export interface LaneCRoundtripInput {
  asset: Pick<ProjectAsset, "id" | "asset_type" | "file_url">;
  wardrobeFeatureId: string;
  artistId: string;
  transferMode?: "full_look" | "jacket_only";
  /** Override the auto-built garment-edit prompt (benchmark tuning). */
  prompt?: string;
  /**
   * Explicit clip range. When set, the shared server extractor seek+trims this
   * range out of the master first and Lucy edits THAT trimmed clip — so Lane C
   * runs on exactly the requested seconds, never the whole master. `targetFps`
   * is required to drive the shared extractor (its frames are reused by Lane
   * A/B for the same range via the idempotent extraction id).
   */
  serverExtract?: ServerExtractConfig;
  targetFps?: number;
  maxFrames?: number;
}

export interface LaneCRoundtripResult {
  sessionId: string;
  /** project-exports object path of the reassembled Lucy clip. */
  outPath: string;
  outBucket: string;
  engine: string;
  prompt: string;
}

/**
 * Phase — Lane C. Dispatch the whole clip to Lucy v2v and wait for the edited
 * mp4. No client-side extract/reassemble — Lucy returns a finished clip. Returns
 * once lucy_status reaches "ready" (throws on "failed" with the recorded reason).
 */
export async function runLaneCRoundtrip(input: LaneCRoundtripInput): Promise<LaneCRoundtripResult> {
  // Explicit clip range → produce the trimmed clip on the server first (dodges the
  // whole-master HEVC decode) and hand Lucy that clip, so Lane C edits exactly the
  // requested seconds. Without a range, Lucy edits the whole master (legacy).
  let sourceOverride: { sourceBucket: string; sourcePath: string } | undefined;
  if (input.serverExtract) {
    const clip = await extractClipFramesServer(
      {
        asset: input.asset,
        targetFps: input.targetFps,
        maxFrames: input.maxFrames,
        serverExtract: input.serverExtract,
      },
      { clipOnly: true },
    );
    if (clip.clipPath && clip.clipBucket) {
      sourceOverride = { sourceBucket: clip.clipBucket, sourcePath: clip.clipPath };
    }
  }

  const dispatch = await postEdge<{
    sessionId: string;
    outPath: string;
    outBucket: string;
    engine: string;
    prompt: string;
  }>("wardrobe-video-lucy-proxy", {
    assetId: input.asset.id,
    artistId: input.artistId,
    wardrobeFeatureId: input.wardrobeFeatureId,
    transferMode: input.transferMode ?? "jacket_only",
    prompt: input.prompt,
    ...sourceOverride,
  });

  const meta = await pollAssetStatus(
    input.asset.id,
    "lucy_status",
    "lucy_error",
    ["ready"],
    "lucy",
  );
  return {
    sessionId: dispatch.sessionId,
    outPath: String(meta.lucy_out_path ?? dispatch.outPath),
    outBucket: String(meta.lucy_out_bucket ?? dispatch.outBucket ?? FRAME_BUCKET),
    engine: String(meta.lucy_engine ?? dispatch.engine),
    prompt: dispatch.prompt,
  };
}
