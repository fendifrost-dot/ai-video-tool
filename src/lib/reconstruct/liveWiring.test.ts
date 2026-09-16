import { describe, expect, it } from "vitest";
import {
  CANONICAL_LINEAGE,
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_SLEEVE_ASSET_ID,
} from "./canonicalLineage";
import {
  RECONSTRUCT_LIVE_DEPLOY_NOTES,
  RECONSTRUCT_LIVE_WIRING_ARMED,
  RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE,
  TEMPORAL_ARMED_AFTER_PR_88,
  armedWiringForCanonicalLineage,
  defaultWiringForCanonicalLineage,
  evaluateReconstructLiveWiring,
} from "./liveWiring";

describe("Lane D canonical lineage (copied, not imported from paint / temporal authorize)", () => {
  it("binds Architecture C gate 4 IDs", () => {
    expect(CANONICAL_PROJECT_ID).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(CANONICAL_MASTER_CLIP_ID).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
    expect(CLEARED_CHEST_ASSET_ID).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(CLEARED_SLEEVE_ASSET_ID).toBe("fdb86b18-d4aa-465e-b73f-1d252709739c");
    expect(CANONICAL_LINEAGE.chestGate).toBe("CLEARED");
    expect(CANONICAL_LINEAGE.sleeveGate).toBe("CLEARED");
    expect(CANONICAL_LINEAGE.chestGateScore).toBe("11/11");
    expect(CANONICAL_LINEAGE.sleeveGateScore).toBe("6/6");
  });
});

describe("evaluateReconstructLiveWiring", () => {
  it("defaults (CLEARED + temporal armed, no explicitArm) wait on explicit_arm_required", () => {
    const d = defaultWiringForCanonicalLineage();
    expect(RECONSTRUCT_LIVE_WIRING_ARMED).toBe(true);
    expect(TEMPORAL_ARMED_AFTER_PR_88).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.waitingFor).toEqual(["explicit_arm_required"]);
    expect(d.chestGate).toBe("CLEARED");
    expect(d.sleeveGate).toBe("CLEARED");
    expect(d.temporalArmed).toBe(true);
  });

  it("allows dispatch when explicitArm is true", () => {
    const d = armedWiringForCanonicalLineage();
    expect(d.allowed).toBe(true);
    expect(d.waitingFor).toEqual([]);
  });

  it("blocks when chest is not CLEARED", () => {
    const d = evaluateReconstructLiveWiring({
      chestGate: "PENDING",
      sleeveGate: "CLEARED",
      temporalArmed: true,
      explicitArm: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.waitingFor).toContain("chest_still_not_cleared");
  });

  it("blocks when sleeve is not CLEARED", () => {
    const d = evaluateReconstructLiveWiring({
      chestGate: "CLEARED",
      sleeveGate: "PENDING",
      temporalArmed: true,
      explicitArm: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.waitingFor).toContain("sleeve_still_not_cleared");
  });

  it("blocks when temporal is not armed (copied flag, not imported)", () => {
    const d = evaluateReconstructLiveWiring({
      chestGate: "CLEARED",
      sleeveGate: "CLEARED",
      temporalArmed: false,
      explicitArm: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.waitingFor).toContain("temporal_not_armed");
  });

  it("blocks when compile-time wiring is disarmed", () => {
    const d = evaluateReconstructLiveWiring({
      explicitArm: true,
      armed: false,
    });
    expect(d.allowed).toBe(false);
    expect(d.waitingFor).toContain("live_wiring_not_armed");
  });
});

describe("deploy notes — no edge function", () => {
  it("does not require a Lovable edge redeploy from this lane", () => {
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.edgeFunction).toBeNull();
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.function).toBeNull();
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.sam3LiveFetch).toBe(false);
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.noControlCenter).toBe(true);
    expect(RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE).toContain("src/lib/garment/logoComposite.ts");
    expect(RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE).toContain(
      "src/lib/temporal/livePrep.ts (TEMPORAL_LIVE_ACTIVATION_ARMED)",
    );
    expect(RECONSTRUCT_SHARED_SURFACES_LEFT_ALONE).toContain("src/lib/sleevePanel/**");
  });
});
