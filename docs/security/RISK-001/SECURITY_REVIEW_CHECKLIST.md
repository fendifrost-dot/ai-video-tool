# RISK-001 — Security-Review Checklist (Class-C, pre-merge) — PART A (TABLE-ONLY)

This is a **security** review, distinct from ordinary code review. A Class-C reviewer
must be able to confirm every question below before this PR merges. It gates the revert
migration `20260806120000_risk_001_revert_anon_rls.sql`, whose scope is **PART A — the
five tenant TABLES only**. The `look-composites` storage bucket is **PART B** (a separate
migration after the storage re-key) and is out of scope here — §5 records why.

Answers below are the **author's completed self-review** (attested against the migration
text and IMPACT_REPORT / VERIFICATION_PLAN). `[x]` = author attests; the reviewer
counter-signs in §Sign-off. Items that can only be settled against the **live DB** are
marked **[apply-time]** and are bound to the §A0 pre-deploy inventory + VERIFICATION_PLAN.

> Merge does **not** apply the migration. Apply is a separate, reviewed step on the live
> DB per the VERIFICATION_PLAN. This checklist gates *merge of the authored fix*.

---

## 1. Privilege escalation — does the change grant anyone MORE than before?
**ANSWER: No.** The migration only removes access and re-scopes to `auth.uid()`; it grants
nothing new.
- [x] No policy uses `USING (true)` / `WITH CHECK (true)` on any of the five tables. Only
      `auth.uid()`-scoped predicates remain (`artists.user_id = auth.uid()`; the others
      `user_id = auth.uid()`; `character_features` via the `artist_id → artists.user_id`
      join). Grep confirms zero `using (true)` in the committed `begin…commit` body.
- [x] No new `GRANT`, role change, `SECURITY DEFINER` function, or `BYPASSRLS` is
      introduced. The migration is only `DROP/CREATE POLICY` + idempotent `ENABLE RLS`.
- [x] `character_features` is scoped through `artist_id → artists.user_id`, not a
      fabricated `user_id` column (which does not exist) — the join cannot be widened by a
      malformed predicate.
- [x] Net effect is strictly **narrowing**: three permissive families are dropped
      (`*_anon_all`, `*_open_test`, `single_tenant_all`) and replaced by owner-scoped
      policies. No caller gains any access they lacked.
- [ ] **[apply-time]** No storage/bucket privilege is changed by Part A (it touches no
      `storage.objects`) — bucket privilege is Part B's review.

## 2. Accidental deny — does it lock out legitimate access it shouldn't?
**ANSWER: No new deny for the happy path; the one known continuity side effect
(anon-uid churn) is acknowledged and gated behind the §A2 go/no-go before apply.**
- [x] Owner CRUD for the current session is preserved on all five tables — `artists` has
      four command-specific policies (SELECT/INSERT/UPDATE/DELETE); the other four tables
      use a single `FOR ALL` policy covering every command.
- [x] `INSERT WITH CHECK (user_id = auth.uid())` is satisfied by the app, which stamps
      `user_id` from the session (`artists.ts:99`, `faceRestore.ts:277`, etc. — see
      IMPACT_REPORT §2).
- [x] Service-role edge paths are unaffected (RLS-exempt) — no function relies on the anon
      `USING(true)` policy for a *user-scoped* read it should not have (IMPACT_REPORT §1).
- [x] The known continuity side effect (anon-uid churn, IMPACT_REPORT §5) is acknowledged;
      the go/no-go owner-count check (VERIFICATION_PLAN §A2) is scheduled **before apply**.
- [x] Dropping the stray `*_open_test` / `single_tenant_all` policies removes *extra*
      access, not legitimate access — they are permissive `USING(true)`-class strays with
      no owning migration, so no sanctioned code path depends on them.

## 3. Policy overlap — do multiple policies interact unexpectedly?
**ANSWER: No residual overlap — every permissive policy on the five tables is dropped
before the owner-scoped set is created, and the §A0 inventory proves it against live.**
- [x] For each table, exactly the intended owner-scoped policies exist after apply; no
      leftover permissive policy ORs the restrictive ones back open (PostgreSQL RLS is a
      **union** of permissive policies — one stray `USING(true)` re-opens everything).
      This is precisely why the drop list was widened to include `*_open_test` and
      `single_tenant_all`.
- [x] `artists` has four command-specific policies that do not overlap ambiguously; the
      other tables use a single `FOR ALL` policy (no mixed FOR ALL + per-command
      duplicates that could widen access).
- [ ] **[apply-time]** §A0.2 (complete live inventory, name-agnostic) returns **0**
      unexpected permissive policies **after** the drops — this is the authoritative
      overlap check and MUST be run against the live DB immediately before apply, because
      live drift can exceed any committed snapshot.

## 4. Orphan policies — anything dropped/created that shouldn't be, or left dangling?
**ANSWER: No orphans. Every drop is justified; every create is an intended owner policy;
nothing out-of-scope is touched.**
- [x] Every `DROP POLICY` targets either (a) a policy the culprit migration created
      (`*_anon_all`), (b) a stray permissive policy the identity audit found live
      (`*_open_test`, `single_tenant_all`), or (c) the owner policy being idempotently
      re-created. No unrelated policy is dropped.
- [x] No policy on an out-of-scope object is touched — SEC-2/SEC-3 tables, timeline_*,
      products/*, project_assets, provider_jobs, and `storage.objects` (the bucket, Part B)
      are all untouched.
- [x] `provider_capabilities` public read-only catalog is deliberately **left as-is** and
      documented (SECURITY.md §2.2) — not an oversight.
- [x] The ROLLBACK block recreates **only** the documented `*_anon_all` table policies; it
      deliberately does **not** recreate the stray `*_open_test` / `single_tenant_all`
      (unauthorised drift), so rollback cannot re-introduce an undocumented orphan.
- [ ] **[apply-time]** §A0.2 also serves as the orphan sweep: any permissive policy it
      lists that the migration does not drop must be added before apply.

## 5. Storage inconsistencies — bucket vs. table access coherent?
**ANSWER: OUT OF SCOPE for Part A — deferred to Part B, intentionally.**
- [x] Part A makes **no** `storage.objects` change. The `look-composites` bucket lock-down
      (drop anon policies, restore owner-folder-prefix) is **Part B**, sequenced to run
      **only after the storage re-key** — restoring owner-folder policies before the re-key
      would strand objects written under the old key layout.
- [x] **Known, accepted residual:** until Part B applies, the bucket **remains open** per
      the culprit migration. This is a deliberate sequencing decision, tracked in
      RISK_REGISTER / SECURITY_DECISIONS, not an inconsistency introduced by Part A.
- [x] Table↔bucket coherence (a user who can read an `artist_looks` row can read its
      composite) is a **Part B** review item; Part A does not regress it (bucket unchanged).
- [ ] **[Part B]** Folder predicate `(storage.foldername(name))[1] = auth.uid()::text` vs
      the app's `{user_id}/{artist_id}/{look_id}.png` path (off-by-one check) — reviewed in
      Part B, not here.

## 6. Change hygiene / blast radius
- [x] Migration is wrapped in a single `begin/commit`; a failure mid-way does not leave a
      half-open state.
- [x] Migration is **idempotent** (`drop policy if exists` before create) — safe to re-run.
- [x] Rollback SQL is present, exact, table-only, and clearly marked emergency-only.
- [x] Timestamp `20260806120000` sorts **after** all existing migrations (latest was
      `20260723150000`) so replay order is correct.
- [x] No application code, edge function, or config is modified by this PR (DB migration +
      docs only) → no edge redeploy coupled to merge.

## 7. Evidence integrity
- [x] `docs/security/RISK-001/evidence/SHA256SUMS.txt` verifies (`shasum -a 256 -c`) — the
      forensic record is intact and unaltered (Part A did not touch `evidence/`).

---

### Reviewer sign-off
- Security reviewer: __________________  date: __________  ☐ approve ☐ changes requested
- Architecture (Class-C) reviewer: __________________  date: __________  ☐ approve
- Apply authorised for live DB (separate step): ☐ yes, after §A0 inventory + §A2 go/no-go
  ☐ hold
