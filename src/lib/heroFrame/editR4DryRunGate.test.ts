import { describe, expect, it } from "vitest";
import { GROK_VIDEO_EDIT_PROMPT } from "./grokVideoEditPrompt";
import { EDIT_R4_PRODUCT } from "./editR4ProductIds";
import { assessEditR4DryRun, editR4DryRunPassed } from "./editR4DryRunGate";
import type { GrokVideoEditDryRunPlan } from "@/lib/queries/grokVideoEdit";

function completePlan(overrides: Partial<GrokVideoEditDryRunPlan> = {}): GrokVideoEditDryRunPlan {
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
    prompt: GROK_VIDEO_EDIT_PROMPT,
    referenceCount: 1,
    xaiRequestBody: {
      model: "grok-imagine-video",
      prompt: GROK_VIDEO_EDIT_PROMPT,
      video: { url: "https://storage.example/source.mp4?<signed>" },
      reference_images: [{ url: `https://storage.example/${EDIT_R4_PRODUCT.flatReferencePath}?<signed>` }],
    },
    ...overrides,
  };
}

describe("assessEditR4DryRun", () => {
  it("passes the complete EDIT-R4-PRODUCT-1 envelope", () => {
    const items = assessEditR4DryRun(
      completePlan(),
      EDIT_R4_PRODUCT.videoAssetId,
      EDIT_R4_PRODUCT.wardrobeFeatureId,
    );
    expect(editR4DryRunPassed(items)).toBe(true);
  });

  it("fails closed when the live envelope lacks xaiRequestBody (stale proxy)", () => {
    const { xaiRequestBody: _drop, ...rest } = completePlan();
    const items = assessEditR4DryRun(
      rest,
      EDIT_R4_PRODUCT.videoAssetId,
      EDIT_R4_PRODUCT.wardrobeFeatureId,
    );
    expect(editR4DryRunPassed(items)).toBe(false);
    expect(items.filter((i) => !i.ok).map((i) => i.label)).toEqual(
      expect.arrayContaining([
        "source video signed URL present",
        "video uses { url } schema",
        "reference_images uses [{ url }] schema",
      ]),
    );
  });

  it("fails if an on-model path leaks in", () => {
    const items = assessEditR4DryRun(
      completePlan({ garmentPathsUsed: [EDIT_R4_PRODUCT.onModelReferencePath] }),
      EDIT_R4_PRODUCT.videoAssetId,
      EDIT_R4_PRODUCT.wardrobeFeatureId,
    );
    expect(editR4DryRunPassed(items)).toBe(false);
  });

  it("fails if the prompt was rewritten", () => {
    const items = assessEditR4DryRun(
      completePlan({ prompt: "navy track jacket with white stripes" }),
      EDIT_R4_PRODUCT.videoAssetId,
      EDIT_R4_PRODUCT.wardrobeFeatureId,
    );
    expect(editR4DryRunPassed(items)).toBe(false);
  });
});
