# IDENTITY CONSOLIDATION — AVT (RISK-001 Tier-3 remediation)

**Event:** one-time identity-normalization (re-own only; no deletes)
**Date executed:** 2026-08-08 (America/Los_Angeles)
**Database:** Lovable Cloud `qoyxgnkvjukovkrvdaiq` (`postgres`, PostgreSQL 17.6) · **Access:** Lovable SQL editor (privileged role)
**Operator/dashboard login:** fendifrost@gmail.com
**Durable target UID:** `3ca10935-8c3d-4479-9a0c-8bfe8050840c` (the only `is_anonymous = false` account)
**Status:** ✅ COMMITTED and independently verified. **PR #17 remains PARKED / unapplied.**

> Purpose: merge the fragmented ownership of one logical operator (Fendi) — spread across 20 legacy anonymous per-device/session UIDs — into the single durable account, as the prerequisite Tier-3 stabilization step before any owner-scoped RLS restore (PR #17). This modified live data ownership; it was done transactionally, reversibly, and self-reconciling.

---

## 0. Result (read first)

| | Before | After |
|---|--:|--:|
| Data-owning identities (owner-scoped tables) | **21** (1 durable + 20 anon) | **1** (durable) |
| Rows under the 20 legacy anonymous UIDs | **324** | **0** |
| Rows under durable target (19 swept tables) | **68** | **392** |
| `character_features` distinct owners (via `artists`) | **3** | **1** |
| NULL-owner rows (global seed, untouched) | **14** | **14** |
| Auth users total / anon / durable | 208 / 207 / 1 | 208 / 207 / 1 (unchanged — nothing deleted) |

**Reconciliation passed exactly:** 324 rows moved, all sources end at 0, all `character_features` resolve to the target — otherwise the transaction would have raised and rolled back.

---

## 1. Backup / recoverable point (verified BEFORE any write)

Lovable exposes **daily automated backups, restore-only** — there is no on-demand snapshot trigger in the UI. Recoverable points confirmed present in the Backups panel immediately before execution:

- **8 Aug 2026, 07:09:01 UTC** (freshest; predates this change) — primary restore point
- 7 Aug 2026, 07:08:08 UTC
- 6 Aug 2026, 07:08:12 UTC

**Second, row-level recovery path:** the transaction created and populated a pre-image mapping table **before any UPDATE**:

- `public.identity_consolidation_backup_20260806` — **324 rows**, **20 distinct `old_user_id`** (all confirmed `is_anonymous = true`). This enables exact per-row reversal independent of the daily backup.

---

## 2. Scope — the 20 legacy anonymous source UIDs (→ target `3ca10935…`)

```
832fa0bc-1f7e-4586-ab8b-2ac323698ede   65cf99cb-fd18-4168-b9ab-dfbfd42112ca
99c8af67-c6ce-4ed0-8440-eb0f72667589   301c1a2d-9c2a-4d79-b44f-02cbb558fafd
9044c334-f5ea-41fa-b000-6d5407010343   2179ae5d-c9bc-47e4-acdb-6aa1ac841f1b
c955dbe6-5b9d-42c1-87c4-2388bcc68369   79516c91-c2ad-4b54-93f1-05023fbca28c
a4144901-50f9-4499-9a74-3ce834ef7458   6b1a5e83-2d3e-478f-8c75-e603cf42a146
9748a289-5988-40a4-b6c8-f0cd7a278367   08ae347a-f13a-498c-a420-b0ef0bf706c7
a073744a-03b9-4ad1-a0ef-1f147bdb0c95   cb82ea36-05ca-402e-a467-e03337f01b13
4ebaa69e-eb77-4e97-a487-1207d4130903   830373d2-4017-4d18-8ff0-7c2220304f62
917cccac-6de0-4b56-ab1e-b4dffdc7ac5a   f58a8449-2c57-4c9d-bd08-abeaa4972166
e322ecfe-5a4d-41c5-8766-3a76a1268453   7da90f41-c450-48e1-95da-0153f5a4d042
```

**Sweep basis:** every `public` table carrying a `user_id` column (19 total) was enumerated and re-owned, so nothing was silently stranded — broader than the report's original 5-table footprint.

**Note on target account:** `3ca10935…` is the sole non-anonymous account but carries a placeholder email `temp-smoke-…@lovable.invalid` (created 2026-05-16). It is the correct durable keeper per the Identity Health Report; the placeholder email is flagged for follow-up but did not affect consolidation.

---

## 3. Reconciliation by table (before → after)

`user_id` owner column unless noted. "moved" = rows re-owned from the 20 anon UIDs to the target.

| Table | total | target (before) | **moved** | target (after) | null | source (after) |
|---|--:|--:|--:|--:|--:|--:|
| artist_looks | 219 | 45 | **174** | 219 | 0 | 0 |
| project_assets | 74 | 7 | **67** | 74 | 0 | 0 |
| shots | 48 | 1 | **47** | 48 | 0 | 0 |
| provider_jobs | 32 | 8 | **24** | 32 | 0 | 0 |
| video_projects | 7 | 3 | **4** | 7 | 0 | 0 |
| artists | 5 | 2 | **3** | 5 | 0 | 0 |
| products | 3 | 0 | **3** | 3 | 0 | 0 |
| artist_assets | 3 | 2 | **1** | 3 | 0 | 0 |
| collections | 1 | 0 | **1** | 1 | 0 | 0 |
| prompt_templates | 14 | 0 | 0 | 0 | 14 | 0 |
| clip_reviews | 0 | 0 | 0 | 0 | 0 | 0 |
| export_packages | 0 | 0 | 0 | 0 | 0 | 0 |
| location_library | 0 | 0 | 0 | 0 | 0 | 0 |
| manufacturing_packages | 0 | 0 | 0 | 0 | 0 | 0 |
| project_look_picks | 0 | 0 | 0 | 0 | 0 | 0 |
| prompts | 0 | 0 | 0 | 0 | 0 | 0 |
| prop_library | 0 | 0 | 0 | 0 | 0 | 0 |
| style_profiles | 0 | 0 | 0 | 0 | 0 | 0 |
| tech_packs | 0 | 0 | 0 | 0 | 0 | 0 |
| **TOTAL (19 tables)** | **406** | **68** | **324** | **392** | **14** | **0** |
| `character_features` (via `artists.user_id`) | 101 | — | follows `artists` | **101 under target** | — | 0 |

**Rows skipped (by design):**
- `prompt_templates` — 14 rows with **NULL** `user_id` (global/seed template data). The re-own `WHERE user_id IS NOT NULL AND user_id <> target` intentionally leaves these NULL.
- `character_features` — **not** directly updated. It has no `user_id`; ownership is scoped via `artist_id → artists.user_id`. Because all 5 `artists` are now target-owned, all 101 `character_features` follow automatically (verified: 101 under target, 0 not).

**Conflicts:** none. The transaction committed, which required zero unique-constraint / FK violations on merge and exact count reconciliation.

---

## 4. Executed transaction (single self-reconciling DO block)

Run once via the Lovable SQL editor. Result: **"Query succeeded. No rows returned"** — i.e. no `RAISE EXCEPTION` fired, so every guard (`moved_total = 324`, per-table 0 non-target rows, `character_features` all under target) passed and the block committed atomically.

```sql
do $$
declare
  tgt uuid := '3ca10935-8c3d-4479-9a0c-8bfe8050840c';
  tbls text[] := array['artist_assets','artist_looks','artists','clip_reviews',
    'collections','export_packages','location_library','manufacturing_packages',
    'products','project_assets','project_look_picks','prompts','prop_library',
    'provider_jobs','shots','style_profiles','tech_packs','video_projects'];
  t text; m int; remaining int; moved_total int := 0;
begin
  create table if not exists public.identity_consolidation_backup_20260806(
    tbl text, row_id uuid, old_user_id uuid, new_user_id uuid, moved_at timestamptz default now());

  foreach t in array tbls loop
    execute format('insert into public.identity_consolidation_backup_20260806(tbl,row_id,old_user_id,new_user_id)
      select %L, id, user_id, %L from public.%I where user_id is not null and user_id <> %L', t, tgt, t, tgt);
    execute format('update public.%I set user_id=%L where user_id is not null and user_id <> %L', t, tgt, tgt);
    get diagnostics m = row_count; moved_total := moved_total + m;
    execute format('select count(*) from public.%I where user_id is not null and user_id <> %L', t, tgt) into remaining;
    if remaining <> 0 then raise exception 'RECONCILE FAIL: % still has % non-target rows', t, remaining; end if;
  end loop;

  if moved_total <> 324 then raise exception 'RECONCILE FAIL: moved %, expected 324', moved_total; end if;

  select count(*) into remaining from public.character_features cf
    join public.artists a on a.id = cf.artist_id where a.user_id <> tgt;
  if remaining <> 0 then raise exception 'CF FAIL: % character_features not under target', remaining; end if;

  raise notice 'OK: moved % rows; sources now hold 0; character_features consolidated', moved_total;
end $$;
```

`prompt_templates` is intentionally excluded from the loop (its 14 rows are NULL-owned global seed). All 18 looped tables were pre-verified to have a `uuid id` primary key (required for the pre-image capture).

---

## 5. Rollback SQL (only if ever needed — reverses precisely from the pre-image)

```sql
do $$ declare r text;
begin
  for r in select distinct tbl from public.identity_consolidation_backup_20260806 loop
    execute format('update public.%I t set user_id = b.old_user_id
      from public.identity_consolidation_backup_20260806 b
      where b.tbl = %L and b.row_id = t.id', r, r);
  end loop;
end $$;
```

Alternative full-DB restore point: Lovable daily backup **8 Aug 2026, 07:09:01 UTC**.

---

## 6. Post-commit verification (independent)

| Check | Expected | Actual |
|---|--:|--:|
| Rows under any non-target, non-null UID (19 tables) | 0 | **0** ✅ |
| Rows under durable target (19 tables) | 392 | **392** ✅ |
| Distinct data-owning identities (19 tables) | 1 | **1** ✅ |
| NULL-owner rows (prompt_templates seed) | 14 | **14** ✅ |
| Pre-image mapping rows / distinct sources | 324 / 20 | **324 / 20** ✅ |
| Mapped sources that were anonymous | 20 | **20** ✅ |
| `character_features` under target / not under target | 101 / 0 | **101 / 0** ✅ |

---

## 7. look-composites STORAGE — separate manual step (NOT performed)

**Ownership in the `look-composites` bucket is path-encoded** (`{uid}/{artist_id}/{look_id}.{ext}`), and its RLS authorizes on `(storage.foldername(name))[1] = auth.uid()::text` — **not** on the `storage.objects.owner` metadata column. Therefore a DB re-own does **not** make these objects visible to the durable account.

Measured post-consolidation:

- **363** objects across **16** UID folder-prefixes.
- Only **49** objects sit under the target prefix `3ca10935…/`.
- **314 objects remain under 15 legacy anonymous UID prefixes** → under folder-prefix RLS these would be **invisible/unwritable** to the durable session.
- Separately, **292/363** objects have a NULL `owner` metadata column (latent hygiene; does not affect folder-prefix RLS).

**Required follow-up (do NOT improvise):** copy/re-key the 314 non-target objects to `3ca10935-8c3d-4479-9a0c-8bfe8050840c/…` paths (preserving `{artist_id}/{look_id}` structure), with a verified copy-then-delete plan, **before** the `look-composites` bucket policy portion of PR #17 is applied — otherwise those 314 composites strand. No object was moved, renamed, or re-keyed in this event.

---

## 8. Boundaries honored

- Re-own only — **no** source identity or unrelated record deleted.
- **PR #17 NOT applied.** SEC-2 / SEC-3 untouched. No RLS change, no publish, no edge-function redeploy.
- Live RLS remains the pre-existing permissive state (parked); re-locking is the next, separately-gated step.
