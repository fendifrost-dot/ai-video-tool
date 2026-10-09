-- Holds 20261007170000_cast_members.sql against data that looks like a real project. Runs with every
-- migration applied (scripts/db/throwaway.sh). Nothing here touches a live database.
--
-- The three things worth proving, because each is a silent failure if it is wrong:
--   1. cast columns only exist on characters, and a character must say what it is
--   2. two variations of one song can be cast DIFFERENTLY and neither changes the other
--   3. duplicate_variation carries role, identity mode and artist link — not just names and pictures
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c1';

insert into public.artists (id, user_id, name)
values ('a0000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Fendi Frost');

insert into public.video_projects (id, user_id, title)
values ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Cast test');

-- The backfill only ran for projects that existed when the migration was applied, so a project
-- created now makes its own variations, exactly as the app does.
insert into public.video_variations (id, user_id, project_id, name)
values ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Original'),
       ('c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Second');
update public.video_projects set active_variation_id = 'c1000000-0000-0000-0000-000000000001'
 where id = '10000000-0000-0000-0000-0000000000c1';

-- ── 1. shape ────────────────────────────────────────────────────────────────
-- a character must name a role and an identity mode
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name)
    values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000002', 'character', 'NOMODE', 'No mode');
    raise exception 'a character with no role or mode was accepted';
  exception when check_violation then null;
  end;
end $$;

-- a location must not carry them
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name, cast_role, identity_mode)
    values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000002', 'location', 'BADLOC', 'Bad', 'recurring', 'preserve');
    raise exception 'a location carrying cast columns was accepted';
  exception when check_violation then null;
  end;
end $$;

-- an unknown kind is still refused
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name)
    values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000002', 'vehicle', 'CAR', 'Car');
    raise exception 'an unknown kind was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ── 2. per-variation casting ────────────────────────────────────────────────
-- variation 1: the artist and a recurring driver
insert into public.continuity_entities (project_id, variation_id, kind, key, name, description, cast_role, identity_mode, artist_id)
values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000001', 'character', 'FENDI', 'Fendi', 'The artist.', 'primary_artist', 'preserve', 'a0000000-0000-0000-0000-0000000000c1'),
       ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000001', 'character', 'DRIVER', 'Driver', 'Waits by the car.', 'recurring', 'recurring', null);

-- variation 2: the SAME key, cast as somebody else entirely
insert into public.continuity_entities (project_id, variation_id, kind, key, name, description, cast_role, identity_mode, artist_id)
values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000002', 'character', 'DRIVER', 'Courier', 'A different person.', 'fictional', 'invent', null);

do $$
declare n int; m text;
begin
  select count(*) into n from public.continuity_entities where key = 'DRIVER' and kind = 'character';
  if n <> 2 then raise exception 'the same key should exist once per variation, found %', n; end if;

  select identity_mode into m from public.continuity_entities
   where key = 'DRIVER' and variation_id = 'c1000000-0000-0000-0000-000000000002';
  if m <> 'invent' then raise exception 'variation 2 driver mode should be invent, is %', m; end if;
end $$;

-- changing one variation's cast must not touch the other
update public.continuity_entities set identity_mode = 'preserve', name = 'Courier (recast)'
 where key = 'DRIVER' and variation_id = 'c1000000-0000-0000-0000-000000000002';

do $$
declare m text; nm text;
begin
  select identity_mode, name into m, nm from public.continuity_entities
   where key = 'DRIVER' and variation_id = 'c1000000-0000-0000-0000-000000000001' and kind = 'character';
  if m <> 'recurring' or nm <> 'Driver' then
    raise exception 'variation 1 driver was changed by a variation 2 edit: % / %', m, nm;
  end if;
end $$;

-- the per-variation unique key still holds for characters
do $$
begin
  begin
    insert into public.continuity_entities (project_id, variation_id, kind, key, name, cast_role, identity_mode)
    values ('10000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-000000000002', 'character', 'DRIVER', 'Dupe', 'fictional', 'invent');
    raise exception 'a duplicate key within one variation was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- ── 3. duplication carries identity, not just names ─────────────────────────
do $$
declare v_dup uuid; r record;
begin
  v_dup := public.duplicate_variation((select id from public.video_variations where name = 'Original' and project_id = '10000000-0000-0000-0000-0000000000c1'), 'Duplicated');

  select cast_role, identity_mode, artist_id into r
    from public.continuity_entities where variation_id = v_dup and key = 'FENDI';
  if r.cast_role is distinct from 'primary_artist' then raise exception 'duplicate lost cast_role: %', r.cast_role; end if;
  if r.identity_mode is distinct from 'preserve' then raise exception 'duplicate lost identity_mode: %', r.identity_mode; end if;
  if r.artist_id is distinct from 'a0000000-0000-0000-0000-0000000000c1'::uuid then raise exception 'duplicate lost artist link: %', r.artist_id; end if;

  select cast_role, identity_mode into r from public.continuity_entities where variation_id = v_dup and key = 'DRIVER';
  if r.identity_mode is distinct from 'recurring' then raise exception 'duplicate lost the driver mode: %', r.identity_mode; end if;
end $$;

-- ── 4. the artist link is a pointer, not a copy ─────────────────────────────
-- deleting the artist must not delete the cast member; it clears the pointer and leaves the
-- character (and every shot that casts them) intact, to be re-linked.
delete from public.artists where id = 'a0000000-0000-0000-0000-0000000000c1';
do $$
declare n int; a uuid;
begin
  select count(*) into n from public.continuity_entities where key = 'FENDI';
  if n = 0 then raise exception 'deleting the artist deleted the cast members'; end if;
  select artist_id into a from public.continuity_entities where key = 'FENDI' limit 1;
  if a is not null then raise exception 'the artist pointer should be cleared, is %', a; end if;
end $$;

rollback;

\echo 'cast_members: all assertions hold'
