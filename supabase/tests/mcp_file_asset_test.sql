-- Holds 20261105180000_mcp_file_asset.sql. Runs with every migration applied (scripts/db/throwaway.sh).
-- file_mcp_asset is security invoker: the owner can file and demote their own primary; another owner cannot.
\set ON_ERROR_STOP on
begin;

-- Supabase grants these to authenticated; this throwaway does not. security invoker uses them, and row level security still applies.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select, insert, update, delete on public.shots, public.video_projects, public.video_variations, public.project_assets, public.shot_asset_assignments to authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b2');

insert into public.video_projects (id, user_id, title)
values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'YSL');

insert into public.video_variations (id, user_id, project_id, name)
values ('c067efb9-90af-418e-aa6d-58834f6e19de', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'board');

insert into public.shots (id, user_id, project_id, variation_id, shot_number, spec_key)
values ('0bad80da-e7a4-4edc-a281-8e7cd4a69300', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'c067efb9-90af-418e-aa6d-58834f6e19de', 36, 'c036');

insert into public.project_assets (id, user_id, project_id, shot_id, asset_type, file_url, source_tool, approval_status, footage_role)
values ('b77ef700-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '0bad80da-e7a4-4edc-a281-8e7cd4a69300', 'generated_clip', '00000000-0000-0000-0000-0000000000a1/old.mp4', 'manual', 'approved', 'performance');

insert into public.shot_asset_assignments (id, user_id, project_id, variation_id, shot_id, asset_id, role, is_primary, sort_order)
values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'c067efb9-90af-418e-aa6d-58834f6e19de', '0bad80da-e7a4-4edc-a281-8e7cd4a69300', 'b77ef700-0000-4000-8000-000000000001', 'performance', true, 3);

set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

select public.file_mcp_asset(
  '10000000-0000-0000-0000-0000000000a1',
  '0bad80da-e7a4-4edc-a281-8e7cd4a69300',
  'c067efb9-90af-418e-aa6d-58834f6e19de',
  'edited_clip',
  '00000000-0000-0000-0000-0000000000a1/764a63d2/c036_silent.mp4',
  'manual',
  'pending',
  'b_roll',
  null,
  1,
  '{"bucket":"project-exports","replaced":{"asset_id":"b77ef700-0000-4000-8000-000000000001","why":"generated mouth"}}'::jsonb,
  'silent cutaway',
  'b_roll',
  0,
  1.5,
  null,
  0,
  'replaced the generated mouth'
);

do $$
declare
  old_primary boolean;
  new_primary boolean;
  n int;
  inn double precision;
begin
  select is_primary into old_primary from public.shot_asset_assignments where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if old_primary then raise exception 'the old primary was not demoted'; end if;
  select count(*) into n from public.shot_asset_assignments where shot_id = '0bad80da-e7a4-4edc-a281-8e7cd4a69300' and is_primary;
  if n <> 1 then raise exception 'expected one primary, saw %', n; end if;
  select a.is_primary, a.source_in_seconds into new_primary, inn
  from public.shot_asset_assignments a
  join public.project_assets p on p.id = a.asset_id
  where p.file_url = '00000000-0000-0000-0000-0000000000a1/764a63d2/c036_silent.mp4';
  if not new_primary then raise exception 'the new assignment is not primary'; end if;
  if inn <> 0 then raise exception 'source_in_seconds was not stored'; end if;
  if (select count(*) from public.shot_asset_assignments where shot_id = '0bad80da-e7a4-4edc-a281-8e7cd4a69300') <> 2 then
    raise exception 'the old assignment was deleted';
  end if;
end $$;

do $$
begin
  perform public.file_mcp_asset(
    '10000000-0000-0000-0000-0000000000a1',
    '0bad80da-e7a4-4edc-a281-8e7cd4a69300',
    'c067efb9-90af-418e-aa6d-58834f6e19de',
    'edited_clip',
    '00000000-0000-0000-0000-0000000000a1/hel%lo.mp4',
    'manual', 'pending', 'b_roll', null, 1, '{}'::jsonb, null, 'b_roll', null, null, null, 0, null);
  raise exception 'a percent sign in file_url was accepted';
exception when others then
  if sqlerrm not like '%owner id%' then raise; end if;
end $$;

set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  perform public.file_mcp_asset(
    '10000000-0000-0000-0000-0000000000a1',
    '0bad80da-e7a4-4edc-a281-8e7cd4a69300',
    'c067efb9-90af-418e-aa6d-58834f6e19de',
    'edited_clip',
    '00000000-0000-0000-0000-0000000000b2/x.mp4',
    'manual', 'pending', 'b_roll', null, 1, '{}'::jsonb, null, 'b_roll', null, null, null, 0, null);
  raise exception 'another owner filed onto this shot';
exception when others then
  if sqlerrm not like '%shot not found%' and sqlerrm not like '%owner id%' then raise; end if;
end $$;

rollback;

\echo 'mcp_file_asset: all assertions hold'
