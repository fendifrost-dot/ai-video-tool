import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demuxMp4Video } from "@/lib/video/mp4Demux";
import { happyPathFrames } from "@/lib/eval/videoQaFixtures";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  LIVE_PLAYABLE_DECODE_FALLBACK_STEPS,
  LIVE_PLAYABLE_DECODE_MAX_FRAMES,
  LIVE_PLAYABLE_RGBA_BYTES_PER_FRAME,
  LIVE_PROXY_MAX_FRAMES,
  livePlayableDecodeTimeoutMs,
  livePlayableRgbaBudgetBytes,
  resolveLivePlayableDecodeLadder,
} from "./contract";
import {
  classifyLiveDecodeFailure,
  committedPlayableMp4FetchCandidates,
  decodeCommittedPlayableMp4ForLive,
  decodePlayableMp4Browser,
  fetchPlayableMp4Bytes,
  formatPlayableBrowserDecodeNote,
  isRecoverableLiveDecodeFailure,
  sha256Hex,
  webCodecsVideoDecoderAvailable,
} from "./decodeMp4Browser";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_MP4_SHA256,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
} from "./videoQaPlug";

function gateBytes(): Uint8Array {
  return new Uint8Array(readFileSync(PLAYABLE_MP4_RELATIVE_PATH));
}

function installMockWebCodecs(opts: {
  width: number;
  height: number;
  fill?: number;
  /** Throw from decoder.error after this many output frames (0 = error before any). */
  failAfter?: number;
  failMessage?: string;
  /** copyTo never resolves after this many successful copies. */
  hangCopyAfter?: number;
}) {
  const fill = opts.fill ?? 40;
  let outputCount = 0;
  let copyCount = 0;
  class MockFrame {
    timestamp: number;
    displayWidth = opts.width;
    displayHeight = opts.height;
    constructor(timestamp: number) {
      this.timestamp = timestamp;
    }
    close() {
      /* noop */
    }
    allocationSize() {
      return opts.width * opts.height * 4;
    }
    async copyTo(destination: Uint8Array) {
      copyCount++;
      if (opts.hangCopyAfter !== undefined && copyCount > opts.hangCopyAfter) {
        return new Promise(() => {
          /* hang */
        });
      }
      destination.fill(fill);
      for (let i = 3; i < destination.length; i += 4) destination[i] = 255;
    }
  }
  class MockDecoder {
    state = "unconfigured";
    static async isConfigSupported() {
      return { supported: true };
    }
    output: (frame: MockFrame) => void;
    error: (e: DOMException) => void;
    constructor(init: { output: (frame: MockFrame) => void; error: (e: DOMException) => void }) {
      this.output = init.output;
      this.error = init.error;
    }
    configure() {
      this.state = "configured";
    }
    decode(chunk: { timestamp: number }) {
      if (opts.failAfter !== undefined && outputCount >= opts.failAfter) {
        this.error(new DOMException(opts.failMessage ?? "Allocation failed: out of memory"));
        return;
      }
      this.output(new MockFrame(chunk.timestamp));
      outputCount++;
    }
    async flush() {
      /* noop */
    }
    close() {
      this.state = "closed";
    }
  }
  class MockChunk {
    timestamp: number;
    constructor(init: { timestamp: number }) {
      this.timestamp = init.timestamp;
    }
  }
  vi.stubGlobal("VideoDecoder", MockDecoder);
  vi.stubGlobal("EncodedVideoChunk", MockChunk);
}

describe("playable browser decode caps", () => {
  it("defaults live WebCodecs to the full 72-frame gate (compose window stays 8)", () => {
    expect(LIVE_PLAYABLE_DECODE_MAX_FRAMES).toBe(72);
    expect(LIVE_PLAYABLE_DECODE_MAX_FRAMES).toBe(CANONICAL_CLIP_FRAME_COUNT);
    expect(HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT).toBe(8);
    expect(LIVE_PROXY_MAX_FRAMES).toBe(24);
    expect(LIVE_PLAYABLE_DECODE_FALLBACK_STEPS).toEqual([24, 8]);
  });

  it("documents RGBA memory and timeout tradeoffs", () => {
    expect(LIVE_PLAYABLE_RGBA_BYTES_PER_FRAME).toBe(720 * 1280 * 4);
    expect(livePlayableRgbaBudgetBytes(8)).toBe(8 * 720 * 1280 * 4);
    expect(livePlayableRgbaBudgetBytes(72)).toBe(265_420_800);
    expect(livePlayableDecodeTimeoutMs(8)).toBe(10_000 + 8 * 500);
    expect(livePlayableDecodeTimeoutMs(72)).toBe(10_000 + 72 * 500);
    expect(livePlayableDecodeTimeoutMs(72)).toBeLessThanOrEqual(60_000);
  });

  it("builds a progressive ladder: requested first, then 24 then 8", () => {
    expect(resolveLivePlayableDecodeLadder(72)).toEqual([72, 24, 8]);
    expect(resolveLivePlayableDecodeLadder(24)).toEqual([24, 8]);
    expect(resolveLivePlayableDecodeLadder(8)).toEqual([8]);
    expect(resolveLivePlayableDecodeLadder(50)).toEqual([50, 24, 8]);
  });

  it("classifies abort/OOM/timeout as recoverable (not sha/codec/fetch)", () => {
    expect(classifyLiveDecodeFailure("decode_timeout")).toBe("timeout");
    expect(classifyLiveDecodeFailure("Allocation failed: out of memory")).toBe("oom");
    expect(classifyLiveDecodeFailure("decode_aborted")).toBe("abort");
    expect(
      isRecoverableLiveDecodeFailure({
        ok: false,
        decoder: "webcodecs",
        code: "decode_failed",
        message: "decode_timeout",
      }),
    ).toBe(true);
    expect(
      isRecoverableLiveDecodeFailure({
        ok: false,
        decoder: "none",
        code: "sha256_mismatch",
        message: "nope",
      }),
    ).toBe(false);
    expect(
      isRecoverableLiveDecodeFailure({
        ok: false,
        decoder: "none",
        code: "webcodecs_unavailable",
        message: "missing",
      }),
    ).toBe(false);
  });

  it("public Publish mirror matches the committed gate sha256", () => {
    const pub = readFileSync("public/reconstruct/playable-76fe7438.mp4");
    expect(pub.byteLength).toBe(PLAYABLE_MP4_BYTE_LENGTH);
    expect(createHash("sha256").update(pub).digest("hex")).toBe(PLAYABLE_MP4_SHA256);
  });
});

describe("webCodecsVideoDecoderAvailable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false in jsdom without VideoDecoder", () => {
    expect(webCodecsVideoDecoderAvailable()).toBe(false);
  });

  it("is true when VideoDecoder + EncodedVideoChunk are stubbed", () => {
    installMockWebCodecs({ width: 8, height: 8 });
    expect(webCodecsVideoDecoderAvailable()).toBe(true);
  });
});

describe("decodePlayableMp4Browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed when WebCodecs is missing (INCOMPLETE path)", async () => {
    const result = await decodePlayableMp4Browser({ mp4Bytes: gateBytes(), maxFrames: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.decoder).toBe("none");
    expect(result.code).toBe("webcodecs_unavailable");
    expect(formatPlayableBrowserDecodeNote(result)).toMatch(/webcodecs_unavailable/);
    expect(formatPlayableBrowserDecodeNote(result)).toMatch(/INCOMPLETE/);
  });

  it("demuxes the committed 72-frame gate (no decoder required)", () => {
    const track = demuxMp4Video(gateBytes());
    expect(track.codec).toMatch(/^avc1\./);
    expect(track.width).toBe(720);
    expect(track.height).toBe(1280);
    expect(track.samples.length).toBe(72);
    expect(track.rotation).toBe(0);
    expect(track.samples[0]!.isSync).toBe(true);
  });

  it("decodes a bounded sample of the gate MP4 via mocked WebCodecs and E2 scores frames>0", async () => {
    installMockWebCodecs({ width: 720, height: 1280 });
    const bytes = gateBytes();
    const decoded = await decodePlayableMp4Browser({ mp4Bytes: bytes, maxFrames: 2 });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.decoder).toBe("webcodecs");
    expect(decoded.sourceFrameCount).toBe(72);
    expect(decoded.frameCount).toBe(2);
    expect(decoded.width).toBe(720);
    expect(decoded.height).toBe(1280);
    expect(decoded.truncated).toBe(true);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.requestedMaxFrames).toBe(2);
    expect(decoded.fallbackReason).toBe("none");
    expect(formatPlayableBrowserDecodeNote(decoded)).toMatch(/liveSample maxFrames=2 of source=72/);
    expect(formatPlayableBrowserDecodeNote(decoded)).not.toMatch(/8-frame UI compose; full 72f/);
    expect(decoded.frames[0]!.image.data.length).toBe(720 * 1280 * 4);
    expect(decoded.frames.map((f) => f.index)).toEqual([0, 1]);

    const { report, json } = evaluatePlayableVideoQa({
      mp4: committedPlayableMp4Ref(),
      decodedFrames: decoded.frames,
      includeDecodedFrames: false,
      pairCompose: false,
    });
    expect(report.frameCount).toBe(2);
    expect(report.frameCount).toBeGreaterThan(0);
    expect(report.awaiting).not.toContain("decoded_frames");
    expect(report.verdict).not.toBe("INCOMPLETE");
    expect(report.failCount).toBe(0);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(json.provenance?.source).toBe("playable_mp4_decode");
  });
});

describe("decodeCommittedPlayableMp4ForLive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects injected bytes that are not the gate sha256", async () => {
    const result = await decodeCommittedPlayableMp4ForLive({
      mp4Bytes: new Uint8Array([0, 1, 2, 3]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sha256_mismatch");
  });

  it("defaults to the full 72-frame gate (tiny mock rasters; not 265 MB)", async () => {
    installMockWebCodecs({ width: 8, height: 8 });
    const decoded = await decodeCommittedPlayableMp4ForLive({ mp4Bytes: gateBytes() });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(LIVE_PLAYABLE_DECODE_MAX_FRAMES);
    expect(decoded.frameCount).toBe(72);
    expect(decoded.sourceFrameCount).toBe(72);
    expect(decoded.liveSample).toBe(false);
    expect(decoded.truncated).toBe(false);
    expect(decoded.fallbackReason).toBe("none");
    expect(decoded.requestedMaxFrames).toBe(72);
    expect(decoded.sha256).toBe(PLAYABLE_MP4_SHA256);
    expect(formatPlayableBrowserDecodeNote(decoded)).toBe(
      "browserDecode=webcodecs 8×8 fullDecode frames=72 source=72.",
    );
  });

  it("keeps an explicit 8-frame sample when maxFrames is set (not the UI compose)", async () => {
    installMockWebCodecs({ width: 8, height: 8 });
    const decoded = await decodeCommittedPlayableMp4ForLive({
      mp4Bytes: gateBytes(),
      maxFrames: 8,
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(8);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.fallbackReason).toBe("none");
    expect(formatPlayableBrowserDecodeNote(decoded)).toMatch(
      /liveSample maxFrames=8 of source=72 \(not the 8-frame UI compose\)/,
    );
  });

  it("keeps a partial sample on timeout instead of FAIL / INCOMPLETE", async () => {
    installMockWebCodecs({ width: 8, height: 8, hangCopyAfter: 3 });
    const decoded = await decodePlayableMp4Browser({
      mp4Bytes: gateBytes(),
      maxFrames: 12,
      timeoutMs: 40,
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(3);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.fallbackReason).toBe("timeout");
    expect(formatPlayableBrowserDecodeNote(decoded)).toMatch(/fallback=timeout/);
  });

  it("keeps a partial sample on OOM mid-decode (never false FAIL)", async () => {
    installMockWebCodecs({
      width: 8,
      height: 8,
      failAfter: 4,
      failMessage: "Allocation failed: out of memory",
    });
    const decoded = await decodePlayableMp4Browser({
      mp4Bytes: gateBytes(),
      maxFrames: 72,
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(4);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.fallbackReason).toBe("oom");
  });

  it("steps the progressive ladder when a larger attempt yields 0 frames", async () => {
    let attempts = 0;
    const fill = 40;
    class MockFrame {
      timestamp: number;
      displayWidth = 8;
      displayHeight = 8;
      constructor(timestamp: number) {
        this.timestamp = timestamp;
      }
      close() {
        /* noop */
      }
      allocationSize() {
        return 8 * 8 * 4;
      }
      async copyTo(destination: Uint8Array) {
        destination.fill(fill);
        for (let i = 3; i < destination.length; i += 4) destination[i] = 255;
      }
    }
    class MockDecoder {
      state = "unconfigured";
      static async isConfigSupported() {
        return { supported: true };
      }
      output: (frame: MockFrame) => void;
      error: (e: DOMException) => void;
      constructor(init: { output: (frame: MockFrame) => void; error: (e: DOMException) => void }) {
        this.output = init.output;
        this.error = init.error;
      }
      configure() {
        this.state = "configured";
        attempts++;
      }
      decode(chunk: { timestamp: number }) {
        if (attempts === 1) {
          this.error(new DOMException("Allocation failed: out of memory"));
          return;
        }
        this.output(new MockFrame(chunk.timestamp));
      }
      async flush() {
        /* noop */
      }
      close() {
        this.state = "closed";
      }
    }
    vi.stubGlobal("VideoDecoder", MockDecoder);
    vi.stubGlobal(
      "EncodedVideoChunk",
      class {
        timestamp: number;
        constructor(init: { timestamp: number }) {
          this.timestamp = init.timestamp;
        }
      },
    );
    const decoded = await decodeCommittedPlayableMp4ForLive({
      mp4Bytes: gateBytes(),
      maxFrames: 72,
    });
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(24);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.fallbackReason).toBe("progressive_ladder");
    expect(decoded.requestedMaxFrames).toBe(72);
    expect(formatPlayableBrowserDecodeNote(decoded)).toMatch(/fallback=progressive_ladder/);
  });

  it("abort with 0 frames stays INCOMPLETE (recoverable fail, not E2 FAIL)", async () => {
    installMockWebCodecs({ width: 8, height: 8 });
    const decoded = await decodePlayableMp4Browser({
      mp4Bytes: gateBytes(),
      maxFrames: 72,
      abortSignal: AbortSignal.abort(),
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.code).toBe("decode_failed");
    expect(decoded.message).toMatch(/abort/);
  });
});

describe("fetchPlayableMp4Bytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists same-origin public path before GitHub raw", () => {
    const urls = committedPlayableMp4FetchCandidates("https://example.test/gate.mp4");
    expect(urls[0]).toBe("https://example.test/gate.mp4");
    expect(urls).toContain("/reconstruct/playable-76fe7438.mp4");
    expect(urls.some((u) => u.includes("raw.githubusercontent.com"))).toBe(true);
  });

  it("returns fetch_failed when every candidate 404s (INCOMPLETE preserved)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    const result = await fetchPlayableMp4Bytes({
      expectedSha256: PLAYABLE_MP4_SHA256,
      expectedByteLength: PLAYABLE_MP4_BYTE_LENGTH,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("fetch_failed");
  });

  it("accepts fetched bytes that match the committed sha256", async () => {
    const bytes = new Uint8Array(gateBytes());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes, { status: 200 })),
    );
    const result = await fetchPlayableMp4Bytes({
      url: "/reconstruct/playable-76fe7438.mp4",
      expectedSha256: PLAYABLE_MP4_SHA256,
      expectedByteLength: PLAYABLE_MP4_BYTE_LENGTH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sha256).toBe(PLAYABLE_MP4_SHA256);
    expect(result.bytes.byteLength).toBe(PLAYABLE_MP4_BYTE_LENGTH);
  });
});

describe("sha256Hex", () => {
  it("matches the committed gate digest", async () => {
    expect(await sha256Hex(gateBytes())).toBe(PLAYABLE_MP4_SHA256);
  });
});

describe("injected structural frames still score without a decoder", () => {
  it("happy-path pack is independent of WebCodecs", () => {
    const { report } = evaluatePlayableVideoQa({
      mp4: committedPlayableMp4Ref(),
      decodedFrames: happyPathFrames(3),
      includeDecodedFrames: false,
    });
    expect(report.frameCount).toBe(3);
    expect(report.verdict).toBe("PASS");
  });
});
