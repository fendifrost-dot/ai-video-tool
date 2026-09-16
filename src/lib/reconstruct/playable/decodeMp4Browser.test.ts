import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demuxMp4Video } from "@/lib/video/mp4Demux";
import { happyPathFrames } from "@/lib/eval/videoQaFixtures";
import {
  CANONICAL_CLIP_FRAME_COUNT,
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  LIVE_PLAYABLE_DECODE_MAX_FRAMES,
} from "./contract";
import {
  committedPlayableMp4FetchCandidates,
  decodeCommittedPlayableMp4ForLive,
  decodePlayableMp4Browser,
  fetchPlayableMp4Bytes,
  formatPlayableBrowserDecodeNote,
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

function installMockWebCodecs(opts: { width: number; height: number; fill?: number }) {
  const fill = opts.fill ?? 40;
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
    constructor(init: { output: (frame: MockFrame) => void; error: (e: DOMException) => void }) {
      this.output = init.output;
    }
    configure() {
      this.state = "configured";
    }
    decode(chunk: { timestamp: number }) {
      this.output(new MockFrame(chunk.timestamp));
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
  it("documents live sample vs 72-frame CI vs 8-frame compose (different sources)", () => {
    expect(LIVE_PLAYABLE_DECODE_MAX_FRAMES).toBe(8);
    expect(HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT).toBe(8);
    expect(CANONICAL_CLIP_FRAME_COUNT).toBe(72);
    expect(LIVE_PLAYABLE_DECODE_MAX_FRAMES).toBeLessThan(CANONICAL_CLIP_FRAME_COUNT);
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

  it("caps live sample at LIVE_PLAYABLE_DECODE_MAX_FRAMES of the 72-frame gate", async () => {
    installMockWebCodecs({ width: 720, height: 1280 });
    const decoded = await decodeCommittedPlayableMp4ForLive({ mp4Bytes: gateBytes() });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frameCount).toBe(LIVE_PLAYABLE_DECODE_MAX_FRAMES);
    expect(decoded.sourceFrameCount).toBe(72);
    expect(decoded.liveSample).toBe(true);
    expect(decoded.sha256).toBe(PLAYABLE_MP4_SHA256);
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
    const bytes = gateBytes();
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
