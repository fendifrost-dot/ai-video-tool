import { describe, expect, it } from "vitest";
import { fixtureSam3Mask } from "./fixtures/liveWiringFixture";
import { FIXTURE_HEIGHT, FIXTURE_WIDTH } from "./fixtures/syntheticMaster";
import {
  consumeSam3ForReconstruct,
  SAM3_CONSUME_VERSION,
  SAM3_LIVE_FETCH_ATTEMPTED,
} from "./sam3Consume";

function callerMask(width = FIXTURE_WIDTH, height = FIXTURE_HEIGHT) {
  const n = width * height;
  const outfitAlpha = Array.from({ length: n }, (_, i) => (i < 8 ? 1 : 0));
  const repairAlpha = Array.from({ length: n }, () => 0);
  repairAlpha[0] = 1;
  return { width, height, outfitAlpha, repairAlpha, source: "caller_supplied" as const };
}

describe("consumeSam3ForReconstruct", () => {
  it("never attempts a live SAM-3 fetch", () => {
    expect(SAM3_LIVE_FETCH_ATTEMPTED).toBe(false);
    const result = consumeSam3ForReconstruct({
      raw: { maskPath: "look-composites/user/sam3/clothing.png", prompt: "clothing" },
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sam3.liveFetch).toBe(false);
    expect(result.provenance.liveFetchAttempted).toBe(false);
    expect(result.provenance.paidCalls).toBe(false);
    expect(result.provenance.fallbackStatus).toBe("live_unavailable_used_fixture");
    expect(result.provenance.source).toBe("unavailable_fallback_fixture");
    expect(result.provenance.mask?.checksum).toEqual(expect.any(String));
  });

  it("records caller-supplied mask provenance without fallback", () => {
    const raw = callerMask();
    const result = consumeSam3ForReconstruct({
      raw,
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.consumeVersion).toBe(SAM3_CONSUME_VERSION);
    expect(result.provenance.source).toBe("caller_supplied");
    expect(result.provenance.fallbackStatus).toBe("not_needed");
    expect(result.provenance.failure).toBeNull();
    expect(result.sam3.outfitAlpha[0]).toBe(1);
    expect(result.provenance.mask?.outfitPixelCount).toBe(8);
    expect(result.provenance.mask?.repairPixelCount).toBe(1);
  });

  it("refuses invalid payloads instead of silently substituting a fixture", () => {
    const result = consumeSam3ForReconstruct({
      raw: { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT, outfitAlpha: [1, 2] },
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sam3_invalid_payload");
    expect(result.provenance.fallbackStatus).toBe("invalid_payload_refused");
    expect(result.provenance.paidCalls).toBe(false);
  });

  it("refuses liveFetch requests without calling a paid API, then fixtures when allowed", () => {
    const result = consumeSam3ForReconstruct({
      raw: { liveFetch: true },
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.failure?.code).toBe("sam3_live_fetch_refused");
    expect(result.provenance.fallbackStatus).toBe("live_unavailable_used_fixture");
    expect(result.sam3.source).toBe("unavailable_fallback_fixture");
  });

  it("fails closed when live SAM is unavailable and fallback is disabled", () => {
    const result = consumeSam3ForReconstruct({
      raw: undefined,
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
      allowFixtureFallback: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sam3_live_unavailable");
    expect(result.provenance.fallbackStatus).toBe("refused_no_fallback");
  });

  it("fails on raster mismatch", () => {
    const raw = callerMask(8, 8);
    const result = consumeSam3ForReconstruct({
      raw,
      expectedWidth: FIXTURE_WIDTH,
      expectedHeight: FIXTURE_HEIGHT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("sam3_size_mismatch");
  });

  it("accepts an in-memory fixture mask as source=fixture", () => {
    const fixture = fixtureSam3Mask();
    const result = consumeSam3ForReconstruct({
      raw: {
        width: fixture.width,
        height: fixture.height,
        outfitAlpha: fixture.outfitAlpha,
        repairAlpha: fixture.repairAlpha,
        source: "fixture",
      },
      expectedWidth: fixture.width,
      expectedHeight: fixture.height,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.source).toBe("fixture");
    expect(result.provenance.fallbackStatus).toBe("not_needed");
  });
});
