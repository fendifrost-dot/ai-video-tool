import { describe, expect, it } from "vitest";
import { isFalQueueUrl } from "./falQueueUrl";

describe("isFalQueueUrl", () => {
  it("accepts Fal's own status and response links", () => {
    expect(
      isFalQueueUrl("https://queue.fal.run/veed/video-background-removal/requests/abc-123/status"),
    ).toBe(true);
    expect(
      isFalQueueUrl("https://queue.fal.run/veed/video-background-removal/requests/abc-123"),
    ).toBe(true);
    expect(
      isFalQueueUrl("https://queue.fal.run/fal-ai/ffmpeg-api/compose/requests/0a1b2c/status/"),
    ).toBe(true);
  });

  it("refuses anything that would send the key elsewhere", () => {
    expect(isFalQueueUrl("https://attacker.example/x")).toBe(false);
    expect(isFalQueueUrl("http://queue.fal.run/m/requests/id/status")).toBe(false);
    expect(isFalQueueUrl("https://queue.fal.run.evil.example/m/requests/id/status")).toBe(false);
    expect(isFalQueueUrl("https://evil.example/queue.fal.run/m/requests/id/status")).toBe(false);
    expect(isFalQueueUrl("https://user:pw@queue.fal.run/m/requests/id/status")).toBe(false);
    expect(isFalQueueUrl("https://queue.fal.run:8443/m/requests/id/status")).toBe(false);
    expect(isFalQueueUrl("https://queue.fal.run/m/requests/id/status?x=1#f")).toBe(true); // query and fragment are not the path
    expect(isFalQueueUrl("https://queue.fal.run/m/requests/../../status")).toBe(false);
    expect(isFalQueueUrl("https://queue.fal.run/m/status")).toBe(false);
    expect(isFalQueueUrl("https://queue.fal.run/")).toBe(false);
    expect(isFalQueueUrl("")).toBe(false);
    expect(isFalQueueUrl(null)).toBe(false);
    expect(isFalQueueUrl(42)).toBe(false);
    expect(isFalQueueUrl(`https://queue.fal.run/m/requests/${"a".repeat(3000)}`)).toBe(false);
  });
});
