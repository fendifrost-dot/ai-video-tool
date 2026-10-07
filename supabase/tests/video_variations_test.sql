-- Holds 20261007120000_video_variations.sql against data that looks like a real project. Runs on a throwaway
-- throwaway: until 20261007120000_video_variations.sql
-- Postgres on which every migration BEFORE it has been applied (scripts/db/throwaway.sh does this), seeds a
-- project the old way, applies the migration, and asserts. Nothing here touches a live database.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
insert into public.video_projects (id, user_id, title, mood, visual_style, notes, treatment_json)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'YSL',
        'cold', 'A runway at night.', 'PLACES: the runway.',
        '{"treatment": {"text": "He walks the runway.", "mode": "ai", "updated_at": "t", "notes": ""}, "text": "He walks the runway."}'::jsonb);
insert into public.project_assets (id, user_id, project_id, asset_type, file_url, footage_role)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'reference_video', 'u/p/take.mp4', 'performance'),
       ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'generated_clip', 'u/p/clip.mp4', null);
insert into public.shots (id, user_id, project_id, shot_number, timestamp_start, timestamp_end, spec_key, generated_json, locked)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 0, 4, 'c001', '{"purpose": "old c001"}'::jsonb, false),
       ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, 4, 8, 'c002', '{"purpose": "old c002"}'::jsonb, true);
insert into public.shot_asset_assignments (project_id, shot_id, asset_id, role, is_primary)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'generated_clip', true);
insert into public.continuity_entities (project_id, kind, key, name, description, approved_asset_id)
values ('10000000-0000-0000-0000-000000000001', 'location', 'RUNWAY', 'Runway', 'A black runway.', null);
insert into public.performance_syncs (project_id, performance_asset_id, offset_seconds, method, status)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0.85, 'manual', 'confirmed');
insert into public.provider_jobs (id, user_id, project_id, provider, status, request_payload_json)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'grok', 'succeeded', '{"shotId": "30000000-0000-0000-0000-000000000002"}'::jsonb);
-- a treatment version kept by the OLD trigger (an edit on the project row)
update public.video_projects set treatment_json = '{"treatment": {"text": "A forest burns.", "mode": "manual", "updated_at": "t2", "notes": "", "change": "edit", "change_at": "t2"}, "text": "A forest burns."}'::jsonb
where id = '10000000-0000-0000-0000-000000000001';
commit;

\i supabase/migrations/20261007120000_video_variations.sql

begin;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
do $$
declare
  v uuid; v2 uuid; n int; t text;
begin
  -- 3. one variation, active, holding exactly what the project had; the project's own columns emptied
  select active_variation_id into v from public.video_projects where id = '10000000-0000-0000-0000-000000000001';
  if v is null then raise exception 'no active variation'; end if;
  select count(*) into n from public.video_variations where project_id = '10000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'expected 1 variation, got %', n; end if;
  select treatment_json -> 'treatment' ->> 'text' into t from public.video_variations where id = v;
  if t <> 'A forest burns.' then raise exception 'treatment not moved: %', t; end if;
  select mood into t from public.video_variations where id = v;
  if t <> 'cold' then raise exception 'mood not moved'; end if;
  select mood into t from public.video_projects where id = '10000000-0000-0000-0000-000000000001';
  if t is not null then raise exception 'project mood not emptied'; end if;
  -- 4. everything of the project is in it
  select count(*) into n from public.shots where variation_id = v; if n <> 2 then raise exception 'shots not backfilled'; end if;
  select count(*) into n from public.shot_asset_assignments where variation_id = v; if n <> 1 then raise exception 'assignments not backfilled'; end if;
  select count(*) into n from public.continuity_entities where variation_id = v; if n <> 1 then raise exception 'entities not backfilled'; end if;
  select count(*) into n from public.treatment_versions where variation_id = v; if n <> 1 then raise exception 'versions not backfilled: %', n; end if;
  select count(*) into n from public.provider_jobs where variation_id = v; if n <> 1 then raise exception 'jobs not backfilled'; end if;
  -- 7. a duplicate: same keys, same footage, its own ids; the source untouched
  select public.duplicate_variation(v, 'Copy') into v2;
  select count(*) into n from public.shots where variation_id = v2 and spec_key in ('c001', 'c002'); if n <> 2 then raise exception 'shots not copied'; end if;
  select count(*) into n from public.shots where variation_id = v; if n <> 2 then raise exception 'source shots changed'; end if;
  select count(*) into n from public.shot_asset_assignments a join public.shots s on s.id = a.shot_id where s.variation_id = v2 and a.variation_id = v2 and a.is_primary; if n <> 1 then raise exception 'assignment not copied onto the new shot'; end if;
  select count(*) into n from public.continuity_entities where variation_id = v2 and key = 'RUNWAY'; if n <> 1 then raise exception 'entity not copied'; end if;
  select count(*) into n from public.treatment_versions where variation_id = v2; if n <> 0 then raise exception 'history must not be copied'; end if;
  select count(*) into n from public.project_assets where project_id = '10000000-0000-0000-0000-000000000001'; if n <> 2 then raise exception 'assets must not be copied'; end if;
  -- 5. two boards with the same keys and numbers in one project
  select count(*) into n from public.shots where project_id = '10000000-0000-0000-0000-000000000001' and spec_key = 'c001'; if n <> 2 then raise exception 'two c001 expected'; end if;
  -- 6. a treatment edit on a variation is kept as THAT variation's version
  update public.video_variations set treatment_json = '{"treatment": {"text": "Different again.", "mode": "manual", "updated_at": "t3", "notes": "", "change": "edit", "change_at": "t3"}}'::jsonb where id = v2;
  select count(*) into n from public.treatment_versions where variation_id = v2; if n <> 1 then raise exception 'version not kept on the variation'; end if;
  select treatment_text into t from public.treatment_versions where variation_id = v2; if t <> 'A forest burns.' then raise exception 'wrong text kept: %', t; end if;
  select count(*) into n from public.treatment_versions where variation_id = v; if n <> 1 then raise exception 'the other variation''s history changed'; end if;
  -- 4. isolation on insert: a new shot with no variation goes to the ACTIVE one; its assignment follows the shot
  update public.video_projects set active_variation_id = v2 where id = '10000000-0000-0000-0000-000000000001';
  insert into public.shots (id, user_id, project_id, shot_number, timestamp_start, timestamp_end, spec_key)
  values ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 3, 8, 12, 'c003');
  select variation_id::text into t from public.shots where id = '30000000-0000-0000-0000-000000000009'; if t <> v2::text then raise exception 'new shot not in the active variation'; end if;
  update public.video_projects set active_variation_id = v where id = '10000000-0000-0000-0000-000000000001';
  insert into public.shot_asset_assignments (project_id, shot_id, asset_id, role) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'generated_clip');
  select variation_id::text into t from public.shot_asset_assignments where shot_id = '30000000-0000-0000-0000-000000000009'; if t <> v2::text then raise exception 'assignment did not follow its shot (took the active one)'; end if;
  -- a job inserted while v is active is v''s, whatever becomes active later
  insert into public.provider_jobs (id, user_id, project_id, provider, status, request_payload_json)
  values ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'grok', 'queued', '{}'::jsonb);
  update public.video_projects set active_variation_id = v2 where id = '10000000-0000-0000-0000-000000000001';
  select variation_id::text into t from public.provider_jobs where id = '40000000-0000-0000-0000-000000000002'; if t <> v::text then raise exception 'job lost the variation it was submitted against'; end if;
  raise notice 'video_variations: all assertions hold';
end $$;
rollback;
