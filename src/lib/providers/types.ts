import type { ProviderName } from "@/integrations/supabase/aliases";
import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";

/**
 * A capability flag advertised by a provider. The Prompt Builder UI uses
 * these to decide which Copy / Generate buttons to show.
 */
export type ProviderCapability =
  | "text_to_video"
  | "image_to_video"
  | "lipsync"
  | "greenscreen"
  | "vfx"
  | "extend"
  | "upscale"
  | "remove_bg"
  | "variation"
  | "manual_only";

/**
 * Inputs each async method takes. All accept a `FormattedPrompt` so the
 * provider sees the final post-formatPrompt prompt — never the raw template.
 */
export type GenerateInput = {
  prompt: FormattedPrompt;
  referenceImageUrl?: string;
  referenceVideoUrl?: string;
  seed?: number;
  modelVariant?: string;
};

export type ProviderJob = {
  externalJobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  resultUrl?: string;
  error?: string;
};

/**
 * Provider interface. Every async method is optional — providers advertise
 * what they actually support via `capabilities`. The one method every
 * provider MUST implement is `formatPrompt`, which is sync and pure.
 *
 * MVP behaviour: every provider's `formatPrompt` is fully implemented (this
 * is what powers the Prompt Builder's "Copy Prompt" buttons), but async
 * methods throw `NotImplementedError`. When real APIs are wired later, the
 * stub bodies fill in HTTP calls without touching the UI.
 */
export interface IGenerationProvider {
  readonly id: ProviderName;
  readonly displayName: string;
  readonly capabilities: ProviderCapability[];
  /** Whether this provider has a real API today (false = manual-only / stub). */
  readonly apiReady: boolean;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt;

  generateImage?(input: GenerateInput): Promise<ProviderJob>;
  generateVideo?(input: GenerateInput): Promise<ProviderJob>;
  generateLipSync?(input: GenerateInput): Promise<ProviderJob>;
  extendVideo?(input: GenerateInput): Promise<ProviderJob>;
  upscaleVideo?(input: GenerateInput): Promise<ProviderJob>;
  removeBackground?(input: GenerateInput): Promise<ProviderJob>;
  createVariation?(input: GenerateInput): Promise<ProviderJob>;
  getJobStatus?(externalJobId: string): Promise<ProviderJob>;
  downloadResult?(externalJobId: string): Promise<{ blob: Blob; metadata: Record<string, unknown> }>;
}

export class NotImplementedError extends Error {
  constructor(provider: ProviderName, method: string) {
    super(
      `${provider}.${method}() is not implemented. AI Video Tool is in manual-workflow mode — use the Copy Prompt button and run this in the provider's UI.`,
    );
    this.name = "NotImplementedError";
  }
}
