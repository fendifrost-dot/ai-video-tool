import type { ProviderName } from "@/integrations/supabase/aliases";
import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import {
  NotImplementedError,
  type GenerateInput,
  type IGenerationProvider,
  type ProviderCapability,
  type ProviderJob,
} from "./types";

/**
 * Convenience base class: every async method throws `NotImplementedError`
 * unless subclasses override. `formatPrompt` defaults to a pass-through,
 * stamping the provider id onto the result.
 *
 * Subclasses should advertise `capabilities` so the UI can decide what
 * Generate buttons to render once `apiReady` becomes true.
 */
export abstract class BaseProvider implements IGenerationProvider {
  abstract readonly id: ProviderName;
  abstract readonly displayName: string;
  abstract readonly capabilities: ProviderCapability[];
  readonly apiReady: boolean = false;

  formatPrompt(compiled: CompiledPrompt): FormattedPrompt {
    return { ...compiled, provider: this.id };
  }

  generateImage(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "generateImage"));
  }
  generateVideo(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "generateVideo"));
  }
  generateLipSync(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "generateLipSync"));
  }
  extendVideo(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "extendVideo"));
  }
  upscaleVideo(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "upscaleVideo"));
  }
  removeBackground(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "removeBackground"));
  }
  createVariation(_input: GenerateInput): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "createVariation"));
  }
  getJobStatus(_externalJobId: string): Promise<ProviderJob> {
    return Promise.reject(new NotImplementedError(this.id, "getJobStatus"));
  }
  downloadResult(_externalJobId: string): Promise<{ blob: Blob; metadata: Record<string, unknown> }> {
    return Promise.reject(new NotImplementedError(this.id, "downloadResult"));
  }
}
