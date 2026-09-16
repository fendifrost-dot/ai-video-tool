/**
 * Hero Frame product gate for Architecture C temporal dispatch.
 *
 * Owns ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled → explicitArm.
 * Does not flip TEMPORAL_LIVE_ACTIVATION_ARMED (Lane C). Does not call Grok.
 * Does not edit chest/sleeve paint.
 */

import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import {
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  prepareHeroFrameTemporalHook,
  type HeroFrameTemporalHookInput,
  type HeroFrameTemporalHookResult,
  type TemporalPropagateWireBody,
} from "@/lib/temporal";

export const HERO_FRAME_TEMPORAL_DISPATCH_VERSION = "1.0.0";

export type HeroFrameTemporalDispatchIntent = {
  contractVersion: typeof HERO_FRAME_TEMPORAL_DISPATCH_VERSION;
  temporalTrackingEnabled: boolean;
  armed: boolean;
  explicitArm: boolean;
  canDispatch: boolean;
  hook: HeroFrameTemporalHookResult;
};

/**
 * Product UI sets explicitArm only when the Hero Frame flag is on and Lane C
 * is armed. Default (flag off or not armed) stays blocked.
 */
export function heroFrameTemporalExplicitArm(input?: {
  temporalTrackingEnabled?: boolean;
  armed?: boolean;
}): boolean {
  const tracking =
    input?.temporalTrackingEnabled ?? ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled;
  const armed = input?.armed ?? TEMPORAL_LIVE_ACTIVATION_ARMED;
  return tracking === true && armed === true;
}

export function prepareHeroFrameTemporalDispatch(
  input: Omit<HeroFrameTemporalHookInput, "explicitArm"> = {},
): HeroFrameTemporalDispatchIntent {
  const temporalTrackingEnabled = ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled;
  const armed = TEMPORAL_LIVE_ACTIVATION_ARMED;
  const explicitArm = heroFrameTemporalExplicitArm({
    temporalTrackingEnabled,
    armed,
  });
  const hook = prepareHeroFrameTemporalHook({
    ...input,
    explicitArm,
  });
  return {
    contractVersion: HERO_FRAME_TEMPORAL_DISPATCH_VERSION,
    temporalTrackingEnabled,
    armed,
    explicitArm,
    canDispatch: temporalTrackingEnabled === true && hook.activation.allowed,
    hook,
  };
}

/**
 * Pure request body for temporal-propagate-proxy.
 * Refuses unless the product flag is on and Lane C is armed; always sets
 * explicitArm: true on the allowed path.
 */
export function buildHeroFrameTemporalPropagateBody(
  input: Omit<TemporalPropagateWireBody, "explicitArm">,
): TemporalPropagateWireBody {
  if (!ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled) {
    throw new Error("temporal_tracking_disabled");
  }
  if (!TEMPORAL_LIVE_ACTIVATION_ARMED) {
    throw new Error("temporal_live_not_armed");
  }
  return {
    ...input,
    explicitArm: true,
  };
}
