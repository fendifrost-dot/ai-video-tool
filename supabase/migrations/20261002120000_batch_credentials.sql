-- ============================================================================
-- BATCH CREDENTIALS — a machine identity for unattended runners
-- ============================================================================
-- Why this exists: the batch runners (run_broll_batch, run_world_batch,
-- realism_gate) authenticate with a user JWT hand-copied from the browser,
-- which expires after an hour. STALL_AUDIT_2026-10-01.md root cause B records
-- four unattended runs killed by that expiry.
--
-- What this is: a revocable per-owner credential the runner holds. The
-- `batch-token-proxy` edge function exchanges it for an ORDINARY user session
-- for the owner it is bound to. Nothing else changes — every existing proxy
-- keeps requiring a real user JWT, and none of them learns about this table.
--
-- THE SAFETY PROPERTY, and it is a correctness property too:
--   `owner_user_id` is stored HERE, server-side, and is the only thing that
--   decides whose session gets minted. The request carries the secret and
--   nothing else — no email, no user id. A runner therefore cannot mint a
--   session for an account other than the one its credential was enrolled
--   for, by construction rather than by validation.
--
-- Additive: no existing table, policy or function is altered. Mirrors the
-- shipped `muse_api_tokens` pattern in Control Center (sha256 at rest, label,
-- revoked_at, expires_at, last_used_at, audit trail, fixed-window limit).
-- ============================================================================

create table if not exists public.batch_credentials (
  id              uuid primary key default gen_random_uuid(),
  -- The account a mint is issued FOR. Never taken from a request.
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  -- sha256 hex of the secret. The plaintext is shown once at enrolment and
  -- never stored, so a database read cannot authenticate as anyone.
  secret_sha256   text not null unique,
  label           text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  expires_at      timestamptz,
  note            text,
  constraint batch_credentials_secret_hex check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  constraint batch_credentials_label_len   check (char_length(label) between 1 and 80)
);

create index if not exists batch_credentials_owner on public.batch_credentials (owner_user_id);
-- Lookup path for the `session` action: hash → row, active only.
create index if not exists batch_credentials_active
  on public.batch_credentials (secret_sha256) where revoked_at is null;

comment on table public.batch_credentials is
  'Machine identity for unattended batch runners. The owner is bound here, never supplied by the caller; batch-token-proxy mints an ordinary user session for owner_user_id. Secret stored as sha256 only.';

-- ---------------------------------------------------------------------------
-- Mint audit. Also the rate-limit substrate (fixed window over this table), so
-- there is no second piece of state to keep consistent.
-- ---------------------------------------------------------------------------
create table if not exists public.batch_credential_mints (
  id             uuid primary key default gen_random_uuid(),
  credential_id  uuid references public.batch_credentials(id) on delete set null,
  owner_user_id  uuid,
  at             timestamptz not null default now(),
  outcome        text not null
    constraint batch_credential_mints_outcome check (outcome in ('minted','denied')),
  reason         text,
  -- Hashed, never raw: this is a personal tool, but an audit row should not be
  -- the thing that leaks where its owner works from.
  ip_hash        text,
  user_agent     text
);

create index if not exists batch_credential_mints_window
  on public.batch_credential_mints (credential_id, at desc);

comment on table public.batch_credential_mints is
  'One row per session-mint attempt, minted or denied. Doubles as the fixed-window rate-limit source for batch-token-proxy.';

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped, matching the lyric_lines style in this repo.
--
-- The edge function uses the service-role key and bypasses RLS; these policies
-- govern the app/browser. Deliberately NO insert/update policy for
-- `authenticated`: credentials are created and revoked through the function,
-- so the secret hash is written in exactly one place. An owner can read their
-- own rows (to list them) and nothing else.
-- ---------------------------------------------------------------------------
grant select on public.batch_credentials to authenticated;
grant all    on public.batch_credentials to service_role;

alter table public.batch_credentials enable row level security;
drop policy if exists "Owners read own batch_credentials" on public.batch_credentials;
create policy "Owners read own batch_credentials"
  on public.batch_credentials for select
  using (owner_user_id = auth.uid());

grant select on public.batch_credential_mints to authenticated;
grant all    on public.batch_credential_mints to service_role;

alter table public.batch_credential_mints enable row level security;
drop policy if exists "Owners read own batch_credential_mints" on public.batch_credential_mints;
create policy "Owners read own batch_credential_mints"
  on public.batch_credential_mints for select
  using (owner_user_id = auth.uid());
