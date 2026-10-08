-- Outfits and scenes — what the artist wears, defined once per video and inherited by the shots of a scene.
--
-- WHY OUTFITS ARE ENTITIES (the same reasoning as cast_members, 2026-10-07)
--   An outfit of this video is described once, pointed at by shots by key, scoped to the variation (two videos of
--   one song can dress him differently and neither changes the other), copied by duplicate_variation, archived,
--   linted. `continuity_entities` already does all of that; an `outfits` table would re-earn it and still have to
--   get variation isolation right. So an outfit is an entity of kind `outfit`.
--
-- WHAT AN OUTFIT HOLDS
--   name / description / constraints   the words every shot that wears it carries (`Wears: …`)
--   garment_feature_ids                the exact pieces: rows of character_features of a wardrobe_* type (the
--                                      artist's own garment photographs — shared across projects, never copied),
--                                      in the order they are sent as reference pictures
--   version                            bumped by trigger whenever the words or the pieces change. A generation job
--                                      records the version it was given; a box whose picture or clip was made
--                                      from an older version is shown as outdated, never silently current.
--
-- WHAT IT IS NOT
--   Not an `artist_looks` row. Those are composed hero pictures of the artist (a generation recipe with a cost and
--   a result image), artist-wide. An outfit may be started FROM one (its wardrobe_feature_ids), but what the video
--   wears is its own record, so a change for this video changes this video only.
--
-- SCENES
--   `variation_scenes`: a named stretch of the song (start → end seconds) that wears one outfit. A shot inside the
--   stretch inherits the scene's outfit unless its own record says otherwise (wardrobe.outfitMode: inherit |
--   exception | none). Scenes are the director's; the writer's own wardrobe words on each shot (its
--   `wardrobe.description`, e.g. "exact YSL denim look") are what scenes are resolved against and checked against.
--
-- Idempotent: safe to re-run.

-- 1. `outfit` becomes a kind.
alter table public.continuity_entities drop constraint if exists continuity_entities_kind_check;
alter table public.continuity_entities
  add constraint continuity_entities_kind_check
  check (kind in ('location', 'prop', 'lighting', 'character', 'outfit'));

-- 2. The outfit-only columns.
alter table public.continuity_entities add column if not exists garment_feature_ids uuid[];
alter table public.continuity_entities add column if not exists version integer;

-- an outfit always has a piece list (possibly empty: words only) and a version; nothing else carries either
alter table public.continuity_entities drop constraint if exists continuity_entities_outfit_shape_check;
alter table public.continuity_entities
  add constraint continuity_entities_outfit_shape_check
  check (
    (kind = 'outfit' and garment_feature_ids is not null and version is not null and version >= 1)
    or (kind <> 'outfit' and garment_feature_ids is null and version is null)
  );

-- the cast-shape rule must keep holding for outfits (no cast columns on them): it already says kind <> 'character'
-- implies the cast columns are null, so nothing to add.

-- 3. The version moves when what generation receives changes: the words or the pieces. Renaming alone does too —
--    the name is in the prompt. Archiving or a picture change does not.
create or replace function public.tg_outfit_version()
returns trigger language plpgsql as $$
begin
  if new.kind = 'outfit' then
    if tg_op = 'INSERT' then
      new.version := coalesce(new.version, 1);
    elsif old.kind = 'outfit' and (
      new.name is distinct from old.name
      or new.description is distinct from old.description
      or new.constraints is distinct from old.constraints
      or new.garment_feature_ids is distinct from old.garment_feature_ids
    ) then
      new.version := coalesce(old.version, 1) + 1;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists continuity_entities_outfit_version on public.continuity_entities;
create trigger continuity_entities_outfit_version before insert or update on public.continuity_entities
  for each row execute function public.tg_outfit_version();

-- 4. Scenes.
create table if not exists public.variation_scenes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id    uuid not null references public.video_projects(id) on delete cascade,
  variation_id  uuid not null references public.video_variations(id) on delete cascade,
  name          text not null,
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds   numeric not null,
  -- the outfit worn in this scene, by entity key (what shots point at too); null = no outfit decided yet
  outfit_key    text,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_seconds > start_seconds)
);
create index if not exists variation_scenes_variation_idx on public.variation_scenes (variation_id, start_seconds);

grant select, insert, update, delete on public.variation_scenes to authenticated;
grant all on public.variation_scenes to service_role;
alter table public.variation_scenes enable row level security;
drop policy if exists "Users access own variation_scenes" on public.variation_scenes;
create policy "Users access own variation_scenes"
  on public.variation_scenes for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

drop trigger if exists variation_scenes_set_updated_at on public.variation_scenes;
create trigger variation_scenes_set_updated_at before update on public.variation_scenes
  for each row execute function public.tg_set_updated_at();

-- 5. duplicate_variation() carries the outfit columns and the scenes. Copied from 20261007170000_cast_members.sql
--    with the entities insert column-list extended and one insert added (never retyped — see that file's note).
create or replace function public.duplicate_variation(p_source uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  src   public.video_variations%rowtype;
  v_new uuid;
begin
  select * into src from public.video_variations where id = p_source;
  if not found then
    raise exception 'variation % not found', p_source;
  end if;
  insert into public.video_variations (user_id, project_id, name, treatment_json, mood, visual_style, notes, duplicated_from)
  values (src.user_id, src.project_id, p_name, src.treatment_json, src.mood, src.visual_style, src.notes, src.id)
  returning id into v_new;

  -- shots: new ids, everything else as it stands
  create temp table _shot_map (old_id uuid, new_id uuid) on commit drop;
  insert into _shot_map (old_id, new_id) select id, gen_random_uuid() from public.shots where variation_id = src.id;
  insert into public.shots (id, user_id, project_id, variation_id, shot_number, song_section, timestamp_start, timestamp_end, shot_type,
    scene_description, camera_direction, lighting, wardrobe, environment, recommended_tool, priority, status, notes,
    trim_in_seconds, trim_out_seconds, transition_in_type, transition_out_type, transition_duration, locked_look_id,
    spec_key, generated_json, override_json, spec_json, locked, box_origin, history_json)
  select m.new_id, s.user_id, s.project_id, v_new, s.shot_number, s.song_section, s.timestamp_start, s.timestamp_end, s.shot_type,
    s.scene_description, s.camera_direction, s.lighting, s.wardrobe, s.environment, s.recommended_tool, s.priority, s.status, s.notes,
    s.trim_in_seconds, s.trim_out_seconds, s.transition_in_type, s.transition_out_type, s.transition_duration, s.locked_look_id,
    s.spec_key, s.generated_json, s.override_json, s.spec_json, s.locked, s.box_origin, s.history_json
  from public.shots s join _shot_map m on m.old_id = s.id;

  insert into public.shot_asset_assignments (user_id, project_id, variation_id, shot_id, asset_id, role, source_in_seconds, source_out_seconds, is_primary, sort_order, notes)
  select a.user_id, a.project_id, v_new, m.new_id, a.asset_id, a.role, a.source_in_seconds, a.source_out_seconds, a.is_primary, a.sort_order, a.notes
  from public.shot_asset_assignments a join _shot_map m on m.old_id = a.shot_id;

  insert into public.continuity_entities (user_id, project_id, variation_id, kind, key, name, description, constraints, approved_asset_id, reference_asset_ids, archived, cast_role, identity_mode, artist_id, garment_feature_ids, version)
  select e.user_id, e.project_id, v_new, e.kind, e.key, e.name, e.description, e.constraints, e.approved_asset_id, e.reference_asset_ids, e.archived, e.cast_role, e.identity_mode, e.artist_id, e.garment_feature_ids, e.version
  from public.continuity_entities e where e.variation_id = src.id;

  insert into public.variation_scenes (user_id, project_id, variation_id, name, start_seconds, end_seconds, outfit_key, notes)
  select sc.user_id, sc.project_id, v_new, sc.name, sc.start_seconds, sc.end_seconds, sc.outfit_key, sc.notes
  from public.variation_scenes sc where sc.variation_id = src.id;

  return v_new;
end
$$;

grant execute on function public.duplicate_variation(uuid, text) to authenticated;

comment on column public.continuity_entities.garment_feature_ids is
  'outfit only: the exact pieces, character_features rows of a wardrobe_* type, in the order they are sent as reference pictures. Empty = the outfit is words only.';
comment on column public.continuity_entities.version is
  'outfit only: bumped by trigger when the name, words or pieces change. A job records the version it was given; an older one on a box is outdated.';
comment on table public.variation_scenes is
  'A named stretch of one video (seconds) that wears one outfit (continuity_entities kind outfit, by key). Shots inside it inherit the outfit unless their own record says otherwise.';
