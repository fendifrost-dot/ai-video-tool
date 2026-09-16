import { describe, expect, it } from "vitest";
import { fixtureSam3Mask } from "../fixtures/liveWiringFixture";
import { consumeIntendedSam3, INTENDED_SAM3_EVIDENCE_ID } from "./sam3Consume";

describe("consumeIntendedSam3", () => {
  it("consumes Stage 1h evidence at 720×1280 with liveFetch=false", () => {
    const out = consumeIntendedSam3({ width: 720, height: 1280, required: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.mask.liveFetch).toBe(false);
    expect(out.mask.width).toBe(720);
    expect(out.mask.height).toBe(1280);
    expect(out.mask.outfitAlpha.length).toBe(720 * 1280);
    expect(out.provenance.source).toBe("intended_stage1h_evidence");
    expect(out.provenance.evidenceId).toBe(INTENDED_SAM3_EVIDENCE_ID);
    expect(out.provenance.liveFetch).toBe(false);
    expect(out.provenance.fallbackStatus).toBe("none");
    expect(out.provenance.failure).toBeNull();
    expect(out.provenance.outfitCoverage).toBeGreaterThan(0);
    expect(out.provenance.repairCoverage).toBeGreaterThan(0);
  });

  it("fails closed on caller-supplied size mismatch (no silent fixture)", () => {
    const out = consumeIntendedSam3({
      width: 720,
      height: 1280,
      caller: fixtureSam3Mask(80, 128),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("sam3_size_mismatch");
    expect(out.provenance.failureBehavior).toBe("fail_closed_size_mismatch");
    expect(out.provenance.fallbackStatus).toBe("rejected_not_used");
    expect(out.provenance.liveFetch).toBe(false);
  });

  it("accepts caller-supplied mask at the working size", () => {
    const caller = fixtureSam3Mask(720, 1280);
    const out = consumeIntendedSam3({ width: 720, height: 1280, caller });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.provenance.source).toBe("caller_supplied");
    expect(out.mask.outfitAlpha).toBe(caller.outfitAlpha);
  });
});
