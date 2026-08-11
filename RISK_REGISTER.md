# RISK_REGISTER.md — AI Video Tool (AVT)

> Standing register of known risks. **Updated by every audit** alongside
> [`SECURITY.md`](SECURITY.md). Each entry: id, title, severity, confidence, status,
> owner, and a pointer to where the detail/remediation lives. The forensic narrative
> for security items is the pre-API audit report, [`docs/audit_pre_api.md`](docs/audit_pre_api.md).
>
> **Severity:** Critical / High / Medium / Low · **Confidence:** Confirmed / Likely /
> Suspected · **Status:** Open / In-remediation / Mitigated / Closed.

Last reviewed: **2026-08-08** (RISK-001 Part B storage re-key — Phase 1 copy+verify complete; redefined RISK-002 as identity **+ storage-ownership** architecture; added STOR-1…STOR-4 per-bucket path-strand entries).

| id | Title | Severity | Confidence | Status | Owner |
|----|-------|----------|-----------|--------|-------|
| [RISK-001](#risk-001--anonymous-rls--bucket-exposure) | Anonymous RLS / bucket exposure | Critical | Confirmed | **In-remediation** (revert migration authored, `docs/security/RISK-001/`; awaiting Class-C review + apply — **gated on RISK-002 one-time consolidation**, see Identity Health Report) | Platform / Products (AVT) |
| [RISK-002](#risk-002--identity--storage-ownership-architecture) | Identity **+ storage-ownership** architecture (files coupled to disposable anon-UID paths) | High | Confirmed | Open | Platform (AVT) |
| [STOR-1](#stor-1--look-composites-uid-path-strand) | `look-composites` UID-path strand | Critical | Confirmed | **In-remediation** (Part-B Phase 1 copy+verify DONE; ref-switch + policy pending) | Platform (AVT) |
| [STOR-2](#stor-2--project-references-uid-path-strand) | `project-references` UID-path strand | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [STOR-3](#stor-3--project-clips-uid-path-strand) | `project-clips` UID-path strand | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [STOR-4](#stor-4--other-uid-path-encoded-buckets) | Other UID-path buckets (`wardrobe-refs`, `style-references`, `project-exports`, `product-assets`, `artist-assets`) + named-unconfirmed (`hero-frames`, `face-reference`) | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [SEC-2](#sec-2--unauthenticated-training-endpoint) | Unauthenticated training endpoint | High | Likely | Open | Platform (AVT) |
| [SEC-3](#sec-3--lora--asset-poisoning) | LoRA / asset poisoning | High | Suspected | Open | Products (AVT) |
| [ARCH-1](#arch-1--lane-a-propagation-inert) | Lane A propagation inert (production hole) | Medium | Confirmed | Open | Products (AVT) |
| [OPS-1](#ops-1--no-ci-gate) | No CI gate on tests | Medium | Confirmed | Open | Platform (AVT) |
| [OPS-2](#ops-2--no-job-reaper) | No reaper for stuck/orphaned jobs | Medium | Likely | Open | Platform (AVT) |
| [REL-1](#rel-1--pr16-compat-gate) | PR #16 preflight compatibility gate unmerged | Low | Confirmed | Open | Products (AVT) |

---

## RISK-001 — Anonymous RLS / bucket exposure

- **Severity:** Critical · **Confidence:** Confirmed · **Status:** In-remediation
  (revert migration + forensic/impact/verification artifacts authored under
  [`docs/security/RISK-001/`](docs/security/RISK-001/); **not yet applied**, awaiting
  Class-C architecture + security review, and **gated on the RISK-002 one-time
  identity consolidation** — see
  [`docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md`](docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md)) ·
  **Owner:** Platform / Products (AVT)
- **Summary:** Any anonymous (`anon`) caller can read, write, and delete real user
  data across several core tables and the `look-composites` storage bucket.
- **Root cause:** Migration `supabase/migrations/20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql`
  (dated **2026-05-23**, header: *"DEV ONLY … Revert before production"*) dropped the
  owner-scoped policies and created `FOR ALL TO anon, authenticated USING (true)
  WITH CHECK (true)` on `public.artists`, `public.character_features`,
  `public.location_library`, `public.prop_library`, `public.artist_looks`, and opened
  the **`look-composites`** bucket to `anon` for `SELECT / INSERT / UPDATE / DELETE`.
  **No subsequent migration reverts it.** The 2026-08-06 live audit further found
  **out-of-band `*_open_test` and `single_tenant_all` policies** on all five tables
  (not present as committed migrations) — the live surface is *more* open than the
  culprit migration; the revert must drop these too.
- **Impact:** Full loss of per-user isolation on identity/wardrobe data + rendered
  composites: cross-tenant read, tamper, and delete by an unauthenticated client.
- **Definition of Done:** an `anon` client **cannot read or write any protected row
  or object** — the five tables and the `look-composites` bucket are back to
  owner-scoped RLS, and the dev-only migration is reverted by a paired migration.
- **Apply gate (added 2026-08-06):** the live identity audit classifies this **Tier 3
  — High (widespread UID drift)**: one logical operator's data is split across 21 owner
  identities (1 durable + 20 anonymous). Applying the revert *before* consolidating
  identity would strand ~90–95% of the operator's own data. **Decision: ⚠ Apply after
  identity stabilization.** Consolidate legacy anon UIDs into the durable account
  first; never re-open RLS to compensate.
- **Validation:** **RLS integration tests** that drive an `anon` Supabase client and
  assert denial on each affected table + the bucket (currently-empty test category —
  see [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md)).
- **Remediation ownership:** handled as a **forensic report + targeted revert
  migration**; this register tracks status only. **Do not "fix" it in docs.**

---

## RISK-002 — Identity + storage-ownership architecture

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open · **Owner:** Platform (AVT)
- **Redefinition (2026-08-08):** RISK-002 is **no longer just database identity
  durability** — it is an **identity + storage-ownership architecture** issue. Ownership
  is encoded in **two** coupled places: (a) `user_id` columns in Postgres, and (b) the
  **first path segment of storage object keys** (`{uid}/…`) across *every* user bucket,
  whose RLS authorizes on `(storage.foldername(name))[1] = auth.uid()::text`. Because
  files are keyed by a **disposable anonymous UID**, a DB-only identity fix (like the
  2026-08-08 consolidation) re-owns rows but **leaves the files stranded** under dead
  UID prefixes. **Any future identity fix must not leave storage permanently coupled to
  anonymous UIDs** — it must either preserve `auth.uid()` (anonymous→authenticated
  *upgrade*, so paths stay valid) or carry a storage re-key as a first-class part of the
  migration. Per-bucket strands are now tracked as STOR-1…STOR-4 below.
- **Not a blocker for PR #17.** RISK-002 is the *long-term* identity+storage architecture.
  The *short-term* gate on PR #17 is the one-time consolidation described in RISK-001's
  apply gate and in the Identity Health Report — that consolidation (DB) **plus** the
  per-bucket storage re-key (STOR-*), not this roadmap, is what unblocks the RLS restore.
- **Summary:** AVT identity is an **anonymous, per-device `auth.uid()`** persisted only
  in the browser's `localStorage` (`supabase.auth.signInAnonymously()`,
  `src/routes/__root.tsx`). There is no durable account binding for the operator's
  work: clearing cache, switching browsers/devices, or an expired anon session mints a
  **new** `auth.uid()` that no longer owns the rows **or the storage paths** created
  under the old one. Today the open RLS (RISK-001) masks this by showing every session
  all rows/objects; once RLS is restored, drifted identity surfaces as apparent data
  loss **and unreadable files**.
- **Evidence (2026-08-06 live audit,
  [`docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md`](docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md)):**
  208 auth users, **207 anonymous / 1 durable**; one logical user's data fragmented
  across **21** owner identities; overall identity-durability health **26/100 (Poor)**;
  referential integrity clean (0 orphans / 0 NULL owners / 0 dangling refs).
- **Open questions to answer next milestone (the RISK-002 roadmap):**
  1. What happens when a user **clears browser cache / `localStorage`** — is their work
     recoverable, and how?
  2. What happens when a user **changes devices or browsers** — how does the same human
     reach the data they created elsewhere?
  3. What happens when the **anonymous session expires / is not refreshed**?
  4. How does a user **recover ownership** of projects created under a prior anon UID?
  5. How do we **migrate** the existing 20 legacy anon identities to durable ownership
     without data loss (the one-time consolidation), and prevent new drift?
- **Intended direction (to be ratified):** transition from anonymous per-device identity
  to **durable identity via an anonymous→authenticated *upgrade path*** — link each
  anonymous session to a permanent credential (email / OAuth) using Supabase identity
  linking, which **preserves `auth.uid()`** so existing rows stay owned, and adds
  cross-device account recovery without forcing sign-in friction on first touch.
  See the Identity Health Report §5 for the full rationale and the alternatives
  considered (continue-anonymous-for-beta / mandatory-sign-in / device-binding+recovery
  / hybrid).
- **DoD (target):** a durable identity model is in place; a user can recover their work
  after cache-clear / device-change; no new per-device UID drift is created; the legacy
  anon UIDs are consolidated; and RLS remains owner-scoped throughout (identity is fixed
  **with** the auth model, never by weakening RLS).

---

## Storage-ownership risks (path-prefix-encoded buckets)

> Discovered 2026-08-08 during RISK-001 Part B. Every user bucket keys objects as
> `{uid}/…` and authorizes via `(storage.foldername(name))[1] = auth.uid()::text`.
> Legacy anonymous UIDs therefore strand objects exactly as `look-composites` did.
> **Cross-cutting rule — no owner-scoped bucket policy is tightened until that bucket
> completes its own inventory + verified re-key** (copy → checksum → reference-update →
> readable-as-durable-account), mirroring the `look-composites` Part-B process. Object
> counts are the live read-only measurement; prefix keying scheme (`user_id` vs
> `artist_id` vs `project_id`) must be confirmed per bucket before its re-key.

### STOR-1 — `look-composites` UID-path strand

- **Severity:** Critical · **Confidence:** Confirmed · **Status:** In-remediation · **Owner:** Platform (AVT)
- **Summary:** 363 legacy-era objects, **314 under 15 legacy anon-UID prefixes** (49 already durable). This is the bucket in RISK-001's DoD.
- **Progress:** Part-B **Phase 1 (copy + checksum) COMPLETE** — 313/313 in-scope copied & sha256-verified byte-identical; 1 held (`864088d5…`, unexplained). Originals preserved. See [`docs/security/RISK-001/STORAGE_REKEY_PHASE1_RECONCILIATION.md`](docs/security/RISK-001/STORAGE_REKEY_PHASE1_RECONCILIATION.md) and [`STORAGE_REKEY_PLAN.md`](docs/security/RISK-001/STORAGE_REKEY_PLAN.md).
- **DoD:** 285 `artist_looks` references switched to target paths and reconciled to 0 legacy prefixes; all 313 readable as the durable account; **then** bucket policy tightened; legacy originals deleted only in a later gate.

### STOR-2 — `project-references` UID-path strand

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary:** 46 objects, **45 under 7 legacy anon-UID prefixes**, only 1 durable. Referenced by `provider_jobs.*_payload_json`, `project_assets.file_url`/`metadata_json` (signed URLs + bare paths). Includes `hero-frames/…` sub-paths (see STOR-4 note).
- **DoD:** inventory + manifest + collision + reference map, then copy→verify→ref-switch like STOR-1, before any `project-references` policy tightening.

### STOR-3 — `project-clips` UID-path strand

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary:** 46 objects, **39 under 9 legacy anon-UID prefixes**, 7 durable. Video clip artifacts — larger per-object; re-key must budget for size and any signed-URL caches held by in-flight render jobs.
- **DoD:** own inventory + verified re-key before policy tightening.

### STOR-4 — Other UID-path-encoded buckets (+ named-unconfirmed)

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary (live counts, objects under legacy anon-UID prefixes / total):**
  `wardrobe-refs` 6/17 · `style-references` 47/47 *(keyed by `artist_id` `8d4a4d22`=Fendi Frost, which is target-owned — confirm keying scheme; may be mis-flagged)* · `project-exports` 9/9 · `product-assets` 7/7 · `artist-assets` 2/70.
- **Named in remediation scope but NOT confirmed populated:** `hero-frames` and `face-reference` returned empty on probe (the Storage `list` endpoint returns `[]` — not 404 — for non-existent buckets, so their existence is **unconfirmed**; `hero-frames` content actually appears as a folder *inside* `look-composites`/`project-references`). Confirm with a service-role bucket list before assuming coverage.
- **DoD:** per-bucket inventory confirming keying scheme + object counts; verified re-key for any bucket that is genuinely `user_id`-path-encoded; **no** owner-scoped policy tightening on any of these until each is individually cleared.

---

## SEC-2 — Unauthenticated training endpoint

- **Severity:** High · **Confidence:** Likely · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** A training/ingest edge path appears reachable without verifying caller
  identity, allowing unauthenticated invocation (data access and/or provider spend).
- **Pointer:** forensic detail to be recorded in [`docs/audit_pre_api.md`](docs/audit_pre_api.md);
  maps to threat **T2** in `SECURITY.md` §5.
- **DoD (target):** every training/ingest edge function verifies the caller's JWT and
  ownership before acting; no anonymous trigger of training or spend.

---

## SEC-3 — LoRA / asset poisoning

- **Severity:** High · **Confidence:** Suspected · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** Attacker-supplied training images or reference assets could corrupt
  identity LoRAs or inject unwanted content into the pipeline.
- **Pointer:** [`docs/audit_pre_api.md`](docs/audit_pre_api.md); threat **T3** in
  `SECURITY.md` §5.
- **DoD (target):** asset/LoRA ingestion is authenticated, provenance-checked, and
  validated before it can influence a model.

---

## ARCH-1 — Lane A propagation inert

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** The optical-flow propagation engine in `wardrobe-video-propagate-proxy`
  (`supabase/functions/_shared/propagation.ts`) is deliberately **disabled** — Fal
  hosts no dense-flow/warp endpoint, so the LOCKED architecture's propagation step
  has no production implementation. The gap is currently filled only by a **research
  prototype** (warp worker, PR #15), which is **not** invocable in prod.
- **Pointer:** [`docs/VIDEO_SWAP_ARCHITECTURE.md`](docs/VIDEO_SWAP_ARCHITECTURE.md);
  warp-worker reclassification (PR #15).
- **DoD (target):** a production propagation path exists (GPU worker w/ RAFT+SAM,
  wired into the app/CI) or the lane is explicitly descoped.

---

## OPS-1 — No CI gate

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** No CI workflow runs the test suite on push/PR; a red suite does not
  block merge, and empty test categories (provider-live, real-media, deploy-smoke,
  RLS integration) stay silently empty.
- **Pointer:** [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md) ("No CI gates these").
- **DoD (target):** CI runs the categorized suite (+ RLS integration tests once they
  exist) and blocks merge on failure.

---

## OPS-2 — No job reaper

- **Severity:** Medium · **Confidence:** Likely · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** No reaper/watchdog reliably reclaims stuck or orphaned async jobs
  (frame swaps, propagation chunks, provider polls), risking wedged state and wasted
  spend. Per-op watchdogs exist for specific flows but there is no general reaper.
- **Pointer:** to be detailed in the audit report / ops notes.
- **DoD (target):** a durable reaper transitions stale jobs to a terminal state with
  retry/resume, covering every long-running edge op.

---

## REL-1 — PR #16 compat gate

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** The versioned video-preflight **compatibility** gate work (media
  compatibility, asset-authoritative master metadata) is not yet merged to `main`.
- **Pointer:** PR #16 / branch `feat/video-preflight-compat-gate`;
  `supabase/functions/_shared/videoPreflight.ts`.
- **DoD (target):** PR reviewed and merged, or explicitly parked with rationale.
