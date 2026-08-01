import { describe, expect, it } from "vitest";
import {
  buildPreflightMetadata,
  computeScaleTransform,
  DEFAULT_CEILING_LONG_EDGE,
  FALLBACK_CEILING_LONG_EDGE,
  FAL_INPUT_MAX_LONG_EDGE,
  isH264_8bit,
  nextCeilingRung,
  planPreflight,
  PREFLIGHT_VERSION,
  resolveCeiling,
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

  it("NON_FAL_TRANSCODE: the 4K master cannot use Fal — honestly flagged, not faked", () => {
    const p = planPreflight(
      req({ width: 3840, height: 2160, codec: "hevc", pixelFormat: "yuv420p10le" }),
    );
    expect(p.transport).toBe("non_fal_transcode");
    expect(p.transcodeRequired).toBe(true);
    expect(p.falCanIngest).toBe(false);
    expect(p.transcodeReason).toMatch(/ingest envelope/);
    // The plan still computes the TARGET proxy dims so the mezzanine knows where to land.
    expect(p.transform.proxyWidth).toBe(1920);
    expect(p.transform.proxyHeight).toBe(1080);
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
