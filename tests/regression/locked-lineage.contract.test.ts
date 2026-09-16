/**
 * Lane R cross-copy contract. Read-only identity imports — no paint algorithms.
 *
 * If this file turns red because two copied ID tables diverged, assign the
 * lane that changed its copy. Do not "fix" by editing chest/sleeve paint.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAGE1M_LIVE_VERIFIED } from "@/lib/eval/stage1mEvidence";
import { SLEEVE_STILL_1C_LIVE_VERIFIED } from "@/lib/eval/sleeveStill1cEvidence";
import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { runReconstructE2e } from "@/lib/reconstruct/e2e";
import {
  CANONICAL_KEYFRAME_ID as RECONSTRUCT_KEYFRAME_ID,
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID as RECONSTRUCT_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID as RECONSTRUCT_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID as RECONSTRUCT_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE as RECONSTRUCT_CHEST_GATE,
  CLEARED_CHEST_GATE_SCORE as RECONSTRUCT_CHEST_GATE_SCORE,
  CLEARED_CHEST_QUAD_TUPLE as RECONSTRUCT_CHEST_QUAD,
  CLEARED_CHEST_REPAIR_METHOD_VERSION as RECONSTRUCT_CHEST_VERSION,
  CLEARED_SLEEVE_ASSET_ID as RECONSTRUCT_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE as RECONSTRUCT_SLEEVE_GATE,
  CLEARED_SLEEVE_GATE_SCORE as RECONSTRUCT_SLEEVE_GATE_SCORE,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE as RECONSTRUCT_SLEEVE_LEFT,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION as RECONSTRUCT_SLEEVE_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE as RECONSTRUCT_SLEEVE_RIGHT,
} from "@/lib/reconstruct/canonicalLineage";
import {
  RECONSTRUCT_LIVE_DEPLOY_NOTES,
  RECONSTRUCT_LIVE_WIRING_ARMED,
} from "@/lib/reconstruct/liveWiring";
import {
  SEEDED_VISIBLE_SLEEVE_QUADS,
  SLEEVE_STILL_REPAIR_METHOD_VERSION,
} from "@/lib/sleevePanel/liveStill";
import {
  CANONICAL_KEYFRAME_ID as TEMPORAL_KEYFRAME_ID,
  CANONICAL_PROJECT_ID as TEMPORAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID as TEMPORAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID as TEMPORAL_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE as TEMPORAL_CHEST_GATE,
  CLEARED_CHEST_GATE_SCORE as TEMPORAL_CHEST_GATE_SCORE,
  CLEARED_CHEST_QUAD_TUPLE as TEMPORAL_CHEST_QUAD,
  CLEARED_CHEST_REPAIR_METHOD_VERSION as TEMPORAL_CHEST_VERSION,
  CLEARED_SLEEVE_ASSET_ID as TEMPORAL_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE as TEMPORAL_SLEEVE_GATE,
  CLEARED_SLEEVE_GATE_SCORE as TEMPORAL_SLEEVE_GATE_SCORE,
  CLEARED_SLEEVE_LEFT_QUAD_TUPLE as TEMPORAL_SLEEVE_LEFT,
  CLEARED_SLEEVE_REPAIR_METHOD_VERSION as TEMPORAL_SLEEVE_VERSION,
  CLEARED_SLEEVE_RIGHT_QUAD_TUPLE as TEMPORAL_SLEEVE_RIGHT,
} from "@/lib/temporal/canonicalLineage";
import { clearedChestTranslatingFixture } from "@/lib/temporal/clearedChestFixture";
import { dispatchTemporalPropagate, sourceClipToWire } from "@/lib/temporal/edgeDispatch";
import {
  TEMPORAL_LIVE_ACTIVATION_ARMED,
  TEMPORAL_LIVE_DEPLOY_NOTES,
} from "@/lib/temporal/livePrep";
import {
  LOCKED_CHEST_ASSET_ID,
  LOCKED_CHEST_GATE,
  LOCKED_CHEST_GATE_SCORE,
  LOCKED_CHEST_QUAD_TUPLE,
  LOCKED_CHEST_REPAIR_METHOD_VERSION,
  LOCKED_GROK_PER_FRAME,
  LOCKED_KEYFRAME_ID,
  LOCKED_MASTER_CLIP_ID,
  LOCKED_PAID_CALLS,
  LOCKED_PRODUCT_TEMPORAL_TRACKING,
  LOCKED_PROJECT_ID,
  LOCKED_RECONSTRUCT_ARMED,
  LOCKED_SLEEVE_ASSET_ID,
  LOCKED_SLEEVE_CLAIM,
  LOCKED_SLEEVE_GATE,
  LOCKED_SLEEVE_GATE_SCORE,
  LOCKED_SLEEVE_LEFT_QUAD_TUPLE,
  LOCKED_SLEEVE_REPAIR_METHOD_VERSION,
  LOCKED_SLEEVE_RIGHT_QUAD_TUPLE,
  LOCKED_STILL_ASSET_ID,
  LOCKED_STILL_REPAIR_EDGE_TRACKING,
  LOCKED_TEMPORAL_ARMED,
} from "./locked-lineage";

describe("Lane R locked lineage freeze", () => {
  it("keeps temporal copied IDs on the CLEARED 1m/1c freeze", () => {
    expect(TEMPORAL_PROJECT_ID).toBe(LOCKED_PROJECT_ID);
    expect(TEMPORAL_STILL_ASSET_ID).toBe(LOCKED_STILL_ASSET_ID);
    expect(TEMPORAL_KEYFRAME_ID).toBe(LOCKED_KEYFRAME_ID);
    expect(TEMPORAL_CHEST_ASSET_ID).toBe(LOCKED_CHEST_ASSET_ID);
    expect(TEMPORAL_CHEST_VERSION).toBe(LOCKED_CHEST_REPAIR_METHOD_VERSION);
    expect(TEMPORAL_CHEST_GATE).toBe(LOCKED_CHEST_GATE);
    expect(TEMPORAL_CHEST_GATE_SCORE).toBe(LOCKED_CHEST_GATE_SCORE);
    expect(TEMPORAL_CHEST_QUAD).toEqual(LOCKED_CHEST_QUAD_TUPLE);
    expect(TEMPORAL_SLEEVE_ASSET_ID).toBe(LOCKED_SLEEVE_ASSET_ID);
    expect(TEMPORAL_SLEEVE_VERSION).toBe(LOCKED_SLEEVE_REPAIR_METHOD_VERSION);
    expect(TEMPORAL_SLEEVE_GATE).toBe(LOCKED_SLEEVE_GATE);
    expect(TEMPORAL_SLEEVE_GATE_SCORE).toBe(LOCKED_SLEEVE_GATE_SCORE);
    expect(TEMPORAL_SLEEVE_LEFT).toEqual(LOCKED_SLEEVE_LEFT_QUAD_TUPLE);
    expect(TEMPORAL_SLEEVE_RIGHT).toEqual(LOCKED_SLEEVE_RIGHT_QUAD_TUPLE);
  });

  it("keeps reconstruct copied IDs aligned with the same freeze (incl. master clip)", () => {
    expect(RECONSTRUCT_PROJECT_ID).toBe(LOCKED_PROJECT_ID);
    expect(CANONICAL_MASTER_CLIP_ID).toBe(LOCKED_MASTER_CLIP_ID);
    expect(RECONSTRUCT_STILL_ASSET_ID).toBe(LOCKED_STILL_ASSET_ID);
    expect(RECONSTRUCT_KEYFRAME_ID).toBe(LOCKED_KEYFRAME_ID);
    expect(RECONSTRUCT_CHEST_ASSET_ID).toBe(LOCKED_CHEST_ASSET_ID);
    expect(RECONSTRUCT_CHEST_VERSION).toBe(LOCKED_CHEST_REPAIR_METHOD_VERSION);
    expect(RECONSTRUCT_CHEST_GATE).toBe(LOCKED_CHEST_GATE);
    expect(RECONSTRUCT_CHEST_GATE_SCORE).toBe(LOCKED_CHEST_GATE_SCORE);
    expect(RECONSTRUCT_CHEST_QUAD).toEqual(LOCKED_CHEST_QUAD_TUPLE);
    expect(RECONSTRUCT_SLEEVE_ASSET_ID).toBe(LOCKED_SLEEVE_ASSET_ID);
    expect(RECONSTRUCT_SLEEVE_VERSION).toBe(LOCKED_SLEEVE_REPAIR_METHOD_VERSION);
    expect(RECONSTRUCT_SLEEVE_GATE).toBe(LOCKED_SLEEVE_GATE);
    expect(RECONSTRUCT_SLEEVE_GATE_SCORE).toBe(LOCKED_SLEEVE_GATE_SCORE);
    expect(RECONSTRUCT_SLEEVE_LEFT).toEqual(LOCKED_SLEEVE_LEFT_QUAD_TUPLE);
    expect(RECONSTRUCT_SLEEVE_RIGHT).toEqual(LOCKED_SLEEVE_RIGHT_QUAD_TUPLE);
  });

  it("keeps Lane B live-still seeds and 1c method version on the freeze", () => {
    expect(SLEEVE_STILL_REPAIR_METHOD_VERSION).toBe(LOCKED_SLEEVE_REPAIR_METHOD_VERSION);
    expect(SEEDED_VISIBLE_SLEEVE_QUADS.left).toEqual(LOCKED_SLEEVE_LEFT_QUAD_TUPLE);
    expect(SEEDED_VISIBLE_SLEEVE_QUADS.right).toEqual(LOCKED_SLEEVE_RIGHT_QUAD_TUPLE);
  });

  it("keeps Hero Frame recommended IDs on the freeze", () => {
    expect(ARCHITECTURE_C_V2_REPAIR.projectId).toBe(LOCKED_PROJECT_ID);
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId).toBe(LOCKED_STILL_ASSET_ID);
    expect(ARCHITECTURE_C_V2_REPAIR.recommendedChestOutputAssetId).toBe(LOCKED_CHEST_ASSET_ID);
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(LOCKED_PRODUCT_TEMPORAL_TRACKING);
  });

  it("keeps live evidence records CLEARED (Lane E freeze, not a new score)", () => {
    expect(STAGE1M_LIVE_VERIFIED.assetId).toBe(LOCKED_CHEST_ASSET_ID);
    expect(STAGE1M_LIVE_VERIFIED.repairMethodVersion).toBe(LOCKED_CHEST_REPAIR_METHOD_VERSION);
    expect(STAGE1M_LIVE_VERIFIED.gate).toBe(LOCKED_CHEST_GATE);
    expect(STAGE1M_LIVE_VERIFIED.fail).toEqual([]);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.assetId).toBe(LOCKED_SLEEVE_ASSET_ID);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.repairMethodVersion).toBe(
      LOCKED_SLEEVE_REPAIR_METHOD_VERSION,
    );
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.claim).toBe(LOCKED_SLEEVE_CLAIM);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.gate).toBe(LOCKED_SLEEVE_GATE);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.fail).toEqual([]);
  });
});

describe("Lane R locked spend + auth arms", () => {
  it("keeps temporal and reconstruct compile-time arms on", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(LOCKED_TEMPORAL_ARMED);
    expect(RECONSTRUCT_LIVE_WIRING_ARMED).toBe(LOCKED_RECONSTRUCT_ARMED);
  });

  it("stamps paidCalls=false / no per-frame Grok on both deploy-note tables", () => {
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.parentRedeployOnly.paidCalls).toBe(LOCKED_PAID_CALLS);
    expect(TEMPORAL_LIVE_DEPLOY_NOTES.parentRedeployOnly.noPerFrameGrok).toBe(true);
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.paidCalls).toBe(LOCKED_PAID_CALLS);
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.noPerFrameGrok).toBe(true);
    expect(RECONSTRUCT_LIVE_DEPLOY_NOTES.parentRedeployOnly.sam3LiveFetch).toBe(false);
  });

  it("dispatches temporal in-lib with paidCalls=false when explicitArm is set", () => {
    const fixture = clearedChestTranslatingFixture();
    const result = dispatchTemporalPropagate({
      clip: sourceClipToWire(fixture.clip),
      explicitArm: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.paidCalls).toBe(LOCKED_PAID_CALLS);
    expect(result.body.grokPerFrame).toBe(LOCKED_GROK_PER_FRAME);
    expect(result.body.provider).toBe("none");
  });

  it("refuses temporal dispatch without explicitArm (auth path lock)", () => {
    const fixture = clearedChestTranslatingFixture();
    const result = dispatchTemporalPropagate({
      clip: sourceClipToWire(fixture.clip),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("explicit_arm_required");
  });

  it("runs reconstruct E2E $0 fixture with paidCalls=false", () => {
    const result = runReconstructE2e({ explicitArm: true, allowFixtureTemporal: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paidCalls).toBe(LOCKED_PAID_CALLS);
    expect(result.grokPerFrame).toBe(LOCKED_GROK_PER_FRAME);
    expect(result.sam3LiveFetch).toBe(false);
  });

  it("leaves the still-repair edge mirror false while product tracking stays true", () => {
    expect(ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled).toBe(true);
    const edge = readFileSync("supabase/functions/_shared/architectureCStillRepair.ts", "utf8");
    const proxy = readFileSync(
      "supabase/functions/architecture-c-still-repair-proxy/index.ts",
      "utf8",
    );
    expect(edge).toMatch(/temporalTrackingEnabled:\s*false/);
    expect(proxy).toMatch(/temporalTrackingEnabled:\s*false/);
    expect(LOCKED_STILL_REPAIR_EDGE_TRACKING).toBe(false);
  });
});
