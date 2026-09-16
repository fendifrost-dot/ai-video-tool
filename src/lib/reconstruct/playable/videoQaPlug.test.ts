import { describe, expect, it } from "vitest";
import { VIDEO_QA_SPEC_VERSION } from "@/lib/eval";
import { runPlayableCompose } from "./compose";
import { heroFramePlayableSpec } from "./spec";
import {
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_VIDEO_QA_ARTIFACT_ID,
  evaluatePlayableVideoQa,
  evaluatePlayableVideoQaFromE2e,
  persistPlayableVideoQaJson,
  playableComposeToReconstructE2e,
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
});
