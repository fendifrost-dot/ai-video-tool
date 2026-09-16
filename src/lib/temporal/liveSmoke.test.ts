import { describe, expect, it } from "vitest";
import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { buildHeroFrameTemporalPropagateBody } from "@/lib/heroFrame/temporalDispatch";
import { TEMPORAL_LIVE_ACTIVATION_ARMED, dispatchTemporalPropagate } from "@/lib/temporal";
import {
  TEMPORAL_LIVE_SMOKE_CLIP_ID,
  TEMPORAL_LIVE_SMOKE_LINEAGE,
  buildTemporalLiveSmokeBody,
  summarizeTemporalLiveSmokeBody,
} from "./liveSmoke";

describe("temporal $0 live-smoke body", () => {
  it("stamps explicitArm plus CLEARED chest 9ed83c01 and sleeve fdb86b18 lineage", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(true);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);

    const body = buildTemporalLiveSmokeBody();
    expect(body.explicitArm).toBe(true);
    expect(body.clip?.id).toBe(TEMPORAL_LIVE_SMOKE_CLIP_ID);
    expect(body.clip?.frames).toHaveLength(5);
    expect(body.approved?.chest.sourceAssetId).toBe(TEMPORAL_LIVE_SMOKE_LINEAGE.chestAssetId);
    expect(body.approved?.chest.repairMethodVersion).toBe("architecture_c_still_repair_1m");
    expect(body.approved?.chest.gate).toBe("CLEARED");
    expect(body.approved?.sleeveLeft?.sourceAssetId).toBe(
      TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId,
    );
    expect(body.approved?.sleeveRight?.sourceAssetId).toBe(
      TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId,
    );
    expect(body.approved?.sleeveLeft?.repairMethodVersion).toBe("architecture_c_sleeve_still_1c");
    expect(body.sleeveGate?.status).toBe("CLEARED");
    expect(body.sleeveGate?.assetId).toBe(TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId);
    expect(TEMPORAL_LIVE_SMOKE_LINEAGE.chestAssetId).toContain("9ed83c01");
    expect(TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId).toContain("fdb86b18");
  });

  it("matches the Hero Frame product stamp (explicitArm true on the fixture clip)", () => {
    const smoke = buildTemporalLiveSmokeBody();
    const product = buildHeroFrameTemporalPropagateBody({ clip: smoke.clip! });
    expect(product.explicitArm).toBe(true);
    expect(product.clip?.id).toBe(smoke.clip?.id);
    expect(product.clip?.frames?.length).toBe(smoke.clip?.frames?.length);
  });

  it("dispatches in-lib with no provider calls (not a live JWT POST)", () => {
    const result = dispatchTemporalPropagate(buildTemporalLiveSmokeBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.body.paidCalls).toBe(false);
    expect(result.body.grokPerFrame).toBe(false);
    expect(result.body.provider).toBe("none");
    expect(result.body.jobs.map((job) => job.kind)).toEqual([
      "chest",
      "sleeve_left",
      "sleeve_right",
    ]);
    expect(result.body.jobs[0]?.sourceAssetId).toBe(TEMPORAL_LIVE_SMOKE_LINEAGE.chestAssetId);
    expect(result.body.jobs[1]?.sourceAssetId).toBe(TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId);
    expect(result.body.jobs[2]?.sourceAssetId).toBe(TEMPORAL_LIVE_SMOKE_LINEAGE.sleeveAssetId);
  });

  it("summarizes lineage without dumping luma", () => {
    const summary = summarizeTemporalLiveSmokeBody();
    expect(summary.explicitArm).toBe(true);
    expect(summary.clip.frameCount).toBe(5);
    expect(summary.clip.width).toBe(80);
    expect(summary.clip.height).toBe(128);
    expect(summary.clip.lumaLengthPerFrame).toBe(80 * 128);
    expect(summary.lineage.projectId).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(summary.reconstruct).toBe("separate_in_lib_not_this_post");
  });
});
