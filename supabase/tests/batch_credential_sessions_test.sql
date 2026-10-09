-- Holds 20261009090000_batch_credential_sessions.sql. Runs with every migration applied (scripts/db/throwaway.sh).
--
-- This table holds a LIVE REFRESH TOKEN, so the assertions here are the security ones. The reuse behaviour
-- itself is decided in TypeScript (planSession) and tested there; what Postgres has to guarantee is that the
-- row is unreachable, singular, and dies with the credential.
\set ON_ERROR_STOP on
begin;

-- the local auth.users stub (scripts/db/stubs.sql) carries only `id`; the owner's email is resolved by the
-- edge function from auth.admin.getUserById, not from this table, so nothing here needs it
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b2');

insert into public.batch_credentials (id, owner_user_id, secret_sha256, label)
values ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
        repeat('a', 64), 'mcp connector');

insert into public.batch_credential_sessions (credential_id, owner_user_id, access_token, refresh_token, expires_at)
values ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
        'access-token', 'refresh-token', now() + interval '1 hour');

-- ── 1. nobody but service_role can read a refresh token ─────────────────────
-- Not even the owner. An owner has no use for their own raw refresh token, and a compromised browser session
-- must not be able to lift one — which is why this table has NO policy, unlike batch_credentials.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'batch_credential_sessions';
  if n <> 0 then raise exception 'batch_credential_sessions has % RLS policy/policies — it must have none', n; end if;

  if not (select relrowsecurity from pg_class where oid = 'public.batch_credential_sessions'::regclass) then
    raise exception 'row level security is not enabled: with no policy and no RLS, everything is readable';
  end if;
end $$;

-- and no grant to the API roles, so it is not merely policy-less but ungranted
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'batch_credential_sessions'
     and grantee in ('anon', 'authenticated');
  if n <> 0 then raise exception 'anon/authenticated hold % grant(s) on the session store', n; end if;
end $$;

-- the owner, acting as `authenticated`, reads nothing
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
do $$
begin
  begin
    perform 1 from public.batch_credential_sessions;
    raise exception 'authenticated could query the session store';
  exception
    when insufficient_privilege then null;   -- no grant: the intended outcome
  end;
end $$;
reset role;

-- ── 2. one live session per credential ──────────────────────────────────────
-- A second concurrent session would be a second thing to revoke, and revocation that misses one is not
-- revocation. The primary key is what makes the proxy's upsert replace rather than accumulate.
do $$
begin
  begin
    insert into public.batch_credential_sessions (credential_id, owner_user_id, access_token, refresh_token, expires_at)
    values ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
            'second', 'second', now() + interval '1 hour');
    raise exception 'a second session for one credential was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- ── 3. the session dies with the credential ─────────────────────────────────
-- Revocation is done by the edge function (it signs the session out, then deletes the row). This asserts the
-- backstop: if a credential is ever deleted outright, no orphaned refresh token is left behind.
delete from public.batch_credentials where id = 'b1000000-0000-0000-0000-000000000001';
do $$
declare n int;
begin
  select count(*) into n from public.batch_credential_sessions;
  if n <> 0 then raise exception 'deleting the credential left % live session row(s)', n; end if;
end $$;

-- ── 4. the audit still records every way a session is served ────────────────
-- The rate limit is gone; the audit row is not. It is now the only leak signal, so all four outcomes must be
-- storable — a reused session that cannot be filed is a use that leaves no trace.
insert into public.batch_credentials (id, owner_user_id, secret_sha256, label)
values ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', repeat('b', 64), 'again');
insert into public.batch_credential_mints (credential_id, owner_user_id, outcome, reason)
values ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'minted', null),
       ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'reused', 'stored access token still valid'),
       ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'refreshed', 'stored access token expiring'),
       ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'denied', 'credential revoked');
do $$
declare n int;
begin
  select count(*) into n from public.batch_credential_mints where credential_id = 'b1000000-0000-0000-0000-000000000002';
  if n <> 4 then raise exception 'expected all four outcomes to be storable, stored %', n; end if;

  begin
    insert into public.batch_credential_mints (credential_id, owner_user_id, outcome)
    values ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b1', 'whatever');
    raise exception 'an unknown outcome was accepted — a typo would become a silent fifth category';
  exception when check_violation then null;
  end;
end $$;

-- an owner CAN still read their own audit rows: that is the half of this they are meant to see
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'batch_credential_mints' and grantee = 'authenticated';
  if n = 0 then raise exception 'the owner lost read access to their own mint audit'; end if;
end $$;

rollback;

\echo 'batch_credential_sessions: all assertions hold'
