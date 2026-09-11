import { describe, expect, it } from "vitest";
import {
  assertRepairInvariants,
  constantTimeEqual,
  snapshot,
  TARGET_EMAIL,
  TARGET_UID,
  type UserSnapshot,
} from "./guards";

// The one account/email this function is allowed to touch. If either of these
// ever changes, that is a deliberate, reviewable edit — the test pins them.
describe("hard-coded target", () => {
  it("is the durable AVT UID", () => {
    expect(TARGET_UID).toBe("3ca10935-8c3d-4479-9a0c-8bfe8050840c");
  });
  it("is fendifrost@gmail.com", () => {
    expect(TARGET_EMAIL).toBe("fendifrost@gmail.com");
  });
});

describe("constantTimeEqual", () => {
  it("matches identical strings", () => {
    expect(constantTimeEqual("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("rejects different strings of equal length", () => {
    expect(constantTimeEqual("s3cr3t", "s3cr3x")).toBe(false);
  });
  it("rejects different lengths", () => {
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });
  it("rejects empty vs non-empty", () => {
    expect(constantTimeEqual("", "x")).toBe(false);
  });
});

describe("snapshot", () => {
  it("projects id/email/verification and identity emails", () => {
    const s = snapshot({
      id: TARGET_UID,
      email: "old@example.com",
      email_confirmed_at: null,
      identities: [{ identity_data: { email: "old@example.com" } }],
    });
    expect(s.id).toBe(TARGET_UID);
    expect(s.email).toBe("old@example.com");
    expect(s.email_confirmed_at).toBeNull();
    expect(s.identities_emails).toEqual(["old@example.com"]);
  });

  it("is null-safe for missing fields", () => {
    const s = snapshot({});
    expect(s.id).toBe("");
    expect(s.email).toBeNull();
    expect(s.identities_emails).toEqual([]);
  });
});

const before: UserSnapshot = {
  id: TARGET_UID,
  email: "old@example.com",
  email_confirmed_at: null,
  identities_emails: ["old@example.com"],
};

describe("assertRepairInvariants — the UID-preservation proof", () => {
  it("passes when UID is unchanged and email became the target", () => {
    const after: UserSnapshot = {
      id: TARGET_UID,
      email: TARGET_EMAIL,
      email_confirmed_at: "2026-08-09T00:00:00Z",
      identities_emails: [TARGET_EMAIL],
    };
    expect(assertRepairInvariants(before, after)).toEqual([]);
  });

  it("FAILS if the UID changed (the guarantee we must never break)", () => {
    const after: UserSnapshot = {
      id: "00000000-0000-0000-0000-000000000000",
      email: TARGET_EMAIL,
      email_confirmed_at: "2026-08-09T00:00:00Z",
      identities_emails: [TARGET_EMAIL],
    };
    const v = assertRepairInvariants(before, after);
    expect(v.length).toBeGreaterThan(0);
    expect(v.join(" ")).toContain(TARGET_UID);
  });

  it("FAILS if the email is not exactly the target", () => {
    const after: UserSnapshot = {
      id: TARGET_UID,
      email: "someone-else@example.com",
      email_confirmed_at: "2026-08-09T00:00:00Z",
      identities_emails: ["someone-else@example.com"],
    };
    const v = assertRepairInvariants(before, after);
    expect(v.some((m) => m.includes("TARGET_EMAIL"))).toBe(true);
  });
});
