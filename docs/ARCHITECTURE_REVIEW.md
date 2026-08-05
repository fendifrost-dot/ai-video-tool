# ARCHITECTURE_REVIEW.md — change classes & required review

> Not every change carries the same blast radius. This document sorts changes into
> three classes and fixes the **minimum review** each class requires before it can
> merge to `main`. It is linked from the `CLAUDE.md` **PROJECT POLICY** section and
> is binding on agents and humans alike.

Last reviewed: **2026-08-05**.

---

## The three classes

### Class A — no review required
Documentation, tests, and non-behavioral UI.

- Markdown / docs (this file, `SECURITY.md`, `RISK_REGISTER.md`, handoffs).
- Test files that add or refine coverage **without** changing product behavior.
- Pure presentational UI: copy, styling, layout — no new data flow, no new endpoint,
  no auth/storage/provider touchpoint.

**Gate:** self-merge is fine. Still run the suite locally (`npx vitest run
--exclude '**/.claude/worktrees/**'`) and report counts **by category**
(see [`TEST_TAXONOMY.md`](TEST_TAXONOMY.md)).

### Class B — one reviewer
Ordinary feature work with a contained blast radius.

- New or changed **features** that don't cross a Class-C surface.
- New/changed **edge endpoints** whose behavior is contained (no new auth model, no
  new provider, no new storage bucket, no cross-tenant data path).
- New/changed **queries** over already-owned tables under existing RLS.

**Gate:** one competent reviewer approves. Reviewer confirms tests updated and the
change touches no Class-C surface (if it does, it escalates to Class C).

### Class C — architecture + product + security review before merge
Anything touching a trust boundary, money, identity, or the LOCKED pipeline.

A change is **Class C** if it touches any of:

| Surface | Why it's Class C |
|---------|------------------|
| **Storage** (buckets, `storage.objects` policies, signed-URL logic) | Access-control boundary — see `SECURITY.md` §3 |
| **Providers** (Fal, Grok/xAI, Control Center proxying, provider keys) | Trust boundary + spend + secrets |
| **Auth** (RLS policies, roles, JWT/session handling, edge caller-identity checks) | The core isolation invariant — RISK-001 lives here |
| **Rendering** (garment swap, keyframe/propagation, face-restore, compositing) | The LOCKED architecture; fidelity + brand integrity |
| **Timelines** (timeline engine, export/commit, assembly) | Data-model integrity across the edit graph |
| **Benchmarks** (canonical benchmark media, fidelity thresholds, kill criteria) | Ground-truth for pipeline decisions; drift here misleads everything downstream |
| **Security** (any file under the `SECURITY.md` threat model; SSRF/urlValidator; diagnostics sanitization) | Direct security posture |
| **Orchestration** (durable job queues, chunk status/retry/resume, reapers, watchdogs) | Reliability + spend + wedged-state risk |

**Gate:** **three sign-offs before merge** — an **architecture** reviewer, a
**product** reviewer, and a **security** reviewer. Also required:
- an entry or update in [`RISK_REGISTER.md`](../RISK_REGISTER.md) if the change opens,
  moves, or closes a risk;
- for RLS/auth/storage changes, the corresponding **RLS integration test** (the
  currently-empty category) must accompany the change;
- for rendering/benchmark changes, conformance to `docs/VIDEO_SWAP_ARCHITECTURE.md`
  and its KILL CRITERION.

---

## How to classify (quick rule)

1. Touches any **Class-C surface** above? → **Class C** (three sign-offs).
2. Otherwise changes **product behavior / endpoints / queries**? → **Class B** (one reviewer).
3. Otherwise (docs / tests / presentational UI only)? → **Class A** (no review).

When in doubt, escalate one class up. Misclassifying a Class-C change as Class B is
how RISK-001 shipped — a dev-only RLS migration merged without a security review.
