-- Put-back as a worker job (docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md). Class C.
--
-- APPLY ONLY IN LOVABLE'S SQL EDITOR (project qoyxgnkvjukovkrvdaiq). Never the Supabase CLI or dashboard.
--
-- SELF-CONTAINED. On 19 Nov 2026 the live database had none of 20261113120000_asset_store_extensions.sql or
-- 20261113140000_worker_capability.sql (STORE-5, still in review): edit_renders had no job_kind, project_id,
-- input_asset_ids or settings, and edit_render_workers had no owner_user_id. This file adds ONLY what a put-back
-- needs, with the same definitions those files use and `if not exists` throughout, so it applies before or after
-- them. (20261113120000's job_kind check was amended in the same PR to keep 'putback'.)
--
-- What it does:
--   1. edit_renders: job_kind (with 'putback'), project_id, input_asset_ids, settings; sequence_id may be null for
--      a job that is not an edit; kind may be 'job'.
--   2. edit_render_workers.owner_user_id: whose machine a worker is. A put-back is handed only to a worker its
--      job's user owns (edit-render-worker-api).
--   3. claim_edit_render (the claim every existing worker uses) hands out EDIT jobs only; claim_edit_render_kinds
--      hands a worker only the kinds it names.
--   4. queue_putback_job / putback_job: the ONLY way a put-back row is made or read by its owner. The table's own
--      policy (edit_renders_owner) admits only rows tied to one of the user's edit sequences and is NOT changed:
--      no policy is added, widened or dropped here. Both functions act for auth.uid() alone, on a project and two
--      files that user owns.
-- No table is dropped, no row is deleted, no policy changes, no storage change.
--
-- Rollback:
--   drop function public.queue_putback_job(uuid, uuid, uuid, text);
--   drop function public.putback_job(uuid);
--   drop function public.claim_edit_render_kinds(text, text[]);
--   re-create claim_edit_render from 20261018100000_edit_render_worker.sql;
--   delete from public.edit_renders where job_kind = 'putback';   -- only if the columns are to go
--   alter table public.edit_renders drop constraint edit_renders_job_kind_check, drop constraint edit_renders_edit_needs_sequence;
--   (the added columns are harmless to keep; the pending STORE-5 migration adds the same ones.)

-- ---------------------------------------------------------------------------------------------- columns

alter table public.edit_renders add column if not exists job_kind text not null default 'edit';
alter table public.edit_renders drop constraint if exists edit_renders_job_kind_check;
alter table public.edit_renders add constraint edit_renders_job_kind_check
  check (job_kind in ('edit', 'vfx', 'qc', 'blender', 'beat_cut', 'putback'));

alter table public.edit_renders alter column sequence_id drop not null;
alter table public.edit_renders drop constraint if exists edit_renders_edit_needs_sequence;
alter table public.edit_renders add constraint edit_renders_edit_needs_sequence
  check (job_kind <> 'edit' or sequence_id is not null);

alter table public.edit_renders drop constraint if exists edit_renders_kind_check;
alter table public.edit_renders add constraint edit_renders_kind_check
  check (kind in ('proxy', 'final', 'job'));

alter table public.edit_renders add column if not exists input_asset_ids uuid[] not null default '{}';
alter table public.edit_renders add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.edit_renders add column if not exists project_id uuid references public.video_projects (id) on delete cascade;

alter table public.edit_render_workers add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

-- ---------------------------------------------------------------------------------------------- claims

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
        and job_kind = 'edit'
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

-- A worker names the kinds it can run and the user it works for. A put-back is claimed only for that user: another
-- user's put-back is never taken off the queue by this worker (it waits for a worker of its own, or times out of
-- nothing: a queued row costs nothing).
create or replace function public.claim_edit_render_kinds(p_worker text, p_kinds text[], p_owner uuid)
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
        and job_kind = any (p_kinds)
        and (job_kind = 'edit' or (p_owner is not null and user_id = p_owner))
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

revoke all on function public.claim_edit_render(text) from public, anon, authenticated;
revoke all on function public.claim_edit_render_kinds(text, text[], uuid) from public, anon, authenticated;
grant execute on function public.claim_edit_render(text) to service_role;
grant execute on function public.claim_edit_render_kinds(text, text[], uuid) to service_role;

-- ---------------------------------------------------------------------------------------------- the owner's door

-- Queue one put-back: a preset name and two files of one project, all the caller's own. Returns the job id.
create or replace function public.queue_putback_job(
  p_project_id uuid,
  p_original_asset_id uuid,
  p_swap_asset_id uuid,
  p_preset text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'an anonymous session cannot queue a put-back';
  end if;
  if p_preset is null or p_preset !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'preset is not a preset name';
  end if;
  if p_original_asset_id is null or p_swap_asset_id is null or p_original_asset_id = p_swap_asset_id then
    raise exception 'two different assets are required: the original window, then its swap';
  end if;
  if not exists (select 1 from public.video_projects where id = p_project_id and user_id = v_uid) then
    raise exception 'project not found';
  end if;
  select count(*) into v_n from public.project_assets
   where id in (p_original_asset_id, p_swap_asset_id) and user_id = v_uid and project_id = p_project_id;
  if v_n <> 2 then
    raise exception 'both assets must be files of this project';
  end if;
  select count(*) into v_n from public.edit_renders
   where user_id = v_uid and job_kind = 'putback' and status in ('queued', 'rendering');
  if v_n >= 10 then
    raise exception 'ten put-backs are already waiting; let them finish first';
  end if;
  insert into public.edit_renders (user_id, project_id, sequence_id, job_kind, kind, status, plan, cost_usd, input_asset_ids, settings)
  values (v_uid, p_project_id, null, 'putback', 'job', 'queued', jsonb_build_object('costUsd', 0), 0,
          array[p_original_asset_id, p_swap_asset_id], jsonb_build_object('preset', p_preset))
  returning id into v_id;
  return v_id;
end $$;

-- Read one of the caller's own put-backs: its state, its reason if it failed, the asset it filed.
create or replace function public.putback_job(p_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
           'id', r.id, 'job_kind', r.job_kind, 'status', r.status, 'error', r.error, 'attempts', r.attempts,
           'preset', r.settings ->> 'preset', 'input_asset_ids', r.input_asset_ids, 'project_id', r.project_id,
           'output_asset_id', r.output_asset_id, 'created_at', r.created_at, 'started_at', r.started_at,
           'finished_at', r.finished_at, 'worker_id', r.worker_id)
    from public.edit_renders r
   where r.id = p_id and r.user_id = auth.uid() and r.job_kind = 'putback';
$$;

revoke all on function public.queue_putback_job(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.putback_job(uuid) from public, anon;
grant execute on function public.queue_putback_job(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.putback_job(uuid) to authenticated, service_role;
