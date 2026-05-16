import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * Fal.ai (fal-serverless) — hosts many models. We pass through compiled
 * text without provider-specific shaping since the actual normalisation
 * depends on which fal model is selected.
 */
export class FalProvider extends BaseProvider {
  readonly id = "fal" as const;
  readonly displayName = "Fal";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
    "upscale",
    "remove_bg",
  ];
  readonly apiReady = false;
}
