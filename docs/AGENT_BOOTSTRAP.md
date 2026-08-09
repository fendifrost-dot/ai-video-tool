# Agent Bootstrap — pre-flight checklist (run BEFORE any work)

**Read this first, every session, before touching code, SQL, or deploys.**

This is a gate, not a formality. **If you cannot confidently answer every question below from evidence — not memory — you do NOT proceed.** Stop and resolve the gap (read the manifest, check `git remote`/`git status`, ask the user) before doing anything.

Machine-readable source of truth: [`.deployment/manifest.yml`](../.deployment/manifest.yml). Human policy: [`CLAUDE.md`](../CLAUDE.md) (PROJECT POLICY block).

---

## The six questions

| # | Question | Correct answer for AVT | How to verify |
|---|----------|------------------------|---------------|
| 1 | **Repository?** | `github.com/fendifrost-dot/ai-video-tool` (the canonical repo — NOT an archived or duplicate clone) | `git remote -v` matches `canonical_repo` in the manifest |
| 2 | **Deployment target?** | **Lovable** — frontend via Lovable **Publish**; edge functions via Lovable **Edge Functions → redeploy** (Publish ≠ edge redeploy) | `deployment.provider: lovable` in the manifest |
| 3 | **Database?** | **Lovable-managed Supabase** — SQL via **Lovable's SQL Editor** only. **Never** a standalone supabase.com dashboard or local `supabase` CLI. | `database.provider: lovable_supabase` in the manifest |
| 4 | **Project ref?** | `qoyxgnkvjukovkrvdaiq` | `database.project_ref` in the manifest |
| 5 | **Canonical branch?** | `main` | `canonical_branch` in the manifest; confirm with `git status` |
| 6 | **Source of truth?** | This repo's `main` + `.deployment/manifest.yml`. If reality disagrees with the manifest, **STOP** — do not work around it. | — |

---

## Kill this assumption before you start

**Managed service ≠ operational access to the underlying platform.** AVT runs on Supabase
technology *underneath* Lovable, but the team has **no** "Supabase environment": no
dashboard, CLI, service-role key, or Admin API to operate. Lovable is the only control
plane; the underlying Supabase is an implementation detail, not an operational surface.
Never reason *"it's Supabase, so I'll use the Supabase dashboard/CLI/Admin API."* Everything
goes through Lovable or the authenticated app/browser. Full statement:
[`ENVIRONMENT.md`](../ENVIRONMENT.md) → "Principle: managed service ≠ operational access to
the underlying platform."

---

## Forbidden — doing any of these means STOP work immediately

(Canonical list lives in [`.deployment/manifest.yml`](../.deployment/manifest.yml) → `forbidden`.)

- **`standalone_supabase`** — opening / logging into a standalone supabase.com dashboard for ANY reason (migrations, schema, data) **unless Lovable links you into it**.
- **`archived_clone`** — working from an archived or duplicate clone instead of the canonical repo.
- **`local_sql`** — running SQL locally or via the `supabase` CLI instead of Lovable's SQL Editor. **A CLI 403 / "wrong account" is a FALSE WALL, not a blocker** — do not treat it as a reason to open a dashboard or stall.
- **`stale_repo`** — acting on a stale checkout. Confirm you are on canonical `main` and up to date first.

---

## If a check fails

1. **Do not proceed** with the task.
2. Re-read [`.deployment/manifest.yml`](../.deployment/manifest.yml) and the [`CLAUDE.md`](../CLAUDE.md) PROJECT POLICY block.
3. If the discrepancy is real (wrong remote, stale branch, ambiguous target), surface it to the user and get an explicit answer before continuing.

> A wrong answer here is how a deploy agent ends up in the wrong repo, or opening a standalone Supabase dashboard. The two minutes this checklist takes is cheaper than the cleanup.
