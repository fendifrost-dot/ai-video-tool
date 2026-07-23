-- Jacket-inpaint WATCHDOG v3 — cover Guarded Grok + align hard cap with edge.
--
-- Bugs fixed:
--   1. SQL hard-fail only matched pipeline_preference='jacket_only_inpaint_masked',
--      so Guarded Grok runs (guarded_grok_masked_inpaint) were never reaped/resumed
--      by cron — they hung on pad_upload until the client 18-min timeout.
--   2. Hard cap was 12 min while the edge watchdog + FLUX_POLL_MAX_MS allow up to
--      20 / 15 min. Align hard cap to 20 min (1200000 ms) so a live flux_poll is
--      not SQL-reaped mid-flight.
--
-- Edge `sweepStaleRuns` already uses isJacketInpaintRecipe(); this migration
-- keeps the DB floor in sync.

drop function if exists public.reap_stale_jacket_inpaints();

create function public.reap_stale_jacket_inpaints()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  now_ms      bigint := (extract(epoch from now()) * 1000)::bigint;
  hard_cap_ms bigint := 1200000;  -- 20 min (matches edge WATCHDOG_STALE_MS)
  failed_count int := 0;
  svc_key text;
  req_id  bigint;
  fn_url  text := 'https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/jacket-inpaint-proxy';
begin
  with stale as (
    update public.artist_looks al
    set status = 'failed',
        error_message = left(concat('[watchdog-',
            coalesce(al.composition_recipe_json->'jacket_inpaint_state'->>'step', '?'),
            '] watchdog_reaped_stale_run (hard cap; self-invoke chain presumed dead)'), 1000),
        composition_recipe_json = al.composition_recipe_json
          || jsonb_build_object(
               'generation_metadata',
               coalesce(al.composition_recipe_json->'generation_metadata', '{}'::jsonb)
                 || jsonb_build_object(
                      'failed', true,
                      'failed_step', concat('watchdog-',
                          coalesce(al.composition_recipe_json->'jacket_inpaint_state'->>'step', '?')),
                      'fal_error_raw', 'watchdog_reaped_stale_run (hard cap; self-invoke chain presumed dead)',
                      'pipeline_mode', 'durable_steps',
                      'watchdog_reaped_at_ms', now_ms
                    )
             )
    where al.status in ('pending', 'processing')
      and (
        al.composition_recipe_json->>'pipeline_preference' in (
          'jacket_only_inpaint_masked',
          'guarded_grok_masked_inpaint'
        )
        or al.composition_recipe_json ? 'jacket_inpaint_state'
      )
      and coalesce(
            nullif(al.composition_recipe_json->'jacket_inpaint_state'->>'started_at_ms', '')::bigint,
            (extract(epoch from al.created_at) * 1000)::bigint
          ) < now_ms - hard_cap_ms
    returning 1
  )
  select count(*) into failed_count from stale;

  begin
    select decrypted_secret into svc_key
      from vault.decrypted_secrets
      where name in ('service_role_key', 'SERVICE_ROLE_KEY', 'supabase_service_role_key')
      limit 1;
    if svc_key is not null then
      select net.http_post(
        url := fn_url,
        body := jsonb_build_object('action', 'sweep'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || svc_key
        )
      ) into req_id;
    end if;
  exception when others then
    raise notice 'jacket_inpaint_watchdog: resume nudge skipped (%)', sqlerrm;
  end;

  return jsonb_build_object('hard_failed', failed_count, 'nudge_request_id', req_id);
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
