-- Editor Core Engine — version snapshots + append-only event log
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. timeline_versions — full manifest snapshot per commit
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_versions (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.timeline_manifests(id) on delete cascade,
  version_number int not null,
  actor_type text not null,
  actor_name text,
  change_summary text not null,
  manifest_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint timeline_versions_actor_type_check
    check (actor_type in ('user', 'agent', 'system')),
  constraint timeline_versions_manifest_version_unique
    unique (manifest_id, version_number)
);

create index if not exists timeline_versions_manifest_idx
  on public.timeline_versions(manifest_id, version_number desc);

comment on table public.timeline_versions is
  'Immutable manifest snapshots. Editor Core Engine writes one row per manifest commit.';

-- ---------------------------------------------------------------------------
-- 2. timeline_events — granular audit log (agents + humans)
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.timeline_manifests(id) on delete cascade,
  version_id uuid references public.timeline_versions(id) on delete set null,
  event_type text not null,
  actor_type text not null,
  actor_name text,
  change_summary text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint timeline_events_actor_type_check
    check (actor_type in ('user', 'agent', 'system'))
);

create index if not exists timeline_events_manifest_idx
  on public.timeline_events(manifest_id, created_at desc);

create index if not exists timeline_events_version_idx
  on public.timeline_events(version_id)
  where version_id is not null;

comment on table public.timeline_events is
  'Append-only editor event log. Every UI/agent command should emit an event.';

-- ---------------------------------------------------------------------------
-- 3. RLS — project ownership via manifest → video_projects
-- ---------------------------------------------------------------------------
alter table public.timeline_versions enable row level security;
alter table public.timeline_events enable row level security;

drop policy if exists "Users access own timeline_versions" on public.timeline_versions;
create policy "Users access own timeline_versions"
  on public.timeline_versions for all
  using (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  )
  with check (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users access own timeline_events" on public.timeline_events;
create policy "Users access own timeline_events"
  on public.timeline_events for all
  using (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  )
  with check (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  );
