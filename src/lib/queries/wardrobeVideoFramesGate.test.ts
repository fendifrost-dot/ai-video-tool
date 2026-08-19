/**
 * PROCESSING-COMPATIBILITY GATE — client wiring.
 *
 * The gate exists so an incompatible master (multi-GB 4K HEVC / 10-bit / HDR)
 * fails FAST with the reason, instead of submitting a Fal op that 500s. That
 * only holds if the CLIENT consumes the decision. It previously did not: the
 * extract dispatch response was discarded and "needs_transcode" was neither a
 * terminal-ready nor a "failed" poll state, so the one case the gate exists to
 * catch fell through to the 12-minute poll timeout and surfaced as a bare
 * "extract_status timed out" — the reason the server had already persisted was
 * thrown away.
 *
 * These tests pin BOTH halves of the fix (dispatch short-circuit + terminal poll
 * state) and, critically, that neither path spends time in the poll loop.
 * No real Supabase, no real network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // metadata_json handed back by every project_assets read.
  assetMeta: { extract_status: "processing" } as Record<string, unknown>,
  // Bodies the mocked edge-function fetch returns, in order.
  edgeBodies: [] as Array<Record<string, unknown>>,
  pollReads: 0,
  edgeCalls: [] as Array<{ fn: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            mocks.pollReads += 1;
            return { data: { metadata_json: mocks.assetMeta }, error: null };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed/clip" }, error: null }),
        upload: async () => ({ error: null }),
      }),
    },
  },
}));

vi.mock("@/lib/authSession", () => ({
  getSessionWithTimeout: async () => ({ user: { id: "user-1" } }),
  getAccessTokenWithTimeout: async () => "token-1",
}));

// Decode/upload and Grok helpers are never reached in these tests; stub them so
// the module graph stays light.
vi.mock("@/lib/video/extractFrames", () => ({
  extractFramesFromUrl: async () => ({ frames: [] }),
}));
vi.mock("@/lib/queries/grokImageGarment", () => ({
  applyGrokGarmentTruthAndWait: async () => ({}),
}));

import { runFrameRoundtrip, VideoNeedsProcessingError } from "./wardrobeVideoFrames";

const INPUT = {
  asset: { id: "asset-1", asset_type: "reference_video", file_url: "u/master.mov" },
  targetFps: 8,
  serverExtract: { startSec: 0, durationSec: 4 },
} as Parameters<typeof runFrameRoundtrip>[0];

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  mocks.assetMeta = { extract_status: "processing" };
  mocks.edgeBodies = [];
  mocks.pollReads = 0;
  mocks.edgeCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      mocks.edgeCalls.push({
        fn: String(url).split("/").pop() ?? "",
        payload: JSON.parse(init.body),
      });
      const body = mocks.edgeBodies.shift() ?? { ok: true, status: "processing" };
      return { ok: true, json: async () => body } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("processing-compatibility gate — dispatch short-circuit", () => {
  it("throws VideoNeedsProcessingError from the DISPATCH body, before any polling", async () => {
    mocks.edgeBodies = [
      {
        ok: true,
        status: "needs_transcode",
        needsProcessing: true,
        compatibilityVersion: "cg1",
        compatibilityResult: "incompatible",
        compatibilityReason: "hevc above 1080p; 10-bit; 2.1 GB",
        recommendedAction: "transcode-to-h264-8bit-1080p",
        compatibilityReasons: ["codec_hevc_above_1080p", "bit_depth_10", "filesize_over_1gb"],
      },
    ];

    await expect(runFrameRoundtrip(INPUT)).rejects.toBeInstanceOf(VideoNeedsProcessingError);
    // The whole point: the poll loop is never entered.
    expect(mocks.pollReads).toBe(0);
    // And exactly one edge round-trip happened — no trim was chased.
    expect(mocks.edgeCalls).toHaveLength(1);
  });

  it("carries the compatibility reason + recommended action in the message", async () => {
    mocks.edgeBodies = [
      {
        ok: true,
        status: "needs_transcode",
        compatibilityReason: "hevc above 1080p; 10-bit",
        recommendedAction: "transcode-to-h264-8bit-1080p",
        compatibilityVersion: "cg1",
        compatibilityReasons: ["codec_hevc_above_1080p"],
      },
    ];

    const err = await runFrameRoundtrip(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(VideoNeedsProcessingError);
    expect(err.message).toContain("hevc above 1080p; 10-bit");
    expect(err.message).toContain("transcode-to-h264-8bit-1080p");
    expect(err.compatibilityVersion).toBe("cg1");
    expect(err.compatibilityReasons).toEqual(["codec_hevc_above_1080p"]);
    expect(err.assetId).toBe("asset-1");
  });

  it("falls back to processingReason when the versioned reason is absent", async () => {
    mocks.edgeBodies = [
      { ok: true, status: "needs_transcode", processingReason: "prores is not Fal-decodable" },
    ];
    const err = await runFrameRoundtrip(INPUT).catch((e) => e);
    expect(err.message).toContain("prores is not Fal-decodable");
  });
});

describe("processing-compatibility gate — terminal poll state", () => {
  it("throws from PERSISTED metadata when the gate tripped out-of-band", async () => {
    // Dispatch answers normally (e.g. an earlier run already gated this asset),
    // so only the persisted row carries the decision.
    mocks.edgeBodies = [{ ok: true, status: "processing" }];
    mocks.assetMeta = {
      extract_status: "needs_transcode",
      extract_preflight_compatibility_version: "cg1",
      extract_preflight_compatibility_result: "incompatible",
      extract_preflight_compatibility_reason: "4K HEVC 10-bit HDR master",
      extract_preflight_recommended_action: "transcode-to-h264-8bit-1080p",
      extract_preflight_compatibility_reasons: ["hdr_transfer", "bit_depth_10"],
    };

    const err = await runFrameRoundtrip(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(VideoNeedsProcessingError);
    expect(err.message).toContain("4K HEVC 10-bit HDR master");
    expect(err.message).toContain("transcode-to-h264-8bit-1080p");
    expect(err.compatibilityReasons).toEqual(["hdr_transfer", "bit_depth_10"]);
    // Terminal on the FIRST read — not a 12-minute wait.
    expect(mocks.pollReads).toBe(1);
  });

  it("reads the deprecated *_preflight_reason key when the versioned one is missing", async () => {
    mocks.edgeBodies = [{ ok: true, status: "processing" }];
    mocks.assetMeta = {
      extract_status: "needs_transcode",
      extract_preflight_reason: "legacy reason field",
    };
    const err = await runFrameRoundtrip(INPUT).catch((e) => e);
    expect(err.message).toContain("legacy reason field");
  });

  it("still describes the gate when NO reason was persisted at all", async () => {
    mocks.edgeBodies = [{ ok: true, status: "processing" }];
    mocks.assetMeta = { extract_status: "needs_transcode" };
    const err = await runFrameRoundtrip(INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(VideoNeedsProcessingError);
    expect(err.message).toContain("incompatible");
    // Never the old symptom.
    expect(err.message).not.toContain("timed out");
  });
});
