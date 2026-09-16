import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_CHEST_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE,
  quadNormToTuple,
  tupleToQuadNorm,
} from "./canonicalLineage";
import {
  PENDING_SLEEVE_SLOTS,
  clearedChestAndSleeveQuadSet,
  clearedChestApprovedQuad,
  clearedChestQuadSet,
  clearedSleeveLeftApprovedQuad,
  clearedSleeveRightApprovedQuad,
  gatedApprovedQuads,
} from "./approvedQuad";
import {
  authorizeTemporalEdgeRequest,
  buildTemporalEdgeRequest,
  TEMPORAL_EDGE_ADAPTER_VERSION,
} from "./edgeAdapter";
import { dispatchTemporalPropagate, sourceClipToWire } from "./edgeDispatch";
import { prepareHeroFrameTemporalHook } from "./heroFrameHook";
import {
  DEFAULT_SLEEVE_STILL_GATE,
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  TEMPORAL_LIVE_DEPLOY_NOTES,
  TEMPORAL_LIVE_PREP_CONTRACT_VERSION,
  armedActivationForCanonicalLineage,
  defaultActivationForCanonicalLineage,
  evaluateTemporalLiveActivation,
} from "./livePrep";
import { propagateRepair } from "./propagate";
import { buildPropagationJobsFromApprovedSet, approvedQuadToPropagationInput } from "./quadAdapter";
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

  it("matches the live 1c CLEARED sleeve identity and documented seeds", () => {
    expect(CLEARED_SLEEVE_ASSET_ID).toBe("fdb86b18-d4aa-465e-b73f-1d252709739c");
    expect(CLEARED_SLEEVE_REPAIR_METHOD_VERSION).toBe("architecture_c_sleeve_still_1c");
    expect(CLEARED_SLEEVE_LEFT_QUAD_TUPLE).toEqual([
      [0.03, 0.5],
      [0.26, 0.505],
      [0.25, 0.615],
      [0.03, 0.61],
    ]);
    expect(CLEARED_SLEEVE_RIGHT_QUAD_TUPLE).toEqual([
      [0.88, 0.505],
      [0.99, 0.5],
      [0.99, 0.615],
      [0.88, 0.61],
    ]);
  });

  it("round-trips the chest quad tuple ↔ {x,y} form", () => {
    const norm = tupleToQuadNorm(CLEARED_CHEST_QUAD_TUPLE);
    expect(quadNormToTuple(norm)).toEqual(CLEARED_CHEST_QUAD_TUPLE);
  });
});

describe("approved quad set", () => {
  it("keeps a chest-only helper with PENDING sleeve slots", () => {
    const set = clearedChestQuadSet();
    expect(set.chest.gate).toBe("CLEARED");
    expect(set.sleeveLeft).toBeUndefined();
    expect(set.sleeveRight).toBeUndefined();
    expect(set.reservedSleeveSlots).toEqual(PENDING_SLEEVE_SLOTS);
    expect(gatedApprovedQuads(set).map((q) => q.kind)).toEqual(["chest"]);
  });

  it("wires CLEARED chest + sleeve left/right from the 1c lineage", () => {
    const set = clearedChestAndSleeveQuadSet();
    expect(set.chest.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(set.sleeveLeft?.sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(set.sleeveRight?.sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(set.sleeveLeft?.gate).toBe("CLEARED");
    expect(set.sleeveRight?.gate).toBe("CLEARED");
    expect(set.sleeveLeft?.repairMethodVersion).toBe(CLEARED_SLEEVE_REPAIR_METHOD_VERSION);
    expect(quadNormToTuple(set.sleeveLeft!.quadNorm)).toEqual(CLEARED_SLEEVE_LEFT_QUAD_TUPLE);
    expect(quadNormToTuple(set.sleeveRight!.quadNorm)).toEqual(CLEARED_SLEEVE_RIGHT_QUAD_TUPLE);
    expect(set.reservedSleeveSlots).toEqual([]);
    expect(gatedApprovedQuads(set).map((q) => q.kind)).toEqual([
      "chest",
      "sleeve_left",
      "sleeve_right",
    ]);
  });
});

describe("activation gate", () => {
  it("is armed; default still waits on explicitArm", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(true);
    const decision = defaultActivationForCanonicalLineage();
    expect(decision.contractVersion).toBe(TEMPORAL_LIVE_PREP_CONTRACT_VERSION);
    expect(decision.armed).toBe(true);
    expect(decision.allowed).toBe(false);
    expect(decision.waitingFor).toEqual(["explicit_arm_required"]);
    expect(decision.chestGate).toBe("CLEARED");
    expect(decision.sleeveGate).toBe("CLEARED");
    expect(DEFAULT_SLEEVE_STILL_GATE.assetId).toBe(CLEARED_SLEEVE_ASSET_ID);
  });

  it("allows the canonical lineage when explicitArm is set", () => {
    const decision = armedActivationForCanonicalLineage();
    expect(decision.allowed).toBe(true);
    expect(decision.waitingFor).toEqual([]);
    expect(decision.armed).toBe(true);
  });

  it("blocks when the const is hypothetically disarmed", () => {
    const decision = evaluateTemporalLiveActivation({
      chestGate: "CLEARED",
      sleeveGate: { status: "CLEARED", repairMethodVersion: CLEARED_SLEEVE_REPAIR_METHOD_VERSION },
      explicitArm: true,
      armed: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.waitingFor).toEqual(["live_activation_not_armed"]);
  });

  it("blocks when sleeve is not CLEARED even if armed + explicitArm", () => {
    const decision = evaluateTemporalLiveActivation({
      chestGate: "CLEARED",
      sleeveGate: { status: "PENDING" },
      explicitArm: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.waitingFor).toEqual(["sleeve_still_not_cleared"]);
  });

  it("lists edge-only parent redeploy and Hero Frame owner flip", () => {
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.armed).toBe(true);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.parentRedeployOnly.function).toBe("temporal-propagate-proxy");
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.parentRedeployOnly.paidCalls).toBe(false);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.parentRedeployOnly.noPerFrameGrok).toBe(true);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.doNotRedeployFromThisLane).toContain(
      "architecture-c-still-repair-proxy (Lane B sleeve verify; chest path locked)",
    );
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.heroFrameOwnerFlip.current).toBe(false);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.heroFrameOwnerFlip.doNotEditInThisLane).toBe(true);
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

  it("builds chest + sleeve jobs that run propagateRepair with provider none", () => {
    const fixture = clearedChestTranslatingFixture();
    const jobs = buildPropagationJobsFromApprovedSet({
      clip: fixture.clip,
      approved: clearedChestAndSleeveQuadSet(),
    });
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.kind)).toEqual(["chest", "sleeve_left", "sleeve_right"]);
    for (const job of jobs) {
      expect(job.provider).toBe("none");
      expect(job.grokPerFrame).toBe(false);
      expect(job.paidCalls).toBe(false);
      const out = propagateRepair(job.input);
      expect(out.frames).toHaveLength(fixture.clip.frames.length);
      expect(out.frames.every((f) => f.source === "canonical" || f.source === "propagated")).toBe(
        true,
      );
    }
    expect(jobs[0]!.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(jobs[1]!.sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
  });

  it("still builds a chest-only job from the chest-only set", () => {
    const fixture = clearedChestTranslatingFixture();
    const jobs = buildPropagationJobsFromApprovedSet({
      clip: fixture.clip,
      approved: clearedChestApprovedSet(),
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.kind).toBe("chest");
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
  it("prepares chest+sleeve jobs without enabling tracking or provider calls", () => {
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
    expect(hook.preparedJobs).toHaveLength(3);
    expect(hook.reservedSleeveSlots).toHaveLength(0);
    expect(hook.activation.armed).toBe(true);
    expect(hook.activation.allowed).toBe(false);
    expect(hook.activation.waitingFor).toEqual(["explicit_arm_required"]);
  });

  it("stays inert without a clip (activation still evaluated)", () => {
    const hook = prepareHeroFrameTemporalHook();
    expect(hook.preparedJobs).toEqual([]);
    expect(hook.temporalTrackingEnabled).toBe(false);
    expect(hook.activation.allowed).toBe(false);
  });
});

describe("edge adapter authorization", () => {
  it("rejects a well-formed request without explicitArm", () => {
    const fixture = clearedChestTranslatingFixture();
    const request = buildTemporalEdgeRequest({ clip: fixture.clip });
    expect(request.adapterVersion).toBe(TEMPORAL_EDGE_ADAPTER_VERSION);
    expect(request.approved.sleeveLeft?.gate).toBe("CLEARED");
    const auth = authorizeTemporalEdgeRequest(request);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.code).toBe("explicit_arm_required");
    }
  });

  it("authorizes when armed + sleeve CLEARED + explicitArm", () => {
    const fixture = clearedChestTranslatingFixture();
    const request = buildTemporalEdgeRequest({
      clip: fixture.clip,
      explicitArm: true,
    });
    const allowed = authorizeTemporalEdgeRequest(request);
    expect(allowed.ok).toBe(true);
    const denied = authorizeTemporalEdgeRequest(request, false);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("live_activation_not_armed");
    }
  });
});

describe("edge dispatch (authorize + propagateRepair)", () => {
  it("refuses dispatch without explicitArm", () => {
    const fixture = clearedChestTranslatingFixture();
    const result = dispatchTemporalPropagate({
      clip: sourceClipToWire(fixture.clip),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    if (!result.ok) {
      expect(result.body.code).toBe("explicit_arm_required");
    }
  });

  it("propagates CLEARED chest + sleeve quads with no provider calls", () => {
    const fixture = clearedChestTranslatingFixture();
    const result = dispatchTemporalPropagate({
      clip: sourceClipToWire(fixture.clip),
      explicitArm: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.body.paidCalls).toBe(false);
    expect(result.body.grokPerFrame).toBe(false);
    expect(result.body.provider).toBe("none");
    expect(result.body.jobs.map((j) => j.kind)).toEqual(["chest", "sleeve_left", "sleeve_right"]);
    for (const job of result.body.jobs) {
      expect(job.paidCalls).toBe(false);
      expect(job.grokPerFrame).toBe(false);
      expect(job.frames).toHaveLength(5);
      expect(job.frames[0]?.source).toBe("canonical");
    }
    expect(result.body.jobs[0]?.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(result.body.jobs[1]?.sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(result.body.jobs[1]?.repairMethodVersion).toBe(CLEARED_SLEEVE_REPAIR_METHOD_VERSION);
  });

  it("rejects an empty clip before authorize", () => {
    const result = dispatchTemporalPropagate({
      clip: { id: "empty", fps: 24, frames: [] },
      explicitArm: true,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    if (!result.ok) {
      expect(result.body.code).toBe("invalid_request");
    }
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

  it("rasterizes documented sleeve seeds with non-empty coverage", () => {
    const left = paintQuadMask(
      CLEARED_CHEST_FIXTURE_SIZE.width,
      CLEARED_CHEST_FIXTURE_SIZE.height,
      tupleToQuadNorm(CLEARED_SLEEVE_LEFT_QUAD_TUPLE),
    );
    const right = paintQuadMask(
      CLEARED_CHEST_FIXTURE_SIZE.width,
      CLEARED_CHEST_FIXTURE_SIZE.height,
      tupleToQuadNorm(CLEARED_SLEEVE_RIGHT_QUAD_TUPLE),
    );
    expect(maskArea(left)).toBeGreaterThan(5);
    expect(maskArea(right)).toBeGreaterThan(5);
  });
});

describe("edge function vendor + authorize path", () => {
  it("keeps the Deno copy armed and wired to dispatchTemporalPropagate", () => {
    const vendorGate = readFileSync(
      "supabase/functions/temporal-propagate-proxy/lib/livePrep.ts",
      "utf8",
    );
    const vendorLineage = readFileSync(
      "supabase/functions/temporal-propagate-proxy/lib/canonicalLineage.ts",
      "utf8",
    );
    const edgeIndex = readFileSync("supabase/functions/temporal-propagate-proxy/index.ts", "utf8");
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(vendorGate).toMatch(/export const TEMPORAL_LIVE_ACTIVATION_ARMED = true/);
    expect(vendorLineage).toContain("fdb86b18-d4aa-465e-b73f-1d252709739c");
    expect(vendorLineage).toContain("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(edgeIndex).toContain('from "./lib/edgeDispatch.ts"');
    expect(edgeIndex).toContain("dispatchTemporalPropagate");
    expect(edgeIndex).toContain("auth.getUser()");
    expect(edgeIndex).not.toContain("X-Proxy-Secret");
    expect(edgeIndex).not.toContain("COMPOSE_LOOK");
    expect(edgeIndex).not.toContain("FAL_");
    expect(edgeIndex).not.toContain("XAI_API_KEY");
    expect(config).toMatch(/\[functions\.temporal-propagate-proxy\]/);
    expect(config).toMatch(/verify_jwt = true/);
  });
});

describe("cleared approved quad helpers", () => {
  it("points at the CLEARED 1m chest and 1c sleeve assets", () => {
    const chest = clearedChestApprovedQuad();
    expect(chest.sourceAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(chest.keyframeId).toBe(CANONICAL_KEYFRAME_ID);
    expect(chest.repairMethodVersion).toBe(CLEARED_CHEST_REPAIR_METHOD_VERSION);
    expect(clearedSleeveLeftApprovedQuad().sourceAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(clearedSleeveRightApprovedQuad().kind).toBe("sleeve_right");
  });
});
