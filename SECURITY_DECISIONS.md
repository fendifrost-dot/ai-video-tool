# SECURITY_DECISIONS.md — AI Video Tool (AVT)

> Append-only log of deliberate, security-relevant one-time actions taken against
> the live system (identity, auth, ownership, secrets). Each entry records what was
> decided, why it was safe, the evidence it succeeded, and the cleanup performed.
> Sits alongside [`SECURITY.md`](SECURITY.md), the [`RISK_REGISTER.md`](RISK_REGISTER.md),
> and the RISK-001 identity-remediation history under
> [`docs/security/RISK-001/`](docs/security/RISK-001/).

---

## 2026-08-12 — One-time email repair of the durable AVT auth account

**Decision:** One-time, in-place email change of the ONE durable AVT auth account —
no new identity created, no account merge, no data re-ownership.

**Context / lineage:** Follow-up to the RISK-001 / RISK-002 identity-remediation work
that consolidated 20 legacy anonymous per-device UIDs into the single durable account
(see [`docs/security/RISK-001/IDENTITY_CONSOLIDATION.md`](docs/security/RISK-001/IDENTITY_CONSOLIDATION.md)
and [`RISK_REGISTER.md`](RISK_REGISTER.md) RISK-001 / RISK-002). That durable account
carried a temporary placeholder login email; this repair set it to the operator's real
address while preserving the durable UID that all owner-scoped data hangs off of.

**Target (compile-time constants, non-overridable):**
- **UID (preserved):** `3ca10935-8c3d-4479-9a0c-8bfe8050840c`
- **Email:** `temp-smoke-…@lovable.invalid` → `fendifrost@gmail.com`
- **`email_confirm`:** set `true`

**Method:** Supabase officially-supported, UID-preserving admin path
`auth.admin.updateUserById(uid, { email, email_confirm: true })` — NOT raw SQL.
Executed via a single-purpose, hard-guarded edge function
(`admin-repair-account-email`): `verify_jwt = true` at the platform layer plus a
constant-time-checked operator secret (`ACCOUNT_REPAIR_OPERATOR_SECRET` via
`x-operator-secret`). Target UID + email were hard-coded constants; the request body
could not supply or repurpose either.

**Outcome — verified CLEAN (2026-08-12):**
- Durable UID **unchanged**: `3ca10935-8c3d-4479-9a0c-8bfe8050840c`.
- Email now `fendifrost@gmail.com`; **`email_confirmed_at` = 2026-08-12T08:10:05Z**.
- **No** second account created and **no** merge performed.
- Owner-scoped data intact under the same UID: **artists ×5, artist_looks ×219,
  character_features ×101**.

**Evidence:**
- The function's execute-time before/after snapshot + post-update invariant assertion
  block (asserts UID unchanged and email == target).
- An independent, idempotent dry-run confirming convergence: `would_change.email: false`.

**Cleanup (post-verification, this entry):**
- Source removed from `main`: deleted `supabase/functions/admin-repair-account-email/`
  (`index.ts`, `guards.ts`, `guards.test.ts`) and its
  `[functions.admin-repair-account-email]` block in `supabase/config.toml`.
- Lovable-side removal (undeploy the live edge function + delete the one-time
  `ACCOUNT_REPAIR_OPERATOR_SECRET` edge secret) handled in parallel via the Lovable
  console — not a git action.

**Blast radius:** Single account, single field. No schema change, no RLS change, no
other function or secret touched.
