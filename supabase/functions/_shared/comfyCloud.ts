// Comfy Cloud is a paid route. This build does not call it.
// COMFY_CLOUD_ENABLED in the environment cannot turn the route on.

export const COMFY_CLOUD_ENABLED = false;

export type ComfyCloudDecision = {
  enabled: false;
  paidCallsImplemented: false;
  costUsd: 0;
  refused: true;
  reason: string;
};

/** An env flag is ignored. There is no HTTP client in this module. */
export function comfyCloudDecision(env: Record<string, string | undefined> = {}): ComfyCloudDecision {
  const asked = env.COMFY_CLOUD_ENABLED === "1" || env.COMFY_CLOUD_ENABLED === "true";
  return {
    enabled: false,
    paidCallsImplemented: false,
    costUsd: 0,
    refused: true,
    reason: asked
      ? "COMFY_CLOUD_ENABLED is ignored. This build has no Comfy Cloud client and will not spend."
      : "Comfy Cloud is disabled. Local GPU jobs stay on the owner's machine and cost $0.",
  };
}

export function refuseComfyCloud(env?: Record<string, string | undefined>): never {
  throw new Error(comfyCloudDecision(env).reason);
}
