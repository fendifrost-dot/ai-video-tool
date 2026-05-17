/**
 * Provider proxy integration tests.
 *
 * Tests the AVT-side proxy call shape, provider_jobs bookkeeping, and the
 * download/upload/asset-row creation pipeline. No real Supabase, no real
 * network — supabase + signed-URL + fetch are all mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() is hoisted above all imports, so any state we need to share with
// the mock factory must come through vi.hoisted().
const mocks = vi.hoisted(() => {
  type AnyRecord = Record<string, unknown>;
  type MockTable = {
    inserts: AnyRecord[];
    updates: AnyRecord[];
    insertResult: AnyRecord | null;
    selectResult: AnyRecord | null;
  };
  const tables: Record<string, MockTable> = {};
  function getTable(name: string): MockTable {
    if (!tables[name]) {
      tables[name] = { inserts: [], updates: [], insertResult: null, selectResult: null };
    }
    return tables[name];
  }
  const invokeMock = vi.fn();
  const signedUrlMock = vi.fn(async () => "https://signed.example/ref.png");
  return { tables, getTable, invokeMock, signedUrlMock };
});

vi.mock("@/lib/supabase", () => {
  const builder = (tableName: string) => {
    const tbl = mocks.getTable(tableName);
    return {
      insert: (payload: Record<string, unknown>) => {
        tbl.inserts.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: tbl.insertResult, error: null }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        tbl.updates.push(payload);
        return {
          eq: () => Promise.resolve({ data: null, error: null }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tbl.selectResult, error: null }),
          single: async () => ({ data: tbl.selectResult, error: null }),
        }),
      }),
    };
  };
  return {
    supabase: {
      from: builder,
      auth: {
        getUser: async () => ({ data: { user: { id: "user-uuid" } }, error: null }),
        getSession: async () => ({
          data: { session: { access_token: "session-token" } },
          error: null,
        }),
      },
      functions: { invoke: mocks.invokeMock },
    },
  };
});

vi.mock("@/lib/storage", () => ({
  signedUrl: mocks.signedUrlMock,
}));

vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

// Import AFTER the vi.mock declarations so the module under test sees mocks.
import {
  createGenerationJob,
  pollJobStatus,
  fetchAndIngestResult,
  ProviderCallError,
} from "./api";

beforeEach(() => {
  for (const k of Object.keys(mocks.tables)) delete mocks.tables[k];
  mocks.invokeMock.mockReset();
  mocks.signedUrlMock.mockClear();
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockReset();
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response("{}", { status: 200 }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createGenerationJob", () => {
  it("creates a provider_jobs row in queued state then posts to CC and writes back the upstream id", async () => {
    mocks.getTable("provider_jobs").insertResult = { id: "row-1" };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        jobId: "cc-job-1",
        providerJobId: "upstream-abc",
        status: "queued",
        resultUrl: null,
        costEstimateCents: 25,
        costFinalCents: null,
        provider: "runway",
        modelVariant: "gen3a_turbo",
        providerMetadata: {},
      },
      error: null,
    });

    const result = await createGenerationJob({
      provider: "runway",
      projectId: "proj-1",
      promptId: "prompt-1",
      shotId: "shot-1",
      promptText: "cinematic shot of a glass tower",
      referenceImagePath: "artist-1/face.png",
      modelVariant: "gen3a_turbo",
      duration: 5,
      aspectRatio: "16:9",
    });

    const inserts = mocks.getTable("provider_jobs").inserts;
    expect(inserts).toHaveLength(1);
    expect(inserts[0].user_id).toBe("user-uuid");
    expect(inserts[0].project_id).toBe("proj-1");
    expect(inserts[0].status).toBe("queued");
    const payload = inserts[0].request_payload_json as Record<string, unknown>;
    expect(payload.promptText).toContain("glass tower");
    expect(payload.referenceImagePath).toBe("artist-1/face.png");
    expect(payload.shotId).toBe("shot-1");

    expect(mocks.signedUrlMock).toHaveBeenCalledWith("artist-assets", "artist-1/face.png", 3600);

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "proxy-provider-call",
      expect.objectContaining({
        body: expect.objectContaining({
          endpoint: "video-providers-runway-generate",
          method: "POST",
          body: expect.objectContaining({
            avt_project_id: "proj-1",
            avt_prompt_id: "prompt-1",
            avt_shot_id: "shot-1",
            promptText: expect.stringContaining("glass tower"),
            referenceImageUrl: "https://signed.example/ref.png",
            modelVariant: "gen3a_turbo",
            duration: 5,
          }),
        }),
      }),
    );

    const updates = mocks.getTable("provider_jobs").updates;
    expect(updates).toHaveLength(1);
    expect(updates[0].external_job_id).toBe("upstream-abc");
    expect(updates[0].status).toBe("queued");

    expect(result.providerJobRowId).toBe("row-1");
    expect(result.envelope.providerJobId).toBe("upstream-abc");
  });

  it("marks the provider_jobs row failed when CC returns an error envelope", async () => {
    mocks.getTable("provider_jobs").insertResult = { id: "row-2" };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: false,
        errorCode: "PROVIDER_KEY_NOT_CONFIGURED",
        errorMessage: "RUNWAY_API_KEY not set",
      },
      error: null,
    });

    await expect(
      createGenerationJob({
        provider: "runway",
        projectId: "proj-1",
        promptText: "scene one",
      }),
    ).rejects.toBeInstanceOf(ProviderCallError);

    const updates = mocks.getTable("provider_jobs").updates;
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("failed");
    expect(String(updates[0].error_text)).toContain("PROVIDER_KEY_NOT_CONFIGURED");
  });

  it("rejects providers that have no Control Center proxy mapping", async () => {
    await expect(
      createGenerationJob({
        provider: "manual",
        projectId: "proj-1",
        promptText: "test",
      }),
    ).rejects.toThrow(/not supported/i);
    expect(mocks.getTable("provider_jobs").inserts).toHaveLength(0);
  });

  it("preserves continuity rules and locked-reference in the outbound payload (image_to_video)", async () => {
    mocks.getTable("provider_jobs").insertResult = { id: "row-3" };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        providerJobId: "x",
        status: "queued",
        resultUrl: null,
        costEstimateCents: 0,
        costFinalCents: null,
        provider: "runway",
        modelVariant: "gen3a_turbo",
        providerMetadata: {},
      },
      error: null,
    });

    await createGenerationJob({
      provider: "runway",
      projectId: "p1",
      promptText:
        "cinematic shot, character standing on rooftop, neon rim light, do not change face",
      referenceImagePath: "artist-1/locked.png",
      mode: "image_to_video",
      modelVariant: "gen3a_turbo",
    });

    const callBody = mocks.invokeMock.mock.calls[0][1].body.body as Record<string, unknown>;
    expect(callBody.promptText).toMatch(/do not change face/);
    expect(callBody.referenceImageUrl).toBe("https://signed.example/ref.png");
    expect(callBody.mode).toBe("image_to_video");
  });
});

describe("pollJobStatus", () => {
  it("queries the right CC endpoint with provider+id and updates local row when status changes", async () => {
    mocks.getTable("provider_jobs").selectResult = {
      id: "row-9",
      provider: "runway",
      external_job_id: "upstream-9",
      status: "queued",
      request_payload_json: { modelVariant: "gen3a_turbo" },
    };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        providerJobId: "upstream-9",
        status: "running",
        provider: "runway",
        modelVariant: "gen3a_turbo",
        resultUrl: null,
        costEstimateCents: 25,
        costFinalCents: null,
        providerMetadata: {},
      },
      error: null,
    });

    const envelope = await pollJobStatus("row-9");

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "proxy-provider-call",
      expect.objectContaining({
        body: expect.objectContaining({
          endpoint: "video-providers-job-status",
          method: "GET",
          query: { provider: "runway", id: "upstream-9" },
        }),
      }),
    );
    expect(envelope.status).toBe("running");

    const updates = mocks.getTable("provider_jobs").updates;
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("running");
  });

  it("includes modelPath query param for fal jobs (model-scoped polling)", async () => {
    mocks.getTable("provider_jobs").selectResult = {
      id: "row-fal",
      provider: "fal",
      external_job_id: "fal-job-1",
      status: "running",
      request_payload_json: { modelVariant: "fal-ai/mochi-v1" },
    };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        providerJobId: "fal-job-1",
        status: "running",
        provider: "fal",
        modelVariant: "fal-ai/mochi-v1",
        resultUrl: null,
        costEstimateCents: 20,
        costFinalCents: null,
        providerMetadata: {},
      },
      error: null,
    });

    await pollJobStatus("row-fal");

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "proxy-provider-call",
      expect.objectContaining({
        body: expect.objectContaining({
          query: { provider: "fal", id: "fal-job-1", modelPath: "fal-ai/mochi-v1" },
        }),
      }),
    );
  });

  it("does NOT update the row when status is unchanged", async () => {
    mocks.getTable("provider_jobs").selectResult = {
      id: "row-stable",
      provider: "runway",
      external_job_id: "upstream-stable",
      status: "running",
      request_payload_json: {},
    };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        providerJobId: "upstream-stable",
        status: "running",
        provider: "runway",
        modelVariant: "gen3a_turbo",
        resultUrl: null,
        costEstimateCents: 25,
        costFinalCents: null,
        providerMetadata: {},
      },
      error: null,
    });

    await pollJobStatus("row-stable");
    expect(mocks.getTable("provider_jobs").updates).toHaveLength(0);
  });
});

describe("fetchAndIngestResult", () => {
  it("downloads bytes inline, re-uploads via upload-asset, and creates a project_assets row linked to the shot", async () => {
    mocks.getTable("provider_jobs").selectResult = {
      id: "row-done",
      user_id: "user-uuid",
      project_id: "proj-1",
      prompt_id: "prompt-1",
      provider: "runway",
      external_job_id: "upstream-done",
      result_asset_id: null,
      request_payload_json: { modelVariant: "gen3a_turbo", shotId: "shot-7" },
    };
    mocks.getTable("project_assets").insertResult = { id: "asset-1" };

    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        contentType: "video/mp4",
        bytes_base64: btoa("fake-mp4-bytes"),
        sizeBytes: 13,
      },
      error: null,
    });
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );

    const assetId = await fetchAndIngestResult("row-done");

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "proxy-provider-call",
      expect.objectContaining({
        body: expect.objectContaining({
          endpoint: "video-providers-job-result",
          method: "GET",
          query: expect.objectContaining({
            provider: "runway",
            id: "upstream-done",
            inline: "1",
          }),
        }),
      }),
    );

    const fetchCall = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const init = fetchCall[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Bucket"]).toBe("project-clips");
    expect((init.headers as Record<string, string>)["X-Path"]).toContain(
      "user-uuid/proj-1/row-done/",
    );
    expect(init.body).toBeInstanceOf(Uint8Array);

    const inserts = mocks.getTable("project_assets").inserts;
    expect(inserts).toHaveLength(1);
    expect(inserts[0].project_id).toBe("proj-1");
    expect(inserts[0].shot_id).toBe("shot-7");
    expect(inserts[0].source_tool).toBe("runway");
    expect(inserts[0].asset_type).toBe("generated_clip");
    expect(inserts[0].approval_status).toBe("pending");

    const updates = mocks.getTable("provider_jobs").updates;
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate.result_asset_id).toBe("asset-1");

    expect(assetId).toBe("asset-1");
  });

  it("returns the existing asset id when result_asset_id is already set (idempotent)", async () => {
    mocks.getTable("provider_jobs").selectResult = {
      id: "row-already",
      user_id: "u",
      project_id: "p",
      prompt_id: null,
      provider: "runway",
      external_job_id: "upstream",
      result_asset_id: "asset-existing",
      request_payload_json: {},
    };

    const out = await fetchAndIngestResult("row-already");
    expect(out).toBe("asset-existing");
    expect(mocks.invokeMock).not.toHaveBeenCalled();
  });
});

describe("ProviderCallError", () => {
  it("carries errorCode and retryable from CC envelope", async () => {
    mocks.getTable("provider_jobs").insertResult = { id: "row-z" };
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: false,
        errorCode: "RATE_LIMITED",
        errorMessage: "Slow down",
        retryable: true,
        providerStatus: 429,
      },
      error: null,
    });

    try {
      await createGenerationJob({
        provider: "runway",
        projectId: "p1",
        promptText: "x",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderCallError);
      const err = e as ProviderCallError;
      expect(err.errorCode).toBe("RATE_LIMITED");
      expect(err.retryable).toBe(true);
      expect(err.providerStatus).toBe(429);
    }
  });
});

// Add the new export aliases under test. Imported lazily to keep the existing
// import block stable for legacy tests above.
import { triggerServerIngest, triggerServerIngestBackfill } from "./api";

describe("triggerServerIngest", () => {
  it("invokes the ingest-provider-job edge function with the jobId and returns the result envelope", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        examined: 1,
        ingested: [{ jobId: "row-1", assetId: "asset-1", sizeBytes: 12345 }],
        errors: [],
      },
      error: null,
    });

    const result = await triggerServerIngest("row-1");

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "ingest-provider-job",
      expect.objectContaining({
        body: { jobId: "row-1" },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.ingested[0].assetId).toBe("asset-1");
    expect(result.errors).toHaveLength(0);
  });

  it("throws ProviderCallError when the edge function returns ok=false", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: "boom" },
      error: null,
    });

    try {
      await triggerServerIngest("row-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderCallError);
      expect((e as ProviderCallError).message).toContain("boom");
    }
  });

  it("throws when supabase.functions.invoke errors at the transport layer", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "network down" },
    });
    try {
      await triggerServerIngest("row-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderCallError);
      expect((e as ProviderCallError).message).toContain("network down");
    }
  });
});

describe("triggerServerIngestBackfill", () => {
  it("invokes the backfill mode with all=true and the configured limit", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        examined: 3,
        ingested: [
          { jobId: "j1", assetId: "a1", sizeBytes: 1 },
          { jobId: "j2", assetId: "a2", sizeBytes: 2 },
        ],
        errors: [{ jobId: "j3", error: "upstream 404" }],
      },
      error: null,
    });

    const result = await triggerServerIngestBackfill({ limit: 17 });

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "ingest-provider-job",
      expect.objectContaining({
        body: { all: true, limit: 17 },
      }),
    );
    expect(result.examined).toBe(3);
    expect(result.ingested).toHaveLength(2);
    expect(result.errors[0].jobId).toBe("j3");
  });

  it("defaults limit to 50 when not provided", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      data: { ok: true, examined: 0, ingested: [], errors: [] },
      error: null,
    });
    await triggerServerIngestBackfill();
    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "ingest-provider-job",
      expect.objectContaining({ body: { all: true, limit: 50 } }),
    );
  });
});
