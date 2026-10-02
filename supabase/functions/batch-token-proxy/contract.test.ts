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
  RATE_LIMIT_MINTS,
  rateLimited,
  readSecret,
  SECRET_HEADER,
  sha256Hex,
  timingSafeEqual,
  windowStart,
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

describe("rate limit", () => {
  it("allows up to the ceiling and blocks at it", () => {
    expect(rateLimited(0)).toBe(false);
    expect(rateLimited(RATE_LIMIT_MINTS - 1)).toBe(false);
    expect(rateLimited(RATE_LIMIT_MINTS)).toBe(true);
  });

  it("counts a fixed window ending now", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(windowStart(now)).toBe("2026-10-02T11:00:00.000Z");
  });

  it("counts only successful mints, so a brute force cannot lock the owner out", () => {
    // A denied attempt is audited but must not consume the owner's quota — otherwise
    // anyone who learns the credential id can deny service by failing repeatedly.
    expect(flat).toContain('.eq("outcome", "minted")');
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
