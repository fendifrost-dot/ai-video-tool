# RISK_REGISTER.md — AI Video Tool (AVT)

> Standing register of known risks. **Updated by every audit** alongside
> [`SECURITY.md`](SECURITY.md). Each entry: id, title, severity, confidence, status,
> owner, and a pointer to where the detail/remediation lives. The forensic narrative
> for security items is the pre-API audit report, [`docs/audit_pre_api.md`](docs/audit_pre_api.md).
>
> **Severity:** Critical / High / Medium / Low · **Confidence:** Confirmed / Likely /
> Suspected · **Status:** Open / In-remediation / Mitigated / Closed.

Last reviewed: **2026-08-05**.

| id | Title | Severity | Confidence | Status | Owner |
|----|-------|----------|-----------|--------|-------|
| [RISK-001](#risk-001--anonymous-rls--bucket-exposure) | Anonymous RLS / bucket exposure | Critical | Confirmed | **In-remediation** (revert migration authored, `docs/security/RISK-001/`; awaiting Class-C review + apply) | Platform / Products (AVT) |
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
  Class-C architecture + security review). Remediation is **split**: **Part A** =
  the five TABLES (revert `*_anon_all` + drop stray `*_open_test` / `single_tenant_all`
  policies the identity audit found live, restore owner-scoped RLS) — authored now;
  **Part B** = the `look-composites` **storage bucket**, deferred until **after the
  storage re-key** (bucket stays exposed until then — tracked residual) ·
  **Owner:** Platform / Products (AVT)
- **Summary:** Any anonymous (`anon`) caller can read, write, and delete real user
  data across several core tables and the `look-composites` storage bucket.
- **Root cause:** Migration `supabase/migrations/20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql`
  (dated **2026-05-23**, header: *"DEV ONLY … Revert before production"*) dropped the
  owner-scoped policies and created `FOR ALL TO anon, authenticated USING (true)
  WITH CHECK (true)` on:
  - `public.artists`
  - `public.character_features`
  - `public.location_library`
  - `public.prop_library`
  - `public.artist_looks`

  and opened the **`look-composites`** bucket to `anon` for
  `SELECT / INSERT / UPDATE / DELETE`. **No subsequent migration reverts it.**
- **Not implicated:** `provider_capabilities`'s `SELECT ... USING (true)` is a
  read-only public catalog — acceptable, not part of this risk (see `SECURITY.md` §2.2).
- **Impact:** Full loss of per-user isolation on identity/wardrobe data + rendered
  composites: cross-tenant read, tamper, and delete by an unauthenticated client.
- **Definition of Done:** an `anon` client **cannot read or write any protected row
  or object** — the five tables and the `look-composites` bucket are back to
  owner-scoped RLS, and the dev-only migration is reverted by a paired migration.
- **Validation:** **RLS integration tests** that drive an `anon` Supabase client and
  assert denial on each affected table + the bucket (this is a currently-empty test
  category — see [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md)).
- **Remediation ownership:** handled separately as a **forensic report + targeted
  revert migration**; this register tracks status only. **Do not "fix" it in docs.**

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
