-- Holds 20261008220000_outfits_and_scenes.sql against data that looks like a real project. Runs with every
-- migration applied (scripts/db/throwaway.sh). Nothing here touches a live database.
--
-- Worth proving, because each is a silent failure if wrong:
--   1. outfit columns only exist on outfits, and an outfit always has a piece list and a version
--   2. the version moves when the words or the pieces change, and only then
--   3. two variations of one song can dress him DIFFERENTLY and neither changes the other
--   4. duplicate_variation carries outfits (pieces, version) and scenes
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000d1';

insert into public.artists (id, user_id, name)
values ('a0000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Fendi Frost');

insert into public.video_projects (id, user_id, title)
values ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'Outfit test');

insert into public.video_variations (id, user_id, project_id, name)
values ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Original'),
       ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Second');
update public.video_projects set active_variation_id = 'd1000000-0000-0000-0000-000000000001'
 where id = '10000000-0000-0000-0000-0000000000d1';

-- ── 1. shape ────────────────────────────────────────────────────────────────
-- an outfit must carry a piece list
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name)
    values ('10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001', 'outfit', 'NOPIECES', 'No pieces');
    raise exception 'an outfit with no piece list was accepted';
  exception when check_violation then null;
  end;
end $$;

-- a location must not carry one
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name, garment_feature_ids)
    values ('10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001', 'location', 'DRESSED_PLACE', 'Dressed place', '{}');
    raise exception 'a location with garment pieces was accepted';
  exception when check_violation then null;
  end;
end $$;

-- an outfit with an empty list (words only) is fine and starts at version 1
insert into public.continuity_entities (id, project_id, variation_id, kind, key, name, description, garment_feature_ids)
values ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001',
        'outfit', 'DENIM', 'YSL denim look', 'black denim trucker jacket over black jeans', '{}');
do $$
declare v int;
begin
  select version into v from public.continuity_entities where id = 'e1000000-0000-0000-0000-000000000001';
  if v <> 1 then raise exception 'a new outfit started at version %, not 1', v; end if;
end $$;

-- ── 2. the version moves with the words and the pieces, not with anything else ─
update public.continuity_entities set archived = true where id = 'e1000000-0000-0000-0000-000000000001';
update public.continuity_entities set archived = false where id = 'e1000000-0000-0000-0000-000000000001';
update public.continuity_entities set reference_asset_ids = '{}' where id = 'e1000000-0000-0000-0000-000000000001';
do $$
declare v int;
begin
  select version into v from public.continuity_entities where id = 'e1000000-0000-0000-0000-000000000001';
  if v <> 1 then raise exception 'archiving or a picture change moved the version to %', v; end if;
end $$;

update public.continuity_entities
   set garment_feature_ids = '{11111111-1111-1111-1111-111111111111}'
 where id = 'e1000000-0000-0000-0000-000000000001';
update public.continuity_entities set description = 'black denim trucker jacket, black Mick jeans'
 where id = 'e1000000-0000-0000-0000-000000000001';
update public.continuity_entities set name = 'Denim look'
 where id = 'e1000000-0000-0000-0000-000000000001';
do $$
declare v int;
begin
  select version into v from public.continuity_entities where id = 'e1000000-0000-0000-0000-000000000001';
  if v <> 4 then raise exception 'three changes to pieces, words and name left the version at %, not 4', v; end if;
end $$;

-- ── 3. isolation between variations ───────────────────────────────────────
insert into public.continuity_entities (id, project_id, variation_id, kind, key, name, description, garment_feature_ids)
values ('e1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000002',
        'outfit', 'DENIM', 'YSL denim look', 'the same key in the other video', '{22222222-2222-2222-2222-222222222222}');
update public.continuity_entities set garment_feature_ids = '{33333333-3333-3333-3333-333333333333}'
 where id = 'e1000000-0000-0000-0000-000000000002';
do $$
declare a uuid[]; b uuid[];
begin
  select garment_feature_ids into a from public.continuity_entities where id = 'e1000000-0000-0000-0000-000000000001';
  select garment_feature_ids into b from public.continuity_entities where id = 'e1000000-0000-0000-0000-000000000002';
  if a <> '{11111111-1111-1111-1111-111111111111}'::uuid[] then raise exception 'changing the second video''s outfit changed the first''s'; end if;
  if b <> '{33333333-3333-3333-3333-333333333333}'::uuid[] then raise exception 'the second video''s outfit did not take its change'; end if;
end $$;

-- scenes: a stretch that must end after it starts
do $$
begin
  begin
    insert into public.variation_scenes (project_id, variation_id, name, start_seconds, end_seconds, outfit_key)
    values ('10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001', 'backwards', 10, 5, 'DENIM');
    raise exception 'a scene ending before it starts was accepted';
  exception when check_violation then null;
  end;
end $$;
insert into public.variation_scenes (project_id, variation_id, name, start_seconds, end_seconds, outfit_key, notes)
values ('10000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-000000000001', 'The viewer', 43.14, 58.82, 'DENIM', 'denim per the treatment');

-- ── 4. duplication carries outfits and scenes ──────────────────────────────
do $$
declare v_new uuid; n int; ver int; pieces uuid[]; sc int;
begin
  v_new := public.duplicate_variation('d1000000-0000-0000-0000-000000000001', 'Copy');
  select count(*), max(version), max(garment_feature_ids) into n, ver, pieces
    from public.continuity_entities where variation_id = v_new and kind = 'outfit';
  if n <> 1 then raise exception 'the copy has % outfits, not 1', n; end if;
  if ver <> 4 then raise exception 'the copy''s outfit is at version %, not 4', ver; end if;
  if pieces <> '{11111111-1111-1111-1111-111111111111}'::uuid[] then raise exception 'the copy lost the outfit''s pieces'; end if;
  select count(*) into sc from public.variation_scenes where variation_id = v_new and outfit_key = 'DENIM' and name = 'The viewer';
  if sc <> 1 then raise exception 'the copy has % scenes, not 1', sc; end if;
end $$;

select 'outfits_and_scenes: all assertions hold' as result;
rollback;
