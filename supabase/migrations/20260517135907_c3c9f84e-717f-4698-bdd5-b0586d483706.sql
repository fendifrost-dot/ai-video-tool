create table if not exists public.generation_feasibility (
  id uuid primary key default gen_random_uuid(),
  storyboard_node_id uuid not null references public.storyboard_nodes(id) on delete cascade,
  realism_probability numeric,
  continuity_probability numeric,
  drift_probability numeric,
  lipsync_probability numeric,
  estimated_retry_count integer,
  recommended_workflow text,
  alternative_suggestion text,
  computed_at timestamptz not null default now()
);

create index if not exists generation_feasibility_node_idx on public.generation_feasibility(storyboard_node_id);

alter table public.generation_feasibility enable row level security;

drop policy if exists "Users access own generation_feasibility" on public.generation_feasibility;

create policy "Users access own generation_feasibility" on public.generation_feasibility for all
  using (storyboard_node_id in (select id from public.storyboard_nodes where storyboard_id in (select id from public.storyboards where project_id in (select id from public.video_projects where user_id = auth.uid()))))
  with check (storyboard_node_id in (select id from public.storyboard_nodes where storyboard_id in (select id from public.storyboards where project_id in (select id from public.video_projects where user_id = auth.uid()))));