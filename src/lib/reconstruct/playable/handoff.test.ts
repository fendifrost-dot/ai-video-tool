import { describe, expect, it } from "vitest";
import { RECONSTRUCT_LANE_H_HANDOFF_VERSION } from "../exportHandoff";
import { runPlayableCompose } from "./compose";
import { LIVE_PROXY_MAX_FRAMES } from "./contract";
import { buildPlayableLaneHHandoff } from "./handoff";
import { heroFramePlayableSpec } from "./spec";

describe("buildPlayableLaneHHandoff", () => {
  it("emits reconstruct-lane-h-handoff-v2 without choosing codec", () => {
    const compose = runPlayableCompose({
      explicitArm: true,
      spec: heroFramePlayableSpec({ frameCount: 4, keyframeIndex: 1 }),
    });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;

    const handoff = buildPlayableLaneHHandoff(compose);
    expect(handoff.schemaVersion).toBe(RECONSTRUCT_LANE_H_HANDOFF_VERSION);
    expect(handoff.schemaVersion).toBe("reconstruct-lane-h-handoff-v2");
    expect(handoff.exportOwnedBy).toBe("lane_h");
    expect(handoff.paidCalls).toBe(false);
    expect(handoff.stillGoldensReopened).toBe(false);
    expect(handoff.width).toBe(720);
    expect(handoff.height).toBe(1280);
    expect(handoff.fps).toBe(24);
    expect(handoff.frameCount).toBe(4);
    expect(handoff.durationSec).toBeCloseTo(4 / 24);
    expect(handoff.mp4.codecClaims.videoCodec).toBeNull();
    expect(handoff.mp4.codecClaims.container).toBeNull();
    expect(handoff.unauthorizedLeakCount).toBe(0);
    expect(handoff.sam3?.liveFetchAttempted).toBe(false);
    expect(handoff.sam3?.paidCalls).toBe(false);
    expect(handoff.sam3?.source).toBe("caller_supplied");
    expect(LIVE_PROXY_MAX_FRAMES).toBe(24);
  });
});
