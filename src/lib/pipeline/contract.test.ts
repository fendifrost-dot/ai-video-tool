import { describe, expect, it } from "vitest";
import {
  STAGE_DEFINITION_LIST,
  STAGE_DEFINITIONS,
  getStageDefinition,
  paidCallSurfaces,
} from "./contract";
import { assertAcyclic, topologicalStages } from "./graph";
import { PIPELINE_STAGE_IDS } from "./types";

describe("pipeline stage contracts", () => {
  it("covers the Product OS stage list in order", () => {
    expect(PIPELINE_STAGE_IDS).toEqual([
      "ingest",
      "generation",
      "keyframe_repair",
      "sleeve_garment_repair",
      "temporal_propagation",
      "original_master_reconstruction",
      "deterministic_branding",
      "automated_evaluation",
      "review_export",
    ]);
  });

  it("is an acyclic graph matching the approximate pipeline model", () => {
    expect(() => assertAcyclic(STAGE_DEFINITION_LIST)).not.toThrow();
    expect(topologicalStages(STAGE_DEFINITION_LIST)).toEqual([...PIPELINE_STAGE_IDS]);
  });

  it("never claims ownership of lane internals", () => {
    for (const def of STAGE_DEFINITION_LIST) {
      expect(def.laneSurfaces.length).toBeGreaterThan(0);
      for (const surface of def.laneSurfaces) {
        expect(surface.ownsInternals).toBe(false);
      }
    }
  });

  it("marks only generation lane surfaces as paid-call", () => {
    const paid = paidCallSurfaces();
    expect(paid.every((p) => p.stageId === "generation")).toBe(true);
    expect(paid.map((p) => p.module).sort()).toEqual(
      [
        "src/lib/providerJobs/api.ts",
        "src/lib/queries/grokImageGarment.ts",
        "src/lib/queries/grokVideoEdit.ts",
      ].sort(),
    );
  });

  it("keeps Architecture C still-repair as a consume-only surface", () => {
    const chest = getStageDefinition("keyframe_repair");
    const sleeve = getStageDefinition("sleeve_garment_repair");
    expect(chest.laneSurfaces.some((s) => s.module.includes("architectureCStillRepair"))).toBe(
      true,
    );
    expect(sleeve.laneSurfaces.some((s) => s.entrypoint.includes("sleeve_panel"))).toBe(true);
    expect(
      STAGE_DEFINITIONS.temporal_propagation.gates.some(
        (g) => g.reviewKey === "stillRepairApproved",
      ),
    ).toBe(true);
  });

  it("stubs original-master reconstruction as Architecture C gate 4", () => {
    const gate = STAGE_DEFINITIONS.original_master_reconstruction.gates.find(
      (g) => g.id === "architecture_c_gate_4",
    );
    expect(gate?.reviewKey).toBe("masterCompositeAuthorized");
    expect(gate?.onFail).toBe("blocked");
  });
});
