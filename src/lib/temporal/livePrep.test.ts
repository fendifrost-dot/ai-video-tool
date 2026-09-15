import { describe, expect, it } from "vitest";
import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  quadNormToTuple,
  tupleToQuadNorm,
} from "./canonicalLineage";
import {
  PENDING_SLEEVE_SLOTS,
  clearedChestApprovedQuad,
  clearedChestQuadSet,
  gatedApprovedQuads,
} from "./approvedQuad";
import {
  authorizeTemporalEdgeRequest,
  buildTemporalEdgeRequest,
  TEMPORAL_EDGE_ADAPTER_VERSION,
} from "./edgeAdapter";
import { prepareHeroFrameTemporalHook } from "./heroFrameHook";
import {
  DEFAULT_SLEEVE_STILL_GATE,
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  TEMPORAL_LIVE_DEPLOY_NOTES,
  TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
  defaultActivationForCanonicalLineage,
  evaluateTemporalLiveActivation,
} from "./livePrep";
import { propagateRepair } from "./propagate";
import {
  buildPropagationJobsFromApprovedSet,
  approvedQuadToPropagationInput,
} from "./quadAdapter";
import {
  CLEARED_CHEST_FIXTURE_SIZE,
  clearedChestApprovedSet,
  clearedChestTranslatingFixture,
  expectedChestQuadAtFrame,
} from "./clearedChestFixture";
import { maskArea, maskIoU, paintQuadMask } from "./mask";
import { translationOf } from "./geometry";
import { TEMPORAL_PROPAGATION_CONTRACT_VERSION } from "./contract";
import { PropagationContractError } from "./validate";

describe("canonical lineage freeze", () => {
  it("matches the Stage 1m CLEARED chest identity", () => {
    expect(CANONICAL_PROJECT_ID).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(CANONICAL_STILL_ASSET_ID).toBe("2aa1a44c-b24a-46bf-890f-13a6fc65b1cc");
    expect(CANONICAL_KEYFRAME_ID).toBe("v2-still-0.785");
    expect(CLEARED_CHEST_ASSET_ID).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(CLEARED_CHEST_REPAIR_METHOD_VERSION).toBe("architecture_c_still_repair_1m");
    expect(CLEARED_CHEST_QUAD_TUPLE).toEqual([
      [0.3, 0.53],
      [0.87, 0.533],
      [0.87, 0.585],
      [0.3, 0.582],
    ]);
  });

  it("round-trips the chest quad tuple ↔ {x,y} form", () => {
    const norm = tupleToQuadNorm(CLEARED_CHEST_QUAD_TUPLE);
    expect(quadNormToTuple(norm)).toEqual(CLEARED_CHEST_QUAD_TUPLE);
  });
});

describe("approved quad set", () => {
  it("exposes CLEARED chest and PENDING sleeve slots only", () => {
    const set = clearedChestQuadSet();
    expect(set.chest.gate).toBe("CLEARED");
    expect(set.sleeveLeft).toBeUndefined();
    expect(set.sleeveRight).toBeUndefined();
    expect(set.reservedSleeveSlots).toEqual(PENDING_SLEEVE_SLOTS);
    expect(gatedApprovedQuads(set).map((q) => q.kind)).toEqual(["chest"]);
  });
});

describe("activation gate", () => {
  it("stays disarmed and waits on sleeve by default", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(false);
    const decision = defaultActivationForCanonicalLineage();
    expect(decision.contractVersion).toBe(TEMPORAL_LIVE_PREP_CONTRACT_VERSION);
    expect(decision.allowed).toBe(false);
    expect(decision.waitingFor).toContain("live_activation_not_armed");
    expect(decision.waitingFor).toContain("sleeve_still_not_cleared");
    expect(decision.waitingFor).toContain("explicit_arm_required");
    expect(decision.chestGate).toBe("CLEARED");
    expect(decision.sleeveGate).toBe("PENDING");
  });

  it("still blocks when sleeve is hypothetically CLEARED but the const is not armed", () => {
    const decision = evaluateTemporalLiveActivation({
      chestGate: "CLEARED",
      sleeveGate: { status: "CLEARED", repairMethodVersion: "architecture_c_sleeve_still_1a" },
      explicitArm: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.waitingFor).toEqual(["live_activation_not_armed"]);
  });

  it("allows only the future-true test override after sleeve CLEARED + explicit arm", () => {
    const decision = evaluateTemporalLiveActivation({
      chestGate: "CLEARED",
      sleeveGate: { status: "CLEARED" },
      explicitArm: true,
      armed: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.waitingFor).toEqual([]);
  });

  it("lists deploy waits that include sleeve CLEARED and forbid current edge redeploys", () => {
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.mustWaitForSleeveCleared.length).toBeGreaterThan(0);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.doNotRedeployFromThisLane).toContain(
      "architecture-c-still-repair-proxy (Lane B sleeve verify; chest path locked)",
    );
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.whenSleeveClearedThen.paidCalls).toBe(false);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.whenSleeveClearedThen.noPerFrameGrok).toBe(true);
  });
});

describe("cleared chest quad fixture — no per-frame Grok", () => {
  it("propagates the CLEARED chest quad across the synthetic clip", () => {
    const input = clearedChestTranslatingFixture();
    const out = propagateRepair(input);
    expect(out.contractVersion).toBe(TEMPORAL_PROPAGATION_CONTRACT_VERSION);
    expect(out.clipId).toBe("live-prep-cleared-chest-quad");
    expect(out.frames).toHaveLength(5);
    expect(maskArea(input.canonical.mask)).toBeGreaterThan(20);

    for (const frame of out.frames) {
      expect("grokPerFrame" in frame).toBe(false);
      expect("provider" in frame).toBe(false);
      if (frame.index === 0) {
        expect(frame.source).toBe("canonical");
      } else {
        expect(frame.source).toBe("propagated");
        expect(frame.reanchorRecommended).toBe(false);
      }
      expect(translationOf(frame.transform)).toEqual({
        dx: frame.index * input.expectedDxPerFrame,
        dy: 0,
      });
      const expectedQuad = expectedChestQuadAtFrame(frame.index);
      expect(frame.quadNorm).toBeDefined();
      expect(frame.quadNorm![0].x).toBeCloseTo(expectedQuad[0]!.x, 3);
      expect(frame.quadNorm![0].y).toBeCloseTo(expectedQuad[0]!.y, 3);
    }
  });

  it("builds a chest-only job that runs propagateRepair with provider none", () => {
    const fixture = clearedChestTranslatingFixture();
    const jobs = buildPropagationJobsFromApprovedSet({
      clip: fixture.clip,
      approved: clearedChestApprovedSet(),
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.kind).toBe("chest");
    expect(jobs[0]!.provider).toBe("none");
    expect(jobs[0]!.grokPerFrame).toBe(false);
    expect(jobs[0]!.paidCalls).toBe(false);
    expect(jobs[0]!.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);

    const out = propagateRepair(jobs[0]!.input);
    expect(out.frames).toHaveLength(fixture.clip.frames.length);
    expect(out.frames.every((f) => f.source === "canonical" || f.source === "propagated")).toBe(
      true,
    );
  });

  it("refuses to adapt a PENDING sleeve quad", () => {
    const fixture = clearedChestTranslatingFixture();
    expect(() =>
      approvedQuadToPropagationInput(
        {
          kind: "sleeve_left",
          keyframeId: CANONICAL_KEYFRAME_ID,
          quadNorm: fixture.canonical.quadNorm!,
          sourceAssetId: "pending",
          repairMethodVersion: "n/a",
          gate: "PENDING",
        },
        fixture.clip,
      ),
    ).toThrow(PropagationContractError);
  });
});

describe("Hero Frame hook", () => {
  it("prepares jobs without enabling tracking or provider calls", () => {
    const fixture = clearedChestTranslatingFixture();
    const hook = prepareHeroFrameTemporalHook({
      clip: fixture.clip,
      sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    });
    expect(hook.temporalTrackingEnabled).toBe(false);
    expect(hook.providerCalls).toEqual([]);
    expect(hook.grokPerFrame).toBe(false);
    expect(hook.lineage.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(hook.lineage.stillAssetId).toBe(CANONICAL_STILL_ASSET_ID);
    expect(hook.lineage.keyframeId).toBe(CANONICAL_KEYFRAME_ID);
    expect(hook.lineage.clearedChestAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(hook.preparedJobs).toHaveLength(1);
    expect(hook.reservedSleeveSlots).toHaveLength(2);
    expect(hook.activation.allowed).toBe(false);
    expect(hook.activation.waitingFor).toContain("sleeve_still_not_cleared");
  });

  it("stays inert without a clip (activation still evaluated)", () => {
    const hook = prepareHeroFrameTemporalHook();
    expect(hook.preparedJobs).toEqual([]);
    expect(hook.temporalTrackingEnabled).toBe(false);
    expect(hook.activation.allowed).toBe(false);
  });
});

describe("edge adapter authorization", () => {
  it("rejects a well-formed request while live activation is not armed", () => {
    const fixture = clearedChestTranslatingFixture();
    const request = buildTemporalEdgeRequest({ clip: fixture.clip });
    expect(request.adapterVersion).toBe(TEMPORAL_EDGE_ADAPTER_VERSION);
    const auth = authorizeTemporalEdgeRequest(request);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.code).toBe("live_activation_not_armed");
    }
  });

  it("authorizes only when armed + sleeve CLEARED + explicitArm (test override)", () => {
    const fixture = clearedChestTranslatingFixture();
    const request = buildTemporalEdgeRequest({
      clip: fixture.clip,
      sleeveGate: { status: "CLEARED" },
      explicitArm: true,
    });
    const denied = authorizeTemporalEdgeRequest(request);
    expect(denied.ok).toBe(false);
    const allowed = authorizeTemporalEdgeRequest(request, true);
    expect(allowed.ok).toBe(true);
  });
});

describe("paintQuadMask", () => {
  it("rasterizes the CLEARED chest quad with non-empty coverage on the fixture size", () => {
    const mask = paintQuadMask(
      CLEARED_CHEST_FIXTURE_SIZE.width,
      CLEARED_CHEST_FIXTURE_SIZE.height,
      tupleToQuadNorm(CLEARED_CHEST_QUAD_TUPLE),
    );
    expect(maskArea(mask)).toBeGreaterThan(20);
    const clone = paintQuadMask(mask.width, mask.height, tupleToQuadNorm(CLEARED_CHEST_QUAD_TUPLE));
    expect(maskIoU(mask, clone)).toBe(1);
  });
});

describe("cleared chest approved quad helper", () => {
  it("points at the CLEARED 1m asset and keyframe", () => {
    const q = clearedChestApprovedQuad();
    expect(q.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(q.keyframeId).toBe(CANONICAL_KEYFRAME_ID);
    expect(q.repairMethodVersion).toBe(CLEARED_CHEST_REPAIR_METHOD_VERSION);
  });
});
