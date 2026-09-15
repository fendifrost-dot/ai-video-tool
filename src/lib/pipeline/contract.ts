/**
 * Canonical stage contracts. Each entry names the existing lane surface Lane G
 * consumes and explicitly does not own.
 *
 * Intended shared surfaces (DO NOT modify from this lane):
 * - src/lib/queries/wardrobeVideoFrames.ts
 * - src/lib/queries/architectureCStillRepair.ts
 * - src/lib/heroFrame/architectureCStillRepair.ts
 * - src/lib/garment/placementEngine.ts
 * - src/lib/garment/logoComposite.ts
 * - src/lib/queries/grokImageGarment.ts
 * - src/lib/queries/grokVideoEdit.ts
 * - src/lib/providerJobs/api.ts
 * - src/lib/queries/clipReviews.ts
 * - src/lib/export/buildPackage.ts
 * - src/lib/video/scrubProxy.ts
 * - supabase/functions/_shared/frameExtract.ts
 * - supabase/functions/_shared/keyframePlan.ts
 * - supabase/functions/_shared/propagation.ts
 * - supabase/functions/_shared/placementEngine.ts
 * - supabase/functions/architecture-c-still-repair-proxy/index.ts
 * - supabase/functions/wardrobe-video-propagate-proxy/index.ts
 */

import { DEFAULT_RETRY_POLICY } from "./retry";
import type { ArtifactKind, PipelineStageId, StageDefinition } from "./types";
import { PIPELINE_STAGE_IDS } from "./types";

const noPaidCalls = { paidCalls: false as const, ownsInternals: false as const };

export const STAGE_DEFINITIONS: Record<PipelineStageId, StageDefinition> = {
  ingest: {
    id: "ingest",
    label: "Ingest / extract / preflight",
    consumes: ["source_master"],
    requiredAll: ["source_master"],
    requiredAny: [],
    produces: ["source_master", "scrub_proxy", "extract_manifest", "source_still"],
    dependsOn: [],
    gates: [],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "src/lib/queries/wardrobeVideoFrames.ts",
        entrypoint: "runFrameRoundtrip / ServerExtractConfig",
        notes:
          "Server clip extract + pollAssetStatus extract_status. Consume manifest; do not own FFmpeg.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/video/scrubProxy.ts",
        entrypoint: "readScrubProxyMeta",
        notes:
          "Scrub-proxy pointer on metadata_json. Compatibility gate needs_transcode is terminal.",
      },
      {
        ...noPaidCalls,
        module: "supabase/functions/_shared/frameExtract.ts",
        entrypoint: "ExtractionManifest / ExtractionRepro",
        notes: "Idempotent extract + reproducibility metadata.",
      },
    ],
  },
  generation: {
    id: "generation",
    label: "Generation (consume existing only)",
    consumes: ["source_master", "source_still", "generation_clip", "generation_still"],
    requiredAll: [],
    requiredAny: ["source_master", "source_still", "generation_clip", "generation_still"],
    produces: ["generation_clip", "generation_still"],
    dependsOn: ["ingest"],
    gates: [],
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
    allowImportFromLane: true,
    laneSurfaces: [
      {
        module: "src/lib/queries/grokVideoEdit.ts",
        entrypoint: "callGrokVideoEdit",
        ownsInternals: false,
        paidCalls: true,
        notes:
          "HARD LOCK: Lane G must not invoke this. Import a completed generation artifact from another lane.",
      },
      {
        module: "src/lib/queries/grokImageGarment.ts",
        entrypoint: "applyGrokGarmentTruthAndWait",
        ownsInternals: false,
        paidCalls: true,
        notes: "HARD LOCK: no V3 / paid Grok gens from this lane. Consume lookId artifacts only.",
      },
      {
        module: "src/lib/providerJobs/api.ts",
        entrypoint: "createGenerationJob",
        ownsInternals: false,
        paidCalls: true,
        notes:
          "Provider-job lifecycle lives in another lane. Orchestrator stores job/asset ids only.",
      },
    ],
  },
  keyframe_repair: {
    id: "keyframe_repair",
    label: "Keyframe / logo_chest repair",
    consumes: ["generation_still", "source_still"],
    requiredAll: [],
    requiredAny: ["generation_still", "source_still"],
    produces: ["repaired_still_logo_chest"],
    dependsOn: ["generation"],
    gates: [],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "supabase/functions/architecture-c-still-repair-proxy/index.ts",
        entrypoint: "POST /functions/v1/architecture-c-still-repair-proxy (stage: logo_chest)",
        notes:
          "Chest compute lives here. Canonical live CLEARED 11/11: asset 9ed83c01, architecture_c_still_repair_1m (PR #73). Lane G orchestrates via callArchitectureCStillRepair; does not rewrite paint or redeploy.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/queries/architectureCStillRepair.ts",
        entrypoint: "callArchitectureCStillRepair (stage: logo_chest)",
        notes:
          "Client wrapper. Product OS chest adapter calls this with stage: logo_chest. Do not rewrite Architecture C algorithms.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/heroFrame/architectureCStillRepair.ts",
        entrypoint: "buildStillRepairAssetMetadata / isStillRepairOutputMetadata",
        notes: "Still-first hard stop: temporal_tracking_enabled stays false until review.",
      },
    ],
  },
  sleeve_garment_repair: {
    id: "sleeve_garment_repair",
    label: "Sleeve / garment repair",
    consumes: ["repaired_still_logo_chest"],
    requiredAll: ["repaired_still_logo_chest"],
    requiredAny: [],
    produces: ["repaired_still_sleeve_panel"],
    dependsOn: ["keyframe_repair"],
    gates: [],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "supabase/functions/architecture-c-still-repair-proxy/index.ts",
        entrypoint: "POST /functions/v1/architecture-c-still-repair-proxy (stage: sleeve_panel)",
        notes:
          "Same Lovable edge function as chest. Sleeve paint is Lane B `repairVisibleSleevePanelsOnStill` (`architecture_c_sleeve_still_1a`). Do not reopen logo_chest 1m.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/sleevePanel/liveStill.ts",
        entrypoint: "repairVisibleSleevePanelsOnStill",
        notes:
          "Authoritative visible-geometry contract. Manual quads only; hidden shoulder→cuff never validated.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/queries/architectureCStillRepair.ts",
        entrypoint: "callArchitectureCStillRepair (stage: sleeve_panel)",
        notes: "Client wrapper only. Same proxy, different stage.",
      },
    ],
  },
  temporal_propagation: {
    id: "temporal_propagation",
    label: "Temporal propagation",
    consumes: ["repaired_still_sleeve_panel", "source_master", "extract_manifest"],
    requiredAll: ["repaired_still_sleeve_panel"],
    requiredAny: ["source_master", "extract_manifest"],
    produces: ["propagation_frames", "propagated_clip"],
    dependsOn: ["sleeve_garment_repair"],
    gates: [
      {
        id: "still_repair_approved",
        reviewKey: "stillRepairApproved",
        requiresStage: "keyframe_repair",
        requiresStatuses: ["succeeded"],
        onFail: "needs_review",
        reason:
          "Architecture C hard stop: no temporal propagation until the repaired still passes human review.",
      },
    ],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "src/lib/queries/wardrobeVideoFrames.ts",
        entrypoint: "runLaneARoundtrip",
        notes: "Propagation + reassemble. Engine may be disabled; surface propagate_status as-is.",
      },
      {
        ...noPaidCalls,
        module: "supabase/functions/_shared/propagation.ts",
        entrypoint: "resolvePropagationEngine / buildPropagationBody",
        notes: "Engine resolution only. Lane G does not own RAFT / v2v internals.",
      },
      {
        ...noPaidCalls,
        module: "supabase/functions/_shared/keyframePlan.ts",
        entrypoint: "planKeyframes / assignSegments",
        notes: "Cadence + segment assignment. Consume plan; do not reimplement.",
      },
    ],
  },
  original_master_reconstruction: {
    id: "original_master_reconstruction",
    label: "Original-master reconstruction",
    consumes: ["propagation_frames", "propagated_clip", "source_master"],
    requiredAll: ["source_master"],
    requiredAny: ["propagation_frames", "propagated_clip"],
    produces: ["original_master_composite"],
    dependsOn: ["temporal_propagation"],
    gates: [
      {
        id: "architecture_c_gate_4",
        reviewKey: "masterCompositeAuthorized",
        onFail: "blocked",
        reason:
          "Architecture C gate 4 (SAM-3 + original-master composite) is a future lane. Contract stub only.",
      },
    ],
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "docs/ARCHITECTURE_C_CHATGPT_LOCK_2026-09-03.md",
        entrypoint: "Gate 4 — SAM-3 / original-master reconstruction",
        notes: "No dedicated module yet. Lane G exposes the plug-in slot only.",
      },
    ],
  },
  deterministic_branding: {
    id: "deterministic_branding",
    label: "Deterministic branding / placement",
    consumes: ["original_master_composite", "repaired_still_sleeve_panel"],
    requiredAll: [],
    requiredAny: ["original_master_composite", "repaired_still_sleeve_panel"],
    produces: ["branded_composite"],
    dependsOn: ["original_master_reconstruction"],
    gates: [],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "src/lib/garment/placementEngine.ts",
        entrypoint: "placeDetail",
        notes: "Deterministic stripe/logo/sleeve placement. Call, do not rewrite.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/garment/logoComposite.ts",
        entrypoint: "composite helpers",
        notes: "Pixel-preserving brand composite. Lane G stores the output artifact ref only.",
      },
    ],
  },
  automated_evaluation: {
    id: "automated_evaluation",
    label: "Automated evaluation",
    consumes: ["branded_composite", "propagated_clip", "repaired_still_sleeve_panel"],
    requiredAll: [],
    requiredAny: ["branded_composite", "propagated_clip", "repaired_still_sleeve_panel"],
    produces: ["evaluation_report"],
    dependsOn: ["deterministic_branding"],
    gates: [],
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1 },
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "src/lib/queries/clipReviews.ts",
        entrypoint: "SCORE_METRICS / averageScore",
        notes: "Reuse score metric keys. Do not own evaluation algorithm implementations.",
      },
      {
        ...noPaidCalls,
        module: "src/lib/clipReviews/driftFlags.ts",
        entrypoint: "computeDriftFlags",
        notes: "Drift flags from score thresholds. Evaluation lane supplies the numbers.",
      },
      {
        ...noPaidCalls,
        module: "docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md",
        entrypoint: "benchmark provenance package",
        notes: "Verdict artifacts must carry evidence labels; Lane G only stores the report ref.",
      },
    ],
  },
  review_export: {
    id: "review_export",
    label: "Review / export",
    consumes: ["evaluation_report", "branded_composite"],
    requiredAll: [],
    requiredAny: ["evaluation_report", "branded_composite"],
    produces: ["review_scorecard", "export_package"],
    dependsOn: ["automated_evaluation"],
    gates: [
      {
        id: "export_approved",
        reviewKey: "exportApproved",
        onFail: "needs_review",
        reason: "Export requires an explicit review approval flag on the run.",
      },
    ],
    retryPolicy: DEFAULT_RETRY_POLICY,
    allowImportFromLane: true,
    laneSurfaces: [
      {
        ...noPaidCalls,
        module: "src/lib/export/buildPackage.ts",
        entrypoint: "buildAndDownloadPackage",
        notes: "Client export zip/EDL. Orchestrator records the package artifact, does not zip.",
      },
    ],
  },
};

export const STAGE_DEFINITION_LIST: StageDefinition[] = PIPELINE_STAGE_IDS.map(
  (id) => STAGE_DEFINITIONS[id],
);

export function getStageDefinition(id: PipelineStageId): StageDefinition {
  return STAGE_DEFINITIONS[id];
}

export function producedKindsFor(id: PipelineStageId): ArtifactKind[] {
  return STAGE_DEFINITIONS[id].produces;
}

export function consumedKindsFor(id: PipelineStageId): ArtifactKind[] {
  return STAGE_DEFINITIONS[id].consumes;
}

/** Stages whose lane surfaces declare paidCalls: true — orchestrator must not invoke them. */
export function paidCallSurfaces(): {
  stageId: PipelineStageId;
  module: string;
  entrypoint: string;
}[] {
  const out: { stageId: PipelineStageId; module: string; entrypoint: string }[] = [];
  for (const def of STAGE_DEFINITION_LIST) {
    for (const surface of def.laneSurfaces) {
      if (surface.paidCalls) {
        out.push({ stageId: def.id, module: surface.module, entrypoint: surface.entrypoint });
      }
    }
  }
  return out;
}
