-- Jacket-inpaint WATCHDOG (independent reaper).
--
-- The durable state-machine self-invokes to survive Supabase's ~400s wall clock.
-- If that self-invoke chain ever dies (dropped waitUntil, crashed slice, platform
-- hiccup) the row can't fail itself and orphans as `pending` forever. The edge
-- function already sweeps stale rows at the head of every new submit; this is the
-- belt-and-suspenders that fires even when NO new submit arrives — a pure in-DB
-- reaper on a cron, needing no keys and no edge round-trip.
--
-- Deadline: 12 min of wall clock since the run's started_at_ms (falls back to the
-- row's created_at). With flux now running at ~1 MP the whole pipeline finishes in
-- a few minutes, so anything past 12 min is dead, not slow.

create or replace function public.reap_stale_jacket_inpaints()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reaped integer;
  cutoff_ms bigint := (extract(epoch from now()) * 1000)::bigint - 720000; -- 12 min
begin
  with stale as (
    update public.artist_looks al
    set status = 'failed',
        error_message = left(concat('[watchdog-',
            coalesce(al.composition_recipe_json->'jacket_inpaint_state'->>'step', '?'),
            '] watchdog_reaped_stale_run (self-invoke chain presumed dead)'), 1000),
        composition_recipe_json = al.composition_recipe_json
          || jsonb_build_object(
               'generation_metadata',
               coalesce(al.composition_recipe_json->'generation_metadata', '{}'::jsonb)
                 || jsonb_build_object(
                      'failed', true,
                      'failed_step', concat('watchdog-',
                          coalesce(al.composition_recipe_json->'jacket_inpaint_state'->>'step', '?')),
                      'fal_error_raw', 'watchdog_reaped_stale_run (self-invoke chain presumed dead)',
                      'pipeline_mode', 'durable_steps',
                      'watchdog_reaped_at_ms', (extract(epoch from now()) * 1000)::bigint
                    )
             )
    where al.status = 'pending'
      and al.composition_recipe_json->>'pipeline_preference' = 'jacket_only_inpaint_masked'
      and coalesce(
            nullif(al.composition_recipe_json->'jacket_inpaint_state'->>'started_at_ms', '')::bigint,
            (extract(epoch from al.created_at) * 1000)::bigint
          ) < cutoff_ms
    returning 1
  )
  select count(*) into reaped from stale;
  return reaped;
end;
$$;

-- Schedule it every 2 minutes via pg_cron. All best-effort: if the extension is
-- not enabled on this project (dashboard-gated) the migration still succeeds and
-- the edge-function submit-sweep remains the active watchdog. Enable pg_cron in
-- the Supabase dashboard to activate this second, chain-independent watchdog.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'jacket_inpaint_watchdog: pg_cron unavailable (%), skipping cron schedule', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule('reap-stale-jacket-inpaints');
  exception when others then
    null; -- no prior schedule
  end;
  begin
    perform cron.schedule(
      'reap-stale-jacket-inpaints',
      '*/2 * * * *',
      'select public.reap_stale_jacket_inpaints();'
    );
  exception when others then
    raise notice 'jacket_inpaint_watchdog: cron.schedule failed (%)', sqlerrm;
  end;
end;
$$;
