// The slice of the song's vocals under a clip, read as byte ranges of the stem WAV (never decoded): the header, then
// the samples of [start, end) on whole frames, re-wrapped as a WAV of their own (silence before the song begins).
// Used by lipsync-shot and by montage-shot's continuous takes (@Audio1).

import { buildWav, parseWavHead, wavSliceRange } from "./lipsync.ts";

export type VocalSlice = { ok: true; wav: Uint8Array } | { ok: false; status: number; error: string; detail?: string };

/** `url` is a signed URL of the stem; `fileBytes` its size when the asset records it (else read from Content-Range). */
export async function sliceVocals(url: string, fileBytes: number | null, window: [number, number]): Promise<VocalSlice> {
  const headResp = await fetch(url, { headers: { Range: "bytes=0-65535" } });
  if (!headResp.ok) return { ok: false, status: 502, error: "vocals_read_failed", detail: `HTTP ${headResp.status}` };
  const total = fileBytes ?? Number(/\/(\d+)$/.exec(headResp.headers.get("content-range") ?? "")?.[1] ?? NaN);
  if (!Number.isFinite(total)) return { ok: false, status: 500, error: "vocals_size_unknown" };
  let layout;
  try {
    layout = parseWavHead(new Uint8Array(await headResp.arrayBuffer()), total);
  } catch (e) {
    return { ok: false, status: 500, error: "vocals_not_wav", detail: e instanceof Error ? e.message : String(e) };
  }
  const range = wavSliceRange(layout, window[0], window[1] - window[0]);
  if (range.to <= range.from) return { ok: false, status: 400, error: "clip_past_the_song" };
  const pcmResp = await fetch(url, { headers: { Range: `bytes=${range.from}-${range.to - 1}` } });
  if (!pcmResp.ok) return { ok: false, status: 502, error: "vocals_read_failed", detail: `HTTP ${pcmResp.status}` };
  return { ok: true, wav: buildWav(layout.fmtChunk, new Uint8Array(await pcmResp.arrayBuffer()), range.padHeadBytes) };
}
