-- SEC-4 (storage): scope prop-refs and project-references to their owners.
--
-- Before (live, 12 Oct 2026): both buckets are private, but two permissive policies opened them to everyone:
--   <bucket>_open_test      ALL to anon, authenticated   using/with check bucket_id = '<bucket>'
--   single_tenant_storage   ALL to authenticated          bucket_id = ANY(11 buckets, these two included)
-- Anonymous sign-in yields the `authenticated` role, so any visitor could list, read, sign, overwrite and delete.
-- Owner-scoped *_select/insert/update/delete_own policies (first folder = auth.uid()) already exist and stay.
--
-- Legacy: 45 project-references objects were uploaded by anonymous sessions into the owner's own projects
-- (<anonUid>/<projectId>/...). The owner still uses them (41 are project_assets rows), so the owner of each such
-- project is granted read + delete on exactly those <anonUid>/<projectId>/ prefixes. Grants live in a locked table
-- (RLS on, no policies, no client grants), not a join on video_projects, whose rows a client can edit.
--
-- Not changed: service-role edge functions (bypass RLS); the other 9 buckets in single_tenant_storage.
-- Rollback: docs/evidence/SEC4_STORAGE_ROLLBACK.sql

begin;

-- Refuse to run against a database that differs from the one reviewed.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'single_tenant_storage' and cmd = 'ALL' and roles = '{authenticated}') then
    raise exception 'SEC-4: single_tenant_storage is not ALL to {authenticated}; live policies differ from the reviewed snapshot';
  end if;
end $$;

drop policy if exists "prop-refs_open_test" on storage.objects;
drop policy if exists "project-references_open_test" on storage.objects;

alter policy "single_tenant_storage" on storage.objects
  using (bucket_id = any (array['artist-assets','project-audio','project-clips','project-exports','wardrobe-refs','location-refs','look-composites','style-references','training-zips']))
  with check (bucket_id = any (array['artist-assets','project-audio','project-clips','project-exports','wardrobe-refs','location-refs','look-composites','style-references','training-zips']));

create table if not exists public.storage_legacy_folder_grants (
  bucket_id text not null,
  folder_uid uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (bucket_id, folder_uid, project_id, user_id)
);
alter table public.storage_legacy_folder_grants enable row level security;
revoke all on public.storage_legacy_folder_grants from anon, authenticated;

-- True when the caller was granted the legacy folder holding `object_name`. Says nothing about anyone else's grants.
create or replace function public.storage_legacy_folder_access(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.storage_legacy_folder_grants g
    where g.user_id = auth.uid()
      and g.bucket_id = $1
      and (storage.foldername($2))[1] = g.folder_uid::text
      and (storage.foldername($2))[2] = g.project_id::text
  );
$$;
revoke all on function public.storage_legacy_folder_access(text, text) from public, anon;
grant execute on function public.storage_legacy_folder_access(text, text) to authenticated;

drop policy if exists "project-references_select_legacy_grant" on storage.objects;
drop policy if exists "project-references_delete_legacy_grant" on storage.objects;
create policy "project-references_select_legacy_grant" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-references' and public.storage_legacy_folder_access(bucket_id, name));
create policy "project-references_delete_legacy_grant" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-references' and public.storage_legacy_folder_access(bucket_id, name));

-- The seven anonymous-session folders found on 12 Oct 2026, each inside a project owned by the owner. The owner is
-- fixed here (not read from video_projects, which clients can edit); the join only confirms the projects agree.
insert into public.storage_legacy_folder_grants (bucket_id, folder_uid, project_id, user_id, reason)
select 'project-references', f.folder_uid, f.project_id, '3ca10935-8c3d-4479-9a0c-8bfe8050840c'::uuid, 'SEC-4: anonymous-session upload into owner project'
from (values
  ('08ae347a-f13a-498c-a420-b0ef0bf706c7'::uuid, '764a63d2-93cd-44f3-905f-292f14ab2f51'::uuid),
  ('65cf99cb-fd18-4168-b9ab-dfbfd42112ca'::uuid, 'e05c6d55-a819-47d4-8fb2-0e54e0905629'::uuid),
  ('79516c91-c2ad-4b54-93f1-05023fbca28c'::uuid, '86854405-df93-4e0c-a27a-f6b750b96592'::uuid),
  ('832fa0bc-1f7e-4586-ab8b-2ac323698ede'::uuid, '764a63d2-93cd-44f3-905f-292f14ab2f51'::uuid),
  ('9748a289-5988-40a4-b6c8-f0cd7a278367'::uuid, '764a63d2-93cd-44f3-905f-292f14ab2f51'::uuid),
  ('99c8af67-c6ce-4ed0-8440-eb0f72667589'::uuid, '764a63d2-93cd-44f3-905f-292f14ab2f51'::uuid),
  ('c955dbe6-5b9d-42c1-87c4-2388bcc68369'::uuid, '764a63d2-93cd-44f3-905f-292f14ab2f51'::uuid)
) as f(folder_uid, project_id)
join public.video_projects vp on vp.id = f.project_id and vp.user_id = '3ca10935-8c3d-4479-9a0c-8bfe8050840c'::uuid
on conflict do nothing;

do $$
begin
  if (select count(*) from public.storage_legacy_folder_grants where user_id = '3ca10935-8c3d-4479-9a0c-8bfe8050840c'::uuid and bucket_id = 'project-references') <> 7 then
    raise exception 'SEC-4: expected exactly 7 legacy folder grants for the owner; projects differ from the reviewed snapshot';
  end if;
end $$;

commit;
