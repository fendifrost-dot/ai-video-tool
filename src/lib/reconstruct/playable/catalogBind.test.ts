import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_YSL_ICE_ON,
  SECOND_EXISTING_V2_EDITED_CLIP,
  secondClipPortabilityDesign,
} from "@/lib/pipeline/catalog";
import { CANONICAL_MASTER_CLIP_ID, CANONICAL_PROJECT_ID } from "../canonicalLineage";
import { unauthorizedPixelsMatchOriginal } from "../originalMasterReconstruct";
import { runPlayableCompose } from "./compose";
import { LIVE_PROXY_MAX_FRAMES } from "./contract";
import { buildPlayableArtifactClaims, buildPlayableE2Hook } from "./e2Hook";
import { buildPlayableLaneHHandoff } from "./handoff";
import { heroFramePlayableSpec } from "./spec";
import {
  CANONICAL_PLAYABLE_ARTIFACT_LAYOUT,
  CANONICAL_PLAYABLE_CATALOG_ID,
  SECOND_CLIP_PARENT_MASTER_ID,
  SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT,
  SECOND_CLIP_PLAYABLE_CATALOG_ID,
  SECOND_CLIP_PLAYABLE_CLIP_ID,
  SECOND_CLIP_PLAYABLE_FRAME_COUNT,
  SECOND_CLIP_PLAYABLE_PROJECT_ID,
  livePlayableExportCleared,
  playableArtifactLayoutForCatalog,
  playablePortabilityDesign,
  playableSpecFromCatalog,
  secondClipPlayableSpec,
} from "./catalogBind";
import {
  SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH,
  SECOND_CLIP_PLAYABLE_MP4_SHA256,
  committedSecondClipPlayableMp4Ref,
  evaluatePlayableVideoQa,
  playableMp4RefForLayout,
} from "./videoQaPlug";

const SHARED_PLAYABLE_MODULES = [
  "src/lib/reconstruct/playable/compose.ts",
  "src/lib/reconstruct/playable/encodeMp4.ts",
  "src/lib/reconstruct/playable/e2Hook.ts",
  "src/lib/reconstruct/playable/handoff.ts",
  "src/lib/reconstruct/playable/temporalChunk.ts",
  "src/lib/reconstruct/playable/temporalFullClip.ts",
  "src/lib/reconstruct/playable/sam3Consume.ts",
];

describe("Lane H second-clip playable portability", () => {
  it("binds G2 catalog ysl-ice-on-v2-edited-clip / f31bd0f2 without inventing ids", () => {
    expect(SECOND_CLIP_PLAYABLE_CATALOG_ID).toBe(SECOND_EXISTING_V2_EDITED_CLIP.id);
    expect(SECOND_CLIP_PLAYABLE_CLIP_ID).toBe(SECOND_EXISTING_V2_EDITED_CLIP.clipId);
    expect(SECOND_CLIP_PLAYABLE_PROJECT_ID).toBe(SECOND_EXISTING_V2_EDITED_CLIP.projectId);
    expect(SECOND_CLIP_PLAYABLE_PROJECT_ID).toBe(CANONICAL_YSL_ICE_ON.projectId);
    expect(SECOND_CLIP_PARENT_MASTER_ID).toBe(CANONICAL_YSL_ICE_ON.clipId);
    expect(SECOND_CLIP_PARENT_MASTER_ID).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(SECOND_CLIP_PLAYABLE_CLIP_ID).not.toBe(CANONICAL_MASTER_CLIP_ID);
    expect(SECOND_EXISTING_V2_EDITED_CLIP.paidCalls).toBe(false);
    expect(secondClipPortabilityDesign().catalogs).toContain(SECOND_CLIP_PLAYABLE_CATALOG_ID);
  });

  it("keeps live Hero Frame Export canonical-only (2nd clip NOT CLEARED)", () => {
    expect(livePlayableExportCleared(CANONICAL_PLAYABLE_CATALOG_ID)).toBe(true);
    expect(livePlayableExportCleared(SECOND_CLIP_PLAYABLE_CATALOG_ID)).toBe(false);
    expect(playablePortabilityDesign().liveExportNotCleared).toEqual([
      SECOND_CLIP_PLAYABLE_CATALOG_ID,
    ]);
    const hero = heroFramePlayableSpec();
    expect(hero.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(hero.catalogId).toBe(CANONICAL_PLAYABLE_CATALOG_ID);
  });

  it("does not raise live proxy maxFrames=24", () => {
    expect(LIVE_PROXY_MAX_FRAMES).toBe(24);
    expect(playablePortabilityDesign().raisedProxyMaxFrames).toBe(false);
  });

  it("composes / hands off / E2-hooks the 2nd clip through the same 720×1280 path", () => {
    const spec = playableSpecFromCatalog(SECOND_CLIP_PLAYABLE_CATALOG_ID, {
      frameCount: 6,
      keyframeIndex: 2,
    });
    expect(spec.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(spec.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(spec.catalogId).toBe(SECOND_CLIP_PLAYABLE_CATALOG_ID);
    expect(spec.parentMasterClipAssetId).toBe(SECOND_CLIP_PARENT_MASTER_ID);
    expect(spec.frameCount).toBe(6);

    const compose = runPlayableCompose({ explicitArm: true, spec });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;

    expect(compose.paidCalls).toBe(false);
    expect(compose.grokPerFrame).toBe(false);
    expect(compose.sam3LiveFetch).toBe(false);
    expect(compose.edgeFunction).toBeNull();
    expect(compose.width).toBe(720);
    expect(compose.height).toBe(1280);
    expect(compose.frameCount).toBe(6);
    expect(compose.spec.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(compose.clip.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(compose.clip.clipId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(compose.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(compose.temporalChunking.maxFrames).toBe(24);
    expect(compose.temporalChunking.raisedProxyMaxFrames).toBe(false);
    expect(compose.sam3.source).toBe("intended_stage1h_evidence");
    expect(compose.sam3.liveFetch).toBe(false);

    const byIndex = new Map(compose.originalFrames.map((f) => [f.index, f.image]));
    for (const fr of compose.clip.frames) {
      const original = byIndex.get(fr.index);
      expect(original).toBeDefined();
      expect(
        unauthorizedPixelsMatchOriginal(original!, fr.result.image, fr.result.authorizedAlpha),
      ).toBe(true);
    }

    const handoff = buildPlayableLaneHHandoff(compose);
    expect(handoff.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(handoff.schemaVersion).toBe("reconstruct-lane-h-handoff-v2");
    expect(handoff.paidCalls).toBe(false);
    expect(handoff.stillGoldensReopened).toBe(false);
    expect(handoff.width).toBe(720);
    expect(handoff.height).toBe(1280);
    expect(handoff.mp4.codecClaims.videoCodec).toBeNull();

    const layout = playableArtifactLayoutForCatalog(SECOND_CLIP_PLAYABLE_CATALOG_ID);
    expect(layout).toEqual(SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT);
    expect(layout.mp4RelativePath).toContain("playable-f31bd0f2");
    expect(layout.mp4RelativePath).not.toContain("playable-76fe7438");
    expect(CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.mp4RelativePath).toContain("playable-76fe7438");

    const claims = buildPlayableArtifactClaims(compose, {
      width: compose.width,
      height: compose.height,
      frameCount: compose.frameCount,
      fps: compose.fps,
      durationSec: compose.durationSec,
      codec: "pending_ffmpeg_artifact",
      container: "pending_ffmpeg_artifact",
      pixelFormat: "rgba_in_memory",
      audio: { present: false, preserved: null, sync: null, note: "fixture window" },
    });
    expect(claims.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(claims.lineage.catalogId).toBe(SECOND_CLIP_PLAYABLE_CATALOG_ID);
    expect(claims.paidCalls).toBe(false);
    expect(claims.grokPerFrame).toBe(false);

    const hook = buildPlayableE2Hook(claims, {
      mp4RelativePath: layout.mp4RelativePath,
      claimsRelativePath: layout.claimsRelativePath,
      hookRelativePath: layout.hookRelativePath,
    });
    expect(hook.evaluatorInput.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(hook.evaluatorInput.mp4RelativePath).toBe(layout.mp4RelativePath);
    expect(hook.scoringOwner).toBe("lane_e2");

    const { report, json } = evaluatePlayableVideoQa({
      compose,
      mp4: playableMp4RefForLayout(layout, { produced: true, byteLength: 32 }),
      includeDecodedFrames: false,
    });
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.awaiting).toContain("decoded_frames");
    expect(report.failCount).toBe(0);
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(json.mp4?.artifactId).toBe("playable-f31bd0f2");
    expect(json.mp4?.path).toBe(layout.mp4RelativePath);
  });

  it("keeps clip ids out of shared encode/handoff modules", () => {
    const root = process.cwd();
    expect(playablePortabilityDesign().sharedModules).toEqual(SHARED_PLAYABLE_MODULES);
    for (const rel of SHARED_PLAYABLE_MODULES) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toContain("76fe7438");
      expect(src).not.toContain("f31bd0f2");
      expect(src).not.toContain("ysl-ice-on-v2-edited-clip");
      expect(src).not.toContain("canonical-ysl-ice-on");
    }
  });

  it("does not reopen chest 1m / sleeve 1c still goldens", () => {
    const spec = secondClipPlayableSpec({ frameCount: 4, keyframeIndex: 1 });
    expect(spec.frameCount).toBe(4);
    expect(SECOND_CLIP_PLAYABLE_FRAME_COUNT).toBe(8);
    const compose = runPlayableCompose({ explicitArm: true, spec });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;
    expect(compose.clip.chestAssetId).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(compose.clip.sleeveAssetId).toBe("fdb86b18-d4aa-465e-b73f-1d252709739c");
    const { report } = evaluatePlayableVideoQa({
      compose,
      mp4: playableMp4RefForLayout(SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT, { produced: false }),
    });
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
  });
});

describe("committed 2nd-clip playable fixture", () => {
  it("pins dims/frames/sha of the 8-frame MP4", () => {
    const path = SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT.mp4RelativePath;
    expect(existsSync(path)).toBe(true);
    const bytes = readFileSync(path);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(sha).toBe(SECOND_CLIP_PLAYABLE_MP4_SHA256);
    expect(bytes.byteLength).toBe(SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH);
    const ref = committedSecondClipPlayableMp4Ref();
    expect(ref.produced).toBe(true);
    expect(ref.sha256).toBe(SECOND_CLIP_PLAYABLE_MP4_SHA256);
    expect(ref.byteLength).toBe(SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH);
    expect(ref.path).toBe(path);
    expect(ref.artifactId).toBe("playable-f31bd0f2");
    expect(ref.mimeType).toBe("video/mp4");

    const claims = JSON.parse(
      readFileSync(SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT.claimsRelativePath, "utf8"),
    ) as {
      masterClipAssetId: string;
      mp4: { width: number; height: number; frameCount: number; fps: number };
      paidCalls: boolean;
      grokPerFrame: boolean;
      lineage: { catalogId?: string; parentMasterClipAssetId?: string };
    };
    expect(claims.masterClipAssetId).toBe(SECOND_CLIP_PLAYABLE_CLIP_ID);
    expect(claims.mp4.width).toBe(720);
    expect(claims.mp4.height).toBe(1280);
    expect(claims.mp4.frameCount).toBe(8);
    expect(claims.mp4.fps).toBeCloseTo(24);
    expect(claims.paidCalls).toBe(false);
    expect(claims.grokPerFrame).toBe(false);
    expect(claims.lineage.catalogId).toBe(SECOND_CLIP_PLAYABLE_CATALOG_ID);
    expect(claims.lineage.parentMasterClipAssetId).toBe(SECOND_CLIP_PARENT_MASTER_ID);
  });
});
