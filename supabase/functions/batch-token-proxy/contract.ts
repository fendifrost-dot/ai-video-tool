// batch-token-proxy — the decidable half: request parsing, secret handling, limits.
//
// Split out from index.ts so it can be tested without an edge runtime, the same
// split `_shared/capabilityRegistry` and Control Center's `muse-executive` use.

/** Actions the function accepts. `session` is the only one a runner uses. */
export const BATCH_ACTIONS = ["session", "enroll", "list", "revoke"] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];

/** Mints allowed per credential per window. Generous for a runner, finite for a leak. */
export const RATE_LIMIT_MINTS = 12;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;

/** Secrets are issued at this length; shorter ones are rejected outright. */
export const SECRET_BYTES = 32;

export type ParsedRequest =
  | { ok: true; action: BatchAction; label?: string; credentialId?: string; expiresInDays?: number }
  | { ok: false; error: string };

/**
 * Parse and validate the request body.
 *
 * Note what is NOT accepted on any action: an email, a user id, or anything else
 * naming WHOSE session to mint. The owner comes from the credential row. A field
 * here would be the whole vulnerability, so there is no field here.
 */
export function parseRequest(body: unknown): ParsedRequest {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;

  const action = b.action;
  if (typeof action !== "string" || !(BATCH_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `action must be one of ${BATCH_ACTIONS.join(", ")}` };
  }
  // `.includes` on a widened string[] does not narrow, so assert once here.
  const act = action as BatchAction;

  // Guard against a caller trying to steer whose session is minted. These keys are
  // meaningless to this function; their presence means the caller misunderstands the
  // contract, and silently ignoring them would hide that.
  for (const forbidden of ["email", "user_id", "userId", "owner", "owner_user_id", "sub"]) {
    if (forbidden in b) {
      return {
        ok: false,
        error: `${forbidden} is not accepted — the owner is bound to the credential, not supplied per request`,
      };
    }
  }

  if (act === "enroll") {
    const label = typeof b.label === "string" ? b.label.trim() : "";
    if (!label || label.length > 80)
      return { ok: false, error: "enroll needs a label of 1–80 characters" };
    let expiresInDays: number | undefined;
    if (b.expiresInDays !== undefined && b.expiresInDays !== null) {
      const d = Number(b.expiresInDays);
      if (!Number.isFinite(d) || d <= 0 || d > 3650)
        return { ok: false, error: "expiresInDays must be 1–3650" };
      expiresInDays = Math.floor(d);
    }
    return { ok: true, action: act, label, expiresInDays };
  }

  if (act === "revoke") {
    const credentialId = typeof b.credentialId === "string" ? b.credentialId.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(credentialId))
      return { ok: false, error: "revoke needs a credentialId (uuid)" };
    return { ok: true, action: act, credentialId };
  }

  return { ok: true, action: act };
}

/** The runner's secret travels in its own header, never in the body or a query string. */
export const SECRET_HEADER = "x-batch-secret";

export function readSecret(headers: Headers): string | null {
  const v = headers.get(SECRET_HEADER)?.trim();
  return v && v.length > 0 ? v : null;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare so a secret cannot be recovered byte by byte from timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type CredentialRow = {
  id: string;
  owner_user_id: string;
  revoked_at: string | null;
  expires_at: string | null;
};

export type CredentialCheck =
  | { ok: true; ownerUserId: string; credentialId: string }
  | { ok: false; reason: string };

/**
 * Decide whether a looked-up credential may mint, and for whom.
 *
 * The owner it returns is the row's — there is no other source. Every refusal is a
 * refusal to mint anything at all, never a fallback to some default account.
 */
export function checkCredential(row: CredentialRow | null, now: Date): CredentialCheck {
  if (!row) return { ok: false, reason: "unknown credential" };
  if (row.revoked_at) return { ok: false, reason: "credential revoked" };
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: "credential expired" };
  }
  if (!row.owner_user_id) return { ok: false, reason: "credential has no bound owner" };
  return { ok: true, ownerUserId: row.owner_user_id, credentialId: row.id };
}

/** Fixed window over the mint audit — no separate counter to drift. */
export function rateLimited(mintsInWindow: number): boolean {
  return mintsInWindow >= RATE_LIMIT_MINTS;
}

export function windowStart(now: Date): string {
  return new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
}
