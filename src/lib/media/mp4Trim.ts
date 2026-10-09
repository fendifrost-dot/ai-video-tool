/**
 * Cut a stretch out of an MP4's video track into a new, self-contained MP4 — without decoding or re-encoding a
 * frame. The samples are copied as they are, so the cut is exactly what was filmed; it starts on the sync frame at
 * or before the moment asked for (a file cannot begin on a frame that depends on an earlier one), and says where
 * that is.
 *
 * It exists so the storyboard can hand a model "the part of the take this shot plays" (a few megabytes) instead of
 * a three-minute master. Video only: a take is cut for its picture; the song is the sound.
 */
import type { Mp4Sample, Mp4Track } from "./mp4";
import type { RangeRead } from "./probe";

export type TrimPlan = {
  /** First and last sample copied. */
  from: number;
  to: number;
  /** Where the cut really starts and ends in the source, seconds (movie time). */
  start: number;
  end: number;
  seconds: number;
  frames: number;
};

/**
 * Which samples a cut of [start, start + seconds) takes. The cut opens on the sync frame at or before `start`; when
 * `seconds` is given as a whole length it is measured from that real opening, so the cut is never shorter than asked.
 */
export function planTrim(track: Mp4Track, start: number, seconds: number): TrimPlan | null {
  if (!(seconds > 0) || track.sampleCount === 0) return null;
  const key = track.keyframeAt(Math.max(0, start));
  if (!key) return null;
  // when the sync frame is SHOWN, on the file's own clock (a frame is shown a little after it decodes when frames are reordered)
  const realStart = Math.max(0, key.dts + track.compositionOffset(key.index) / track.timescale - track.startOffset);
  // the last sample that decodes before the end
  const last = track.sampleAt(Math.max(0, key.dts + seconds - track.startOffset - 1e-6));
  if (!last || last.index < key.index) return null;
  const length = last.dts + track.sampleDelta(last.index) / track.timescale - key.dts;
  return { from: key.index, to: last.index, start: realStart, end: realStart + length, seconds: length, frames: last.index - key.index + 1 };
}

// ---- writing boxes ---------------------------------------------------------------------------------------------------

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.byteLength;
    return this;
  }
  u8(...n: number[]) {
    return this.bytes(Uint8Array.from(n));
  }
  u16(n: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n);
    return this.bytes(b);
  }
  u32(...n: number[]) {
    const b = new Uint8Array(4 * n.length);
    const v = new DataView(b.buffer);
    n.forEach((x, i) => v.setUint32(i * 4, x >>> 0));
    return this.bytes(b);
  }
  i32(n: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, n);
    return this.bytes(b);
  }
  str(s: string) {
    return this.bytes(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out;
  }
}

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const size = 8 + children.reduce((n, c) => n + c.byteLength, 0);
  const w = new Writer().u32(size).str(type);
  for (const c of children) w.bytes(c);
  return w.done();
}
const full = (type: string, version: number, flags: number, body: Uint8Array) => box(type, new Writer().u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255).done(), body);

const IDENTITY = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

/** Run-length pairs of a list of values: [count, value][]. */
function runs(values: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const v of values) {
    const lastRun = out[out.length - 1];
    if (lastRun && lastRun[1] === v) lastRun[0] += 1;
    else out.push([1, v]);
  }
  return out;
}

export type Mp4Write = {
  /** Track time units per second. */
  timescale: number;
  width: number;
  height: number;
  /** The whole `stsd` box: what the samples are. */
  stsd: Uint8Array;
  /** Per sample, in decode order: length, how much later than it decodes it is shown, whether it stands alone, bytes. */
  deltas: number[];
  offsets: number[];
  syncs: boolean[];
  sizes: number[];
  /** The samples' bytes, one after another. */
  payload: Uint8Array;
};

/** Write one video track as a self-contained MP4, index first. */
export function writeMp4(input: Mp4Write): Uint8Array {
  const { timescale: ts, deltas, offsets, sizes, width, height } = input;
  const count = sizes.length;
  const durationUnits = deltas.reduce((a, b) => a + b, 0);
  // the picture starts at the first frame's own presentation time: reordered frames are shown later than they decode
  const firstShown = offsets[0] ?? 0;
  const movieTs = 1000;
  const movieDuration = Math.round((durationUnits / ts) * movieTs);
  const ftyp = box("ftyp", new Writer().str("isom").u32(0x200).str("isomiso2mp41").done());

  const stts = full("stts", 0, 0, (() => {
    const r = runs(deltas);
    const w = new Writer().u32(r.length);
    for (const [n, value] of r) w.u32(n, value);
    return w.done();
  })());
  const hasCtts = offsets.some((o) => o !== 0);
  const negative = offsets.some((o) => o < 0);
  const ctts = hasCtts
    ? full("ctts", negative ? 1 : 0, 0, (() => {
        const r = runs(offsets);
        const w = new Writer().u32(r.length);
        for (const [n, value] of r) {
          w.u32(n);
          if (negative) w.i32(value);
          else w.u32(value);
        }
        return w.done();
      })())
    : null;
  const syncList = input.syncs.map((sync, i) => (sync ? i + 1 : 0)).filter(Boolean);
  const stss = syncList.length === count ? null : full("stss", 0, 0, new Writer().u32(syncList.length, ...syncList).done());
  const stsc = full("stsc", 0, 0, new Writer().u32(1, 1, count, 1).done());
  const stsz = full("stsz", 0, 0, new Writer().u32(0, count, ...sizes).done());

  const moovWith = (chunkOffset: number): Uint8Array => {
    const stco = full("stco", 0, 0, new Writer().u32(1, chunkOffset).done());
    const stbl = box("stbl", input.stsd, stts, ...(ctts ? [ctts] : []), ...(stss ? [stss] : []), stsc, stsz, stco);
    const dref = full("dref", 0, 0, new Writer().u32(1).bytes(full("url ", 0, 1, new Uint8Array(0))).done());
    const minf = box("minf", full("vmhd", 0, 1, new Writer().u16(0).u16(0).u16(0).u16(0).done()), box("dinf", dref), stbl);
    const mdhd = full("mdhd", 0, 0, new Writer().u32(0, 0, ts, durationUnits).u16(0x55c4).u16(0).done());
    const hdlr = full("hdlr", 0, 0, new Writer().u32(0).str("vide").u32(0, 0, 0).str("VideoHandler\0").done());
    const mdia = box("mdia", mdhd, hdlr, minf);
    const tkhd = full("tkhd", 0, 3, new Writer().u32(0, 0, 1, 0, movieDuration, 0, 0).u16(0).u16(0).u16(0).u16(0).u32(...IDENTITY).u32(width << 16, height << 16).done());
    // an edit list that starts the picture at the first frame shown, so the cut opens on a picture, not on a gap
    const elst = full("elst", 0, 0, new Writer().u32(1, movieDuration).i32(firstShown).u16(1).u16(0).done());
    const trak = box("trak", tkhd, box("edts", elst), mdia);
    const mvhd = full("mvhd", 0, 0, new Writer().u32(0, 0, movieTs, movieDuration, 0x00010000).u16(0x0100).u16(0).u32(0, 0).u32(...IDENTITY).u32(0, 0, 0, 0, 0, 0).u32(2).done());
    return box("moov", mvhd, trak);
  };
  // the index goes first (a provider can start reading at once); its size does not depend on the offset it holds
  const moovSize = moovWith(0).byteLength;
  const moov = moovWith(ftyp.byteLength + moovSize + 8);
  const mdat = box("mdat", input.payload);
  return new Writer().bytes(ftyp).bytes(moov).bytes(mdat).done();
}

/** The `stsd` box of an H.264 track, from its decoder configuration record (`avcC`). */
export function avcSampleDescription(width: number, height: number, avcC: Uint8Array): Uint8Array {
  const entry = new Writer()
    .u8(0, 0, 0, 0, 0, 0).u16(1) // reserved, data reference 1
    .u16(0).u16(0).u32(0, 0, 0) // pre-defined
    .u16(width).u16(height)
    .u32(0x00480000, 0x00480000, 0) // 72 dpi both ways, reserved
    .u16(1) // one frame per sample
    .bytes(new Uint8Array(32)) // compressor name
    .u16(0x18).u16(0xffff)
    .bytes(box("avcC", avcC))
    .done();
  return full("stsd", 0, 0, new Writer().u32(1).bytes(box("avc1", entry)).done());
}

/**
 * Build the trimmed file from the samples' bytes. `data` holds the source bytes from `dataStart` (a file offset)
 * through the last sample.
 */
export function buildTrimmedMp4(track: Mp4Track, plan: TrimPlan, data: Uint8Array, dataStart: number): Uint8Array {
  if (!track.stsd) throw new Error("the file's sample description is missing");
  const samples: Mp4Sample[] = [];
  for (let i = plan.from; i <= plan.to; i++) {
    const s = track.sample(i);
    if (!s) throw new Error("the file's index is incomplete");
    samples.push(s);
  }
  const payload = new Writer();
  for (const s of samples) payload.bytes(data.subarray(s.offset - dataStart, s.offset - dataStart + s.size));
  return writeMp4({
    timescale: track.timescale,
    width: track.width ?? 0,
    height: track.height ?? 0,
    stsd: track.stsd,
    deltas: samples.map((s) => track.sampleDelta(s.index)),
    offsets: samples.map((s) => track.compositionOffset(s.index)),
    syncs: samples.map((s) => s.sync),
    sizes: samples.map((s) => s.size),
    payload: payload.done(),
  });
}

export type TrimResult = { bytes: Uint8Array; plan: TrimPlan };

/** Cut [start, start + seconds) out of a file's video track. */
export async function trimVideo(read: RangeRead, track: Mp4Track, start: number, seconds: number): Promise<TrimResult> {
  const plan = planTrim(track, start, seconds);
  if (!plan) throw new Error("there is no footage at that moment to cut");
  const first = track.sample(plan.from);
  const last = track.sample(plan.to);
  if (!first || !last) throw new Error("the file's index is incomplete");
  let lo = first.offset;
  let hi = last.offset + last.size;
  for (let i = plan.from; i <= plan.to; i++) {
    const s = track.sample(i)!;
    lo = Math.min(lo, s.offset);
    hi = Math.max(hi, s.offset + s.size);
  }
  const got = await read(lo, hi - 1);
  if (got.bytes.byteLength < hi - lo) throw new Error("the footage could not be read in full");
  return { bytes: buildTrimmedMp4(track, plan, got.bytes, lo), plan };
}
