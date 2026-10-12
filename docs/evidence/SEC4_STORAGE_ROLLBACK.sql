-- Rollback for supabase/migrations/20261012210000_sec4_scope_reference_buckets.sql.
-- Restores the exact policies recorded live on 12 Oct 2026 before the change (re-opens SEC-4: use only to restore service).
begin;
drop policy if exists "project-references_select_legacy_grant" on storage.objects;
drop policy if exists "project-references_delete_legacy_grant" on storage.objects;
drop function if exists public.storage_legacy_folder_access(text, text);
drop table if exists public.storage_legacy_folder_grants;
alter policy "single_tenant_storage" on storage.objects
  using (bucket_id = any (array['artist-assets','project-audio','project-references','project-clips','project-exports','wardrobe-refs','location-refs','prop-refs','look-composites','style-references','training-zips']))
  with check (bucket_id = any (array['artist-assets','project-audio','project-references','project-clips','project-exports','wardrobe-refs','location-refs','prop-refs','look-composites','style-references','training-zips']));
create policy "prop-refs_open_test" on storage.objects for all to anon, authenticated
  using (bucket_id = 'prop-refs') with check (bucket_id = 'prop-refs');
create policy "project-references_open_test" on storage.objects for all to anon, authenticated
  using (bucket_id = 'project-references') with check (bucket_id = 'project-references');
commit;
