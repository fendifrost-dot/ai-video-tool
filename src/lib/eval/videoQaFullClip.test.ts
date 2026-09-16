import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESERVATION_FAIL_ESCALATE } from "./videoQaCriteria";
import { evaluateVideoQa } from "./videoQaEvaluator";
import { videoQaReportToJson } from "./videoQaArtifacts";
import { happyPathMp4Input, outsideLeakInput } from "./videoQaFixtures";
import {
  CANONICAL_CLIP_MASTER_ID,
  SECOND_CLIP_MASTER_ID,
  SECOND_CLIP_PROJECT_ID,
  VIDEO_QA_FULLCLIP_FRAMES,
  VIDEO_QA_FULLCLIP_HEIGHT,
  VIDEO_QA_FULLCLIP_MODULE_PATH,
  VIDEO_QA_FULLCLIP_WIDTH,
  VIDEO_QA_REAL_MEDIA_HOOK,
  anonymousClipInput,
  fullClip720FromDecodedFrames,
  fullClip720Input,
  fullClip720LeakInput,
  secondClipFullClipInput,
} from "./fixtures/fullClip720";

describe("Lane E2 full-clip 720×1280 fixture path", () => {
  it("scores a synthetic 720×1280 clip sequence (not still goldens)", () => {
    const input = fullClip720Input();
    expect(input.artifact.width).toBe(VIDEO_QA_FULLCLIP_WIDTH);
    expect(input.artifact.height).toBe(VIDEO_QA_FULLCLIP_HEIGHT);
    expect(input.artifact.frames).toHaveLength(VIDEO_QA_FULLCLIP_FRAMES);
    expect(input.artifact.frames[0]!.original.width).toBe(720);
    expect(input.artifact.frames[0]!.original.height).toBe(1280);
    expect(input.paidCalls).toBe(false);
    const report = evaluateVideoQa(input);
    expect(report.verdict).toBe("PASS");
    expect(report.frameCount).toBe(VIDEO_QA_FULLCLIP_FRAMES);
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(report.escalate).toBeNull();
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(VIDEO_QA_REAL_MEDIA_HOOK.modulePath).toBe(VIDEO_QA_FULLCLIP_MODULE_PATH);
    expect(VIDEO_QA_REAL_MEDIA_HOOK.decodeMp4).toBe(false);
    expect(VIDEO_QA_REAL_MEDIA_HOOK.stillGoldensLocked).toBe(true);
  });

  it("lets H/C2/D2 hang decoded rasters on the same hook without E2 decoding MP4", () => {
    const synthetic = fullClip720Input();
    const hung = fullClip720FromDecodedFrames(
      synthetic.artifact.frames,
      {
        produced: true,
        artifactId: "lane-h-real-media.mp4",
        path: "artifacts/lane-h/reconstructed.mp4",
        mimeType: "video/mp4",
        byteLength: 4096,
      },
      { source: "lane-h-decoded-frames", masterClipAssetId: "hung-clip" },
    );
    const report = evaluateVideoQa(hung);
    expect(report.verdict).toBe("PASS");
    expect(report.mp4?.artifactId).toBe("lane-h-real-media.mp4");
    expect(report.provenance.masterClipAssetId).toBe("hung-clip");
  });
});

describe("Lane E2 second-clip portability", () => {
  it("does not allowlist project or master clip IDs", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/eval/videoQaEvaluator.ts"), "utf8");
    expect(src).not.toContain(CANONICAL_CLIP_MASTER_ID);
    expect(src).not.toContain(SECOND_CLIP_MASTER_ID);
    expect(src).not.toMatch(/CANONICAL_PROJECT_ID|CANONICAL_MASTER_CLIP_ID/);
  });

  it("PASSes an alternate master/project id with the same rasters", () => {
    const a = evaluateVideoQa(fullClip720Input());
    const b = evaluateVideoQa(secondClipFullClipInput());
    expect(b.provenance.projectId).toBe(SECOND_CLIP_PROJECT_ID);
    expect(b.provenance.masterClipAssetId).toBe(SECOND_CLIP_MASTER_ID);
    expect(a.provenance.masterClipAssetId).not.toBe(b.provenance.masterClipAssetId);
    expect(a.verdict).toBe("PASS");
    expect(b.verdict).toBe("PASS");
    expect(a.criteria.map((c) => `${c.id}:${c.verdict}`)).toEqual(
      b.criteria.map((c) => `${c.id}:${c.verdict}`),
    );
  });

  it("PASSes when provenance is omitted entirely", () => {
    const report = evaluateVideoQa(anonymousClipInput());
    expect(report.verdict).toBe("PASS");
    expect(report.provenance).toEqual({});
    expect(report.stillGoldensReopened).toBe(false);
  });
});

describe("Lane E2 preservation FAIL escalation contract", () => {
  it("emits architectural_blocker with stillGoldensReopened false on 16×16 and 720×1280", () => {
    const small = evaluateVideoQa(outsideLeakInput());
    const full = evaluateVideoQa(fullClip720LeakInput());
    const second = evaluateVideoQa(fullClip720LeakInput(secondClipFullClipInput().provenance));
    for (const report of [small, full, second]) {
      expect(report.verdict).toBe("FAIL");
      expect(report.stillGoldensReopened).toBe(false);
      expect(report.escalate).toEqual(PRESERVATION_FAIL_ESCALATE);
      expect(report.escalate?.kind).toBe("architectural_blocker");
      expect(report.escalate?.stillGoldensReopened).toBe(false);
      expect(report.unexplained).toEqual([]);
      expect(report.claudeInvestigates).toBe("unexplained_only");
      const json = videoQaReportToJson(report);
      expect(json.stillGoldensReopened).toBe(false);
      expect(json.escalate).toEqual(PRESERVATION_FAIL_ESCALATE);
    }
    expect(evaluateVideoQa(happyPathMp4Input()).escalate).toBeNull();
  });
});
