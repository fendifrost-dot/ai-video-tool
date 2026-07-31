// Shared Fal-failure diagnostics for every AVT video proxy that reaches Fal via
// Control Center (fal-run / fal-queue-poll). No Deno / DOM globals beyond the
// standard `fetch` + `Date`, so vitest exercises the pure parts exactly like the
// other _shared modules.
//
// WHY THIS EXISTS. Before this, the video proxies persisted only a generic error
// string (e.g. "fal_response_failed") to the row, so an ACCOUNT BLOCK (401/402/
// 403) and a genuine JOB FAILURE (5xx / provider FAILED) were indistinguishable
// — we had to INFER which one happened. CC's fal-queue-poll (PR #16) now returns
// rich fields (fal_status / fal_body_preview / fal_logs). This module captures a
// FULL structured diagnostic (HTTP status, upstream Fal status, provider error,
// bounded sanitized body/logs, ids, phase, retry count), CLASSIFIES it, and
// persists it into project_assets.metadata_json.fal_diagnostics — keyed per lane
// — so a person (or SQL) can read the real fal_status and settle the question.
//
// SECRETS. It NEVER stores API keys, authorization headers, the CC proxy secret,
// or signed URLs. Every string that lands in the record is passed through
// sanitizeText(), which strips URL query strings (where signed-URL tokens live),
// bearer tokens, and secret-shaped key/value pairs, and bounds the length.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where in the Fal round-trip the failure happened. */
export type FalFailurePhase =
  | "submission" // POST to CC fal-run (switchx-restyle) failed / no queue urls
  | "queueing" // submitted OK but the job never left the queue (timeout in IN_QUEUE)
  | "processing" // job reached a terminal FAILED/ERROR state on the provider
  | "polling" // the CC fal-queue-poll call itself errored (HTTP / network)
  | "output_retrieval"; // job COMPLETED but downloading/storing the result failed

/** Coarse, human-meaningful failure class derived from the status. */
export type FalClassification =
  | "unauthorized" // 401 — invalid / unauthorized key
  | "billing" // 402 — billing / out of credits
  | "forbidden" // 403 — account / model / plan restriction
  | "not_found" // 404 — endpoint / model config issue
  | "rate_limited" // 409 / 429 — concurrency / quota / rate limiting
  | "upstream_error" // 5xx — Fal / upstream processing failure
  | "provider_job_failed" // submitted OK, job then FAILED on the provider
  | "client_error" // other 4xx
  | "timeout" // our poll deadline elapsed
  | "cc_unreachable" // network error reaching CC
  | "unknown"; // could not be determined

/** The persisted record. One per lane under metadata_json.fal_diagnostics[op]. */
export interface FalDiagnostic {
  ok: false;
  phase: FalFailurePhase;
  classification: FalClassification;
  /** Short, sanitized, human-readable summary (safe to surface in the UI). */
  message: string;
  // --- HTTP layer: OUR call to CC ------------------------------------------
  /** HTTP status of our request to CC (fal-run / fal-queue-poll). */
  cc_http_status: number | null;
  // --- Upstream Fal layer: the account-block signal (CC PR #16 fal_status) --
  /** Raw upstream Fal status as CC reported it (numeric HTTP, or a state str). */
  fal_status: number | string | null;
  /** Classification of fal_status when it is a numeric HTTP code. */
  fal_status_classification: FalClassification | null;
  // --- Provider job layer: kept SEPARATE from the HTTP layer ----------------
  /** Provider queue terminal state, e.g. "FAILED". */
  provider_status: string | null;
  /** The provider's ACTUAL processing error, distinct from any HTTP status. */
  provider_error: string | null;
  // --- Bounded, sanitized payloads -----------------------------------------
  /** Fal response body preview (≤ ~1.5 KB, secrets stripped). */
  body_preview: string | null;
  /** Fal job logs (≤ ~1.5 KB, secrets stripped). */
  fal_logs: string | null;
  // --- Identity / reproducibility ------------------------------------------
  /** Model endpoint (null for the action path, e.g. vton-frame). */
  model: string | null;
  /** Our AVT-side request id (the id we key this call by). */
  request_id: string | null;
  /** Fal job / request id, when the response carried one. */
  fal_request_id: string | null;
  /** Extra label to disambiguate multi-step / per-frame calls. */
  label: string | null;
  /** ISO submission timestamp. */
  submitted_at: string | null;
  /** ISO time this diagnostic was recorded. */
  recorded_at: string;
  /** How many times this logical call had been retried (0 = first try). */
  retry_count: number;
}

/** CC endpoints + secret used by the shared submit / poll wrappers. */
export interface CcEndpoints {
  switchxUrl: string;
  pollUrl: string;
  proxySecret: string;
}

/** Context for one logical Fal call — carried into the diagnostic. */
export interface FalCallContext {
  /** Model endpoint (may be null for the vton-frame action path). */
  model?: string | null;
  /** AVT-side request id we key this call by (e.g. `${assetId}:${sessionId}`). */
  requestId?: string | null;
  /** Extra label to disambiguate multi-step / per-frame calls. */
  label?: string | null;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** How many times this logical call has been retried (0 = first try). */
  retryCount?: number;
}

/**
 * Minimal structural shape of the Supabase admin client we need to persist.
 * Uses PromiseLike (not Promise) so the supabase-js PostgrestBuilder — a thenable
 * that lacks catch/finally — is structurally assignable.
 */
export interface AssetMetaClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { metadata_json?: Record<string, unknown> | null } | null;
          error?: unknown;
        }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error?: unknown }>;
    };
  };
}

const MAX_PAYLOAD = 1536; // ~1.5 KB bound for body_preview / fal_logs
const MAX_MESSAGE = 300;

// ---------------------------------------------------------------------------
// Secret stripping
// ---------------------------------------------------------------------------

/**
 * Strip secrets from a free-text string and bound its length:
 *  - drop the query string of any URL (signed-URL tokens live there) → keep the
 *    scheme+host+path only, appended with `?[stripped]`,
 *  - redact bearer tokens,
 *  - redact secret-shaped `key=value` / `"key":"value"` pairs (token, secret,
 *    apikey, password, authorization, x-proxy-secret, signature…).
 * Never throws; always returns a bounded string.
 */
export function sanitizeText(input: unknown, maxLen = MAX_PAYLOAD): string {
  let s = typeof input === "string" ? input : safeStringify(input);
  // 1. Strip URL query strings (signed-URL tokens, SAS params, X-Amz-* …).
  s = s.replace(/(https?:\/\/[^\s"'<>\\)]+?)\?[^\s"'<>\\)]*/gi, "$1?[stripped]");
  // 2. Redact bearer tokens.
  s = s.replace(/\b[Bb]earer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
  // 3. Redact secret-shaped values in JSON ("key":"value") and querystring/kv
  //    (key=value) forms. Keys chosen to match auth/secret material only.
  const secretKey =
    "(?:authorization|x-proxy-secret|proxy[_-]?secret|api[_-]?key|apikey|access[_-]?token|token|secret|password|signature|sig)";
  s = s.replace(new RegExp(`("${secretKey}"\\s*:\\s*")[^"]*(")`, "gi"), "$1[redacted]$2");
  s = s.replace(new RegExp(`\\b(${secretKey})=([^&\\s"'\\\\]+)`, "gi"), "$1=[redacted]");
  if (s.length > maxLen) s = s.slice(0, maxLen) + "…[truncated]";
  return s;
}

function safeStringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Map a raw HTTP status code to a classification. */
export function classifyHttpStatus(status: number | null | undefined): FalClassification {
  if (status == null) return "unknown";
  if (status === 401) return "unauthorized";
  if (status === 402) return "billing";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409 || status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  if (status >= 400) return "client_error";
  return "unknown";
}

/** Coerce a fal_status field to a numeric HTTP code, else null. */
export function numericHttpStatus(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v >= 100 && v <= 599 ? v : null;
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{3})\b/);
    if (m) {
      const n = Number(m[1]);
      return n >= 100 && n <= 599 ? n : null;
    }
  }
  return null;
}

/**
 * Derive the overall classification. PREFERS the upstream Fal HTTP status (the
 * real account-block signal: 401/402/403 vs 5xx) when present, then our CC HTTP
 * status, then a terminal provider FAILED, then transport/timeout.
 */
export function classifyFalFailure(input: {
  ccHttpStatus?: number | null;
  falStatus?: number | string | null;
  providerStatus?: string | null;
  transportError?: boolean;
  timeout?: boolean;
}): FalClassification {
  if (input.transportError) return "cc_unreachable";
  const upstream = numericHttpStatus(input.falStatus);
  if (upstream != null && upstream >= 400) return classifyHttpStatus(upstream);
  const cc = input.ccHttpStatus ?? null;
  if (cc != null && cc >= 400) return classifyHttpStatus(cc);
  const ps = String(input.providerStatus ?? "").toUpperCase();
  if (ps === "FAILED" || ps === "ERROR") return "provider_job_failed";
  if (input.timeout) return "timeout";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Extractors — pull ids / errors / logs out of a CC/Fal response object
// ---------------------------------------------------------------------------

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** Best-effort Fal job / request id from a CC/Fal response. */
export function extractFalRequestId(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const direct = firstString(raw, ["fal_request_id", "request_id", "requestId", "id"]);
  if (direct) return direct;
  const result = raw.result as Record<string, unknown> | undefined;
  if (result && typeof result === "object") {
    return firstString(result, ["request_id", "requestId", "id"]);
  }
  return null;
}

/**
 * The provider's ACTUAL processing error — kept separate from any HTTP status.
 * Prefers explicit error/detail fields, then the fal_body_preview payload.
 */
export function extractProviderError(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const err = raw.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") return safeStringify(err);
  const detail = firstString(raw, ["detail", "message"]);
  if (detail) return detail;
  const preview = raw.fal_body_preview;
  if (typeof preview === "string" && preview.trim()) return preview.trim();
  if (preview && typeof preview === "object") return safeStringify(preview);
  return null;
}

/** Fal logs (string or array of {message}/strings), joined + bounded later. */
export function extractFalLogs(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw || typeof raw !== "object") return null;
  const logs = raw.fal_logs ?? raw.logs;
  if (!logs) return null;
  if (typeof logs === "string") return logs;
  if (Array.isArray(logs)) {
    const lines = logs
      .map((l) =>
        typeof l === "string"
          ? l
          : l && typeof l === "object" && "message" in (l as Record<string, unknown>)
            ? String((l as Record<string, unknown>).message)
            : safeStringify(l),
      )
      .filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  }
  return safeStringify(logs);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildFalDiagnosticInput {
  phase: FalFailurePhase;
  ctx?: FalCallContext;
  submittedAt?: string | null;
  ccHttpStatus?: number | null;
  falStatus?: number | string | null;
  providerStatus?: string | null;
  providerError?: string | null;
  /** The raw CC/Fal response object — body_preview/fal_logs/ids are mined from it. */
  responseBody?: Record<string, unknown> | null;
  falRequestId?: string | null;
  transportError?: boolean;
  timeout?: boolean;
  /** Fallback human message when there is no structured response (plain error). */
  message?: string;
  /** ISO now, injected for deterministic tests; defaults to new Date(). */
  now?: string;
}

/** Assemble a fully sanitized FalDiagnostic record. Never throws. */
export function buildFalDiagnostic(input: BuildFalDiagnosticInput): FalDiagnostic {
  const ctx = input.ctx ?? {};
  const raw = input.responseBody ?? null;
  const falStatus =
    input.falStatus ?? (raw ? ((raw.fal_status as number | string | undefined) ?? null) : null);
  const upstream = numericHttpStatus(falStatus);
  const providerStatus =
    input.providerStatus ?? (raw ? firstString(raw, ["status"]) : null) ?? null;
  const providerError = input.providerError ?? extractProviderError(raw);

  const classification = classifyFalFailure({
    ccHttpStatus: input.ccHttpStatus ?? null,
    falStatus,
    providerStatus,
    transportError: input.transportError,
    timeout: input.timeout,
  });

  // Sanitized, bounded body/logs.
  const bodyPreviewSrc =
    raw && typeof raw.fal_body_preview !== "undefined" ? raw.fal_body_preview : raw;
  const body_preview = bodyPreviewSrc != null ? sanitizeText(bodyPreviewSrc) : null;
  const logsSrc = extractFalLogs(raw);
  const fal_logs = logsSrc != null ? sanitizeText(logsSrc) : null;

  // Short human message: prefer an explicit message, else the provider error,
  // else a compact status line. Always sanitized + bounded.
  const statusBits = [
    input.ccHttpStatus != null ? `cc_http=${input.ccHttpStatus}` : null,
    falStatus != null ? `fal_status=${falStatus}` : null,
    providerStatus ? `provider=${providerStatus}` : null,
  ].filter(Boolean);
  const rawMessage =
    input.message ??
    providerError ??
    (statusBits.length ? statusBits.join(" ") : `fal call failed (${classification})`);
  const message = sanitizeText(`${classification}: ${rawMessage}`, MAX_MESSAGE);

  return {
    ok: false,
    phase: input.phase,
    classification,
    message,
    cc_http_status: input.ccHttpStatus ?? null,
    fal_status: falStatus ?? null,
    fal_status_classification: upstream != null ? classifyHttpStatus(upstream) : null,
    provider_status: providerStatus,
    provider_error: providerError != null ? sanitizeText(providerError, MAX_MESSAGE) : null,
    body_preview,
    fal_logs,
    model: ctx.model ?? null,
    request_id: ctx.requestId ?? null,
    fal_request_id: input.falRequestId ?? extractFalRequestId(raw),
    label: ctx.label ?? null,
    submitted_at: input.submittedAt ?? null,
    recorded_at: input.now ?? new Date().toISOString(),
    retry_count: ctx.retryCount ?? 0,
  };
}

/** A short, UI-safe projection of a diagnostic (status + classification + msg). */
export function sanitizedFalError(diag: FalDiagnostic): {
  status: number | string | null;
  classification: FalClassification;
  message: string;
} {
  return {
    // Prefer the upstream Fal status (the real signal); fall back to CC http.
    status: diag.fal_status ?? diag.cc_http_status,
    classification: diag.classification,
    message: diag.message,
  };
}

/** Error thrown by the shared submit/poll wrappers, carrying the diagnostic. */
export class FalDiagnosticError extends Error {
  readonly diagnostic: FalDiagnostic;
  constructor(diagnostic: FalDiagnostic) {
    super(diagnostic.message);
    this.name = "FalDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

/** Coerce any thrown value into a diagnostic (structured passthrough or wrap). */
export function toFalDiagnostic(
  err: unknown,
  fallback: { phase: FalFailurePhase; ctx?: FalCallContext; submittedAt?: string | null },
): FalDiagnostic {
  if (err instanceof FalDiagnosticError) return err.diagnostic;
  return buildFalDiagnostic({
    phase: fallback.phase,
    ctx: fallback.ctx,
    submittedAt: fallback.submittedAt ?? null,
    message: err instanceof Error ? err.message : String(err),
  });
}

// ---------------------------------------------------------------------------
// Persistence — merge into metadata_json.fal_diagnostics[op] (read-modify-write)
// ---------------------------------------------------------------------------

/**
 * Persist a diagnostic under metadata_json.fal_diagnostics[op] AND set the
 * lane's status/error fields in the SAME write (extraPatch), so the row reflects
 * status + error + full diagnostic atomically. Best-effort: never throws.
 */
export async function persistFalDiagnostic(
  admin: AssetMetaClient,
  assetId: string,
  op: string,
  diag: FalDiagnostic,
  extraPatch: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("project_assets")
      .select("metadata_json")
      .eq("id", assetId)
      .maybeSingle();
    const current = (row?.metadata_json ?? {}) as Record<string, unknown>;
    const diags = { ...((current.fal_diagnostics as Record<string, unknown>) ?? {}), [op]: diag };
    await admin
      .from("project_assets")
      .update({ metadata_json: { ...current, ...extraPatch, fal_diagnostics: diags } })
      .eq("id", assetId);
  } catch {
    /* diagnostics are best-effort; never mask the original failure */
  }
}

// ---------------------------------------------------------------------------
// Shared submit / poll wrappers — the single place CC responses are read
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 12 * 60 * 1000;

export interface FalQueueRef {
  status_url: string;
  response_url: string;
  /** ISO timestamp of the submission that produced this queue ref. */
  submittedAt: string;
}

/**
 * Submit a job to CC fal-run (switchx-restyle). `body` is forwarded verbatim
 * (either `{action:"fal-run",model,input}` or an action body like vton-frame).
 * On failure throws FalDiagnosticError(phase="submission").
 */
export async function falSubmit(
  cc: CcEndpoints,
  ctx: FalCallContext,
  body: Record<string, unknown>,
): Promise<FalQueueRef> {
  const submittedAt = new Date().toISOString();
  let resp: Response;
  try {
    resp = await fetch(cc.switchxUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new FalDiagnosticError(
      buildFalDiagnostic({
        phase: "submission",
        ctx,
        submittedAt,
        transportError: true,
        message: `cc_unreachable: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
  }
  const raw = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const statusUrl = typeof raw.status_url === "string" ? raw.status_url : "";
  const responseUrl = typeof raw.response_url === "string" ? raw.response_url : "";
  if (!resp.ok || !statusUrl || !responseUrl) {
    throw new FalDiagnosticError(
      buildFalDiagnostic({
        phase: "submission",
        ctx,
        submittedAt,
        ccHttpStatus: resp.status,
        responseBody: raw,
      }),
    );
  }
  return { status_url: statusUrl, response_url: responseUrl, submittedAt };
}

/**
 * Poll CC fal-queue-poll until the job COMPLETES (returns the raw result object)
 * or FAILS. Reads CC PR #16 rich fields (fal_status / fal_body_preview /
 * fal_logs). On failure throws FalDiagnosticError with the right phase:
 *   - polling: the poll HTTP call itself errored,
 *   - processing: the job reached a terminal FAILED/ERROR provider state,
 *   - queueing / polling: the deadline elapsed (queueing if never left IN_QUEUE).
 */
export async function falPoll(
  cc: CcEndpoints,
  ctx: FalCallContext,
  queue: FalQueueRef,
): Promise<Record<string, unknown>> {
  const intervalMs = ctx.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + (ctx.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS);
  const submittedAt = queue.submittedAt;
  let lastQueueState = "";
  while (Date.now() < deadline) {
    let resp: Response;
    try {
      resp = await fetch(cc.pollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Proxy-Secret": cc.proxySecret },
        body: JSON.stringify({ status_url: queue.status_url, response_url: queue.response_url }),
      });
    } catch (err) {
      throw new FalDiagnosticError(
        buildFalDiagnostic({
          phase: "polling",
          ctx,
          submittedAt,
          transportError: true,
          message: `poll_unreachable: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
    const raw = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const queueState = String(raw.status ?? "").toUpperCase();
    if (queueState) lastQueueState = queueState;
    const falStatus = (raw.fal_status as number | string | undefined) ?? null;
    const upstream = numericHttpStatus(falStatus);

    if (resp.ok && queueState === "COMPLETED") {
      return (raw.result ?? raw) as Record<string, unknown>;
    }

    const failed =
      !resp.ok ||
      queueState === "FAILED" ||
      queueState === "ERROR" ||
      Boolean(raw.error) ||
      (upstream != null && upstream >= 400);

    if (failed) {
      throw new FalDiagnosticError(
        buildFalDiagnostic({
          // A CC-level HTTP failure is "polling"; a provider terminal fail is
          // "processing" (the job ran and failed upstream).
          phase: !resp.ok ? "polling" : "processing",
          ctx,
          submittedAt,
          ccHttpStatus: resp.status,
          falStatus,
          providerStatus: queueState || (raw.error ? "FAILED" : null),
          responseBody: raw,
        }),
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new FalDiagnosticError(
    buildFalDiagnostic({
      phase: lastQueueState && lastQueueState !== "IN_QUEUE" ? "polling" : "queueing",
      ctx,
      submittedAt,
      timeout: true,
      message: `poll_timeout (last_state=${lastQueueState || "unknown"})`,
    }),
  );
}
