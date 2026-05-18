/**
 * Provider capabilities — server-backed feature matrix consumed by the
 * compiler/PromptBuilder. Backed by the `provider_capabilities` table.
 *
 * The hook caches forever in-memory once loaded and refetches on window
 * focus, since the data only changes when someone runs "Research current
 * docs" or applies a migration.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ProviderName } from "@/integrations/supabase/aliases";
import type { FormattedPrompt } from "@/lib/prompts/types";

export type ProviderCapability = {
  provider: string;
  api_status: "live" | "manual_only" | "browser_automation";
  max_duration_seconds: number | null;
  supported_aspect_ratios: string[];
  supports_reference_image: boolean;
  supports_negative_prompt: boolean;
  optimal_prompt_style: string | null;
  strengths: string[];
  weaknesses: string[];
  recommended_shot_types: string[];
  prompt_length_max_words: number | null;
  notes: string | null;
  last_verified_at: string;
};

const QUERY_KEY = ["provider_capabilities"] as const;

export function useProviderCapabilities() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Record<string, ProviderCapability>> => {
      const { data, error } = await supabase
        .from("provider_capabilities")
        .select("*");
      if (error) throw error;
      const map: Record<string, ProviderCapability> = {};
      for (const row of (data ?? []) as ProviderCapability[]) {
        map[row.provider] = row;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Best provider for a given shot type — the first one whose recommended_shot_types includes it. */
export function recommendProviderForShotType(
  shotType: string | null | undefined,
  caps: Record<string, ProviderCapability>,
  preferredOrder: ProviderName[],
): ProviderName | null {
  if (!shotType) return null;
  for (const id of preferredOrder) {
    const cap = caps[id];
    if (cap && cap.recommended_shot_types.includes(shotType)) {
      return id;
    }
  }
  return null;
}

/**
 * Apply a provider's capability matrix to a freshly compiled prompt. Returns
 * a new FormattedPrompt with duration clamped and aspect ratio normalised,
 * plus a list of human-readable warnings the UI can surface above the prompt.
 *
 * `optimal_prompt_style` is intentionally NOT auto-rewritten — that mapping
 * lives in each provider's `formatPrompt()` (Runway prepends "cinematic", Veo
 * adds a trailing period, etc.). The capability table only enforces the
 * objective hard limits (duration, aspect ratio, max words).
 */
export function applyCapability(
  formatted: FormattedPrompt,
  cap: ProviderCapability | undefined,
): { formatted: FormattedPrompt; warnings: string[] } {
  if (!cap) return { formatted, warnings: [] };
  const warnings: string[] = [];
  const settings = { ...formatted.settings };

  // 1. Hard-clamp duration
  const requestedDuration = Number(
    (settings.duration as unknown) ??
      (settings.duration_seconds as unknown) ??
      NaN,
  );
  if (
    !Number.isNaN(requestedDuration) &&
    cap.max_duration_seconds !== null &&
    requestedDuration > cap.max_duration_seconds
  ) {
    warnings.push(
      `Duration ${requestedDuration}s exceeds ${cap.provider}'s max of ${cap.max_duration_seconds}s — clamped.`,
    );
    if ("duration_seconds" in settings) settings.duration_seconds = cap.max_duration_seconds;
    if ("duration" in settings) settings.duration = cap.max_duration_seconds;
  }

  // 2. Aspect ratio — warn if requested ratio is not in supported list
  const aspect = (settings.aspectRatio as string | undefined) ?? (settings.aspect_ratio as string | undefined);
  if (aspect && cap.supported_aspect_ratios.length > 0 && !cap.supported_aspect_ratios.includes(aspect)) {
    warnings.push(
      `Aspect ratio ${aspect} not supported by ${cap.provider}. Supported: ${cap.supported_aspect_ratios.join(", ")}.`,
    );
  }

  // 3. Negative prompt — drop if unsupported
  let negativePrompt = formatted.negativePrompt;
  if (negativePrompt && !cap.supports_negative_prompt) {
    warnings.push(
      `${cap.provider} doesn't accept negative prompts — the negative block will not be sent.`,
    );
    negativePrompt = "";
  }

  // 4. Reference image — warn if attached but unsupported
  if (formatted.referenceImagePath && !cap.supports_reference_image) {
    warnings.push(
      `${cap.provider} doesn't support image-to-video — the reference image will be ignored.`,
    );
  }

  // 5. Soft prompt length cap — warning only, don't truncate (provider's
  //    formatPrompt already does its own trimming if needed).
  if (cap.prompt_length_max_words) {
    const wordCount = formatted.promptText.split(/\s+/).filter(Boolean).length;
    if (wordCount > cap.prompt_length_max_words) {
      warnings.push(
        `Prompt is ${wordCount} words; ${cap.provider} prefers ≤${cap.prompt_length_max_words}. Consider trimming.`,
      );
    }
  }

  return {
    formatted: { ...formatted, settings, negativePrompt },
    warnings,
  };
}
