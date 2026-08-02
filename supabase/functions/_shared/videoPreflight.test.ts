import { describe, expect, it } from "vitest";
import {
  assessProcessingCompatibility,
  buildPreflightMetadata,
  computeScaleTransform,
  DEFAULT_CEILING_LONG_EDGE,
  effectiveBitrateBps,
  FALLBACK_CEILING_LONG_EDGE,
  FAL_INPUT_MAX_LONG_EDGE,
  isH264_8bit,
  nextCeilingRung,
  planPreflight,
  PREFLIGHT_VERSION,
  readAssetSourceMedia,
  resolveCeiling,
  resolveSourceProbe,
  toEvenDim,
  type PreflightRequest,
} from "./videoPreflight";

const clip = { startSec: 75, durationSec: 4 };
const req = (
  source: PreflightRequest["source"],
  extra: Partial<PreflightRequest> = {},
): PreflightRequest => ({
  source,
  clip,
  operation: "extract",
  ...extra,
});

describe("toEvenDim", () => {
  it("rounds to the nearest even, floored at 2", () => {
    expect(toEvenDim(1080)).toBe(1080);
    expect(toEvenDim(1081)).toBe(1080);
    expect(toEvenDim(719)).toBe(718);
    expect(toEvenDim(1)).toBe(2);
    expect(toEvenDim(0)).toBe(2);
  });
});

describe("resolveCeiling", () => {
  it("defaults to 1080p and clamps to the sane even range", () => {
    expect(resolveCeiling(undefined)).toBe(DEFAULT_CEILING_LONG_EDGE);
    expect(resolveCeiling(0)).toBe(DEFAULT_CEILING_LONG_EDGE);
    expect(resolveCeiling(1281)).toBe(1280); // even-forced
    expect(resolveCeiling(100)).toBe(320); // min clamp
    expect(resolveCeiling(9999)).toBe(FAL_INPUT_MAX_LONG_EDGE); // max clamp
  });
});

describe("nextCeilingRung", () => {
  it("steps down 1080p → 720p → null", () => {
    expect(nextCeilingRung(DEFAULT_CEILING_LONG_EDGE)).toBe(FALLBACK_CEILING_LONG_EDGE);
    expect(nextCeilingRung(FALLBACK_CEILING_LONG_EDGE)).toBeNull();
    expect(nextCeilingRung(1000)).toBeNull();
  });
});

describe("isH264_8bit", () => {
  it("accepts h264/avc with unknown or 8-bit 4:2:0 formats", () => {
    expect(isH264_8bit("h264", "yuv420p")).toBe(true);
    expect(isH264_8bit("avc1", null)).toBe(true);
  });
  it("rejects non-h264 and 10-bit / non-420 formats", () => {
    expect(isH264_8bit("hevc", "yuv420p")).toBe(false);
    expect(isH264_8bit("h264", "yuv420p10le")).toBe(false);
    expect(isH264_8bit("h264", "yuv444p")).toBe(false);
  });
});

describe("computeScaleTransform — pass-through when ≤ ceiling", () => {
  it("keeps dims untouched and scale 1 when the source is within the ceiling", () => {
    const t = computeScaleTransform({ width: 1920, height: 1080 }, DEFAULT_CEILING_LONG_EDGE);
    expect(t.passThrough).toBe(true);
    expect(t.proxyWidth).toBe(1920);
    expect(t.proxyHeight).toBe(1080);
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBe(1);
  });

  it("treats a source exactly at the ceiling as pass-through (≤, not <)", () => {
    const t = computeScaleTransform({ width: 1280, height: 720 }, FALLBACK_CEILING_LONG_EDGE);
    expect(t.passThrough).toBe(true);
    expect(t.proxyWidth).toBe(1280);
  });
});

describe("computeScaleTransform — scale math + aspect + even dims", () => {
  it("downscales 4K landscape to exactly 1080p, aspect preserved", () => {
    const t = computeScaleTransform({ width: 3840, height: 2160 }, DEFAULT_CEILING_LONG_EDGE);
    expect(t.passThrough).toBe(false);
    expect(t.proxyWidth).toBe(1920);
    expect(t.proxyHeight).toBe(1080);
    expect(t.scaleX).toBeCloseTo(0.5, 6);
    expect(t.scaleY).toBeCloseTo(0.5, 6);
    // aspect preserved
    expect(t.proxyWidth / t.proxyHeight).toBeCloseTo(3840 / 2160, 6);
  });

  it("downscales 4K PORTRAIT (long edge = height) to 1080 tall", () => {
    const t = computeScaleTransform({ width: 2160, height: 3840 }, DEFAULT_CEILING_LONG_EDGE);
    expect(t.proxyHeight).toBe(1920);
    expect(t.proxyWidth).toBe(1080);
  });

  it("forces EVEN dims on a non-divisible aspect ratio", () => {
    // 1440p 16:9-ish that doesn't divide cleanly to 720p short edge.
    const t = computeScaleTransform({ width: 2560, height: 1440 }, FALLBACK_CEILING_LONG_EDGE);
    expect(t.proxyWidth).toBe(1280);
    expect(t.proxyWidth % 2).toBe(0);
    expect(t.proxyHeight % 2).toBe(0);
  });

  it("never upscales a small source (pass-through)", () => {
    const t = computeScaleTransform({ width: 640, height: 480 }, DEFAULT_CEILING_LONG_EDGE);
    expect(t.passThrough).toBe(true);
    expect(t.proxyWidth).toBe(640);
    expect(t.proxyHeight).toBe(480);
  });
});

describe("planPreflight — transport decisions", () => {
  it("PASS-THROUGH: 1080p H.264 8-bit source ≤ ceiling → no Fal re-encode", () => {
    const p = planPreflight(
      req({ width: 1920, height: 1080, codec: "h264", pixelFormat: "yuv420p" }),
    );
    expect(p.transport).toBe("passthrough");
    expect(p.needsScale).toBe(false);
    expect(p.needsCodecNormalize).toBe(false);
    expect(p.transcodeRequired).toBe(false);
    expect(p.falCanIngest).toBe(true);
  });

  it("FAL_SCALE: 1080p HEVC ≤ ceiling still needs a codec normalize on Fal", () => {
    const p = planPreflight(
      req({ width: 1920, height: 1080, codec: "hevc", pixelFormat: "yuv420p" }),
    );
    expect(p.transport).toBe("fal_scale");
    expect(p.needsScale).toBe(false);
    expect(p.needsCodecNormalize).toBe(true);
    expect(p.transcodeRequired).toBe(false);
  });

  it("FAL_SCALE: 1080p source with a LOWER 720p ceiling downscales on Fal", () => {
    const p = planPreflight(
      req(
        { width: 1920, height: 1080, codec: "h264", pixelFormat: "yuv420p" },
        {
          ceilingLongEdge: FALLBACK_CEILING_LONG_EDGE,
        },
      ),
    );
    expect(p.transport).toBe("fal_scale");
    expect(p.needsScale).toBe(true);
    expect(p.falCanIngest).toBe(true);
    expect(p.transform.proxyWidth).toBe(1280);
    expect(p.transform.proxyHeight).toBe(720);
  });

  it("NON_FAL_TRANSCODE: the 4K HEVC/10-bit master fails the compatibility gate — honestly flagged, not faked", () => {
    const p = planPreflight(
      req({ width: 3840, height: 2160, codec: "hevc", pixelFormat: "yuv420p10le" }),
    );
    expect(p.transport).toBe("non_fal_transcode");
    expect(p.needsProcessing).toBe(true);
    expect(p.transcodeRequired).toBe(true); // deprecated alias tracks needsProcessing
    expect(p.falCanIngest).toBe(false);
    expect(p.falCanProcess).toBe(false);
    expect(p.processingReason).toMatch(/not safely processable/);
    expect(p.transcodeReason).toBe(p.processingReason); // alias matches
    expect(p.compatibilityReasons.join(" ")).toMatch(/HEVC/);
    // The plan still computes the TARGET proxy dims so the mezzanine knows where to land.
    expect(p.transform.proxyWidth).toBe(1920);
    expect(p.transform.proxyHeight).toBe(1080);
  });

  it("FAL_SCALE (reframed): a COMPATIBLE 4K H.264 8-bit small clip is NOT gated — Fal down-scales it", () => {
    // The verified evidence: a 4s / 15.8 MB 4K H.264 clip was accepted by Fal.
    // Resolution alone must NOT trip the gate.
    const p = planPreflight(
      req({
        width: 3840,
        height: 2160,
        codec: "h264",
        pixelFormat: "yuv420p",
        sizeBytes: 15_800_000,
        durationSec: 4,
      }),
    );
    expect(p.needsProcessing).toBe(false);
    expect(p.transport).toBe("fal_scale");
    expect(p.needsScale).toBe(true);
    expect(p.falCanProcess).toBe(true);
    expect(p.transform.proxyWidth).toBe(1920);
    expect(p.transform.proxyHeight).toBe(1080);
  });

  it("gate fires on a huge H.264 file even below 4K (filesize is a factor, not just resolution)", () => {
    const p = planPreflight(
      req({ width: 1920, height: 1080, codec: "h264", pixelFormat: "yuv420p", sizeBytes: 2_000_000_000 }),
    );
    expect(p.needsProcessing).toBe(true);
    expect(p.transport).toBe("non_fal_transcode");
    expect(p.compatibilityReasons.join(" ")).toMatch(/filesize/);
  });

  it("UNKNOWN dims degrade to a warned pass-through (no crash)", () => {
    const p = planPreflight(req({ codec: "h264" }));
    expect(p.transport).toBe("passthrough");
    expect(p.warnings.join(" ")).toMatch(/dims unknown/);
  });
});

describe("planPreflight — HDR passthrough + tonemap hook", () => {
  it("keeps HLG/BT.2020 tags as-is and does NOT tonemap by default", () => {
    const p = planPreflight(
      req({
        width: 1920,
        height: 1080,
        codec: "hevc",
        colorPrimaries: "bt2020",
        transfer: "arib-std-b67",
        matrix: "bt2020nc",
      }),
    );
    expect(p.tonemap).toBe(false);
    expect(p.metadata.color_primaries).toBe("bt2020");
    expect(p.metadata.transfer).toBe("arib-std-b67");
    expect(p.metadata.matrix).toBe("bt2020nc");
    expect(p.warnings.join(" ")).toMatch(/NOT tonemapped/);
  });
});

describe("planPreflight — metadata contract persistence", () => {
  it("persists every required field with the right values", () => {
    const p = planPreflight(
      req({
        width: 3840,
        height: 2160,
        fps: 23.976,
        codec: "hevc",
        colorPrimaries: "bt2020",
        transfer: "smpte2084",
        matrix: "bt2020nc",
      }),
    );
    const m = p.metadata;
    expect(m.source_width).toBe(3840);
    expect(m.source_height).toBe(2160);
    expect(m.proxy_width).toBe(1920);
    expect(m.proxy_height).toBe(1080);
    expect(m.scale_x).toBeCloseTo(0.5, 6);
    expect(m.scale_y).toBeCloseTo(0.5, 6);
    expect(m.source_start_time).toBe(75);
    expect(m.source_duration).toBe(4);
    expect(m.proxy_fps).toBe(23.976); // ORIGINAL fps preserved
    expect(m.codec).toBe("h264");
    expect(m.pixel_format).toBe("yuv420p");
    expect(m.color_primaries).toBe("bt2020");
    expect(m.transfer).toBe("smpte2084");
    expect(m.matrix).toBe("bt2020nc");
    expect(m.source_codec).toBe("hevc");
    expect(m.preflight_version).toBe(PREFLIGHT_VERSION);
  });

  it("honors an explicit fps normalization instead of the source fps", () => {
    const m = buildPreflightMetadata(
      req({ width: 1920, height: 1080, fps: 60 }, { normalizeFps: 30 }),
      computeScaleTransform({ width: 1920, height: 1080 }, DEFAULT_CEILING_LONG_EDGE),
    );
    expect(m.proxy_fps).toBe(30);
  });

  it("preserves ORIGINAL timing (start + duration) verbatim", () => {
    const p = planPreflight(
      req({ width: 1920, height: 1080 }, {
        clip: { startSec: 75.5, durationSec: 3.72 },
      } as Partial<PreflightRequest>),
    );
    expect(p.metadata.source_start_time).toBe(75.5);
    expect(p.metadata.source_duration).toBe(3.72);
  });
});

// ── FIX 1 + FIX 2: asset-authoritative source resolution + the compatibility gate.
// These mirror exactly what the edge callers do: read the asset row's metadata_json
// (AUTHORITATIVE), merge the signed-URL probe as FALLBACK, then plan. The regression
// they lock down: the signed-URL probe returns empty on large masters, which used to
// make planPreflight never run (gate never evaluated, metadata block persisted null).

describe("readAssetSourceMedia — tolerant asset-record reader", () => {
  it("reads a canonical source_media block", () => {
    const s = readAssetSourceMedia({
      source_media: {
        width: 3840,
        height: 2160,
        codec: "hevc",
        pixel_format: "yuv420p10le",
        duration_sec: 4,
        size_bytes: 2_100_000_000,
      },
    });
    expect(s.width).toBe(3840);
    expect(s.height).toBe(2160);
    expect(s.codec).toBe("hevc");
    expect(s.pixelFormat).toBe("yuv420p10le");
    expect(s.durationSec).toBe(4);
    expect(s.sizeBytes).toBe(2_100_000_000);
  });

  it("falls back to the legacy top-level keys the upload path records", () => {
    const s = readAssetSourceMedia({ duration_seconds: 12, size_bytes: 500_000 });
    expect(s.durationSec).toBe(12);
    expect(s.sizeBytes).toBe(500_000);
    expect(s.width).toBeNull();
  });
});

describe("resolveSourceProbe — asset record is authoritative, probe is fallback", () => {
  it("uses asset dims even when the signed-URL probe is EMPTY (the root-cause fix)", () => {
    const assetMedia = readAssetSourceMedia({
      source_media: { width: 2160, height: 3840, codec: "hevc", pixel_format: "yuv420p10le" },
    });
    const emptyProbe = { width: null, height: null, codec: null }; // signed-URL probe returned nothing
    const { source, origin } = resolveSourceProbe(assetMedia, emptyProbe);
    expect(source.width).toBe(2160);
    expect(source.height).toBe(3840);
    expect(origin.width).toBe("asset");
    expect(origin.height).toBe("asset");
  });

  it("fills ONLY the gaps from the probe (probe wins where the asset record is silent)", () => {
    const assetMedia = readAssetSourceMedia({ source_media: { width: 1920, height: 1080 } });
    const probe = { width: 9999, height: 9999, codec: "h264", fps: 30 };
    const { source, origin } = resolveSourceProbe(assetMedia, probe);
    expect(source.width).toBe(1920); // asset wins
    expect(origin.width).toBe("asset");
    expect(source.codec).toBe("h264"); // gap filled from probe
    expect(origin.codec).toBe("probe");
    expect(source.fps).toBe(30);
    expect(origin.fps).toBe("probe");
  });
});

describe("DoD — the caller path end to end (asset-authoritative gate + persisted block)", () => {
  const clipRange = { startSec: 75, durationSec: 4 };

  it("(a) 2160×3840 HEVC/large master trips the gate FROM ASSET DIMS with an empty probe", () => {
    // Asset record present (authoritative); signed-URL probe returns empty.
    const assetMedia = readAssetSourceMedia({
      source_media: {
        width: 2160,
        height: 3840,
        codec: "hevc",
        pixel_format: "yuv420p10le",
        duration_sec: 4,
        size_bytes: 2_100_000_000,
      },
    });
    const emptyProbe = { width: null, height: null };
    const { source } = resolveSourceProbe(assetMedia, emptyProbe);
    const plan = planPreflight({
      source,
      clip: clipRange,
      operation: "extract",
      ceilingLongEdge: DEFAULT_CEILING_LONG_EDGE,
    });
    // planPreflight actually RAN from asset dims (not skipped by an empty probe):
    expect(plan.metadata.source_width).toBe(2160);
    expect(plan.metadata.source_height).toBe(3840);
    // …and the compatibility gate FIRED → needs off-Fal processing.
    expect(plan.needsProcessing).toBe(true);
    expect(plan.transport).toBe("non_fal_transcode");
    expect(plan.metadata.needs_processing).toBe(true);
    // Portrait 4K → target proxy 1080 wide, 1920 tall.
    expect(plan.transform.proxyWidth).toBe(1080);
    expect(plan.transform.proxyHeight).toBe(1920);
  });

  it("(b) a small 1080p H.264 asset PASSES the gate", () => {
    const assetMedia = readAssetSourceMedia({
      source_media: {
        width: 1920,
        height: 1080,
        codec: "h264",
        pixel_format: "yuv420p",
        duration_sec: 4,
        size_bytes: 8_000_000,
      },
    });
    const { source } = resolveSourceProbe(assetMedia, { width: null, height: null });
    const plan = planPreflight({
      source,
      clip: clipRange,
      operation: "extract",
      ceilingLongEdge: DEFAULT_CEILING_LONG_EDGE,
    });
    expect(plan.needsProcessing).toBe(false);
    expect(plan.transport).toBe("passthrough");
    expect(plan.falCanProcess).toBe(true);
  });

  it("(c) the persisted extract_preflight block is populated WITH preflight_version + gate fields", () => {
    const assetMedia = readAssetSourceMedia({
      source_media: { width: 2160, height: 3840, codec: "hevc", pixel_format: "yuv420p10le" },
    });
    const { source } = resolveSourceProbe(assetMedia, { width: null, height: null });
    const plan = planPreflight({
      source,
      clip: clipRange,
      operation: "extract",
      ceilingLongEdge: DEFAULT_CEILING_LONG_EDGE,
    });
    const block = plan.metadata; // exactly what the caller persists as extract_preflight
    expect(block.preflight_version).toBe(PREFLIGHT_VERSION);
    expect(block).not.toBeNull();
    expect(block.source_width).toBe(2160);
    expect(block.source_height).toBe(3840);
    expect(block.proxy_width).toBe(1080);
    expect(block.proxy_height).toBe(1920);
    expect(block.codec).toBe("h264"); // OUTPUT contract
    expect(block.source_codec).toBe("hevc"); // provenance
    expect(block.needs_processing).toBe(true);
    expect(Array.isArray(block.compatibility_reasons)).toBe(true);
    expect(block.compatibility_reasons.length).toBeGreaterThan(0);
  });
});

describe("assessProcessingCompatibility + effectiveBitrateBps — the factor math", () => {
  it("derives bitrate from size/duration when not given directly", () => {
    expect(effectiveBitrateBps({ sizeBytes: 40_000_000, durationSec: 4 })).toBeCloseTo(80_000_000, 0);
    expect(effectiveBitrateBps({ bitrateBps: 12_000_000 })).toBe(12_000_000);
    expect(effectiveBitrateBps({})).toBeNull();
  });

  it("a 1080p HEVC 8-bit source is COMPATIBLE (codec-normalized on Fal, not gated)", () => {
    const c = assessProcessingCompatibility({
      width: 1920,
      height: 1080,
      codec: "hevc",
      pixelFormat: "yuv420p",
    });
    expect(c.compatible).toBe(true);
    expect(c.reasons).toHaveLength(0);
  });

  it("HDR and 10-bit each independently flag incompatibility", () => {
    expect(assessProcessingCompatibility({ transfer: "arib-std-b67" }).compatible).toBe(false);
    expect(assessProcessingCompatibility({ pixelFormat: "yuv420p10le" }).compatible).toBe(false);
  });
});
