-- Ledger for avt_upload_asset. One row per call: which credential, which object, how many bytes, which sha256.
--
-- The owner's session can already insert into Storage under <user id>/… (storage RLS). This table is only the
-- audit. authenticated may SELECT its own rows and may not INSERT them. The only writer is record_mcp_upload,
-- which stamps owner_user_id from auth.uid() and refuses a path outside that id. avt-mcp calls it with the
-- owner's JWT. It does not use the service role.
--
-- Apply this in the Lovable SQL editor on project qoyxgnkvjukovkrvdaiq before relying on audit_id.
-- Idempotent: safe to re-run.

create table if not exists public.mcp_upload_events (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  credential_id  uuid not null references public.batch_credentials(id) on delete cascade,
  tool           text not null default 'avt_upload_asset',
  bucket         text not null,
  path           text not null,
  bytes          bigint,
  sha256         text,
  mode           text not null,
  created_at     timestamptz not null default now(),
  constraint mcp_upload_events_tool_check check (tool = 'avt_upload_asset'),
  constraint mcp_upload_events_mode_check check (mode in ('signed_url', 'base64', 'finalize')),
  constraint mcp_upload_events_bucket_check check (bucket in ('project-exports', 'project-clips', 'project-references', 'project-audio')),
  constraint mcp_upload_events_bytes_check check (bytes is null or bytes > 0),
  constraint mcp_upload_events_sha256_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists mcp_upload_events_owner_idx
  on public.mcp_upload_events (owner_user_id, created_at desc);

comment on table public.mcp_upload_events is
  'One row per avt_upload_asset call. Written only by record_mcp_upload. Cost is always $0; the tool does not call a provider.';

revoke all on public.mcp_upload_events from public, anon, authenticated;
grant select on public.mcp_upload_events to authenticated;
grant all on public.mcp_upload_events to service_role;

alter table public.mcp_upload_events enable row level security;
drop policy if exists "Owners read own mcp_upload_events" on public.mcp_upload_events;
create policy "Owners read own mcp_upload_events"
  on public.mcp_upload_events for select
  using (owner_user_id = auth.uid());

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
  if p_mode not in ('signed_url', 'base64', 'finalize') then
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
     or p_path like '%..%'
     or p_path like '/%'
     or p_path like '%\%'
     or p_path like '% %'
  then
    raise exception 'path must start with the owner id';
  end if;
  if p_mode = 'signed_url' then
    if p_bytes is not null or p_sha256 is not null then
      raise exception 'signed_url has no bytes yet';
    end if;
  else
    if p_bytes is null or p_bytes <= 0 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'bytes and sha256 are required';
    end if;
  end if;

  insert into public.mcp_upload_events (owner_user_id, credential_id, tool, bucket, path, bytes, sha256, mode)
  values (auth.uid(), p_credential_id, 'avt_upload_asset', p_bucket, p_path, p_bytes, p_sha256, p_mode)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.record_mcp_upload(uuid, text, text, bigint, text, text) from public, anon;
grant execute on function public.record_mcp_upload(uuid, text, text, bigint, text, text) to authenticated;

comment on function public.record_mcp_upload(uuid, text, text, bigint, text, text) is
  'Append one avt_upload_asset audit row for auth.uid(). The path must start with that id. Direct inserts into mcp_upload_events are not granted.';
