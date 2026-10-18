import { describe, expect, it } from "vitest";
import { referenceTranscodeArgs, transcodeDropsAudio } from "./referenceTranscode";

describe("a reference transcode keeps the camera audio", () => {
  it("encodes AAC and does not pass -an", () => {
    const args = referenceTranscodeArgs({
      inputPath: "IMG_5508.mov",
      outputPath: "hero_clip_hd.mp4",
    });
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(transcodeDropsAudio(args)).toBe(false);
  });
});
