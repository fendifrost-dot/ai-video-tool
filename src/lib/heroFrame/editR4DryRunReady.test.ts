import { describe, expect, it } from "vitest";
import { EDIT_R4_PRODUCT, isEditR4CanonicalOwner } from "./editR4ProductIds";
import { isEditR4DryRunReady } from "./editR4DryRunReady";
import type { GrokVideoEditDryRunPlan } from "@/lib/queries/grokVideoEdit";

function plan(overrides: Partial<GrokVideoEditDryRunPlan> = {}): GrokVideoEditDryRunPlan {
  return {
    dryRun: true,
    billed: false,
    model: "grok-imagine-video",
    endpoint: "https://api.x.ai/v1/videos/edits",
    videoAssetId: EDIT_R4_PRODUCT.videoAssetId,
    wardrobeFeatureId: EDIT_R4_PRODUCT.wardrobeFeatureId,
    garmentPathsUsed: [EDIT_R4_PRODUCT.flatReferencePath],
    estimatedCostUsd: 0.225,
    maxCostUsd: 0.5,
    promptVersion: "v2",
    ...overrides,
  };
}

describe("isEditR4CanonicalOwner", () => {
  it("accepts only the durable owner UID", () => {
    expect(isEditR4CanonicalOwner(EDIT_R4_PRODUCT.ownerId)).toBe(true);
    expect(isEditR4CanonicalOwner("832fa0bc-1f7e-4586-ab8b-2ac323698ede")).toBe(false);
    expect(isEditR4CanonicalOwner(null)).toBe(false);
  });
});

describe("isEditR4DryRunReady", () => {
  it("passes a successful edits dry-run with one flat ref", () => {
    expect(isEditR4DryRunReady(plan())).toBe(true);
  });

  it("fails before a dry-run exists or if billed", () => {
    expect(isEditR4DryRunReady(null)).toBe(false);
    expect(isEditR4DryRunReady(plan({ billed: false, dryRun: true }))).toBe(true);
    expect(isEditR4DryRunReady({ ...plan(), billed: true } as GrokVideoEditDryRunPlan)).toBe(false);
  });

  it("fails on on-model leak or generations endpoint", () => {
    expect(isEditR4DryRunReady(plan({ garmentPathsUsed: [EDIT_R4_PRODUCT.onModelReferencePath] }))).toBe(
      false,
    );
    expect(isEditR4DryRunReady(plan({ endpoint: "https://api.x.ai/v1/videos/generations" }))).toBe(
      false,
    );
  });
});
