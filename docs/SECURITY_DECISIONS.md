# SECURITY_DECISIONS.md — AI Video Tool (AVT)

> Append-only log of **security decisions** — each a deliberate choice about the
> security posture, recorded so the *reasoning* survives, not just the diff. Every
> entry: id, date, decision, reason, the alternative(s) considered, why the
> alternative was rejected, and the evidence. Referenced by the **STANDING PRINCIPLE**
> in [`../SECURITY.md`](../SECURITY.md) §2: *every public policy must have a documented
> business justification* — this file is where those justifications live.

Format per entry: **SEC-NNN** · Date · Decision · Reason · Alternative · Rejected
because · Evidence.

---

## SEC-001 — Remove anon `USING(true)` policies; restore least-privilege RLS

- **Date:** 2026-08-06
- **Decision:** Remove the accidental `FOR ALL TO anon, authenticated USING (true)
  WITH CHECK (true)` policies on `artists`, `character_features`, `location_library`,
  `prop_library`, `artist_looks` — **and** the stray `*_open_test` / `single_tenant_all`
  permissive policies the identity audit found live on those tables — and **restore
  owner-scoped least-privilege policies** (`user_id = auth.uid()`, and for
  `character_features` the `artist_id → artists.user_id` join). **Split for sequencing:**
  - **Part A (authored now):** the five TABLES only — revert migration
    `supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql`.
  - **Part B (deferred):** the `look-composites` **storage bucket** (drop anon policies,
    restore owner-folder-prefix), which must run **only AFTER the storage re-key** —
    doing it first would strand objects written under the old key layout. Until Part B
    applies, the bucket stays exposed (tracked residual).
- **Reason:** A **dev bootstrap accidentally reached production.** The dev-only migration
  `20260523171003_*.sql` (header: *"DEV ONLY … Revert before production"*) opened these
  objects to the public `anon` role to work around anonymous-auth `user_id` churn during
  development, and was never reverted. It sits on the production-track migration path,
  so any holder of the public anon key can read/write/delete every tenant's identity and
  wardrobe data and all rendered composites.
- **Alternative considered:** Leave the objects public (keep `USING(true)`) — the
  zero-effort option, and the one that avoids the anonymous-uid continuity side effect.
- **Rejected because:** It is **identity / data exposure** — full loss of per-user
  isolation on identity records (incl. `artists.identity_profile_json` → LoRA URL /
  training state), wardrobe reference features, and look composites; cross-tenant read,
  tamper, and delete by an unauthenticated client. No business justification exists for
  public write access to per-user data (SECURITY.md §2 STANDING PRINCIPLE), so the policy
  cannot stand.
- **Evidence:** RLS forensic **RISK-001** —
  [`security/RISK-001/evidence/RLS_FORENSIC_P0_2026-08-05.md`](security/RISK-001/evidence/RLS_FORENSIC_P0_2026-08-05.md)
  (immutable, checksummed); impact trace
  [`security/RISK-001/IMPACT_REPORT.md`](security/RISK-001/IMPACT_REPORT.md); tracked as
  RISK-001 in [`../RISK_REGISTER.md`](../RISK_REGISTER.md).
- **Related decision (unchanged):** `provider_capabilities`'s `SELECT ... USING (true)`
  is a **read-only public catalog** and is deliberately **left public** — a documented,
  justified exception (SECURITY.md §2.2), explicitly out of scope for this change.
- **Status:** Part A revert migration (tables) authored; **NOT applied, NOT merged.**
  Awaiting Class-C architecture + security review, then apply per
  [`security/RISK-001/VERIFICATION_PLAN.md`](security/RISK-001/VERIFICATION_PLAN.md)
  (including the §A0 complete live-policy inventory run immediately before deploy). Part B
  (storage bucket) is deferred until after the storage re-key.
