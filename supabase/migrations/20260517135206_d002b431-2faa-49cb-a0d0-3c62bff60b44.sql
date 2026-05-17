create table if not exists public.song_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.video_projects(id) on delete cascade,
  bpm numeric,
  duration_seconds numeric,
  energy_curve_json jsonb not null default '[]'::jsonb,
  beat_map_json jsonb not null default '[]'::jsonb,
  sections_json jsonb not null default '[]'::jsonb,
  drops_json jsonb not null default '[]'::jsonb,
  hooks_json jsonb not null default '[]'::jsonb,
  analysis_provider text,
  analyzed_at timestamptz not null default now()
);

create index if not exists song_analyses_project_idx on public.song_analyses(project_id);

alter table public.song_analyses enable row level security;

drop policy if exists "Users access own song_analyses" on public.song_analyses;

create policy "Users access own song_analyses"
  on public.song_analyses
  for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));