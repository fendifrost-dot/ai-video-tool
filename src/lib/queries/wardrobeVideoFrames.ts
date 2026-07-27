// Phase 2a orchestration — the encoder roundtrip for wardrobe video propagation.
//
// Extract every frame of a master clip (client-side WebCodecs, full res),
// upload them to Storage in order, then ask wardrobe-video-reassemble-proxy to
// mux them back into a clip via Fal `ffmpeg-api/compose` (through Control
// Center). No garment swap yet — this proves master → frames → video with audio
// before Phase 2b inserts the per-frame swap between extract and reassemble.
//
// See src/lib/video/extractFrames.ts and the reassemble edge function.
import { supabase } from "@/lib/supabase";
import { getSessionWithTimeout, getAccessTokenWithTimeout } from "@/lib/authSession";
import { bucketForAssetType } from "@/lib/queries/projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { extractFramesFromUrl, type ExtractFramesOptions } from "@/lib/video/extractFrames";

const FRAME_BUCKET = "project-exports";
const SIGN_TTL = 3600;
const UPLOAD_CONCURRENCY = 4;

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

/**
 * Run the full extract → upload → reassemble roundtrip. Returns once the
 * reassemble job is DISPATCHED (it finishes in the edge background task; poll
 * the asset's metadata_json.reassemble_status for "ready").
 */
export async function runFrameRoundtrip(input: RoundtripInput): Promise<RoundtripResult> {
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

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/wardrobe-video-reassemble-proxy`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: input.asset.id,
        sessionId,
        framePaths,
        frameBucket: FRAME_BUCKET,
        fps: extracted.fps,
        includeAudio: input.includeAudio ?? true,
      }),
    },
  );
  if (!resp.ok) {
    let detail = "";
    try {
      const body = await resp.json();
      detail = body?.detail ?? body?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`reassemble dispatch failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  const body = (await resp.json()) as { outPath?: string };

  return {
    sessionId,
    frameCount: total,
    fps: extracted.fps,
    truncated: extracted.truncated,
    outPath: body.outPath ?? "",
  };
}
