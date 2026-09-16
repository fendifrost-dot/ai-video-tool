import { describe, expect, it } from "vitest";
import { ARCHITECTURE_C_V2_REPAIR } from "./architectureCStillRepair";
import { prepareHeroFrameTemporalDispatch } from "./temporalDispatch";
import {
  HERO_FRAME_TEMPORAL_RUN_VERSION,
  buildHeroFrameTemporalRunRequest,
  formatHeroFrameTemporalGateCopy,
  formatTemporalPropagateError,
  heroFrameTemporalRunEnabled,
  heroFrameTemporalRunEnabledFromDispatch,
  sanitizeHeroFrameHardStopCopy,
  summarizeTemporalPropagateResult,
} from "./temporalRunControl";
import { TEMPORAL_LIVE_ACTIVATION_ARMED } from "@/lib/temporal";

const STILL_REPAIR_HARD_STOP =
  "Still-first gate only. Temporal propagation is disabled until this still passes human review.";

describe("heroFrameTemporalRunEnabled", () => {
  it("enables only when canDispatch, armed, and tracking are all true", () => {
    expect(
      heroFrameTemporalRunEnabled({
        canDispatch: true,
        armed: true,
        temporalTrackingEnabled: true,
      }),
    ).toBe(true);
  });

  it("disables when canDispatch is false", () => {
    expect(
      heroFrameTemporalRunEnabled({
        canDispatch: false,
        armed: true,
        temporalTrackingEnabled: true,
      }),
    ).toBe(false);
  });

  it("disables when armed is false", () => {
    expect(
      heroFrameTemporalRunEnabled({
        canDispatch: true,
        armed: false,
        temporalTrackingEnabled: true,
      }),
    ).toBe(false);
  });

  it("disables when temporalTrackingEnabled is false", () => {
    expect(
      heroFrameTemporalRunEnabled({
        canDispatch: true,
        armed: true,
        temporalTrackingEnabled: false,
      }),
    ).toBe(false);
  });

  it("matches the live product dispatch (armed + tracking + canDispatch)", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(true);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);
    const dispatch = prepareHeroFrameTemporalDispatch();
    expect(heroFrameTemporalRunEnabledFromDispatch(dispatch)).toBe(true);
    expect(HERO_FRAME_TEMPORAL_RUN_VERSION).toBe("1.0.0");
  });
});

describe("formatHeroFrameTemporalGateCopy", () => {
  it("never writes temporalTrackingEnabled=false when tracking is true", () => {
    const on = formatHeroFrameTemporalGateCopy({
      temporalTrackingEnabled: true,
      armed: true,
      explicitArm: true,
      canDispatch: true,
    });
    expect(on).toMatch(/temporalTrackingEnabled=true/);
    expect(on).not.toMatch(/temporalTrackingEnabled=false/);
    expect(on).toMatch(/Run temporal propagate/);

    const blocked = formatHeroFrameTemporalGateCopy({
      temporalTrackingEnabled: true,
      armed: false,
      explicitArm: false,
      canDispatch: false,
    });
    expect(blocked).toMatch(/temporalTrackingEnabled=true/);
    expect(blocked).not.toMatch(/temporalTrackingEnabled=false/);
    expect(blocked).not.toMatch(/HARD STOP/);
  });

  it("may say HARD STOP only when tracking is actually false", () => {
    const off = formatHeroFrameTemporalGateCopy({
      temporalTrackingEnabled: false,
      armed: false,
      explicitArm: false,
      canDispatch: false,
    });
    expect(off).toMatch(/HARD STOP/);
    expect(off).toMatch(/temporalTrackingEnabled=false/);
  });
});

describe("sanitizeHeroFrameHardStopCopy", () => {
  it("drops still-repair copy that claims tracking/propagation is off when the product flag is on", () => {
    expect(sanitizeHeroFrameHardStopCopy(STILL_REPAIR_HARD_STOP, true)).toBeNull();
    expect(
      sanitizeHeroFrameHardStopCopy("HARD STOP temporalTrackingEnabled=false until review", true),
    ).toBeNull();
  });

  it("keeps unrelated still-repair notes and keeps stale copy when tracking is off", () => {
    expect(sanitizeHeroFrameHardStopCopy("Still-first paint locked.", true)).toBe(
      "Still-first paint locked.",
    );
    expect(sanitizeHeroFrameHardStopCopy(STILL_REPAIR_HARD_STOP, false)).toBe(
      STILL_REPAIR_HARD_STOP,
    );
    expect(sanitizeHeroFrameHardStopCopy(null, true)).toBeNull();
  });
});

describe("formatTemporalPropagateError", () => {
  it("surfaces 401 / missing bearer / unauthenticated as sign-in required", () => {
    expect(formatTemporalPropagateError(new Error("http_401"))).toMatch(/^401 — sign in required/);
    expect(formatTemporalPropagateError(new Error("missing_bearer"))).toMatch(/401/);
    expect(formatTemporalPropagateError(new Error("unauthenticated"))).toMatch(/401/);
    expect(formatTemporalPropagateError(new Error("not_authorized"))).toBe("not_authorized");
  });
});

describe("buildHeroFrameTemporalRunRequest", () => {
  it("stamps explicitArm and canonical lineage on the fixture body", () => {
    const req = buildHeroFrameTemporalRunRequest();
    expect(req.dispatch.canDispatch).toBe(true);
    expect(heroFrameTemporalRunEnabledFromDispatch(req.dispatch)).toBe(true);
    expect(req.body.explicitArm).toBe(true);
    expect(req.body.clip?.frames?.length).toBeGreaterThan(0);
    expect(req.lineage.projectId).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(req.lineage.stillAssetId).toBe("2aa1a44c-b24a-46bf-890f-13a6fc65b1cc");
    expect(req.lineage.clearedChestAssetId).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(req.lineage.clearedSleeveAssetId).toBe("fdb86b18-d4aa-465e-b73f-1d252709739c");
    expect(req.body.approved?.chest.sourceAssetId).toBe(req.lineage.clearedChestAssetId);
    expect(req.body.approved?.sleeveLeft?.sourceAssetId).toBe(req.lineage.clearedSleeveAssetId);
  });
});

describe("summarizeTemporalPropagateResult", () => {
  it("summarizes ok dispatch and non-ok payload", () => {
    expect(
      summarizeTemporalPropagateResult({
        ok: true,
        jobs: [{}, {}, {}],
        paidCalls: false,
        grokPerFrame: false,
      }),
    ).toBe("Dispatched 3 job(s). paidCalls=false grokPerFrame=false.");
    expect(summarizeTemporalPropagateResult({ ok: false, error: "not_authorized" })).toBe(
      "Dispatch returned ok=false (not_authorized)",
    );
  });
});
