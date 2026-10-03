-- lovable-cron-fallback-reviewed: owner-committed migration; per-minute tick is the required delivery window for server-owned job progress, and kick_provider_jobs() exits without any network call when no job is pending.
-- =============================================================================
-- Provider jobs progress on the server (Fendi, 2026-10-03: "The storyboard page must NOT need to remain open for
-- generation jobs to progress… The browser may display progress. It must not OWN progress.")
--
-- Until now a job the storyboard (or Runs) submitted moved forward only while a page was open: the page asked the
-- provider where the job stood, asked the server to save the finished clip, and then put the clip on its shot.
-- Closing the page left the job "rendering" for ever.
--
-- From here the server moves a submitted job to its end by itself:
--
--   pg_cron (every minute)  →  public.kick_provider_jobs()  →  pg_net  →  edge function provider-jobs-tick
--
-- and the edge function does, for every job that is not finished: ask the provider → save the clip → put it on its
-- shot (a restaged take: file it as a take in sync first) → mark the job finished. A page that is open asks the same
-- function to run now (for its own user's jobs) and reads the rows; it does none of the work itself.
--
-- What this adds:
--   • provider_jobs.finalized_at        the server has nothing more to do for this job
--   • provider_jobs.progress_claimed_at one worker at a time has a job (two ticks never save the same clip twice)
--   • provider_jobs.progress_failures   how many times a step failed; the job is given up on, with the reason, after a few
--   • provider_jobs.progress_note       the last thing that went wrong, in words
--   • public.claim_provider_jobs()      hands a worker the jobs that need work, atomically (service role only)
--   • public.job_runner_config          where the function is and the key cron calls it with (service role only;
--                                       the key is made here, in the database, and is never in the repository)
--   • public.kick_provider_jobs()       calls the function when — and only when — there is a job to move
--   • the cron schedule
--
-- Every job that exists today is marked finished as it stands: history is not re-run. Additive and idempotent.
-- =============================================================================

alter table public.provider_jobs add column if not exists finalized_at timestamptz;
alter table public.provider_jobs add column if not exists progress_claimed_at timestamptz;
alter table public.provider_jobs add column if not exists progress_failures int not null default 0;
alter table public.provider_jobs add column if not exists progress_note text;

comment on column public.provider_jobs.finalized_at is
  'Set when the server has nothing more to do for the job: its clip is saved and on its shot, or it failed, or it was given up on (progress_note says why). Null = provider-jobs-tick still moves it.';

-- History is not re-run: every job that is already over, or older than a day, is finished as it stands. A job
-- submitted in the last day that is still queued or running is left for the server to finish.
-- (The rows' own updated_at is history too: the updated_at trigger is held off while they are marked, when it is
-- there to hold off.)
do $$
declare
  has_trigger boolean := exists (
    select 1 from pg_trigger
     where tgrelid = 'public.provider_jobs'::regclass and tgname = 'provider_jobs_set_updated_at' and not tgisinternal
  );
begin
  if has_trigger then
    execute 'alter table public.provider_jobs disable trigger provider_jobs_set_updated_at';
  end if;
  update public.provider_jobs
     set finalized_at = coalesce(updated_at, created_at, now())
   where finalized_at is null
     and (status not in ('queued', 'running') or created_at < now() - interval '1 day');
  if has_trigger then
    execute 'alter table public.provider_jobs enable trigger provider_jobs_set_updated_at';
  end if;
end;
$$;

create index if not exists provider_jobs_unfinalized_idx
  on public.provider_jobs (created_at)
  where finalized_at is null;

-- The jobs a worker should move now, handed over atomically. Only jobs the batch runner submitted (the storyboard,
-- Runs, continuity pictures): they carry settings.batchRun. Other lanes keep their own lifecycles.
create or replace function public.claim_provider_jobs(p_user uuid default null, p_limit int default 12)
returns setof public.provider_jobs
language sql
security definer
set search_path = public
as $$
  update public.provider_jobs j
     set progress_claimed_at = now()
   where j.id in (
     select id
       from public.provider_jobs
      where finalized_at is null
        and (request_payload_json -> 'settings' ->> 'batchRun') is not null
        and created_at > now() - interval '7 days'
        and (progress_claimed_at is null or progress_claimed_at < now() - interval '4 minutes')
        and (p_user is null or user_id = p_user)
      order by progress_claimed_at nulls first, created_at
      limit greatest(1, least(coalesce(p_limit, 12), 50))
      for update skip locked
   )
  returning j.*;
$$;

revoke all on function public.claim_provider_jobs(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_provider_jobs(uuid, int) to service_role;

-- Where the function is, and the key the scheduler calls it with. One row. Service role only: RLS is on and there is
-- no policy, so neither the browser nor a signed-in user can read it.
create table if not exists public.job_runner_config (
  id           boolean primary key default true check (id),
  function_url text not null,
  cron_key     text not null,
  created_at   timestamptz not null default now()
);
alter table public.job_runner_config enable row level security;
revoke all on public.job_runner_config from anon, authenticated;
grant all on public.job_runner_config to service_role;

insert into public.job_runner_config (id, function_url, cron_key)
values (
  true,
  'https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/provider-jobs-tick',
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
)
on conflict (id) do nothing;

-- Call the function when there is something to move. Asynchronous (pg_net queues the request): the scheduler never
-- waits for a render.
create or replace function public.kick_provider_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.job_runner_config%rowtype;
begin
  if not exists (
    select 1
      from public.provider_jobs
     where finalized_at is null
       and (request_payload_json -> 'settings' ->> 'batchRun') is not null
       and created_at > now() - interval '7 days'
  ) then
    return;
  end if;
  select * into cfg from public.job_runner_config where id;
  if not found then
    return;
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', cfg.cron_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end
$$;

revoke all on function public.kick_provider_jobs() from public, anon, authenticated;
grant execute on function public.kick_provider_jobs() to service_role;

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'provider_job_progress: pg_net unavailable (%), the scheduler cannot call the function', sqlerrm;
    return;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'provider_job_progress: pg_cron unavailable (%), skipping the schedule', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('provider-jobs-tick');
  exception when others then
    null; -- no prior schedule
  end;
  begin
    perform cron.schedule('provider-jobs-tick', '* * * * *', 'select public.kick_provider_jobs();');
  exception when others then
    raise notice 'provider_job_progress: cron.schedule failed (%)', sqlerrm;
  end;
end;
$$;
