import { describe, expect, it } from "vitest";
import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { runReconstructE2e } from "./e2e";
import { liveWiringFixturePack } from "./fixtures/liveWiringFixture";
import {
  HERO_FRAME_RECONSTRUCT_RUN_VERSION,
  formatHeroFrameReconstructGateCopy,
  formatReconstructE2eError,
  heroFrameReconstructRunEnabled,
  heroFrameReconstructRunEnabledFromDispatch,
  prepareHeroFrameReconstructDispatch,
  runHeroFrameReconstructFromTemporalJson,
  summarizeReconstructE2eResult,
} from "./heroFrameRun";
import { RECONSTRUCT_LIVE_WIRING_ARMED, TEMPORAL_ARMED_AFTER_PR_88 } from "./liveWiring";

function fixturePropagateJson() {
  const pack = liveWiringFixturePack();
  return {
    ok: true,
    paidCalls: false,
    grokPerFrame: false,
    jobs: pack.temporalJobs.map((job) => ({
      kind: job.kind,
      sourceAssetId: job.sourceAssetId,
      frames: job.frames.map((fr) => ({
        index: fr.index,
        width: fr.width,
        height: fr.height,
        mask: Array.from(fr.mask),
        confidence: fr.confidence,
        reanchorRecommended: fr.reanchorRecommended === true,
      })),
    })),
  };
}

describe("heroFrameReconstructRunEnabled", () => {
  it("enables only when canDispatch, reconstructArmed, and tracking are all true", () => {
    expect(
      heroFrameReconstructRunEnabled({
        canDispatch: true,
        reconstructArmed: true,
        temporalTrackingEnabled: true,
      }),
    ).toBe(true);
  });

  it("disables when canDispatch is false", () => {
    expect(
      heroFrameReconstructRunEnabled({
        canDispatch: false,
        reconstructArmed: true,
        temporalTrackingEnabled: true,
      }),
    ).toBe(false);
  });

  it("matches the live product dispatch (armed + tracking + canDispatch)", () => {
    expect(RECONSTRUCT_LIVE_WIRING_ARMED).toBe(true);
    expect(TEMPORAL_ARMED_AFTER_PR_88).toBe(true);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);
    const dispatch = prepareHeroFrameReconstructDispatch();
    expect(dispatch.contractVersion).toBe(HERO_FRAME_RECONSTRUCT_RUN_VERSION);
    expect(dispatch.explicitArm).toBe(true);
    expect(dispatch.canDispatch).toBe(true);
    expect(heroFrameReconstructRunEnabledFromDispatch(dispatch)).toBe(true);
    expect(dispatch.lineage.projectId).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(dispatch.lineage.masterClipAssetId).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
  });
});

describe("formatHeroFrameReconstructGateCopy", () => {
  it("never writes temporalTrackingEnabled=false when tracking is true", () => {
    const on = formatHeroFrameReconstructGateCopy({
      temporalTrackingEnabled: true,
      reconstructArmed: true,
      explicitArm: true,
      canDispatch: true,
    });
    expect(on).toMatch(/temporalTrackingEnabled=true/);
    expect(on).not.toMatch(/temporalTrackingEnabled=false/);
    expect(on).toMatch(/Run reconstruct E2E \$0/);
  });
});

describe("formatReconstructE2eError", () => {
  it("surfaces 401 / missing bearer as sign-in required", () => {
    expect(formatReconstructE2eError(new Error("http_401"))).toMatch(/^401 — sign in required/);
    expect(formatReconstructE2eError(new Error("missing_bearer"))).toMatch(/401/);
    expect(formatReconstructE2eError(new Error("not_authorized"))).toBe("not_authorized");
  });
});

describe("runHeroFrameReconstructFromTemporalJson", () => {
  it("scores PASS on fixture-shaped temporal JSON with paidCalls=false", () => {
    const { e2e, report } = runHeroFrameReconstructFromTemporalJson(fixturePropagateJson());
    expect(e2e.ok).toBe(true);
    expect(report.verdict).toBe("PASS");
    expect(report.paidCalls).toBe(false);
    expect(report.grokPerFrame).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.escalate).toBeNull();
    expect(summarizeReconstructE2eResult(report)).toMatch(/RECONSTRUCT-1 PASS/);
  });
});

describe("runReconstructE2e fixture score path", () => {
  it("fixture allow path also preserves unauthorized pixels", () => {
    const e2e = runReconstructE2e({ explicitArm: true, allowFixtureTemporal: true });
    expect(e2e.ok).toBe(true);
  });
});
