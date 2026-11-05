-- Holds 20261105140000_mcp_upload_events.sql. Runs with every migration applied (scripts/db/throwaway.sh).
-- The owner can read the ledger and can ask record_mcp_upload to append a row. Nobody inserts directly,
-- and a path or credential that is not theirs is refused.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b2');

insert into public.batch_credentials (id, owner_user_id, secret_sha256, label)
values ('b1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', repeat('a', 64), 'mcp upload'),
       ('b1000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', repeat('b', 64), 'other');

-- the owner records a base64 upload and a signed-url grant
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

select public.record_mcp_upload(
  'b1000000-0000-0000-0000-0000000000a1',
  'project-exports',
  '00000000-0000-0000-0000-0000000000a1/_mcp_upload_test/hello.bin',
  5,
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  'base64'
);

select public.record_mcp_upload(
  'b1000000-0000-0000-0000-0000000000a1',
  'project-exports',
  '00000000-0000-0000-0000-0000000000a1/_mcp_upload_test/hello.bin',
  null,
  null,
  'signed_url'
);

do $$
declare n int;
begin
  select count(*) into n from public.mcp_upload_events;
  if n <> 2 then raise exception 'owner should see 2 audit rows, saw %', n; end if;
end $$;

-- another owner sees nothing
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b2';
do $$
declare n int;
begin
  select count(*) into n from public.mcp_upload_events;
  if n <> 0 then raise exception 'the other owner can see % audit row(s)', n; end if;
end $$;

-- back to the owner: the refusals
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';

do $$
begin
  perform public.record_mcp_upload(
    'b1000000-0000-0000-0000-0000000000a1', 'project-exports',
    '00000000-0000-0000-0000-0000000000b2/hello.bin', 5,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', 'base64');
  raise exception 'another user''s prefix was accepted';
exception when others then
  if sqlerrm not like '%owner id%' then raise; end if;
end $$;

do $$
begin
  perform public.record_mcp_upload(
    'b1000000-0000-0000-0000-0000000000a1', 'project-exports',
    '00000000-0000-0000-0000-0000000000a1/../00000000-0000-0000-0000-0000000000b2/hello.bin', 5,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', 'base64');
  raise exception 'a .. path was accepted';
exception when others then
  if sqlerrm not like '%owner id%' then raise; end if;
end $$;

do $$
begin
  perform public.record_mcp_upload(
    'b1000000-0000-0000-0000-0000000000b2', 'project-exports',
    '00000000-0000-0000-0000-0000000000a1/hello.bin', 5,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', 'base64');
  raise exception 'someone else''s credential was accepted';
exception when others then
  if sqlerrm not like '%credential%' then raise; end if;
end $$;

do $$
begin
  perform public.record_mcp_upload(
    'b1000000-0000-0000-0000-0000000000a1', 'artist-assets',
    '00000000-0000-0000-0000-0000000000a1/hello.bin', null, null, 'signed_url');
  raise exception 'artist-assets was accepted';
exception when others then
  if sqlerrm not like '%bucket%' then raise; end if;
end $$;

do $$
begin
  insert into public.mcp_upload_events (owner_user_id, credential_id, bucket, path, mode)
  values ('00000000-0000-0000-0000-0000000000a1', 'b1000000-0000-0000-0000-0000000000a1',
          'project-exports', '00000000-0000-0000-0000-0000000000a1/x', 'base64');
  raise exception 'a direct insert was accepted';
exception when insufficient_privilege then null;
end $$;

-- anon cannot call it
set local role anon;
do $$
begin
  perform public.record_mcp_upload(
    'b1000000-0000-0000-0000-0000000000a1', 'project-exports',
    '00000000-0000-0000-0000-0000000000a1/hello.bin', null, null, 'signed_url');
  raise exception 'anon was allowed to write the ledger';
exception when insufficient_privilege then null;
end $$;

rollback;

\echo 'mcp_upload_events: all assertions hold'
