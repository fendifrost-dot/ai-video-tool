import { describe, expect, it } from "vitest";
import { CANONICAL_MASTER_CLIP_ID } from "../canonicalClip";
import { TEMPORAL_PROPAGATE_LIMITS, dispatchTemporalPropagate, parseTemporalPropagateClip } from "../edgeDispatch";
import { buildTemporalLiveSmokeBody } from "../liveSmoke";
import {
  inspectTemporalDispatchLock,
  TEMPORAL_QA_YELLOW_CONTRACTS,
  YELLOW_EDGE_MAX_FRAMES,
} from "./dispatchLock";

describe("temporal dispatch path regression lock", () => {
  it("keeps proxy maxFrames at 24 so the 241-frame canonical clip cannot POST", () => {
    const lock = inspectTemporalDispatchLock();
    expect(lock.paidCalls).toBe(false);
    expect(lock.grokPerFrame).toBe(false);
    expect(lock.provider).toBe("none");
    expect(lock.explicitArmRequired).toBe(true);
    expect(lock.jwtGatedProxy).toBe(true);
    expect(lock.edgeMaxFrames).toBe(24);
    expect(TEMPORAL_PROPAGATE_LIMITS.maxFrames).toBe(24);
    expect(lock.canonicalFrameCount).toBe(241);
    expect(lock.fullClipFitsProxy).toBe(false);
    expect(lock.fullClipPath).toBe("in_lib_propagateRepair");
    expect(lock.yellowContracts).toContain(YELLOW_EDGE_MAX_FRAMES);
    expect(lock.yellowContracts).toEqual([...TEMPORAL_QA_YELLOW_CONTRACTS]);
  });

  it("rejects a 241-frame wire clip at parse time without changing authorize", () => {
    const parsed = parseTemporalPropagateClip({
      id: CANONICAL_MASTER_CLIP_ID,
      fps: 59.94,
      frames: Array.from({ length: 241 }, (_, i) => ({
        index: i,
        width: 2,
        height: 2,
        luma: [0, 0, 0, 0],
      })),
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("max 24");
    }
  });

  it("still dispatches the authenticated 5-frame smoke body with paidCalls=false", () => {
    const result = dispatchTemporalPropagate(buildTemporalLiveSmokeBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.body.paidCalls).toBe(false);
    expect(result.body.grokPerFrame).toBe(false);
    expect(result.body.provider).toBe("none");
    expect(result.body.jobs).toHaveLength(3);
    expect(result.body.jobs[0]?.frames).toHaveLength(5);
  });

  it("still refuses dispatch without explicitArm", () => {
    const smoke = buildTemporalLiveSmokeBody();
    const result = dispatchTemporalPropagate({ ...smoke, explicitArm: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.body.code).toBe("explicit_arm_required");
    }
  });
});
