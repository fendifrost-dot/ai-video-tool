import { describe, expect, it } from "vitest";
import { GROK_VIDEO_EDIT_PROMPT, GROK_VIDEO_EDIT_PROMPT_V1 } from "./grokVideoEditPrompt";
import { EDIT_R4_PRODUCT, isEditR4CanonicalOwner } from "./editR4ProductIds";
import { assessEditR4DryRun, isEditR4DryRunReady } from "./editR4DryRunGate";
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
    promptVersion: "v2",
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

const owner = EDIT_R4_PRODUCT.ownerId;
const video = EDIT_R4_PRODUCT.videoAssetId;
const garment = EDIT_R4_PRODUCT.wardrobeFeatureId;

function failedLabels(plan: GrokVideoEditDryRunPlan | null | undefined, v = video, g = garment, uid: string | null = owner) {
  return assessEditR4DryRun(plan, v, g, uid).filter((i) => !i.ok).map((i) => i.label);
}

describe("isEditR4CanonicalOwner", () => {
  it("accepts only the durable owner UID", () => {
    expect(isEditR4CanonicalOwner(owner)).toBe(true);
    expect(isEditR4CanonicalOwner("832fa0bc-1f7e-4586-ab8b-2ac323698ede")).toBe(false);
    expect(isEditR4CanonicalOwner(null)).toBe(false);
  });
});

describe("assessEditR4DryRun — fail-closed live envelope", () => {
  it("passes the complete EDIT-R4 V2 envelope", () => {
    expect(isEditR4DryRunReady(completePlan(), video, garment, owner)).toBe(true);
  });

  it("fails closed when the live envelope is missing", () => {
    const { xaiRequestBody: _drop, ...rest } = completePlan();
    expect(isEditR4DryRunReady(rest, video, garment, owner)).toBe(false);
    expect(failedLabels(rest)).toEqual(
      expect.arrayContaining([
        "source video signed URL present",
        "video uses { url } schema",
        "reference_images uses [{ url }] schema",
      ]),
    );
  });

  it("fails on the wrong video ID", () => {
    expect(isEditR4DryRunReady(completePlan(), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", garment, owner)).toBe(
      false,
    );
    expect(
      failedLabels(completePlan({ videoAssetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" })),
    ).toContain("source video is the canonical Fendi clip");
  });

  it("fails on the wrong garment ID", () => {
    expect(isEditR4DryRunReady(completePlan(), video, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", owner)).toBe(
      false,
    );
  });

  it("fails on the wrong flat-reference path", () => {
    const plan = completePlan({ garmentPathsUsed: ["artist/some-other-flat.jpg"], referenceCount: 1 });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toContain("reference is the flat YSL product image");
  });

  it("fails on an on-model leak", () => {
    const plan = completePlan({
      garmentPathsUsed: [EDIT_R4_PRODUCT.onModelReferencePath],
      referenceCount: 1,
    });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toEqual(
      expect.arrayContaining(["no on-model reference", "reference is the flat YSL product image"]),
    );
  });

  it("fails on a bare/string reference schema", () => {
    const plan = completePlan({
      xaiRequestBody: {
        model: "grok-imagine-video",
        prompt: GROK_VIDEO_EDIT_PROMPT,
        video: { url: "https://storage.example/source.mp4?<signed>" },
        reference_images: ["https://storage.example/flat.jpg?<signed>"],
      },
    });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toContain("reference_images uses [{ url }] schema");
  });

  it("fails when the signed video URL is missing", () => {
    const plan = completePlan({
      xaiRequestBody: {
        model: "grok-imagine-video",
        prompt: GROK_VIDEO_EDIT_PROMPT,
        video: { url: "" },
        reference_images: [{ url: `https://storage.example/${EDIT_R4_PRODUCT.flatReferencePath}?<signed>` }],
      },
    });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toContain("source video signed URL present");
  });

  it("fails on a prompt mismatch (V1 or rewritten)", () => {
    expect(isEditR4DryRunReady(completePlan({ prompt: GROK_VIDEO_EDIT_PROMPT_V1 }), video, garment, owner)).toBe(
      false,
    );
    expect(
      failedLabels(completePlan({ prompt: "navy track jacket with white stripes" })),
    ).toContain("active prompt is Frozen Prompt V2 exactly");
  });

  it("fails when promptVersion is not v2", () => {
    expect(isEditR4DryRunReady(completePlan({ promptVersion: "v1" }), video, garment, owner)).toBe(false);
    expect(failedLabels(completePlan({ promptVersion: "v1" }))).toContain("promptVersion === v2");
  });

  it("fails on the generations endpoint", () => {
    const plan = completePlan({ endpoint: "https://api.x.ai/v1/videos/generations" });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toEqual(
      expect.arrayContaining(["endpoint = /v1/videos/edits", "not the generations endpoint"]),
    );
  });

  it("fails if the dry-run was billed", () => {
    const plan = completePlan({ billed: true });
    expect(isEditR4DryRunReady(plan, video, garment, owner)).toBe(false);
    expect(failedLabels(plan)).toContain("dry-run billed === false");
  });
});
