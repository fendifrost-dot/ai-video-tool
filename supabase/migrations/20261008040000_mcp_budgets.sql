-- ============================================================================
-- MCP BUDGETS — what an outside AI (Claude, ChatGPT, Grok) may spend through avt-mcp
-- ============================================================================
-- Why this exists: `avt-mcp` lets an AI drive AVT as the owner, through a machine
-- credential (batch_credentials). Every paid call it makes is charged against a
-- BUDGET the owner approved for one video before the work starts. When a call
-- would take a budget past what was approved, it is refused — the hard cap.
--
-- Who writes what:
--   mcp_budgets — the owner, from the app (Settings → AI budgets): creates an
--     approved budget, approves a pending one, closes one. avt-mcp inserts
--     PENDING requests only (service role) and never exposes these tables to
--     its generic write tools.
--   mcp_spend   — only the two functions below, run by avt-mcp with the service
--     role. Nobody writes it directly; the owner reads it.
--
-- Reservation is atomic: mcp_reserve locks the budget row (and an owner-wide
-- advisory lock for the daily cap), so two calls in flight cannot both fit into
-- the last dollar. A call that fails without the provider reporting a cost keeps
-- its reservation counted (it may have been billed); the owner can see it.
--
-- Additive: no existing table, policy or function is altered.
-- ============================================================================

create table if not exists public.mcp_budgets (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references public.video_projects(id) on delete set null,
  label           text not null check (length(label) between 1 and 200),
  approved_usd    numeric(10,2) not null check (approved_usd >= 0 and approved_usd <= 10000),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'closed')),
  note            text,
  requested_by_credential uuid references public.batch_credentials(id) on delete set null,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  closed_at       timestamptz
);
create index if not exists mcp_budgets_owner on public.mcp_budgets (owner_user_id, status);

create table if not exists public.mcp_spend (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  budget_id       uuid not null references public.mcp_budgets(id) on delete cascade,
  credential_id   uuid references public.batch_credentials(id) on delete set null,
  function_name   text not null,
  reserved_usd    numeric(10,4) not null check (reserved_usd >= 0),
  actual_usd      numeric(10,4) check (actual_usd is null or actual_usd >= 0),
  status          text not null default 'reserved' check (status in ('reserved', 'settled', 'failed')),
  http_status     integer,
  request_excerpt jsonb,
  response_excerpt jsonb,
  created_at      timestamptz not null default now(),
  settled_at      timestamptz
);
create index if not exists mcp_spend_budget on public.mcp_spend (budget_id);
create index if not exists mcp_spend_owner_day on public.mcp_spend (owner_user_id, created_at);

grant select, insert, update on public.mcp_budgets to authenticated;
grant all on public.mcp_budgets to service_role;
alter table public.mcp_budgets enable row level security;
drop policy if exists "Owners read own mcp_budgets" on public.mcp_budgets;
create policy "Owners read own mcp_budgets" on public.mcp_budgets
  for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists "Owners create own mcp_budgets" on public.mcp_budgets;
create policy "Owners create own mcp_budgets" on public.mcp_budgets
  for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists "Owners update own mcp_budgets" on public.mcp_budgets;
create policy "Owners update own mcp_budgets" on public.mcp_budgets
  for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

grant select on public.mcp_spend to authenticated;
grant all on public.mcp_spend to service_role;
alter table public.mcp_spend enable row level security;
drop policy if exists "Owners read own mcp_spend" on public.mcp_spend;
create policy "Owners read own mcp_spend" on public.mcp_spend
  for select to authenticated using (owner_user_id = auth.uid());

-- What has been committed against a budget: settled calls at their real cost, everything else at its reservation.
create or replace function public.mcp_budget_committed(p_budget_id uuid)
returns numeric language sql stable security invoker set search_path = public as $$
  -- invoker: an app user sees only their own rows (RLS); mcp_reserve runs it as its definer
  select coalesce(sum(coalesce(actual_usd, reserved_usd)), 0) from public.mcp_spend where budget_id = p_budget_id;
$$;

create or replace function public.mcp_reserve(
  p_budget_id uuid,
  p_owner uuid,
  p_credential uuid,
  p_function text,
  p_usd numeric,
  p_daily_cap numeric,
  p_project uuid,
  p_request jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.mcp_budgets%rowtype;
  committed numeric;
  today numeric;
  sid uuid;
begin
  if p_usd is null or p_usd <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'max_usd must be a positive amount');
  end if;
  perform pg_advisory_xact_lock(hashtext('mcp_spend:' || p_owner::text));
  select * into b from public.mcp_budgets where id = p_budget_id for update;
  if not found or b.owner_user_id <> p_owner then
    return jsonb_build_object('ok', false, 'reason', 'no such budget of yours');
  end if;
  if b.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'budget "' || b.label || '" is ' || b.status || ' — the owner approves budgets in AVT Settings → AI budgets');
  end if;
  if b.project_id is not null and p_project is not null and p_project <> b.project_id then
    return jsonb_build_object('ok', false, 'reason', 'budget "' || b.label || '" is for another project');
  end if;
  committed := public.mcp_budget_committed(p_budget_id);
  if committed + p_usd > b.approved_usd then
    return jsonb_build_object('ok', false, 'reason', 'over budget', 'approved_usd', b.approved_usd,
      'committed_usd', committed, 'asked_usd', p_usd, 'remaining_usd', b.approved_usd - committed);
  end if;
  if p_daily_cap is not null then
    select coalesce(sum(coalesce(actual_usd, reserved_usd)), 0) into today
      from public.mcp_spend where owner_user_id = p_owner and created_at >= date_trunc('day', now());
    if today + p_usd > p_daily_cap then
      return jsonb_build_object('ok', false, 'reason', 'over the daily cap', 'daily_cap_usd', p_daily_cap,
        'today_usd', today, 'asked_usd', p_usd);
    end if;
  end if;
  insert into public.mcp_spend (owner_user_id, budget_id, credential_id, function_name, reserved_usd, request_excerpt)
    values (p_owner, p_budget_id, p_credential, p_function, p_usd, p_request)
    returning id into sid;
  return jsonb_build_object('ok', true, 'spend_id', sid, 'approved_usd', b.approved_usd,
    'committed_usd', committed + p_usd, 'remaining_usd', b.approved_usd - committed - p_usd);
end;
$$;

create or replace function public.mcp_settle(
  p_spend_id uuid,
  p_status text,
  p_actual numeric,
  p_http integer,
  p_response jsonb
) returns void language sql security definer set search_path = public as $$
  update public.mcp_spend
     set status = p_status, actual_usd = p_actual, http_status = p_http, response_excerpt = p_response, settled_at = now()
   where id = p_spend_id and status = 'reserved';
$$;

revoke all on function public.mcp_budget_committed(uuid) from public, anon;
grant execute on function public.mcp_budget_committed(uuid) to authenticated, service_role;
revoke all on function public.mcp_reserve(uuid, uuid, uuid, text, numeric, numeric, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_reserve(uuid, uuid, uuid, text, numeric, numeric, uuid, jsonb) to service_role;
revoke all on function public.mcp_settle(uuid, text, numeric, integer, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_settle(uuid, text, numeric, integer, jsonb) to service_role;
