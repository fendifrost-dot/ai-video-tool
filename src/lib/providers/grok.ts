import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * Grok Imagine (xAI).
 *
 * Grok responds better to comma-separated tag-style prompts than to
 * full sentences. The formatter normalises by replacing sentence-ending
 * periods with commas, then collapsing duplicate separators.
 *
 * Note: xAI's image/video generation API is not broadly available as of
 * mid-2026. This provider is effectively manual-only via the Grok app UI.
 */
export class GrokProvider extends BaseProvider {
  readonly id = "grok" as const;
  readonly displayName = "Grok Imagine";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
    "manual_only",
  ];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    const tagged = compiled.promptText
      .replace(/\.\s+/g, ", ")
      .replace(/,\s*,/g, ",")
      .replace(/\s+,/g, ",")
      .trim()
      .replace(/[,.;]+$/, "");
    return { ...compiled, promptText: tagged, provider: this.id };
  }
}
