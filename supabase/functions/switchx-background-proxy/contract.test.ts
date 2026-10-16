import { describe, expect, it } from "vitest";
import {
  SWITCHX_BG_PROVIDER,
  SWITCHX_BG_VENDOR,
  beebleEstimateUsd,
  isBeebleAnswerUrl,
  defaultBackgroundPrompt,
  normalizePrompt,
  readBeebleStatus,
  switchxBackgroundRequest,
  switchxFrames,
  switchxSourceCheck,
} from "./contract.ts";

describe("the SwitchX background request", () => {
  it("files the row under a value the provider enum has, naming the vendor beside it", () => {
    // provider_jobs.provider is the provider_name enum: runway, veo, gemini, grok, higgsfield, pika, fal, openai, firefly, frame_io, manual, other
    expect(["runway", "veo", "gemini", "grok", "higgsfield", "pika", "fal", "openai", "firefly", "frame_io", "manual", "other"]).toContain(SWITCHX_BG_PROVIDER);
    expect(SWITCHX_BG_VENDOR).toBe("beeble");
  });

  it("prices Beeble's 720p list rate per 30 frames, exact and at whole blocks", () => {
    const e = beebleEstimateUsd(113);
    expect(e.usd).toBeCloseTo(0.377, 3);
    expect(e.upper).toBeCloseTo(0.4, 3);
    expect(e.text).toContain("113 frames at $0.1 per 30");
    expect(beebleEstimateUsd(89, "1080p").usd).toBeCloseTo(0.89, 3);
  });

  it("counts frames from the length and refuses what Beeble will not take", () => {
    expect(switchxFrames(4.955, 24)).toBe(119);
    expect(switchxFrames(4.003866, null)).toBe(97);
    expect(switchxSourceCheck({ seconds: 4.96, isVideo: true })).toEqual({ ok: true });
    expect(switchxSourceCheck({ seconds: 9, isVideo: true })).toMatchObject({ ok: false, why: expect.stringMatching(/at most 8 s/) });
    expect(switchxSourceCheck({ seconds: null, isVideo: true })).toMatchObject({ ok: false });
    expect(switchxSourceCheck({ seconds: 4, isVideo: false })).toMatchObject({ ok: false, why: expect.stringMatching(/video/) });
  });

  it("is a queued background pass with the place as the reference, and a bounded prompt", () => {
    const r = switchxBackgroundRequest({ sourceVideoUrl: "https://s/take.mp4", referenceImageUrl: "https://s/plate.png", prompt: "P" });
    expect(r).toEqual({ sourceVideoUrl: "https://s/take.mp4", prompt: "P", mode: "background", referenceImageUrl: "https://s/plate.png", queue_only: true });
    expect(normalizePrompt("  two   lines\n here ", null)).toBe("two lines here");
    expect(normalizePrompt("", "Chicago, the switch")).toBe(defaultBackgroundPrompt("Chicago, the switch"));
    expect(normalizePrompt("x".repeat(5000), null).length).toBe(1500);
    expect(defaultBackgroundPrompt("Chicago, the switch")).toContain("standing in Chicago, the switch");
  });

  it("reads Beeble's status: running, done with a render, failed, and done without a link", () => {
    expect(readBeebleStatus({ status: "processing" })).toMatchObject({ state: "running", renderUrl: null });
    expect(readBeebleStatus({ status: "completed", result: { render: "https://cdn.beeble.ai/r.mp4", frames_processed: 119, resolution: "720p" } })).toEqual({
      state: "succeeded",
      renderUrl: "https://cdn.beeble.ai/r.mp4",
      frames: 119,
      resolution: "720p",
      error: null,
      status: "completed",
    });
    expect(readBeebleStatus({ status: "failed", error: { message: "bad input" } })).toMatchObject({ state: "failed", error: "bad input" });
    expect(readBeebleStatus({ status: "completed" })).toMatchObject({ state: "failed", error: expect.stringMatching(/without a render/) });
    expect(readBeebleStatus({ status: "completed", result: { render: "http://plain/r.mp4" } })).toMatchObject({ state: "failed" });
    expect(readBeebleStatus(null)).toMatchObject({ state: "running" });
    // CC's own terminal words, and a render on a host Beeble does not serve from
    expect(readBeebleStatus({ status: "errored", error: { message: "x" } })).toMatchObject({ state: "failed", error: "x" });
    expect(readBeebleStatus({ status: "complete", result: { render: "https://x.cloudfront.net/r.mp4" } })).toMatchObject({ state: "succeeded" });
    expect(readBeebleStatus({ status: "complete", result: { render: "https://evil.example/r.mp4" } })).toMatchObject({ state: "failed", error: expect.stringMatching(/unexpected host \(evil\.example\)/) });
    expect(isBeebleAnswerUrl("https://cdn.beeble.ai/a.mp4")).toBe(true);
    expect(isBeebleAnswerUrl("https://bucket.s3.amazonaws.com/a.mp4")).toBe(true);
    expect(isBeebleAnswerUrl("https://beeble.ai.evil.example/a.mp4")).toBe(false);
    expect(isBeebleAnswerUrl("https://cdn.beeble.ai/" + "x".repeat(2100))).toBe(false);
  });
});
