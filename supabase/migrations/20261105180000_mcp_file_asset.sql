-- Follow-up to 20261105140000_mcp_upload_events.sql, which is already applied.
--
-- 1. record_mcp_upload rejects a path that contains '%' anywhere. The previous check
--    `p_path like '%\%'` matches a backslash under standard_conforming_strings, not a percent sign.
-- 2. mode 'delete' is allowed, for avt_delete_object. bytes and sha256 stay null.
-- 3. file_mcp_asset inserts one project_assets row, demotes the current primary on that shot and
--    variation, and inserts or upserts the new primary. It runs as the caller (security invoker),
--    so the owner's row level security is the scope. No service role.
--
-- Apply in the Lovable SQL editor on project qoyxgnkvjukovkrvdaiq, then redeploy avt-mcp.

alter table public.mcp_upload_events drop constraint if exists mcp_upload_events_tool_check;
alter table public.mcp_upload_events
  add constraint mcp_upload_events_tool_check
  check (tool in ('avt_upload_asset', 'avt_delete_object'));

alter table public.mcp_upload_events drop constraint if exists mcp_upload_events_mode_check;
alter table public.mcp_upload_events
  add constraint mcp_upload_events_mode_check
  check (mode in ('signed_url', 'base64', 'finalize', 'delete'));

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
  if p_mode not in ('signed_url', 'base64', 'finalize', 'delete') then
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
  if p_mode in ('signed_url', 'delete') then
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
end;
$$;

revoke all on function public.record_mcp_upload(uuid, text, text, bigint, text, text) from public, anon;
grant execute on function public.record_mcp_upload(uuid, text, text, bigint, text, text) to authenticated;

create or replace function public.file_mcp_asset(
  p_project_id uuid,
  p_shot_id uuid,
  p_variation_id uuid,
  p_asset_type text,
  p_file_url text,
  p_source_tool text,
  p_approval_status text,
  p_footage_role text,
  p_parent_asset_id uuid,
  p_version_number int,
  p_metadata_json jsonb,
  p_notes text,
  p_role text,
  p_source_in_seconds double precision,
  p_source_out_seconds double precision,
  p_sort_order int,
  p_slip_seconds double precision,
  p_assignment_notes text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project uuid;
  v_variation uuid;
  v_asset uuid;
  v_assignment uuid;
  v_sort int;
  v_demoted uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_file_url is null
     or split_part(p_file_url, '/', 1) is distinct from auth.uid()::text
     or position('/' in p_file_url) = 0
     or position('..' in p_file_url) > 0
     or position('%' in p_file_url) > 0
     or position(chr(92) in p_file_url) > 0
     or p_file_url like '/%'
  then
    raise exception 'file_url must start with the owner id';
  end if;
  if p_asset_type is null or not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'project_asset_type' and e.enumlabel = p_asset_type
  ) then
    raise exception 'bad asset_type';
  end if;
  if p_source_tool is null or not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'provider_name' and e.enumlabel = p_source_tool
  ) then
    raise exception 'bad source_tool';
  end if;
  if p_approval_status is null or not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'approval_status' and e.enumlabel = p_approval_status
  ) then
    raise exception 'bad approval_status';
  end if;
  if p_footage_role not in ('performance', 'b_roll', 'reference') then
    raise exception 'bad footage_role';
  end if;
  if p_role not in ('performance', 'b_roll', 'generated_image', 'generated_clip', 'reference') then
    raise exception 'bad role';
  end if;
  if p_slip_seconds is null or p_slip_seconds < -30 or p_slip_seconds > 30 then
    raise exception 'bad slip_seconds';
  end if;
  if p_metadata_json is null or jsonb_typeof(p_metadata_json) <> 'object' then
    raise exception 'metadata_json must be an object';
  end if;

  select s.project_id, s.variation_id into v_project, v_variation
  from public.shots s
  where s.id = p_shot_id;
  if v_project is null then
    raise exception 'shot not found';
  end if;
  if v_project is distinct from p_project_id then
    raise exception 'shot is not in that project';
  end if;
  if v_variation is distinct from p_variation_id then
    raise exception 'shot is not on that variation';
  end if;

  insert into public.project_assets (
    user_id, project_id, shot_id, asset_type, file_url, source_tool, approval_status,
    version_number, parent_asset_id, footage_role, metadata_json, notes
  ) values (
    auth.uid(), p_project_id, p_shot_id, p_asset_type::public.project_asset_type, p_file_url,
    p_source_tool::public.provider_name, p_approval_status::public.approval_status,
    coalesce(p_version_number, 1), p_parent_asset_id, p_footage_role,
    p_metadata_json, p_notes
  )
  returning id into v_asset;

  with demoted as (
    update public.shot_asset_assignments
    set is_primary = false, updated_at = now()
    where shot_id = p_shot_id
      and variation_id = p_variation_id
      and is_primary
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_demoted from demoted;

  if p_sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.shot_asset_assignments
    where shot_id = p_shot_id and variation_id = p_variation_id;
  else
    v_sort := p_sort_order;
  end if;

  insert into public.shot_asset_assignments (
    user_id, project_id, variation_id, shot_id, asset_id, role, is_primary, sort_order,
    source_in_seconds, source_out_seconds, slip_seconds, notes, excluded
  ) values (
    auth.uid(), p_project_id, p_variation_id, p_shot_id, v_asset, p_role, true, v_sort,
    p_source_in_seconds, p_source_out_seconds, p_slip_seconds, p_assignment_notes, false
  )
  on conflict (shot_id, asset_id, role) do update
  set is_primary = true,
      excluded = false,
      variation_id = excluded.variation_id,
      sort_order = excluded.sort_order,
      source_in_seconds = excluded.source_in_seconds,
      source_out_seconds = excluded.source_out_seconds,
      slip_seconds = excluded.slip_seconds,
      notes = coalesce(excluded.notes, public.shot_asset_assignments.notes),
      updated_at = now()
  returning id into v_assignment;

  return jsonb_build_object(
    'asset_id', v_asset,
    'assignment_id', v_assignment,
    'demoted_ids', to_jsonb(v_demoted)
  );
end;
$$;

revoke all on function public.file_mcp_asset(uuid, uuid, uuid, text, text, text, text, text, uuid, int, jsonb, text, text, double precision, double precision, int, double precision, text) from public, anon;
grant execute on function public.file_mcp_asset(uuid, uuid, uuid, text, text, text, text, text, uuid, int, jsonb, text, text, double precision, double precision, int, double precision, text) to authenticated;

comment on function public.file_mcp_asset(uuid, uuid, uuid, text, text, text, text, text, uuid, int, jsonb, text, text, double precision, double precision, int, double precision, text) is
  'Insert a project_assets row and make it the primary assignment on one shot and variation. Runs as the caller. Demoted primaries stay as rows with is_primary false.';
