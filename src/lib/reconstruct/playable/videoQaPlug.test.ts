import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { VIDEO_QA_SPEC_VERSION } from "@/lib/eval";
import { happyPathFrames } from "@/lib/eval/videoQaFixtures";
import { runPlayableCompose } from "./compose";
import { heroFramePlayableSpec } from "./spec";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_MP4_SHA256,
  PLAYABLE_VIDEO_QA_ARTIFACT_ID,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
  evaluatePlayableVideoQaFromE2e,
  persistPlayableVideoQaJson,
  playableComposeToReconstructE2e,
  playableDecodedToVideoQaFrames,
  playableMp4Ref,
} from "./videoQaPlug";

describe("playable E2 video QA plug-in", () => {
  it("maps compose → ReconstructE2eOk and scores via the E2 contract", () => {
    const compose = runPlayableCompose({
      explicitArm: true,
      spec: heroFramePlayableSpec({ frameCount: 4, keyframeIndex: 1 }),
    });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;

    const e2e = playableComposeToReconstructE2e(compose);
    expect(e2e.ok).toBe(true);
    expect(e2e.paidCalls).toBe(false);
    expect(e2e.grokPerFrame).toBe(false);
    expect(e2e.sam3LiveFetch).toBe(false);
    expect(e2e.width).toBe(720);
    expect(e2e.height).toBe(1280);
    expect(e2e.frameCount).toBe(4);
    expect(e2e.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);

    const { report, json } = evaluatePlayableVideoQaFromE2e(
      e2e,
      playableMp4Ref({
        produced: true,
        artifactId: PLAYABLE_VIDEO_QA_ARTIFACT_ID,
        path: PLAYABLE_MP4_RELATIVE_PATH,
        sha256: "0".repeat(64),
        byteLength: 32,
      }),
    );

    expect(report.schemaVersion).toBe(VIDEO_QA_SPEC_VERSION);
    expect(report.paidCalls).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.frameCount).toBe(4);
    expect(report.mp4?.produced).toBe(true);
    expect(report.mp4?.mimeType).toBe("video/mp4");
    expect(report.criteria.find((c) => c.id === "paid_calls_false")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
    expect(json.blockingArtifactProducer).toBe(false);
    expect(json.stillGoldensReopened).toBe(false);
    expect(json.paidCalls).toBe(false);
  });

  it("does not FAIL mp4-scored criteria when produced=false (UI window ≠ decoded MP4)", () => {
    const compose = runPlayableCompose({
      explicitArm: true,
      spec: heroFramePlayableSpec({ frameCount: 3, keyframeIndex: 1 }),
    });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;

    const { report } = evaluatePlayableVideoQa({
      compose,
      mp4: playableMp4Ref({ produced: false }),
    });
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.failCount).toBe(0);
    expect(report.awaiting).toContain("mp4");
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.criteria.find((c) => c.id === "temporal_jitter_drift")?.verdict).toBe("SKIP");
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("SKIP");
  });

  it("encode-first with frames:[] is INCOMPLETE and never blocks the producer", () => {
    const compose = runPlayableCompose({
      explicitArm: true,
      spec: heroFramePlayableSpec({ frameCount: 3, keyframeIndex: 1 }),
    });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;

    const { report, json } = evaluatePlayableVideoQa({
      compose,
      mp4: playableMp4Ref({
        produced: true,
        artifactId: PLAYABLE_VIDEO_QA_ARTIFACT_ID,
        path: PLAYABLE_MP4_RELATIVE_PATH,
        byteLength: 16,
      }),
      includeDecodedFrames: false,
    });

    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.awaiting).toContain("decoded_frames");
    expect(report.blockingArtifactProducer).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.frameCount).toBe(0);
    expect(json.awaiting).toContain("decoded_frames");

    const written: Record<string, string> = {};
    persistPlayableVideoQaJson(json, (path, body) => {
      written[path] = body;
    });
    expect(written["docs/reconstruct/artifacts/playable-76fe7438/video-qa.json"]).toContain(
      "lane-e2-video-qa-v1",
    );
  });

  it("pins the committed 72-frame playable MP4 sha256 as the E2 gate artifact", () => {
    const bytes = readFileSync(PLAYABLE_MP4_RELATIVE_PATH);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(sha).toBe(PLAYABLE_MP4_SHA256);
    expect(bytes.byteLength).toBe(PLAYABLE_MP4_BYTE_LENGTH);
    const ref = committedPlayableMp4Ref();
    expect(ref.produced).toBe(true);
    expect(ref.sha256).toBe(PLAYABLE_MP4_SHA256);
    expect(ref.byteLength).toBe(PLAYABLE_MP4_BYTE_LENGTH);
    expect(ref.path).toBe(PLAYABLE_MP4_RELATIVE_PATH);
    expect(ref.artifactId).toBe(PLAYABLE_VIDEO_QA_ARTIFACT_ID);
    expect(ref.mimeType).toBe("video/mp4");
  });

  it("scores injected decoded rasters with frames>0 (no ffmpeg / no WebCodecs)", () => {
    const frames = happyPathFrames(4);
    const { report, json } = evaluatePlayableVideoQa({
      mp4: committedPlayableMp4Ref(),
      decodedFrames: frames,
      includeDecodedFrames: false,
    });
    expect(report.frameCount).toBe(4);
    expect(report.frameCount).toBeGreaterThan(0);
    expect(report.awaiting).not.toContain("decoded_frames");
    expect(report.verdict).toBe("PASS");
    expect(report.failCount).toBe(0);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(report.blockingArtifactProducer).toBe(false);
    expect(json.frameCount).toBe(4);
    expect(json.provenance?.source).toBe("playable_mp4_decode");
  });

  it("does not pair 8-frame compose onto a 4-frame decode (false FAIL 6/9 guard)", () => {
    const compose = runPlayableCompose({
      explicitArm: true,
      spec: heroFramePlayableSpec({ frameCount: 8, keyframeIndex: 2 }),
    });
    expect(compose.ok).toBe(true);
    if (!compose.ok) return;
    const decoded = [
      { index: 0, image: { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) } },
      { index: 1, image: { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) } },
      { index: 2, image: { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) } },
      { index: 3, image: { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) } },
    ];
    const frames = playableDecodedToVideoQaFrames({
      decoded,
      compose,
      pairCompose: true,
    });
    expect(frames).toHaveLength(4);
    expect(frames[0]!.authorizedAlpha).toBeUndefined();
    expect(frames[0]!.original).toBe(decoded[0]!.image);
  });
});
