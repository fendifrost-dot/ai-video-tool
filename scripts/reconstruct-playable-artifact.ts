/**
 * Lane H — produce a playable Architecture C reconstructed MP4 artifact.
 *
 * $0 / paidCalls=false / grokPerFrame=false / no SAM-3 fetch.
 *
 * Canonical 72-frame gate (default):
 *   npx tsx scripts/reconstruct-playable-artifact.ts
 *
 * Second-clip 8-frame portability fixture:
 *   npx tsx scripts/reconstruct-playable-artifact.ts --catalog=ysl-ice-on-v2-edited-clip
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlayableCompose } from "../src/lib/reconstruct/playable/compose";
import { canonicalPlayableSpec } from "../src/lib/reconstruct/playable/spec";
import {
  playableArtifactLayoutForCatalog,
  secondClipPlayableSpec,
  type PlayableArtifactLayout,
} from "../src/lib/reconstruct/playable/catalogBind";
import type { PlayableCatalogId, PlayableClipSpec } from "../src/lib/reconstruct/playable/contract";
import { encodePlayableMp4 } from "../src/lib/reconstruct/playable/encodeMp4";
import {
  buildPlayableArtifactClaims,
  buildPlayableE2Hook,
  playableE2HookToJson,
} from "../src/lib/reconstruct/playable/e2Hook";
import {
  evaluatePlayableVideoQa,
  persistPlayableVideoQaJson,
  playableMp4RefForLayout,
} from "../src/lib/reconstruct/playable/videoQaPlug";
import { buildPlayableLaneHHandoff } from "../src/lib/reconstruct/playable/handoff";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseCatalog(argv: string[]): PlayableCatalogId {
  const flag = argv.find((a) => a.startsWith("--catalog="));
  const value = flag?.slice("--catalog=".length);
  if (value === "ysl-ice-on-v2-edited-clip") return "ysl-ice-on-v2-edited-clip";
  if (value === "canonical-ysl-ice-on" || value === undefined) return "canonical-ysl-ice-on";
  throw new Error(`unknown_playable_catalog:${value}`);
}

function specForCatalog(catalogId: PlayableCatalogId): PlayableClipSpec {
  if (catalogId === "ysl-ice-on-v2-edited-clip") return secondClipPlayableSpec();
  return canonicalPlayableSpec();
}

function writeArtifact(catalogId: PlayableCatalogId, layout: PlayableArtifactLayout): void {
  const outDir = join(ROOT, layout.dir);
  mkdirSync(outDir, { recursive: true });
  const spec = specForCatalog(catalogId);
  const compose = runPlayableCompose({ explicitArm: true, spec });
  if (!compose.ok) {
    throw new Error(`compose_failed:${compose.code}:${compose.message}`);
  }

  const encoded = encodePlayableMp4({
    frames: compose.clip.frames.map((fr) => ({ index: fr.index, image: fr.result.image })),
    fps: compose.fps,
    outPath: join(ROOT, layout.mp4RelativePath),
    workDir: join(outDir, ".ppm"),
  });
  if (!encoded.ok) {
    throw new Error(`encode_failed:${encoded.message}`);
  }
  rmSync(join(outDir, ".ppm"), { recursive: true, force: true });

  const claims = buildPlayableArtifactClaims(compose, encoded.claims);
  const hook = buildPlayableE2Hook(claims, {
    mp4RelativePath: layout.mp4RelativePath,
    claimsRelativePath: layout.claimsRelativePath,
    hookRelativePath: layout.hookRelativePath,
  });

  const mp4Bytes = readFileSync(join(ROOT, layout.mp4RelativePath));
  const sha256 = createHash("sha256").update(mp4Bytes).digest("hex");

  const { json: videoQaJson, report: videoQa } = evaluatePlayableVideoQa({
    compose,
    mp4: playableMp4RefForLayout(layout, {
      produced: true,
      sha256,
      byteLength: mp4Bytes.length,
    }),
    includeDecodedFrames: false,
  });
  persistPlayableVideoQaJson(
    videoQaJson,
    (relativePath, body) => {
      const name = relativePath.split("/").pop() ?? "video-qa.json";
      writeFileSync(join(outDir, name), body);
    },
    layout.videoQaRelativePath,
  );

  const laneHHandoff = buildPlayableLaneHHandoff(compose);

  const provenance = {
    playableVersion: compose.playableVersion,
    issue: 102,
    parent: 50,
    catalogId,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    liveExportCleared: catalogId === "canonical-ysl-ice-on",
    masterClipAssetId: spec.masterClipAssetId,
    stillAssetId: spec.stillAssetId,
    projectId: spec.projectId,
    garmentId: spec.garmentId,
    parentMasterClipAssetId: spec.parentMasterClipAssetId ?? null,
    mediaKind: compose.mediaKind,
    sha256,
    mp4Bytes: mp4Bytes.length,
    claims,
    sam3: compose.sam3,
    composeSelfCheck: hook.composeSelfCheck,
    videoQa: {
      schemaVersion: videoQa.schemaVersion,
      verdict: videoQa.verdict,
      passCount: videoQa.passCount,
      failCount: videoQa.failCount,
      skipCount: videoQa.skipCount,
      awaiting: videoQa.awaiting,
      blockingArtifactProducer: videoQa.blockingArtifactProducer,
      stillGoldensReopened: videoQa.stillGoldensReopened,
    },
    laneHHandoff: {
      schemaVersion: laneHHandoff.schemaVersion,
      width: laneHHandoff.width,
      height: laneHHandoff.height,
      fps: laneHHandoff.fps,
      frameCount: laneHHandoff.frameCount,
      durationSec: laneHHandoff.durationSec,
      unauthorizedLeakCount: laneHHandoff.unauthorizedLeakCount,
    },
    notClaimed: [
      "live_hero_frame_export_on_second_clip",
      "live_241_frame_proxy",
      "live_f31bd0f2_grok_pixels",
      "second_clip_chest_1m_sleeve_1c_goldens",
      "raised_proxy_max_frames",
    ],
  };

  writeFileSync(join(outDir, "lane-h-handoff.json"), `${JSON.stringify(laneHHandoff, null, 2)}\n`);
  writeFileSync(join(outDir, "claims.json"), `${JSON.stringify(claims, null, 2)}\n`);
  writeFileSync(
    join(outDir, "e2-hook.json"),
    `${JSON.stringify(playableE2HookToJson(hook), null, 2)}\n`,
  );
  writeFileSync(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogId,
        mp4: layout.mp4RelativePath,
        width: encoded.claims.width,
        height: encoded.claims.height,
        frameCount: encoded.claims.frameCount,
        fps: encoded.claims.fps,
        durationSec: encoded.claims.durationSec,
        codec: encoded.claims.codec,
        container: encoded.claims.container,
        audioPresent: encoded.claims.audio.present,
        preserved: compose.clip.originalPixelsPreservedWhereUnauthorized,
        sam3: compose.sam3.source,
        sha256,
        byteLength: mp4Bytes.length,
        videoQaVerdict: videoQa.verdict,
        videoQaBlocking: videoQa.blockingArtifactProducer,
        liveExportCleared: catalogId === "canonical-ysl-ice-on",
      },
      null,
      2,
    ),
  );
}

function main(): void {
  const catalogId = parseCatalog(process.argv.slice(2));
  const layout = playableArtifactLayoutForCatalog(catalogId);
  writeArtifact(catalogId, layout);
}

main();
