-- Footage edits a VARIATION owns — so original performance footage can be inherited and then cut differently in
-- each video of the same song, without ever being re-uploaded or re-synced.
--
-- WHAT WAS ALREADY RIGHT, AND IS NOT CHANGED HERE
--   `project_assets` and `performance_syncs` are PROJECT-scoped. A take's place on the song does not depend on
--   which video it is cut into, so every variation already inherits the takes and their sync for free, and
--   boxMedia re-derives each variation's own coverage from them (the "base layer"). Making syncs per-variation
--   would have broken that inheritance, which is the thing being asked for.
--
-- WHAT WAS MISSING
--   Nowhere to put a variation's own decision about a take. `shot_asset_assignments` is variation-scoped, but for
--   role = 'performance' the source range is derived from the sync on EVERY read (see the column comment below,
--   and src/lib/storyboard/media.ts) — so a trim written into source_in_seconds was discarded, and there was no
--   way at all to say "this variation deliberately does not use this take here". The result: the raw take was
--   inherited, but no cut of it could be, and an unused take and a rejected take looked identical.
--
-- WHY A TRIM IS IN SECONDS OF THE SHOT AND NOT SECONDS OF THE FILE
--   A trim must not be able to break sync. Stored as seconds of the shot trimmed from each end, it NARROWS the
--   covered part of the shot and can never slide the footage: the mapping to file time is done once, by the sync,
--   every read. It also stays correct when the sync offset is later corrected, or the shot is moved or split.
--   Storing the derived file seconds would let a corrected sync and a stored range disagree with no way to tell
--   which was meant.
--
-- Idempotent: safe to re-run. No backfill is needed — the defaults are exactly "nothing decided yet", which is
-- what every existing row means.

alter table public.shot_asset_assignments
  add column if not exists trim_head_seconds double precision not null default 0,
  add column if not exists trim_tail_seconds double precision not null default 0,
  add column if not exists excluded          boolean          not null default false;

-- A trim is a length, never a position. Negative would be read as "slide the footage", which is the one thing
-- this design will not do.
alter table public.shot_asset_assignments drop constraint if exists shot_asset_assignments_trim_check;
alter table public.shot_asset_assignments
  add constraint shot_asset_assignments_trim_check
  check (trim_head_seconds >= 0 and trim_tail_seconds >= 0);

-- An excluded take is not what the shot shows. Without this, excluding the selected take would leave a row that
-- is both "left out" and "primary", and the cut would still reach for it.
alter table public.shot_asset_assignments drop constraint if exists shot_asset_assignments_excluded_not_primary;
alter table public.shot_asset_assignments
  add constraint shot_asset_assignments_excluded_not_primary
  check (not (excluded and is_primary));

comment on column public.shot_asset_assignments.trim_head_seconds is
  'This variation only: seconds of the shot trimmed off this media''s head. A length, not a position — the footage is never slid, so the trimmed head stays empty. Mapped to file time through performance_syncs on every read.';
comment on column public.shot_asset_assignments.trim_tail_seconds is
  'This variation only: seconds of the shot trimmed off this media''s tail.';
comment on column public.shot_asset_assignments.excluded is
  'This variation only: the director decided this media is NOT used on this shot. Different from having no row, which means nobody has decided — a synced take is offered under every shot it covers whether or not anybody asked.';

-- duplicate_variation() must carry the edits, or a duplicate would inherit the same takes with every cut reset
-- to the full synced coverage and every deliberate exclusion silently undone.
--
-- This is the body from 20261007170000_cast_members.sql with ONE insert column-list changed (two lines).
-- It was once written out from memory instead of copied, which produced a function referencing columns the shots
-- table does not have. Copy it; do not retype it.
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

  insert into public.shot_asset_assignments (user_id, project_id, variation_id, shot_id, asset_id, role, source_in_seconds, source_out_seconds, is_primary, sort_order, notes, trim_head_seconds, trim_tail_seconds, excluded)
  select a.user_id, a.project_id, v_new, m.new_id, a.asset_id, a.role, a.source_in_seconds, a.source_out_seconds, a.is_primary, a.sort_order, a.notes, a.trim_head_seconds, a.trim_tail_seconds, a.excluded
  from public.shot_asset_assignments a join _shot_map m on m.old_id = a.shot_id;

  insert into public.continuity_entities (user_id, project_id, variation_id, kind, key, name, description, constraints, approved_asset_id, reference_asset_ids, archived, cast_role, identity_mode, artist_id)
  select e.user_id, e.project_id, v_new, e.kind, e.key, e.name, e.description, e.constraints, e.approved_asset_id, e.reference_asset_ids, e.archived, e.cast_role, e.identity_mode, e.artist_id
  from public.continuity_entities e where e.variation_id = src.id;

  return v_new;
end
$$;

grant execute on function public.duplicate_variation(uuid, text) to authenticated;
