/**
 * Look inside a media file over the network without a media element: resolve its link, read its container, find a
 * moment's frame and decode it. Works in a tab whose window is not on screen — where a <video> never loads — so the
 * footage of a project can be checked from anywhere the app is open.
 *
 * `RangeRead` is the only thing that touches the network; tests hand in one that reads a file from disk.
 */
import { parseMoov, parseWavHeader, readBoxHeader, sniffIsoBmff, type Mp4Info, type Mp4Track } from "./mp4";

export type RangeResult = { status: number; bytes: Uint8Array; total: number | null; contentType: string | null };
export type RangeRead = (start: number, endInclusive: number) => Promise<RangeResult>;

/** Byte ranges of a URL. `total` is the whole file's length when the server says. */
export function httpRange(url: string): RangeRead {
  // a server need not let a page read `Content-Range`; the whole length is then asked for once, by itself
  let known: number | null | undefined;
  const whole = async (): Promise<number | null> => {
    if (known !== undefined) return known;
    try {
      const res = await fetch(url, { method: "HEAD" });
      const length = res.ok ? res.headers.get("content-length") : null;
      known = length && Number(length) > 0 ? Number(length) : null;
    } catch {
      known = null;
    }
    return known;
  };
  return async (start, endInclusive) => {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${endInclusive}` } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentRange = res.headers.get("content-range");
    const m = contentRange ? /\/(\d+)\s*$/.exec(contentRange) : null;
    const length = res.headers.get("content-length");
    let total = m ? Number(m[1]) : res.status === 200 && length ? Number(length) : null;
    if (total === null && res.status === 206) total = await whole();
    else if (total !== null) known = total;
    return { status: res.status, bytes, total, contentType: res.headers.get("content-type") };
  };
}

const HEAD_BYTES = 256 * 1024;
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

export type VideoProbe = {
  resolves: boolean;
  status: number;
  contentType: string | null;
  totalBytes: number | null;
  container: "mp4" | "webm" | "unknown";
  /** Where the index of the file is: at the front (streams at once) or at the end (the player must fetch the end first). */
  index: "front" | "end" | null;
  info: Mp4Info | null;
  video: Mp4Track | null;
  hasAudio: boolean;
  note: string | null;
};

/** Find and read the `moov` box, wherever in the file it is. */
async function readMoov(read: RangeRead, head: RangeResult): Promise<{ moov: Uint8Array; index: "front" | "end" } | null> {
  let offset = 0;
  let buffer = head.bytes;
  let base = 0;
  for (let guard = 0; guard < 64; guard++) {
    let box = readBoxHeader(buffer, offset - base, base);
    if (!box) {
      const more = await read(offset, offset + 15);
      if (more.bytes.byteLength < 8) return null;
      buffer = more.bytes;
      base = offset;
      box = readBoxHeader(buffer, 0, base);
      if (!box) return null;
    }
    if (box.size < box.headerSize) return null;
    if (box.type === "moov") {
      if (box.size > MAX_MOOV_BYTES) return null;
      const from = box.start - base;
      const whole = from >= 0 && from + box.size <= buffer.byteLength ? buffer.subarray(from, from + box.size) : (await read(box.start, box.start + box.size - 1)).bytes;
      if (whole.byteLength < box.size) return null;
      return { moov: whole, index: box.start < HEAD_BYTES ? "front" : "end" };
    }
    offset = box.start + box.size;
    if (head.total !== null && offset >= head.total) return null;
  }
  return null;
}

/** What a video file is: does its link resolve, what container, what track, how long, how big a picture. */
export async function probeVideo(read: RangeRead): Promise<VideoProbe> {
  const empty: VideoProbe = { resolves: false, status: 0, contentType: null, totalBytes: null, container: "unknown", index: null, info: null, video: null, hasAudio: false, note: null };
  let head: RangeResult;
  try {
    head = await read(0, HEAD_BYTES - 1);
  } catch (e) {
    return { ...empty, note: e instanceof Error ? e.message : "could not be fetched" };
  }
  const base = { ...empty, status: head.status, contentType: head.contentType, totalBytes: head.total, resolves: head.status === 200 || head.status === 206 };
  if (!base.resolves) return { ...base, note: `the link answered ${head.status}` };
  if (head.bytes.byteLength >= 4 && head.bytes[0] === 0x1a && head.bytes[1] === 0x45 && head.bytes[2] === 0xdf && head.bytes[3] === 0xa3) {
    return { ...base, container: "webm", note: "a WebM file: its index is not read here" };
  }
  const brand = sniffIsoBmff(head.bytes);
  if (brand === null) return { ...base, note: "not an MP4 or MOV file" };
  const found = await readMoov(read, head);
  if (!found) return { ...base, container: "mp4", note: "the file's index (moov) could not be read" };
  let info: Mp4Info;
  try {
    info = parseMoov(found.moov, brand);
  } catch (e) {
    return { ...base, container: "mp4", index: found.index, note: e instanceof Error ? e.message : "the file's index could not be parsed" };
  }
  const video = info.tracks.find((t) => t.kind === "video") ?? null;
  return { ...base, container: "mp4", index: found.index, info, video, hasAudio: info.tracks.some((t) => t.kind === "audio"), note: video ? null : "no video track" };
}

export type FrameDecode = { ok: boolean; requested: number; keyframeTime: number | null; width: number | null; height: number | null; note: string | null };

type DecoderCtor = typeof VideoDecoder;

/**
 * Decode the frame a player would show first when it lands on `seconds` of this track: the sync frame at or before
 * it. Proves the bytes are there and that this browser can decode this file at that point.
 */
export async function decodeFrameAt(read: RangeRead, track: Mp4Track, seconds: number, Decoder: DecoderCtor | undefined = typeof VideoDecoder === "undefined" ? undefined : VideoDecoder): Promise<FrameDecode> {
  const out: FrameDecode = { ok: false, requested: seconds, keyframeTime: null, width: null, height: null, note: null };
  const key = track.keyframeAt(seconds);
  if (!key) return { ...out, note: "no frame at that time" };
  out.keyframeTime = Math.max(0, key.dts - track.startOffset);
  if (!track.codec) return { ...out, note: `no decoder is known here for ${track.format || "this file"}` };
  if (!Decoder) return { ...out, note: "this browser has no video decoder to check with" };
  const config: VideoDecoderConfig = { codec: track.codec, codedWidth: track.width ?? undefined, codedHeight: track.height ?? undefined, ...(track.description ? { description: track.description } : {}) };
  try {
    const support = await Decoder.isConfigSupported(config);
    if (!support.supported) return { ...out, note: `this browser cannot decode ${track.codec}` };
  } catch {
    return { ...out, note: `this browser cannot decode ${track.codec}` };
  }
  const got = await read(key.offset, key.offset + key.size - 1);
  if (got.bytes.byteLength < key.size) return { ...out, note: "the frame's bytes could not be fetched" };
  return await new Promise<FrameDecode>((resolve) => {
    let done = false;
    const finish = (r: FrameDecode) => {
      if (done) return;
      done = true;
      try {
        decoder.close();
      } catch {
        // already closed
      }
      resolve(r);
    };
    const decoder = new Decoder({
      output: (frame) => {
        const r = { ...out, ok: true, width: frame.displayWidth, height: frame.displayHeight };
        frame.close();
        finish(r);
      },
      error: (e) => finish({ ...out, note: e.message || "the decoder refused the frame" }),
    });
    try {
      decoder.configure(config);
      decoder.decode(new EncodedVideoChunk({ type: "key", timestamp: Math.round(key.dts * 1e6), data: got.bytes.subarray(0, key.size) }));
      void decoder.flush().then(
        () => finish({ ...out, note: "the decoder returned no picture" }),
        (e: unknown) => finish({ ...out, note: e instanceof Error ? e.message : "the decoder refused the frame" }),
      );
    } catch (e) {
      finish({ ...out, note: e instanceof Error ? e.message : "the decoder refused the frame" });
    }
    setTimeout(() => finish({ ...out, note: "the decoder did not answer in time" }), 15000);
  });
}

export type AudioProbe = { resolves: boolean; status: number; contentType: string | null; totalBytes: number | null; format: "wav" | "mp4" | "other"; seconds: number | null; sampleRate: number | null; channels: number | null; decodes: boolean | null; note: string | null };

/** What the song file is, how long, and whether this browser decodes its start. */
export async function probeAudio(read: RangeRead): Promise<AudioProbe> {
  const empty: AudioProbe = { resolves: false, status: 0, contentType: null, totalBytes: null, format: "other", seconds: null, sampleRate: null, channels: null, decodes: null, note: null };
  let head: RangeResult;
  try {
    head = await read(0, HEAD_BYTES - 1);
  } catch (e) {
    return { ...empty, note: e instanceof Error ? e.message : "could not be fetched" };
  }
  const base = { ...empty, status: head.status, contentType: head.contentType, totalBytes: head.total, resolves: head.status === 200 || head.status === 206 };
  if (!base.resolves) return { ...base, note: `the link answered ${head.status}` };
  const wav = parseWavHeader(head.bytes, head.total);
  if (wav) {
    return { ...base, format: "wav", seconds: wav.seconds, sampleRate: wav.sampleRate, channels: wav.channels, decodes: await decodesStart(head.bytes, wav.dataOffset) };
  }
  if (sniffIsoBmff(head.bytes) !== null) {
    const found = await readMoov(read, head);
    if (found) {
      try {
        const info = parseMoov(found.moov);
        return { ...base, format: "mp4", seconds: info.duration || null };
      } catch {
        // fall through
      }
    }
    return { ...base, format: "mp4", note: "its length could not be read" };
  }
  // MP3, AAC, FLAC, Ogg: no index to read — the browser's own decoder is asked for the whole file
  if (head.total !== null && head.total <= MAX_WHOLE_AUDIO_BYTES) {
    const whole = head.bytes.byteLength >= head.total ? head : await read(0, head.total - 1);
    const decoded = await decodeWhole(whole.bytes);
    if (decoded) return { ...base, seconds: decoded.seconds, sampleRate: decoded.sampleRate, channels: decoded.channels, decodes: true };
    if (decoded === false) return { ...base, decodes: false, note: "this browser could not decode the file" };
  }
  return { ...base, note: "its length is not read for this kind of file" };
}

const MAX_WHOLE_AUDIO_BYTES = 80 * 1024 * 1024;

/** Decode a whole audio file. Null where there is no decoder to ask; false when the decoder refuses it. */
async function decodeWhole(bytes: Uint8Array): Promise<{ seconds: number; sampleRate: number; channels: number } | false | null> {
  const Offline = typeof window === "undefined" ? undefined : (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  if (!Offline) return null;
  try {
    const ctx = new Offline(1, 1, 44100);
    const copy = bytes.slice().buffer;
    const audio = await ctx.decodeAudioData(copy);
    return { seconds: audio.duration, sampleRate: audio.sampleRate, channels: audio.numberOfChannels };
  } catch {
    return false;
  }
}

/** Does the browser decode the first stretch of this WAV? (Null where there is no audio decoder to ask.) */
async function decodesStart(head: Uint8Array, dataOffset: number): Promise<boolean | null> {
  const Offline = typeof window === "undefined" ? undefined : (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  if (!Offline) return null;
  try {
    // a short, self-consistent WAV made of this file's own header and its first samples
    const take = Math.min(head.byteLength, dataOffset + 64 * 1024);
    const piece = head.slice(0, take);
    const v = new DataView(piece.buffer);
    v.setUint32(4, take - 8, true);
    v.setUint32(dataOffset - 4, take - dataOffset, true);
    const ctx = new Offline(1, 1, 8000);
    const audio = await ctx.decodeAudioData(piece.buffer);
    return audio.length > 0;
  } catch {
    return false;
  }
}
