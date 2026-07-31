import { describe, expect, it } from "vitest";
import {
  buildFalDiagnostic,
  classifyFalFailure,
  classifyHttpStatus,
  extractFalLogs,
  extractFalRequestId,
  extractProviderError,
  numericHttpStatus,
  sanitizedFalError,
  sanitizeText,
} from "./falDiagnostics";

const NOW = "2026-07-30T00:00:00.000Z";

describe("classifyHttpStatus", () => {
  it("maps each documented status to its class", () => {
    expect(classifyHttpStatus(401)).toBe("unauthorized");
    expect(classifyHttpStatus(402)).toBe("billing");
    expect(classifyHttpStatus(403)).toBe("forbidden");
    expect(classifyHttpStatus(404)).toBe("not_found");
    expect(classifyHttpStatus(409)).toBe("rate_limited");
    expect(classifyHttpStatus(429)).toBe("rate_limited");
    expect(classifyHttpStatus(500)).toBe("upstream_error");
    expect(classifyHttpStatus(502)).toBe("upstream_error");
    expect(classifyHttpStatus(503)).toBe("upstream_error");
  });

  it("buckets other 4xx as client_error and non-errors as unknown", () => {
    expect(classifyHttpStatus(400)).toBe("client_error");
    expect(classifyHttpStatus(422)).toBe("client_error");
    expect(classifyHttpStatus(200)).toBe("unknown");
    expect(classifyHttpStatus(null)).toBe("unknown");
    expect(classifyHttpStatus(undefined)).toBe("unknown");
  });
});

describe("numericHttpStatus", () => {
  it("accepts numbers and numeric-leading strings in the HTTP range", () => {
    expect(numericHttpStatus(403)).toBe(403);
    expect(numericHttpStatus("403")).toBe(403);
    expect(numericHttpStatus("500 Internal Server Error")).toBe(500);
  });
  it("rejects out-of-range / non-numeric values", () => {
    expect(numericHttpStatus(42)).toBeNull();
    expect(numericHttpStatus("FAILED")).toBeNull();
    expect(numericHttpStatus(null)).toBeNull();
    expect(numericHttpStatus(undefined)).toBeNull();
  });
});

describe("classifyFalFailure", () => {
  it("prefers the upstream Fal status over the CC HTTP status", () => {
    // CC returned 200 to us, but Fal upstream said 403 → account restriction.
    expect(classifyFalFailure({ ccHttpStatus: 200, falStatus: 403 })).toBe("forbidden");
    // Numeric-string upstream still wins.
    expect(classifyFalFailure({ ccHttpStatus: 502, falStatus: "402" })).toBe("billing");
  });

  it("falls back to the CC HTTP status when no upstream status", () => {
    expect(classifyFalFailure({ ccHttpStatus: 401 })).toBe("unauthorized");
    expect(classifyFalFailure({ ccHttpStatus: 500 })).toBe("upstream_error");
  });

  it("classifies a provider terminal FAILED (no HTTP error) separately", () => {
    expect(classifyFalFailure({ ccHttpStatus: 200, providerStatus: "FAILED" })).toBe(
      "provider_job_failed",
    );
    expect(classifyFalFailure({ providerStatus: "ERROR" })).toBe("provider_job_failed");
  });

  it("handles transport + timeout", () => {
    expect(classifyFalFailure({ transportError: true })).toBe("cc_unreachable");
    expect(classifyFalFailure({ timeout: true })).toBe("timeout");
    expect(classifyFalFailure({})).toBe("unknown");
  });
});

describe("sanitizeText — secret stripping", () => {
  it("strips the query string of signed URLs (token lives there)", () => {
    const signed =
      "https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/object/sign/project-clips/u/1.mp4?token=eyJhbGciOiJI.SECRET.sig&X-Amz-Signature=deadbeef";
    const out = sanitizeText(signed);
    expect(out).toContain("/storage/v1/object/sign/project-clips/u/1.mp4");
    expect(out).toContain("?[stripped]");
    expect(out).not.toContain("token=eyJ");
    expect(out).not.toContain("deadbeef");
    expect(out).not.toContain("X-Amz-Signature");
  });

  it("redacts bearer tokens", () => {
    const out = sanitizeText("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");
    expect(out).toContain("Bearer [redacted]");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9.abc.def");
  });

  it("redacts secret-shaped JSON values", () => {
    const body = JSON.stringify({
      apikey: "sk-live-abc123",
      "x-proxy-secret": "super-secret-value",
      model: "decart/lucy-edit/fast",
      detail: "ok",
    });
    const out = sanitizeText(body);
    expect(out).not.toContain("sk-live-abc123");
    expect(out).not.toContain("super-secret-value");
    // Non-secret fields survive.
    expect(out).toContain("decart/lucy-edit/fast");
    expect(out).toContain("ok");
  });

  it("redacts secret-shaped key=value pairs and query params", () => {
    const out = sanitizeText("callback=https://x/y?api_key=abc&token=zzz plus secret=hunter2");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("zzz");
    expect(out).not.toContain("hunter2");
  });

  it("bounds the length", () => {
    const out = sanitizeText("x".repeat(5000), 100);
    expect(out.length).toBeLessThanOrEqual(100 + "…[truncated]".length);
    expect(out).toContain("…[truncated]");
  });

  it("never throws on non-string input", () => {
    expect(() => sanitizeText({ a: 1 })).not.toThrow();
    expect(() => sanitizeText(null)).not.toThrow();
    expect(() => sanitizeText(undefined)).not.toThrow();
    expect(sanitizeText(null)).toBe("");
  });
});

describe("extractors", () => {
  it("pulls the Fal request id from common shapes", () => {
    expect(extractFalRequestId({ request_id: "abc" })).toBe("abc");
    expect(extractFalRequestId({ fal_request_id: "xyz" })).toBe("xyz");
    expect(extractFalRequestId({ result: { id: "deep" } })).toBe("deep");
    expect(extractFalRequestId({})).toBeNull();
    expect(extractFalRequestId(null)).toBeNull();
  });

  it("prefers explicit error/detail then body preview for provider error", () => {
    expect(extractProviderError({ error: "boom" })).toBe("boom");
    expect(extractProviderError({ detail: "nope" })).toBe("nope");
    expect(extractProviderError({ fal_body_preview: "upstream said no" })).toBe("upstream said no");
    expect(extractProviderError({})).toBeNull();
  });

  it("joins array logs and passes string logs through", () => {
    expect(extractFalLogs({ fal_logs: "line1\nline2" })).toBe("line1\nline2");
    expect(extractFalLogs({ fal_logs: [{ message: "a" }, "b"] })).toBe("a\nb");
    expect(extractFalLogs({})).toBeNull();
  });
});

describe("buildFalDiagnostic", () => {
  it("captures a provider FAILED with an upstream 403 (account block signal)", () => {
    const diag = buildFalDiagnostic({
      phase: "processing",
      ctx: { model: "decart/lucy-edit/fast", requestId: "asset-1:sess-9", retryCount: 1 },
      submittedAt: "2026-07-30T00:00:00.000Z",
      ccHttpStatus: 200,
      responseBody: {
        status: "FAILED",
        fal_status: 403,
        fal_body_preview: "Exhausted balance / plan does not allow this model",
        fal_logs: ["submitted", "denied"],
        request_id: "fal-req-123",
      },
      now: NOW,
    });
    expect(diag.classification).toBe("forbidden");
    expect(diag.phase).toBe("processing");
    expect(diag.cc_http_status).toBe(200);
    expect(diag.fal_status).toBe(403);
    expect(diag.fal_status_classification).toBe("forbidden");
    expect(diag.provider_status).toBe("FAILED");
    expect(diag.provider_error).toContain("Exhausted balance");
    expect(diag.fal_logs).toBe("submitted\ndenied");
    expect(diag.model).toBe("decart/lucy-edit/fast");
    expect(diag.request_id).toBe("asset-1:sess-9");
    expect(diag.fal_request_id).toBe("fal-req-123");
    expect(diag.retry_count).toBe(1);
    expect(diag.recorded_at).toBe(NOW);
    expect(diag.ok).toBe(false);
  });

  it("keeps a real job failure (5xx) distinct from an account block", () => {
    const diag = buildFalDiagnostic({
      phase: "processing",
      ccHttpStatus: 200,
      responseBody: { status: "FAILED", fal_status: 500, error: "internal error" },
      now: NOW,
    });
    expect(diag.classification).toBe("upstream_error");
    expect(diag.fal_status_classification).toBe("upstream_error");
    expect(diag.provider_error).toBe("internal error");
  });

  it("sanitizes secrets that appear in the response body preview", () => {
    const diag = buildFalDiagnostic({
      phase: "submission",
      ccHttpStatus: 500,
      responseBody: {
        error: "failed",
        fal_body_preview: "pull failed for https://host/storage/o/x.mp4?token=SECRETTOKEN&sig=abc",
      },
      now: NOW,
    });
    expect(diag.body_preview).not.toContain("SECRETTOKEN");
    expect(diag.body_preview).toContain("?[stripped]");
  });

  it("wraps a plain error string with no structured response", () => {
    const diag = buildFalDiagnostic({
      phase: "output_retrieval",
      message: "lucy_upload_failed: bucket denied",
      now: NOW,
    });
    expect(diag.classification).toBe("unknown");
    expect(diag.phase).toBe("output_retrieval");
    expect(diag.message).toContain("lucy_upload_failed");
    expect(diag.cc_http_status).toBeNull();
    expect(diag.fal_status).toBeNull();
  });
});

describe("sanitizedFalError", () => {
  it("projects the upstream status when present, else CC http", () => {
    const diag = buildFalDiagnostic({
      phase: "processing",
      ccHttpStatus: 200,
      responseBody: { status: "FAILED", fal_status: 402 },
      now: NOW,
    });
    const ui = sanitizedFalError(diag);
    expect(ui.status).toBe(402);
    expect(ui.classification).toBe("billing");
    expect(ui.message).toContain("billing");
  });

  it("falls back to cc http when there is no upstream status", () => {
    const diag = buildFalDiagnostic({ phase: "submission", ccHttpStatus: 401, now: NOW });
    const ui = sanitizedFalError(diag);
    expect(ui.status).toBe(401);
    expect(ui.classification).toBe("unauthorized");
  });
});
