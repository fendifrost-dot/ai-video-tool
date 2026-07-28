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

const FRAME_BUCKET = "project-exports";
const SIGN_TTL = 3600;
const UPLOAD_CONCURRENCY = 4;
const SWAP_POLL_INTERVAL_MS = 5000;
const SWAP_POLL_TIMEOUT_MS = 12 * 60 * 1000;

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
 * Poll an asset's metadata_json until `key` reaches "ready" (resolves the meta)
 * or "failed" (throws with the recorded error). Times out.
 */
async function pollAssetStatus(
  assetId: string,
  key: string,
  errorKey: string,
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
    if (status === "ready") return meta;
    if (status === "failed") throw new Error(String(meta[errorKey] ?? `${key} failed`));
    await new Promise((r) => setTimeout(r, SWAP_POLL_INTERVAL_MS));
  }
  throw new Error(`${key} timed out`);
}

/**
 * Phase 2a — extract → upload → reassemble (no swap). Returns once reassemble is
 * DISPATCHED; poll metadata_json.reassemble_status for "ready".
 */
export async function runFrameRoundtrip(input: RoundtripInput): Promise<RoundtripResult> {
  const up = await extractAndUploadFrames(input);
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
  const up = await extractAndUploadFrames(input);

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

  const meta = await pollAssetStatus(input.asset.id, "swap_status", "swap_error");
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
