/**
 * Catalog-agnostic $0 fixture seeds so a second existing clip can exercise
 * the same graph without clip-specific orchestrator code.
 *
 * Asset ids are derived from `catalogId` — not the canonical CLEARED stills —
 * so product-safe auto-review does not fire for the V2 edited clip.
 */

import type { ArtifactKind, PipelineStageId, SeedArtifact } from "./types";

const E2_VIDEO_QA_SPEC = "lane-e2-video-qa-v1" as const;

export type FixtureSeedOpts = {
  catalogId: string;
  clipId: string;
  producedAt?: string;
};

function art(
  opts: FixtureSeedOpts,
  kind: ArtifactKind,
  stage: PipelineStageId | "seed",
  extra: Partial<SeedArtifact> = {},
): SeedArtifact {
  const producedAt = opts.producedAt ?? extra.producedAt ?? "2026-09-16T00:00:00.000Z";
  return {
    ...extra,
    id: extra.id ?? `fixture-${opts.catalogId}-${kind}`,
    kind,
    assetId: extra.assetId ?? `fixture-${opts.catalogId}-${kind}`,
    producedByStage: extra.producedByStage ?? stage,
    producedAt,
    mimeType: extra.mimeType,
    lanePayload: {
      fixture: true,
      paidCalls: false,
      catalogId: opts.catalogId,
      clipId: opts.clipId,
      ...(extra.lanePayload ?? {}),
    },
  };
}

/** Fixture stills so keyframe + sleeve import on any catalog. Not CLEARED 1m/1c. */
export function fixtureStillSeeds(opts: FixtureSeedOpts): SeedArtifact[] {
  return [
    art(opts, "source_still", "seed", {
      lanePayload: { fixture: true, paidCalls: false, catalogId: opts.catalogId, clipId: opts.clipId },
    }),
    art(opts, "repaired_still_logo_chest", "keyframe_repair", {
      lanePayload: {
        fixture: true,
        paidCalls: false,
        gate: "UNSCORED",
        repairMethodVersion: "architecture_c_still_repair_1m",
      },
    }),
    art(opts, "repaired_still_sleeve_panel", "sleeve_garment_repair", {
      lanePayload: {
        fixture: true,
        paidCalls: false,
        gate: "UNSCORED",
        repairMethodVersion: "architecture_c_sleeve_still_1c",
      },
    }),
  ];
}

export function fixtureVideoQaLanePayload(): Record<string, unknown> {
  return {
    schemaVersion: E2_VIDEO_QA_SPEC,
    verdict: "PASS",
    passCount: 9,
    failCount: 0,
    skipCount: 0,
    paidCalls: false,
    stillGoldensReopened: false,
    blockingArtifactProducer: false,
    claudeInvestigates: "unexplained_only",
    awaiting: [],
    frameCount: 5,
    artifactKind: "reconstructed_frames",
    mp4: { produced: false },
    criteria: [],
    perFrame: [],
    temporal: {
      maskXorMean: null,
      maskXorMax: null,
      outsideExcessMeanAbsLuma: null,
      insideMeanAbsLumaDelta: null,
      seamTemporalMeanAbsLuma: null,
      centroidDriftPx: null,
    },
    artifacts: { crops: [] },
    unexplained: [],
    escalate: null,
    notClaimed: [
      "in-process MP4 decode (Lane H or injected decoder supplies rasters)",
      "chest Stage 1m 11/11 rescore",
      "sleeve Stage 1c 6/6 rescore",
    ],
    provenance: {},
  };
}

/** Temporal → encode fixture kinds. Does not encode MP4. */
export function fixtureDownstreamSeeds(opts: FixtureSeedOpts): SeedArtifact[] {
  return [
    art(opts, "propagation_frames", "temporal_propagation"),
    art(opts, "original_master_composite", "original_master_reconstruction", {
      lanePayload: { fixture: true, paidCalls: false, e2eVersion: "1.0.0" },
    }),
    art(opts, "branded_composite", "deterministic_branding"),
    art(opts, "video_qa_report", "automated_evaluation", {
      lanePayload: fixtureVideoQaLanePayload(),
    }),
    art(opts, "encoded_mp4", "review_export", {
      mimeType: "video/mp4",
      lanePayload: {
        ownerLane: "H",
        paidCalls: false,
        encodeStatus: "not_claimed",
        produced: false,
        blockingArtifactProducer: false,
        note: "Lane H encode not merged — provenance stub only.",
      },
    }),
  ];
}

export function fixtureGraphSeeds(opts: FixtureSeedOpts): SeedArtifact[] {
  return [...fixtureStillSeeds(opts), ...fixtureDownstreamSeeds(opts)];
}
