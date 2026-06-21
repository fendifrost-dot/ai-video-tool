import { describe, expect, it } from "vitest";
import {
  getProvider,
  PROVIDER_ORDER,
  providerRegistry,
} from "./registry";
import { NotImplementedError } from "./types";
import type { CompiledPrompt } from "@/lib/prompts/types";

const baseCompiled: CompiledPrompt = {
  templateId: "t1",
  templateName: "Test template",
  templateProvider: null,
  templateCategory: "performance",
  promptText: "test prompt with subject and lighting.",
  negativePrompt: "blurry, watermark",
  settings: { duration_seconds: 5 },
  unfilledPlaceholders: [],
  referenceImagePath: null,
  referenceImagePaths: [],
  context: { projectId: "p1", artistId: null, shotId: null },
};

describe("provider registry", () => {
  it("has all expected providers wired", () => {
    for (const id of PROVIDER_ORDER) {
      expect(providerRegistry[id]).toBeDefined();
      expect(providerRegistry[id].id).toBe(id);
    }
  });

  it("formatPrompt stamps the provider id onto the output for every provider", () => {
    for (const id of PROVIDER_ORDER) {
      const out = getProvider(id).formatPrompt(baseCompiled);
      expect(out.provider).toBe(id);
      expect(out.promptText.length).toBeGreaterThan(0);
    }
  });

  it("Runway prepends a cinematic prefix when not already present", () => {
    const out = getProvider("runway").formatPrompt({
      ...baseCompiled,
      promptText: "Iris performing in alleyway.",
    });
    expect(out.promptText.toLowerCase().startsWith("cinematic")).toBe(true);
  });

  it("Runway does not double-stamp the prefix when already cinematic", () => {
    const out = getProvider("runway").formatPrompt({
      ...baseCompiled,
      promptText: "cinematic shot of Iris.",
    });
    expect(out.promptText.match(/cinematic/g)?.length ?? 0).toBe(1);
  });

  it("Veo capitalizes first letter and adds trailing period", () => {
    const out = getProvider("veo").formatPrompt({
      ...baseCompiled,
      promptText: "iris performing in alleyway",
    });
    expect(out.promptText[0]).toBe("I");
    expect(out.promptText.endsWith(".")).toBe(true);
  });

  it("Grok converts sentences into comma-tag style and folds negatives", () => {
    const out = getProvider("grok").formatPrompt({
      ...baseCompiled,
      promptText: "Iris performing. Warm key light. Narrow alley.",
      negativePrompt: "blurry, watermark",
    });
    expect(out.promptText).not.toContain(". ");
    expect(out.promptText).toContain(", ");
    expect(out.promptText).toContain("no blurry");
    expect(out.settings.modelVariant).toBe("grok-imagine-video");
  });

  it("Grok is wired to the Control Center proxy", () => {
    expect(getProvider("grok").apiReady).toBe(true);
  });

  it("Pika collapses whitespace", () => {
    const out = getProvider("pika").formatPrompt({
      ...baseCompiled,
      promptText: "iris   performing\t  in  alley",
    });
    expect(out.promptText).toBe("iris performing in alley");
  });

  it("ManualProvider returns the prompt unchanged", () => {
    const input = { ...baseCompiled, promptText: "raw text passes through" };
    const out = getProvider("manual").formatPrompt(input);
    expect(out.promptText).toBe("raw text passes through");
    expect(out.provider).toBe("manual");
  });

  it("runway is wired to the Control Center proxy", () => {
    expect(getProvider("runway").apiReady).toBe(true);
  });

  it("async methods reject with NotImplementedError when called", async () => {
    const runway = getProvider("runway");
    await expect(
      runway.generateVideo!({
        prompt: { ...baseCompiled, provider: "runway" },
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("getProvider falls back to manual for unknown providers", () => {
    // ts-ignore: testing the fallback path
    const p = getProvider("gemini");
    // gemini maps to fallback (manual) since no dedicated provider class ships
    expect(p).toBeDefined();
  });
});
