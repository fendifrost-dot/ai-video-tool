-- Cast members — who is in a shot, as a continuity entity of kind `character`.
--
-- WHY HERE AND NOT A NEW TABLE
--   `continuity_entities` already carries everything a cast record needs, tested and deployed:
--   variation scope (`variation_id`, the fill trigger, the per-variation unique key), approved and
--   reference pictures as rows of `project_assets`, archiving, and the key a shot points at. A
--   `cast_members` table would have had to re-earn all of it, and would NOT have got variation
--   isolation for free — two variations of one song can be cast completely differently, and
--   `duplicate_variation` already copies entities.
--
-- WHAT IS NOT HERE
--   No likeness and no identity. The primary artist's identity stays in `artists`,
--   `character_features` (locked Character DNA) and `artist_looks`; a cast member of role
--   `primary_artist` only POINTS at it through `artist_id`. Appearance is the entity's own
--   `description`, written by the director. Nothing is inferred from an image and nothing is
--   defaulted from a genre.
--
-- Idempotent: safe to re-run.

-- 1. `character` becomes a kind. The old constraint named three; a row of any other kind is still
--    refused, so a typo does not become a silent fourth category.
alter table public.continuity_entities drop constraint if exists continuity_entities_kind_check;
alter table public.continuity_entities
  add constraint continuity_entities_kind_check
  check (kind in ('location', 'prop', 'lighting', 'character'));

-- 2. The character-only columns.
--      cast_role      what they are to the production — decides what a missing reference means
--      identity_mode  how much of a real person must survive generation; the same three words as
--                     src/lib/prompts/realism.ts, so a shot and a prompt modifier cannot disagree
--      artist_id      the artist this cast member IS, when they are the artist. The likeness lives
--                     on that row; this is a pointer, never a copy.
alter table public.continuity_entities add column if not exists cast_role     text;
alter table public.continuity_entities add column if not exists identity_mode text;
alter table public.continuity_entities add column if not exists artist_id     uuid;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'continuity_entities_artist_id_fkey' and table_name = 'continuity_entities'
  ) then
    alter table public.continuity_entities
      add constraint continuity_entities_artist_id_fkey
      foreign key (artist_id) references public.artists(id) on delete set null;
  end if;
end $$;

alter table public.continuity_entities drop constraint if exists continuity_entities_cast_role_check;
alter table public.continuity_entities
  add constraint continuity_entities_cast_role_check
  check (cast_role is null or cast_role in ('primary_artist', 'recurring', 'fictional', 'background'));

alter table public.continuity_entities drop constraint if exists continuity_entities_identity_mode_check;
alter table public.continuity_entities
  add constraint continuity_entities_identity_mode_check
  check (identity_mode is null or identity_mode in ('preserve', 'recurring', 'invent'));

-- 3. The columns belong to characters and only to characters, both ways round: a character must say
--    what it is, and a location must not pretend to. Without this a role could be set on a prop and
--    read back as cast, or a character could exist with no mode and be generated as a stranger.
alter table public.continuity_entities drop constraint if exists continuity_entities_cast_shape_check;
alter table public.continuity_entities
  add constraint continuity_entities_cast_shape_check
  check (
    (kind = 'character' and cast_role is not null and identity_mode is not null)
    or (kind <> 'character' and cast_role is null and identity_mode is null and artist_id is null)
  );

-- 4. Finding the cast of a variation is the commonest read; `(variation_id, kind)` already exists
--    and serves it. This one serves the other direction: every shot this artist is cast in.
create index if not exists continuity_entities_artist_idx
  on public.continuity_entities (artist_id) where artist_id is not null;

-- 5. duplicate_variation() must carry the new columns. Without this, duplicating a variation would
--    copy the cast's names and pictures but LOSE their role, identity mode and artist link — every
--    character silently becoming an invented one.
--
--    This is the body from 20261007120000_video_variations.sql with ONE insert column-list changed.
--    It was first written out from memory instead of copied, which produced a function referencing
--    columns the shots table does not have; supabase/tests/cast_members_test.sql caught it before it
--    could replace a working function with a broken one. Copy it, do not retype it.
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

  insert into public.continuity_entities (user_id, project_id, variation_id, kind, key, name, description, constraints, approved_asset_id, reference_asset_ids, archived, cast_role, identity_mode, artist_id)
  select e.user_id, e.project_id, v_new, e.kind, e.key, e.name, e.description, e.constraints, e.approved_asset_id, e.reference_asset_ids, e.archived, e.cast_role, e.identity_mode, e.artist_id
  from public.continuity_entities e where e.variation_id = src.id;

  return v_new;
end
$$;

grant execute on function public.duplicate_variation(uuid, text) to authenticated;

comment on column public.continuity_entities.cast_role is
  'character only: primary_artist | recurring | fictional | background. Null on every other kind.';
comment on column public.continuity_entities.identity_mode is
  'character only: preserve | recurring | invent. Same vocabulary as src/lib/prompts/realism.ts.';
comment on column public.continuity_entities.artist_id is
  'character only: the artists row this cast member IS. A pointer to the identity system, never a copy of it.';