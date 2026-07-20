import { describe, expect, it } from "vitest";
import { demuxMp4Video, selectSampleRange } from "./mp4Demux";

// --- byte writers -----------------------------------------------------------

function u8(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function u16(value: number): Uint8Array {
  return u8((value >> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
  return u8((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function u64(value: number): Uint8Array {
  return concat(u32(Math.floor(value / 0x100000000)), u32(value >>> 0));
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  return concat(u32(body.length + 8), ascii(type), body);
}

/** version + flags */
const FULL = u32(0);

// --- table builders ---------------------------------------------------------

function mdhd(timescale: number): Uint8Array {
  return box("mdhd", FULL, u32(0), u32(0), u32(timescale), u32(0), u16(0x55c4), u16(0));
}

function hdlr(handler: string): Uint8Array {
  return box("hdlr", FULL, u32(0), ascii(handler), new Uint8Array(12), u8(0));
}

const AVCC_BYTES = u8(0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x00);

function visualEntry(fourcc: string, width: number, height: number, config?: Uint8Array) {
  const fixed = new Uint8Array(78);
  fixed.set(u16(width), 24);
  fixed.set(u16(height), 26);
  return box(fourcc, fixed, ...(config ? [config] : []));
}

function stsd(entry: Uint8Array): Uint8Array {
  return box("stsd", FULL, u32(1), entry);
}

function stts(entries: Array<[count: number, delta: number]>): Uint8Array {
  return box("stts", FULL, u32(entries.length), ...entries.map(([c, d]) => concat(u32(c), u32(d))));
}

function stss(sampleNumbers: number[]): Uint8Array {
  return box("stss", FULL, u32(sampleNumbers.length), ...sampleNumbers.map(u32));
}

function stsc(entries: Array<[firstChunk: number, perChunk: number]>): Uint8Array {
  return box(
    "stsc",
    FULL,
    u32(entries.length),
    ...entries.map(([f, p]) => concat(u32(f), u32(p), u32(1))),
  );
}

function stsz(sizes: number[]): Uint8Array {
  return box("stsz", FULL, u32(0), u32(sizes.length), ...sizes.map(u32));
}

function stco(offsets: number[]): Uint8Array {
  return box("stco", FULL, u32(offsets.length), ...offsets.map(u32));
}

function co64(offsets: number[]): Uint8Array {
  return box("co64", FULL, u32(offsets.length), ...offsets.map(u64));
}

interface FileOpts {
  timescale?: number;
  handler?: string;
  entry?: Uint8Array;
  tables?: Uint8Array[];
  omitMoov?: boolean;
  fragmented?: boolean;
  extraTrak?: Uint8Array;
}

function defaultTables(): Uint8Array[] {
  return [
    stts([[4, 100]]),
    stss([1, 3]),
    stsc([[1, 2]]),
    stsz([10, 20, 30, 40]),
    stco([1000, 5000]),
  ];
}

function buildFile(opts: FileOpts = {}): Uint8Array {
  const {
    timescale = 200,
    handler = "vide",
    entry = visualEntry("avc1", 640, 360, box("avcC", AVCC_BYTES)),
    tables = defaultTables(),
  } = opts;

  const ftyp = box("ftyp", ascii("isom"), u32(512), ascii("isomavc1"));
  if (opts.omitMoov) {
    return concat(ftyp, opts.fragmented ? box("moof", u32(0)) : box("free", u32(0)));
  }

  const stbl = box("stbl", stsd(entry), ...tables);
  const minf = box("minf", stbl);
  const mdia = box("mdia", hdlr(handler), mdhd(timescale), minf);
  const trak = box("trak", mdia);

  const traks = opts.extraTrak ? concat(opts.extraTrak, trak) : trak;
  return concat(ftyp, box("moov", box("mvhd", FULL), traks));
}

// --- tests ------------------------------------------------------------------

describe("demuxMp4Video", () => {
  it("derives the codec string, description and dimensions from the sample entry", () => {
    const track = demuxMp4Video(buildFile());

    expect(track.codec).toBe("avc1.640028");
    expect(track.width).toBe(640);
    expect(track.height).toBe(360);
    expect(track.timescale).toBe(200);
    // description is the avcC payload (no box header) — what VideoDecoder expects.
    expect(Array.from(track.description ?? [])).toEqual(Array.from(AVCC_BYTES));
  });

  it("maps chunk offsets and stsc runs onto per-sample byte offsets", () => {
    // 2 samples per chunk, chunks at 1000 and 5000, sizes 10/20/30/40.
    const track = demuxMp4Video(buildFile());

    expect(track.samples.map((s) => s.offset)).toEqual([1000, 1010, 5000, 5030]);
    expect(track.samples.map((s) => s.size)).toEqual([10, 20, 30, 40]);
  });

  it("handles varying samples-per-chunk across stsc entries", () => {
    const track = demuxMp4Video(
      buildFile({
        tables: [
          stts([[4, 100]]),
          stsc([
            [1, 1],
            [2, 3],
          ]),
          stsz([10, 20, 30, 40]),
          stco([1000, 5000]),
        ],
      }),
    );

    expect(track.samples.map((s) => s.offset)).toEqual([1000, 5000, 5020, 5050]);
  });

  it("reads 64-bit chunk offsets from co64", () => {
    const big = 0x100000000 + 4096;
    const track = demuxMp4Video(
      buildFile({
        tables: [stts([[4, 100]]), stsc([[1, 2]]), stsz([10, 20, 30, 40]), co64([big, big + 8000])],
      }),
    );

    expect(track.samples.map((s) => s.offset)).toEqual([big, big + 10, big + 8000, big + 8030]);
  });

  it("accumulates stts deltas into seconds, including multiple runs", () => {
    const track = demuxMp4Video(
      buildFile({
        timescale: 100,
        tables: [
          stts([
            [2, 50],
            [2, 25],
          ]),
          stsc([[1, 2]]),
          stsz([10, 20, 30, 40]),
          stco([1000, 5000]),
        ],
      }),
    );

    // deltas 50,50,25,25 at timescale 100 => dts 0,50,100,125
    expect(track.samples.map((s) => s.timeSec)).toEqual([0, 0.5, 1, 1.25]);
  });

  it("flags sync samples from stss using 1-based sample numbers", () => {
    const track = demuxMp4Video(buildFile());
    expect(track.samples.map((s) => s.isSync)).toEqual([true, false, true, false]);
  });

  it("treats every sample as sync when stss is absent", () => {
    const track = demuxMp4Video(
      buildFile({
        tables: [stts([[4, 100]]), stsc([[1, 2]]), stsz([10, 20, 30, 40]), stco([1000, 5000])],
      }),
    );

    expect(track.samples.every((s) => s.isSync)).toBe(true);
  });

  it("skips non-video traks", () => {
    const soundTrak = box(
      "trak",
      box("mdia", hdlr("soun"), mdhd(48000), box("minf", box("stbl", stsd(visualEntry("mp4a", 0, 0))))),
    );
    const track = demuxMp4Video(buildFile({ extraTrak: soundTrak }));
    expect(track.codec).toBe("avc1.640028");
  });

  it("derives an hvc1 codec string from hvcC bytes", () => {
    const hvcC = box(
      "hvcC",
      u8(0x01, 0x01, 0x60, 0x00, 0x00, 0x00, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5a),
    );
    const track = demuxMp4Video(
      buildFile({ entry: visualEntry("hvc1", 1920, 1080, hvcC) }),
    );

    expect(track.codec).toBe("hvc1.1.6.L90.90");
  });

  it("throws a specific error for a fragmented MP4", () => {
    expect(() => demuxMp4Video(buildFile({ omitMoov: true, fragmented: true }))).toThrow(
      /fragmented MP4/,
    );
  });

  it("throws a specific error when there is no moov", () => {
    expect(() => demuxMp4Video(buildFile({ omitMoov: true }))).toThrow(/no moov box/);
  });

  it("throws when no video trak is present", () => {
    expect(() => demuxMp4Video(buildFile({ handler: "soun" }))).toThrow(/no video track/);
  });

  it("throws on an unrecognised sample entry", () => {
    expect(() => demuxMp4Video(buildFile({ entry: visualEntry("mp4v", 640, 360) }))).toThrow(
      /unsupported video sample entry "mp4v"/,
    );
  });

  it("throws when the sample entry carries no avcC/hvcC", () => {
    expect(() => demuxMp4Video(buildFile({ entry: visualEntry("avc1", 640, 360) }))).toThrow(
      /no avcC\/hvcC/,
    );
  });
});

describe("selectSampleRange", () => {
  const samples = [
    { offset: 0, size: 1, timeSec: 0, isSync: true },
    { offset: 1, size: 1, timeSec: 0.5, isSync: false },
    { offset: 2, size: 1, timeSec: 1, isSync: true },
    { offset: 3, size: 1, timeSec: 1.5, isSync: false },
    { offset: 4, size: 1, timeSec: 2, isSync: false },
  ];

  it("returns the GOP prefix from the last sync sample through the nearest sample", () => {
    expect(selectSampleRange(samples, 1.6).map((s) => s.timeSec)).toEqual([1, 1.5]);
  });

  it("includes trailing deltas when the target is past the last sync sample", () => {
    expect(selectSampleRange(samples, 2).map((s) => s.timeSec)).toEqual([1, 1.5, 2]);
  });

  it("returns a single sample when the target lands on a sync sample", () => {
    expect(selectSampleRange(samples, 1).map((s) => s.timeSec)).toEqual([1]);
  });

  it("returns an empty range for an empty table", () => {
    expect(selectSampleRange([], 1)).toEqual([]);
  });
});
