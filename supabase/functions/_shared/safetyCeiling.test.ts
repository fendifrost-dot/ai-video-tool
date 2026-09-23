// The reference-image safety ceiling must resolve where capability resolves:
// provider + operation + model.
//
// The ceiling bounds an UNVERIFIED number — it is what stops a bad override, or an unproven
// default, from spending on a request the provider would reject. When it was briefly a single
// global constant, documenting 30 references for Runway's Seedance 2.5 raised the bound for
// every address in the file, including xAI video edits whose own limit has never been verified
// above 5. These tests pin that a documented capability on one model cannot loosen another.

import { describe, expect, it } from "vitest";
import {
  SAFETY_CEILINGS,
  SAFETY_MAX_REFERENCE_IMAGES,
  getProviderCapability,
  safetyCeilingFor,
} from "./providerCapabilities.ts";

const env = (v?: string) => ({
  get: (n: string) => (n === "PROVIDER_CAPABILITIES_JSON" ? v : undefined),
});
const noEnv = env();

describe("safetyCeilingFor", () => {
  it("defaults to the conservative ceiling", () => {
    expect(SAFETY_MAX_REFERENCE_IMAGES).toBe(8);
    expect(safetyCeilingFor("xai:videos/edits")).toBe(8);
    expect(safetyCeilingFor("xai:images/edits", "grok-imagine-image-2.0")).toBe(8);
    expect(safetyCeilingFor("nobody:nothing", "no-model")).toBe(8);
  });

  it("raises the ceiling only for the exact model that documents it", () => {
    expect(safetyCeilingFor("runway:video_to_video", "seedance2_5")).toBe(30);
    // Not the endpoint, and not Runway's other edit models.
    expect(safetyCeilingFor("runway:video_to_video")).toBe(8);
    expect(safetyCeilingFor("runway:video_to_video", "aleph2")).toBe(8);
    expect(safetyCeilingFor("runway:video_to_video", "gemini_omni_flash_1.1")).toBe(8);
  });

  it("keeps every raised ceiling scoped and reviewable", () => {
    // A ceiling entry is a deliberate exception; keep the list small and model-scoped so
    // "why is this 30?" always has one answer.
    expect(Object.keys(SAFETY_CEILINGS)).toEqual(["runway:video_to_video:seedance2_5"]);
    for (const [key, value] of Object.entries(SAFETY_CEILINGS)) {
      expect(value, key).toBeGreaterThan(SAFETY_MAX_REFERENCE_IMAGES);
      // provider:operation:model — a raised ceiling is never endpoint-wide.
      expect(key.split(":").length, key).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("a documented capability on one model cannot raise another's effective ceiling", () => {
  it("lets Seedance use its documented 30", () => {
    expect(
      getProviderCapability("runway:video_to_video", noEnv, "seedance2_5").maxReferenceImages,
    ).toBe(30);
  });

  it("does not let Seedance's 30 leak to xAI video edits, even via an override", () => {
    // The attack this guards: an operator (or a copy-paste) sets 30 on an xAI address.
    // Before the ceiling was model-scoped, that would have been accepted.
    const pushed = env('{"xai:videos/edits":{"maxReferenceImages":30}}');
    expect(getProviderCapability("xai:videos/edits", pushed).maxReferenceImages).toBe(8);

    const pushedModel = env('{"xai:videos/edits:grok-imagine-video":{"maxReferenceImages":30}}');
    expect(
      getProviderCapability("xai:videos/edits", pushedModel, "grok-imagine-video")
        .maxReferenceImages,
    ).toBe(8);
  });

  it("does not let it leak to xAI image edits or to Runway's other edit models", () => {
    expect(
      getProviderCapability(
        "xai:images/edits",
        env('{"xai:images/edits":{"maxReferenceImages":30}}'),
        "grok-imagine-image-2.0",
      ).maxReferenceImages,
    ).toBe(8);
    expect(
      getProviderCapability(
        "runway:video_to_video",
        env('{"runway:video_to_video:aleph2":{"maxReferenceImages":30}}'),
        "aleph2",
      ).maxReferenceImages,
    ).toBe(8);
    // An unknown address is bounded by the default too.
    expect(
      getProviderCapability("nobody:nothing", env('{"nobody:nothing":{"maxReferenceImages":30}}'))
        .maxReferenceImages,
    ).toBe(8);
  });

  it("still clamps an over-large override on the raised address itself", () => {
    expect(
      getProviderCapability(
        "runway:video_to_video",
        env('{"runway:video_to_video:seedance2_5":{"maxReferenceImages":500}}'),
        "seedance2_5",
      ).maxReferenceImages,
    ).toBe(30);
  });
});

describe("current xAI production behaviour is unchanged", () => {
  // The ceiling fix must not move any value the live lanes actually resolve today.
  it("resolves the same xAI limits as before", () => {
    expect(getProviderCapability("xai:images/edits", noEnv).maxReferenceImages).toBe(3);
    expect(
      getProviderCapability("xai:images/edits", noEnv, "grok-imagine-image-quality")
        .maxReferenceImages,
    ).toBe(3);
    expect(
      getProviderCapability("xai:images/edits", noEnv, "grok-imagine-image-2.0").maxReferenceImages,
    ).toBe(5);
    expect(getProviderCapability("xai:videos/edits", noEnv).maxReferenceImages).toBe(8);
    expect(getProviderCapability("xai:videos/edits", noEnv).maxPromptChars).toBe(4096);
    expect(
      getProviderCapability("xai:videos/generations", noEnv, "grok-imagine-video-1.5")
        .maxReferenceImages,
    ).toBe(7);
  });

  it("resolves the same Runway limits as before", () => {
    expect(getProviderCapability("runway:video_to_video", noEnv, "aleph2").maxReferenceImages).toBe(
      0,
    );
    expect(
      getProviderCapability("runway:video_to_video", noEnv, "gemini_omni_flash_1.1")
        .maxReferenceImages,
    ).toBe(5);
    expect(
      getProviderCapability("runway:video_to_video", noEnv, "seedance2_5").maxReferenceImages,
    ).toBe(30);
    expect(getProviderCapability("runway:video_to_video", noEnv).maxReferenceImages).toBe(0);
  });

  it("keeps zero-reference models at zero rather than floored to one", () => {
    // aleph2 takes keyframes, not references; 0 is a real value, not "unknown".
    expect(getProviderCapability("runway:video_to_video", noEnv, "aleph2").maxReferenceImages).toBe(
      0,
    );
  });
});
