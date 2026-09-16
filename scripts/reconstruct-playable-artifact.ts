/**
 * Lane H — produce the playable Architecture C reconstructed MP4 artifact.
 *
 * $0 / paidCalls=false / grokPerFrame=false / no SAM-3 fetch.
 * Usage: npx tsx scripts/reconstruct-playable-artifact.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlayableCompose } from "../src/lib/reconstruct/playable/compose";
import { canonicalPlayableSpec } from "../src/lib/reconstruct/playable/spec";
import { encodePlayableMp4 } from "../src/lib/reconstruct/playable/encodeMp4";
import {
  buildPlayableArtifactClaims,
  buildPlayableE2Hook,
  playableE2HookToJson,
} from "../src/lib/reconstruct/playable/e2Hook";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs/reconstruct/artifacts/playable-76fe7438");

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const spec = canonicalPlayableSpec();
  const compose = runPlayableCompose({ explicitArm: true, spec });
  if (!compose.ok) {
    throw new Error(`compose_failed:${compose.code}:${compose.message}`);
  }

  const encoded = encodePlayableMp4({
    frames: compose.clip.frames.map((fr) => ({ index: fr.index, image: fr.result.image })),
    fps: compose.fps,
    outPath: join(OUT_DIR, "reconstructed.mp4"),
    workDir: join(OUT_DIR, ".ppm"),
  });
  if (!encoded.ok) {
    throw new Error(`encode_failed:${encoded.message}`);
  }

  const claims = buildPlayableArtifactClaims(compose, encoded.claims);
  const hook = buildPlayableE2Hook(claims, {
    mp4RelativePath: "docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4",
    claimsRelativePath: "docs/reconstruct/artifacts/playable-76fe7438/claims.json",
    hookRelativePath: "docs/reconstruct/artifacts/playable-76fe7438/e2-hook.json",
  });

  const mp4Bytes = readFileSync(join(OUT_DIR, "reconstructed.mp4"));
  const sha256 = createHash("sha256").update(mp4Bytes).digest("hex");

  const provenance = {
    playableVersion: compose.playableVersion,
    issue: 111,
    parent: 102,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    masterClipAssetId: spec.masterClipAssetId,
    stillAssetId: spec.stillAssetId,
    projectId: spec.projectId,
    garmentId: spec.garmentId,
    mediaKind: compose.mediaKind,
    sha256,
    mp4Bytes: mp4Bytes.length,
    claims,
    sam3: compose.sam3,
    composeSelfCheck: hook.composeSelfCheck,
  };

  writeFileSync(join(OUT_DIR, "claims.json"), `${JSON.stringify(claims, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, "e2-hook.json"),
    `${JSON.stringify(playableE2HookToJson(hook), null, 2)}\n`,
  );
  writeFileSync(join(OUT_DIR, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mp4: "docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4",
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
      },
      null,
      2,
    ),
  );
}

main();
