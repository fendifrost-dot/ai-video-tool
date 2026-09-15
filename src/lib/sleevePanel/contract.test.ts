import { describe, expect, it } from "vitest";
import {
  SLEEVE_PANEL_CLAIM,
  SLEEVE_PANEL_CONTRACT_VERSION,
  assertSleevePanelContract,
  buildChestOutputSlot,
  buildCrossedArmsSleeveFixture,
  defaultVisibilityManifest,
  parseChestOutputSlot,
  sleevePanelClaimsNeverValidateHidden,
} from "./index";

describe("sleeve-panel mask/geometry contract", () => {
  it("pins contract version and visible-only claim", () => {
    expect(SLEEVE_PANEL_CONTRACT_VERSION).toBe("1.0.0");
    expect(SLEEVE_PANEL_CLAIM).toBe("visible_geometry_only");
    const vis = defaultVisibilityManifest();
    expect(vis.pose).toBe("crossed_arms");
    expect(vis.validated).toEqual(["visible_upper_arm"]);
    expect(vis.unvalidated).toContain("hidden_shoulder_to_cuff");
    expect(vis.unvalidated).toContain("forearm_occluded");
    expect(vis.unvalidated).toContain("cuff_unseen");
  });

  it("never exposes a path that validates hidden shoulder→cuff", () => {
    expect(sleevePanelClaimsNeverValidateHidden()).toEqual({
      hiddenShoulderToCuffValidated: false,
    });
  });

  it("accepts a well-formed fixture input", () => {
    const fx = buildCrossedArmsSleeveFixture();
    expect(() =>
      assertSleevePanelContract({
        contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
        still: fx.still,
        flatRef: fx.flatRef,
        visibleMask: fx.visibleMask,
        hiddenMask: fx.hiddenMask,
        panels: fx.panels,
        visibility: fx.visibility,
      }),
    ).not.toThrow();
  });

  it("rejects missing panels (no detection guess)", () => {
    const fx = buildCrossedArmsSleeveFixture();
    expect(() =>
      assertSleevePanelContract({
        contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
        still: fx.still,
        flatRef: fx.flatRef,
        visibleMask: fx.visibleMask,
        hiddenMask: fx.hiddenMask,
        panels: [],
        visibility: fx.visibility,
      }),
    ).toThrow(/sleeve_panels_required/);
  });

  it("rejects a claim that would validate hidden geometry", () => {
    const fx = buildCrossedArmsSleeveFixture();
    const visibility = defaultVisibilityManifest();
    visibility.unvalidated = visibility.unvalidated.filter((r) => r !== "hidden_shoulder_to_cuff");
    expect(() =>
      assertSleevePanelContract({
        contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
        still: fx.still,
        flatRef: fx.flatRef,
        visibleMask: fx.visibleMask,
        hiddenMask: fx.hiddenMask,
        panels: fx.panels,
        visibility,
      }),
    ).toThrow(/hidden_shoulder_to_cuff_unvalidated/);
  });

  it("parses a chest-output consumption slot without importing Architecture C", () => {
    const slot = buildChestOutputSlot();
    const parsed = parseChestOutputSlot(slot);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("chest_output_ref");
    expect(parsed?.stage).toBe("logo_chest");
    expect(parsed?.repairMethodVersion).toBe("architecture_c_still_repair_opaque_ref");
    expect(parsed?.reservedMask?.width).toBe(fxWidth(slot));
  });

  it("rejects chest slots that are not logo_chest or wrong kind", () => {
    expect(parseChestOutputSlot({ kind: "sleeve_panel", contractVersion: "1.0.0", stage: "sleeve_panel" })).toBeNull();
    expect(parseChestOutputSlot({ kind: "chest_output_ref", contractVersion: "0.0.0", stage: "logo_chest" })).toBeNull();
    expect(parseChestOutputSlot(null)).toBeNull();
  });
});

function fxWidth(slot: ReturnType<typeof buildChestOutputSlot>): number {
  return slot.reservedMask?.width ?? 0;
}
