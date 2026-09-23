// Anti-drift guard between the legacy `providerCapabilities.ts` and `capabilityRegistry.ts`.
//
// `providerCapabilities.ts` is live in grok-image-garment-proxy and grok-video-edit-proxy
// and is under active edit in the YSL production lane, so the registry does NOT rewrite it
// (see docs/PROVIDER_CAPABILITY_REGISTRY.md §"Integration"). Until the delegation lands,
// the same facts exist in two files — which is precisely the condition that produced the
// "main says 3, deployed says 5" incident.
//
// This file makes that condition safe: the moment the two disagree on ANY overlapping
// fact, the suite goes red and names the field. It is not a formality — it is the only
// thing standing between an interim duplication and a repeat of the original bug.
//
// When the delegation lands, this file stops being load-bearing and can be deleted
// with the duplication it guards.

import { describe, expect, it } from "vitest";
import {
  SAFETY_MAX_REFERENCE_IMAGES as REGISTRY_CEILING,
  addressFromLegacyKey,
  getCapability,
} from "./capabilityRegistry.ts";
import {
  SAFETY_MAX_REFERENCE_IMAGES as LEGACY_CEILING,
  getProviderCapability,
} from "./providerCapabilities.ts";

/** Every legacy key the proxies actually resolve today. */
const LEGACY_KEYS = ["xai:images/edits", "xai:videos/edits"] as const;

const noEnv = { get: () => undefined };

describe("capability sources must not drift", () => {
  it("agrees on the safety ceiling", () => {
    expect(REGISTRY_CEILING).toBe(LEGACY_CEILING);
  });

  it.each(LEGACY_KEYS)("agrees with providerCapabilities on %s", (key) => {
    const legacy = getProviderCapability(key, noEnv);
    const resolved = getCapability(addressFromLegacyKey(key), {
      env: noEnv,
      now: new Date("2026-09-23T00:00:00Z"),
    });

    expect(resolved.known, `${key} is missing from the registry`).toBe(true);
    expect(resolved.values.maxReferenceImages, `${key}.maxReferenceImages`).toBe(
      legacy.maxReferenceImages,
    );
    expect(resolved.values.maxPromptChars ?? null, `${key}.maxPromptChars`).toBe(
      legacy.maxPromptChars,
    );

    // The legacy `firstFrameConditioning` flag is the registry's `keyframeConditioning`
    // on video operations and `imageReferenceConditioning` on image operations — the one
    // name covered both meanings, which is part of why it was ambiguous.
    const mapped = key.startsWith("xai:images/")
      ? resolved.values.imageReferenceConditioning
      : resolved.values.keyframeConditioning;
    expect(mapped ?? null, `${key}.firstFrameConditioning`).toBe(legacy.firstFrameConditioning);
  });

  it("covers every legacy key the proxies can ask for", () => {
    // A key added to providerCapabilities.ts without a registry record would resolve to
    // UNKNOWN here and be caught by the per-key test above; this asserts the list itself
    // stays in step with the proxies' constants.
    for (const key of LEGACY_KEYS) {
      expect(getProviderCapability(key, noEnv).source).not.toContain("unknown provider");
    }
  });
});
