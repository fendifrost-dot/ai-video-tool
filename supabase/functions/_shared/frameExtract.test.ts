import { describe, expect, it } from "vitest";
import {
  buildExtractionManifest,
  decideClipNormalize,
  buildMetadataInput,
  buildScaleInput,
  buildTrimInput,
  canonicalizeExtractConfig,
  contiguousFromZero,
  extractClipVideoUrl,
  extractionIdForConfig,
  extractionTruncated,
  extractFramePath,
  extractFramePrefix,
  extractVideoMeta,
  frameIndexFromPath,
  isBrowserDecodableCodec,
  manifestComplete,
  manifestFramePaths,
  planExtractionFrames,
  storedIndicesFromManifest,
  type ExtractConfig,
  type ExtractionRepro,
} from "./frameExtract";
import { assessProcessingCompatibility, isHdrSource } from "./videoPreflight";

const CFG: ExtractConfig = {
  assetId: "asset-1",
  startSec: 2,
  durationSec: 3,
  fps: 12,
};

const REPRO: ExtractionRepro = {
  falTrimModel: "fal-ai/workflow-utilities/trim-video",
  falScaleModel: "fal-ai/workflow-utilities/scale-video",
  falMetaModel: "fal-ai/ffmpeg-api/metadata",
  mode: "trim_scale",
  sourceAssetPath: "user-1/asset-1/master.mov",
  sourceCodec: "hevc",
  sourceFps: 30,
  clipCodec: "h264",
};

describe("canonicalizeExtractConfig", () => {
  it("is stable and independent of FP noise in the range/fps", () => {
    const a = canonicalizeExtractConfig({ ...CFG, startSec: 2.0000001 });
    const b = canonicalizeExtractConfig({ ...CFG, startSec: 2 });
    expect(a).toBe(b);
  });

  it("changes when clip range, fps, or dims change", () => {
    const base = canonicalizeExtractConfig(CFG);
    expect(canonicalizeExtractConfig({ ...CFG, startSec: 2.5 })).not.toBe(base);
    expect(canonicalizeExtractConfig({ ...CFG, durationSec: 4 })).not.toBe(base);
    expect(canonicalizeExtractConfig({ ...CFG, fps: 24 })).not.toBe(base);
    expect(canonicalizeExtractConfig({ ...CFG, width: 1280, height: 720 })).not.toBe(base);
  });

  it("rejects invalid configs", () => {
    expect(() => canonicalizeExtractConfig({ ...CFG, assetId: "" })).toThrow();
    expect(() => canonicalizeExtractConfig({ ...CFG, startSec: -1 })).toThrow();
    expect(() => canonicalizeExtractConfig({ ...CFG, durationSec: 0 })).toThrow();
    expect(() => canonicalizeExtractConfig({ ...CFG, fps: 0 })).toThrow();
  });
});

describe("extractionIdForConfig — idempotency identity", () => {
  it("is deterministic for the same config", () => {
    expect(extractionIdForConfig(CFG)).toBe(extractionIdForConfig({ ...CFG }));
  });

  it("differs when the config changes", () => {
    expect(extractionIdForConfig(CFG)).not.toBe(extractionIdForConfig({ ...CFG, fps: 24 }));
  });

  it("is a short prefixed hex id", () => {
    expect(extractionIdForConfig(CFG)).toMatch(/^ex_[0-9a-f]{12}$/);
  });
});

describe("planExtractionFrames — exact source timestamps + order", () => {
  it("plans floor(duration*fps) frames", () => {
    expect(planExtractionFrames(CFG)).toHaveLength(36); // 3s * 12fps
  });

  it("anchors frame i to startSec + i/fps (exact, monotonic, no drift)", () => {
    const frames = planExtractionFrames({ assetId: "a", startSec: 2, durationSec: 1, fps: 4 });
    expect(frames.map((f) => f.sourceTimestamp)).toEqual([2, 2.25, 2.5, 2.75]);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].sourceTimestamp).toBeGreaterThan(frames[i - 1].sourceTimestamp);
      expect(frames[i].index).toBe(i);
    }
  });

  it("caps at maxFrames and reports truncation", () => {
    const cfg = { assetId: "a", startSec: 0, durationSec: 100, fps: 30 }; // 3000 planned
    expect(planExtractionFrames(cfg, 50)).toHaveLength(50);
    expect(extractionTruncated(cfg, 50)).toBe(true);
    expect(extractionTruncated(CFG, 900)).toBe(false);
  });

  it("always yields at least one frame", () => {
    expect(
      planExtractionFrames({ assetId: "a", startSec: 0, durationSec: 0.01, fps: 1 }),
    ).toHaveLength(1);
  });
});

describe("extractFramePath — ordered, deterministic storage layout", () => {
  it("zero-pads so lexical order == frame order", () => {
    const id = extractionIdForConfig(CFG);
    expect(extractFramePath("u", "asset-1", id, 7)).toBe(
      `${extractFramePrefix("u", "asset-1", id)}000007.jpg`,
    );
    const p9 = extractFramePath("u", "asset-1", id, 9);
    const p10 = extractFramePath("u", "asset-1", id, 10);
    expect(p9 < p10).toBe(true); // 000009 < 000010 lexically
  });

  it("records the true extension", () => {
    const id = extractionIdForConfig(CFG);
    expect(extractFramePath("u", "asset-1", id, 0, "png")).toMatch(/000000\.png$/);
  });

  it("is stable for the same (user, asset, config, index)", () => {
    const id = extractionIdForConfig(CFG);
    expect(extractFramePath("u", "asset-1", id, 3)).toBe(extractFramePath("u", "asset-1", id, 3));
  });
});

describe("buildExtractionManifest", () => {
  it("captures session id, per-frame index/timestamp/path/dims, and repro", () => {
    const m = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      width: undefined,
    } as never);
    expect(m.extractionId).toBe(extractionIdForConfig(CFG));
    expect(m.configHash).toBe(m.extractionId);
    expect(m.frames).toHaveLength(36);
    expect(m.frames[0]).toMatchObject({ index: 0, sourceTimestamp: 2, stored: false });
    expect(m.frames[0].path).toContain(m.framePrefix);
    expect(m.repro.falTrimModel).toBe("fal-ai/workflow-utilities/trim-video");
    expect(m.frameCount).toBe(36);
  });

  it("marks stored indices and reports completeness/resume set", () => {
    const stored = Array.from({ length: 36 }, (_, i) => i).filter((i) => i !== 5 && i !== 9);
    const partial = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      storedIndices: stored,
    });
    expect(manifestComplete(partial)).toBe(false);
    // Resume set == exactly the stored ones (the two gaps are excluded).
    expect(storedIndicesFromManifest(partial).sort((a, b) => a - b)).toEqual(stored);
    expect(partial.frames.find((f) => f.index === 5)!.stored).toBe(false);

    const full = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      storedIndices: Array.from({ length: 36 }, (_, i) => i),
    });
    expect(manifestComplete(full)).toBe(true);
  });

  it("emits ordered frame paths for downstream consumption", () => {
    const m = buildExtractionManifest({
      config: { assetId: "a", startSec: 0, durationSec: 1, fps: 4 },
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
    });
    const paths = manifestFramePaths(m);
    expect(paths).toHaveLength(4);
    expect([...paths].sort()).toEqual(paths); // already in order
  });

  it("applies per-frame measured dims when provided", () => {
    const m = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      dimsByIndex: { 0: { width: 1280, height: 720 } },
    });
    expect(m.frames[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it("framesOverride builds a server-authoritative manifest from the actual stored set", () => {
    // Client decoded 3 frames from the trimmed clip (not the planned 36).
    const storedNow = [0, 1, 2];
    const m = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      framesOverride: storedNow,
      storedIndices: storedNow,
    });
    expect(m.frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(manifestComplete(m)).toBe(true); // all listed frames are stored
    // Exact source timestamps preserved: start(2) + index/fps(12).
    expect(m.frames[1].sourceTimestamp).toBeCloseTo(2 + 1 / 12, 6);
  });

  it("carries the trimmed-clip pointer for Lane C", () => {
    const m = buildExtractionManifest({
      config: CFG,
      userId: "u",
      frameBucket: "project-exports",
      repro: REPRO,
      clipPath: "u/asset-1/extract/ex_x/clip.mp4",
      clipBucket: "project-exports",
    });
    expect(m.clipPath).toBe("u/asset-1/extract/ex_x/clip.mp4");
    expect(m.clipBucket).toBe("project-exports");
  });
});

describe("Fal input shaping — CONFIRMED keys", () => {
  it("buildTrimInput passes start_time + duration in seconds (not end_time)", () => {
    const input = buildTrimInput("https://s/master.mov", 2.5, 3);
    expect(input).toEqual({
      video_url: "https://s/master.mov",
      start_time: 2.5,
      duration: 3,
    });
    expect(input).not.toHaveProperty("end_time");
  });

  it("buildTrimInput rejects insecure url / bad range", () => {
    expect(() => buildTrimInput("http://x", 0, 1)).toThrow();
    expect(() => buildTrimInput("https://x", -1, 1)).toThrow();
    expect(() => buildTrimInput("https://x", 0, 0)).toThrow();
  });

  it("buildMetadataInput uses media_url", () => {
    expect(buildMetadataInput("https://s/clip.mp4")).toEqual({
      media_url: "https://s/clip.mp4",
      extract_frames: false,
    });
  });

  it("buildScaleInput forces libx264 and clamps dims to even 512–2048", () => {
    const input = buildScaleInput("https://s/clip.mp4", 1281, 400);
    expect(input.codec).toBe("libx264");
    expect(input.width).toBe(1280); // 1281 -> even
    expect(input.height).toBe(512); // clamped up to min 512
    expect(input.mode).toBe("pad");
  });

  it("extractVideoMeta reads duration/fps/codec/resolution", () => {
    const meta = extractVideoMeta({
      media: {
        duration: 12.5,
        fps: 30,
        codec: "hevc",
        container: "mov",
        resolution: { width: 3840, height: 2160 },
      },
    });
    expect(meta).toEqual({
      durationSec: 12.5,
      fps: 30,
      codec: "hevc",
      container: "mov",
      width: 3840,
      height: 2160,
      pixelFormat: null,
      profile: null,
      bitrateBps: null,
      frameCount: null,
    });
  });

  it("extractVideoMeta reads pixel_format/profile/bitrate from media.format (not flat media)", () => {
    // Live Fal shape captured 2026-08-22 on asset 059114c4-… . A flat-key
    // patch would miss these and keep returning null.
    const meta = extractVideoMeta({
      media: {
        codec: "hevc",
        container: "mov",
        duration: 20,
        fps: 60,
        frame_count: 1200,
        bitrate: 40589532,
        resolution: { width: 1080, height: 1920, aspect_ratio: "9:16" },
        format: {
          pixel_format: "yuv420p10le",
          profile: "Main 10",
          video_codec: "hevc",
          bitrate: 40589532,
          level: 123,
          container: "mov",
        },
      },
    });
    expect(meta?.pixelFormat).toBe("yuv420p10le");
    expect(meta?.profile).toBe("Main 10");
    expect(meta?.bitrateBps).toBe(40589532);
    expect(meta?.frameCount).toBe(1200);
    expect(meta?.codec).toBe("hevc");
    expect(meta?.width).toBe(1080);
    expect(meta?.height).toBe(1920);
  });

  it("extractVideoMeta does not invent HDR tags from Main 10 / yuv420p10le", () => {
    const meta = extractVideoMeta({
      media: {
        codec: "hevc",
        format: { pixel_format: "yuv420p10le", profile: "Main 10" },
      },
    });
    const probe = {
      codec: meta?.codec,
      pixelFormat: meta?.pixelFormat,
      bitrateBps: meta?.bitrateBps,
    };
    const compat = assessProcessingCompatibility(probe);
    expect(compat.tags).toContain("10-bit");
    expect(compat.tags).not.toContain("HDR");
    expect(isHdrSource(probe)).toBe(false);
  });

  it("extractClipVideoUrl tolerates trim + scale output shapes", () => {
    expect(extractClipVideoUrl({ video: { url: "https://a.mp4" } })).toBe("https://a.mp4");
    expect(extractClipVideoUrl({ video_url: "https://b.mp4" })).toBe("https://b.mp4");
    expect(extractClipVideoUrl({ output: { url: "https://c.mp4" } })).toBe("https://c.mp4");
    expect(extractClipVideoUrl({ video: { url: "http://insecure" } })).toBeNull();
  });

  it("isBrowserDecodableCodec accepts h264/avc, rejects hevc", () => {
    expect(isBrowserDecodableCodec("h264")).toBe(true);
    expect(isBrowserDecodableCodec("avc1")).toBe(true);
    expect(isBrowserDecodableCodec("hevc")).toBe(false);
    expect(isBrowserDecodableCodec(null)).toBe(false);
  });
});

describe("storage listing → manifest helpers (resume/finalize)", () => {
  it("frameIndexFromPath parses the zero-padded index", () => {
    expect(frameIndexFromPath("u/a/extract/ex_1/000042.jpg")).toBe(42);
    expect(frameIndexFromPath("u/a/extract/ex_1/000000.png")).toBe(0);
    expect(frameIndexFromPath("u/a/extract/ex_1/clip.mp4")).toBeNull();
    expect(frameIndexFromPath("nope")).toBeNull();
  });

  it("contiguousFromZero detects a complete gapless run", () => {
    expect(contiguousFromZero([0, 1, 2, 3])).toBe(true);
    expect(contiguousFromZero([2, 0, 1])).toBe(true); // order-independent
    expect(contiguousFromZero([0, 1, 3])).toBe(false); // gap at 2
    expect(contiguousFromZero([1, 2, 3])).toBe(false); // missing 0
    expect(contiguousFromZero([])).toBe(false);
  });
});

describe("decideClipNormalize — the clip normalize/down-scale decision", () => {
  const base = {
    dimsRequested: false,
    clipCodec: "h264" as string | null,
    planNeedsScale: false,
    planNeedsCodecNormalize: false,
    planTransport: "passthrough",
  };

  it("REGRESSION: a compatible 4K H.264 master with NO caller dims still normalizes", () => {
    // The exact production path: WardrobeVideoLaneRunner sends only
    // { startSec, durationSec }, and H.264 is browser-decodable — so the old
    // `dimsRequested || codecUndecodable` predicate was false on both counts and
    // the clip was stored at full 4K, discarding the plan's down-scale intent.
    const d = decideClipNormalize({
      ...base,
      planNeedsScale: true,
      planTransport: "fal_scale",
    });
    expect(d.normalize).toBe(true);
    expect(d.reasons).toContain("preflight plan wants a down-scale");
  });

  it("a compatible 1080p H.264 master with no caller dims does NOT normalize", () => {
    // The pass-through case must stay pass-through — no pointless re-encode.
    expect(decideClipNormalize(base).normalize).toBe(false);
    expect(decideClipNormalize(base).reasons).toHaveLength(0);
  });

  it("explicit caller dims still trigger it (pre-existing behaviour preserved)", () => {
    const d = decideClipNormalize({ ...base, dimsRequested: true });
    expect(d.normalize).toBe(true);
    expect(d.reasons).toContain("caller dims requested");
  });

  it("an undecodable clip codec still triggers it (pre-existing behaviour preserved)", () => {
    const d = decideClipNormalize({ ...base, clipCodec: "hevc" });
    expect(d.normalize).toBe(true);
    expect(d.reasons[0]).toContain("hevc");
  });

  it("an unavailable codec probe is not treated as undecodable on its own", () => {
    expect(decideClipNormalize({ ...base, clipCodec: null }).normalize).toBe(false);
  });

  it("a plan codec/bit-depth normalize triggers it even at/below the ceiling", () => {
    const d = decideClipNormalize({ ...base, planNeedsCodecNormalize: true });
    expect(d.normalize).toBe(true);
    expect(d.reasons).toContain("preflight plan wants a codec/bit-depth normalize");
  });

  it("fal_scale transport alone triggers it, without double-listing the scale reason", () => {
    const d = decideClipNormalize({ ...base, planTransport: "fal_scale" });
    expect(d.normalize).toBe(true);
    expect(d.reasons).toEqual(["preflight transport is fal_scale"]);
    // When needsScale already covers it, fal_scale must not add a second line.
    const both = decideClipNormalize({ ...base, planNeedsScale: true, planTransport: "fal_scale" });
    expect(both.reasons).toEqual(["preflight plan wants a down-scale"]);
  });

  it("reasons accumulate so the persisted warning names every trigger", () => {
    const d = decideClipNormalize({
      dimsRequested: true,
      clipCodec: "prores",
      planNeedsScale: true,
      planNeedsCodecNormalize: true,
      planTransport: "fal_scale",
    });
    expect(d.reasons).toHaveLength(4);
  });
});
