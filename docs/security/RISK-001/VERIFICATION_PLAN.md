# RISK-001 — Runtime Verification Plan (Definition of Done)

**Scope: PART A (TABLE-ONLY).** This plan **is** the Definition of Done for the revert
migration `supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql`, which
restores owner-scoped RLS on the **five tables only**. The `look-composites` storage
bucket is **PART B** (a separate migration after the storage re-key) and every bucket
check below is explicitly marked **[PART B — deferred]** and is **not** part of Part A's
DoD. Part A is not closed until **every** table check passes on the **live** Lovable DB
(`qoyxgnkvjukovkrvdaiq`). RLS correctness is proven by running clients, never by reading
policy text (SECURITY.md §2.4).

Legend: **[SQL]** run in the Lovable SQL editor · **[anon]** a Supabase client using
only the public anon key with **no** session · **[authed]** an anonymous-auth (or real)
user session · **[service]** service-role context (edge function) · **[browser]** the
live app.

---

## A0. RUN IMMEDIATELY BEFORE DEPLOY — COMPLETE live policy inventory — [SQL], read-only

> **Mandatory, and NOT optional: run this against the live DB in the same sitting as
> the apply — never deploy from an old snapshot.** The identity audit showed the live DB
> is more open than the committed migration history implies (stray `*_open_test` /
> `single_tenant_all` policies). Between audit and deploy, live policy state can drift
> again. This step captures **current reality** so the migration's DROP list is proven
> complete before it runs.

**A0.1 — Dump EVERY policy on the five Part A tables (no name filter):**
```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('artists','character_features','location_library','prop_library','artist_looks')
order by tablename, policyname;
```

**A0.2 — Flag ANY permissive policy that is not one of the intended owner-scoped names**
(this is the go/no-go: the result set below is exactly the policies the migration must
drop; every one must be named in the migration's DROP list before apply):
```sql
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('artists','character_features','location_library','prop_library','artist_looks')
  and permissive = 'PERMISSIVE'
  and policyname not in (
        'artists_select_own','artists_insert_own','artists_update_own','artists_delete_own',
        'Users access own character_features',
        'Users access own location_library',
        'Users access own prop_library',
        'Users access own artist_looks')
order by tablename, policyname;
```
**Action:** for each row returned — including any `*_anon_all`, `*_open_test`,
`single_tenant_all`, **or a name not yet seen** — confirm the migration drops it. If a
name appears here that the migration does **not** drop, **STOP**, add the `drop policy
if exists` line, and re-review before apply. Deploying with an undropped permissive
policy leaves the table open (RLS unions permissive policies).

**A0.3 — Confirm RLS is enabled on all five (a disabled table ignores every policy):**
```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('artists','character_features','location_library','prop_library','artist_looks');
-- every relrowsecurity must be true
```

---

## A. PRE-APPLY (baseline + go/no-go) — [SQL], read-only

**A1. Snapshot current TABLE policies** (expect the accidental anon grants — and the
stray audit-found policies — to be present):
```sql
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('artists','character_features','location_library','prop_library','artist_looks')
order by tablename, policyname;
```
Expect rows named `*_anon_all` with `qual = true`, plus the stray `*_open_test` /
`single_tenant_all` policies the identity audit surfaced (§A0.2 is the authoritative,
name-agnostic version of this — run it too).

> **[PART B — deferred]** The `look-composites` storage-bucket snapshot
> (`pg_policies … policyname like 'look_composites%'`) belongs to Part B, after the
> storage re-key. It is intentionally omitted from Part A's DoD.

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

### C1. Policy state clean (tables) — [SQL]
Re-run A1 / §A0. **Pass =**
- Zero rows where `roles @> '{anon}'` **and** `qual = 'true'` for the five tables.
- Zero stray permissive policies remain: re-run **§A0.2** → **must return 0 rows**
  (no `*_anon_all`, `*_open_test`, `single_tenant_all`, or any other unexpected
  permissive policy).
- Present: `artists_select_own/insert_own/update_own/delete_own`,
  `"Users access own character_features"` (qual references `artists … auth.uid()`),
  `"Users access own location_library"`, `"Users access own prop_library"`,
  `"Users access own artist_looks"`.
```sql
-- fast fail (tables only): this must return 0
select count(*) from pg_policies
where schemaname='public'
  and tablename in ('artists','character_features','location_library','prop_library','artist_looks')
  and roles @> '{anon}' and coalesce(qual,'') = 'true';
```
> **[PART B — deferred]** `look_composites_*` storage policy state is verified in Part B,
> not here.

### C2. Anonymous is DENIED — [anon] (no session)
With a client holding only the anon key and **no** sign-in:
- `select` on each of the 5 tables → **0 rows** (not an error; RLS filters).
- `insert`/`update`/`delete` on each table → **blocked** (RLS violation / 0 rows affected).
- **Pass =** no protected **table** row is readable or mutable without a session.
> **[PART B — deferred]** `storage.from('look-composites').list()/download()/upload()`
> is **expected to STILL succeed** for bare-anon after Part A (the bucket is unchanged);
> its denial is a Part B DoD item, not a Part A regression. Do not treat continued bucket
> access as a Part A failure.

### C3. Authenticated artist — everything still works — [authed]
With an anonymous-auth (or real) session `U`:
- Create an artist → row persists with `user_id = U`.
- Read it back, update it, add a `character_features` row under that artist, add a
  `location_library` and `prop_library` row, create an `artist_looks` row.
- Session `U` **cannot** see a second session `V`'s **table rows**, and vice-versa.
- **Pass =** full owner CRUD works for `U` on its own table data; cross-session **table**
  access denied.
> **[PART B — deferred]** `look-composites` upload/signed-URL owner-scoping (and the
> cross-session object-isolation check) is verified in Part B, after the re-key. In Part A
> the bucket is unchanged, so object access is not a Part A pass/fail criterion.

### C4. Service role — background workers still function — [service]
- A service-role query (as an edge function runs) reads/writes each of the 5 tables
  **regardless of owner** (RLS-exempt).
- Smoke a representative worker path end-to-end (e.g. the `faceswap-callback`
  `artist_looks` update, or the jacket-inpaint watchdog) → still writes.
- **Pass =** no service-role read/write regressed (expected: none, since RLS is bypassed).

### C5. `compose-look-proxy` (acts as the caller) — [authed via edge]
- Invoke compose-look for session `U`; confirm the `artist_looks` **table** insert (via
  `userClient`) lands under `U`'s scope and succeeds.
- **Pass =** the user-scoped edge **table** write still succeeds for the owner.
> **[PART B — deferred]** The proxy's `look-composites` upload is unaffected by Part A
> (bucket unchanged) and is re-verified for owner-folder-prefix scoping in Part B.

### C6. Browser — Hero Frame Studio still loads — [browser]
- Load the live app; confirm the anon session bootstraps (`__root.tsx` → `ready`, not
  `failed`).
- Open **Hero Frame Studio**; confirm artists/looks/features lists populate for the
  current uid's data. (`look-composites` previews are unchanged by Part A and should
  render as before — the bucket is not locked down until Part B.)
- Exercise Artists, Looks, Locations, Props pages — lists load, create/edit works.
- **Pass =** no blank lists, no 401/403 in console for the five **tables**, for the
  current session's own data.

### C7. Edge functions — expected reads succeed — [service/authed]
- Trigger one read-path per affected edge function class and confirm no new RLS denials:
  wardrobe-vton-proxy (features/looks), jacket-inpaint-proxy, wardrobe-video-swap-proxy,
  train-style-lora-proxy (artists). (sam3-segment-proxy touches the bucket only → Part B.)
- **Pass =** all expected **table** reads/writes succeed (service-role paths unaffected;
  user-scoped paths succeed for owners).

---

## D. Regression guard (follow-up, tracked — not blocking this PR's authoring)

RISK-001's standing DoD (SECURITY.md §7, RISK_REGISTER) requires **RLS integration
tests** — a currently-empty category (`docs/TEST_TAXONOMY.md`). For Part A, add tests
that drive:
- an **[anon]** client and assert denial on each of the 5 **tables** (C2), and
- an **[authed]** client and assert owner-only **table** visibility (C3),

so Part A cannot silently regress. (The `look-composites` bucket assertions land with
**Part B**, after the re-key.) These belong in CI (OPS-1). Landing the table tests +
applying Part A + applying Part B is the full path to move RISK-001 from
*In-remediation* to *Closed*.

---

## E. Rollback trigger

If C3/C5/C6 fail because of **anon-uid churn** (not a policy error) and cannot be
resolved immediately, use the migration's bottom **ROLLBACK** block to re-open the five
tables, then address identity per IMPACT_REPORT §5 before re-attempting. The rollback
restores only the documented dev-bootstrap `*_anon_all` **table** policies (not the stray
`*_open_test` / `single_tenant_all`, and no storage changes). Re-opening is an emergency
state, **not** a resting state — it re-exposes RISK-001.
