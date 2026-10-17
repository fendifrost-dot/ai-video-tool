-- A SLIP: this variation's own hand-alignment of a take on one shot, so a performance can be lined up to the lyrics
-- by eye (Fendi, 17 Oct 2026: "create a function to slice and move performance shots to line up to actual lyrics
-- manually inside the tool").
--
-- WHY A SLIP IS A SHIFT OF THE SYNC AND NOT A STORED SOURCE IN-POINT
--   performance_syncs stays the project's one answer to "where does this recording sit on the song". A slip says
--   "on THIS shot, in THIS variation, play the take s seconds later than the sync puts it" (negative: earlier).
--   The source in-point is still derived on every read (sync + slip + the shot's window), so it stays right when
--   the shot is moved, split or merged, and a stored in-point and a corrected sync can never disagree. The derived
--   in-point is what the board shows and what the Premiere export writes.
--
--   Bounded to ±30 s: further than that is a different moment of the take, not an alignment — put that moment on
--   the shot instead. 0 is "as the sync says", which is what every existing row means, so no backfill.
--
-- duplicate_variation() carries it: the rule written down in 20261008230000 (any variation-owned column extends
-- that function in the same change, starting from the LATEST body) — this is that body with one column added to
-- the shot_asset_assignments insert. Nothing else differs.
--
-- Idempotent: safe to re-run. Rollback: docs/evidence/FOOTAGE_SLIP_ROLLBACK.sql.

alter table public.shot_asset_assignments
  add column if not exists slip_seconds double precision not null default 0;

alter table public.shot_asset_assignments drop constraint if exists shot_asset_assignments_slip_check;
alter table public.shot_asset_assignments
  add constraint shot_asset_assignments_slip_check
  check (slip_seconds between -30 and 30);

comment on column public.shot_asset_assignments.slip_seconds is
  'This variation only: seconds this take plays LATER on this shot than performance_syncs puts it (negative: earlier) — a hand alignment of the mouth to the lyrics. The source in-point stays derived (sync + slip + the shot window) on every read.';

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

  -- trim_head_seconds, trim_tail_seconds, excluded and slip_seconds are this variation's own cut of an inherited
  -- take, and a duplicate that loses them is a duplicate of the takes but not of the edit (slip_seconds: this file)
  insert into public.shot_asset_assignments (user_id, project_id, variation_id, shot_id, asset_id, role, source_in_seconds, source_out_seconds, is_primary, sort_order, notes, trim_head_seconds, trim_tail_seconds, excluded, slip_seconds)
  select a.user_id, a.project_id, v_new, m.new_id, a.asset_id, a.role, a.source_in_seconds, a.source_out_seconds, a.is_primary, a.sort_order, a.notes, a.trim_head_seconds, a.trim_tail_seconds, a.excluded, a.slip_seconds
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
