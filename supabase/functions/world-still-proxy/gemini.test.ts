import { describe, expect, it, vi } from "vitest";
import { GEMINI_COST_BOUND, GEMINI_MODEL, geminiPlan, geminiStill, unsupportedNanoAlias, validateGeminiRequest } from "./gemini.ts";
import { planStillRequest, REFERENCE_MODELS } from "../_shared/stillReferences.ts";

const user = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const input = { userId: user, projectId: project, jobRowId: jobId, prompt: "Photograph of the same rider", resolution: "2k", aspectRatio: "9:16", maxCostUsd: .15, references: [{ ref: { source: "project_asset" as const, id: jobId, role: "cast", label: "The rider" }, path: `${user}/rider.png`, buckets: ["prop-refs"] }] };
const filed = { path: `${user}/${project}/worlds/portrait.png`, previewUrl: "https://example.invalid/preview?token=private", assetId: jobId, bytes: 13 };
function deps(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = { id: jobId, user_id: user, project_id: project, provider: "gemini", status: "queued", external_job_id: null, finalized_at: null, request_payload_json: { variation_id: "retained", treatmentRevisionId: "retained" }, ...overrides };
  const admin = { from: vi.fn(() => {
    let patch: Record<string, unknown> = {}; const filters: [string, unknown][] = [];
    const execute = () => {
      if (filters.some(([key, value]) => row[key] !== value)) return { data: null, error: null };
      Object.assign(row, patch); return { data: { ...row }, error: null };
    };
    const q = {
      update(p: Record<string, unknown>) { patch = p; return q; },
      eq(k: string, v: unknown) { filters.push([k, v]); return q; },
      is(k: string, v: unknown) { filters.push([k, v]); return q; },
      select() { return q; }, maybeSingle: async () => execute(),
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return Promise.resolve(execute()).then(resolve, reject); },
    };
    return q;
  }) };
  const sign = vi.fn(async () => ({ data: { signedUrl: "https://example.invalid/signed?token=private" }, error: null }));
  const userClient = { storage: { from: vi.fn(() => ({ createSignedUrl: sign })) } };
  const call = vi.fn(async (_config: unknown, _call: { body?: Record<string, unknown> }) => ({ httpStatus: 200, payload: { ok: true, model: GEMINI_MODEL, actualCostUsd: null, usage: { promptTokenCount: 50 }, images: [{ data: "iVBORw0KGgoAAAAAAQ==", mimeType: "image/png" }] } }));
  const file = vi.fn(async (_image: { bytes: Uint8Array; mime: string; extraMeta: Record<string, unknown> }) => filed);
  return { row, sign, admin, userClient, call, file, config: { url: "https://cc.example", key: "shared" } };
}

describe("unit: explicit Gemini still planning", () => {
  it("supports 14 references only when explicitly selected, preserves existing Grok choices", () => {
    expect(unsupportedNanoAlias("gemini_image3.1_flash")).toBe(true);
    expect(unsupportedNanoAlias("nano_banana_2_1")).toBe(true);
    expect(unsupportedNanoAlias(GEMINI_MODEL)).toBe(false);
    expect(geminiPlan(14, "2k", .15)).toMatchObject({ ok: true, model: GEMINI_MODEL, overGate: false, maxReferences: 14 });
    expect(geminiPlan(15, "2k", .15)).toMatchObject({ ok: false, error: "references_over_capability" });
    expect(geminiPlan(1, "2k", .1)).toMatchObject({ ok: true, overGate: true });
    expect(REFERENCE_MODELS.some((m) => m.model === GEMINI_MODEL)).toBe(false);
    expect(planStillRequest({ pictures: 1, n: 1, resolution: "2k", defaultModel: "grok-imagine-image-quality", maxCostUsd: .5, capOf: () => 3, generationRateOf: () => .07 })).toMatchObject({ model: "grok-imagine-image-quality" });
    expect(GEMINI_COST_BOUND).toBeCloseTo(.147456);
  });
  it("requires one candidate, real booleans/numeric cap and a job before spend", () => {
    expect(validateGeminiRequest({ ...input, n: 1 })).toBeNull();
    for (const change of [{ n: 2 }, { jobRowId: undefined }, { maxCostUsd: "1" }, { maxCostUsd: NaN }, { dryRun: "true" }, { aspectRatio: "wrong" }]) expect(validateGeminiRequest({ ...input, ...change })).not.toBeNull();
    expect(validateGeminiRequest({ ...input, jobRowId: undefined, dryRun: true })).toBeNull();
  });
});

describe("mocked integration: Gemini job ownership and result filing", () => {
  it("dry-run probes CC without signing, writing rows or generating", async () => {
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 200, payload: { ok: true, model: GEMINI_MODEL, actualCostUsd: null, credentialsConfigured: true, modelAccessVerified: false } } as never);
    expect(await geminiStill({ ...input, jobRowId: undefined, dryRun: true }, d)).toMatchObject({ ok: true, dryRun: true, referencesSent: 0, referencesChecked: 1, modelAccessVerified: false });
    expect(d.sign).not.toHaveBeenCalled(); expect(d.admin.from).not.toHaveBeenCalled(); expect(d.file).not.toHaveBeenCalled();
    expect(d.call.mock.calls[0][1].body).toMatchObject({ dryRun: true, references: [] });
  });
  it("a failed dry-run keeps Google's refusal visible and never falls back", async () => {
    const d = deps(); const googleError = { httpStatus: 403, status: "PERMISSION_DENIED", reason: "BILLING_DISABLED" };
    d.call.mockResolvedValueOnce({ httpStatus: 200, payload: { ok: false, errorCode: "model_access_failed", modelAccessVerified: false, googleError } } as never);
    expect(await geminiStill({ ...input, jobRowId: undefined, dryRun: true }, d)).toEqual({ ok: false, billed: false, error: "gemini_not_ready", detail: "model_access_failed", modelAccessVerified: false, googleError });
    expect(d.sign).not.toHaveBeenCalled(); expect(d.file).not.toHaveBeenCalled();
  });
  it("won't claim foreign, wrong-provider, running or finalized jobs", async () => {
    for (const change of [{ user_id: project }, { project_id: user }, { provider: "grok" }, { status: "running" }, { finalized_at: "yesterday" }, { external_job_id: "already-submitted" }]) {
      const d = deps(change);
      expect(await geminiStill(input, d)).toMatchObject({ ok: false, billed: false, error: "gemini_job_not_claimable" });
      expect(d.call).not.toHaveBeenCalled(); expect(d.sign).not.toHaveBeenCalled();
    }
  });
  it("files an unselected result with truthful provider/usage evidence and preserves the revision snapshot", async () => {
    const d = deps(); const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: true, actualCostUsd: null, stills: [filed], jobRecordSaved: true });
    expect(d.row).toMatchObject({ status: "succeeded", result_asset_id: jobId, request_payload_json: { variation_id: "retained", treatmentRevisionId: "retained", model: GEMINI_MODEL } });
    expect(d.userClient.storage.from).toHaveBeenCalledWith("prop-refs");
    expect(d.call.mock.calls[0][1].body).toMatchObject({ model: GEMINI_MODEL, references: [{ label: "The rider", role: "cast" }] });
    expect(d.file.mock.calls[0][0]).toMatchObject({ mime: "image/png", extraMeta: { actual_cost_usd: null, usage: { promptTokenCount: 50 }, job_id: jobId } });
    expect(JSON.stringify(d.row)).not.toContain("token=private");
    expect(JSON.stringify(d.row)).not.toContain("iVBOR");
  });
  it("claims atomically: duplicate calls submit just once", async () => {
    const d = deps(); const results = await Promise.all([geminiStill(input, d), geminiStill(input, d)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(d.call).toHaveBeenCalledTimes(1);
  });
  it("a failed reference signature spends nothing", async () => {
    const d = deps(); d.sign.mockResolvedValueOnce({ data: null, error: { message: "denied" } } as never);
    expect(await geminiStill(input, d)).toMatchObject({ ok: false, billed: false, error: "reference_sign_failed" });
    expect(d.call).not.toHaveBeenCalled(); expect(d.row.status).toBe("failed");
  });
  it("a transport timeout is marked possibly billed and cannot be replayed", async () => {
    const d = deps(); d.call.mockRejectedValueOnce(new Error("secret transport URL"));
    const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: false, billed: "unknown", possiblyBilled: true, actualCostUsd: null });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(await geminiStill(input, d)).toMatchObject({ error: "gemini_job_not_claimable" });
    expect(d.call).toHaveBeenCalledTimes(1);
  });
  it("a CC refusal does not create an asset or retry", async () => {
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 200, payload: { ok: false, errorCode: "input_token_gate", billed: false } } as never);
    expect(await geminiStill(input, d)).toMatchObject({ ok: false, billed: false, actualCostUsd: null });
    expect(d.file).not.toHaveBeenCalled(); expect(d.row.status).toBe("failed");
  });
  it("a gateway error without billing evidence remains possibly billed", async () => {
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 503, payload: { error: "worker unavailable" } } as never);
    expect(await geminiStill(input, d)).toMatchObject({ ok: false, billed: "unknown", possiblyBilled: true, actualCostUsd: null });
    expect(d.file).not.toHaveBeenCalled(); expect(d.call).toHaveBeenCalledTimes(1);
  });
});
