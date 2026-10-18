-- Durable edit-render worker: a claimed/rendering state, a SKIP LOCKED claim, a stale reaper,
-- and worker secrets (hash only) for the edit-render-worker-api edge function.
-- Additive and idempotent. cost_usd stays CHECK = 0.
--
-- Rollback: drop function public.claim_edit_render(text); drop function public.reap_stale_edit_renders(integer);
-- drop table public.edit_render_workers; alter table public.edit_renders drop column claimed_at, worker_id,
-- attempts, started_at, finished_at, duration_seconds; restore the status check without 'rendering'
-- (after moving any 'rendering' rows to 'queued').

alter table public.edit_renders add column if not exists claimed_at timestamptz;
alter table public.edit_renders add column if not exists worker_id text;
alter table public.edit_renders add column if not exists attempts integer not null default 0;
alter table public.edit_renders add column if not exists started_at timestamptz;
alter table public.edit_renders add column if not exists finished_at timestamptz;
alter table public.edit_renders add column if not exists duration_seconds double precision;

alter table public.edit_renders drop constraint if exists edit_renders_status_check;
alter table public.edit_renders add constraint edit_renders_status_check
  check (status in ('planned', 'queued', 'rendering', 'complete', 'failed'));

create index if not exists edit_renders_queue_idx on public.edit_renders (status, created_at);

-- Worker secrets. Only a SHA-256 hex hash is stored. No policies: service_role only.
create table if not exists public.edit_render_workers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  secret_hash text not null unique,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.edit_render_workers enable row level security;
revoke all on public.edit_render_workers from anon, authenticated;
grant select, insert, update, delete on public.edit_render_workers to service_role;

-- rendering longer than p_minutes goes back to queued (attempts < 3) or fails.
create or replace function public.reap_stale_edit_renders(p_minutes integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with stale as (
    select id, attempts from public.edit_renders
    where status = 'rendering' and claimed_at < now() - make_interval(mins => p_minutes)
    for update skip locked
  )
  update public.edit_renders r
     set status = case when s.attempts < 3 then 'queued' else 'failed' end,
         error = case when s.attempts < 3 then 'reaped: worker stopped mid-render; retrying'
                      else 'reaped: worker stopped mid-render 3 times' end,
         worker_id = null,
         claimed_at = null,
         finished_at = case when s.attempts < 3 then null else now() end
    from stale s where r.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.claim_edit_render(p_worker text)
returns setof public.edit_renders
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reap_stale_edit_renders(20);
  return query
  update public.edit_renders r
     set status = 'rendering', claimed_at = now(), started_at = now(), worker_id = p_worker,
         attempts = r.attempts + 1, error = null
   where r.id = (
     select id from public.edit_renders
      where status = 'queued'
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

revoke all on function public.reap_stale_edit_renders(integer) from public, anon, authenticated;
revoke all on function public.claim_edit_render(text) from public, anon, authenticated;
grant execute on function public.reap_stale_edit_renders(integer) to service_role;
grant execute on function public.claim_edit_render(text) to service_role;
