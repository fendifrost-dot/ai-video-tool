import { describe, expect, it } from "vitest";
import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { VIDEO_QA_SPEC_VERSION } from "@/lib/eval";
import { RECONSTRUCT_LIVE_WIRING_ARMED } from "../liveWiring";
import {
  PLAYABLE_E2_HOOK_SCHEMA,
  PLAYABLE_WORKING_HEIGHT,
  PLAYABLE_WORKING_WIDTH,
} from "./contract";
import {
  formatHeroFramePlayableExportCopy,
  heroFramePlayableExportEnabled,
  prepareHeroFramePlayableExport,
  runHeroFramePlayableExport,
} from "./heroFrameExport";

describe("prepareHeroFramePlayableExport", () => {
  it("arms the 720×1280 export when reconstruct + tracking are on", () => {
    expect(RECONSTRUCT_LIVE_WIRING_ARMED).toBe(true);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);
    const intent = prepareHeroFramePlayableExport();
    expect(intent.explicitArm).toBe(true);
    expect(intent.canExport).toBe(true);
    expect(heroFramePlayableExportEnabled(intent)).toBe(true);
    expect(intent.spec.width).toBe(PLAYABLE_WORKING_WIDTH);
    expect(intent.spec.height).toBe(PLAYABLE_WORKING_HEIGHT);
    expect(intent.spec.masterClipAssetId).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
  });
});

describe("formatHeroFramePlayableExportCopy", () => {
  it("never writes temporalTrackingEnabled=false when tracking is true", () => {
    const on = formatHeroFramePlayableExportCopy({
      temporalTrackingEnabled: true,
      reconstructArmed: true,
      explicitArm: true,
      canExport: true,
    });
    expect(on).toMatch(/temporalTrackingEnabled=true/);
    expect(on).not.toMatch(/temporalTrackingEnabled=false/);
    expect(on).toMatch(/720×1280/);
  });
});

describe("runHeroFramePlayableExport", () => {
  it("emits E2 hook JSON and evaluateVideoQa report without owning scoring", () => {
    const { compose, summary, hookJson, videoQaJson } = runHeroFramePlayableExport();
    expect(compose.ok).toBe(true);
    expect(summary).toMatch(/PLAYABLE compose 720×1280/);
    expect(summary).toMatch(/Lane E2 video QA/);
    expect(hookJson).not.toBeNull();
    expect(hookJson?.schemaVersion).toBe(PLAYABLE_E2_HOOK_SCHEMA);
    expect(hookJson?.scoringOwner).toBe("lane_e2");
    expect(hookJson?.scoringModules).toBe("src/lib/eval/**");
    const input = hookJson?.evaluatorInput as {
      width: number;
      height: number;
      masterClipAssetId: string;
    };
    expect(input.width).toBe(720);
    expect(input.height).toBe(1280);
    expect(input.masterClipAssetId).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
    expect(videoQaJson).not.toBeNull();
    expect(videoQaJson?.schemaVersion).toBe(VIDEO_QA_SPEC_VERSION);
    expect(videoQaJson?.paidCalls).toBe(false);
    expect(videoQaJson?.stillGoldensReopened).toBe(false);
    expect(videoQaJson?.blockingArtifactProducer).toBe(false);
  });
});
