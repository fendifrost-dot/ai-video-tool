-- The plan-credit ("subscription") route: its switch, its credit caps, and the one gate every submit passes.
--
-- A job paid from plan credits is submitted by a runner outside AVT's server (a signed-in CLI, or a Claude session
-- using the provider's connector). The rules that keep that safe are executable here, not instructions to the runner:
--
--   authorize_subscription_submit(job, quote, runner)
--       the ONLY way a row gets "submit started". Refuses when the route is off, the job is not a parked plan-credit
--       job, a submit was already started (it is never started twice), the quote is above the per-job cap, or the
--       month's credits plus this quote would pass the monthly cap. On success it writes submitStartedAt, the quote
--       and the runner on the row in the same statement that checked them.
--   record_subscription_submit(job, external_id)
--       writes the provider's job id on a row whose submit was authorized and has none yet.
--   clear_unreconciled_submit(job, evidence)
--       a submit that was authorized and never recorded a job id is NOT retried by anything. After the provider's own
--       job list and credit transactions have been checked and show no job since the start time, this clears the
--       mark, keeping the evidence on the row, so the job can be authorized again.
--
-- Additive and idempotent. Service role only (the scheduler, Lovable's SQL console, an admin tool). Ships switched off.

create table if not exists public.subscription_route_config (
  id                      boolean primary key default true check (id),
  enabled                 boolean not null default false,
  max_credits_per_job     numeric not null default 60,
  max_credits_per_month   numeric not null default 1200,
  updated_at              timestamptz not null default now()
);
insert into public.subscription_route_config (id) values (true) on conflict (id) do nothing;
alter table public.subscription_route_config enable row level security;
revoke all on public.subscription_route_config from anon, authenticated;

create or replace function public.subscription_credits_this_month()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(
           (request_payload_json #>> '{settings,billing,actualCredits}')::numeric,
           (request_payload_json #>> '{settings,billing,quoteCredits}')::numeric, 0)), 0)
    from public.provider_jobs
   where request_payload_json #>> '{settings,billing,route}' = 'subscription'
     and request_payload_json #>> '{settings,billing,runner,submitStartedAt}' is not null
     and (request_payload_json #>> '{settings,billing,runner,submitStartedAt}')::timestamptz >= date_trunc('month', now());
$$;

create or replace function public.authorize_subscription_submit(p_job uuid, p_quote numeric, p_runner text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.subscription_route_config;
  j   public.provider_jobs;
  b   jsonb;
  used numeric;
begin
  select * into cfg from public.subscription_route_config where id;
  if not coalesce(cfg.enabled, false) then return jsonb_build_object('ok', false, 'why', 'the subscription route is switched off'); end if;
  if p_quote is null or p_quote <= 0 then return jsonb_build_object('ok', false, 'why', 'no credit quote'); end if;
  select * into j from public.provider_jobs where id = p_job for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'no such job'); end if;
  b := j.request_payload_json #> '{settings,billing}';
  if coalesce(b ->> 'route', '') <> 'subscription' then return jsonb_build_object('ok', false, 'why', 'not a plan-credit job'); end if;
  if j.external_job_id is not null then return jsonb_build_object('ok', false, 'why', 'already submitted', 'external_job_id', j.external_job_id); end if;
  if j.status <> 'queued' then return jsonb_build_object('ok', false, 'why', 'the job is ' || j.status); end if;
  if b #>> '{runner,submitStartedAt}' is not null then
    return jsonb_build_object('ok', false, 'why', 'unreconciled: a submit was started and no job id was recorded — check the provider before anything is sent again', 'submitStartedAt', b #>> '{runner,submitStartedAt}');
  end if;
  if p_quote > cfg.max_credits_per_job then
    return jsonb_build_object('ok', false, 'why', 'the quote is above the per-job cap', 'quote', p_quote, 'cap', cfg.max_credits_per_job);
  end if;
  used := public.subscription_credits_this_month();
  if used + p_quote > cfg.max_credits_per_month then
    return jsonb_build_object('ok', false, 'why', 'this would pass the monthly cap', 'used', used, 'quote', p_quote, 'cap', cfg.max_credits_per_month);
  end if;
  update public.provider_jobs
     set request_payload_json = jsonb_set(jsonb_set(request_payload_json, '{settings,billing,quoteCredits}', to_jsonb(p_quote), true),
           '{settings,billing,runner}', coalesce(b -> 'runner', '{}'::jsonb) || jsonb_build_object('id', p_runner, 'claimedAt', now(), 'submitStartedAt', now()), true)
   where id = p_job;
  return jsonb_build_object('ok', true, 'used_this_month', used, 'quote', p_quote);
end;
$$;

create or replace function public.record_subscription_submit(p_job uuid, p_external_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(p_external_id, '') = '' then return jsonb_build_object('ok', false, 'why', 'no job id'); end if;
  update public.provider_jobs
     set external_job_id = p_external_id, status = 'running'
   where id = p_job and external_job_id is null
     and request_payload_json #>> '{settings,billing,route}' = 'subscription'
     and request_payload_json #>> '{settings,billing,runner,submitStartedAt}' is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1, 'why', case when n = 1 then null else 'the job was not authorized, or already has a job id' end);
end;
$$;

create or replace function public.clear_unreconciled_submit(p_job uuid, p_evidence text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if length(coalesce(p_evidence, '')) < 20 then return jsonb_build_object('ok', false, 'why', 'say what was checked at the provider (job list and credit transactions since the start time)'); end if;
  update public.provider_jobs
     set request_payload_json = jsonb_set(
           request_payload_json #- '{settings,billing,runner,submitStartedAt}',
           '{settings,billing,runner,cleared}',
           coalesce(request_payload_json #> '{settings,billing,runner,cleared}', '[]'::jsonb)
             || jsonb_build_object('at', now(), 'startedAt', request_payload_json #>> '{settings,billing,runner,submitStartedAt}', 'evidence', p_evidence), true)
   where id = p_job and external_job_id is null and status = 'queued'
     and request_payload_json #>> '{settings,billing,runner,submitStartedAt}' is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end;
$$;

revoke all on function public.subscription_credits_this_month() from public, anon, authenticated;
revoke all on function public.authorize_subscription_submit(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.record_subscription_submit(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_unreconciled_submit(uuid, text) from public, anon, authenticated;
grant execute on function public.subscription_credits_this_month() to service_role;
grant execute on function public.authorize_subscription_submit(uuid, numeric, text) to service_role;
grant execute on function public.record_subscription_submit(uuid, text) to service_role;
grant execute on function public.clear_unreconciled_submit(uuid, text) to service_role;
