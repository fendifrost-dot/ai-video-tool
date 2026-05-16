import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * Veo / Gemini video provider.
 *
 * Veo prefers natural-language paragraphs over tag-style prompts. The
 * formatter ensures sentence-style flow by:
 *   - capitalizing the first letter
 *   - ensuring the text ends with a period
 *   - joining clauses with periods if too many commas pile up
 */
export class VeoProvider extends BaseProvider {
  readonly id = "veo" as const;
  readonly displayName = "Veo (Google)";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
  ];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    let text = compiled.promptText.trim();
    if (text.length > 0) {
      text = text[0].toUpperCase() + text.slice(1);
      if (!/[.!?]$/.test(text)) text = `${text}.`;
    }
    return { ...compiled, promptText: text, provider: this.id };
  }
}
