-- One live session per machine credential, so a cold edge isolate can REUSE a valid token instead of minting.
--
-- THE BUG THIS FIXES
--   avt-mcp kept its minted session in an in-memory Map keyed by the secret hash (avt-mcp/index.ts). That cache
--   is ISOLATE-LOCAL: a Supabase edge isolate is recycled constantly, and an AI conversation lands on a cold one
--   on most calls. A cold isolate has no cached session and no refresh token — the previous isolate's memory is
--   gone — so it MINTS. The mint rate therefore tracked isolate churn, not request count, which is why raising
--   the cap from 12 to 120 per hour only moved the wall (hit again during an authorized video review, 9 Oct 2026).
--   The refresh path in sessionFor() could never help, because the token it needs died with the isolate.
--
--   Persisting the session outside the isolate is what makes reuse possible at all. Everything else — dropping
--   the fixed hourly mint cap included — follows from mints becoming rare rather than per-isolate.
--
-- WHAT THIS ROW IS, STATED PLAINLY
--   It is a live session: an access token, and a refresh token that can produce more. That is strictly more
--   dangerous than `batch_credentials`, which holds only a sha256 and so cannot authenticate as anyone. The
--   controls below are therefore not decoration:
--     * RLS is on and there is NO policy and NO grant for anon or authenticated. Not "owner can read their own"
--       — nobody but service_role can see a row, because an owner has no use for their own raw refresh token and
--       a compromised browser session must not be able to lift one.
--     * The row dies with the credential (on delete cascade) and is deleted outright on revoke, by
--       batch-token-proxy, which also signs that session out so revocation ends access rather than merely
--       stopping future mints.
--     * `minted_at` bounds the refresh chain. Reuse must not make a session immortal: past
--       BATCH_SESSION_MAX_AGE_SECONDS the proxy mints a new one instead of refreshing, whatever the refresh
--       token would still allow. A bound on a session's life is not a cap on honest work — a mint every few
--       hours is nothing — but it stops an endless chain from one leak.
--
-- Idempotent: safe to re-run.

create table if not exists public.batch_credential_sessions (
  -- one per credential: a second concurrent session would be a second thing to revoke
  credential_id  uuid primary key references public.batch_credentials(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  access_token   text not null,
  refresh_token  text not null,
  -- when the ACCESS token stops being usable; the proxy refreshes before this
  expires_at     timestamptz not null,
  -- when this session was first minted, not when it was last refreshed: the refresh-chain bound
  minted_at      timestamptz not null default now(),
  refreshed_at   timestamptz,
  -- how many times reuse and refresh have saved a mint, for reading the fix's effect off the database
  reuse_count    int not null default 0,
  refresh_count  int not null default 0,
  updated_at     timestamptz not null default now()
);

create index if not exists batch_credential_sessions_owner
  on public.batch_credential_sessions (owner_user_id);

comment on table public.batch_credential_sessions is
  'The live session batch-token-proxy hands back for a machine credential, so a cold edge isolate reuses a valid token instead of minting one. Holds a real refresh token: service_role only, no policy for anon or authenticated, deleted on revoke. minted_at bounds the refresh chain.';
comment on column public.batch_credential_sessions.minted_at is
  'When this session was MINTED, not last refreshed. The proxy stops refreshing past the max session age and mints afresh, so reuse cannot make one session immortal.';
comment on column public.batch_credential_sessions.reuse_count is
  'Mints saved by handing back a still-valid access token. Read it to see whether the reuse fix is working.';

-- No grant to anon or authenticated, by design. service_role bypasses RLS; enabling it with no policy means
-- every other role reads nothing, which is the intent — not an oversight to be "fixed" by adding an owner policy.
revoke all on public.batch_credential_sessions from anon, authenticated;
grant all on public.batch_credential_sessions to service_role;
alter table public.batch_credential_sessions enable row level security;
-- A policy named here would be the bug. Left empty deliberately.
drop policy if exists "Owners read own batch_credential_sessions" on public.batch_credential_sessions;

drop trigger if exists batch_credential_sessions_set_updated_at on public.batch_credential_sessions;
create trigger batch_credential_sessions_set_updated_at before update on public.batch_credential_sessions
  for each row execute function public.tg_set_updated_at();

-- The mint audit gains the outcomes that reuse introduces. Without this, a reused session would either go
-- unaudited (losing the leak signal the cap was protecting) or be filed as a mint (losing the distinction).
alter table public.batch_credential_mints drop constraint if exists batch_credential_mints_outcome;
alter table public.batch_credential_mints
  add constraint batch_credential_mints_outcome
  check (outcome in ('minted', 'denied', 'reused', 'refreshed'));

comment on table public.batch_credential_mints is
  'One row per session request: minted (a new session), refreshed (the stored one renewed), reused (a still-valid stored token handed back), or denied. Every use of a credential is still one row, so a leak shows up as it always did — it is no longer the rate-limit source, because there is no fixed mint cap.';