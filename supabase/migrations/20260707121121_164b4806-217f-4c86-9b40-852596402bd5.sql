-- Jacket-inpaint WATCHDOG (independent reaper).
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
    null;
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