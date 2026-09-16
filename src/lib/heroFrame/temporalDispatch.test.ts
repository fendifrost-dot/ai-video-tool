import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARCHITECTURE_C_V2_REPAIR } from "./architectureCStillRepair";
import {
  HERO_FRAME_TEMPORAL_DISPATCH_VERSION,
  buildHeroFrameTemporalPropagateBody,
  heroFrameTemporalExplicitArm,
  prepareHeroFrameTemporalDispatch,
} from "./temporalDispatch";
import {
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  clearedChestTranslatingFixture,
  sourceClipToWire,
} from "@/lib/temporal";

describe("Hero Frame temporalTrackingEnabled", () => {
  it("is true when TEMPORAL_LIVE_ACTIVATION_ARMED is true", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(true);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);
  });

  it("leaves the still-repair edge mirror false so that proxy does not 500", () => {
    const edge = readFileSync("supabase/functions/_shared/architectureCStillRepair.ts", "utf8");
    const proxy = readFileSync(
      "supabase/functions/architecture-c-still-repair-proxy/index.ts",
      "utf8",
    );
    expect(edge).toMatch(/temporalTrackingEnabled:\s*false/);
    expect(proxy).toContain("tracking_flag_misconfigured");
    expect(proxy).toMatch(/temporalTrackingEnabled:\s*false/);
  });
});

describe("heroFrameTemporalExplicitArm", () => {
  it("is true only when the product flag and Lane C arm are both on", () => {
    expect(heroFrameTemporalExplicitArm()).toBe(true);
    expect(
      heroFrameTemporalExplicitArm({
        temporalTrackingEnabled: false,
        armed: true,
      }),
    ).toBe(false);
    expect(
      heroFrameTemporalExplicitArm({
        temporalTrackingEnabled: true,
        armed: false,
      }),
    ).toBe(false);
  });
});

describe("prepareHeroFrameTemporalDispatch", () => {
  it("prepares the hook with explicitArm so activation is allowed", () => {
    const fixture = clearedChestTranslatingFixture();
    const dispatch = prepareHeroFrameTemporalDispatch({ clip: fixture.clip });
    expect(dispatch.contractVersion).toBe(HERO_FRAME_TEMPORAL_DISPATCH_VERSION);
    expect(dispatch.temporalTrackingEnabled).toBe(true);
    expect(dispatch.armed).toBe(true);
    expect(dispatch.explicitArm).toBe(true);
    expect(dispatch.canDispatch).toBe(true);
    expect(dispatch.hook.activation.allowed).toBe(true);
    expect(dispatch.hook.activation.waitingFor).toEqual([]);
    expect(dispatch.hook.preparedJobs).toHaveLength(3);
    expect(dispatch.hook.providerCalls).toEqual([]);
    expect(dispatch.hook.grokPerFrame).toBe(false);
    // Temporal module hook still does not own the product flag.
    expect(dispatch.hook.temporalTrackingEnabled).toBe(false);
  });

  it("stays allowed without a clip (jobs empty; explicitArm still set)", () => {
    const dispatch = prepareHeroFrameTemporalDispatch();
    expect(dispatch.explicitArm).toBe(true);
    expect(dispatch.canDispatch).toBe(true);
    expect(dispatch.hook.preparedJobs).toEqual([]);
    expect(dispatch.hook.activation.allowed).toBe(true);
  });
});

describe("buildHeroFrameTemporalPropagateBody", () => {
  it("stamps explicitArm true when the product flag is armed", () => {
    const fixture = clearedChestTranslatingFixture();
    const body = buildHeroFrameTemporalPropagateBody({
      clip: sourceClipToWire(fixture.clip),
    });
    expect(body.explicitArm).toBe(true);
    expect(body.clip?.frames?.length).toBeGreaterThan(0);
  });
});
