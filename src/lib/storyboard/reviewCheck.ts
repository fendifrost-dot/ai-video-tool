/**
 * Review → "Check this cut": everything about a cut that can be proved without watching it, on the project's real
 * files, from any tab.
 *
 *   1. every file the cut plays — the song, the take, each clip and image — resolves, is what its record says, and
 *      decodes at the points the cut enters it (lib/media/probe.ts: no media element, so it also runs in a window
 *      that is not on screen, where a browser will not load a <video> at all);
 *   2. the player's own decisions over the whole song agree with the records (verify.ts);
 *   3. the player on the page holds the link of the file each shot selects;
 *   4. where the window is on screen: the real player is put at a spread of moments and each shot's video is read
 *      back from the element.
 *
 * What it cannot prove is what only eyes can: that the picture looks right. It says so.
 */
import { decodeFrameAt, httpRange, probeAudio, probeVideo, type AudioProbe, type FrameDecode, type VideoProbe } from "@/lib/media/probe";
import { segmentAt, videoStateAt, type Assignment, type MediaAsset, type TakeSync, type TimelineSegment } from "./media";
import { verifyCut, type CheckResult, type CutVerification } from "./verify";

export type MediaRefLike = { bucket: string; path: string };

export type FileReport = {
  assetId: string;
  name: string;
  /** What it is in this cut. */
  use: "take" | "ai clip" | "ai image" | "b-roll" | "other";
  /** The file the player asks for (a lighter copy when the asset has one, else the file itself). */
  plays: MediaRefLike;
  shots: number;
  resolves: boolean;
  status: number;
  contentType: string | null;
  bytes: number | null;
  container: string;
  codec: string | null;
  width: number | null;
  height: number | null;
  seconds: number | null;
  hasAudio: boolean | null;
  /** The frames decoded: one at each of a spread of the points where the cut enters the file. */
  decoded: FrameDecode[];
  note: string | null;
  ok: boolean;
};

export type LiveSample = { songTime: number; key: string; expected: number | null; got: number | null; ready: boolean; ok: boolean; note: string | null };
export type LiveReport = { ran: boolean; reason: string | null; samples: LiveSample[]; ok: boolean };

export type ReviewCheckReport = {
  version: 1;
  at: string;
  /** Whether this browser window was on screen when the check ran. */
  window: "on screen" | "not on screen";
  song: (AudioProbe & { name: string; plays: MediaRefLike; analysisSeconds: number | null; ok: boolean }) | null;
  files: FileReport[];
  cut: CutVerification;
  player: CheckResult;
  live: LiveReport;
  ok: boolean;
  /** What the check did not look at. */
  notChecked: string[];
};

export type ReviewCheckInput = {
  timeline: readonly TimelineSegment[];
  boxes: readonly { id: string; key: string; start: number; end: number }[];
  assignments: readonly Assignment[];
  assets: ReadonlyMap<string, MediaAsset>;
  syncs: readonly TakeSync[];
  song: { ref: MediaRefLike; name: string; analysisSeconds: number | null } | null;
  /** The file the player loads for an asset. */
  playbackRef: (asset: MediaAsset) => MediaRefLike;
  refKey: (ref: MediaRefLike) => string;
  sign: (refs: MediaRefLike[]) => Promise<Record<string, string>>;
  onProgress?: (text: string) => void;
  /** The page's own player, for the checks that read it. Null when there is no player on the page. */
  player?: PlayerHandle | null;
};

/** The player's elements on the page. */
export type PlayerHandle = {
  audio: HTMLAudioElement | null;
  /** assetId → the <video> the player holds for it. */
  videos: Map<string, HTMLVideoElement>;
};

const roleInCut = (seg: TimelineSegment): FileReport["use"] => {
  if (seg.media.kind === "none") return "other";
  const r = seg.media.role;
  return r === "performance" ? "take" : r === "generated_clip" ? "ai clip" : r === "generated_image" ? "ai image" : r === "b_roll" ? "b-roll" : "other";
};

/** Up to `n` values spread across a sorted list: the first, the last, and evenly between. */
export function spread<T>(values: readonly T[], n: number): T[] {
  if (values.length <= n) return [...values];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}

const pathOfUrl = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url, "http://x").pathname);
  } catch {
    return url;
  }
};

async function probeImage(url: string): Promise<{ resolves: boolean; status: number; contentType: string | null; bytes: number | null; width: number | null; height: number | null; note: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { resolves: false, status: res.status, contentType: res.headers.get("content-type"), bytes: null, width: null, height: null, note: `the link answered ${res.status}` };
    const blob = await res.blob();
    let width: number | null = null;
    let height: number | null = null;
    let note: string | null = null;
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        note = "the picture could not be decoded";
      }
    }
    return { resolves: true, status: res.status, contentType: res.headers.get("content-type"), bytes: blob.size, width, height, note };
  } catch (e) {
    return { resolves: false, status: 0, contentType: null, bytes: null, width: null, height: null, note: e instanceof Error ? e.message : "could not be fetched" };
  }
}

/** Put the real player at a spread of moments and read each shot's video back from its element. */
async function liveCheck(input: ReviewCheckInput, fileSeconds: ReadonlyMap<string, number>): Promise<LiveReport> {
  const player = input.player;
  if (typeof document === "undefined" || document.visibilityState !== "visible") {
    return { ran: false, reason: "this browser window is not on screen — a browser does not load video or sound in a window that is not shown", samples: [], ok: true };
  }
  if (!player?.audio) return { ran: false, reason: "there is no player on this page to read", samples: [], ok: true };
  const audio = player.audio;
  const wasPaused = audio.paused;
  if (!wasPaused) audio.pause();
  const back = audio.currentTime;
  // a moment just inside every cut, and the middle of every shot — spread over the song
  const moments = spread(
    input.timeline.flatMap((s) => [s.start + 0.3, (s.start + s.end) / 2]).filter((t, i, all) => all.indexOf(t) === i),
    24,
  );
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const samples: LiveSample[] = [];
  for (const t of moments) {
    const seg = segmentAt(input.timeline, t);
    if (!seg) continue;
    audio.currentTime = t;
    await wait(120);
    if (seg.media.kind !== "video") {
      samples.push({ songTime: t, key: seg.key, expected: null, got: null, ready: true, ok: true, note: seg.media.kind === "image" ? "an image" : "no footage on this shot" });
      continue;
    }
    const el = player.videos.get(seg.media.assetId) ?? null;
    const state = videoStateAt(seg, t, fileSeconds.get(seg.media.assetId) ?? null);
    if (!el || !state) {
      samples.push({ songTime: t, key: seg.key, expected: state?.at ?? null, got: null, ready: false, ok: false, note: "the player has no video element for this shot's file" });
      continue;
    }
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (!el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - state.at) <= 0.25) {
        ready = true;
        break;
      }
      await wait(100);
    }
    const got = el.currentTime;
    const ok = ready && Math.abs(got - state.at) <= 0.25;
    samples.push({ songTime: Math.round(t * 1000) / 1000, key: seg.key, expected: Math.round(state.at * 1000) / 1000, got: Math.round(got * 1000) / 1000, ready, ok, note: ok ? null : ready ? "the video is not where the song clock puts it" : "the video did not become ready at this point" });
  }
  audio.currentTime = back;
  return { ran: true, reason: null, samples, ok: samples.every((s) => s.ok) };
}

export async function runReviewCheck(input: ReviewCheckInput): Promise<ReviewCheckReport> {
  const say = input.onProgress ?? (() => undefined);
  const notChecked = ["how the picture looks — only watching it shows that", "transitions, camera moves on takes and the grade: Review does not show them"];

  // the files this cut plays, each once
  const used = new Map<string, { asset: MediaAsset; use: FileReport["use"]; entries: number[]; shots: number }>();
  for (const seg of input.timeline) {
    if (seg.media.kind === "none") continue;
    const asset = input.assets.get(seg.media.assetId);
    if (!asset) continue;
    const row = used.get(asset.id) ?? { asset, use: roleInCut(seg), entries: [], shots: 0 };
    row.shots += 1;
    if (seg.media.kind === "video") row.entries.push(seg.media.sourceIn);
    used.set(asset.id, row);
  }

  say("Opening the files…");
  const refs = [...used.values()].map((u) => input.playbackRef(u.asset));
  if (input.song) refs.push(input.song.ref);
  const urls = await input.sign(refs);

  // ---- the song --------------------------------------------------------------------------------------------------
  let song: ReviewCheckReport["song"] = null;
  if (input.song) {
    say("Reading the song…");
    const url = urls[input.refKey(input.song.ref)];
    const probe: AudioProbe = url ? await probeAudio(httpRange(url)) : { resolves: false, status: 0, contentType: null, totalBytes: null, format: "other", seconds: null, sampleRate: null, channels: null, decodes: null, note: "no link could be made for the song" };
    const lengthAgrees = probe.seconds === null || input.song.analysisSeconds === null || Math.abs(probe.seconds - input.song.analysisSeconds) < 1;
    song = { ...probe, name: input.song.name, plays: input.song.ref, analysisSeconds: input.song.analysisSeconds, ok: probe.resolves && probe.decodes !== false && lengthAgrees, note: probe.note ?? (lengthAgrees ? null : `the file is ${probe.seconds?.toFixed(2)} s; the analysis says ${input.song.analysisSeconds?.toFixed(2)} s`) };
  }

  // ---- every file the cut plays ----------------------------------------------------------------------------------
  const files: FileReport[] = [];
  const fileSeconds = new Map<string, number>();
  let n = 0;
  for (const u of used.values()) {
    n += 1;
    say(`Reading ${u.asset.name} (${n} of ${used.size})…`);
    const plays = input.playbackRef(u.asset);
    const url = urls[input.refKey(plays)];
    const base = { assetId: u.asset.id, name: u.asset.name, use: u.use, plays, shots: u.shots };
    if (!url) {
      files.push({ ...base, resolves: false, status: 0, contentType: null, bytes: null, container: "unknown", codec: null, width: null, height: null, seconds: null, hasAudio: null, decoded: [], note: "no link could be made for this file", ok: false });
      continue;
    }
    if (u.asset.isImage && !u.asset.isVideo) {
      const img = await probeImage(url);
      files.push({ ...base, resolves: img.resolves, status: img.status, contentType: img.contentType, bytes: img.bytes, container: "image", codec: null, width: img.width, height: img.height, seconds: null, hasAudio: null, decoded: [], note: img.note, ok: img.resolves && img.note === null });
      continue;
    }
    const read = httpRange(url);
    const probe: VideoProbe = await probeVideo(read);
    const decoded: FrameDecode[] = [];
    if (probe.video) {
      fileSeconds.set(u.asset.id, probe.video.duration);
      const points = spread([...new Set(u.entries.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b), 6);
      for (const at of points) {
        say(`Decoding ${u.asset.name} at ${at.toFixed(1)} s…`);
        decoded.push(await decodeFrameAt(read, probe.video, Math.min(at, Math.max(0, probe.video.duration - 0.05))));
      }
    }
    const decodedOk = decoded.length > 0 && decoded.every((d) => d.ok);
    files.push({
      ...base,
      resolves: probe.resolves,
      status: probe.status,
      contentType: probe.contentType,
      bytes: probe.totalBytes,
      container: probe.container,
      codec: probe.video?.codec ?? probe.video?.format ?? null,
      width: probe.video?.width ?? null,
      height: probe.video?.height ?? null,
      seconds: probe.video ? Math.round(probe.video.duration * 1000) / 1000 : null,
      hasAudio: probe.info ? probe.hasAudio : null,
      decoded,
      note: probe.note ?? (decoded.find((d) => !d.ok)?.note ?? null),
      // a container this reader does not parse (WebM) is reported, not failed: its link resolved and the cut check uses its recorded length
      ok: probe.resolves && (probe.container === "webm" ? true : !!probe.video && decodedOk),
    });
  }

  // ---- the cut, run without playing ------------------------------------------------------------------------------
  say("Running the cut against the song clock…");
  const cut = verifyCut({ timeline: input.timeline, boxes: input.boxes, assignments: input.assignments, assets: input.assets, syncs: input.syncs, fileSeconds, songSeconds: song?.seconds ?? input.song?.analysisSeconds ?? null });

  // ---- the page's player holds the right links -------------------------------------------------------------------
  const playerFailures: string[] = [];
  let held = 0;
  if (input.player) {
    for (const u of used.values()) {
      if (!u.asset.isVideo) continue;
      const el = input.player.videos.get(u.asset.id);
      const want = input.playbackRef(u.asset).path;
      if (!el) {
        playerFailures.push(`${u.asset.name}: the player has no video for it`);
        continue;
      }
      held += 1;
      const src = el.currentSrc || el.src;
      if (!pathOfUrl(src).endsWith(want)) playerFailures.push(`${u.asset.name}: the player's link points at ${pathOfUrl(src).split("/").pop()}, not at ${want.split("/").pop()}`);
    }
    if (input.song) {
      const src = input.player.audio ? input.player.audio.currentSrc || input.player.audio.src : "";
      if (!input.player.audio) playerFailures.push("the player has no song loaded");
      else if (!pathOfUrl(src).endsWith(input.song.ref.path)) playerFailures.push("the player's song link is not this project's song");
    }
  }
  const player: CheckResult = {
    id: "player",
    label: "The player on this page holds the link of each shot's own file",
    ok: playerFailures.length === 0,
    detail: input.player ? `${held} video link${held === 1 ? "" : "s"}${input.song ? " and the song" : ""} compared` : "no player on this page",
    failures: playerFailures,
  };

  say("Reading the player…");
  const live = await liveCheck(input, fileSeconds);
  if (!live.ran && live.reason) notChecked.unshift(`frames on the real player: ${live.reason}`);

  const ok = (song?.ok ?? true) && files.every((f) => f.ok) && cut.ok && player.ok && live.ok;
  return { version: 1, at: new Date().toISOString(), window: typeof document !== "undefined" && document.visibilityState === "visible" ? "on screen" : "not on screen", song, files, cut, player, live, ok, notChecked };
}
