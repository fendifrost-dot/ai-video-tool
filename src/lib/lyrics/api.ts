/**
 * The app's calls for lyric timing: one window to the hosted transcriber, and saving a timing the director accepted.
 */
import { supabase } from "@/lib/supabase";
import { decodeMono } from "@/lib/storyboard/syncAudio";
import type { AlignedLine, TranscriptWord } from "./align";
import { STT_SAMPLE_RATE, fillHoles, findHoles, hearHoles, hearSong, lyricLineRows, timeLyrics, type HearWindow, type HeardPart, type SecondListen, type TimingProgress, type TimingResult } from "./timing";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

type ProxyReply = { ok?: boolean; errorMessage?: string; words?: TranscriptWord[]; provider?: string; model?: string; estimatedCostUsd?: number | null };

export type TimingRun = TimingResult & { provider: string | null; model: string | null; estimatedCostUsd: number; parts: HeardPart[]; second: SecondListen | null };

/** Hear one window through lyric-align-proxy. */
async function hearWindow(projectId: string, wav: Uint8Array, prompt: string | null, language: string): Promise<ProxyReply> {
  const { data, error } = await supabase.functions.invoke("lyric-align-proxy", { body: { action: "transcribe", projectId, audioBase64: toBase64(wav), prompt, language } });
  if (error) {
    // the function's own message is in the response body, not in the client's generic error
    let detail = "";
    try {
      const body = (await (error as { context?: Response }).context?.json?.()) as ProxyReply | undefined;
      detail = body?.errorMessage ?? "";
    } catch {
      // no body to read
    }
    throw new Error(detail || error.message || "The transcriber could not be reached");
  }
  const reply = (data ?? {}) as ProxyReply;
  if (!reply.ok) throw new Error(reply.errorMessage || "The transcriber did not answer");
  return reply;
}

/**
 * Time a project's lyrics against its song: decode the song, hear it window by window, align, then hear again the
 * stretches where lines went unfound. Returns the timing for the director to look at; saves nothing.
 */
export async function runLyricTiming(input: {
  projectId: string;
  songUrl: string;
  lyrics: string;
  bpm?: number | null;
  onProgress?: (p: TimingProgress & { stage: "reading" | "listening" | "listening_again" | "aligning" }) => void;
  signal?: AbortSignal;
}): Promise<TimingRun> {
  input.onProgress?.({ stage: "reading", done: 0, total: 0 });
  const mono = await decodeMono(input.songUrl, "The song", STT_SAMPLE_RATE);
  let provider: string | null = null;
  let model: string | null = null;
  let cost = 0;
  const hear: HearWindow = async (wav, meta) => {
    const reply = await hearWindow(input.projectId, wav, meta.prompt, meta.language);
    provider = reply.provider ?? provider;
    model = reply.model ?? model;
    cost += reply.estimatedCostUsd ?? 0;
    return reply.words ?? [];
  };
  const heard = await hearSong(mono, STT_SAMPLE_RATE, input.lyrics, hear, { onProgress: (p) => input.onProgress?.({ stage: "listening", ...p }), signal: input.signal });
  input.onProgress?.({ stage: "aligning", done: heard.windows, total: heard.windows });
  // let the page paint before the alignment table is filled
  await new Promise((r) => setTimeout(r, 20));
  let timing = timeLyrics(input.lyrics, heard.words, heard.windows, input.bpm);
  let parts = heard.parts;
  let second: SecondListen | null = null;

  // the second listen: stretches where lines went unfound with song time to spare are heard again (timing.ts)
  const holes = findHoles(timing.lines, mono.length / STT_SAMPLE_RATE);
  if (holes.length) {
    try {
      const again = await hearHoles(mono, STT_SAMPLE_RATE, input.lyrics, holes, hear, { onProgress: (p) => input.onProgress?.({ stage: "listening_again", ...p }), signal: input.signal, maxCalls: heard.windows * 2 });
      parts = [...parts, ...again.parts];
      const filled = fillHoles(heard.words, holes, again.heard);
      second = { holes: holes.length, calls: again.calls, trusted: again.trusted, replaced: filled.replaced, coverageBefore: timing.coverage, coverageAfter: timing.coverage, used: false };
      if (filled.replaced > 0) {
        input.onProgress?.({ stage: "aligning", done: heard.windows, total: heard.windows });
        await new Promise((r) => setTimeout(r, 20));
        const retimed = timeLyrics(input.lyrics, filled.words, heard.windows, input.bpm);
        second.coverageAfter = retimed.coverage;
        if (retimed.coverage > timing.coverage) {
          timing = retimed;
          second.used = true;
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      // the first pass stands: a second listen that fails is not a reason to lose it
      second = { holes: holes.length, calls: 0, trusted: 0, replaced: 0, coverageBefore: timing.coverage, coverageAfter: timing.coverage, used: false };
    }
  }
  return { ...timing, provider, model, estimatedCostUsd: Math.round(cost * 10000) / 10000, parts, second };
}

/**
 * Store a timing as the project's lyric lines. The new lines are written over the old by line number first and only
 * then are any left-over old lines removed, so a failed write never leaves the project with no timing at all.
 */
export async function saveLyricTiming(projectId: string, lines: readonly AlignedLine[], source: string): Promise<number> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  if (!lines.length) throw new Error("There are no timed lines to save");
  const now = new Date().toISOString();
  const rows = lyricLineRows(lines, projectId, data.user.id, source).map((r) => ({ ...r, updated_at: now }));
  const { error } = await supabase.from("lyric_lines").upsert(rows, { onConflict: "project_id,line_index" });
  if (error) throw new Error(error.message);
  const kept = rows.map((r) => r.line_index);
  const { error: tidyError } = await supabase.from("lyric_lines").delete().eq("project_id", projectId).not("line_index", "in", `(${kept.join(",")})`);
  if (tidyError) throw new Error(tidyError.message);
  return rows.length;
}
