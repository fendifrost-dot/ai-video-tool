# "120 mints per 3600s per credential" · 9 October 2026

The MCP credential failing mid-review. Merged as **PR #213**, `2de7b74`.

Evidence labels per [`CLAUDE.md`](../../CLAUDE.md): **VERIFIED** (proven — cited) / **OBSERVED** (seen, not
proven) / **HYPOTHESIS** (needs a named test).

---

## 1 · Where the limit was enforced — VERIFIED

| | |
|---|---|
| `batch-token-proxy/contract.ts` | `RATE_LIMIT_MINTS = 120`, `RATE_LIMIT_WINDOW_SECONDS = 3600`, `rateLimited()` |
| `batch-token-proxy/index.ts` | counted `batch_credential_mints` rows with `outcome = 'minted'` over the trailing hour, then `429 { error: "rate_limited", detail: "120 mints per 3600s per credential" }` |

That detail string is verbatim the error hit during the review, so there was no ambiguity about the source.

## 2 · Did each MCP request mint a fresh token? — VERIFIED, and the answer is the root cause

**Not per request — per cold isolate**, which under a sustained AI conversation is nearly the same thing.

`avt-mcp/index.ts` held its session in an in-memory `Map` keyed by `sha256(secret)`. `sessionFor()` reused a
cached token with more than 60 s left, and otherwise tried a refresh before minting. Within one isolate that was
already correct and minted nothing.

But the cache is **isolate-local**. A Supabase edge isolate is recycled constantly, so most calls in a
conversation land on a cold one, where the `Map` is empty **and the refresh token is gone with the previous
isolate's memory**. The refresh branch could therefore never fire on the path that mattered. Every cold start
minted.

> The mint rate tracked **isolate churn**, not request count. That is why 12 → 120 (`b4949ad`, 8 Oct) moved the
> wall instead of removing it — and why it was hit again a day later.

## 3 · The fix

Persisting the session **outside the isolate** is what makes reuse possible at all; everything else follows.

| | |
|---|---|
| `20261009090000_batch_credential_sessions.sql` | one live session per credential, where the next isolate can find it |
| `planSession()` | **reuse** a token with life left (no network call), **refresh** one that is expiring, **mint** only when nothing is usable |
| `index.ts` session path | reuse → refresh → mint, storing the rotated refresh token after every renewal |
| `avt-mcp/index.ts` | stops refreshing locally; the proxy owns the session lifecycle |

**Why `avt-mcp` had to stop refreshing.** Supabase rotates refresh tokens. A local refresh would have
invalidated the one stored in the table, so the next cold start would mint — two places renewing one session,
each breaking the other, and the storm back. Its `Map` remains as a first-level cache for still-valid tokens
only, which saves even the local proxy call.

**The fixed cap is deleted, not raised.** A dead knob with a plausible name is what a later change turns back on
without reading why it was off. It bounded *how many sessions an hour*, which an attacker never needed — one
mint is already a whole session — while reliably breaking honest work.

## 4 · What was preserved, and the one thing that got stronger

| property | how |
|---|---|
| authentication | unchanged: sha256 lookup, constant-time compare, project keys still refused outright |
| owner binding | unchanged: `owner_user_id` from the credential row; `parseRequest` still rejects an email or user id |
| owner isolation | `planSession` **mints** rather than hand over a stored session whose owner differs |
| expiry | unchanged on the credential; **plus** `minted_at` bounding the refresh chain at 12 h, so reuse cannot make one mint permanent |
| audit logging | still exactly one row per use, now `minted` / `refreshed` / `reused` / `denied` — a reused session is neither filed as a mint nor invisible |
| provider spend | untouched, still on the provider accounts (`avt-mcp/index.ts:9`); a test asserts no budget logic enters this function |

**Revocation got stronger.** It used to only stop *future* mints — an already-minted token lived out its hour.
Now it signs the stored session out at the auth server, then deletes the row, and reports which of the two
happened. Scope is `"local"`, never `"global"`: revoking a machine credential must not log the owner out of the
app.

### The new row is the most dangerous thing here, said plainly

`batch_credentials` holds only a sha256, so a database read cannot authenticate as anyone.
`batch_credential_sessions` holds a **live refresh token**. So it has RLS on with **no policy and no grant to
`anon` or `authenticated`** — not "owner reads their own", because an owner has no use for their own raw refresh
token and a compromised browser session must not be able to lift one. `batch_credential_sessions_test.sql`
asserts the policy count is zero, RLS is on, `authenticated` gets `insufficient_privilege`, one session per
credential, and that the row dies with the credential.

## 5 · A hazard found on the way — VERIFIED, and it would have taken the connector down

**`supabase/functions/**` is outside `tsconfig.json`'s `include`.** Nothing typechecks those files. A stale
import survives `tsc`, survives every unit test that does not import `index.ts`, and then lands as a Deno
module-resolution error at deploy — the connector simply stops answering, with no local signal at all.

Deleting the rate limit left `rateLimited` and `windowStart` still in `index.ts`'s import list. `tsc` was clean.

Both functions' contract tests now assert every name imported from `./contract.ts` is exported by it. That
guard is what found those two, and it is the only thing standing in that gap.

## 6 · Checks

| | |
|---|---|
| vitest | **2532 passed, 1 skipped** |
| tsc | clean — *and see §5 for what that does not cover* |
| Postgres | all 63 migrations apply on a throwaway; five DB tests pass |
| edge sources | all three parse under esbuild. **There is no `deno` in this container, so that is a parse check, not a Deno typecheck** — which is exactly why §5's test exists |

## 7 · Deployment

1. Lovable SQL editor: `supabase/migrations/20261009090000_batch_credential_sessions.sql` (idempotent).
2. Lovable → Edge Functions → redeploy **`batch-token-proxy`** and **`avt-mcp`**. Publish is not a redeploy.

**Order is load-bearing.** The proxy reads `batch_credential_sessions` and writes the two new audit outcomes, so
redeploying before the migration makes every session request fail. No frontend change is involved.

## 8 · Upstream restrictions we cannot change

* **Supabase Auth's own rate limits.** The mint path is `auth.admin.generateLink` + `verifyOtp`, and token
  renewal is the GoTrue `/token?grant_type=refresh_token` endpoint. Both carry project-level limits set in
  Supabase's auth configuration, not in this code. Reuse makes us call them far less often, which is the only
  lever available from here. **HYPOTHESIS, named:** that we now stay clear of them under sustained review. The
  test is the `reuse_count` / `refresh_count` columns against the `minted` row count in
  `batch_credential_mints` over a long session.
* **Refresh-token rotation and its reuse window.** GoTrue rotates the refresh token and tolerates a replay only
  briefly. Two isolates renewing at once can therefore collide; handled by falling through to a mint, not by
  pretending it cannot happen.
* **Edge isolate lifetime.** Not configurable. The whole design assumes a cold isolate and keeps no state that
  must survive one — which is why the fix is a table and not a longer-lived cache.
* **Access-token lifetime** is a Supabase project setting (default 1 h), so a reused token is handed back with
  at most that much life; `BATCH_SESSION_MIN_REMAINING_SECONDS` keeps us from handing out the last two minutes.

## 9 · What this does NOT do

* **No per-credential concurrency control.** Two isolates may each reuse the same token simultaneously — which
  is correct and is the point.
* **No replacement limiter.** Removing the cap was the instruction, and the compensating controls are
  revocation, expiry, the session-age bound and the audit. If a limiter is ever wanted, it should bound
  *something an attacker needs* rather than mint count.
* **No change to the 50 pre-existing critical security findings** Lovable reports on publish.
