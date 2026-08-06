# SECURITY.md — AI Video Tool (AVT)

> **This document is UPDATED BY EVERY SECURITY AUDIT.** It is the living record of
> AVT's security posture — the model we intend, the known gaps between that model
> and reality, and the checklist that must be green before a hardened production
> launch. Every audit appends its findings to the **Known findings** table and
> revises the philosophy sections if the intended model changed. Do not let it go
> stale: an out-of-date SECURITY.md is itself a finding.
>
> Cross-references: risk items are tracked in [`RISK_REGISTER.md`](RISK_REGISTER.md);
> the pre-API audit narrative lives in [`docs/audit_pre_api.md`](docs/audit_pre_api.md).

Last reviewed: **2026-08-05** (Track-B documentation pass — seeded honest current state).

---

## 0. Stack this document actually covers

AVT is a **Lovable-managed** film-production app. The security surface is:

| Layer | What runs there | Auth boundary |
|-------|-----------------|---------------|
| Frontend (React / TanStack Start) | `aivideotool.lovable.app` | Supabase auth session (JWT) in the browser |
| Supabase (Lovable Cloud, ref `qoyxgnkvjukovkrvdaiq`) | Postgres + RLS, Storage buckets, Auth, edge functions | Postgres RLS on `anon` / `authenticated` roles |
| Edge functions (Deno) | `grok-image-garment-proxy`, `fal-*` proxies, video preflight/propagation, watchdogs | Service-role inside the function; caller identity via JWT |
| External providers | **Fal** (via Control Center `switchx-restyle` / `fal-queue-poll` — AVT never holds `FAL_KEY`), **Grok / xAI** (`XAI_API_KEY` on AVT) | Provider API keys held as edge secrets |

There is **no standalone Supabase** and no separate infra to log into — schema and
deploys go through Lovable (see root `CLAUDE.md` chain of command). This document
describes only what exists in this stack. We do **not** assert controls we have not
verified.

---

## 1. Authentication model

- **Users** authenticate through **Supabase Auth**. The browser holds a JWT; the
  TanStack Start middleware (`src/integrations` / `start.ts`) attaches the Supabase
  session to requests.
- Two Postgres roles matter for authorization: **`anon`** (unauthenticated /
  pre-login) and **`authenticated`** (a logged-in user). RLS policies are written
  against these roles plus `auth.uid()`.
- **Edge functions** run with the **service role** and therefore bypass RLS by
  design. That makes each edge function a **trust boundary**: it is responsible for
  (a) validating the caller's JWT / ownership before acting on their behalf, and
  (b) never reflecting a service-role capability back to an untrusted caller.
  Server-Side Request Forgery is guarded in `supabase/functions/_shared/urlValidator.ts`
  (scheme allow-list, private-range / IP-literal blocking, redirect + byte caps).
- **Provider keys never reach the browser.** `XAI_API_KEY` lives as an AVT edge
  secret; Fal is reached only through Control Center. Keys are never requested in
  chat and never committed.

**Intended invariant:** a user can act on their own artists, looks, features,
locations, props, timelines, and rendered assets — and nothing else. Anonymous
callers can do nothing to real user data.

> ⚠️ This invariant is **currently violated** in the deployed schema. See
> [§6 Known findings → RISK-001](#6-known-findings-updated-by-every-audit).

---

## 2. RLS philosophy

1. **Least privilege by default.** Every table holding user data has RLS **enabled**
   and a policy scoped to the owner: `USING (auth.uid() = user_id)` (directly or via
   a join to an owning `artist`). New tables start locked and are opened narrowly.
2. **No `USING (true)` on real data in production.** A `FOR ALL ... USING (true)
   WITH CHECK (true)` policy grants every row to every caller (including `anon`) —
   it is the categorical opposite of least privilege and is **forbidden on any table
   that holds user or asset data** in a production configuration.
   - **Legitimate exception:** read-only reference/catalog tables that are the same
     for every user may use `SELECT ... USING (true)`. In this repo,
     `provider_capabilities` is such a catalog (a static list of provider
     aspect-ratios / durations, readable by any signed-in user) — this is
     **acceptable** and is *not* a finding. The rule is specifically about
     **write access and per-user data**, not about public read-only catalogs.

   > **STANDING PRINCIPLE — Every public policy must have a documented business
   > justification.** Any policy granting access beyond the owning user (a
   > `USING (true)` predicate, a grant to `anon`, or a `public = true` bucket) is
   > forbidden unless a written justification exists — in this document and, for the
   > specific decision, in [`docs/SECURITY_DECISIONS.md`](docs/SECURITY_DECISIONS.md).
   > No documented justification ⇒ the policy is a finding and must be removed. A
   > "revert before production" comment is **not** a justification — it already
   > failed once (RISK-001).
3. **Dev-only relaxations must never ship.** A migration that opens policies "for
   local dev" is a loaded gun. If one is written, it must be (a) clearly labelled,
   (b) tracked as a P0 the moment it lands, and (c) reverted by a paired migration
   *before* it can reach a shared/production environment. "Revert before production"
   comments are **not** a control — they have already failed once here (RISK-001).
4. **RLS is validated by tests, not by reading.** The absence of RLS integration
   tests is why RISK-001 survived. Least-privilege claims in this document are only
   trustworthy once backed by **Real-Media / integration tests that assert an
   `anon` client cannot read or write protected rows** (see
   [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md); those categories are currently
   at **0**).

---

## 3. Storage-bucket access philosophy

- Buckets are **private by default** (`public = false`). Access is mediated by
  `storage.objects` RLS policies scoped to the owning path/user, and reads are
  served through **signed URLs** with a bounded TTL rather than public links.
- The same `USING (true)` prohibition from §2 applies to `storage.objects`: a
  bucket policy that grants `anon` blanket `SELECT/INSERT/UPDATE/DELETE` on a bucket
  is a production-blocking finding.
- **Known violation:** the `look-composites` bucket was opened to `anon` in a
  dev-only migration and never re-locked. See RISK-001.
- Source/master video buckets carry raised size limits for full-res ingest; those
  limits are a capacity setting, not an access-control setting — they do not change
  who may read/write.

---

## 4. Secrets handling

- **Where secrets live:** Lovable Cloud / edge secrets. `XAI_API_KEY` on AVT; Fal
  credentials on Control Center only. Supabase service-role key is injected into
  edge functions by the platform.
- **Never in chat, never in git.** Keys are not pasted into conversations, not
  echoed in logs, and not committed. `.env` in the repo is for non-secret local
  config; real provider keys are edge secrets.
- **Rotation & blast radius.** Because AVT never holds `FAL_KEY`, a compromise of an
  AVT edge secret exposes Grok/xAI usage but not Fal. Keep that separation — do not
  copy `FAL_KEY` into AVT for convenience.
- **Diagnostics must be sanitized.** Provider-failure diagnostics are persisted for
  debugging (`metadata_json.fal_diagnostics`); the shared sanitizer
  (`_shared/falDiagnostics.ts`) strips secrets/tokens from stored error text. Any
  new diagnostic sink must route through the same sanitizer.

---

## 5. Threat model

Scoped to the actual stack — we do not model infrastructure we do not run.

### Assets worth protecting
- **User data isolation** — one user's artists / looks / features / renders must not
  be readable or writable by another user or by anonymous callers.
- **Provider credentials** — `XAI_API_KEY`, service-role key, Fal access (via CC).
- **Brand/identity integrity** — Fendi identity references and garment assets; their
  unauthorized modification or exfiltration is a business risk, not just a data one.
- **Compute budget** — provider calls cost money; unauthenticated invocation is a
  financial-DoS vector.

### Principal threats (with current status)
| # | Threat | Vector | Status |
|---|--------|--------|--------|
| T1 | **Anonymous data access** | Permissive `anon` RLS / bucket policies expose or mutate real rows | **ACTIVE — RISK-001 (P0), open** |
| T2 | **Unauthenticated edge invocation** | An edge proxy that acts without verifying caller identity → data access or budget drain | Tracked as SEC-2 (training endpoint) in the register |
| T3 | **Malicious asset / LoRA poisoning** | Attacker-supplied training images or reference assets corrupt identity models or inject content | Tracked as SEC-3 |
| T4 | **SSRF via URL inputs** | Edge functions fetching attacker-controlled URLs reach internal ranges | **Mitigated** by `urlValidator` (allow-list, private-range block, redirect/byte caps); keep all fetch paths routed through it |
| T5 | **Secret leakage** | Keys in logs / diagnostics / client bundle | Mitigated by edge-secret model + diagnostic sanitizer; verify no new sink bypasses it |
| T6 | **Provider-side data handling** | Assets sent to Fal/Grok leave our trust boundary | Accepted for functionality; minimize payloads, never send secrets, prefer signed short-TTL URLs |

### Explicitly out of scope for this document
Physical infra, Lovable platform internals, and Supabase-managed Postgres hardening
— these are the platform's responsibility. We model only what AVT code and schema
control.

---

## 6. Known findings (UPDATED BY EVERY AUDIT)

| id | Finding | Severity | Status | Tracked in |
|----|---------|----------|--------|-----------|
| **RISK-001** | **Anonymous RLS / bucket exposure.** Migration `20260523171003_*.sql` (dated **2026-05-23**, labelled "DEV ONLY … Revert before production") replaced per-user policies with `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)` on **`artists`, `character_features`, `location_library`, `prop_library`, `artist_looks`**, and opened the **`look-composites`** storage bucket to `anon` for SELECT/INSERT/UPDATE/DELETE. **No later migration reverts it.** Any anonymous caller can read/write/delete these rows and objects. | **P0 / Critical** | **OPEN — under active remediation** | [RISK-001](RISK_REGISTER.md) |

**RISK-001 handling note:** Do **not** attempt to fix this in a documentation change.
Remediation is handled separately as a **forensic report + a targeted revert
migration**, now authored under [`docs/security/RISK-001/`](docs/security/RISK-001/):
the immutable forensic evidence (`evidence/` + `SHA256SUMS.txt`), the revert migration
`supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql` (restores
owner-scoped policies on the five tables and the `look-composites` bucket, with
rollback SQL — **not yet applied**), an [`IMPACT_REPORT.md`](docs/security/RISK-001/IMPACT_REPORT.md)
("what breaks"), a [`VERIFICATION_PLAN.md`](docs/security/RISK-001/VERIFICATION_PLAN.md)
(the runtime DoD), and a [`SECURITY_REVIEW_CHECKLIST.md`](docs/security/RISK-001/SECURITY_REVIEW_CHECKLIST.md).
Status is **In-remediation** pending Class-C architecture + security review, apply to
the live DB, and the RLS integration tests that assert `anon` is denied. This document
records the finding honestly; the register tracks the fix.

*What is NOT a finding:* `provider_capabilities`'s `SELECT ... USING (true)` — a
read-only public catalog (see §2.2).

---

## 7. PRODUCTION SECURITY CHECKLIST

Every item must be **green** before AVT is treated as production-hardened. This is
the gate the next audit checks against.

- [ ] **RISK-001 remediated** — the 2026-05-23 dev-only migration is reverted;
      `artists`, `character_features`, `location_library`, `prop_library`,
      `artist_looks` are back to owner-scoped RLS; `look-composites` is re-locked.
- [ ] **No `USING (true)` on user/asset data** — audited across every migration;
      only read-only catalogs (e.g. `provider_capabilities`) may use it, and only
      for `SELECT`.
- [ ] **RLS integration tests exist and pass** — an `anon` client is proven unable
      to read or write any protected table or bucket (this is the DoD for RISK-001).
- [ ] **Every user-data table has RLS enabled** with an owner-scoped policy.
- [ ] **All storage buckets private** (`public = false`) with owner-scoped
      `storage.objects` policies; reads via signed short-TTL URLs.
- [ ] **Every edge function verifies caller identity** before acting; no unauthenticated
      proxy can trigger provider spend or data access (closes T2 / SEC-2).
- [ ] **All external fetches routed through `urlValidator`** (SSRF guard).
- [ ] **No secrets in client bundle, logs, or diagnostics** — sanitizer covers every
      diagnostic sink; provider keys are edge-only.
- [ ] **Provider-key separation intact** — AVT holds no `FAL_KEY`.
- [ ] **Asset/LoRA ingestion authenticated and validated** (closes SEC-3).
- [ ] **CI security gate** — tests (incl. RLS integration) run in CI and block merge
      (today **no CI gates these** — see `docs/TEST_TAXONOMY.md`).
- [ ] **This document reviewed** and its findings table current as of the launch date.
