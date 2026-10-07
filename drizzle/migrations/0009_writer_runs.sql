-- Writer runs: the evidence of every treatment-writer execution.
--
-- The storyboard writer (treatment-writer-proxy) runs several model calls per board. Until now nothing of a run
-- survived but the shots it wrote: not which variation and treatment revision it was for, not what it cost, not what
-- the treatment's beats were or how the shots were allotted to them. This table keeps one row per run, written by
-- the function itself (service role), readable by the project's owner. `actual_cost_usd` is null when the provider
-- reported no usage — unknown, never an estimate; `estimated_cost_usd` is the estimate, kept apart.

create table if not exists public.writer_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null references public.video_projects(id) on delete cascade,
  variation_id uuid references public.video_variations(id) on delete set null,
  -- the treatment the shots were written from: its fingerprint (src/lib/treatment/treatmentDoc.ts) and its text's length
  treatment_fingerprint text,
  treatment_chars integer,
  mode text not null default 'full_treatment',
  model text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  error_text text,
  shots_asked integer,
  shots_written integer,
  usage_json jsonb,
  actual_cost_usd numeric(10, 4),
  estimated_cost_usd numeric(10, 4),
  beats_json jsonb,
  allocation_json jsonb,
  coverage_json jsonb,
  clips_json jsonb,
  missing_json jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists writer_runs_project_created_idx on public.writer_runs (project_id, created_at desc);
create index if not exists writer_runs_variation_idx on public.writer_runs (variation_id);

alter table public.writer_runs enable row level security;

drop policy if exists "writer_runs_owner_read" on public.writer_runs;
create policy "writer_runs_owner_read" on public.writer_runs
  for select to authenticated
  using (exists (select 1 from public.video_projects p where p.id = writer_runs.project_id and p.user_id = auth.uid()));

grant select on public.writer_runs to authenticated;
grant all on public.writer_runs to service_role;