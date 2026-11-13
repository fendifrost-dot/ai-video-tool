-- Asset store extensions: first-class media metadata, skill/effect catalog, licenses,
-- validations, and the existing edit_renders job widened for VFX/QC/Blender.
--
-- Apply in the Lovable SQL editor on project qoyxgnkvjukovkrvdaiq.
-- Do not run this with the Supabase CLI. Idempotent.
--
-- Nothing here deletes a camera original, a T7 file, or a locked asset.
-- This file does not write the storage schema. Lovable sets bucket and project
-- file-size limits itself. Each of these buckets, and the project-wide upload cap,
-- must be 4294967296 bytes (4 GiB): project-exports, project-clips,
-- project-references, project-audio. A lower cap still returns HTTP 413.

-- ------------------------------------------------------------------------------------------------ assets

alter table public.project_assets add column if not exists fps double precision;
alter table public.project_assets add column if not exists sar text not null default '1:1';
alter table public.project_assets add column if not exists width integer;
alter table public.project_assets add column if not exists height integer;
alter table public.project_assets add column if not exists frame_count integer;
alter table public.project_assets add column if not exists duration_seconds double precision;
alter table public.project_assets add column if not exists codec text;
alter table public.project_assets add column if not exists sha256 text;
alter table public.project_assets add column if not exists size_bytes bigint;
alter table public.project_assets add column if not exists source_take_asset_id uuid references public.project_assets (id) on delete set null;
alter table public.project_assets add column if not exists song_zero_offset_seconds double precision;
alter table public.project_assets add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table public.project_assets add column if not exists tags text[] not null default '{}';
alter table public.project_assets add column if not exists origin text not null default 'generated';
alter table public.project_assets add column if not exists license_id uuid;

alter table public.project_assets drop constraint if exists project_assets_tags_check;
alter table public.project_assets add constraint project_assets_tags_check
  check (tags <@ array['locked', 'superseded', 'review', 'approved']::text[]);

alter table public.project_assets drop constraint if exists project_assets_origin_check;
alter table public.project_assets add constraint project_assets_origin_check
  check (origin in ('generated', 'camera', 'element', 'stock', 'edit'));

alter table public.project_assets drop constraint if exists project_assets_sha256_check;
alter table public.project_assets add constraint project_assets_sha256_check
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

alter table public.project_assets drop constraint if exists project_assets_size_bytes_check;
alter table public.project_assets add constraint project_assets_size_bytes_check
  check (size_bytes is null or size_bytes >= 0);

alter table public.project_assets drop constraint if exists project_assets_sar_check;
alter table public.project_assets add constraint project_assets_sar_check
  check (sar ~ '^[0-9]+:[0-9]+$');

create index if not exists project_assets_shot_idx on public.project_assets (project_id, shot_id);
create index if not exists project_assets_tags_idx on public.project_assets using gin (tags);
create index if not exists project_assets_format_idx
  on public.project_assets (project_id, (metadata_json->>'format'));

-- ------------------------------------------------------------------------------------------------ licenses

create table if not exists public.asset_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source text not null,
  license_type text not null,
  terms text not null default '',
  granted_at date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_assets drop constraint if exists project_assets_license_id_fkey;
alter table public.project_assets
  add constraint project_assets_license_id_fkey
  foreign key (license_id) references public.asset_licenses (id) on delete restrict;

alter table public.asset_licenses enable row level security;
drop policy if exists asset_licenses_owner on public.asset_licenses;
create policy asset_licenses_owner on public.asset_licenses
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update, delete on public.asset_licenses to authenticated, service_role;

create or replace function public.guard_element_license()
returns trigger
language plpgsql
as $$
begin
  if new.origin in ('element', 'stock') and new.license_id is null then
    raise exception 'a license is required for stock and element assets';
  end if;
  return new;
end $$;

drop trigger if exists project_assets_element_license on public.project_assets;
create trigger project_assets_element_license
  before insert or update on public.project_assets
  for each row execute function public.guard_element_license();

create or replace function public.guard_locked_asset_delete()
returns trigger
language plpgsql
as $$
begin
  if 'locked' = any (old.tags) then
    raise exception 'locked asset cannot be deleted';
  end if;
  return old;
end $$;

drop trigger if exists project_assets_locked_delete on public.project_assets;
create trigger project_assets_locked_delete
  before delete on public.project_assets
  for each row execute function public.guard_locked_asset_delete();

-- Object deletes are also refused for a locked asset. This is a restrictive
-- policy only: no function and no trigger on the storage schema. Permissive
-- owner policies stay. service_role bypasses RLS; avt_delete_object checks the
-- tag before it calls storage remove.
drop policy if exists locked_objects_no_delete on storage.objects;
create policy locked_objects_no_delete
  on storage.objects
  as restrictive
  for delete
  to authenticated
  using (
    not exists (
      select 1
      from public.project_assets a
      where a.file_url = storage.objects.name
        and 'locked' = any (a.tags)
        and (
          a.metadata_json->>'bucket' is null
          or a.metadata_json->>'bucket' = storage.objects.bucket_id
        )
    )
  );

-- ------------------------------------------------------------------------------------------------ skills

create table if not exists public.production_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.production_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.production_skills (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  instructions text not null,
  supported_tools jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  changelog text not null default '',
  preview_asset_id uuid references public.project_assets (id) on delete set null,
  test_result_asset_id uuid references public.project_assets (id) on delete set null,
  is_current boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (skill_id, version_number)
);

create unique index if not exists production_skill_versions_one_current
  on public.production_skill_versions (skill_id)
  where is_current;

create table if not exists public.project_skill_pins (
  project_id uuid not null references public.video_projects (id) on delete cascade,
  skill_id uuid not null references public.production_skills (id) on delete cascade,
  skill_version_id uuid not null references public.production_skill_versions (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (project_id, skill_id)
);

create or replace function public.guard_published_skill_version()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' then
    if new.instructions is distinct from old.instructions
       or new.supported_tools is distinct from old.supported_tools
       or new.dependencies is distinct from old.dependencies
       or new.examples is distinct from old.examples
       or new.changelog is distinct from old.changelog
       or new.preview_asset_id is distinct from old.preview_asset_id
       or new.test_result_asset_id is distinct from old.test_result_asset_id
       or new.version_number is distinct from old.version_number
       or new.skill_id is distinct from old.skill_id
       or new.user_id is distinct from old.user_id
    then
      raise exception 'published skill versions are immutable';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists production_skill_versions_immutable on public.production_skill_versions;
create trigger production_skill_versions_immutable
  before update on public.production_skill_versions
  for each row execute function public.guard_published_skill_version();

drop trigger if exists production_skills_updated_at on public.production_skills;
create trigger production_skills_updated_at before update on public.production_skills
  for each row execute function public.tg_set_updated_at();
drop trigger if exists production_skill_versions_updated_at on public.production_skill_versions;
create trigger production_skill_versions_updated_at before update on public.production_skill_versions
  for each row execute function public.tg_set_updated_at();

alter table public.production_skills enable row level security;
alter table public.production_skill_versions enable row level security;
alter table public.project_skill_pins enable row level security;

drop policy if exists production_skills_owner on public.production_skills;
create policy production_skills_owner on public.production_skills
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists production_skill_versions_owner on public.production_skill_versions;
create policy production_skill_versions_owner on public.production_skill_versions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists project_skill_pins_owner on public.project_skill_pins;
create policy project_skill_pins_owner on public.project_skill_pins
  for all to authenticated
  using (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  );

grant select, insert, update, delete on public.production_skills to authenticated, service_role;
grant select, insert, update, delete on public.production_skill_versions to authenticated, service_role;
grant select, insert, update, delete on public.project_skill_pins to authenticated, service_role;

-- ------------------------------------------------------------------------------------------------ effects

create table if not exists public.effect_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  version_number integer not null check (version_number >= 1),
  parent_id uuid references public.effect_presets (id) on delete set null,
  skill_version_id uuid not null references public.production_skill_versions (id),
  code_ref text not null,
  params_schema jsonb not null,
  params_defaults jsonb not null default '{}'::jsonb,
  preview_asset_id uuid references public.project_assets (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_current boolean not null default false,
  changelog text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug, version_number)
);

create unique index if not exists effect_presets_one_current
  on public.effect_presets (user_id, slug)
  where is_current;

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
    then
      raise exception 'published effect versions are immutable';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists effect_presets_immutable on public.effect_presets;
create trigger effect_presets_immutable
  before update on public.effect_presets
  for each row execute function public.guard_published_effect();
drop trigger if exists effect_presets_updated_at on public.effect_presets;
create trigger effect_presets_updated_at before update on public.effect_presets
  for each row execute function public.tg_set_updated_at();

alter table public.effect_presets enable row level security;
drop policy if exists effect_presets_owner on public.effect_presets;
create policy effect_presets_owner on public.effect_presets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.effect_presets to authenticated, service_role;

-- ------------------------------------------------------------------------------------------------ validations

create table if not exists public.skill_validations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_version_id uuid not null references public.production_skill_versions (id) on delete cascade,
  effect_preset_id uuid references public.effect_presets (id) on delete set null,
  worker_label text not null,
  os_name text not null,
  tool_versions jsonb not null default '{}'::jsonb,
  input_asset_ids uuid[] not null default '{}',
  result text not null check (result in ('pass', 'fail')),
  qc_asset_id uuid references public.project_assets (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists skill_validations_version_idx
  on public.skill_validations (skill_version_id, created_at desc);

alter table public.skill_validations enable row level security;
drop policy if exists skill_validations_owner on public.skill_validations;
create policy skill_validations_owner on public.skill_validations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.skill_validations to authenticated, service_role;

create or replace function public.publish_skill_version(p_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.production_skill_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v from public.production_skill_versions
   where id = p_version_id and user_id = auth.uid();
  if not found then
    raise exception 'version not found';
  end if;
  if v.status = 'published' and v.is_current then
    return jsonb_build_object('id', v.id, 'already', true, 'is_current', true);
  end if;
  if not exists (
    select 1 from public.skill_validations s
    where s.skill_version_id = p_version_id
      and s.user_id = auth.uid()
      and s.result = 'pass'
      and s.effect_preset_id is null
  ) then
    raise exception 'publish requires a passing validation';
  end if;
  update public.production_skill_versions
     set is_current = false
   where skill_id = v.skill_id and user_id = auth.uid() and is_current and id <> p_version_id;
  update public.production_skill_versions
     set status = 'published',
         is_current = true,
         published_at = coalesce(published_at, now())
   where id = p_version_id and user_id = auth.uid();
  return jsonb_build_object('id', p_version_id, 'is_current', true, 'already', false);
end $$;

create or replace function public.publish_effect_preset(p_preset_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.effect_presets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v from public.effect_presets where id = p_preset_id and user_id = auth.uid();
  if not found then
    raise exception 'effect not found';
  end if;
  if v.status = 'published' and v.is_current then
    return jsonb_build_object('id', v.id, 'already', true, 'is_current', true);
  end if;
  if not exists (
    select 1 from public.skill_validations s
    where s.effect_preset_id = p_preset_id and s.user_id = auth.uid() and s.result = 'pass'
  ) then
    raise exception 'publish requires a passing validation';
  end if;
  update public.effect_presets
     set is_current = false
   where user_id = auth.uid() and slug = v.slug and is_current and id <> p_preset_id;
  update public.effect_presets
     set status = 'published', is_current = true
   where id = p_preset_id and user_id = auth.uid();
  return jsonb_build_object('id', p_preset_id, 'is_current', true, 'already', false);
end $$;

revoke all on function public.publish_skill_version(uuid) from public, anon;
revoke all on function public.publish_effect_preset(uuid) from public, anon;
grant execute on function public.publish_skill_version(uuid) to authenticated;
grant execute on function public.publish_effect_preset(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------ edit lock + jobs

alter table public.edit_sequences add column if not exists locked boolean not null default false;

alter table public.edit_clips add column if not exists asset_version integer;
alter table public.edit_clips add column if not exists song_zero_offset_seconds double precision;
alter table public.edit_clips add column if not exists timeline_in_frame integer;
alter table public.edit_clips add column if not exists timeline_out_frame integer;
alter table public.edit_clips add column if not exists layer_stack jsonb not null default '[]'::jsonb;
alter table public.edit_clips add column if not exists grade jsonb not null default '{}'::jsonb;
alter table public.edit_clips add column if not exists locked boolean not null default false;
-- Existing cuts may already use speed. The flag defaults to allowing that.
-- A new performance entry sets it false so source in/out stays unmapped.
alter table public.edit_clips add column if not exists time_remap_allowed boolean not null default true;

alter table public.edit_renders add column if not exists job_kind text not null default 'edit';
alter table public.edit_renders drop constraint if exists edit_renders_job_kind_check;
alter table public.edit_renders add constraint edit_renders_job_kind_check
  check (job_kind in ('edit', 'vfx', 'qc', 'blender', 'beat_cut'));

alter table public.edit_renders alter column sequence_id drop not null;
alter table public.edit_renders drop constraint if exists edit_renders_edit_needs_sequence;
alter table public.edit_renders add constraint edit_renders_edit_needs_sequence
  check (job_kind <> 'edit' or sequence_id is not null);

alter table public.edit_renders drop constraint if exists edit_renders_kind_check;
alter table public.edit_renders add constraint edit_renders_kind_check
  check (kind in ('proxy', 'final', 'job'));

alter table public.edit_renders drop constraint if exists edit_renders_status_check;
alter table public.edit_renders add constraint edit_renders_status_check
  check (status in ('planned', 'queued', 'rendering', 'complete', 'failed', 'cancelled'));

alter table public.edit_renders add column if not exists skill_version_id uuid references public.production_skill_versions (id) on delete set null;
alter table public.edit_renders add column if not exists effect_preset_id uuid references public.effect_presets (id) on delete set null;
alter table public.edit_renders add column if not exists assigned_worker text;
alter table public.edit_renders add column if not exists progress double precision not null default 0;
alter table public.edit_renders drop constraint if exists edit_renders_progress_check;
alter table public.edit_renders add constraint edit_renders_progress_check
  check (progress >= 0 and progress <= 1);
alter table public.edit_renders add column if not exists log_asset_id uuid references public.project_assets (id) on delete set null;
alter table public.edit_renders add column if not exists log_text text not null default '';
alter table public.edit_renders add column if not exists input_asset_ids uuid[] not null default '{}';
alter table public.edit_renders add column if not exists output_asset_ids uuid[] not null default '{}';
alter table public.edit_renders add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.edit_renders add column if not exists project_id uuid references public.video_projects (id) on delete cascade;

-- Worker registration stays off the generic table API: secret_hash is never selected by a client.
alter table public.edit_render_workers add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.edit_render_workers add column if not exists os_name text;
alter table public.edit_render_workers add column if not exists tool_versions jsonb not null default '{}'::jsonb;
alter table public.edit_render_workers add column if not exists capability_manifest jsonb not null default '{}'::jsonb;
alter table public.edit_render_workers add column if not exists cache_bytes bigint not null default 0;
alter table public.edit_render_workers add column if not exists cache_cap_bytes bigint not null default 21474836480;
alter table public.edit_render_workers add column if not exists cache_reported_at timestamptz;
alter table public.edit_render_workers add column if not exists cache_report jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------------------------------------------ write audit

create table if not exists public.mcp_write_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  credential_id uuid not null references public.batch_credentials (id) on delete cascade,
  tool text not null,
  action text not null,
  subject_table text not null,
  subject_id uuid,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mcp_write_events_owner_idx
  on public.mcp_write_events (owner_user_id, created_at desc);

comment on table public.mcp_write_events is
  'Append-only audit of avt-mcp catalog and asset writes. Written only by record_mcp_write. Cost is $0.';

revoke all on public.mcp_write_events from public, anon, authenticated;
grant select on public.mcp_write_events to authenticated;
grant all on public.mcp_write_events to service_role;

alter table public.mcp_write_events enable row level security;
drop policy if exists "Owners read own mcp_write_events" on public.mcp_write_events;
create policy "Owners read own mcp_write_events"
  on public.mcp_write_events for select
  using (owner_user_id = auth.uid());

create or replace function public.record_mcp_write(
  p_credential_id uuid,
  p_tool text,
  p_action text,
  p_subject_table text,
  p_subject_id uuid,
  p_summary jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_credential_id is null or not exists (
    select 1 from public.batch_credentials
    where id = p_credential_id and owner_user_id = auth.uid() and revoked_at is null
  ) then
    raise exception 'credential is not yours';
  end if;
  if p_tool is null or p_action is null or p_subject_table is null then
    raise exception 'tool, action and subject_table are required';
  end if;
  if p_tool !~ '^avt_[a-z0-9_]+$' then
    raise exception 'tool name is not an avt tool';
  end if;
  insert into public.mcp_write_events (owner_user_id, credential_id, tool, action, subject_table, subject_id, summary)
  values (auth.uid(), p_credential_id, p_tool, p_action, p_subject_table, p_subject_id, coalesce(p_summary, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.record_mcp_write(uuid, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.record_mcp_write(uuid, text, text, text, uuid, jsonb) to authenticated;

-- tus and verify are modes of avt_upload_asset. verify records the remote hash.
-- The tool never deletes. clear_scratch is a flag for the caller, not a server delete.

alter table public.mcp_upload_events drop constraint if exists mcp_upload_events_mode_check;
alter table public.mcp_upload_events
  add constraint mcp_upload_events_mode_check
  check (mode in ('signed_url', 'base64', 'finalize', 'delete', 'tus', 'verify'));

create or replace function public.record_mcp_upload(
  p_credential_id uuid,
  p_bucket text,
  p_path text,
  p_bytes bigint,
  p_sha256 text,
  p_mode text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_mode not in ('signed_url', 'base64', 'finalize', 'delete', 'tus', 'verify') then
    raise exception 'bad mode';
  end if;
  if p_bucket not in ('project-exports', 'project-clips', 'project-references', 'project-audio') then
    raise exception 'bucket is not allowed';
  end if;
  if p_credential_id is null or not exists (
    select 1 from public.batch_credentials
    where id = p_credential_id and owner_user_id = auth.uid() and revoked_at is null
  ) then
    raise exception 'credential is not yours';
  end if;
  if p_path is null
     or split_part(p_path, '/', 1) is distinct from auth.uid()::text
     or position('/' in p_path) = 0
     or position('..' in p_path) > 0
     or position('%' in p_path) > 0
     or position(chr(92) in p_path) > 0
     or p_path like '/%'
     or p_path like '% %'
  then
    raise exception 'path must start with the owner id';
  end if;
  if p_mode in ('signed_url', 'delete', 'tus') then
    if p_bytes is not null or p_sha256 is not null then
      raise exception 'this mode has no bytes';
    end if;
  else
    if p_bytes is null or p_bytes <= 0 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'bytes and sha256 are required';
    end if;
  end if;

  insert into public.mcp_upload_events (owner_user_id, credential_id, tool, bucket, path, bytes, sha256, mode)
  values (
    auth.uid(),
    p_credential_id,
    case when p_mode = 'delete' then 'avt_delete_object' else 'avt_upload_asset' end,
    p_bucket,
    p_path,
    p_bytes,
    p_sha256,
    p_mode
  )
  returning id into new_id;
  return new_id;
end $$;
