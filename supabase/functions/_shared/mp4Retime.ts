// Conform an MP4's duration without touching a frame — the pure half.
//
// Why (Fendi, 15 Oct 2026): the Higgsfield object-swap returns its clip about 7 % fast every time — 3.71 s at 24 fps
// for a 4.00 s source at 59.94 fps. A dressed take has to sit on the song clock exactly like the stretch of take it was
// cut from, and nothing downstream stretches a clip (the render contract plays every file at its own rate; Review only
// nudges playback for a few hundredths of drift). So the FILE itself must be the source's length.
//
// How: a container retime. Every time in a track is counted in that track's own units (mdhd timescale): the sample
// durations (stts), the reorder offsets (ctts) and the edit list's media time. Changing the timescale alone rescales
// all of them together, by exactly the same factor, without moving a byte. The headers that count in the movie's
// units (mvhd, tkhd, the edit list's segment length) are rewritten to match. The picture data (mdat) and every sample
// table are untouched: nothing is re-encoded, nothing is resampled, no frame is added or dropped — each frame is simply
// shown a little longer.
//
// Audio: the song is the sound of the video, so an audio track in the output is dropped, not retimed (an AAC stream
// slowed by its timescale would play at the wrong pitch, and some decoders ignore the container's rate). It is dropped
// by renaming its `trak` box to `free` — the same size in the same place, so no chunk offset moves.
//
// Pure: bytes in, bytes out. No Deno, no DOM: the same code runs in the edge function (provider-jobs-tick) and in the
// browser, and is tested under vitest.

export type Mp4TrackDuration = {
  kind: "video" | "audio" | "other";
  timescale: number;
  seconds: number;
};

export type Mp4Durations = {
  /** The movie header's length, seconds. */
  movieSeconds: number;
  /** The first video track's own length (mdhd, or its sample table when the header says 0), seconds. Null without video. */
  videoSeconds: number | null;
  tracks: Mp4TrackDuration[];
};

export type RetimeResult = {
  bytes: Uint8Array;
  /** The video track's length before and after, seconds (measured from the bytes, not assumed). */
  before: number;
  after: number;
  /** after ÷ before: how much longer each frame is now shown (1.079 for 3.71 s → 4.004 s). */
  ratio: number;
  /** How many audio tracks were dropped. */
  droppedAudio: number;
};

type Box = { type: string; start: number; end: number; body: number };

const fourcc = (b: Uint8Array, o: number) =>
  String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function u64(v: DataView, o: number): number {
  return v.getUint32(o) * 4294967296 + v.getUint32(o + 4);
}

function setU64(v: DataView, o: number, n: number): void {
  v.setUint32(o, Math.floor(n / 4294967296));
  v.setUint32(o + 4, n % 4294967296);
}

function boxesIn(b: Uint8Array, from: number, to: number): Box[] {
  const v = view(b);
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = v.getUint32(o);
    let body = o + 8;
    if (size === 1) {
      if (o + 16 > to) break;
      size = u64(v, o + 8);
      body = o + 16;
    } else if (size === 0) size = to - o;
    if (size < body - o || o + size > to) break;
    out.push({ type: fourcc(b, o + 4), start: o, end: o + size, body });
    o += size;
  }
  return out;
}

const childOf = (b: Uint8Array, parent: Box, type: string) =>
  boxesIn(b, parent.body, parent.end).find((c) => c.type === type) ?? null;

type TrackBoxes = {
  trak: Box;
  tkhd: Box | null;
  elst: Box | null;
  mdhd: Box;
  handler: string;
  stts: Box | null;
};

function moovOf(b: Uint8Array): Box {
  const top = boxesIn(b, 0, b.byteLength);
  if (top.some((x) => x.type === "moof"))
    throw new Error("the file is fragmented (moof): it cannot be retimed in place");
  const moov = top.find((x) => x.type === "moov");
  if (!moov) throw new Error("not an MP4: no moov box");
  if (childOf(b, moov, "mvex"))
    throw new Error("the file is fragmented (mvex): it cannot be retimed in place");
  return moov;
}

function tracksOf(b: Uint8Array, moov: Box): TrackBoxes[] {
  const out: TrackBoxes[] = [];
  for (const trak of boxesIn(b, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = childOf(b, trak, "mdia");
    const mdhd = mdia && childOf(b, mdia, "mdhd");
    const hdlr = mdia && childOf(b, mdia, "hdlr");
    if (!mdia || !mdhd || !hdlr) continue;
    const minf = childOf(b, mdia, "minf");
    const stbl = minf && childOf(b, minf, "stbl");
    const edts = childOf(b, trak, "edts");
    out.push({
      trak,
      tkhd: childOf(b, trak, "tkhd"),
      elst: edts && childOf(b, edts, "elst"),
      mdhd,
      handler: fourcc(b, hdlr.body + 8),
      stts: stbl ? childOf(b, stbl, "stts") : null,
    });
  }
  return out;
}

/** mdhd: [timescale, duration] and where they are. */
function mdhdFields(
  b: Uint8Array,
  mdhd: Box,
): { version: number; tsAt: number; durAt: number; timescale: number; units: number } {
  const v = view(b);
  const version = b[mdhd.body];
  const tsAt = mdhd.body + (version === 1 ? 20 : 12);
  const durAt = tsAt + 4;
  return {
    version,
    tsAt,
    durAt,
    timescale: v.getUint32(tsAt),
    units: version === 1 ? u64(v, durAt) : v.getUint32(durAt),
  };
}

/** The sum of a track's sample durations, in its own units (what the track really lasts, whatever the header says). */
function sttsUnits(b: Uint8Array, stts: Box | null): number {
  if (!stts) return 0;
  const v = view(b);
  const n = v.getUint32(stts.body + 4);
  let total = 0;
  for (let i = 0; i < n; i++)
    total += v.getUint32(stts.body + 8 + i * 8) * v.getUint32(stts.body + 12 + i * 8);
  return total;
}

function mediaUnits(b: Uint8Array, t: TrackBoxes): number {
  const m = mdhdFields(b, t.mdhd);
  return m.units > 0 ? m.units : sttsUnits(b, t.stts);
}

const kindOf = (handler: string): Mp4TrackDuration["kind"] =>
  handler === "vide" ? "video" : handler === "soun" ? "audio" : "other";

/** How long the file and each of its tracks run, read from the bytes. */
export function mp4Durations(bytes: Uint8Array): Mp4Durations {
  const moov = moovOf(bytes);
  const v = view(bytes);
  const mvhd = childOf(bytes, moov, "mvhd");
  let movieSeconds = 0;
  if (mvhd) {
    const version = bytes[mvhd.body];
    const ts = v.getUint32(mvhd.body + (version === 1 ? 20 : 12));
    const units = version === 1 ? u64(v, mvhd.body + 24) : v.getUint32(mvhd.body + 16);
    movieSeconds = ts ? units / ts : 0;
  }
  const tracks = tracksOf(bytes, moov).map((t) => {
    const m = mdhdFields(bytes, t.mdhd);
    return {
      kind: kindOf(t.handler),
      timescale: m.timescale,
      seconds: m.timescale ? mediaUnits(bytes, t) / m.timescale : 0,
    };
  });
  const video = tracks.find((t) => t.kind === "video");
  return { movieSeconds, videoSeconds: video ? video.seconds : null, tracks };
}

/**
 * Make the file play for exactly `targetSeconds` (to within one unit of its new timescale — well under a millisecond
 * for any real file), by rescaling time, not by touching frames. Returns a new array; the input is not changed.
 */
export function retimeMp4(
  input: Uint8Array,
  targetSeconds: number,
  opts: { dropAudio?: boolean } = {},
): RetimeResult {
  if (!(targetSeconds > 0) || !Number.isFinite(targetSeconds))
    throw new Error(`cannot retime to ${targetSeconds} s`);
  const dropAudio = opts.dropAudio ?? true;
  const b = input.slice();
  const v = view(b);
  const moov = moovOf(b);
  const mvhd = childOf(b, moov, "mvhd");
  if (!mvhd) throw new Error("the file has no movie header (mvhd)");
  const mvVersion = b[mvhd.body];
  const movieTs = v.getUint32(mvhd.body + (mvVersion === 1 ? 20 : 12));
  if (!movieTs) throw new Error("the movie header has no timescale");

  const tracks = tracksOf(b, moov);
  const video = tracks.find((t) => t.handler === "vide");
  if (!video) throw new Error("the file has no video track to retime");
  const vm = mdhdFields(b, video.mdhd);
  const videoUnits = mediaUnits(b, video);
  if (!vm.timescale || !videoUnits) throw new Error("the video track has no length");
  const before = videoUnits / vm.timescale;
  const factor = targetSeconds / before; // > 1: every frame is shown longer

  let droppedAudio = 0;
  let longestMovieUnits = 0;
  for (const t of tracks) {
    if (t.handler === "soun" && dropAudio) {
      // the same bytes in the same place under another name: players skip a `free` box, and no offset moves
      b.set([0x66, 0x72, 0x65, 0x65], t.trak.start + 4);
      droppedAudio += 1;
      continue;
    }
    const m = mdhdFields(b, t.mdhd);
    const units = mediaUnits(b, t);
    if (!m.timescale) continue;
    // the video track lands on the target exactly; any other track keeps its proportion to it
    const newTs =
      t === video
        ? Math.max(1, Math.round(units / targetSeconds))
        : Math.max(1, Math.round(m.timescale / factor));
    v.setUint32(m.tsAt, newTs);
    const seconds = units / newTs;
    const movieUnits = Math.round(seconds * movieTs);
    longestMovieUnits = Math.max(longestMovieUnits, movieUnits);
    if (t.tkhd) {
      const tv = b[t.tkhd.body];
      const at = t.tkhd.body + (tv === 1 ? 28 : 20);
      if (tv === 1) setU64(v, at, movieUnits);
      else v.setUint32(at, movieUnits);
    }
    if (t.elst) {
      // segment lengths are in the movie's units: they scale; media times are in the track's units, which already did
      const ev = b[t.elst.body];
      const n = v.getUint32(t.elst.body + 4);
      let o = t.elst.body + 8;
      for (let i = 0; i < n; i++) {
        const seg = ev === 1 ? u64(v, o) : v.getUint32(o);
        const scaled = Math.round(seg * factor);
        if (ev === 1) setU64(v, o, scaled);
        else v.setUint32(o, scaled);
        o += ev === 1 ? 20 : 12;
      }
    }
  }
  const durAt = mvhd.body + (mvVersion === 1 ? 24 : 16);
  if (mvVersion === 1) setU64(v, durAt, longestMovieUnits);
  else v.setUint32(durAt, longestMovieUnits);

  const after = mp4Durations(b).videoSeconds ?? 0;
  return { bytes: b, before, after, ratio: after / before, droppedAudio };
}
