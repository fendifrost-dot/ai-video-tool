import { describe, expect, it, vi } from "vitest";
import { GEMINI_COST_BOUND, GEMINI_MODEL, geminiPlan, geminiStill, recoverGeminiJob, unsupportedNanoAlias, validateGeminiRequest } from "./gemini.ts";
import { planStillRequest, REFERENCE_MODELS } from "../_shared/stillReferences.ts";

const user = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const input = { userId: user, projectId: project, jobRowId: jobId, prompt: "Photograph of the same rider", resolution: "2k", aspectRatio: "9:16", maxCostUsd: .28, references: [{ ref: { source: "project_asset" as const, id: jobId, role: "cast", label: "The rider" }, path: `${user}/rider.png`, buckets: ["prop-refs"] }] };
const filed = { path: `${user}/${project}/worlds/portrait.png`, previewUrl: "https://example.invalid/preview?token=private", assetId: jobId, bytes: 13 };
function deps(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = { id: jobId, user_id: user, project_id: project, provider: "gemini", status: "queued", external_job_id: null, finalized_at: null, request_payload_json: { variation_id: "retained", treatmentRevisionId: "retained" }, ...overrides };
  const admin = { from: vi.fn(() => {
    let patch: Record<string, unknown> = {}; const filters: [string, unknown][] = [];
    const execute = () => {
      if (filters.some(([key, value]) => (row[key] ?? null) !== (value ?? null))) return { data: null, error: null };
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
  const list = vi.fn(async (_dir: string, opts: { search?: string }) => ({ data: [{ name: opts.search }], error: null }));
  (admin as Record<string, unknown>).storage = { from: vi.fn(() => ({ list })) };
  const call = vi.fn(async (_config: unknown, _call: { body?: Record<string, unknown> }) => ({ httpStatus: 200, payload: { ok: true, model: GEMINI_MODEL, actualCostUsd: null, usage: { promptTokenCount: 50 }, images: [{ data: "iVBORw0KGgoAAAAAAQ==", mimeType: "image/png" }] } }));
  const file = vi.fn(async (_image: { bytes: Uint8Array; mime: string; extraMeta: Record<string, unknown> }) => filed);
  return { row, sign, admin, userClient, call, file, list, config: { url: "https://cc.example", key: "shared" } };
}

describe("unit: explicit Gemini still planning", () => {
  it("supports 14 references only when explicitly selected, preserves existing Grok choices", () => {
    expect(unsupportedNanoAlias("gemini_image3.1_flash")).toBe(true);
    expect(unsupportedNanoAlias("nano_banana_2_1")).toBe(true);
    expect(unsupportedNanoAlias(GEMINI_MODEL)).toBe(false);
    expect(geminiPlan(14, "2k", .28)).toMatchObject({ ok: true, model: GEMINI_MODEL, overGate: false, maxReferences: 14 });
    expect(geminiPlan(15, "2k", .28)).toMatchObject({ ok: false, error: "references_over_capability" });
    expect(geminiPlan(1, "2k", .15)).toMatchObject({ ok: true, overGate: true });
    expect(geminiPlan(1, "2k", .2703)).toMatchObject({ ok: true, overGate: true }); // between the rounded and exact bound
    expect(geminiPlan(1, "2k", GEMINI_COST_BOUND)).toMatchObject({ ok: true, overGate: false });
    expect(REFERENCE_MODELS.some((m) => m.model === GEMINI_MODEL)).toBe(false);
    expect(planStillRequest({ pictures: 1, n: 1, resolution: "2k", defaultModel: "grok-imagine-image-quality", maxCostUsd: .5, capOf: () => 3, generationRateOf: () => .07 })).toMatchObject({ model: "grok-imagine-image-quality" });
    expect(GEMINI_COST_BOUND).toBeCloseTo(.270336);
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
  it("records submission intent on the row before the billable call, and a failed intent write sends nothing", async () => {
    const d = deps(); let seenAtCall: unknown = null;
    d.call.mockImplementationOnce(async () => { seenAtCall = JSON.parse(JSON.stringify(d.row.response_payload_json)); return { httpStatus: 200, payload: { ok: true, model: GEMINI_MODEL, actualCostUsd: null, usage: { promptTokenCount: 0 }, images: [{ data: "iVBORw0KGgoAAAAAAQ==", mimeType: "image/png" }] } }; });
    expect(await geminiStill(input, d)).toMatchObject({ ok: true, stages: { generation: "succeeded", upload: "succeeded", filing: "succeeded", finalize: "succeeded" }, finalized: true });
    expect(seenAtCall).toMatchObject({ phase: "submitted", submitted: true, possiblyBilled: true, billed: "unknown" });
    const e = deps(); let updates = 0;
    const realFrom = e.admin.from; e.admin.from = vi.fn(() => { const q = realFrom(); const u = q.update; q.update = (p: Record<string, unknown>) => { if (++updates === 3) { const r = u(p); r.eq = (() => ({ eq: async () => ({ data: null, error: { message: "db down" } }) })) as never; return r; } return u(p); }; return q; }) as never;
    expect(await geminiStill(input, e)).toMatchObject({ ok: false, error: "job_submission_record_failed", billed: false, possiblyBilled: false });
    expect(e.call).not.toHaveBeenCalled();
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
  it("a finalize failure after a filed image is reported as unfinalized, not as a successful record", async () => {
    const d = deps(); let updates = 0;
    const realFrom = d.admin.from; d.admin.from = vi.fn(() => { const q = realFrom(); const u = q.update; q.update = (p: Record<string, unknown>) => { if (p.finalized_at !== undefined) { updates++; return { eq: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { message: "db down" } }) }) }) } as never; } return u(p); }; return q; }) as never;
    const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: true, jobRecordSaved: false, finalized: false, stages: { filing: "succeeded", finalize: "failed" } });
    expect(updates).toBe(2); // one retry
    expect(String(result.warning)).toContain("do not resubmit");
  });
  it("recovery files a stored-but-unrecorded image without calling the provider", async () => {
    const stored = `${user}/${project}/worlds/scene_1.png`;
    const d = deps({ status: "failed", response_payload_json: { ok: false, error: "asset_filing_failed", recoverableImagePath: stored, possiblyBilled: true, usage: { promptTokenCount: 5 } } });
    const record = vi.fn(async ({ path }: { path: string; extraMeta: Record<string, unknown> }) => ({ path, previewUrl: null, bytes: 0, assetId: "aaaaaaaa-0000-4000-8000-000000000009" }));
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: d.admin, record })).toMatchObject({ ok: true, finalized: true, assetId: "aaaaaaaa-0000-4000-8000-000000000009" });
    expect(d.row).toMatchObject({ status: "succeeded", result_asset_id: "aaaaaaaa-0000-4000-8000-000000000009", error_text: null });
    expect(record.mock.calls[0][0].extraMeta).toMatchObject({ recovered_from_job: jobId, usage: { promptTokenCount: 5 } });
    expect(d.call).not.toHaveBeenCalled();
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: d.admin, record })).toMatchObject({ ok: true, alreadyRecovered: true });
  });
  it("recovery refuses jobs with nothing stored, foreign paths, or a missing object", async () => {
    const record = vi.fn();
    const a = deps({ status: "failed", response_payload_json: { error: "gemini_request_failed" } });
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: a.admin, record })).toMatchObject({ ok: false, error: "nothing_recoverable" });
    const b = deps({ status: "failed", response_payload_json: { recoverableImagePath: `${project}/x.png` } });
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: b.admin, record })).toMatchObject({ ok: false, error: "recoverable_path_forbidden" });
    const c = deps({ status: "failed", response_payload_json: { recoverableImagePath: `${user}/${project}/worlds/gone.png` } }); c.list.mockResolvedValueOnce({ data: [], error: null } as never);
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: c.admin, record })).toMatchObject({ ok: false, error: "recoverable_object_missing" });
    expect(await recoverGeminiJob({ userId: project, projectId: project, jobRowId: jobId }, { admin: c.admin, record })).toMatchObject({ ok: false, error: "gemini_job_not_found" });
    // The owner can edit their own job row: a path in the caller's folder but another project, or a malformed one, is refused.
    const d = deps({ status: "failed", response_payload_json: { recoverableImagePath: `${user}/11111111-1111-4111-8111-111111111111/worlds/x.png` } });
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: d.admin, record })).toMatchObject({ ok: false, error: "recoverable_path_forbidden" });
    const e = deps({ status: "failed", response_payload_json: { recoverableImagePath: `${user}/${project}/../x.png` } });
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: e.admin, record })).toMatchObject({ ok: false, error: "recoverable_path_forbidden" });
    expect(record).not.toHaveBeenCalled();
  });
  it("a recovery that loses the race to finalize reports its asset row as a duplicate, never as success", async () => {
    const f = deps({ status: "failed", response_payload_json: { recoverableImagePath: filed.path } });
    const record = vi.fn(async () => { f.row.result_asset_id = "someone-else"; return { assetId: "mine", path: filed.path, previewUrl: null, bytes: 0 }; }); // another recovery finalized meanwhile
    expect(await recoverGeminiJob({ userId: user, projectId: project, jobRowId: jobId }, { admin: f.admin, record })).toMatchObject({ ok: true, assetId: "mine", finalized: false, duplicate: true });
    expect(f.row.result_asset_id).toBe("someone-else");
  });
  it("a Control Center worker crash after submission is recorded with its platform code, never as plain failure", async () => {
    // Shape observed live: the platform, not CC, answers when the worker exceeds its memory.
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 546, payload: { code: "WORKER_RESOURCE_LIMIT", message: "Function failed due to not having enough compute resources" } } as never);
    const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: false, error: "control_center_failed_after_submit", ccHttpStatus: 546, ccPlatformCode: "WORKER_RESOURCE_LIMIT", billed: "unknown", possiblyBilled: true, jobRecordSaved: true });
    expect(d.row).toMatchObject({ status: "failed", error_text: "control_center_failed_after_submit; WORKER_RESOURCE_LIMIT", response_payload_json: { possiblyBilled: true, ccHttpStatus: 546 } });
    expect(String((d.row.response_payload_json as Record<string, unknown>).reconcile)).toContain("jobRowId");
    expect(d.file).not.toHaveBeenCalled();
    expect(await geminiStill(input, d)).toMatchObject({ error: "gemini_job_not_claimable" });
    expect(d.call).toHaveBeenCalledTimes(1);
  });
  it("Control Center's own refusals before calling Google are not billed", async () => {
    for (const errorCode of ["INVALID_REQUEST", "PROVIDER_KEY_NOT_CONFIGURED", "AUDIT_UNAVAILABLE", "UNAUTHORISED"]) {
      const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: errorCode === "INVALID_REQUEST" ? 400 : 503, payload: { ok: false, errorCode, retryable: false } } as never);
      expect(await geminiStill(input, d), errorCode).toMatchObject({ ok: false, billed: false, possiblyBilled: false, errorCode });
    }
  });
  it("a refusal code that still claims submission stays possibly billed; odd platform codes are not recorded", async () => {
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 503, payload: { ok: false, errorCode: "AUDIT_UNAVAILABLE", possiblyBilled: true } } as never);
    expect(await geminiStill(input, d)).toMatchObject({ billed: "unknown", possiblyBilled: true });
    const e = deps(); e.call.mockResolvedValueOnce({ httpStatus: 502, payload: { code: "x".repeat(5000) } } as never);
    expect(await geminiStill(input, e)).toMatchObject({ error: "control_center_failed_after_submit", ccPlatformCode: null });
  });
  it("an unknown CC error code on a non-200 stays possibly billed", async () => {
    const d = deps(); d.call.mockResolvedValueOnce({ httpStatus: 500, payload: { ok: false, errorCode: "SOMETHING_NEW" } } as never);
    expect(await geminiStill(input, d)).toMatchObject({ ok: false, billed: "unknown", possiblyBilled: true });
  });
  it("an image stored without its asset row stays recoverable: path recorded, job failed, no retry", async () => {
    const d = deps(); const stored = `${user}/${project}/worlds/scene_1.png`;
    d.file.mockResolvedValueOnce({ error: "asset_record_failed", path: stored } as never);
    const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: false, error: "asset_filing_failed", filingError: "asset_record_failed", recoverableImagePath: stored, billed: "unknown", possiblyBilled: true });
    expect(d.row).toMatchObject({ status: "failed", result_asset_id: null, error_text: `asset_filing_failed; image stored at ${stored}`, response_payload_json: { recoverableImagePath: stored } });
    expect(await geminiStill(input, d)).toMatchObject({ error: "gemini_job_not_claimable" });
    expect(d.call).toHaveBeenCalledTimes(1);
  });
  it("an upload failure (nothing stored) is a failure with no recoverable path, never success", async () => {
    const d = deps(); d.file.mockResolvedValueOnce({ error: "bucket unavailable" } as never);
    const result = await geminiStill(input, d);
    expect(result).toMatchObject({ ok: false, error: "asset_filing_failed", recoverableImagePath: null, imageLost: true, stages: { generation: "succeeded", upload: "failed", filing: "not_started" } });
    expect(d.row).toMatchObject({ status: "failed", error_text: "asset_filing_failed; image lost: upload failed" });
    expect(JSON.stringify(d.row)).not.toContain("iVBOR");
  });
});
