// batch-token-proxy — the decidable half: request parsing, secret handling, limits.
//
// Split out from index.ts so it can be tested without an edge runtime, the same
// split `_shared/capabilityRegistry` and Control Center's `muse-executive` use.

/** Actions the function accepts. `session` is the only one a runner uses. */
export const BATCH_ACTIONS = ["session", "enroll", "list", "revoke"] as const;
export type BatchAction = (typeof BATCH_ACTIONS)[number];

/**
 * NO FIXED MINT CAP. There used to be one — 12 per hour, then 120 — and it was the wrong control.
 *
 * WHY IT WAS REMOVED (9 Oct 2026, the owner's call, during an authorized video review)
 *   It never bounded what a leak could do. A mint hands back a whole session, so one mint is already everything;
 *   the cap only limited HOW MANY sessions an hour, which an attacker does not need. Meanwhile it reliably broke
 *   honest work, because the mint rate tracked EDGE ISOLATE CHURN rather than request count: avt-mcp cached its
 *   session in isolate memory, and a cold isolate — most calls in an AI conversation — had no token to reuse and
 *   no refresh token to renew, so it minted. Raising the number moved the wall and nothing else.
 *
 * WHAT BOUNDS A LEAK INSTEAD, all of it stronger than a counter:
 *   revocation, which now deletes the stored session and signs it out, so it ends access rather than only
 *   stopping future mints; `expires_at` on the credential; one audit row per use in `batch_credential_mints`,
 *   which is what actually shows a leak; and the session-age bound below, so reuse cannot make one session
 *   immortal.
 *
 * Provider spend is NOT a concern of this file and never was. It is controlled on the provider accounts
 * themselves (see avt-mcp/index.ts) — a token limit here would be a confusing proxy for it and is not one.
 */

/**
 * How long before an access token expires we stop handing it out. A caller must have time to finish the
 * request it is about to make with it.
 */
export const BATCH_SESSION_MIN_REMAINING_SECONDS = 120;

/**
 * How long a single minted session may be kept alive by refreshing before the proxy mints a fresh one. Bounds
 * the refresh chain: reuse must not turn one mint into permanent access. Twelve hours costs honest work two
 * mints a day and gives a leaked secret a session with an end.
 */
export const BATCH_SESSION_MAX_AGE_SECONDS = 12 * 3600;

/** The stored session row, as the proxy reads it. */
export type StoredSession = {
  credential_id: string;
  owner_user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  minted_at: string;
  /** Statistics, not limits: how often reuse and refresh have saved a mint. */
  reuse_count?: number;
  refresh_count?: number;
};

/**
 * What to do with a stored session: hand it back, renew it, or mint a new one.
 *
 *   reuse    the access token has comfortable life left — no network call at all
 *   refresh  it is expiring but the session is still inside its age bound
 *   mint     there is nothing stored, it belongs to a different owner, or the session is too old to renew
 *
 * The owner check is not paranoia about a race: if a credential were ever re-bound, a stored session for the
 * PREVIOUS owner must never be handed to the new one. It is cheaper to compare than to reason about.
 */
export type SessionPlan = { use: "reuse" | "refresh" | "mint"; reason: string };

export function planSession(
  stored: StoredSession | null | undefined,
  ownerUserId: string,
  now: Date,
): SessionPlan {
  if (!stored) return { use: "mint", reason: "no stored session" };
  if (stored.owner_user_id !== ownerUserId) return { use: "mint", reason: "stored session belongs to another owner" };

  const nowMs = now.getTime();
  const ageSeconds = (nowMs - new Date(stored.minted_at).getTime()) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds >= BATCH_SESSION_MAX_AGE_SECONDS) {
    return { use: "mint", reason: "session older than the refresh bound" };
  }

  const remaining = (new Date(stored.expires_at).getTime() - nowMs) / 1000;
  if (!Number.isFinite(remaining)) return { use: "mint", reason: "stored session has no usable expiry" };
  if (remaining > BATCH_SESSION_MIN_REMAINING_SECONDS) return { use: "reuse", reason: "stored access token still valid" };
  return { use: "refresh", reason: "stored access token expiring" };
}

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

/**
 * `rateLimited` and `windowStart` were here. They are gone rather than kept at a higher number: a dead knob with
 * a plausible name is the thing a future change turns back on without reading why it was off.
 */
