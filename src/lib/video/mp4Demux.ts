/**
 * Minimal ISO-BMFF (MP4) demuxer — enough to feed WebCodecs a VideoDecoder.
 * Pure functions over bytes, no DOM: usable in workers and unit tests.
 * Only what a hero-frame grab needs — one video track, sample table, codec config.
 */

export interface Mp4Sample {
  /** Byte offset of the sample within the source buffer. */
  offset: number;
  size: number;
  /** Decode timestamp in seconds. */
  timeSec: number;
  isSync: boolean;
}

export interface Mp4VideoTrack {
  /** RFC 6381 codec string, e.g. "avc1.640028". */
  codec: string;
  /** Raw avcC/hvcC box payload — the VideoDecoder `description`. */
  description: Uint8Array | null;
  timescale: number;
  width: number;
  height: number;
  samples: Mp4Sample[];
}

interface Box {
  type: string;
  /** Offset of the box payload (after size+type and any largesize). */
  start: number;
  /** Offset one past the end of the box. */
  end: number;
}

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** Walk the boxes directly inside [start, end). Malformed sizes stop the walk rather than loop forever. */
function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let pos = start;

  while (pos + 8 <= end) {
    let size = view.getUint32(pos);
    const type = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    let payload = pos + 8;

    if (size === 1) {
      if (pos + 16 > end) break;
      // 64-bit largesize. Sizes beyond 2^53 are not representable — treat as malformed.
      const hi = view.getUint32(pos + 8);
      const lo = view.getUint32(pos + 12);
      size = hi * 0x100000000 + lo;
      payload = pos + 16;
    } else if (size === 0) {
      size = end - pos;
    }

    if (size < payload - pos || pos + size > end) break;
    boxes.push({ type, start: payload, end: pos + size });
    pos += size;
  }

  return boxes;
}

function findBox(boxes: Box[], type: string): Box | undefined {
  return boxes.find((b) => b.type === type);
}

/** Resolve a slash-separated box path relative to a container's children. */
function descend(bytes: Uint8Array, parent: Box, path: string): Box | undefined {
  let current: Box | undefined = parent;
  for (const type of path.split("/")) {
    if (!current) return undefined;
    current = findBox(readBoxes(bytes, current.start, current.end), type);
  }
  return current;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/** avc1.PPCCLL — profile_idc / constraint flags / level_idc straight out of avcC. */
function avcCodecString(fourcc: string, avcC: Uint8Array): string {
  if (avcC.length < 4) throw new Error("MP4 demux: avcC box is truncated.");
  return `${fourcc}.${hex2(avcC[1])}${hex2(avcC[2])}${hex2(avcC[3])}`;
}

/**
 * hvc1.A.B.CL.constraints — HEVCDecoderConfigurationRecord layout:
 * byte1 = space(2)|tier(1)|profile(5), bytes 2..5 = compat flags, 6..11 = constraints, 12 = level.
 */
function hevcCodecString(fourcc: string, hvcC: Uint8Array): string {
  if (hvcC.length < 13) throw new Error("MP4 demux: hvcC box is truncated.");
  const space = hvcC[1] >> 6;
  const tier = (hvcC[1] >> 5) & 0x01;
  const profile = hvcC[1] & 0x1f;

  // Compatibility flags are stored MSB-first but signalled in the codec string bit-reversed.
  let compat = 0;
  for (let i = 0; i < 32; i++) {
    const bit = (hvcC[2 + (i >> 3)] >> (7 - (i & 7))) & 1;
    compat |= bit << i;
  }

  const constraints: string[] = [];
  for (let i = 6; i <= 11; i++) constraints.push(hex2(hvcC[i]));
  while (constraints.length > 0 && constraints[constraints.length - 1] === "00") constraints.pop();

  const parts = [
    fourcc,
    `${["", "A", "B", "C"][space]}${profile}`,
    (compat >>> 0).toString(16).toUpperCase(),
    `${tier === 0 ? "L" : "H"}${hvcC[12]}`,
    ...constraints,
  ];
  return parts.join(".");
}

function readFullBoxEntryCount(view: DataView, start: number): { count: number; pos: number } {
  return { count: view.getUint32(start + 4), pos: start + 8 };
}

/** Decode stsz or stz2 into per-sample byte sizes. */
function readSampleSizes(bytes: Uint8Array, view: DataView, stbl: Box): number[] {
  const children = readBoxes(bytes, stbl.start, stbl.end);
  const stsz = findBox(children, "stsz");

  if (stsz) {
    const uniform = view.getUint32(stsz.start + 4);
    const count = view.getUint32(stsz.start + 8);
    if (uniform !== 0) return new Array<number>(count).fill(uniform);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) sizes.push(view.getUint32(stsz.start + 12 + i * 4));
    return sizes;
  }

  const stz2 = findBox(children, "stz2");
  if (!stz2) throw new Error("MP4 demux: video track has no stsz/stz2 sample size table.");

  const fieldSize = bytes[stz2.start + 7];
  const count = view.getUint32(stz2.start + 8);
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    if (fieldSize === 16) sizes.push(view.getUint16(stz2.start + 12 + i * 2));
    else if (fieldSize === 8) sizes.push(bytes[stz2.start + 12 + i]);
    else if (fieldSize === 4) {
      const byte = bytes[stz2.start + 12 + (i >> 1)];
      sizes.push((i & 1) === 0 ? byte >> 4 : byte & 0x0f);
    } else throw new Error(`MP4 demux: unsupported stz2 field size ${fieldSize}.`);
  }
  return sizes;
}

export function demuxMp4Video(buf: ArrayBuffer | Uint8Array): Mp4VideoTrack {
  const bytes = toBytes(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = readBoxes(bytes, 0, bytes.length);

  const moov = findBox(top, "moov");
  if (!moov) {
    const fragmented = top.some((b) => b.type === "moof" || b.type === "styp");
    throw new Error(
      fragmented
        ? "MP4 demux: fragmented MP4 (moof without moov) is not supported."
        : "MP4 demux: no moov box found — not a progressive MP4.",
    );
  }

  // First trak whose hdlr is 'vide'. Audio-first files are common, so don't assume index 0.
  const traks = readBoxes(bytes, moov.start, moov.end).filter((b) => b.type === "trak");
  const trak = traks.find((t) => {
    const hdlr = descend(bytes, t, "mdia/hdlr");
    if (!hdlr) return false;
    return (
      String.fromCharCode(
        bytes[hdlr.start + 8],
        bytes[hdlr.start + 9],
        bytes[hdlr.start + 10],
        bytes[hdlr.start + 11],
      ) === "vide"
    );
  });
  if (!trak) throw new Error("MP4 demux: no video track found in moov.");

  const mdhd = descend(bytes, trak, "mdia/mdhd");
  if (!mdhd) throw new Error("MP4 demux: video track has no mdhd box.");
  const mdhdVersion = bytes[mdhd.start];
  const timescale = mdhdVersion === 1 ? view.getUint32(mdhd.start + 20) : view.getUint32(mdhd.start + 12);
  if (!timescale) throw new Error("MP4 demux: video track has a zero timescale.");

  const stbl = descend(bytes, trak, "mdia/minf/stbl");
  if (!stbl) throw new Error("MP4 demux: video track has no stbl box.");
  const stblChildren = readBoxes(bytes, stbl.start, stbl.end);

  // --- sample description: codec + decoder config ---
  const stsd = findBox(stblChildren, "stsd");
  if (!stsd) throw new Error("MP4 demux: video track has no stsd box.");
  const entry = readBoxes(bytes, stsd.start + 8, stsd.end)[0];
  if (!entry) throw new Error("MP4 demux: stsd contains no sample entry.");

  const fourcc = entry.type;
  if (!["avc1", "avc3", "hvc1", "hev1"].includes(fourcc)) {
    throw new Error(`MP4 demux: unsupported video sample entry "${fourcc}".`);
  }

  // VisualSampleEntry has 78 bytes of fixed fields after the box header before its
  // child config boxes; width/height sit 24/26 bytes into that block.
  const width = view.getUint16(entry.start + 24);
  const height = view.getUint16(entry.start + 26);
  const configBoxes = readBoxes(bytes, entry.start + 78, entry.end);

  const avcC = findBox(configBoxes, "avcC");
  const hvcC = findBox(configBoxes, "hvcC");
  const configBox = avcC ?? hvcC;
  if (!configBox) {
    throw new Error(`MP4 demux: sample entry "${fourcc}" has no avcC/hvcC configuration box.`);
  }
  const description = bytes.slice(configBox.start, configBox.end);
  const codec = avcC
    ? avcCodecString(fourcc, description)
    : hevcCodecString(fourcc, description);

  // --- sample table ---
  const sizes = readSampleSizes(bytes, view, stbl);
  const sampleCount = sizes.length;

  const stts = findBox(stblChildren, "stts");
  if (!stts) throw new Error("MP4 demux: video track has no stts box.");
  const times: number[] = [];
  {
    const { count, pos } = readFullBoxEntryCount(view, stts.start);
    let dts = 0;
    for (let i = 0; i < count && times.length < sampleCount; i++) {
      const runLength = view.getUint32(pos + i * 8);
      const delta = view.getUint32(pos + i * 8 + 4);
      for (let j = 0; j < runLength && times.length < sampleCount; j++) {
        times.push(dts / timescale);
        dts += delta;
      }
    }
  }
  // A short stts leaves trailing samples timestamped at the last known dts.
  while (times.length < sampleCount) times.push(times.length > 0 ? times[times.length - 1] : 0);

  // Absent stss means every sample is a sync sample (all-intra tracks).
  const stss = findBox(stblChildren, "stss");
  const syncSet = new Set<number>();
  if (stss) {
    const { count, pos } = readFullBoxEntryCount(view, stss.start);
    for (let i = 0; i < count; i++) syncSet.add(view.getUint32(pos + i * 4) - 1);
  }

  const stco = findBox(stblChildren, "stco");
  const co64 = findBox(stblChildren, "co64");
  if (!stco && !co64) throw new Error("MP4 demux: video track has no stco/co64 chunk offset table.");
  const chunkOffsets: number[] = [];
  if (stco) {
    const { count, pos } = readFullBoxEntryCount(view, stco.start);
    for (let i = 0; i < count; i++) chunkOffsets.push(view.getUint32(pos + i * 4));
  } else if (co64) {
    const { count, pos } = readFullBoxEntryCount(view, co64.start);
    for (let i = 0; i < count; i++) {
      chunkOffsets.push(view.getUint32(pos + i * 8) * 0x100000000 + view.getUint32(pos + i * 8 + 4));
    }
  }

  const stsc = findBox(stblChildren, "stsc");
  if (!stsc) throw new Error("MP4 demux: video track has no stsc box.");
  const stscEntries: Array<{ firstChunk: number; samplesPerChunk: number }> = [];
  {
    const { count, pos } = readFullBoxEntryCount(view, stsc.start);
    for (let i = 0; i < count; i++) {
      stscEntries.push({
        firstChunk: view.getUint32(pos + i * 12),
        samplesPerChunk: view.getUint32(pos + i * 12 + 4),
      });
    }
  }
  if (stscEntries.length === 0) throw new Error("MP4 demux: stsc box is empty.");

  // Walk chunks in order, laying samples end-to-end from each chunk's file offset.
  const samples: Mp4Sample[] = [];
  let sampleIndex = 0;
  let stscIndex = 0;
  for (let chunk = 0; chunk < chunkOffsets.length && sampleIndex < sampleCount; chunk++) {
    while (
      stscIndex + 1 < stscEntries.length &&
      stscEntries[stscIndex + 1].firstChunk - 1 <= chunk
    ) {
      stscIndex++;
    }
    let offset = chunkOffsets[chunk];
    const perChunk = stscEntries[stscIndex].samplesPerChunk;
    for (let i = 0; i < perChunk && sampleIndex < sampleCount; i++) {
      samples.push({
        offset,
        size: sizes[sampleIndex],
        timeSec: times[sampleIndex],
        isSync: stss ? syncSet.has(sampleIndex) : true,
      });
      offset += sizes[sampleIndex];
      sampleIndex++;
    }
  }

  if (samples.length === 0) throw new Error("MP4 demux: video track contains no samples.");

  return { codec, description, timescale, width, height, samples };
}

/**
 * Slice from the last sync sample at/before `timeSec` through the sample nearest `timeSec`.
 * Decoders need the whole GOP prefix to produce a correct frame at the target time.
 */
export function selectSampleRange(samples: Mp4Sample[], timeSec: number): Mp4Sample[] {
  if (samples.length === 0) return [];

  let target = 0;
  let best = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const diff = Math.abs(samples[i].timeSec - timeSec);
    if (diff < best) {
      best = diff;
      target = i;
    }
  }

  let sync = 0;
  for (let i = target; i >= 0; i--) {
    if (samples[i].isSync) {
      sync = i;
      break;
    }
  }

  return samples.slice(sync, target + 1);
}
