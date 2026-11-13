-- Worker registration and cache reports for the edit-render box.
-- Apply in the Lovable SQL editor on qoyxgnkvjukovkrvdaiq after
-- 20261113120000_asset_store_extensions.sql. The secret is stored as a hash.
-- Cache reports never delete a protected object. This file deletes nothing.

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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_label is null or p_secret is null or length(p_secret) < 32 then
    raise exception 'label and a 32 character secret are required';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex');
  insert into public.edit_render_workers (label, secret_hash, owner_user_id, os_name, tool_versions, capability_manifest, cache_cap_bytes)
  values (p_label, v_hash, auth.uid(), p_os, coalesce(p_tool_versions, '{}'::jsonb), coalesce(p_manifest, '{}'::jsonb), coalesce(p_cache_cap, 21474836480))
  on conflict (secret_hash) do update
    set owner_user_id = auth.uid(),
        os_name = excluded.os_name,
        tool_versions = excluded.tool_versions,
        capability_manifest = excluded.capability_manifest,
        cache_cap_bytes = excluded.cache_cap_bytes,
        label = excluded.label
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'label', p_label);
end $$;

create or replace function public.list_edit_workers()
returns table (
  id uuid,
  label text,
  os_name text,
  tool_versions jsonb,
  capability_manifest jsonb,
  cache_bytes bigint,
  cache_cap_bytes bigint,
  cache_reported_at timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select w.id, w.label, w.os_name, w.tool_versions, w.capability_manifest,
         w.cache_bytes, w.cache_cap_bytes, w.cache_reported_at, w.last_seen_at
    from public.edit_render_workers w
   where w.owner_user_id = auth.uid()
     and w.revoked_at is null;
$$;

create or replace function public.report_worker_cache(
  p_worker_id uuid,
  p_cache_bytes bigint,
  p_cache_cap bigint,
  p_report jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.edit_render_workers
    where id = p_worker_id and owner_user_id = auth.uid() and revoked_at is null
  ) then
    raise exception 'worker not found';
  end if;
  if p_report ? 'evict' then
    for entry in select * from jsonb_array_elements(p_report->'evict') loop
      if coalesce(entry->>'class', 'disposable') is distinct from 'disposable' then
        raise exception 'protected cache entries are not evicted';
      end if;
      if coalesce(entry->>'verified', 'true') = 'false' then
        raise exception 'unverified cache entries are not evicted';
      end if;
    end loop;
  end if;
  update public.edit_render_workers
     set cache_bytes = greatest(p_cache_bytes, 0),
         cache_cap_bytes = greatest(p_cache_cap, 1),
         cache_reported_at = now(),
         cache_report = p_report
   where id = p_worker_id;
  return jsonb_build_object('id', p_worker_id, 'deletes_remote', false);
end $$;

revoke all on function public.register_edit_worker(text, text, text, jsonb, jsonb, bigint) from public, anon;
revoke all on function public.list_edit_workers() from public, anon;
revoke all on function public.report_worker_cache(uuid, bigint, bigint, jsonb) from public, anon;
grant execute on function public.register_edit_worker(text, text, text, jsonb, jsonb, bigint) to authenticated;
grant execute on function public.list_edit_workers() to authenticated;
grant execute on function public.report_worker_cache(uuid, bigint, bigint, jsonb) to authenticated;
