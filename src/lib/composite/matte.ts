/**
 * The matte, from the browser's side: ask the edge function to send the dressed take to the segmentation model (it
 * signs the file and goes through Control Center), wait on the queue through fal-queue-poll-proxy, download the
 * answer and keep the ALPHA video — the grey one of the two the model returns. The edge function writes the spend
 * record (a provider_jobs row); the browser finishes it with what it filed, or with the failure.
 */
import { supabase } from "@/lib/supabase";
import { probeVideo } from "@/lib/media/probe";
import type { Mp4Track } from "@/lib/media/mp4";
import type { Json } from "@/integrations/supabase/types";
import { bytesRead, readFrames } from "./frameReader";
import { isMatteAnswerUrl, MATTE_MAX_ANSWER_BYTES, matteResultUrls } from "./matteRequest";
import { isGrayscale } from "./pixels";

export type MatteHandle = {
  /** The provider_jobs row the edge function wrote for this spend. */
  jobId: string;
  model: string;
  status_url: string;
  response_url: string;
  source: {
    assetId: string;
    seconds: number;
    frames: number;
    bytes: number;
    bucket: string;
    path: string;
  };
  estimate: { usd: number; upper: number; text: string };
};

export type MatteFile = { url: string; bytes: Uint8Array; track: Mp4Track; frames: number };

async function detailOf(error: unknown, data: unknown): Promise<string> {
  const d = data as { error?: unknown; detail?: unknown } | null;
  if (d && (typeof d.detail === "string" || typeof d.error === "string"))
    return [d.error, d.detail].filter((x) => typeof x === "string").join(": ");
  const e = error as { context?: Response; message?: string } | null;
  if (e?.context && typeof e.context.json === "function") {
    try {
      const body = (await e.context.json()) as { error?: unknown; detail?: unknown };
      if (typeof body.error === "string" || typeof body.detail === "string")
        return [body.error, body.detail].filter((x) => typeof x === "string").join(": ");
    } catch {
      // not json
    }
  }
  return e?.message ?? "the matte could not be requested";
}

/** Send the take for matting. Money is spent on the model's side the moment this returns a handle. */
export async function requestMatte(assetId: string): Promise<MatteHandle> {
  const { data, error } = await supabase.functions.invoke<MatteHandle & { ok?: boolean }>(
    "matte-video-proxy",
    {
      body: { assetId },
    },
  );
  if (error || !data || data.ok === false || !data.status_url || !data.response_url || !data.jobId)
    throw new Error(await detailOf(error, data));
  return data;
}

/** The request's id, as a short name for the record (the status link's last path part). */
export function matteRequestId(handle: Pick<MatteHandle, "status_url">): string | null {
  const m = /\/requests\/([^/]+)\//.exec(handle.status_url);
  return m ? m[1] : null;
}

/** Close the spend record: what was filed from it, or why nothing was. */
export async function finishMatteJob(
  jobId: string,
  outcome: { ok: true; resultAssetId: string; mattePath: string } | { ok: false; error: string },
): Promise<void> {
  const patch = outcome.ok
    ? {
        status: "succeeded",
        result_asset_id: outcome.resultAssetId,
        response_payload_json: { status: "COMPLETED", matte_path: outcome.mattePath } as Json,
        finalized_at: new Date().toISOString(),
      }
    : {
        status: "failed",
        error_text: outcome.error.slice(0, 500),
        finalized_at: new Date().toISOString(),
      };
  const { error } = await supabase
    .from("provider_jobs")
    .update(patch as never)
    .eq("id", jobId);
  if (error) console.warn(`the matte's record could not be closed: ${error.message}`);
}

export type MatteWait = {
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (status: string, elapsedMs: number) => void;
  signal?: AbortSignal;
};

/** Wait for the model's answer: the links it returned. Throws on failure or after `timeoutMs` (15 minutes). */
export async function waitForMatte(
  handle: Pick<MatteHandle, "status_url" | "response_url">,
  opts: MatteWait = {},
): Promise<{ urls: string[]; result: unknown }> {
  const interval = opts.intervalMs ?? 4000;
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  const began = Date.now();
  for (;;) {
    if (opts.signal?.aborted) throw new Error("stopped");
    const { data, error } = await supabase.functions.invoke<{
      status?: string;
      result?: unknown;
      error?: string;
      detail?: string;
      fal_error_detail?: unknown;
    }>("fal-queue-poll-proxy", {
      body: { status_url: handle.status_url, response_url: handle.response_url },
    });
    if (error || !data) throw new Error(await detailOf(error, data));
    if (data.error)
      throw new Error(
        `the matte failed: ${data.error}${data.detail ? ` (${data.detail})` : ""}${data.fal_error_detail ? ` — ${JSON.stringify(data.fal_error_detail).slice(0, 300)}` : ""}`,
      );
    const status = data.status ?? "UNKNOWN";
    opts.onTick?.(status, Date.now() - began);
    if (status === "COMPLETED") {
      const urls = matteResultUrls(data.result);
      if (urls.length === 0)
        throw new Error("the matte finished but answered with no video from Fal");
      return { urls, result: data.result };
    }
    if (Date.now() - began > timeout) throw new Error("the matte did not finish in time");
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Download one answer file (Fal's own link, under the byte cap) and index it. */
export async function downloadMatteFile(url: string): Promise<MatteFile> {
  if (!isMatteAnswerUrl(url)) throw new Error("the matte's link is not one of Fal's");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the matte could not be downloaded (${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MATTE_MAX_ANSWER_BYTES)
    throw new Error("the matte file is too large to read here");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MATTE_MAX_ANSWER_BYTES)
    throw new Error("the matte file is too large to read here");
  const probe = await probeVideo(bytesRead(bytes, res.headers.get("content-type")));
  if (!probe.video) throw new Error(probe.note ?? "the matte is not a video this browser can read");
  return { url, bytes, track: probe.video, frames: probe.video.sampleCount };
}

/** Whether a file's first frame is grey — the alpha video, as against the RGB one beside it. */
export async function firstFrameIsGray(file: MatteFile): Promise<boolean> {
  for await (const f of readFrames(bytesRead(file.bytes), file.track)) return isGrayscale(f.rgba);
  return false;
}

/**
 * Of the files the model answered with, the alpha video. With one file it is taken as the alpha; with several, the
 * grey one. Every file is downloaded (they are small) so the choice is made by looking, not by position.
 */
export async function pickAlphaFile(
  urls: string[],
): Promise<{ alpha: MatteFile; others: MatteFile[] }> {
  const files = await Promise.all(urls.map(downloadMatteFile));
  if (files.length === 1) return { alpha: files[0], others: [] };
  const flags = await Promise.all(files.map(firstFrameIsGray));
  const idx = flags.findIndex(Boolean);
  if (idx < 0) throw new Error("none of the model's files is a grey alpha video");
  return { alpha: files[idx], others: files.filter((_, i) => i !== idx) };
}
