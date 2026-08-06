# RISK-001 — Security-Review Checklist (Class-C, pre-merge)

This is a **security** review, distinct from ordinary code review. A Class-C reviewer
must be able to answer every question below **YES/OK** before this PR merges. It gates
the revert migration `20260806120000_risk_001_revert_anon_rls.sql`. Answers reference
the migration and `IMPACT_REPORT.md` / `VERIFICATION_PLAN.md`.

> Merge does **not** apply the migration. Apply is a separate, reviewed step on the live
> DB per the VERIFICATION_PLAN. This checklist gates *merge of the authored fix*.

---

## 1. Privilege escalation — does the change grant anyone MORE than before?
- [ ] No policy uses `USING (true)` / `WITH CHECK (true)` on any of the five tables or
      the bucket (grep the migration). Only `auth.uid()`-scoped predicates remain.
- [ ] No new `GRANT`, role change, `SECURITY DEFINER` function, or `BYPASSRLS` is
      introduced. The migration only DROP/CREATE POLICY + idempotent `ENABLE RLS`.
- [ ] The bucket `public` flag is **not** set to `true` anywhere (it stays `false`).
- [ ] `character_features` is scoped through `artist_id → artists.user_id`, not a
      fabricated `user_id` column (which does not exist) — so the join cannot be
      widened by a malformed predicate.

## 2. Accidental deny — does it lock out legitimate access it shouldn't?
- [ ] Owner CRUD for the current session is preserved on all five tables
      (SELECT/INSERT/UPDATE/DELETE each present or covered by `FOR ALL`).
- [ ] `INSERT WITH CHECK (user_id = auth.uid())` is satisfied by the app, which stamps
      `user_id` from the session (`artists.ts:99`, `faceRestore.ts:277`, etc.).
- [ ] Service-role edge paths are unaffected (RLS-exempt) — confirmed no function relies
      on the anon `USING(true)` policy for a *user-scoped* read it should not have.
- [ ] The known continuity side effect (anon-uid churn, IMPACT_REPORT §5) is
      acknowledged, and the go/no-go owner-count check (VERIFICATION_PLAN §A2) is
      scheduled **before apply**.

## 3. Policy overlap — do multiple policies interact unexpectedly?
- [ ] For each table, exactly the intended policies exist after apply; no leftover
      permissive policy ORs the restrictive ones back open (PostgreSQL RLS is a **union**
      of permissive policies — one stray `USING(true)` re-opens everything).
- [ ] `artists` has four command-specific policies that do not overlap ambiguously;
      the other tables use a single `FOR ALL` policy (no mixed FOR ALL + per-command
      duplicates that could widen access).
- [ ] The four `look_composites_*_own` storage policies are per-command and mutually
      consistent (same bucket + same folder predicate).

## 4. Orphan policies — anything dropped/created that shouldn't be, or left dangling?
- [ ] Every `DROP POLICY` targets a policy the culprit migration actually created (or the
      original owner policy being re-created idempotently) — no unrelated policy dropped.
- [ ] No policy on an out-of-scope object is touched (SEC-2/SEC-3 tables, timeline_*,
      products/*, project_assets, provider_jobs, `provider_capabilities`).
- [ ] `provider_capabilities` public read-only catalog is deliberately **left as-is** and
      documented (SECURITY.md §2.2) — not an oversight.

## 5. Storage inconsistencies — bucket vs. table access coherent?
- [ ] `look-composites` remains `public=false`; access is via owner-folder-prefix RLS +
      signed URLs only.
- [ ] The folder predicate `(storage.foldername(name))[1] = auth.uid()::text` matches the
      path the app writes (`{user_id}/{artist_id}/{look_id}.png`) — no off-by-one in the
      folder index.
- [ ] Table access and bucket access agree: a user who can read an `artist_looks` row can
      read its composite object (both keyed to the same uid).

## 6. Change hygiene / blast radius
- [ ] Migration is wrapped in a single `begin/commit`; a failure mid-way does not leave a
      half-open state.
- [ ] Migration is **idempotent** (`drop policy if exists` before create) — safe to
      re-run.
- [ ] Rollback SQL is present, exact, and clearly marked emergency-only.
- [ ] Timestamp `20260806120000` sorts **after** all existing migrations (latest was
      `20260723150000`) so replay order is correct.
- [ ] No application code, edge function, or config is modified by this PR (DB migration +
      docs only) → no edge redeploy coupled to merge.

## 7. Evidence integrity
- [ ] `docs/security/RISK-001/evidence/SHA256SUMS.txt` verifies (`shasum -a 256 -c`) — the
      forensic record is intact and unaltered.

---

### Reviewer sign-off
- Security reviewer: __________________  date: __________  ☐ approve ☐ changes requested
- Architecture (Class-C) reviewer: __________________  date: __________  ☐ approve
- Apply authorised for live DB (separate step): ☐ yes, after §A2 go/no-go  ☐ hold
