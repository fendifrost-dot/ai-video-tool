import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { VIDEO_QA_SPEC_VERSION } from "@/lib/eval";
import { happyPathFrames } from "@/lib/eval/videoQaFixtures";
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
  runHeroFramePlayableExportLive,
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
    expect(videoQaJson?.verdict).toBe("INCOMPLETE");
    expect(videoQaJson?.awaiting).toContain("decoded_frames");
    expect(videoQaJson?.failCount).toBe(0);
    expect(videoQaJson?.mp4?.produced).toBe(true);
    expect(videoQaJson?.mp4?.path).toBe(
      "docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4",
    );
    expect(videoQaJson?.mp4?.sha256).toBe(
      "71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b",
    );
    expect(videoQaJson?.mp4?.byteLength).toBe(486769);
    expect(videoQaJson?.mp4?.artifactId).toBe("playable-76fe7438");
    expect(summary).toMatch(/INCOMPLETE/);
    expect(summary).not.toMatch(/\bFAIL\b/);
    expect(summary).toMatch(/mp4=produced/);
  });

  it("scores frames>0 when decoded rasters are attached (Hero Frame hook)", () => {
    const decodedFrames = happyPathFrames(4).map((f) => ({
      index: f.index,
      image: f.reconstructed,
    }));
    const { videoQaJson, summary } = runHeroFramePlayableExport({ decodedFrames });
    expect(videoQaJson).not.toBeNull();
    expect(videoQaJson?.frameCount).toBe(4);
    expect(videoQaJson?.frameCount).toBeGreaterThan(0);
    expect(videoQaJson?.awaiting).not.toContain("decoded_frames");
    expect(videoQaJson?.verdict).toBe("PASS");
    expect(videoQaJson?.failCount).toBe(0);
    expect(videoQaJson?.stillGoldensReopened).toBe(false);
    expect(videoQaJson?.paidCalls).toBe(false);
    expect(videoQaJson?.mp4?.produced).toBe(true);
    expect(videoQaJson?.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(summary).toMatch(/PASS/);
    expect(summary).toMatch(/frames=4/);
    expect(summary).not.toMatch(/INCOMPLETE/);
  });

  it("live Export without WebCodecs stays INCOMPLETE (awaiting decoded_frames)", async () => {
    const bytes = new Uint8Array(
      readFileSync("docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4"),
    );
    const { videoQaJson, summary, decode } = await runHeroFramePlayableExportLive({
      mp4Bytes: bytes,
    });
    expect(decode.ok).toBe(false);
    if (decode.ok) return;
    expect(decode.code).toBe("webcodecs_unavailable");
    expect(videoQaJson?.verdict).toBe("INCOMPLETE");
    expect(videoQaJson?.awaiting).toContain("decoded_frames");
    expect(videoQaJson?.frameCount).toBe(0);
    expect(videoQaJson?.failCount).toBe(0);
    expect(videoQaJson?.mp4?.produced).toBe(true);
    expect(videoQaJson?.stillGoldensReopened).toBe(false);
    expect(summary).toMatch(/INCOMPLETE/);
    expect(summary).toMatch(/webcodecs_unavailable/);
  });

  it("live Export with mocked WebCodecs scores frames>0 off the gate sample", async () => {
    class MockFrame {
      timestamp: number;
      displayWidth = 720;
      displayHeight = 1280;
      constructor(timestamp: number) {
        this.timestamp = timestamp;
      }
      close() {
        /* noop */
      }
      allocationSize() {
        return 720 * 1280 * 4;
      }
      async copyTo(destination: Uint8Array) {
        destination.fill(32);
        for (let i = 3; i < destination.length; i += 4) destination[i] = 255;
      }
    }
    class MockDecoder {
      state = "unconfigured";
      static async isConfigSupported() {
        return { supported: true };
      }
      output: (frame: MockFrame) => void;
      constructor(init: { output: (frame: MockFrame) => void }) {
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
    const bytes = new Uint8Array(
      readFileSync("docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4"),
    );
    const { videoQaJson, summary, decode } = await runHeroFramePlayableExportLive({
      mp4Bytes: bytes,
      maxFrames: 2,
    });
    vi.unstubAllGlobals();
    expect(decode.ok).toBe(true);
    if (!decode.ok) return;
    expect(decode.sourceFrameCount).toBe(72);
    expect(decode.frameCount).toBe(2);
    expect(videoQaJson?.frameCount).toBe(2);
    expect(videoQaJson?.awaiting).not.toContain("decoded_frames");
    expect(videoQaJson?.verdict).not.toBe("INCOMPLETE");
    expect(videoQaJson?.mp4?.produced).toBe(true);
    expect(videoQaJson?.stillGoldensReopened).toBe(false);
    expect(summary).toMatch(/frames=2/);
    expect(summary).toMatch(/webcodecs/);
    expect(summary).not.toMatch(/INCOMPLETE/);
  });
});
