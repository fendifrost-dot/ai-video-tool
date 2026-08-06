-- =============================================================================
-- RISK-001 — Revert accidental anon USING(true) RLS + restore least-privilege
-- =============================================================================
-- Paired revert for the DEV-ONLY migration
--   20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql
-- which dropped the owner-scoped policies on five tenant tables and the
-- `look-composites` storage bucket and replaced them with
--   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)
-- (header: "DEV ONLY … Revert before production"). It was never reverted.
--
-- Forensic:   docs/security/RISK-001/evidence/RLS_FORENSIC_P0_2026-08-05.md
-- Restore spec: forensic §6  ·  Impact: docs/security/RISK-001/IMPACT_REPORT.md
--
-- WHAT THIS DOES
--   1. Drops every `*_anon_all` table policy and every `look_composites_anon_*`
--      storage policy the culprit migration created.
--   2. Recreates the ORIGINAL owner-scoped policies EXACTLY as their creating
--      migrations defined them (text verified against those migrations, NOT
--      reconstructed from memory — see the per-object provenance comments).
--   3. Leaves RLS ENABLED (it already is) and leaves `look-composites`
--      `public = false` (already false) — no bucket-flag change is needed.
--
-- SCOPE DISCIPLINE (RISK-001 ONLY)
--   * Touches ONLY: artists, character_features, location_library, prop_library,
--     artist_looks, and the `look-composites` bucket.
--   * Does NOT touch SEC-2 / SEC-3 (edge-function auth) — those are separate.
--   * Does NOT touch `provider_capabilities` — its `SELECT ... USING (true)` is an
--     intentionally-public read-only catalog with a documented justification
--     (SECURITY.md §2.2). Leaving it public is deliberate, not an oversight.
--
-- CRITICAL SPEC NOTE
--   `character_features` has NO `user_id` column. Its ownership is scoped THROUGH
--   `artists` via `artist_id IN (SELECT id FROM public.artists WHERE user_id =
--   auth.uid())`. Restoring it as `user_id = auth.uid()` would reference a
--   non-existent column and fail. This is why the restore is taken from the spec,
--   not from a uniform template.
--
-- NOT APPLIED BY THIS COMMIT. Apply via the Lovable SQL editor only AFTER
-- Class-C architecture + security review. Verify with
-- docs/security/RISK-001/VERIFICATION_PLAN.md (before/after pg_policies queries).
-- Rollback SQL is at the bottom of this file.
-- =============================================================================

begin;

-- Defensive: these were already enabled by the creating migrations; re-assert so
-- the restore is correct even if state drifted. (No-op when already enabled.)
alter table public.artists            enable row level security;
alter table public.character_features enable row level security;
alter table public.location_library   enable row level security;
alter table public.prop_library       enable row level security;
alter table public.artist_looks       enable row level security;

-- -----------------------------------------------------------------------------
-- 1. artists
--    Origin: 20260514210000_initial_schema.sql:331-364 (owner DO-block).
--    Four discrete owner-scoped policies; `artists.user_id` is a real NOT NULL
--    column (initial_schema.sql:72). Restores per-user isolation of identity
--    records incl. identity_profile_json (LoRA URL / training state).
-- -----------------------------------------------------------------------------
drop policy if exists artists_anon_all    on public.artists;   -- remove accidental USING(true) anon grant
drop policy if exists artists_select_own  on public.artists;
drop policy if exists artists_insert_own  on public.artists;
drop policy if exists artists_update_own  on public.artists;
drop policy if exists artists_delete_own  on public.artists;

-- WHY: an owner may READ only their own artist rows.
create policy artists_select_own on public.artists
  for select using (user_id = auth.uid());
-- WHY: an owner may CREATE artist rows only under their own user_id (no spoofing).
create policy artists_insert_own on public.artists
  for insert with check (user_id = auth.uid());
-- WHY: an owner may UPDATE only their own rows and may not reassign ownership.
create policy artists_update_own on public.artists
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- WHY: an owner may DELETE only their own rows.
create policy artists_delete_own on public.artists
  for delete using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. character_features
--    Origin: 20260517134927_*.sql:33-37 (canonical) / 20260517_phase_a_*.sql.
--    NO user_id column — ownership is via a join to the owning artist. Single
--    FOR ALL policy, matching the original.
-- -----------------------------------------------------------------------------
drop policy if exists character_features_anon_all               on public.character_features; -- remove accidental USING(true) anon grant
drop policy if exists "Users access own character_features"     on public.character_features;

-- WHY: a caller may read/write feature rows ONLY for artists they own; ownership
--      is derived through public.artists (character_features has no user_id).
create policy "Users access own character_features" on public.character_features
  for all
  using      (artist_id in (select id from public.artists where user_id = auth.uid()))
  with check (artist_id in (select id from public.artists where user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. location_library
--    Origin: 20260518000150_*.sql:81-83 / 20260517_phase_1_library.sql:88-92.
--    Direct owner column `user_id`. Single FOR ALL policy.
-- -----------------------------------------------------------------------------
drop policy if exists location_library_anon_all            on public.location_library; -- remove accidental USING(true) anon grant
drop policy if exists "Users access own location_library"  on public.location_library;

-- WHY: a caller may read/write only their own location-library rows.
create policy "Users access own location_library" on public.location_library
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. prop_library
--    Origin: 20260518000150_*.sql:82-83 / 20260517_phase_1_library.sql:140-144.
--    Direct owner column `user_id`. Single FOR ALL policy.
-- -----------------------------------------------------------------------------
drop policy if exists prop_library_anon_all            on public.prop_library; -- remove accidental USING(true) anon grant
drop policy if exists "Users access own prop_library"  on public.prop_library;

-- WHY: a caller may read/write only their own prop-library rows.
create policy "Users access own prop_library" on public.prop_library
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. artist_looks
--    Origin: 20260518050011_*.sql:41-45 / 20260517_phase_2_looks.sql:53-57.
--    Direct owner column `user_id`. Single FOR ALL policy.
-- -----------------------------------------------------------------------------
drop policy if exists artist_looks_anon_all            on public.artist_looks; -- remove accidental USING(true) anon grant
drop policy if exists "Users access own artist_looks"  on public.artist_looks;

-- WHY: a caller may read/write only their own look-composition recipes.
create policy "Users access own artist_looks" on public.artist_looks
  for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. storage bucket: look-composites
--    Origin: 20260517_phase_2_looks.sql:121-162 (owner-folder-prefix policies).
--    Bucket stays `public = false` (unchanged by the culprit and by this file).
--    Path convention: look-composites/{user_id}/{artist_id}/{look_id}.{ext}
--    Ownership = leading folder equals the caller's uid.
-- -----------------------------------------------------------------------------
drop policy if exists "look_composites_anon_select"  on storage.objects; -- remove accidental anon SELECT on bucket
drop policy if exists "look_composites_anon_insert"  on storage.objects; -- remove accidental anon INSERT on bucket
drop policy if exists "look_composites_anon_update"  on storage.objects; -- remove accidental anon UPDATE on bucket
drop policy if exists "look_composites_anon_delete"  on storage.objects; -- remove accidental anon DELETE on bucket

drop policy if exists "look_composites_select_own"   on storage.objects;
drop policy if exists "look_composites_insert_own"   on storage.objects;
drop policy if exists "look_composites_update_own"   on storage.objects;
drop policy if exists "look_composites_delete_own"   on storage.objects;

-- WHY: read a composite object only if it lives under your own uid folder.
create policy "look_composites_select_own" on storage.objects
  for select
  using (bucket_id = 'look-composites' and auth.uid()::text = (storage.foldername(name))[1]);
-- WHY: upload a composite only into your own uid folder.
create policy "look_composites_insert_own" on storage.objects
  for insert
  with check (bucket_id = 'look-composites' and auth.uid()::text = (storage.foldername(name))[1]);
-- WHY: modify a composite only within your own uid folder (and keep it there).
create policy "look_composites_update_own" on storage.objects
  for update
  using      (bucket_id = 'look-composites' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'look-composites' and auth.uid()::text = (storage.foldername(name))[1]);
-- WHY: delete a composite only within your own uid folder.
create policy "look_composites_delete_own" on storage.objects
  for delete
  using (bucket_id = 'look-composites' and auth.uid()::text = (storage.foldername(name))[1]);

commit;

-- =============================================================================
-- ROLLBACK  (re-open to the exact pre-revert dev state — EMERGENCY USE ONLY)
-- =============================================================================
-- Restores the culprit migration's open policies verbatim. Only run this if the
-- lock-down demonstrably breaks the app AND the anonymous-auth root cause has not
-- yet been resolved (forensic §6.3). Re-opening restores full cross-tenant
-- read/write/delete exposure — it is NOT a safe resting state.
--
-- begin;
--   -- artists
--   drop policy if exists artists_select_own on public.artists;
--   drop policy if exists artists_insert_own on public.artists;
--   drop policy if exists artists_update_own on public.artists;
--   drop policy if exists artists_delete_own on public.artists;
--   create policy artists_anon_all on public.artists
--     for all to anon, authenticated using (true) with check (true);
--   -- character_features
--   drop policy if exists "Users access own character_features" on public.character_features;
--   create policy character_features_anon_all on public.character_features
--     for all to anon, authenticated using (true) with check (true);
--   -- location_library
--   drop policy if exists "Users access own location_library" on public.location_library;
--   create policy location_library_anon_all on public.location_library
--     for all to anon, authenticated using (true) with check (true);
--   -- prop_library
--   drop policy if exists "Users access own prop_library" on public.prop_library;
--   create policy prop_library_anon_all on public.prop_library
--     for all to anon, authenticated using (true) with check (true);
--   -- artist_looks
--   drop policy if exists "Users access own artist_looks" on public.artist_looks;
--   create policy artist_looks_anon_all on public.artist_looks
--     for all to anon, authenticated using (true) with check (true);
--   -- look-composites bucket
--   drop policy if exists "look_composites_select_own" on storage.objects;
--   drop policy if exists "look_composites_insert_own" on storage.objects;
--   drop policy if exists "look_composites_update_own" on storage.objects;
--   drop policy if exists "look_composites_delete_own" on storage.objects;
--   create policy "look_composites_anon_select" on storage.objects
--     for select to anon, authenticated using (bucket_id = 'look-composites');
--   create policy "look_composites_anon_insert" on storage.objects
--     for insert to anon, authenticated with check (bucket_id = 'look-composites');
--   create policy "look_composites_anon_update" on storage.objects
--     for update to anon, authenticated using (bucket_id = 'look-composites')
--     with check (bucket_id = 'look-composites');
--   create policy "look_composites_anon_delete" on storage.objects
--     for delete to anon, authenticated using (bucket_id = 'look-composites');
-- commit;
-- =============================================================================
