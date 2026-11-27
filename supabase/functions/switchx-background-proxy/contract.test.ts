import { describe, expect, it } from "vitest";
import {
  SWITCHX_BG_PROVIDER,
  SWITCHX_BG_VENDOR,
  SWITCHX_KEEP_LANE,
  SWITCHX_KEEP_MODE,
  beebleEstimateUsd,
  ccRanKeepMask,
  isBeebleAnswerUrl,
  isSwitchxLane,
  defaultBackgroundPrompt,
  keepMaskPrompt,
  normalizePrompt,
  readBeebleStatus,
  readDryRun,
  recordedGenerationMetadata,
  switchxBackgroundRequest,
  switchxFrames,
  switchxFramesOf,
  switchxKeepMaskCheck,
  withoutLinks,
  switchxKeepMaskRequest,
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
      alphaUrl: null,
      frames: 119,
      resolution: "720p",
      error: null,
      status: "completed",
    });
    // Beeble's real shape (job swx_iIawxiSLvr3mUhQQFqxHN, 16 Oct 2026): the links under `output`, an alpha beside the render
    expect(
      readBeebleStatus({ status: "completed", progress: 100, output: { render: "https://cdn.beeble.ai/switchx/u/j/output/render.mp4?x=1", source: "https://cdn.beeble.ai/s.mp4", alpha: "https://cdn.beeble.ai/switchx/u/j/output/alpha.mp4?x=1" } }),
    ).toMatchObject({ state: "succeeded", renderUrl: "https://cdn.beeble.ai/switchx/u/j/output/render.mp4?x=1", alphaUrl: "https://cdn.beeble.ai/switchx/u/j/output/alpha.mp4?x=1", frames: null });
    expect(readBeebleStatus({ status: "completed", output: { render: "https://cdn.beeble.ai/r.mp4", alpha: "https://evil.example/a.mp4" } })).toMatchObject({ state: "succeeded", alphaUrl: null });
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

describe("the SwitchX keep-mask pass", () => {
  it("is a queued custom pass: the take, the caller's matte, the words as given, the reference picture", () => {
    const r = switchxKeepMaskRequest({ sourceVideoUrl: "https://s/take.mp4", alphaUrl: "https://s/matte.mp4", referenceImageUrl: "https://s/shirt.png", prompt: "P" });
    expect(r).toEqual({ sourceVideoUrl: "https://s/take.mp4", prompt: "P", mode: "custom", alphaUrl: "https://s/matte.mp4", referenceImageUrl: "https://s/shirt.png", queue_only: true });
    expect(SWITCHX_KEEP_MODE).toBe("custom");
    // the background pass is unchanged and carries no matte
    expect(switchxBackgroundRequest({ sourceVideoUrl: "https://s/take.mp4", referenceImageUrl: null, prompt: "P" })).not.toHaveProperty("alphaUrl");
  });

  it("answers status for both lanes and no other", () => {
    expect(isSwitchxLane("switchx_background")).toBe(true);
    expect(isSwitchxLane(SWITCHX_KEEP_LANE)).toBe(true);
    expect(isSwitchxLane("dress_clip")).toBe(false);
    expect(isSwitchxLane(undefined)).toBe(false);
  });

  it("refuses a matte that cannot pair with the take frame by frame: measured frames, never seconds", () => {
    const take = { frames: 119, fps: 30, width: 1920, height: 1080 };
    const ok = { source: take, mask: { ...take }, maskIsVideo: true, sameAsset: false };
    expect(switchxKeepMaskCheck(ok)).toEqual({ ok: true });
    // a matte at another size of the same shape pairs; one frame off does not
    expect(switchxKeepMaskCheck({ ...ok, mask: { frames: 119, fps: 30, width: 1280, height: 720 } })).toEqual({ ok: true });
    expect(switchxKeepMaskCheck({ ...ok, mask: { ...take, frames: 120 } })).toMatchObject({ ok: false, why: expect.stringMatching(/120 frames and the take 119/) });
    expect(switchxKeepMaskCheck({ ...ok, mask: { ...take, fps: 24 } })).toMatchObject({ ok: false, why: expect.stringMatching(/24 fps/) });
    expect(switchxKeepMaskCheck({ ...ok, mask: { ...take, width: 1080, height: 1080 } })).toMatchObject({ ok: false, why: expect.stringMatching(/picture shape/) });
    // fails closed without a measured count on either record
    expect(switchxKeepMaskCheck({ ...ok, mask: { ...take, frames: null } })).toMatchObject({ ok: false, why: expect.stringMatching(/matte has no measured frame count/) });
    expect(switchxKeepMaskCheck({ ...ok, source: { ...take, frames: null } })).toMatchObject({ ok: false, why: expect.stringMatching(/take has no measured frame count/) });
    expect(switchxKeepMaskCheck({ ...ok, maskIsVideo: false })).toMatchObject({ ok: false, why: expect.stringMatching(/must be a video/) });
    expect(switchxKeepMaskCheck({ ...ok, sameAsset: true })).toMatchObject({ ok: false, why: expect.stringMatching(/the take itself/) });
  });

  it("counts Beeble's frames from the measured count, then the measured rate, then the declared one", () => {
    expect(switchxFramesOf({ frames: 119, fps: 30, width: null, height: null }, 3.9667, null)).toBe(119);
    expect(switchxFramesOf({ frames: null, fps: 30, width: null, height: null }, 3.9667, 24)).toBe(120);
    expect(switchxFramesOf({ frames: null, fps: null, width: null, height: null }, 4.0, null)).toBe(96);
  });

  it("takes a dry run in either spelling and refuses a flag that is not a boolean", () => {
    expect(readDryRun({})).toEqual({ ok: true, dryRun: false });
    expect(readDryRun({ dryRun: true })).toEqual({ ok: true, dryRun: true });
    expect(readDryRun({ dry_run: true })).toEqual({ ok: true, dryRun: true });
    expect(readDryRun({ dryRun: false, dry_run: true })).toEqual({ ok: true, dryRun: true });
    for (const bad of ["true", 1, null, "yes"]) expect(readDryRun({ dry_run: bad }), String(bad)).toEqual({ ok: false });
    expect(readDryRun({ dryRun: "false" })).toEqual({ ok: false });
  });

  it("tells a keep-mask job from the background job an older Control Center would queue instead", () => {
    expect(ccRanKeepMask({ mode: "custom", beeble_alpha_mode: "custom", alpha_url: "https://s/matte.mp4?token=t" })).toBe(true);
    expect(ccRanKeepMask({ mode: "background", beeble_alpha_mode: "auto", alpha_url: null })).toBe(false);
    expect(ccRanKeepMask({ beeble_alpha_mode: "custom", alpha_url: null })).toBe(false);
    expect(ccRanKeepMask(null)).toBe(false);
  });

  it("keeps no link in the record or in an upstream error", () => {
    const g = recordedGenerationMetadata({
      mode: "custom",
      beeble_alpha_mode: "custom",
      alpha_generated: false,
      polarity_override: "auto",
      source_video_url: "https://x.supabase.co/storage/v1/object/sign/project-clips/u/take.mp4?token=SECRET",
      alpha_url: "https://x.supabase.co/storage/v1/object/sign/project-clips/u/matte.mp4?token=SECRET",
      prompt: "P",
    });
    expect(g).toEqual({ mode: "custom", beeble_alpha_mode: "custom", alpha_generated: false, polarity_override: "auto" });
    expect(JSON.stringify(g)).not.toMatch(/SECRET|https?:/);
    expect(recordedGenerationMetadata(undefined)).toBeNull();
    const e = withoutLinks('beeble_submit_422: could not fetch "https://x.supabase.co/storage/v1/object/sign/p/u/take.mp4?token=SECRET" (token=SECRET2)');
    expect(e).not.toMatch(/SECRET|https?:/);
    expect(e).toContain("beeble_submit_422");
  });

  it("has no default words: the caller says what is generated, on one bounded line", () => {
    expect(keepMaskPrompt(undefined)).toMatchObject({ ok: false });
    expect(keepMaskPrompt("   ")).toMatchObject({ ok: false, why: expect.stringMatching(/needs the words/) });
    expect(keepMaskPrompt(" a short-sleeved\n polo  shirt ")).toEqual({ ok: true, prompt: "a short-sleeved polo shirt" });
    // Control Center refuses under four characters, after our record is written: refused here first
    expect(keepMaskPrompt("tee")).toMatchObject({ ok: false });
    expect(keepMaskPrompt("polo")).toEqual({ ok: true, prompt: "polo" });
    const long = keepMaskPrompt("x".repeat(5000));
    expect(long.ok && long.prompt.length).toBe(1500);
  });

  it("names the pass in the estimate, at the same list rate", () => {
    const e = beebleEstimateUsd(119, "720p", "keep-mask");
    expect(e.text).toContain("SwitchX keep-mask at 720p");
    expect(e.usd).toBeCloseTo(beebleEstimateUsd(119).usd, 6);
    expect(beebleEstimateUsd(119).text).toContain("SwitchX background at 720p");
  });
});
