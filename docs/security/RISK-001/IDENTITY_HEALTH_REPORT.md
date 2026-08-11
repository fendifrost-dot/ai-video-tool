# IDENTITY HEALTH REPORT — AVT (RISK-001 / PR #17 go-no-go)

**Report version:** v1.0 · **Query set version:** IHQ-v1.0
**Audit date:** 2026-08-06 (America/Los_Angeles) · **DB snapshot:** 2026-08-07 01:35:44.700399+00 (UTC)
**Database:** Lovable Cloud `qoyxgnkvjukovkrvdaiq` (`postgres`, PostgreSQL 17.6) · **Access:** Lovable SQL editor, **read-only (SELECT only)**
**Purpose:** decide whether the RISK-001 revert (PR #17 — restore owner-scoped RLS on five tenant tables + the `look-composites` bucket) can be applied to the live DB without stranding the operator's own data.

> This report is a permanent, reusable artifact. Rerun the frozen SQL in §Reproducibility against the same DB to get an apples-to-apples comparison. Nothing here mutates data.

---

## 0. Executive answer (read this first)

| Question | Answer |
|----------|--------|
| **Anonymous identities** | **207** anonymous auth users (of 208 total). **20** of them own tenant-table data; **16** own `look-composites` objects; **3** own `character_features` (via `artists`). |
| **Logical users** | **1** — this is effectively a single-operator deployment (Fendi). Only **one** durable (non-anonymous) account exists. |
| **Orphaned records** | **0** owner-level orphans (0 NULL owners across 448 tenant rows; 0 dangling `character_features→artists`; 0 `look-composites` folders whose UID is not a real user). *Caveat:* **292 / 363** storage objects carry a NULL `owner` **metadata** column — a metadata gap, not an orphan (RLS keys off the folder prefix, which is intact for all 363). |
| **Cross-device / cross-session splits** | **20** — one logical operator's data is fragmented across **21** owner identities (1 durable + 20 anonymous device/session UIDs). |
| **Overall Identity Durability Health Score** | **26 / 100 — POOR (🔴).** Referential integrity is clean, but identity is critically non-durable and fragmented; ~90–95% of user rows/objects sit under ephemeral anonymous UIDs. |
| **Risk tier** | **Tier 3 — High (widespread UID drift).** |
| **IMMEDIATE DECISION** | **⚠ Apply after identity stabilization.** |

---

## 1. Distinct owner UID count — per table

Owner column is `user_id` for every table below **except `character_features`**, whose ownership is scoped **indirectly** through `artist_id → artists.user_id` (per PR #17). Joined accordingly.

| Table | Total rows | Distinct owner UIDs | Rows w/ NULL owner | Invalid / dangling owner refs |
|-------|-----------:|--------------------:|-------------------:|------------------------------:|
| `artists` | 5 | 4 | 0 | 0 |
| `character_features` (via `artists`) | 101 | 3 | 0 | 0 dangling `artist_id` |
| `artist_looks` | 219 | 17 | 0 | 0 |
| `location_library` | 0 | 0 | 0 | 0 |
| `prop_library` | 0 | 0 | 0 | 0 |
| `video_projects` (≈ "projects") | 7 | 5 | 0 | 0 |
| `project_assets` (≈ "generated_assets") | 74 | 9 | 0 | 0 |
| `shots` | 48 | 5 | 0 | 0 |
| **`look-composites` bucket** | 363 objects | 16 UID folders | — | 0 folders not matching a real user; **292 objects with NULL `owner` column** |

> Naming note: the request referenced `generated_assets` and `projects`; the live schema's closest owner-scoped equivalents are `project_assets` and `video_projects` respectively. There is no table literally named `generated_assets` or `projects`.

**Top owner UIDs by row footprint** (union across `artists`, `artist_looks`, `video_projects`, `project_assets`, `shots`; `anon` = `auth.users.is_anonymous`):

| Owner UID | anon? | created | artists | looks | projects | project_assets | shots |
|-----------|:-----:|---------|--------:|------:|---------:|---------------:|------:|
| `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | yes | 2026-07-18 | 0 | 69 | 0 | 28 | 0 |
| `3ca10935-8c3d-4479-9a0c-8bfe8050840c` | **no (durable)** | 2026-05-16 | 2 | 45 | 3 | 7 | 1 |
| `99c8af67-c6ce-4ed0-8440-eb0f72667589` | yes | 2026-06-28 | 0 | 39 | 0 | 13 | 0 |
| `9044c334-f5ea-41fa-b000-6d5407010343` | yes | 2026-06-17 | 0 | 15 | 0 | 0 | 0 |
| `2179ae5d-c9bc-47e4-acdb-6aa1ac841f1b` | yes | 2026-06-08 | 0 | 14 | 0 | 0 | 0 |
| `65cf99cb-fd18-4168-b9ab-dfbfd42112ca` | yes | 2026-06-06 | 0 | 8 | 1 | 12 | 44 |
| `a4144901-50f9-4499-9a74-3ce834ef7458` | yes | 2026-06-11 | 0 | 9 | 0 | 0 | 0 |
| `c955dbe6-5b9d-42c1-87c4-2388bcc68369` | yes | 2026-06-21 | 0 | 8 | 0 | 3 | 0 |
| `79516c91-c2ad-4b54-93f1-05023fbca28c` | yes | 2026-05-23 | 1 | 3 | 1 | 3 | 0 |
| `301c1a2d-9c2a-4d79-b44f-02cbb558fafd` | yes | 2026-05-17 | 0 | 0 | 1 | 4 | 1 |
| *(+ ~11 more anonymous UIDs, each 1–2 rows)* | yes | — | — | — | — | — | — |

The single largest data holder is an **anonymous** UID (69 looks), **not** the durable account (45 looks). No single identity owns a majority of any table.

**Live RLS policy state (confirmed on the DB, not from migration files):** every one of the five tables currently carries **`<table>_anon_all`** *and* **`<table>_open_test`** (both `qual = true`, roles `{anon, authenticated}`) *and* a **`single_tenant_all`** (`qual = true`, role `{authenticated}`). The `look-composites` bucket carries anon SELECT/INSERT/UPDATE/DELETE **and** a `look-composites_open_test`. In other words the live DB is **more open than the culprit migration `20260523171003_*` documents** — additional `*_open_test` / `single_tenant_all` policies were applied out-of-band (not present as committed migrations), confirming the forensic §7 hypothesis. The owner-scoped policies PR #17 restores (`*_select/insert/update/delete_own`, folder-prefix storage policies) already coexist for storage but are currently shadowed by the permissive ones on the tables.

---

## 2. Cross-table consistency — is one logical user split across many anon UIDs?

**Yes — decisively.** This is a single-operator product (208 signups, but one human), yet the data is spread across **21 distinct owner identities**: **1 durable** account (`3ca10935…`) and **20 anonymous** per-device/per-session UIDs. Evidence of split identity rather than 21 real users:

- Only **1** of the 208 auth users is non-anonymous; **207** are `is_anonymous = true`. A genuine 21-user tenancy would not be ~100% anonymous.
- The anonymous UIDs are created on many different dates (2026-05-17 → 2026-07-20) and each holds a *slice* of the same coherent body of work (looks, project_assets, shots) — the signature of the same person returning on a new browser/device/cleared-cache session, each time minting a fresh anon `auth.uid()`.
- The application intentionally papers over this today: `compose-look-proxy` disables its `artist.user_id !== userId` check citing "anonymous-auth user_id churn," and the DB was opened with `USING(true)` precisely so every churned session still sees all rows (RISK-001 root cause).

**Consequence for PR #17:** owner-scoped RLS is *correct*, but because identity has drifted, restoring it makes each session see only the slice owned by its **current** UID. Whichever single UID the browser holds at apply-time keeps its rows; the other ~90–95% become **invisible and unwritable** (not deleted).

---

## 3. Orphan analysis

- **Rows whose owner no longer exists:** **0.** Every owner UID present in the tenant tables resolves to a live `auth.users` row.
- **NULL owners:** **0** across all populated tenant tables (448 rows).
- **Dangling `character_features`:** **0** — every `artist_id` resolves to an existing `artists` row.
- **`look-composites` objects with a folder UID that is not a real user:** **0** of 363.
- **Rows that would become INACCESSIBLE after the RLS restore:** everything **not** owned by the session's current UID. With the durable account (`3ca10935…`) as the "keeper," that is approximately: `artist_looks` 174/219, `project_assets` 67/74, `shots` 47/48, `video_projects` 4/7, `artists` 3/5, plus the `character_features` and `look-composites` objects owned by the other 20 UIDs. **These are not orphaned or corrupt — they are stranded by identity drift, and are fully recoverable by re-owning them to the durable account before apply.**
- **Storage ownership-metadata mismatch:** **292 / 363** objects have a NULL `storage.objects.owner` column. This does **not** affect the restored policy (which authorizes on `(storage.foldername(name))[1] = auth.uid()::text`, and all 363 folder prefixes are intact and map to real users), but it is a latent metadata-hygiene gap worth backfilling.

---

## 4. Risk classification

**Tier 3 — High (widespread UID drift).**

| Tier | Definition | Match? |
|------|------------|:------:|
| Tier 1 — Low | One stable UID → safe to apply | No |
| Tier 2 — Medium | Small number of legacy UIDs → migration plan | No |
| **Tier 3 — High** | **Widespread UID drift → stabilize identity first** | **Yes** |

Rationale: 21 owner identities for one logical user, only ~5% of them durable, no single UID owning a majority, and the largest holder being anonymous. Referential integrity is clean (nothing is broken or orphaned), so this is a *stabilization* problem, not a *corruption* problem — which is exactly why the fix is to consolidate identity, **never** to re-open RLS.

### Overall Identity Durability Health Score — 26 / 100 (POOR 🔴)

| Component | Weight | Raw | Basis |
|-----------|-------:|----:|-------|
| Referential integrity | 20% | 100 | 0 orphans / 0 NULL owners / 0 dangling refs |
| Identity durability | 45% | 5 | 1 durable ÷ 21 data-owning identities ≈ 4.8% |
| Identity consolidation | 25% | 5 | 1 logical user fragmented across 21 identities |
| Storage owner-metadata completeness | 10% | 20 | 71 ÷ 363 objects carry a non-NULL `owner` |
| **Weighted total** | | **≈26** | |

---

## 5. Recommendation (exactly one)

### ⚠ Apply after identity stabilization.

Do **not** apply PR #17 to the live DB yet, and do **not** keep RLS open. Sequence:

1. **Stabilize / consolidate identity first (one-time).** Re-own the 20 legacy anonymous UIDs' rows and `look-composites` objects into the single durable account `3ca10935-8c3d-4479-9a0c-8bfe8050840c` (service-role UPDATE of `user_id` on the five tenant tables + `character_features`'s parent `artists`, plus rename/re-key storage object folder prefixes and backfill the NULL `owner` column). Snapshot/export first; verify counts before/after.
2. **Then apply the RISK-001 revert migration** (`20260806120000_risk_001_revert_anon_rls.sql`) via the Lovable SQL editor, and additionally drop the out-of-band `*_open_test` and `single_tenant_all` policies discovered live (they are not in the revert migration's DROP list — the migration must be extended, or those policies dropped alongside it, or the lock-down is incomplete).
3. **Verify** with `VERIFICATION_PLAN.md` (anon denied; the durable session retains full CRUD over the now-consolidated data).

**Why not "Apply immediately":** it would strand ~90–95% of the operator's own looks/assets/shots behind a UID they no longer hold.
**Why not "Block pending remediation":** the data is clean and the remediation path is concrete and low-risk; blocking indefinitely would leave a **Critical** live exposure open with no plan. The correct posture is *expedited* stabilization then apply.
**Governance:** never weaken security to compensate for an identity-management issue. Re-opening RLS is an emergency state, not a resting state.

> The **long-term** durable-identity architecture that prevents recurrence is tracked as **RISK-002 (Identity Durability)** in `RISK_REGISTER.md`. RISK-002 is **not** a blocker for PR #17; the one-time consolidation in step 1 is.

---

## Reproducibility (freeze — rerun in 6 months apples-to-apples)

- **Query set version:** IHQ-v1.0
- **Audit date:** 2026-08-06 (PT) · **DB snapshot:** 2026-08-07 01:35:44.700399+00 UTC
- **DB:** `qoyxgnkvjukovkrvdaiq` / `postgres` / PostgreSQL 17.6 · **Editor:** Lovable Cloud SQL editor · **Mode:** read-only

**Q0 — snapshot & version**
```sql
select now() as snapshot_utc, current_database() as db, version();
```

**Q1 — live RLS policy state (the 5 tables + bucket)**
```sql
select schemaname, tablename, policyname, roles::text, cmd, qual
from pg_policies
where (schemaname='public' and tablename in
       ('artists','character_features','location_library','prop_library','artist_looks'))
   or (schemaname='storage' and tablename='objects' and policyname like 'look_composites%')
order by tablename, policyname;
```

**Q2 — per-table rows / distinct owners / NULL owners**
```sql
select 'artists' t, count(*) rows, count(distinct user_id) owners,
       count(*) filter (where user_id is null) null_owner from public.artists
union all select 'artist_looks', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.artist_looks
union all select 'location_library', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.location_library
union all select 'prop_library', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.prop_library
union all select 'video_projects', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.video_projects
union all select 'project_assets', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.project_assets
union all select 'shots', count(*), count(distinct user_id),
       count(*) filter (where user_id is null) from public.shots
order by 1;
```

**Q3 — cross-table per-UID footprint joined to auth.users (split-identity detection)**
```sql
select q.u as user_id, au.is_anonymous anon, au.created_at::date created,
  (select count(*) from public.artists        where user_id=q.u) artists,
  (select count(*) from public.artist_looks    where user_id=q.u) looks,
  (select count(*) from public.video_projects  where user_id=q.u) projects,
  (select count(*) from public.project_assets  where user_id=q.u) passets,
  (select count(*) from public.shots           where user_id=q.u) shots
from (select distinct user_id u from (
        select user_id from public.artists
        union select user_id from public.artist_looks
        union select user_id from public.video_projects
        union select user_id from public.project_assets
        union select user_id from public.shots) z) q
left join auth.users au on au.id = q.u
order by looks desc nulls last;
```

**Q4 — auth totals, character_features (join-owned), and look-composites bucket**
```sql
select 'auth_users_total' k, count(*)::text v from auth.users
union all select 'auth_anon',   count(*)::text from auth.users where is_anonymous
union all select 'auth_durable',count(*)::text from auth.users where not is_anonymous
union all select 'cf_rows',     count(*)::text from public.character_features
union all select 'cf_owners',   count(distinct a.user_id)::text
          from public.character_features cf join public.artists a on a.id = cf.artist_id
union all select 'cf_dangling_artist', count(*)::text
          from public.character_features cf left join public.artists a on a.id = cf.artist_id
          where a.id is null
union all select 'lc_objects', count(*)::text
          from storage.objects where bucket_id='look-composites'
union all select 'lc_distinct_uid_folders', count(distinct (storage.foldername(name))[1])::text
          from storage.objects where bucket_id='look-composites'
union all select 'lc_folder_not_a_user', count(*)::text
          from storage.objects where bucket_id='look-composites'
          and (storage.foldername(name))[1] not in (select id::text from auth.users)
union all select 'lc_owner_col_null', count(*)::text
          from storage.objects where bucket_id='look-composites' and owner is null;
```

**Frozen results (this run):**

```
Q0  snapshot 2026-08-07 01:35:44.700399+00 · postgres · PostgreSQL 17.6
Q1  all 5 tables: *_anon_all(true,{anon,auth}) + *_open_test(true,{anon,auth}) + single_tenant_all(true,{auth});
    bucket: look_composites_anon_{select,insert,update,delete} + look-composites_open_test + *_own policies present
Q2  artists 5/4/0 · artist_looks 219/17/0 · location_library 0/0/0 · prop_library 0/0/0 ·
    video_projects 7/5/0 · project_assets 74/9/0 · shots 48/5/0
Q3  21 owner UIDs (1 durable 3ca10935, 20 anonymous); top holder anon 832fa0bc = 69 looks
Q4  auth_users_total 208 · auth_anon 207 · auth_durable 1 · cf_rows 101 · cf_owners 3 ·
    cf_dangling_artist 0 · lc_objects 363 · lc_distinct_uid_folders 16 ·
    lc_folder_not_a_user 0 · lc_owner_col_null 292
```
