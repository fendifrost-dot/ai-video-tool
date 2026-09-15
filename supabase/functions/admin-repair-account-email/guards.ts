// AVT edge function — admin-repair-account-email / guards
//
// Pure, dependency-free guard + invariant logic for the one-time account-email
// repair. Kept in its own module (no Deno / esm.sh URL imports) so it can be
// unit-tested under vitest alongside the rest of the repo, and so the
// hard-coded target is defined in exactly one place.

// ---- HARD-CODED, NON-OVERRIDABLE TARGET -----------------------------------
// The ONLY account/email this function will ever act on. Not read from the
// request, the environment, or the database.
export const TARGET_UID = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";
export const TARGET_EMAIL = "fendifrost@gmail.com";

/** A minimal, safe projection of a GoTrue user for before/after reporting. */
export type UserSnapshot = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  identities_emails: string[];
};

/** Length-independent constant-time compare (matches compose-look-callback). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// deno-lint-ignore no-explicit-any
export function snapshot(user: any): UserSnapshot {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return {
    id: String(user?.id ?? ""),
    email: user?.email ?? null,
    email_confirmed_at: user?.email_confirmed_at ?? null,
    identities_emails: identities
      // deno-lint-ignore no-explicit-any
      .map((i: any) => i?.identity_data?.email ?? i?.email ?? null)
      .filter((e: unknown): e is string => typeof e === "string"),
  };
}

/**
 * The invariant this whole function exists to prove. Pure so it can be
 * unit-tested without hitting the network. Returns the list of violated
 * invariants (empty === all good).
 *
 *   1. UID is EXACTLY TARGET_UID, and unchanged between before/after.
 *   2. Email is now EXACTLY TARGET_EMAIL.
 */
export function assertRepairInvariants(
  before: UserSnapshot,
  after: UserSnapshot,
): string[] {
  const violations: string[] = [];
  if (after.id !== TARGET_UID) {
    violations.push(`after.id (${after.id}) != TARGET_UID (${TARGET_UID})`);
  }
  if (before.id !== after.id) {
    violations.push(`UID changed: before ${before.id} -> after ${after.id}`);
  }
  if (after.email !== TARGET_EMAIL) {
    violations.push(`after.email (${after.email}) != TARGET_EMAIL (${TARGET_EMAIL})`);
  }
  return violations;
}
