-- Scenarios for 20261004030000_subscription_route_gate.sql. Run from the repo root against a THROWAWAY Postgres 16
-- (never the project database): psql -q -t -f supabase/tests/subscription_route_gate.sql
-- Expected, in order: off; not a plan-credit job; above the per-job cap; true; unreconciled; monthly cap;
-- evidence asked for; true; true; true; false; false; already submitted.
\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create type provider_job_status as enum ('queued','running','succeeded','failed','cancelled');
create table public.provider_jobs (id uuid primary key default gen_random_uuid(), external_job_id text, status provider_job_status not null default 'queued', request_payload_json jsonb not null default '{}');
\i supabase/migrations/20261004030000_subscription_route_gate.sql
\i supabase/migrations/20261004030000_subscription_route_gate.sql
insert into provider_jobs (id, request_payload_json) values
 ('00000000-0000-0000-0000-000000000001', '{"settings":{"billing":{"route":"subscription"}}}'),
 ('00000000-0000-0000-0000-000000000002', '{"settings":{"billing":{"route":"subscription"}}}'),
 ('00000000-0000-0000-0000-000000000003', '{"settings":{"billing":{"route":"api"}}}');
\echo 1 off:
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 28, 'r') ->> 'why';
update subscription_route_config set enabled = true, max_credits_per_month = 50;
\echo 2 api job / over per-job cap:
select authorize_subscription_submit('00000000-0000-0000-0000-000000000003', 28, 'r') ->> 'why';
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 61, 'r') ->> 'why';
\echo 3 ok, then second start refused:
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 28, 'r') ->> 'ok';
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 28, 'r') ->> 'why';
\echo 4 monthly cap (28 used + 28 > 50):
select authorize_subscription_submit('00000000-0000-0000-0000-000000000002', 28, 'r') ->> 'why';
\echo 5 clear needs evidence; then clears; then can start again:
select clear_unreconciled_submit('00000000-0000-0000-0000-000000000001', 'none') ->> 'why';
select clear_unreconciled_submit('00000000-0000-0000-0000-000000000001', 'show_generations and transactions since 02:00Z: no job, no charge') ->> 'ok';
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 20, 'r') ->> 'ok';
\echo 6 record id once, never twice; authorize after id refused:
select record_subscription_submit('00000000-0000-0000-0000-000000000001', 'hf_1') ->> 'ok';
select record_subscription_submit('00000000-0000-0000-0000-000000000001', 'hf_2') ->> 'ok';
select record_subscription_submit('00000000-0000-0000-0000-000000000002', 'hf_3') ->> 'ok';
select authorize_subscription_submit('00000000-0000-0000-0000-000000000001', 20, 'r') ->> 'why';
select external_job_id, status, request_payload_json #>> '{settings,billing,quoteCredits}' q, jsonb_array_length(request_payload_json #> '{settings,billing,runner,cleared}') cleared from provider_jobs order by id;
select subscription_credits_this_month();
