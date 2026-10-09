-- Holds 20261008140000_footage_edits.sql against data shaped like the real YSL project: one uploaded take, one
-- project sync, two variations of the same song. Runs with every migration applied (scripts/db/throwaway.sh).
--
-- The four things worth proving, because each is a silent failure if it is wrong:
--   1. the take and its sync are PROJECT-scoped — a new variation inherits them with no row of its own
--   2. a trim is a length, an excluded take is never primary
--   3. two variations can cut the same take differently and neither changes the other
--   4. duplicate_variation carries the cuts — a duplicate is not silently reset to the full synced coverage
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000f1';

insert into public.video_projects (id, user_id, title)
values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Footage test');

insert into public.video_variations (id, user_id, project_id, name)
values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Original'),
       ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Second');
update public.video_projects set active_variation_id = 'f1000000-0000-0000-0000-000000000001'
 where id = '10000000-0000-0000-0000-0000000000f1';

-- the one uploaded take, and the hand-made sync that places it on the song
insert into public.project_assets (id, user_id, project_id, asset_type, file_url, footage_role, metadata_json)
values ('a1000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1',
        'reference_video', 'hero_clip_hd_1080.mp4', 'performance', '{"duration_seconds": 190.34015}'::jsonb);
insert into public.performance_syncs (user_id, project_id, performance_asset_id, offset_seconds, status, method)
values ('00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f1', 0.8538, 'manual', 'manual');

-- the same song second, as a shot of each variation
insert into public.shots (id, user_id, project_id, variation_id, shot_number, timestamp_start, timestamp_end, spec_key)
values ('50000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000001', 5, 15.68, 19.6, 'c005'),
       ('50000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000002', 5, 15.68, 19.6, 'c005');

-- ── 1. the shared layer is genuinely shared ─────────────────────────────────
-- Neither the take nor its sync carries a variation, so a variation created later inherits both with nothing
-- copied. This is the inheritance the feature rests on; a column added here would break it.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_name in ('project_assets','performance_syncs') and column_name = 'variation_id';
  if n <> 0 then raise exception 'footage or sync became variation-scoped (% columns) — variations would stop inheriting takes', n; end if;

  select count(*) into n from public.performance_syncs
   where project_id = '10000000-0000-0000-0000-0000000000f1' and status in ('manual','confirmed');
  if n <> 1 then raise exception 'expected one usable project sync, found %', n; end if;
end $$;

-- ── 2. shape ────────────────────────────────────────────────────────────────
-- a trim is a length, never a position
do $$
begin
  begin
    insert into public.shot_asset_assignments (project_id, variation_id, shot_id, asset_id, role, trim_head_seconds)
    values ('10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f1', 'performance', -0.5);
    raise exception 'a negative trim was accepted';
  exception when check_violation then null;
  end;
end $$;

-- an excluded take cannot also be what the shot shows
do $$
begin
  begin
    insert into public.shot_asset_assignments (project_id, variation_id, shot_id, asset_id, role, excluded, is_primary)
    values ('10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f1', 'performance', true, true);
    raise exception 'a take was both excluded and primary';
  exception when check_violation then null;
  end;
end $$;

-- an existing row means "nothing decided", which is what every row written before this migration means
insert into public.shot_asset_assignments (project_id, variation_id, shot_id, asset_id, role, is_primary)
values ('10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000f1', 'performance', true);
do $$
declare r record;
begin
  select trim_head_seconds, trim_tail_seconds, excluded into r from public.shot_asset_assignments
   where shot_id = '50000000-0000-0000-0000-0000000000f1';
  if r.trim_head_seconds <> 0 or r.trim_tail_seconds <> 0 or r.excluded then
    raise exception 'the default of a new row is not "nothing decided": % % %', r.trim_head_seconds, r.trim_tail_seconds, r.excluded;
  end if;
end $$;

-- ── 3. two variations cut the same take differently ─────────────────────────
update public.shot_asset_assignments set trim_head_seconds = 0.5, trim_tail_seconds = 0.4
 where shot_id = '50000000-0000-0000-0000-0000000000f1';

-- variation 2 leaves the same take out of the same song second, on purpose
insert into public.shot_asset_assignments (project_id, variation_id, shot_id, asset_id, role, excluded, is_primary)
values ('10000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-0000000000f2', 'a1000000-0000-0000-0000-0000000000f1', 'performance', true, false);

do $$
declare r record;
begin
  select trim_head_seconds, trim_tail_seconds, excluded into r from public.shot_asset_assignments
   where variation_id = 'f1000000-0000-0000-0000-000000000001';
  if r.trim_head_seconds <> 0.5 or r.excluded then raise exception 'variation 1 trim was lost: % / %', r.trim_head_seconds, r.excluded; end if;

  select trim_head_seconds, excluded into r from public.shot_asset_assignments
   where variation_id = 'f1000000-0000-0000-0000-000000000002';
  if r.trim_head_seconds <> 0 or not r.excluded then raise exception 'variation 2 exclusion was lost: % / %', r.trim_head_seconds, r.excluded; end if;
end $$;

-- and the one media file is still ONE row: nothing was copied to give a variation its own cut
do $$
declare n int;
begin
  select count(*) into n from public.project_assets where project_id = '10000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'the media file was duplicated to hold an edit: % rows', n; end if;
end $$;

-- ── 4. a duplicate inherits the cuts, not just the takes ────────────────────
do $$
declare v_dup uuid; r record; n int;
begin
  v_dup := public.duplicate_variation('f1000000-0000-0000-0000-000000000001', 'Duplicated');

  select trim_head_seconds, trim_tail_seconds, excluded into r
    from public.shot_asset_assignments where variation_id = v_dup;
  if r.trim_head_seconds <> 0.5 or r.trim_tail_seconds <> 0.4 then
    raise exception 'the duplicate was reset to the full synced coverage: % / %', r.trim_head_seconds, r.trim_tail_seconds;
  end if;
  if r.excluded then raise exception 'the duplicate invented an exclusion'; end if;

  -- still one file, shared
  select count(*) into n from public.project_assets where project_id = '10000000-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'duplicating a variation copied the media file: % rows', n; end if;

  -- changing the duplicate must not reach the variation it came from
  update public.shot_asset_assignments set trim_head_seconds = 2.0 where variation_id = v_dup;
  select trim_head_seconds into r from public.shot_asset_assignments
   where variation_id = 'f1000000-0000-0000-0000-000000000001';
  if r.trim_head_seconds <> 0.5 then raise exception 'editing the duplicate changed its source: %', r.trim_head_seconds; end if;
end $$;

rollback;

\echo 'footage_edits: all assertions hold'
