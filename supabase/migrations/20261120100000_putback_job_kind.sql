-- Put-back as a worker job (docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md). Class C: architecture, product and
-- security sign-off before this is applied.
--
-- APPLY ONLY IN LOVABLE'S SQL EDITOR, and only AFTER 20261113120000_asset_store_extensions.sql, which adds
-- edit_renders.job_kind / input_asset_ids / settings and was NOT applied live as of 19 Nov 2026
-- (select job_kind from edit_renders → "column edit_renders.job_kind does not exist").
--
-- What it does:
--   1. allows job_kind 'putback' (scripts/edit/body_only_swap.py run unchanged by a worker);
--   2. claim_edit_render (the claim every existing worker uses) hands out EDIT jobs only. Until now it handed the
--      oldest queued row of any kind to a worker that has no runner for it, which then failed the job;
--   3. claim_edit_render_kinds: a worker names the kinds it can run and is handed nothing else.
-- No policy changes. Both functions are security definer, service_role only, like the one they replace.
--
-- Rollback:
--   drop function public.claim_edit_render_kinds(text, text[]);
--   alter table public.edit_renders drop constraint edit_renders_job_kind_check;
--   alter table public.edit_renders add constraint edit_renders_job_kind_check
--     check (job_kind in ('edit', 'vfx', 'qc', 'blender', 'beat_cut'));
--   and re-create claim_edit_render from 20261018100000_edit_render_worker.sql.

alter table public.edit_renders drop constraint if exists edit_renders_job_kind_check;
alter table public.edit_renders add constraint edit_renders_job_kind_check
  check (job_kind in ('edit', 'vfx', 'qc', 'blender', 'beat_cut', 'putback'));

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

create or replace function public.claim_edit_render_kinds(p_worker text, p_kinds text[])
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
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

revoke all on function public.claim_edit_render(text) from public, anon, authenticated;
revoke all on function public.claim_edit_render_kinds(text, text[]) from public, anon, authenticated;
grant execute on function public.claim_edit_render(text) to service_role;
grant execute on function public.claim_edit_render_kinds(text, text[]) to service_role;
