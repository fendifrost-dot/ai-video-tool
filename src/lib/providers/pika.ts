import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

const PIKA_PROMPT_MAX_CHARS = 800;

/**
 * Pika provider.
 *
 * Pika favours short, dense prompts. The formatter:
 *   - collapses runs of whitespace
 *   - truncates politely at the nearest sentence boundary if over the soft cap
 */
export class PikaProvider extends BaseProvider {
  readonly id = "pika" as const;
  readonly displayName = "Pika";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
  ];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    let text = compiled.promptText.replace(/\s+/g, " ").trim();
    if (text.length > PIKA_PROMPT_MAX_CHARS) {
      const slice = text.slice(0, PIKA_PROMPT_MAX_CHARS);
      const lastStop = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","));
      text = lastStop > PIKA_PROMPT_MAX_CHARS * 0.6 ? slice.slice(0, lastStop + 1) : slice;
    }
    return { ...compiled, promptText: text, provider: this.id };
  }
}
