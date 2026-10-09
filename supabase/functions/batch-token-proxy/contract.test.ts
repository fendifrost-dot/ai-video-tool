// batch-token-proxy contract tests.
//
// The property worth guarding here is not "the parser rejects bad input" — it is that
// there is NO WAY to name whose session gets minted. Everything else in this function is
// bookkeeping; that one property is what makes a long-lived machine credential safe to
// leave on disk in a runner.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  BATCH_ACTIONS,
  checkCredential,
  newSecret,
  parseRequest,
  BATCH_SESSION_MAX_AGE_SECONDS,
  BATCH_SESSION_MIN_REMAINING_SECONDS,
  planSession,
  readSecret,
  SECRET_HEADER,
  sha256Hex,
  timingSafeEqual,
  type StoredSession,
} from "./contract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, "./index.ts"), "utf8");
// Source-level assertions below guard WHICH identifier reaches a call, not how prettier
// chose to wrap it — so they run against a whitespace-collapsed copy.
const flat = indexSource.replace(/\s+/g, " ");

describe("the owner cannot be supplied by the caller", () => {
  it.each(["email", "user_id", "userId", "owner", "owner_user_id", "sub"])(
    "rejects a %s field instead of ignoring it",
    (field) => {
      const r = parseRequest({ action: "session", [field]: "someone-else@example.com" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(field);
    },
  );

  it("mints for the credential's owner, never for anything passed in", () => {
    const check = checkCredential(
      { id: "cred-1", owner_user_id: "owner-abc", revoked_at: null, expires_at: null },
      new Date("2026-10-02T00:00:00Z"),
    );
    expect(check).toEqual({ ok: true, ownerUserId: "owner-abc", credentialId: "cred-1" });
  });

  it("resolves the owner's email from the bound id, not from the request", () => {
    expect(flat).toContain("admin.auth.admin.getUserById( check.ownerUserId,");
    // generateLink takes an email; it must be the one resolved above and nothing else.
    expect(flat).toContain('generateLink({ type: "magiclink", email, })');
  });

  it("enrols against the verified JWT subject, not the body", () => {
    expect(flat).toContain("owner_user_id: user.id");
  });
});

describe("credential lifecycle", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("refuses an unknown credential", () => {
    expect(checkCredential(null, now)).toEqual({ ok: false, reason: "unknown credential" });
  });

  it("refuses a revoked credential even before it expires", () => {
    const r = checkCredential(
      {
        id: "c",
        owner_user_id: "o",
        revoked_at: "2026-09-01T00:00:00Z",
        expires_at: "2027-01-01T00:00:00Z",
      },
      now,
    );
    expect(r).toEqual({ ok: false, reason: "credential revoked" });
  });

  it("refuses an expired credential", () => {
    const r = checkCredential(
      { id: "c", owner_user_id: "o", revoked_at: null, expires_at: "2026-10-01T00:00:00Z" },
      now,
    );
    expect(r).toEqual({ ok: false, reason: "credential expired" });
  });

  it("accepts a credential expiring later today", () => {
    const r = checkCredential(
      { id: "c", owner_user_id: "o", revoked_at: null, expires_at: "2026-10-02T23:00:00Z" },
      now,
    );
    expect(r.ok).toBe(true);
  });

  it("refuses a row with no bound owner rather than falling back to anyone", () => {
    const r = checkCredential(
      { id: "c", owner_user_id: "", revoked_at: null, expires_at: null },
      now,
    );
    expect(r).toEqual({ ok: false, reason: "credential has no bound owner" });
  });
});

describe("secrets", () => {
  it("issues 64 hex characters and never the same one twice", () => {
    const a = newSecret();
    const b = newSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashes to the 64-hex shape the migration's CHECK constraint demands", async () => {
    expect(await sha256Hex(newSecret())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compares in constant time and still compares correctly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("reads the secret from its own header, not the body", () => {
    expect(readSecret(new Headers({ [SECRET_HEADER]: "  s3cret  " }))).toBe("s3cret");
    expect(readSecret(new Headers({ [SECRET_HEADER]: "   " }))).toBeNull();
    expect(readSecret(new Headers())).toBeNull();
  });

  it("refuses a Supabase project key offered as a batch credential", () => {
    // A 403 with a reason, rather than hashing it and reporting "unknown credential",
    // which would read like a typo and invite a retry with the same god key.
    expect(flat).toContain("a Supabase project key is not a batch credential");
  });

  it("stores only the hash — the plaintext is returned once and never read back", () => {
    expect(flat).toContain("secret_sha256: await sha256Hex(secret)");
    expect(flat).not.toMatch(/select\([^)]*\bsecret\b(?!_sha256)/);
  });
});

describe("request parsing", () => {
  it("accepts every declared action and nothing else", () => {
    for (const action of BATCH_ACTIONS)
      expect(parseRequest({ action }).ok).toBe(action !== "enroll" && action !== "revoke");
    expect(parseRequest({ action: "delete_everything" }).ok).toBe(false);
    expect(parseRequest(null).ok).toBe(false);
    expect(parseRequest("session").ok).toBe(false);
  });

  it("requires a usable label on enroll", () => {
    expect(parseRequest({ action: "enroll", label: "broll runner" })).toMatchObject({
      ok: true,
      label: "broll runner",
    });
    expect(parseRequest({ action: "enroll", label: "   " }).ok).toBe(false);
    expect(parseRequest({ action: "enroll", label: "x".repeat(81) }).ok).toBe(false);
  });

  it("bounds and floors expiresInDays", () => {
    expect(parseRequest({ action: "enroll", label: "r", expiresInDays: 30.7 })).toMatchObject({
      expiresInDays: 30,
    });
    expect(parseRequest({ action: "enroll", label: "r", expiresInDays: 0 }).ok).toBe(false);
    expect(parseRequest({ action: "enroll", label: "r", expiresInDays: 4000 }).ok).toBe(false);
    expect(parseRequest({ action: "enroll", label: "r" })).toMatchObject({
      ok: true,
      expiresInDays: undefined,
    });
  });

  it("requires a uuid on revoke", () => {
    expect(
      parseRequest({ action: "revoke", credentialId: "11111111-2222-3333-4444-555555555555" }).ok,
    ).toBe(true);
    expect(parseRequest({ action: "revoke", credentialId: "nope" }).ok).toBe(false);
    expect(parseRequest({ action: "revoke" }).ok).toBe(false);
  });
});

describe("reusing a session instead of minting one", () => {
  // The bug this replaces: avt-mcp cached its session in isolate memory, a cold isolate had nothing to reuse,
  // and so every cold isolate minted. The mint rate tracked isolate churn, not requests — which is why raising
  // the cap from 12 to 120 moved the wall instead of removing it.
  const AT = new Date("2026-10-09T12:00:00Z");
  const stored = (over: Partial<StoredSession> = {}): StoredSession => ({
    credential_id: "cred-1",
    owner_user_id: "owner-1",
    access_token: "at",
    refresh_token: "rt",
    expires_at: new Date(AT.getTime() + 3600_000).toISOString(),
    minted_at: new Date(AT.getTime() - 600_000).toISOString(),
    ...over,
  });

  it("hands back a token with life left, making no network call at all", () => {
    expect(planSession(stored(), "owner-1", AT)).toEqual({
      use: "reuse",
      reason: "stored access token still valid",
    });
  });

  it("renews one that is expiring rather than minting a second session", () => {
    const expiring = stored({
      expires_at: new Date(AT.getTime() + (BATCH_SESSION_MIN_REMAINING_SECONDS - 10) * 1000).toISOString(),
    });
    expect(planSession(expiring, "owner-1", AT).use).toBe("refresh");
  });

  it("will not hand out a token too close to expiry for the caller to use it", () => {
    const edge = stored({
      expires_at: new Date(AT.getTime() + BATCH_SESSION_MIN_REMAINING_SECONDS * 1000).toISOString(),
    });
    expect(planSession(edge, "owner-1", AT).use).toBe("refresh");
  });

  it("mints when there is nothing stored — the cold-start case, now once per session not once per isolate", () => {
    expect(planSession(null, "owner-1", AT).use).toBe("mint");
    expect(planSession(undefined, "owner-1", AT).use).toBe("mint");
  });

  it("stops refreshing past the age bound, so reuse cannot make one mint permanent", () => {
    const old = stored({ minted_at: new Date(AT.getTime() - (BATCH_SESSION_MAX_AGE_SECONDS + 1) * 1000).toISOString() });
    expect(planSession(old, "owner-1", AT)).toEqual({
      use: "mint",
      reason: "session older than the refresh bound",
    });
    // exactly at the bound counts as too old: the comparison is >=, so there is no off-by-one window
    const atBound = stored({ minted_at: new Date(AT.getTime() - BATCH_SESSION_MAX_AGE_SECONDS * 1000).toISOString() });
    expect(planSession(atBound, "owner-1", AT).use).toBe("mint");
  });

  it("NEVER hands another owner's stored session to this credential's owner", () => {
    // owner isolation is the one property that makes a machine credential safe to leave on disk; a stored
    // session must not become a way around it
    expect(planSession(stored({ owner_user_id: "someone-else" }), "owner-1", AT)).toEqual({
      use: "mint",
      reason: "stored session belongs to another owner",
    });
  });

  it("mints rather than trusting an unreadable date", () => {
    expect(planSession(stored({ expires_at: "not a date" }), "owner-1", AT).use).toBe("mint");
    expect(planSession(stored({ minted_at: "not a date" }), "owner-1", AT).use).toBe("mint");
  });
});

describe("the fixed mint cap is gone, not hidden", () => {
  it("exports no rate-limit knob a later change could turn back on", () => {
    const contract = readFileSync(resolve(here, "./contract.ts"), "utf8");
    expect(contract).not.toMatch(/export const RATE_LIMIT/);
    expect(contract).not.toMatch(/export function rateLimited/);
  });

  it("no longer refuses a session with the error the owner hit", () => {
    // the prose above quotes that error on purpose, so assert on what is RETURNED, not on the phrase
    expect(flat).not.toContain('error: "rate_limited"');
    expect(flat).not.toContain("RATE_LIMIT_MINTS");
    expect(flat).not.toContain("return json(429");
  });

  it("still audits every use of a credential, which is what shows a leak", () => {
    // the cap is gone; the audit row is not, and now distinguishes the three ways a session is served
    expect(flat).toContain('audit("minted"');
    expect(flat).toContain('audit("reused"');
    expect(flat).toContain('audit("refreshed"');
    expect(flat).toContain('audit("denied"');
  });

  it("keeps spend out of it: no budget or credit logic lives in this function", () => {
    expect(flat).not.toMatch(/budget|spend_cap|credits_remaining/i);
  });
});

describe("the function can actually boot", () => {
  // supabase/functions/** is OUTSIDE tsconfig.json's `include`, so NOTHING typechecks these files: a stale
  // import survives tsc, every unit test that does not import index.ts, and lands as a Deno module-resolution
  // error at deploy — the connector simply stops answering. This test is the only thing standing there.
  // It caught `rateLimited` and `windowStart` still being imported after the rate limit was deleted.
  it("imports from contract.ts only what contract.ts exports", () => {
    const contract = readFileSync(resolve(here, "./contract.ts"), "utf8");
    // [^}]* so the match cannot start at an earlier import block and run across into this one
    const block = indexSource.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/contract\.ts"/);
    expect(block, "index.ts should import from ./contract.ts").not.toBeNull();
    const imported = block![1]
      .split(",")
      .map((x) => x.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    expect(imported.length).toBeGreaterThan(3);
    const missing = imported.filter(
      (name) => !new RegExp(`export\\s+(async\\s+)?(const|function|type|class)\\s+${name}\\b`).test(contract),
    );
    expect(missing, `imported from contract.ts but not exported by it: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("revocation ends access, it does not only stop future mints", () => {
  it("signs the stored session out at the auth server and deletes the row", () => {
    expect(flat).toContain("auth.admin.signOut");
    expect(flat).toContain('.from("batch_credential_sessions").delete()');
  });

  it("signs out THIS session only — never the owner's browser logins", () => {
    expect(flat).toContain('"local"');
    expect(flat).not.toMatch(/signOut\([^)]*"global"/);
  });

  it("reports which of the two happened instead of saying 'revoked' and leaving it ambiguous", () => {
    expect(flat).toContain("deleted_but_sign_out_failed");
  });
});

describe("revoke is scoped", () => {
  it("only touches the caller's own active rows", () => {
    expect(flat).toContain('.eq("owner_user_id", user.id)');
    expect(flat).toContain('.is("revoked_at", null)');
  });
});

describe("the worker cannot die silently", () => {
  it("wraps the handler so a throw becomes a described 500, not a bare 503", () => {
    expect(flat).toContain("unhandled_exception");
    expect(flat).toMatch(/serve\(async \(req\) => \{ try \{/);
  });
});
