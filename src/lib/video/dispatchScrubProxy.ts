/**
 * Scrub-proxy dispatch — kick off the ~720p H.264 transcode after a video upload.
 *
 * The client just wrote a `project_assets` row for a (possibly 2 GB 4K) master.
 * This asks the `make-scrub-proxy-proxy` edge function to transcode a lightweight
 * scrub proxy next to it and write the proxy pointer onto the asset's
 * `metadata_json` (see scrubProxy.ts for the contract). Until that lands, the
 * scrubber falls back to the master — so this dispatch is best-effort: a failure
 * to kick it off must never fail the upload itself.
 */

import { supabase } from "@/lib/supabase";
import { readScrubProxyMeta } from "@/lib/video/scrubProxy";

/** Fields of the freshly-created asset the dispatch decision needs. */
export interface ScrubProxyDispatchInput {
  mimeType?: string | null;
  fileUrl: string;
  metadata?: unknown;
}

/**
 * Should we dispatch a transcode for this asset? Only for videos that don't
 * already have a proxy in flight or ready. Pure — unit-tested independent of
 * the network call.
 */
export function shouldDispatchScrubProxy(input: ScrubProxyDispatchInput): boolean {
  const isVideo =
    (typeof input.mimeType === "string" && input.mimeType.startsWith("video/")) ||
    /\.(mp4|mov|webm|m4v|mkv)$/i.test(input.fileUrl);
  if (!isVideo) return false;

  const status = readScrubProxyMeta(input.metadata).scrub_proxy_status;
  // "pending"/"failed"/undefined are all fair game to (re)dispatch; skip when a
  // proxy is already ready or actively being built, and when the preflight flagged
  // "needs_transcode" (terminal — a 4K master needs a non-Fal mezzanine first;
  // re-dispatching would just re-probe and re-flag).
  return status !== "ready" && status !== "processing" && status !== "needs_transcode";
}

/**
 * Fire the transcode for a just-uploaded video asset. Best-effort: swallows
 * errors (logs them) so it can be awaited from the uploader without risking the
 * upload's success reporting. Returns true when the dispatch was accepted.
 */
export async function dispatchScrubProxy(
  assetId: string,
  input: ScrubProxyDispatchInput,
): Promise<boolean> {
  if (!shouldDispatchScrubProxy(input)) return false;
  try {
    const { error } = await supabase.functions.invoke("make-scrub-proxy-proxy", {
      body: { assetId },
    });
    if (error) {
      console.warn("scrub proxy dispatch failed:", error.message ?? error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("scrub proxy dispatch threw:", err);
    return false;
  }
}
