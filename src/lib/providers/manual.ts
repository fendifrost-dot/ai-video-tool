import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * The "manual" provider: always works, never calls an external API.
 * Use this when the user wants raw compiled output to paste into any tool.
 */
export class ManualProvider extends BaseProvider {
  readonly id = "manual" as const;
  readonly displayName = "Manual (raw)";
  readonly capabilities: ProviderCapability[] = ["manual_only"];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    return { ...compiled, provider: this.id };
  }
}
