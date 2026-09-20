-- =============================================================================
-- Song ↔ performance synchronization + source-range editorial model
-- (YSL Real Video #1 · Claude takeover · 2026-09-20)
--
-- Why: the master performance recording is ONE continuous shot whose t=0 is not
-- the song's t=0. The edit must address the master by SOURCE RANGE and place
-- those ranges on the SONG clock. Nothing in the schema carried that relation.
--
-- Additive only. No destructive changes. RLS mirrors timeline_manifests.
-- =============================================================================

-- 1. performance_syncs — canonical, inspectable alignment records
create table if not exists public.performance_syncs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  project_id             uuid not null references public.video_projects(id) on delete cascade,
  song_asset_id          uuid references public.project_assets(id) on delete set null,
  performance_asset_id   uuid references public.project_assets(id) on delete set null,
  -- song_time = performance_time * (1 + drift_ppm/1e6) + offset_seconds
  offset_seconds         double precision not null,
  drift_ppm              double precision not null default 0,
  method                 text not null default 'gcc_phat_windowed',
  status                 text not null default 'auto'
                         check (status in ('auto','manual','confirmed','rejected')),
  confidence_json        jsonb not null default '{}'::jsonb,   -- windows, peaks, 2nd/1st ratios
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists performance_syncs_project_idx on public.performance_syncs (project_id);
create unique index if not exists performance_syncs_confirmed_one_per_pair
  on public.performance_syncs (project_id, song_asset_id, performance_asset_id)
  where status = 'confirmed';

alter table public.performance_syncs enable row level security;
drop policy if exists "Users access own performance_syncs" on public.performance_syncs;
create policy "Users access own performance_syncs"
  on public.performance_syncs for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

-- 2. timeline_items — address the master by source range, on the song clock
alter table public.timeline_items
  add column if not exists source_asset_id     uuid references public.project_assets(id) on delete set null,
  add column if not exists source_in_seconds   double precision,
  add column if not exists source_out_seconds  double precision,
  add column if not exists sync_id             uuid references public.performance_syncs(id) on delete set null,
  add column if not exists output_asset_id     uuid references public.project_assets(id) on delete set null,
  add column if not exists treatment_shot_id   text,
  add column if not exists look_id             uuid,
  add column if not exists production_status   text not null default 'planned'
                          check (production_status in ('planned','sourced','generated','qa_failed','approved','rejected')),
  add column if not exists provenance_json     jsonb not null default '{}'::jsonb;

comment on column public.timeline_items.source_asset_id is
  'Master/source media the clip is cut from (e.g. the continuous performance master). asset_id remains the rendered/output clip.';
comment on column public.timeline_items.source_in_seconds is
  'In point within source_asset_id, seconds. Derived from the song range via performance_syncs when the source is the performance master.';
comment on column public.performance_syncs.offset_seconds is
  'song_time = performance_time * (1 + drift_ppm/1e6) + offset_seconds. Positive means the song had already been playing when the recording started.';
