/**
 * Hero Frame §7 Temporal Run control — gating + copy + fixture body.
 *
 * Consumes prepareHeroFrameTemporalDispatch / buildHeroFrameTemporalPropagateBody.
 * Does not flip TEMPORAL_LIVE_ACTIVATION_ARMED, the still-repair edge mirror,
 * or chest/sleeve paint.
 */

import {
  buildHeroFrameTemporalPropagateBody,
  prepareHeroFrameTemporalDispatch,
  type HeroFrameTemporalDispatchIntent,
} from "@/lib/heroFrame/temporalDispatch";
import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CANONICAL_LINEAGE,
  DEFAULT_SLEEVE_STILL_GATE,
  clearedChestAndSleeveQuadSet,
  clearedChestTranslatingFixture,
  sourceClipToWire,
  type TemporalPropagateWireBody,
} from "@/lib/temporal";

export const HERO_FRAME_TEMPORAL_RUN_VERSION = "1.0.0";

export type HeroFrameTemporalRunGateInput = {
  canDispatch: boolean;
  armed: boolean;
  temporalTrackingEnabled: boolean;
};

/**
 * Button enablement. All three must be true.
 * `canDispatch` already implies tracking + activation.allowed; the extra
 * flags are checked so the UI cannot enable from a stale copy of one field.
 */
export function heroFrameTemporalRunEnabled(input: HeroFrameTemporalRunGateInput): boolean {
  return (
    input.canDispatch === true && input.armed === true && input.temporalTrackingEnabled === true
  );
}

export function heroFrameTemporalRunEnabledFromDispatch(
  dispatch: Pick<
    HeroFrameTemporalDispatchIntent,
    "canDispatch" | "armed" | "temporalTrackingEnabled"
  >,
): boolean {
  return heroFrameTemporalRunEnabled({
    canDispatch: dispatch.canDispatch,
    armed: dispatch.armed,
    temporalTrackingEnabled: dispatch.temporalTrackingEnabled,
  });
}

/**
 * Product-gate copy for §7. Never writes temporalTrackingEnabled=false when
 * the product flag is true (still-repair edge hard-stop is a different flag).
 */
export function formatHeroFrameTemporalGateCopy(input: {
  temporalTrackingEnabled: boolean;
  armed: boolean;
  explicitArm: boolean;
  canDispatch: boolean;
}): string {
  const tracking = `temporalTrackingEnabled=${input.temporalTrackingEnabled}`;
  const armed = `armed=${input.armed}`;
  const explicitArm = `explicitArm=${input.explicitArm}`;
  const canDispatch = `canDispatch=${input.canDispatch}`;
  const flags = `${tracking}, ${armed}, ${explicitArm}, ${canDispatch}`;

  if (input.temporalTrackingEnabled) {
    if (heroFrameTemporalRunEnabled(input)) {
      return `Temporal product gate is on (${flags}). Run temporal propagate dispatches temporal-propagate-proxy with explicitArm. Chest/sleeve paint stays locked.`;
    }
    return `Temporal tracking is on (${flags}). Run stays disabled until armed and canDispatch are both true.`;
  }

  return `HARD STOP — do not enable temporal tracking (${flags}). Still-repair paint is locked.`;
}

const STALE_TRACKING_FALSE = /temporalTrackingEnabled\s*=\s*false/i;
const STALE_PROPAGATION_DISABLED = /temporal propagation is disabled/i;

/**
 * Drop still-repair hard-stop strings that claim tracking is off when the
 * Hero Frame product flag is on. Still-repair edge mirror stays false.
 */
export function sanitizeHeroFrameHardStopCopy(
  hardStop: string | null | undefined,
  temporalTrackingEnabled: boolean,
): string | null {
  if (!hardStop) return null;
  if (!temporalTrackingEnabled) return hardStop;
  if (STALE_TRACKING_FALSE.test(hardStop) || STALE_PROPAGATION_DISABLED.test(hardStop)) {
    return null;
  }
  return hardStop;
}

export function formatTemporalPropagateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/missing_bearer|unauthenticated|http_401|\b401\b/i.test(raw)) {
    return `401 — sign in required (${raw})`;
  }
  return raw;
}

export function summarizeTemporalPropagateResult(json: Record<string, unknown>): string {
  const jobs = Array.isArray(json.jobs) ? json.jobs.length : 0;
  if (json.ok === true) {
    return `Dispatched ${jobs} job(s). paidCalls=${String(json.paidCalls ?? false)} grokPerFrame=${String(json.grokPerFrame ?? false)}.`;
  }
  const err = typeof json.error === "string" ? json.error : "dispatch_not_ok";
  return `Dispatch returned ok=false (${err})`;
}

export type HeroFrameTemporalRunRequest = {
  dispatch: HeroFrameTemporalDispatchIntent;
  body: TemporalPropagateWireBody;
  lineage: {
    projectId: string;
    stillAssetId: string;
    keyframeId: string;
    clearedChestAssetId: string;
    clearedSleeveAssetId: string;
  };
};

/**
 * Canonical $0 fixture body for the §7 Run click.
 * Live footage ingest is out of scope — luma fixture + CLEARED quads only.
 */
export function buildHeroFrameTemporalRunRequest(): HeroFrameTemporalRunRequest {
  const fixture = clearedChestTranslatingFixture();
  const approved = clearedChestAndSleeveQuadSet();
  const dispatch = prepareHeroFrameTemporalDispatch({
    projectId: CANONICAL_PROJECT_ID,
    stillAssetId: CANONICAL_STILL_ASSET_ID,
    keyframeId: CANONICAL_KEYFRAME_ID,
    clip: fixture.clip,
    approved,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
  });
  const body = buildHeroFrameTemporalPropagateBody({
    clip: sourceClipToWire(fixture.clip),
    approved,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
  });
  return {
    dispatch,
    body,
    lineage: {
      projectId: CANONICAL_PROJECT_ID,
      stillAssetId: CANONICAL_STILL_ASSET_ID,
      keyframeId: CANONICAL_KEYFRAME_ID,
      clearedChestAssetId: CANONICAL_LINEAGE.clearedChestAssetId,
      clearedSleeveAssetId: CANONICAL_LINEAGE.clearedSleeveAssetId,
    },
  };
}
