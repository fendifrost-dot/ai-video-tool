# RISK-001 — Runtime Verification Plan (Definition of Done)

This plan **is** the Definition of Done for the revert migration
`supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql`. RISK-001 is not
closed until **every** check below passes on the **live** Lovable DB
(`qoyxgnkvjukovkrvdaiq`). RLS correctness is proven by running clients, never by
reading policy text (SECURITY.md §2.4).

Legend: **[SQL]** run in the Lovable SQL editor · **[anon]** a Supabase client using
only the public anon key with **no** session · **[authed]** an anonymous-auth (or real)
user session · **[service]** service-role context (edge function) · **[browser]** the
live app.

---

## A. PRE-APPLY (baseline + go/no-go) — [SQL], read-only

**A1. Snapshot current policies** (expect the accidental anon grants to be present):
```sql
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('artists','character_features','location_library','prop_library','artist_looks')
order by tablename, policyname;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'look_composites%'
order by policyname;
```
Expect rows named `*_anon_all` / `look_composites_anon_*` with `qual = true`.

**A2. GO/NO-GO — owner-uid drift check** (from IMPACT_REPORT §5):
```sql
select 'artists' t, count(*) rows, count(distinct user_id) owners from public.artists
union all select 'location_library', count(*), count(distinct user_id) from public.location_library
union all select 'prop_library',     count(*), count(distinct user_id) from public.prop_library
union all select 'artist_looks',     count(*), count(distinct user_id) from public.artist_looks;
-- character_features has no user_id; owner is via artist:
select count(*) rows, count(distinct a.user_id) owners
from public.character_features cf join public.artists a on a.id = cf.artist_id;
```
- **≈1 distinct owner** → low-risk, proceed.
- **many owners** → PAUSE. Resolve identity/re-ownership before apply (do not re-open RLS).

---

## B. APPLY — Lovable SQL editor

Paste the migration's `begin … commit;` body (not the rollback comment). No edge
redeploy is required (DB-only). Record who/when in `docs/SECURITY_DECISIONS.md`.

---

## C. POST-APPLY DoD — must ALL pass

### C1. Policy state clean — [SQL]
Re-run A1. **Pass =**
- Zero rows where `roles @> '{anon}'` **and** `qual = 'true'` for the five tables.
- Present: `artists_select_own/insert_own/update_own/delete_own`,
  `"Users access own character_features"` (qual references `artists … auth.uid()`),
  `"Users access own location_library"`, `"Users access own prop_library"`,
  `"Users access own artist_looks"`.
- Storage: `look_composites_{select,insert,update,delete}_own` present; no
  `look_composites_anon_*` remain.
```sql
-- fast fail: this must return 0
select count(*) from pg_policies
where ((schemaname='public' and tablename in
        ('artists','character_features','location_library','prop_library','artist_looks'))
    or (schemaname='storage' and tablename='objects' and policyname like 'look_composites%'))
  and roles @> '{anon}' and coalesce(qual,'') = 'true';
```

### C2. Anonymous is DENIED — [anon] (no session)
With a client holding only the anon key and **no** sign-in:
- `select` on each of the 5 tables → **0 rows** (not an error; RLS filters).
- `insert`/`update`/`delete` on each table → **blocked** (RLS violation / 0 rows affected).
- `storage.from('look-composites').list()/download()/upload()` → **denied**.
- **Pass =** no protected row or object is readable or mutable without a session.

### C3. Authenticated artist — everything still works — [authed]
With an anonymous-auth (or real) session `U`:
- Create an artist → row persists with `user_id = U`.
- Read it back, update it, add a `character_features` row under that artist, add a
  `location_library` and `prop_library` row, create an `artist_looks` row.
- Upload a `look-composites` object at `U/<artist_id>/<look_id>.png` → succeeds; read it
  back via signed URL → succeeds.
- Session `U` **cannot** see a second session `V`'s rows/objects, and vice-versa.
- **Pass =** full owner CRUD works for `U` on its own data; cross-session access denied.

### C4. Service role — background workers still function — [service]
- A service-role query (as an edge function runs) reads/writes each of the 5 tables and
  the bucket **regardless of owner** (RLS-exempt).
- Smoke a representative worker path end-to-end (e.g. `compose-look-callback` or the
  `faceswap-callback` `artist_looks` update, or the jacket-inpaint watchdog) → still
  writes.
- **Pass =** no service-role read/write regressed (expected: none, since RLS is bypassed).

### C5. `compose-look-proxy` (acts as the caller) — [authed via edge]
- Invoke compose-look for session `U`; confirm the `artist_looks` insert and the
  `look-composites` upload (both via `userClient`) land under `U`'s scope and succeed.
- **Pass =** user-scoped edge writes still succeed for the owner.

### C6. Browser — Hero Frame Studio still loads — [browser]
- Load the live app; confirm the anon session bootstraps (`__root.tsx` → `ready`, not
  `failed`).
- Open **Hero Frame Studio**; confirm artists/looks/features lists populate and
  `look-composites` previews (signed URLs) render for the current uid's data.
- Exercise Artists, Looks, Locations, Props pages — lists load, create/edit works.
- **Pass =** no blank lists, no 401/403 in console for the five tables or the bucket, for
  the current session's own data.

### C7. Edge functions — expected reads succeed — [service/authed]
- Trigger one read-path per affected edge function class and confirm no new RLS denials:
  wardrobe-vton-proxy (features/looks), jacket-inpaint-proxy, wardrobe-video-swap-proxy,
  train-style-lora-proxy (artists), sam3-segment-proxy (bucket).
- **Pass =** all expected reads/writes succeed (service-role paths unaffected; user-scoped
  paths succeed for owners).

---

## D. Regression guard (follow-up, tracked — not blocking this PR's authoring)

RISK-001's standing DoD (SECURITY.md §7, RISK_REGISTER) requires **RLS integration
tests** — a currently-empty category (`docs/TEST_TAXONOMY.md`). Add tests that drive:
- an **[anon]** client and assert denial on each of the 5 tables + bucket (C2), and
- an **[authed]** client and assert owner-only visibility (C3),

so RISK-001 cannot silently regress. These belong in CI (OPS-1). Landing them is the
final gate to move RISK-001 from *In-remediation* to *Closed*.

---

## E. Rollback trigger

If C3/C5/C6 fail because of **anon-uid churn** (not a policy error) and cannot be
resolved immediately, use the migration's bottom **ROLLBACK** block to re-open, then
address identity per IMPACT_REPORT §5 before re-attempting. Re-opening is an emergency
state, **not** a resting state — it re-exposes RISK-001.
