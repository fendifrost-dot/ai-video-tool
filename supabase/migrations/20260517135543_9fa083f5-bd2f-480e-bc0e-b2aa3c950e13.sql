create table if not exists public.storyboards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.video_projects(id) on delete cascade,
  title text,
  total_duration_seconds numeric,
  mood_profile_json jsonb not null default '{}'::jsonb,
  waveform_json jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists storyboards_project_idx on public.storyboards(project_id);

create table if not exists public.storyboard_nodes (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null references public.storyboards(id) on delete cascade,
  shot_id uuid references public.shots(id) on delete set null,
  node_order integer not null,
  timestamp_start_seconds numeric not null,
  timestamp_end_seconds numeric not null,
  duration_seconds numeric generated always as (timestamp_end_seconds - timestamp_start_seconds) stored,
  scene_purpose text,
  emotional_purpose text,
  shot_type text,
  camera_type text,
  camera_motion text,
  lighting_style text,
  environment text,
  wardrobe text,
  realism_target text,
  continuity_dependencies_json jsonb not null default '[]'::jsonb,
  generation_difficulty text,
  estimated_cost_cents integer,
  estimated_drift_risk numeric,
  recommended_model text,
  generation_strategy text,
  notes text,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists storyboard_nodes_storyboard_idx on public.storyboard_nodes(storyboard_id, node_order);
create index if not exists storyboard_nodes_shot_idx on public.storyboard_nodes(shot_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storyboard_nodes_status_check') then
    alter table public.storyboard_nodes add constraint storyboard_nodes_status_check
      check (status in ('planned','generated','approved','rejected','needs_regeneration'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storyboard_nodes_realism_check') then
    alter table public.storyboard_nodes add constraint storyboard_nodes_realism_check
      check (realism_target is null or realism_target in ('photoreal','stylized','surreal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storyboard_nodes_difficulty_check') then
    alter table public.storyboard_nodes add constraint storyboard_nodes_difficulty_check
      check (generation_difficulty is null or generation_difficulty in ('low','medium','high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'storyboard_nodes_strategy_check') then
    alter table public.storyboard_nodes add constraint storyboard_nodes_strategy_check
      check (generation_strategy is null or generation_strategy in ('t2v','i2v','practical_then_ai','manual_capture'));
  end if;
end $$;

alter table public.storyboards enable row level security;
alter table public.storyboard_nodes enable row level security;

drop policy if exists "Users access own storyboards" on public.storyboards;
create policy "Users access own storyboards" on public.storyboards for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

drop policy if exists "Users access own storyboard_nodes" on public.storyboard_nodes;
create policy "Users access own storyboard_nodes" on public.storyboard_nodes for all
  using (storyboard_id in (select id from public.storyboards where project_id in (select id from public.video_projects where user_id = auth.uid())))
  with check (storyboard_id in (select id from public.storyboards where project_id in (select id from public.video_projects where user_id = auth.uid())));