import type { ProviderName } from "@/integrations/supabase/types";
import type { IGenerationProvider } from "./types";
import { ManualProvider } from "./manual";
import { RunwayProvider } from "./runway";
import { VeoProvider } from "./veo";
import { GrokProvider } from "./grok";
import { HiggsfieldProvider } from "./higgsfield";
import { PikaProvider } from "./pika";
import { FalProvider } from "./fal";

/**
 * Singleton registry mapping provider id → provider instance.
 * Used by the Prompt Builder UI to enumerate providers and resolve which
 * formatter to apply.
 *
 * Order of insertion is the order shown in the UI.
 */
export const providerRegistry: Record<ProviderName, IGenerationProvider> = (() => {
  const list: IGenerationProvider[] = [
    new RunwayProvider(),
    new VeoProvider(),
    new GrokProvider(),
    new HiggsfieldProvider(),
    new PikaProvider(),
    new FalProvider(),
    new ManualProvider(),
  ];
  const map: Partial<Record<ProviderName, IGenerationProvider>> = {};
  for (const p of list) map[p.id] = p;
  // Providers we don't ship a class for yet — map to Manual for safe fallback.
  // This keeps `providerRegistry[anyProviderName]` defined-everywhere.
  const fallback = map["manual"]!;
  const allProviders: ProviderName[] = [
    "runway", "veo", "gemini", "grok", "higgsfield", "pika", "fal",
    "openai", "firefly", "frame_io", "manual", "other",
  ];
  for (const id of allProviders) {
    if (!map[id]) map[id] = fallback;
  }
  return map as Record<ProviderName, IGenerationProvider>;
})();

/** Concrete providers we actually have UI-ordered formatters for. */
export const PROVIDER_ORDER: ProviderName[] = [
  "runway",
  "veo",
  "grok",
  "higgsfield",
  "pika",
  "fal",
  "manual",
];

/** Look up a provider, defaulting to Manual if unknown. */
export function getProvider(name: ProviderName): IGenerationProvider {
  return providerRegistry[name] ?? providerRegistry["manual"];
}
