-- duplicate_variation(): carry EVERY variation-owned column, footage edits included.
--
-- WHY THIS FILE EXISTS
--   Two features landed on the same day and each replaced this function from the body it found:
--     20261008140000_footage_edits.sql      added trim_head_seconds / trim_tail_seconds / excluded
--                                           to the shot_asset_assignments insert
--     20261008220000_outfits_and_scenes.sql added garment_feature_ids / version to the entities insert
--                                           and a variation_scenes insert
--   The second ran later, so its body won — and its shot_asset_assignments insert predates the footage
--   columns. With both applied, duplicating a variation would copy the footage rows but SILENTLY RESET every
--   trim to the full synced coverage and undo every deliberate exclusion. That is exactly the failure the
--   footage migration's own comment warns about, caused by ordering rather than by retyping.
--
--   This is the body from 20261008220000_outfits_and_scenes.sql with the footage columns added back to the one
--   insert that lost them (two lines). Nothing else differs. Neither earlier migration is edited: both may
--   already have been applied, and a migration that has run is not rewritten.
--
-- THE RULE THIS KEEPS BREAKING, WRITTEN DOWN
--   Any migration that adds a VARIATION-OWNED column must extend this function in the same change, and must
--   start from the body of the LATEST migration that defines it — not from the one it happens to remember.
--   `git log -S'create or replace function public.duplicate_variation' -- supabase/migrations` finds that file.
--   `supabase/tests/footage_edits_test.sql` §4 and `cast_members_test.sql` §3 both assert their own columns
--   survive a duplicate, so a body written from the wrong ancestor fails on a throwaway before it can ship.
--
-- Idempotent: safe to re-run.

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

  -- the two lines this file exists for: trim_head_seconds, trim_tail_seconds and excluded are this variation's
  -- own cut of an inherited take, and a duplicate that loses them is a duplicate of the takes but not of the edit
  insert into public.shot_asset_assignments (user_id, project_id, variation_id, shot_id, asset_id, role, source_in_seconds, source_out_seconds, is_primary, sort_order, notes, trim_head_seconds, trim_tail_seconds, excluded)
  select a.user_id, a.project_id, v_new, m.new_id, a.asset_id, a.role, a.source_in_seconds, a.source_out_seconds, a.is_primary, a.sort_order, a.notes, a.trim_head_seconds, a.trim_tail_seconds, a.excluded
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
