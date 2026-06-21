import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import type { ProviderCapability } from "./types";
import { BaseProvider } from "./base";

/** Default xAI video model — see docs/grok_api_status.md */
export const GROK_DEFAULT_MODEL = "grok-imagine-video";

/** xAI reference-to-video accepts up to three reference images. */
export const GROK_MAX_REFERENCE_IMAGES = 3;

/**
 * Grok Imagine (xAI) — video generation via Control Center proxy.
 *
 * Grok responds better to comma-separated tag-style prompts than full sentences.
 * Negative constraints are folded in as "no …" tags rather than a separate field.
 *
 * Generation routes through `video-providers-grok-generate` on Control Center
 * (see src/lib/providerJobs/api.ts). Canvas import for identity/VTON remains
 * a separate manual path on LooksListPage.
 */
export class GrokProvider extends BaseProvider {
  readonly id = "grok" as const;
  readonly displayName = "Grok Imagine";
  readonly capabilities: ProviderCapability[] = [
    "text_to_video",
    "image_to_video",
    "extend",
  ];
  readonly apiReady = true;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    const tagged = toCommaTags(compiled.promptText);
    const avoid = negativeToAvoidTags(compiled.negativePrompt);
    const promptText = avoid ? `${tagged}, ${avoid}` : tagged;

    const durationRaw =
      compiled.settings.duration ?? compiled.settings.duration_seconds ?? 5;

    return {
      ...compiled,
      promptText,
      settings: {
        ...compiled.settings,
        modelVariant: compiled.settings.modelVariant ?? GROK_DEFAULT_MODEL,
        duration: typeof durationRaw === "number" ? durationRaw : 5,
        aspectRatio: compiled.settings.aspectRatio ?? "16:9",
        resolution: compiled.settings.resolution ?? "720p",
      },
      provider: this.id,
    };
  }
}

/** Replace sentence breaks with commas and collapse duplicate separators. */
export function toCommaTags(text: string): string {
  return text
    .replace(/\.\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",")
    .trim()
    .replace(/[,.;]+$/, "");
}

/** Fold negative-prompt fragments into Grok-friendly "no …" tags (capped). */
export function negativeToAvoidTags(negative: string | null | undefined): string {
  if (!negative?.trim()) return "";
  const fragments: string[] = [];
  for (const piece of negative.split(/[,;]+/)) {
    const t = piece.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower.startsWith("no ")) {
      fragments.push(t);
    } else {
      fragments.push(`no ${t}`);
    }
  }
  return fragments.slice(0, 8).join(", ");
}
