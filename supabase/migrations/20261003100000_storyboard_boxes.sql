-- =============================================================================
-- Storyboard boxes: one permanent record per box, footage assignments, take sync
-- (Fendi, 2026-10-03: "one permanent record per storyboard box … the storyboard
-- itself becomes the shot list … do not identify boxes by array position")
--
-- Until now a storyboard box was a clip inside video_projects.treatment_json,
-- addressed by its position ("c006"); edits lived in shot_overrides, a copy lived
-- in shots after "Commit to shot list", and nothing linked a file to a box.
-- From here a box IS a shots row:
--   • generated_json — what the generator last wrote for the box (a ShotSpec)
--   • override_json  — only what the director changed (same shape as shot_overrides)
--   • spec_json      — the two resolved: the one thing every consumer reads
--   • spec_key       — the stable text key the batch dialect names files and jobs by
--   • locked         — whole-board generation skips the box
--   • history_json   — earlier versions (regenerate, split, merge)
-- Footage attaches through shot_asset_assignments; a file exists once and moving
-- it between boxes changes a row. A performance take is addressed by SONG time
-- through performance_syncs, so a box's source range follows from its window and
-- never has to be re-measured when the storyboard changes.
--
-- Additive only. Nothing is dropped; shot_overrides and treatment_json.clips stay
-- as the record of what was migrated. Idempotent: safe to re-run.
-- =============================================================================

-- 1. shots — the box record --------------------------------------------------
alter table public.shots
  add column if not exists spec_key       text,
  add column if not exists generated_json jsonb,
  add column if not exists override_json  jsonb,
  add column if not exists spec_json      jsonb,
  add column if not exists locked         boolean not null default false,
  add column if not exists box_origin     text,
  add column if not exists history_json   jsonb not null default '[]'::jsonb;

create unique index if not exists shots_project_spec_key_unique
  on public.shots (project_id, spec_key)
  where spec_key is not null;

comment on column public.shots.spec_key is
  'Stable text key of a storyboard box (never reassigned, never derived from position). Null = a legacy shot-list row that is not on the storyboard.';
comment on column public.shots.spec_json is
  'The resolved ShotSpec (generated_json with override_json applied). Written by the app on every save; the one field downstream consumers read.';
comment on column public.shots.override_json is
  'Only what the director changed (direction, frame, cameraMotion, framing, transitionIn, requiredElements, notes). Null/absent keys keep the generated value.';

-- 2. project_assets — what a piece of uploaded footage is --------------------
alter table public.project_assets
  add column if not exists footage_role text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_assets_footage_role_check') then
    alter table public.project_assets
      add constraint project_assets_footage_role_check
      check (footage_role is null or footage_role in ('performance', 'b_roll', 'reference'));
  end if;
end $$;

create index if not exists project_assets_footage_role_idx
  on public.project_assets (project_id, footage_role)
  where footage_role is not null;

comment on column public.project_assets.footage_role is
  'Set for real (non-AI) footage: performance = a take sung to the song; b_roll = the director''s own footage; reference = a look/location reference. Null for everything else.';

-- 3. performance_syncs — song clock ↔ take clock ------------------------------
-- (first written in 20260920120000, never applied to this database)
create table if not exists public.performance_syncs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id             uuid not null references public.video_projects(id) on delete cascade,
  song_asset_id          uuid references public.project_assets(id) on delete set null,
  performance_asset_id   uuid references public.project_assets(id) on delete cascade,
  -- song_time = performance_time * (1 + drift_ppm/1e6) + offset_seconds
  offset_seconds         double precision not null,
  drift_ppm              double precision not null default 0,
  method                 text not null default 'manual',
  status                 text not null default 'auto'
                         check (status in ('auto','manual','confirmed','rejected')),
  confidence_json        jsonb not null default '{}'::jsonb,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.performance_syncs alter column user_id set default auth.uid();
create index if not exists performance_syncs_project_idx on public.performance_syncs (project_id);
create unique index if not exists performance_syncs_one_per_take
  on public.performance_syncs (project_id, performance_asset_id);

grant select, insert, update, delete on public.performance_syncs to authenticated;
grant all on public.performance_syncs to service_role;
alter table public.performance_syncs enable row level security;
drop policy if exists "Users access own performance_syncs" on public.performance_syncs;
create policy "Users access own performance_syncs"
  on public.performance_syncs for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

comment on column public.performance_syncs.offset_seconds is
  'song_time = performance_time * (1 + drift_ppm/1e6) + offset_seconds. Positive: the song was already playing when the recording started.';

-- 4. shot_asset_assignments — footage on a box --------------------------------
create table if not exists public.shot_asset_assignments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id         uuid not null references public.video_projects(id) on delete cascade,
  shot_id            uuid not null references public.shots(id) on delete cascade,
  asset_id           uuid not null references public.project_assets(id) on delete cascade,
  role               text not null
                     check (role in ('performance','b_roll','generated_image','generated_clip','reference')),
  -- In/out inside the asset, seconds. Null for a performance take: its range is
  -- derived from the box's song window through performance_syncs, every time.
  source_in_seconds  double precision,
  source_out_seconds double precision,
  -- The one piece of media the box shows and the cut uses.
  is_primary         boolean not null default false,
  sort_order         int not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (shot_id, asset_id, role)
);
create index if not exists shot_asset_assignments_project_idx on public.shot_asset_assignments (project_id);
create index if not exists shot_asset_assignments_shot_idx on public.shot_asset_assignments (shot_id);
create index if not exists shot_asset_assignments_asset_idx on public.shot_asset_assignments (asset_id);

grant select, insert, update, delete on public.shot_asset_assignments to authenticated;
grant all on public.shot_asset_assignments to service_role;
alter table public.shot_asset_assignments enable row level security;
drop policy if exists "Users access own shot_asset_assignments" on public.shot_asset_assignments;
create policy "Users access own shot_asset_assignments"
  on public.shot_asset_assignments for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

comment on table public.shot_asset_assignments is
  'Which media sits on which storyboard box. A file is never copied: assigning, moving and removing change rows here. is_primary marks the media the box shows and Review plays.';
