import { describe, expect, it } from "vitest";
import { parseShotSpec, type ShotSpecInput } from "@/lib/treatment/shotSpec";
import type { PipelineClock } from "./types";
import {
  PRODUCTION_ELIGIBLE_STATUSES,
  TREATMENT_BRIDGE_VERSION,
  createPipelineRunFromShotSpec,
  createPipelineRunsFromTreatment,
  isProductionEligible,
  shotReproducibility,
  shotSpecToRunInput,
  shotSpecToSeedArtifacts,
  treatmentToRunInputs,
} from "./treatmentBridge";

function testClock(): PipelineClock {
  let t = Date.parse("2026-09-18T00:00:00.000Z");
  let n = 0;
  return {
    now: () => {
      t += 1000;
      return new Date(t).toISOString();
    },
    createId: () => {
      n += 1;
      return `id-${n}`;
    },
  };
}

const PROJECT_ID = "proj-lane-f";

/** Approved captured performance shot with a real source asset. */
function capturedShot(overrides: Partial<ShotSpecInput> = {}) {
  return parseShotSpec({
    id: "shot-cap",
    purpose: "Rooftop wide performance",
    kind: "performance",
    shotType: "performance",
    status: "approved",
    order: 1,
    timeline: { start: 0, end: 4 },
    source: { kind: "captured", mediaId: "asset-master-1", uri: "s3://clip/master.mov" },
    wardrobe: { name: "Look A", lookId: "look-a" },
    ...overrides,
  } as ShotSpecInput);
}

/** Approved generated shot referencing an existing generation asset. */
function generatedShot(overrides: Partial<ShotSpecInput> = {}) {
  return parseShotSpec({
    id: "shot-gen",
    purpose: "Generated FX insert",
    kind: "generated",
    shotType: "vfx",
    status: "approved",
    order: 2,
    timeline: { start: 4, end: 6 },
    source: { kind: "generated", mediaId: "asset-gen-1" },
    generation: {
      required: true,
      engine: "grok",
      model: "grok-video-1",
      prompt: "kinetic light streaks",
      seed: 42,
      parameters: { fps: 24 },
    },
    reconstruction: {
      required: true,
      mode: "keyframe_propagation",
      maskVersion: "mask-v3",
      referenceAssetHash: "sha256:abc",
      preserve: ["face", "logo"],
    },
    ...overrides,
  } as ShotSpecInput);
}

describe("eligibility", () => {
  it("default eligibility is exactly approved", () => {
    expect([...PRODUCTION_ELIGIBLE_STATUSES]).toEqual(["approved"]);
  });

  it("approved shots are eligible; drafts and rejects are not", () => {
    expect(isProductionEligible(capturedShot())).toBe(true);
    expect(isProductionEligible(capturedShot({ status: "draft" }))).toBe(false);
    expect(isProductionEligible(capturedShot({ status: "rejected" }))).toBe(false);
  });

  it("respects a custom eligible-status set", () => {
    expect(isProductionEligible(capturedShot({ status: "planned" }), ["planned", "approved"])).toBe(
      true,
    );
  });
});

describe("seed artifact translation", () => {
  it("captured source becomes a source_master seed carrying look + provenance", () => {
    const seeds = shotSpecToSeedArtifacts(capturedShot());
    expect(seeds).toHaveLength(1);
    const [s] = seeds;
    expect(s.kind).toBe("source_master");
    expect(s.assetId).toBe("asset-master-1");
    expect(s.path).toBe("s3://clip/master.mov");
    expect(s.lookId).toBe("look-a");
    expect(s.producedByStage).toBe("seed");
    expect(s.lanePayload?.paidCalls).toBe(false);
    expect(s.lanePayload?.shotId).toBe("shot-cap");
  });

  it("generated source becomes an import-only generation_clip seed", () => {
    const seeds = shotSpecToSeedArtifacts(generatedShot());
    expect(seeds).toHaveLength(1);
    expect(seeds[0].kind).toBe("generation_clip");
    expect(seeds[0].assetId).toBe("asset-gen-1");
    expect(seeds[0].producedByStage).toBe("generation");
  });

  it("a shot with no importable asset yields no seeds", () => {
    const spec = capturedShot({ source: { kind: "none" } });
    expect(shotSpecToSeedArtifacts(spec)).toHaveLength(0);
  });
});

describe("reproducibility metadata", () => {
  it("maps generation + reconstruction blocks onto repro fields", () => {
    const repro = shotReproducibility(generatedShot());
    expect(repro).toMatchObject({
      shotSpecVersion: 1,
      shotId: "shot-gen",
      generationRequired: true,
      engine: "grok",
      model: "grok-video-1",
      prompt: "kinetic light streaks",
      seed: 42,
      generationParameters: { fps: 24 },
      reconstructionRequired: true,
      transferMode: "keyframe_propagation",
      maskVersion: "mask-v3",
      referenceAssetHash: "sha256:abc",
      preserve: ["face", "logo"],
    });
  });
});

describe("run input", () => {
  it("never auto-sets RED/YELLOW gates for a non-CLEARED shot", () => {
    const input = shotSpecToRunInput(PROJECT_ID, capturedShot());
    expect(input.projectId).toBe(PROJECT_ID);
    expect(input.reviews?.masterCompositeAuthorized).toBeUndefined();
    expect(input.reviews?.exportApproved).toBeUndefined();
    expect(input.reviews?.stillRepairApproved).toBeUndefined();
  });

  it("merges explicit human review decisions", () => {
    const input = shotSpecToRunInput(PROJECT_ID, capturedShot(), {
      reviews: { exportApproved: true },
      catalogId: "cat-1",
    });
    expect(input.reviews?.exportApproved).toBe(true);
    expect(input.catalogId).toBe("cat-1");
  });
});

describe("treatmentToRunInputs", () => {
  it("filters to eligible shots and orders by order then timeline", () => {
    const result = treatmentToRunInputs(PROJECT_ID, [
      generatedShot(), // order 2
      capturedShot(), // order 1
      capturedShot({ id: "shot-draft", status: "draft" }),
    ]);
    expect(result.version).toBe(TREATMENT_BRIDGE_VERSION);
    expect(result.paidCalls).toBe(false);
    expect(result.bridged.map((b) => b.shotId)).toEqual(["shot-cap", "shot-gen"]);
    expect(result.runInputs).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ shotId: "shot-draft", reason: "not_eligible_status" });
  });

  it("flags awaiting_generation when generation is required but no asset exists", () => {
    const spec = capturedShot({
      id: "shot-needsgen",
      source: { kind: "none" },
      generation: { required: true, engine: "grok" },
    });
    const result = treatmentToRunInputs(PROJECT_ID, [spec]);
    expect(result.bridged).toHaveLength(1);
    expect(result.bridged[0].awaitingGeneration).toBe(true);
    expect(result.warnings[0]).toMatchObject({ shotId: "shot-needsgen", code: "awaiting_generation" });
    // still produces a run input so the job is tracked
    expect(result.runInputs).toHaveLength(1);
  });

  it("skips an eligible shot that has neither source nor generation need", () => {
    const spec = capturedShot({ id: "shot-empty", source: { kind: "none" } });
    const result = treatmentToRunInputs(PROJECT_ID, [spec]);
    expect(result.bridged).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({ shotId: "shot-empty", reason: "missing_source" });
  });
});

describe("Product OS integration (calls createPipelineRun)", () => {
  it("captured shot builds a $0 run whose ingest imports the source_master", () => {
    const run = createPipelineRunFromShotSpec(PROJECT_ID, capturedShot(), {}, testClock());
    expect(run.projectId).toBe(PROJECT_ID);
    expect(run.paidCalls).toBe(false);
    expect(run.stages.ingest.status).toBe("succeeded");
    expect(run.artifacts.some((a) => a.kind === "source_master")).toBe(true);
  });

  it("treatment run set instantiates one run per eligible shot", () => {
    const set = createPipelineRunsFromTreatment(
      PROJECT_ID,
      [capturedShot(), generatedShot(), capturedShot({ id: "d", status: "draft" })],
      {},
      testClock(),
    );
    expect(set.runs).toHaveLength(2);
    expect(set.paidCalls).toBe(false);
    expect(set.skipped).toHaveLength(1);
    for (const run of set.runs) {
      expect(run.paidCalls).toBe(false);
    }
  });
});
