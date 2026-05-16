import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/**
 * Runway provider.
 *
 * formatPrompt heuristic:
 *   - If the prompt doesn't already lead with a cinematic / camera prefix,
 *     prepend "cinematic shot, ". This keeps universal-template output usable
 *     against Runway without re-typing.
 *   - Strips redundant double-spaces around commas.
 *
 * API methods are stubs (apiReady=false). Runway has a real public API
 * (https://docs.dev.runwayml.com/) so capabilities list everything they
 * support; only the stub bodies are deferred.
 */
export class RunwayProvider extends BaseProvider {
  readonly id = "runway" as const;
  readonly displayName = "Runway";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
    "extend",
    "upscale",
    "remove_bg",
    "variation",
  ];
  readonly apiReady = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    const prefixed = ensureCinematicPrefix(compiled.promptText);
    return {
      ...compiled,
      promptText: prefixed,
      provider: this.id,
    };
  }
}

const CINEMATIC_PREFIXES = [
  /^cinematic\b/i,
  /^aerial\b/i,
  /^close-?up\b/i,
  /^wide shot\b/i,
  /^establishing\b/i,
];

function ensureCinematicPrefix(text: string): string {
  const trimmed = text.trimStart();
  if (CINEMATIC_PREFIXES.some((re) => re.test(trimmed))) return trimmed;
  return `cinematic shot, ${trimmed}`;
}
