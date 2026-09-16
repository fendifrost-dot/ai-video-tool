/**
 * Catalog-driven PlayableClipSpec binding.
 *
 * Clip/project ids live here (and in spec.ts). Compose / encode / E2-hook /
 * handoff / temporal chunking stay clip-agnostic — they never switch on
 * 76fe7438 or f31bd0f2.
 *
 * IDs must match `src/lib/pipeline/catalog.ts` (G2). Reconstruct copies them
 * so this lane does not import Product OS.
 *
 * Live Hero Frame Export stays canonical-only. Second-clip live Export is
 * NOT CLEARED.
 */

import { CANONICAL_STILL_ASSET_ID } from "../canonicalLineage";
import {
  HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT,
  HERO_FRAME_PLAYABLE_EXPORT_KEYFRAME_INDEX,
  PLAYABLE_DX_PER_FRAME,
  PLAYABLE_WORKING_FPS,
  PLAYABLE_WORKING_HEIGHT,
  PLAYABLE_WORKING_WIDTH,
  type PlayableCatalogId,
  type PlayableClipSpec,
} from "./contract";
import { CANONICAL_GARMENT_ID, canonicalPlayableSpec } from "./spec";

/** Must match `CANONICAL_YSL_ICE_ON.id` in src/lib/pipeline/catalog.ts */
export const CANONICAL_PLAYABLE_CATALOG_ID = "canonical-ysl-ice-on" as const satisfies PlayableCatalogId;

/** Must match `SECOND_EXISTING_V2_EDITED_CLIP.id` in src/lib/pipeline/catalog.ts */
export const SECOND_CLIP_PLAYABLE_CATALOG_ID =
  "ysl-ice-on-v2-edited-clip" as const satisfies PlayableCatalogId;

/** Must match `SECOND_EXISTING_V2_EDITED_CLIP.clipId` */
export const SECOND_CLIP_PLAYABLE_CLIP_ID = "f31bd0f2-884f-42e1-8b08-aa645597b7a6";

/** Same project as canonical — V2 edited_clip is not a second project. */
export const SECOND_CLIP_PLAYABLE_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";

/** Parent original master of V2 edited_clip `f31bd0f2`. */
export const SECOND_CLIP_PARENT_MASTER_ID = "76fe7438-671d-4428-a7f6-17a45e98c16f";

/**
 * Short $0 fixture window (same size as Hero Frame export). Not the 72-frame
 * canonical Architecture C window and not live 241-frame proxy.
 */
export const SECOND_CLIP_PLAYABLE_FRAME_COUNT = HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT;
export const SECOND_CLIP_PLAYABLE_KEYFRAME_INDEX = HERO_FRAME_PLAYABLE_EXPORT_KEYFRAME_INDEX;

export type PlayableArtifactLayout = {
  artifactId: string;
  clipKey: "76fe7438" | "f31bd0f2";
  catalogId: PlayableCatalogId;
  dir: string;
  mp4RelativePath: string;
  claimsRelativePath: string;
  hookRelativePath: string;
  videoQaRelativePath: string;
  handoffRelativePath: string;
  provenanceRelativePath: string;
};

function layoutFor(
  clipKey: PlayableArtifactLayout["clipKey"],
  catalogId: PlayableCatalogId,
): PlayableArtifactLayout {
  const dir = `docs/reconstruct/artifacts/playable-${clipKey}`;
  return {
    artifactId: `playable-${clipKey}`,
    clipKey,
    catalogId,
    dir,
    mp4RelativePath: `${dir}/reconstructed.mp4`,
    claimsRelativePath: `${dir}/claims.json`,
    hookRelativePath: `${dir}/e2-hook.json`,
    videoQaRelativePath: `${dir}/video-qa.json`,
    handoffRelativePath: `${dir}/lane-h-handoff.json`,
    provenanceRelativePath: `${dir}/provenance.json`,
  };
}

export const CANONICAL_PLAYABLE_ARTIFACT_LAYOUT = layoutFor("76fe7438", CANONICAL_PLAYABLE_CATALOG_ID);
export const SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT = layoutFor(
  "f31bd0f2",
  SECOND_CLIP_PLAYABLE_CATALOG_ID,
);

export function playableArtifactLayoutForCatalog(catalogId: PlayableCatalogId): PlayableArtifactLayout {
  if (catalogId === SECOND_CLIP_PLAYABLE_CATALOG_ID) {
    return SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT;
  }
  return CANONICAL_PLAYABLE_ARTIFACT_LAYOUT;
}

/**
 * Live Hero Frame §7 Export is canonical-only.
 * Second-clip live Export is NOT CLEARED (no Publish, no UI bind).
 */
export function livePlayableExportCleared(catalogId: PlayableCatalogId): boolean {
  return catalogId === CANONICAL_PLAYABLE_CATALOG_ID;
}

export function playablePortabilityDesign(): {
  rule: string;
  idAwareModules: string[];
  sharedModules: string[];
  catalogs: PlayableCatalogId[];
  paidCalls: false;
  grokPerFrame: false;
  raisedProxyMaxFrames: false;
  liveExportCleared: PlayableCatalogId[];
  liveExportNotCleared: PlayableCatalogId[];
} {
  return {
    rule: "Compose, encode, E2-hook, Lane H handoff, and temporal chunking key on PlayableClipSpec fields. Clip/project ids live only in spec/catalogBind.",
    idAwareModules: [
      "src/lib/reconstruct/playable/spec.ts",
      "src/lib/reconstruct/playable/catalogBind.ts",
    ],
    sharedModules: [
      "src/lib/reconstruct/playable/compose.ts",
      "src/lib/reconstruct/playable/encodeMp4.ts",
      "src/lib/reconstruct/playable/e2Hook.ts",
      "src/lib/reconstruct/playable/handoff.ts",
      "src/lib/reconstruct/playable/temporalChunk.ts",
      "src/lib/reconstruct/playable/temporalFullClip.ts",
      "src/lib/reconstruct/playable/sam3Consume.ts",
    ],
    catalogs: [CANONICAL_PLAYABLE_CATALOG_ID, SECOND_CLIP_PLAYABLE_CATALOG_ID],
    paidCalls: false,
    grokPerFrame: false,
    raisedProxyMaxFrames: false,
    liveExportCleared: [CANONICAL_PLAYABLE_CATALOG_ID],
    liveExportNotCleared: [SECOND_CLIP_PLAYABLE_CATALOG_ID],
  };
}

/**
 * Second existing clip: G2 catalog `ysl-ice-on-v2-edited-clip` / `f31bd0f2`.
 *
 * Raster is the same $0 Architecture C still-derived pack (unique-RGB +
 * 2aa1a44c band-crop). That is NOT live Grok V2 pixels and NOT a 2nd-clip
 * chest/sleeve golden.
 */
export function secondClipPlayableSpec(overrides: Partial<PlayableClipSpec> = {}): PlayableClipSpec {
  const frameCount = overrides.frameCount ?? SECOND_CLIP_PLAYABLE_FRAME_COUNT;
  const fps = overrides.fps ?? PLAYABLE_WORKING_FPS;
  const keyframeIndex = overrides.keyframeIndex ?? SECOND_CLIP_PLAYABLE_KEYFRAME_INDEX;
  return canonicalPlayableSpec({
    projectId: SECOND_CLIP_PLAYABLE_PROJECT_ID,
    masterClipAssetId: SECOND_CLIP_PLAYABLE_CLIP_ID,
    stillAssetId: CANONICAL_STILL_ASSET_ID,
    garmentId: CANONICAL_GARMENT_ID,
    width: PLAYABLE_WORKING_WIDTH,
    height: PLAYABLE_WORKING_HEIGHT,
    fps,
    frameCount,
    durationSec: frameCount / fps,
    keyframeIndex,
    keyframeId: "v2-edited-clip-playable-fixture",
    keyframeTimeSec: fps > 0 ? keyframeIndex / fps : 0,
    dxPerFrame: PLAYABLE_DX_PER_FRAME,
    catalogId: SECOND_CLIP_PLAYABLE_CATALOG_ID,
    parentMasterClipAssetId: SECOND_CLIP_PARENT_MASTER_ID,
    ...overrides,
  });
}

export function playableSpecFromCatalog(
  catalogId: PlayableCatalogId,
  overrides: Partial<PlayableClipSpec> = {},
): PlayableClipSpec {
  if (catalogId === SECOND_CLIP_PLAYABLE_CATALOG_ID) {
    return secondClipPlayableSpec(overrides);
  }
  return canonicalPlayableSpec({
    catalogId: CANONICAL_PLAYABLE_CATALOG_ID,
    ...overrides,
  });
}
