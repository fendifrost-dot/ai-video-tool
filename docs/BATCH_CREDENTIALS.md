# Batch credentials — a session that outlives the operator

**Status:** shipped (edge function + migration + runner wiring). Two manual steps below
before it works live.

## The problem

`STALL_AUDIT_2026-10-01.md` root cause **B**: the batch runners authenticate with a user
JWT hand-copied out of the browser into `/tmp/jwt.txt`. A Supabase access token lasts one
hour. Four unattended overnight runs died mid-batch when theirs expired — each losing the
work in flight and needing a human awake at 3am to paste a new token.

The runners were not wrong. The credential was simply the wrong *kind* of thing to leave a
robot holding.

## The shape

| piece | what it is |
|---|---|
| `public.batch_credentials` | one row per machine. `owner_user_id`, `secret_sha256` (hash only), label, `revoked_at`, `expires_at`, `last_used_at`. |
| `public.batch_credential_mints` | one row per mint attempt, minted or denied. Also the fixed-window rate-limit substrate, so there is no second counter to drift. |
| `supabase/functions/batch-token-proxy` | exchanges a credential for an **ordinary user session**. Actions: `enroll`, `session`, `list`, `revoke`. |
| `scripts/_lib/auth.py` | the client. `Session.from_args(a)` → `.jwt()` / `.headers()`. |

**Nothing downstream changes.** Every other proxy still demands a real user JWT and never
learns this exists. The runner just stops needing a human at 11pm.

## The property that makes it safe to leave on disk

`owner_user_id` is stored **server-side on the credential row** and is the only thing that
decides whose session gets minted. The request carries the secret and nothing else — no
email, no user id — and `parseRequest` **rejects** such a field rather than ignoring it, so
a caller that misunderstands the contract gets an error instead of silence.

A credential therefore cannot be pointed at an account other than the one it was enrolled
for. That is a property of the shape, not of a validation someone has to remember to keep.

Secondary guards: secret stored as sha256 only (returned once at enrolment, never
recoverable); constant-time compare; a Supabase project key offered as a credential is
refused with a reason rather than hashed into "unknown credential"; denied attempts are
audited but do **not** consume the owner's mint quota, so a brute force cannot lock them
out; `revoke` is scoped to the caller's own rows.

## Token resolution order (`scripts/_lib/auth.py`)

Each lane is used only when the one before it cannot serve:

1. **cached session**, if more than 300 s remain (`SKEW` — a poll that starts valid and
   finishes expired is the exact failure this exists to stop)
2. **refresh token** → `/auth/v1/token?grant_type=refresh_token` — cheap, no mint audited
3. **batch credential** → `batch-token-proxy` `{"action":"session"}`
4. **the browser file** (`--jwt`, default `/tmp/jwt.txt`) — the old path, kept so a machine
   with nothing enrolled runs exactly as it did before

A `--jwt` named explicitly on the command line short-circuits all of it: if an operator
names a file, that file is the intent. A credential that fails to mint says so on stderr —
falling back silently is how a revoked credential becomes "it worked yesterday" weeks later.

Headers are built **per request**, never frozen at construction. That was the actual
regression: `Api.__init__` captured a header dict at startup, so a run longer than an hour
was dead on arrival no matter how good the token source was.

## Wired

`scripts/broll/run_broll_batch.py`, `run_world_batch.py`, `world_around.py`,
`scripts/qa/realism_gate.py`. Child processes are handed `--jwt` only when the parent was
pinned, so a gate launched three hours into a run resolves its own session instead of
inheriting a token minted in hour one.

## Two manual steps (Lovable — there is no standalone Supabase)

1. **Lovable → SQL Editor**: run `supabase/migrations/20261002120000_batch_credentials.sql`.
2. **Lovable → Edge Functions**: deploy **`batch-token-proxy`**. (Publish ≠ edge redeploy.)

Then, once per machine, from somewhere you can paste a browser JWT:

```bash
python3 scripts/_lib/auth.py enroll --label "studio mac"   # secret → ~/.config/avt/batch_credential (0600)
python3 scripts/_lib/auth.py status                        # which lane serves the next call
python3 scripts/_lib/auth.py list
python3 scripts/_lib/auth.py revoke <credential-id>
```

After that the runners need no `--jwt` at all.

## Tests

- `supabase/functions/batch-token-proxy/contract.test.ts` — 29 vitest (`npx vitest run`)
- `scripts/_lib/tests/test_auth.py` — 12 pytest (`python3 -m pytest scripts/_lib/tests/`)

Per `docs/TEST_TAXONOMY.md` both are **unit / contract**; neither makes a network call and
neither costs money. There is no integration coverage of the live mint — that needs the two
manual steps above, and the first real `auth.py status` is it.
