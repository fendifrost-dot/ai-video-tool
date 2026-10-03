/**
 * Just enough of an MP4 / MOV reader to answer three questions about a file without a media element:
 * what is in it (tracks, codec, size, length), where a given moment's frame lives (which bytes), and what a decoder
 * needs to be told to decode it. Review's "Check this cut" uses it to prove, on the real files of a project, that
 * the footage each shot points at exists, is as long as the shot needs, and decodes at the shot's in-point — in any
 * tab, including one whose window is not on screen (where the browser will not load a <video> at all).
 *
 * Pure: bytes in, facts out. Fetching is probe.ts.
 */

export type Mp4Sample = { index: number; offset: number; size: number; dts: number; sync: boolean };

export type Mp4Track = {
  kind: "video" | "audio" | "other";
  timescale: number;
  /** Seconds, from the track's own header. */
  duration: number;
  /** Sample entry type: avc1, hvc1, vp09, mp4a … */
  format: string;
  /** The codec as WebCodecs names it, when this reader can build it. */
  codec: string | null;
  /** The decoder configuration record (avcC / hvcC payload), when the codec carries one. */
  description: Uint8Array | null;
  width: number | null;
  height: number | null;
  sampleCount: number;
  syncCount: number;
  /** The first media time presented at movie time 0 (edit list), seconds. */
  startOffset: number;
  /** One sample by its number in the track. */
  sample: (index: number) => Mp4Sample | null;
  /** The sample description box (`stsd`), whole — what a file cut from this one needs to carry unchanged. */
  stsd: Uint8Array | null;
  /** How long sample `index` lasts, in the track's own units. */
  sampleDelta: (index: number) => number;
  /** How much later than its decode time sample `index` is shown (reordered frames), in the track's own units. */
  compositionOffset: (index: number) => number;
  /** Frame lookups (video tracks only). */
  sampleAt: (seconds: number) => Mp4Sample | null;
  /** The sync sample at or before the sample at `seconds`. */
  keyframeAt: (seconds: number) => Mp4Sample | null;
};

export type Mp4Info = { brand: string; duration: number; tracks: Mp4Track[] };

export type TopBox = { type: string; start: number; size: number; headerSize: number };

const td = new TextDecoder("latin1");
const fourcc = (v: DataView, o: number) => td.decode(new Uint8Array(v.buffer, v.byteOffset + o, 4));

function u64(v: DataView, o: number): number {
  return v.getUint32(o) * 4294967296 + v.getUint32(o + 4);
}

/**
 * Read one box header at `offset` of the bytes given (which start at file offset `base`). Null when the header is
 * not wholly inside the bytes.
 */
export function readBoxHeader(bytes: Uint8Array, offset: number, base = 0): TopBox | null {
  if (offset + 8 > bytes.byteLength) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = v.getUint32(offset);
  const type = fourcc(v, offset + 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > bytes.byteLength) return null;
    size = u64(v, offset + 8);
    headerSize = 16;
  }
  return { type, start: base + offset, size, headerSize };
}

type Box = { type: string; start: number; end: number; body: number };

function* boxes(v: DataView, from: number, to: number): Generator<Box> {
  let o = from;
  while (o + 8 <= to) {
    let size = v.getUint32(o);
    const type = fourcc(v, o + 4);
    let body = o + 8;
    if (size === 1) {
      if (o + 16 > to) return;
      size = u64(v, o + 8);
      body = o + 16;
    } else if (size === 0) size = to - o;
    if (size < body - o || o + size > to) return;
    yield { type, start: o, end: o + size, body };
    o += size;
  }
}

function child(v: DataView, parent: Box, type: string): Box | null {
  for (const b of boxes(v, parent.body, parent.end)) if (b.type === type) return b;
  return null;
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** avcC → "avc1.PPCCLL" */
export function avcCodec(format: string, avcC: Uint8Array): string | null {
  if (avcC.byteLength < 4) return null;
  return `${format === "avc3" ? "avc3" : "avc1"}.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`;
}

/** hvcC → "hvc1.1.6.L93.B0" (ISO/IEC 14496-15 Annex E) */
export function hevcCodec(format: string, hvcC: Uint8Array): string | null {
  if (hvcC.byteLength < 13) return null;
  const b1 = hvcC[1];
  const space = ["", "A", "B", "C"][b1 >> 6];
  const tier = (b1 >> 5) & 1 ? "H" : "L";
  const profile = b1 & 0x1f;
  const compat = ((hvcC[2] << 24) | (hvcC[3] << 16) | (hvcC[4] << 8) | hvcC[5]) >>> 0;
  let reversed = 0;
  for (let i = 0; i < 32; i++) reversed = ((reversed << 1) | ((compat >>> i) & 1)) >>> 0;
  const constraint = [...hvcC.subarray(6, 12)];
  while (constraint.length && constraint[constraint.length - 1] === 0) constraint.pop();
  const level = hvcC[12];
  return [`${format === "hev1" ? "hev1" : "hvc1"}.${space}${profile}`, reversed.toString(16), `${tier}${level}`, ...constraint.map((c) => c.toString(16))].join(".");
}

/** vpcC (after its 4-byte version/flags) → "vp09.PP.LL.DD" */
export function vp9Codec(vpcC: Uint8Array): string | null {
  if (vpcC.byteLength < 7) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `vp09.${pad(vpcC[4])}.${pad(vpcC[5])}.${pad(vpcC[6] >> 4)}`;
}

function parseTrack(v: DataView, trak: Box, bytes: Uint8Array): Mp4Track | null {
  const mdia = child(v, trak, "mdia");
  if (!mdia) return null;
  const mdhd = child(v, mdia, "mdhd");
  const hdlr = child(v, mdia, "hdlr");
  const minf = child(v, mdia, "minf");
  const stbl = minf && child(v, minf, "stbl");
  if (!mdhd || !hdlr || !stbl) return null;

  const version = v.getUint8(mdhd.body);
  const timescale = version === 1 ? v.getUint32(mdhd.body + 20) : v.getUint32(mdhd.body + 12);
  const durationUnits = version === 1 ? u64(v, mdhd.body + 24) : v.getUint32(mdhd.body + 16);
  const handler = fourcc(v, hdlr.body + 8);
  const kind: Mp4Track["kind"] = handler === "vide" ? "video" : handler === "soun" ? "audio" : "other";

  // the first media time shown (edit list): a file can start its picture a little into the track
  let startOffset = 0;
  const edts = child(v, trak, "edts");
  const elst = edts && child(v, edts, "elst");
  if (elst) {
    const ev = v.getUint8(elst.body);
    const n = v.getUint32(elst.body + 4);
    let o = elst.body + 8;
    for (let i = 0; i < n; i++) {
      const mediaTime = ev === 1 ? Number(v.getBigInt64(o + 8)) : v.getInt32(o + 4);
      o += ev === 1 ? 20 : 12;
      if (mediaTime >= 0) {
        startOffset = mediaTime / timescale;
        break;
      }
    }
  }

  // sample description
  const stsd = child(v, stbl, "stsd");
  let format = "";
  let codec: string | null = null;
  let description: Uint8Array | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (stsd && v.getUint32(stsd.body + 4) > 0) {
    const entry = [...boxes(v, stsd.body + 8, stsd.end)][0];
    if (entry) {
      format = entry.type;
      if (kind === "video") {
        width = v.getUint16(entry.body + 24);
        height = v.getUint16(entry.body + 26);
        for (const c of boxes(v, entry.body + 78, entry.end)) {
          const payload = bytes.subarray(c.body, c.end);
          if (c.type === "avcC") {
            description = payload.slice();
            codec = avcCodec(format, payload);
          } else if (c.type === "hvcC") {
            description = payload.slice();
            codec = hevcCodec(format, payload);
          } else if (c.type === "vpcC") codec = vp9Codec(payload);
        }
      }
    }
  }

  // sample tables
  const stts = child(v, stbl, "stts");
  const stsc = child(v, stbl, "stsc");
  const stsz = child(v, stbl, "stsz");
  const stco = child(v, stbl, "stco");
  const co64 = child(v, stbl, "co64");
  const stss = child(v, stbl, "stss");

  let sampleCount = 0;
  let uniformSize = 0;
  if (stsz) {
    uniformSize = v.getUint32(stsz.body + 4);
    sampleCount = v.getUint32(stsz.body + 8);
  }
  const sizeOf = (i: number) => (uniformSize ? uniformSize : v.getUint32(stsz!.body + 12 + i * 4));

  const syncSet: number[] | null = stss ? Array.from({ length: v.getUint32(stss.body + 4) }, (_, i) => v.getUint32(stss.body + 8 + i * 4) - 1) : null;

  const dtsOf = (index: number): number => {
    if (!stts) return 0;
    const n = v.getUint32(stts.body + 4);
    let remaining = index;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const count = v.getUint32(stts.body + 8 + i * 8);
      const delta = v.getUint32(stts.body + 12 + i * 8);
      if (remaining < count) return t + remaining * delta;
      t += count * delta;
      remaining -= count;
    }
    return t;
  };
  const indexAt = (units: number): number => {
    if (!stts || sampleCount === 0) return -1;
    const n = v.getUint32(stts.body + 4);
    let t = 0;
    let index = 0;
    for (let i = 0; i < n; i++) {
      const count = v.getUint32(stts.body + 8 + i * 8);
      const delta = v.getUint32(stts.body + 12 + i * 8);
      if (delta > 0 && units < t + count * delta) return Math.min(sampleCount - 1, index + Math.floor((units - t) / delta));
      t += count * delta;
      index += count;
    }
    return sampleCount - 1;
  };
  const offsetOf = (index: number): number | null => {
    if (!stsc || !stsz || !(stco || co64)) return null;
    const entries = v.getUint32(stsc.body + 4);
    const chunkCount = v.getUint32((stco ?? co64)!.body + 4);
    let sample = 0;
    for (let e = 0; e < entries; e++) {
      const firstChunk = v.getUint32(stsc.body + 8 + e * 12) - 1;
      const perChunk = v.getUint32(stsc.body + 12 + e * 12);
      const nextFirst = e + 1 < entries ? v.getUint32(stsc.body + 8 + (e + 1) * 12) - 1 : chunkCount;
      const span = (nextFirst - firstChunk) * perChunk;
      if (index < sample + span) {
        const within = index - sample;
        const chunk = firstChunk + Math.floor(within / perChunk);
        const firstInChunk = index - (within % perChunk);
        let offset = stco ? v.getUint32(stco.body + 8 + chunk * 4) : u64(v, co64!.body + 8 + chunk * 8);
        for (let s = firstInChunk; s < index; s++) offset += sizeOf(s);
        return offset;
      }
      sample += span;
    }
    return null;
  };
  const sampleDelta = (index: number): number => {
    if (!stts) return 0;
    const n = v.getUint32(stts.body + 4);
    let remaining = index;
    for (let i = 0; i < n; i++) {
      const count = v.getUint32(stts.body + 8 + i * 8);
      if (remaining < count) return v.getUint32(stts.body + 12 + i * 8);
      remaining -= count;
    }
    return n ? v.getUint32(stts.body + 12 + (n - 1) * 8) : 0;
  };
  const ctts = child(v, stbl, "ctts");
  const compositionOffset = (index: number): number => {
    if (!ctts) return 0;
    const signed = v.getUint8(ctts.body) === 1;
    const n = v.getUint32(ctts.body + 4);
    let remaining = index;
    for (let i = 0; i < n; i++) {
      const count = v.getUint32(ctts.body + 8 + i * 8);
      if (remaining < count) return signed ? v.getInt32(ctts.body + 12 + i * 8) : v.getUint32(ctts.body + 12 + i * 8);
      remaining -= count;
    }
    return 0;
  };
  const sample = (index: number): Mp4Sample | null => {
    if (index < 0 || index >= sampleCount) return null;
    const offset = offsetOf(index);
    if (offset === null) return null;
    return { index, offset, size: sizeOf(index), dts: dtsOf(index) / timescale, sync: syncSet ? syncSet.includes(index) : true };
  };
  const sampleAt = (seconds: number) => sample(indexAt(Math.max(0, seconds + startOffset) * timescale));
  const keyframeAt = (seconds: number) => {
    const index = indexAt(Math.max(0, seconds + startOffset) * timescale);
    if (index < 0) return null;
    if (!syncSet) return sample(index);
    let key = -1;
    for (const s of syncSet) {
      if (s <= index) key = s;
      else break;
    }
    return key < 0 ? null : sample(key);
  };

  return { kind, timescale, duration: timescale ? durationUnits / timescale : 0, format, codec, description, width, height, sampleCount, syncCount: syncSet ? syncSet.length : sampleCount, startOffset, sample, sampleAt, keyframeAt, stsd: stsd ? bytes.slice(stsd.start, stsd.end) : null, sampleDelta, compositionOffset };
}

/** Parse a `moov` box (the bytes of the whole box, header included). `brand` is the file's major brand if known. */
export function parseMoov(moov: Uint8Array, brand = ""): Mp4Info {
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const head = readBoxHeader(moov, 0);
  if (!head || head.type !== "moov") throw new Error("not a moov box");
  const root: Box = { type: "moov", start: 0, end: Math.min(head.size, moov.byteLength), body: head.headerSize };
  let duration = 0;
  const mvhd = child(v, root, "mvhd");
  if (mvhd) {
    const version = v.getUint8(mvhd.body);
    const timescale = version === 1 ? v.getUint32(mvhd.body + 20) : v.getUint32(mvhd.body + 12);
    const units = version === 1 ? u64(v, mvhd.body + 24) : v.getUint32(mvhd.body + 16);
    duration = timescale ? units / timescale : 0;
  }
  const tracks: Mp4Track[] = [];
  for (const b of boxes(v, root.body, root.end)) {
    if (b.type !== "trak") continue;
    const t = parseTrack(v, b, moov);
    if (t) tracks.push(t);
  }
  return { brand, duration, tracks };
}

/** Whether these first bytes are an ISO base media file (MP4 / MOV / M4A …), and its major brand. */
export function sniffIsoBmff(head: Uint8Array): string | null {
  const first = readBoxHeader(head, 0);
  if (!first) return null;
  if (first.type === "ftyp" && head.byteLength >= 12) return td.decode(head.subarray(8, 12));
  // old QuickTime files open with moov / mdat / wide / free and no ftyp
  return ["moov", "mdat", "wide", "free", "skip"].includes(first.type) ? "qt  " : null;
}

/** A PCM / compressed WAV header: what it is and how long. Null when the bytes are not a RIFF/WAVE file. */
export function parseWavHeader(head: Uint8Array, fileBytes: number | null): { sampleRate: number; channels: number; bitsPerSample: number; seconds: number; dataOffset: number; byteRate: number } | null {
  if (head.byteLength < 28) return null;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (fourcc(v, 0) !== "RIFF" || fourcc(v, 8) !== "WAVE") return null;
  let o = 12;
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number; byteRate: number } | null = null;
  while (o + 8 <= head.byteLength) {
    const id = fourcc(v, o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt " && o + 24 <= head.byteLength) {
      fmt = { channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), byteRate: v.getUint32(o + 16, true), bitsPerSample: v.getUint16(o + 22, true) };
    } else if (id === "data") {
      if (!fmt || fmt.byteRate <= 0) return null;
      // a streamed WAV may declare 0 or 0xFFFFFFFF: fall back to what the file holds
      const declared = size > 0 && size < 0xffffffff ? size : null;
      const dataBytes = fileBytes !== null ? Math.min(declared ?? Infinity, fileBytes - (o + 8)) : declared;
      if (dataBytes === null || !Number.isFinite(dataBytes)) return null;
      return { ...fmt, seconds: dataBytes / fmt.byteRate, dataOffset: o + 8 };
    }
    o += 8 + size + (size % 2);
  }
  return null;
}
