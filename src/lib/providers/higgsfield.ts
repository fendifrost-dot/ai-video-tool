import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * Higgsfield video provider.
 *
 * Higgsfield is camera-language driven — named moves like dolly-in,
 * crane-up, orbit, etc. The formatter pulls any "Camera move: …" line up
 * to the front of the prompt so the camera instruction lands first.
 */
export class HiggsfieldProvider extends BaseProvider {
  readonly id = "higgsfield" as const;
  readonly displayName = "Higgsfield";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
    "manual_only",
  ];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    const text = compiled.promptText.trim();
    const cameraLineMatch = text.match(/^(Camera move:[^.]+\.)\s*/i);
    if (cameraLineMatch) {
      // Already leading with camera — leave as-is.
      return { ...compiled, promptText: text, provider: this.id };
    }
    const insideMatch = text.match(/(Camera move:[^.]+\.)\s*/i);
    if (insideMatch) {
      const lifted = `${insideMatch[1]} ${text.replace(insideMatch[1], "").trim()}`;
      return { ...compiled, promptText: lifted, provider: this.id };
    }
    return { ...compiled, promptText: text, provider: this.id };
  }
}
