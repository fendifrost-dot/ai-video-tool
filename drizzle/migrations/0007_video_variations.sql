-- =============================================================================
-- Video variations (Fendi, 2026-10-07): "The original Paris Black Runway concept and Interrupted Broadcast are
-- materially different creative versions of the same song. They should be independently editable and renderable
-- within the YSL project."
--
-- A project is the song: its audio, its lyrics, the footage filmed for it, and every asset made for it. A VARIATION
-- is one video of that song: a treatment (with its own revision history), a creative direction (mood, visual
-- direction, notes), a storyboard, the footage put on it, its continuity entities, its timeline. A project has one
-- or more; one is active. Editing or generating in one variation never changes another.
--
-- Revision history and variations are different things: treatment_versions tracks changes WITHIN a variation;
-- variations are different videos.
--
-- What this migration does, in order:
--   1. video_variations: one row per video of the song. The creative-direction columns that lived on video_projects
--      (treatment_json, mood, visual_style, notes) live here from now on.
--   2. video_projects.active_variation_id: which one the app is working in.
--   3. Backfill: every project that exists gets ONE variation holding exactly what it has now, named 'Original',
--      and it is made active. Nothing is lost; the project's own columns are then emptied so nothing reads a stale copy.
--   4. variation_id on shots, shot_asset_assignments, continuity_entities, treatment_versions, provider_jobs and
--      timeline_manifests, backfilled to that variation. Triggers fill it on insert when a writer does not (an
--      assignment takes its shot's; the rest take the project's active variation), so the server-side job tick and
--      older clients keep working and nothing ever lands in no variation.
--   5. Uniqueness that was per project is per variation: shot keys, shot numbers, entity keys. Two boards with the
--      keys c001… can now live in one project.
--   6. The treatment-history trigger moves from video_projects to video_variations (same rule, per variation).
--   7. duplicate_variation(): copy a variation — direction, shots, entities, footage assignments — as a new one.
--      Media files are never copied; assets are the project's and are shared.
--
-- Shared, on purpose (not touched): project_assets, performance_syncs, lyric_lines, song_analyses, the song.
-- Additive and idempotent; the only drops are of the two per-project unique constraints that have to become
-- per-variation (their replacements are created first) and of the old trigger (replaced on the new table).
-- =============================================================================

-- 1. video_variations --------------------------------------------------------
create table if not exists public.video_variations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id       uuid not null references public.video_projects(id) on delete cascade,
  name             text not null,
  -- the creative direction of THIS video (moved from video_projects)
  treatment_json   jsonb not null default '{}'::jsonb,
  mood             text,
  visual_style     text,
  notes            text,
  -- the variation this one was copied from, when it was (duplicate_variation); null = started fresh
  duplicated_from  uuid references public.video_variations(id) on delete set null,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists video_variations_project_idx on public.video_variations (project_id, created_at);

comment on table public.video_variations is
  'One video of the project''s song: its treatment (revisions in treatment_versions), creative direction, storyboard (shots), footage on it (shot_asset_assignments), continuity entities, timeline. A project has one or more; video_projects.active_variation_id is the one the app works in. Media is the project''s and shared.';

grant select, insert, update, delete on public.video_variations to authenticated;
grant all on public.video_variations to service_role;
alter table public.video_variations enable row level security;
drop policy if exists "Users access own video_variations" on public.video_variations;
create policy "Users access own video_variations"
  on public.video_variations for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

drop trigger if exists video_variations_set_updated_at on public.video_variations;
create trigger video_variations_set_updated_at before update on public.video_variations
  for each row execute function public.tg_set_updated_at();

-- 2. the active one -----------------------------------------------------------
alter table public.video_projects
  add column if not exists active_variation_id uuid references public.video_variations(id) on delete set null;

-- 3. backfill: one variation per project, holding what the project has now ---
insert into public.video_variations (user_id, project_id, name, treatment_json, mood, visual_style, notes, created_at, updated_at)
select p.user_id, p.id, 'Original', coalesce(p.treatment_json, '{}'::jsonb), p.mood, p.visual_style, p.notes, p.created_at, p.updated_at
from public.video_projects p
where not exists (select 1 from public.video_variations v where v.project_id = p.id);

update public.video_projects p
set active_variation_id = v.id
from public.video_variations v
where v.project_id = p.id and p.active_variation_id is null
  and v.id = (select id from public.video_variations where project_id = p.id order by created_at, id limit 1);

-- 4. variation_id on everything that belongs to one video ---------------------
alter table public.shots                  add column if not exists variation_id uuid references public.video_variations(id) on delete cascade;
alter table public.shot_asset_assignments add column if not exists variation_id uuid references public.video_variations(id) on delete cascade;
alter table public.continuity_entities    add column if not exists variation_id uuid references public.video_variations(id) on delete cascade;
alter table public.treatment_versions     add column if not exists variation_id uuid references public.video_variations(id) on delete cascade;
alter table public.provider_jobs          add column if not exists variation_id uuid references public.video_variations(id) on delete set null;
alter table public.timeline_manifests     add column if not exists variation_id uuid references public.video_variations(id) on delete cascade;

update public.shots s set variation_id = p.active_variation_id from public.video_projects p where p.id = s.project_id and s.variation_id is null;
update public.shot_asset_assignments a set variation_id = s.variation_id from public.shots s where s.id = a.shot_id and a.variation_id is null;
update public.continuity_entities e set variation_id = p.active_variation_id from public.video_projects p where p.id = e.project_id and e.variation_id is null;
update public.treatment_versions t set variation_id = p.active_variation_id from public.video_projects p where p.id = t.project_id and t.variation_id is null;
update public.provider_jobs j set variation_id = p.active_variation_id from public.video_projects p where p.id = j.project_id and j.variation_id is null;
update public.timeline_manifests m set variation_id = p.active_variation_id from public.video_projects p where p.id = m.project_id and m.variation_id is null;

create index if not exists shots_variation_idx on public.shots (variation_id);
create index if not exists shot_asset_assignments_variation_idx on public.shot_asset_assignments (variation_id);
create index if not exists continuity_entities_variation_idx on public.continuity_entities (variation_id, kind);
create index if not exists treatment_versions_variation_created_idx on public.treatment_versions (variation_id, created_at desc);
create index if not exists provider_jobs_variation_idx on public.provider_jobs (variation_id);
create index if not exists timeline_manifests_variation_idx on public.timeline_manifests (variation_id);

-- A writer that does not say which variation gets the project's active one (an assignment: its shot's). A row is
-- never in no variation, and a job records the variation it was submitted against even if the user switches
-- while it runs: the column is set once, at insert, and the tick files by the job's shot.
create or replace function public.fill_variation_from_project()
returns trigger language plpgsql as $$
begin
  if new.variation_id is null then
    select active_variation_id into new.variation_id from public.video_projects where id = new.project_id;
  end if;
  return new;
end $$;

create or replace function public.fill_variation_from_shot()
returns trigger language plpgsql as $$
begin
  if new.variation_id is null then
    select variation_id into new.variation_id from public.shots where id = new.shot_id;
  end if;
  return new;
end $$;

drop trigger if exists shots_fill_variation on public.shots;
create trigger shots_fill_variation before insert on public.shots for each row execute function public.fill_variation_from_project();
drop trigger if exists continuity_entities_fill_variation on public.continuity_entities;
create trigger continuity_entities_fill_variation before insert on public.continuity_entities for each row execute function public.fill_variation_from_project();
drop trigger if exists provider_jobs_fill_variation on public.provider_jobs;
create trigger provider_jobs_fill_variation before insert on public.provider_jobs for each row execute function public.fill_variation_from_project();
drop trigger if exists timeline_manifests_fill_variation on public.timeline_manifests;
create trigger timeline_manifests_fill_variation before insert on public.timeline_manifests for each row execute function public.fill_variation_from_project();
drop trigger if exists shot_asset_assignments_fill_variation on public.shot_asset_assignments;
create trigger shot_asset_assignments_fill_variation before insert on public.shot_asset_assignments for each row execute function public.fill_variation_from_shot();

-- 5. uniqueness per variation, not per project ---------------------------------
create unique index if not exists shots_variation_spec_key_unique
  on public.shots (variation_id, spec_key) where spec_key is not null;
drop index if exists public.shots_project_spec_key_unique;

create unique index if not exists shots_variation_shot_number_unique
  on public.shots (variation_id, shot_number);
alter table public.shots drop constraint if exists shots_project_shot_number_unique;

create unique index if not exists continuity_entities_variation_key_unique
  on public.continuity_entities (variation_id, key);
alter table public.continuity_entities drop constraint if exists continuity_entities_project_id_key_key;

-- 6. the treatment-history trigger, per variation ----------------------------
-- Same rule as 20261003180000 (what is being replaced is kept, whoever writes), on the row that holds the text now.
create or replace function public.keep_variation_treatment_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json   jsonb := coalesce(old.treatment_json, '{}'::jsonb);
  new_json   jsonb := coalesce(new.treatment_json, '{}'::jsonb);
  old_text   text  := coalesce(public.treatment_text_of(old_json), '');
  new_text   text  := coalesce(public.treatment_text_of(new_json), '');
  old_dnotes text  := btrim(coalesce(old_json -> 'treatment' ->> 'notes', ''));
  new_dnotes text  := btrim(coalesce(new_json -> 'treatment' ->> 'notes', ''));
  old_notes  text  := btrim(coalesce(old.notes, ''));
  text_changed    boolean := old_text is distinct from new_text;
  context_changed boolean :=
       old_notes is distinct from btrim(coalesce(new.notes, ''))
    or old_dnotes is distinct from new_dnotes
    or coalesce(old.mood, '') is distinct from coalesce(new.mood, '')
    or coalesce(old.visual_style, '') is distinct from coalesce(new.visual_style, '');
begin
  if not (text_changed or context_changed) then
    return new;
  end if;
  if old_text = '' and old_notes = '' and old_dnotes = '' and coalesce(old.mood, '') = '' and coalesce(old.visual_style, '') = '' then
    return new;
  end if;
  insert into public.treatment_versions
    (project_id, variation_id, user_id, replaced_by, treatment_text, treatment_mode, treatment_model, treatment_updated_at, notes, mood, visual_style, treatment_json)
  values (
    old.project_id,
    old.id,
    old.user_id,
    case
      when not text_changed then 'context'
      when nullif(new_json -> 'treatment' ->> 'change', '') is not null
        and (new_json -> 'treatment' ->> 'change_at') is distinct from (old_json -> 'treatment' ->> 'change_at')
        then new_json -> 'treatment' ->> 'change'
      when new_text = '' then 'delete'
      else 'edit'
    end,
    old_text,
    old_json -> 'treatment' ->> 'mode',
    coalesce(old_json -> 'treatment' ->> 'model', old_json ->> 'model'),
    coalesce(old_json -> 'treatment' ->> 'updated_at', old_json ->> 'generated_at'),
    nullif(case when old_dnotes = '' or old_dnotes = old_notes then old_notes else concat_ws(E'\n\n', nullif(old_notes, ''), old_dnotes) end, ''),
    old.mood,
    old.visual_style,
    old_json - 'astra_review'
  );
  return new;
end
$$;

drop trigger if exists video_variations_keep_treatment_version on public.video_variations;
create trigger video_variations_keep_treatment_version
  before update on public.video_variations
  for each row
  execute function public.keep_variation_treatment_version();

-- the project row no longer holds a treatment: its trigger goes, and the moved columns are emptied so that nothing
-- that still reads them sees a copy that has stopped being true. (The values are in the 'Original' variation.)
drop trigger if exists video_projects_keep_treatment_version on public.video_projects;
update public.video_projects p
set treatment_json = '{}'::jsonb, mood = null, visual_style = null, notes = null
where p.active_variation_id is not null
  and (p.treatment_json <> '{}'::jsonb or p.mood is not null or p.visual_style is not null or p.notes is not null);

comment on column public.video_projects.treatment_json is
  'Unused since 20261007120000: the treatment lives on video_variations (the active one is active_variation_id).';

-- 7. duplicate a variation ----------------------------------------------------
-- Copies the direction, every storyboard shot (same keys, numbers, scenes, edits, locks, history), the continuity
-- entities (same keys, same approved pictures) and the footage on each shot. Assets are shared, not copied.
-- Revision history is NOT copied: a duplicate starts its own. Jobs are not copied: they were submitted against the
-- source. Runs as the caller, under RLS: only the owner's projects can be copied.
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

  insert into public.continuity_entities (user_id, project_id, variation_id, kind, key, name, description, constraints, approved_asset_id, reference_asset_ids, archived)
  select e.user_id, e.project_id, v_new, e.kind, e.key, e.name, e.description, e.constraints, e.approved_asset_id, e.reference_asset_ids, e.archived
  from public.continuity_entities e where e.variation_id = src.id;

  return v_new;
end
$$;

grant execute on function public.duplicate_variation(uuid, text) to authenticated;