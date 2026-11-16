-- Local ComfyUI worker on the same job row as the edit-render box.
-- Apply in the Lovable SQL editor on qoyxgnkvjukovkrvdaiq after
-- 20261113140000_worker_capability.sql.
-- The box claim skips job_kind gpu. The GPU claim takes only those rows.
-- cost_usd stays 0. This file deletes nothing.

alter table public.edit_renders drop constraint if exists edit_renders_job_kind_check;
alter table public.edit_renders add constraint edit_renders_job_kind_check
  check (job_kind in ('edit', 'vfx', 'qc', 'blender', 'beat_cut', 'gpu'));

alter table public.edit_render_workers add column if not exists lane text not null default 'edit';
alter table public.edit_render_workers drop constraint if exists edit_render_workers_lane_check;
alter table public.edit_render_workers add constraint edit_render_workers_lane_check
  check (lane in ('edit', 'gpu'));

alter table public.effect_presets add column if not exists engine text not null default 'code';
alter table public.effect_presets drop constraint if exists effect_presets_engine_check;
alter table public.effect_presets add constraint effect_presets_engine_check
  check (engine in ('code', 'comfyui'));
alter table public.effect_presets add column if not exists workflow jsonb;
alter table public.effect_presets add column if not exists license text;
alter table public.effect_presets add column if not exists required_models text[] not null default '{}';
alter table public.effect_presets add column if not exists required_nodes text[] not null default '{}';
alter table public.effect_presets add column if not exists device_requirement jsonb not null default '{}'::jsonb;
alter table public.effect_presets add column if not exists performer_protection jsonb not null default '{}'::jsonb;
alter table public.effect_presets add column if not exists workflow_sha256 text;
alter table public.effect_presets add column if not exists workflow_asset_id uuid references public.project_assets (id) on delete set null;
alter table public.effect_presets add column if not exists reference_only boolean not null default false;

create or replace function public.guard_published_effect()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' then
    if new.code_ref is distinct from old.code_ref
       or new.params_schema is distinct from old.params_schema
       or new.params_defaults is distinct from old.params_defaults
       or new.skill_version_id is distinct from old.skill_version_id
       or new.preview_asset_id is distinct from old.preview_asset_id
       or new.changelog is distinct from old.changelog
       or new.slug is distinct from old.slug
       or new.version_number is distinct from old.version_number
       or new.name is distinct from old.name
       or new.engine is distinct from old.engine
       or new.workflow is distinct from old.workflow
       or new.license is distinct from old.license
       or new.required_models is distinct from old.required_models
       or new.required_nodes is distinct from old.required_nodes
       or new.device_requirement is distinct from old.device_requirement
       or new.performer_protection is distinct from old.performer_protection
       or new.workflow_sha256 is distinct from old.workflow_sha256
       or new.workflow_asset_id is distinct from old.workflow_asset_id
       or new.reference_only is distinct from old.reference_only
    then
      raise exception 'published effect versions are immutable';
    end if;
  end if;
  return new;
end $$;

-- Box workers keep claiming edit, vfx, qc, blender, and beat_cut. GPU rows stay queued for the Mac.
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
        and job_kind is distinct from 'gpu'
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

create or replace function public.claim_gpu_job(p_worker text, p_label text)
returns setof public.edit_renders
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reap_stale_edit_renders(20);
  return query
  update public.edit_renders r
     set status = 'rendering',
         claimed_at = now(),
         started_at = coalesce(r.started_at, now()),
         worker_id = p_worker,
         attempts = r.attempts + 1,
         error = null
   where r.id = (
     select id from public.edit_renders
      where status = 'queued'
        and job_kind = 'gpu'
        and (assigned_worker is null or assigned_worker = p_label)
      order by created_at
      for update skip locked
      limit 1)
  returning r.*;
end $$;

create or replace function public.register_edit_worker(
  p_label text,
  p_secret text,
  p_os text,
  p_tool_versions jsonb,
  p_manifest jsonb,
  p_cache_cap bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_hash text;
  v_lane text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_label is null or p_secret is null or length(p_secret) < 32 then
    raise exception 'label and a 32 character secret are required';
  end if;
  v_lane := case when coalesce(p_manifest->>'lane', '') = 'gpu' then 'gpu' else 'edit' end;
  v_hash := encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex');
  insert into public.edit_render_workers (
    label, secret_hash, owner_user_id, os_name, tool_versions, capability_manifest, cache_cap_bytes, lane
  )
  values (
    p_label, v_hash, auth.uid(), p_os, coalesce(p_tool_versions, '{}'::jsonb),
    coalesce(p_manifest, '{}'::jsonb), coalesce(p_cache_cap, 21474836480), v_lane
  )
  on conflict (secret_hash) do update
    set owner_user_id = auth.uid(),
        os_name = excluded.os_name,
        tool_versions = excluded.tool_versions,
        capability_manifest = excluded.capability_manifest,
        cache_cap_bytes = excluded.cache_cap_bytes,
        label = excluded.label,
        lane = excluded.lane
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'label', p_label, 'lane', v_lane);
end $$;

drop function if exists public.list_edit_workers();
create function public.list_edit_workers()
returns table (
  id uuid,
  label text,
  os_name text,
  tool_versions jsonb,
  capability_manifest jsonb,
  cache_bytes bigint,
  cache_cap_bytes bigint,
  cache_reported_at timestamptz,
  last_seen_at timestamptz,
  lane text
)
language sql
security definer
set search_path = public
as $$
  select w.id, w.label, w.os_name, w.tool_versions, w.capability_manifest,
         w.cache_bytes, w.cache_cap_bytes, w.cache_reported_at, w.last_seen_at, w.lane
    from public.edit_render_workers w
   where w.owner_user_id = auth.uid()
     and w.revoked_at is null;
$$;

revoke all on function public.claim_gpu_job(text, text) from public, anon, authenticated;
grant execute on function public.claim_gpu_job(text, text) to service_role;
revoke all on function public.register_edit_worker(text, text, text, jsonb, jsonb, bigint) from public, anon;
revoke all on function public.list_edit_workers() from public, anon;
grant execute on function public.register_edit_worker(text, text, text, jsonb, jsonb, bigint) to authenticated;
grant execute on function public.list_edit_workers() to authenticated;
