import { describe, expect, it } from "vitest";
import {
  STAGE_DEFINITION_LIST,
  STAGE_DEFINITIONS,
  getStageDefinition,
  paidCallSurfaces,
} from "./contract";
import { assertAcyclic, topologicalStages } from "./graph";
import { LANE_G_DEPLOY_NEEDS, LANE_G_WORK_ORDER } from "./ownership";
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

  it("prefers work-order #77 (lineage #51) and does not own Architecture C internals", () => {
    expect(LANE_G_WORK_ORDER.issue).toBe(77);
    expect(LANE_G_WORK_ORDER.preferredIssue).toBe(77);
    expect(LANE_G_WORK_ORDER.lineageIssue).toBe(51);
    expect(LANE_G_WORK_ORDER.parentIssue).toBe(50);
    expect(LANE_G_WORK_ORDER.chestEdgeFunction).toBe("architecture-c-still-repair-proxy");
    expect(LANE_G_WORK_ORDER.chestReferenceAssetId).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(LANE_G_WORK_ORDER.chestRepairMethodVersion).toBe("architecture_c_still_repair_1m");
    expect(LANE_G_WORK_ORDER.chestGate).toBe("CLEARED");
    expect(LANE_G_WORK_ORDER.controlPlane.provider).toBe("lovable");
    expect(LANE_G_WORK_ORDER.controlPlane.noStandaloneSupabase).toBe(true);
    expect(LANE_G_WORK_ORDER.doesNotOwn.some((s) => s.includes("Architecture C"))).toBe(true);
  });

  it("reports no Lovable Publish or edge redeploy for this scaffolding", () => {
    expect(LANE_G_DEPLOY_NEEDS.frontendPublish).toBe(false);
    expect([...LANE_G_DEPLOY_NEEDS.edgeRedeploy]).toEqual([]);
    expect(LANE_G_DEPLOY_NEEDS.lovableSql).toBe(false);
  });

  it("keeps Architecture C still-repair as a consume-only surface with CLEARED chest identity", () => {
    const chest = getStageDefinition("keyframe_repair");
    const sleeve = getStageDefinition("sleeve_garment_repair");
    expect(
      chest.laneSurfaces.some((s) => s.module.includes("architecture-c-still-repair-proxy")),
    ).toBe(true);
    expect(chest.laneSurfaces.some((s) => s.module.includes("architectureCStillRepair"))).toBe(
      true,
    );
    expect(chest.laneSurfaces.some((s) => s.notes.includes("9ed83c01"))).toBe(true);
    expect(chest.laneSurfaces.some((s) => s.notes.includes("logo_chest"))).toBe(true);
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
