/**
 * The matte, from the browser's side: ask the edge function to send the dressed take to the segmentation model (it
 * signs the file and goes through Control Center), wait on the queue through fal-queue-poll-proxy, download the
 * answer and keep the ALPHA video — the grey one of the two the model returns. The edge function writes the spend
 * record (a provider_jobs row carrying the queue links); the browser finishes it with what it filed, or with the
 * failure — and a matte still running from an earlier press (a closed tab, a lost connection) is picked up from
 * that row rather than paid for again.
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
  estimate: { usd: number; upper: number; text: string } | null;
  /** True when the handle came from a row an earlier press left running, not from a new submit. */
  resumed: boolean;
};

export type MatteFile = { url: string; bytes: Uint8Array; track: Mp4Track; frames: number };

/** A matte asked for this long ago is still worth picking up (the queue finishes well inside it). */
const RESUME_WINDOW_MS = 20 * 60_000;

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

/** A matte of this asset an earlier press left running, with its queue links, when there is one. */
export async function findRunningMatte(assetId: string): Promise<MatteHandle | null> {
  const since = new Date(Date.now() - RESUME_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("provider_jobs")
    .select("id, request_payload_json, response_payload_json")
    .eq("provider", "fal")
    .eq("status", "running")
    .eq("request_payload_json->>lane", "matte")
    .eq("request_payload_json->>assetId", assetId)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as
    | {
        id: string;
        request_payload_json: { model?: string; estimate?: MatteHandle["estimate"] } | null;
        response_payload_json: { status_url?: string; response_url?: string } | null;
      }
    | undefined;
  if (!row?.response_payload_json?.status_url || !row.response_payload_json.response_url)
    return null;
  return {
    jobId: row.id,
    model: row.request_payload_json?.model ?? "",
    status_url: row.response_payload_json.status_url,
    response_url: row.response_payload_json.response_url,
    estimate: row.request_payload_json?.estimate ?? null,
    resumed: true,
  };
}

/** Send the take for matting. Money is spent on the model's side the moment this returns a handle. */
export async function requestMatte(assetId: string): Promise<MatteHandle> {
  const { data, error } = await supabase.functions.invoke<
    Omit<MatteHandle, "resumed"> & { ok?: boolean }
  >("matte-video-proxy", { body: { assetId } });
  if (error || !data || data.ok === false || !data.status_url || !data.response_url || !data.jobId)
    throw new Error(await detailOf(error, data));
  return { ...data, estimate: data.estimate ?? null, resumed: false };
}

/** The matte for an asset: the one still running from an earlier press, else a new request. */
export async function obtainMatte(assetId: string): Promise<MatteHandle> {
  return (await findRunningMatte(assetId)) ?? requestMatte(assetId);
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

/** A poll that did not reach the queue is tried again this many times (backing off) before the wait gives up. */
const POLL_RETRIES = 3;

/**
 * Wait for the model's answer: the links it returned. A failure to REACH the queue is retried; a failure the queue
 * REPORTS (Fal's own error) is final. Throws after `timeoutMs` (15 minutes).
 */
export async function waitForMatte(
  handle: Pick<MatteHandle, "status_url" | "response_url">,
  opts: MatteWait = {},
): Promise<{ urls: string[]; result: unknown }> {
  const interval = opts.intervalMs ?? 4000;
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  const began = Date.now();
  let misses = 0;
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
    if (error || !data) {
      misses += 1;
      if (misses > POLL_RETRIES) throw new Error(await detailOf(error, data));
      await new Promise((r) => setTimeout(r, interval * misses));
      continue;
    }
    misses = 0;
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

/** How much of a grey picture is near black or near white — an alpha matte is almost all one or the other. */
export function bimodality(rgba: Uint8ClampedArray | Uint8Array): number {
  const n = rgba.length / 4;
  if (n === 0) return 0;
  let ends = 0;
  for (let i = 0; i < n; i++) {
    const v = rgba[i * 4];
    if (v <= 8 || v >= 247) ends += 1;
  }
  return ends / n;
}

/** An alpha video on three spread frames: grey on every one, and mostly black-or-white. */
export type AlphaLook = { gray: boolean; bimodal: number };
export async function alphaLook(file: MatteFile): Promise<AlphaLook> {
  const n = file.track.sampleCount;
  const wanted = new Set([0, Math.floor(n / 2), Math.max(0, n - 1)]);
  let gray = true;
  let bimodal = 0;
  let seen = 0;
  const last = Math.max(...wanted);
  for await (const f of readFrames(bytesRead(file.bytes), file.track)) {
    if (wanted.has(f.index)) {
      gray = gray && isGrayscale(f.rgba);
      bimodal += bimodality(f.rgba);
      seen += 1;
    }
    if (f.index >= last) break;
  }
  return { gray, bimodal: seen ? bimodal / seen : 0 };
}

/** Which of the files is the alpha, from how they look: grey throughout, and the most black-or-white of those. */
export function chooseAlpha(looks: AlphaLook[]): number {
  const grey = looks.map((l, i) => ({ l, i })).filter((x) => x.l.gray);
  if (grey.length === 0) return -1;
  if (grey.length === 1) return grey[0].i;
  grey.sort((a, b) => b.l.bimodal - a.l.bimodal);
  // two files both grey and both matte-like cannot be told apart: refuse rather than guess
  if (grey[0].l.bimodal - grey[1].l.bimodal < 0.15) return -1;
  return grey[0].i;
}

/**
 * Of the files the model answered with, the alpha video. With one file it is taken as the alpha; with several, the
 * one that looks like a matte on three spread frames (an RGB video that opens on black no longer passes for it).
 * Every file is downloaded (they are small) so the choice is made by looking, not by position.
 */
export async function pickAlphaFile(
  urls: string[],
): Promise<{ alpha: MatteFile; others: MatteFile[] }> {
  const files = await Promise.all(urls.map(downloadMatteFile));
  if (files.length === 1) return { alpha: files[0], others: [] };
  const looks = await Promise.all(files.map(alphaLook));
  const idx = chooseAlpha(looks);
  if (idx < 0) throw new Error("none of the model's files can be told to be the alpha video");
  return { alpha: files[idx], others: files.filter((_, i) => i !== idx) };
}
