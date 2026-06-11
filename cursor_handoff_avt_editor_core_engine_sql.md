# Handoff: Apply Editor Core Engine schema (Supabase SQL)

**For:** Claude / orchestrator executing in Lovable Supabase SQL editor  
**Repo:** `fendifrost-dot/ai-video-tool`  
**Why:** App was redeployed but **`timeline_versions` and `timeline_events` tables were never created**. Editor Core Engine code writes to these tables on timeline save/reorder/update. Without the migration, events fail silently and version snapshots are not stored.

**Scope:** SQL only. No Control Center changes. No product catalog tables (separate handoff).

---

## Prerequisites

These tables **must already exist** (they do on production if timeline editor works today):

- `public.timeline_manifests`
- `public.timeline_items`
- `public.video_projects`

If `timeline_manifests` is missing, run `supabase/migrations/20260531120000_timeline_export_layer.sql` first — not included here.

---

## Step 1 — Run this SQL in Lovable Supabase SQL editor

Copy the **entire block** below. It is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) — safe to re-run.

```sql
-- Editor Core Engine — version snapshots + append-only event log
-- Source: supabase/migrations/20260610120000_editor_core_engine.sql
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. timeline_versions — full manifest snapshot per commit
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_versions (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.timeline_manifests(id) on delete cascade,
  version_number int not null,
  actor_type text not null,
  actor_name text,
  change_summary text not null,
  manifest_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint timeline_versions_actor_type_check
    check (actor_type in ('user', 'agent', 'system')),
  constraint timeline_versions_manifest_version_unique
    unique (manifest_id, version_number)
);

create index if not exists timeline_versions_manifest_idx
  on public.timeline_versions(manifest_id, version_number desc);

comment on table public.timeline_versions is
  'Immutable manifest snapshots. Editor Core Engine writes one row per manifest commit.';

-- ---------------------------------------------------------------------------
-- 2. timeline_events — granular audit log (agents + humans)
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.timeline_manifests(id) on delete cascade,
  version_id uuid references public.timeline_versions(id) on delete set null,
  event_type text not null,
  actor_type text not null,
  actor_name text,
  change_summary text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint timeline_events_actor_type_check
    check (actor_type in ('user', 'agent', 'system'))
);

create index if not exists timeline_events_manifest_idx
  on public.timeline_events(manifest_id, created_at desc);

create index if not exists timeline_events_version_idx
  on public.timeline_events(version_id)
  where version_id is not null;

comment on table public.timeline_events is
  'Append-only editor event log. Every UI/agent command should emit an event.';

-- ---------------------------------------------------------------------------
-- 3. RLS — project ownership via manifest → video_projects
-- ---------------------------------------------------------------------------
alter table public.timeline_versions enable row level security;
alter table public.timeline_events enable row level security;

drop policy if exists "Users access own timeline_versions" on public.timeline_versions;
create policy "Users access own timeline_versions"
  on public.timeline_versions for all
  using (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  )
  with check (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  );

drop policy if exists "Users access own timeline_events" on public.timeline_events;
create policy "Users access own timeline_events"
  on public.timeline_events for all
  using (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  )
  with check (
    manifest_id in (
      select id from public.timeline_manifests where project_id in (
        select id from public.video_projects where user_id = auth.uid()
      )
    )
  );
```

**Expected result:** Success with no errors. If you see `relation "timeline_manifests" does not exist`, stop and apply the timeline export layer migration first.

---

## Step 2 — Verify tables exist

Run:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('timeline_versions', 'timeline_events')
order by table_name;
```

**Expected:** 2 rows — `timeline_events`, `timeline_versions`.

Optional column check:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'timeline_events'
order by ordinal_position;
```

---

## Step 3 — Confirm app code is deployed

The SQL alone is not enough. The **Editor Core Engine** client code must be on the deployed branch:

| Path | Purpose |
|------|---------|
| `src/lib/timeline/engine/` | `persistManifestCommit`, `persistTimelineEvent` |
| `src/lib/queries/timelineManifests.ts` | Save snapshot → versions + events |
| `src/lib/queries/timelineItems.ts` | Reorder/update/seed → events |
| `src/lib/queries/timelineEvents.ts` | Read event log (future UI) |
| `supabase/migrations/20260610120000_editor_core_engine.sql` | Same SQL as Step 1 (for repo record) |

**If this code is not on `main` yet:** commit + push + redeploy frontend after SQL succeeds.

Claude: check `git log` / diff for `src/lib/timeline/engine/`. If missing from remote, push before smoke test.

---

## Step 4 — Smoke test (manual)

1. Open any project → **Music Video Editor** (`/projects/{id}/timeline`).
2. Create timeline if none exists.
3. Seed from storyboard or shots (if items empty).
4. Reorder a clip (up/down).
5. Click **Save manifest snapshot**.

Then in SQL editor:

```sql
select id, event_type, actor_type, actor_name, change_summary, created_at
from public.timeline_events
order by created_at desc
limit 10;
```

**Expected:** Rows like `clips_reordered`, `manifest_committed`, `timeline_seeded`.

```sql
select manifest_id, version_number, actor_type, change_summary, created_at
from public.timeline_versions
order by created_at desc
limit 5;
```

**Expected:** At least one row after **Save manifest snapshot** with `version_number` incremented.

---

## What this does NOT include

| Item | Handoff |
|------|---------|
| Product catalog (`products`, etc.) | `cursor_handoff_avt_product_catalog_migration.md` — not started |
| `timeline_tracks` table | Video editor Step 3 — future |
| CC / faceswap changes | Already on CC `main` separately |
| Regenerating `src/integrations/supabase/types.ts` | Optional; app uses local engine types until Lovable regenerates |

---

## Hard rules

- **SQL only in this handoff** — no Lovable chat for app code edits unless engine files are missing from deploy.
- **Do not drop** `timeline_manifests` or `timeline_items`.
- **Do not rename** `artist_looks`.
- **Idempotent** — re-running Step 1 is OK.

---

## Rollback (only if something breaks)

```sql
drop table if exists public.timeline_events;
drop table if exists public.timeline_versions;
```

Timeline editor continues to work on `timeline_items` alone (pre-engine behavior). You lose audit log only.

---

## Success criteria

- [ ] `timeline_versions` and `timeline_events` exist with RLS enabled
- [ ] Save manifest snapshot creates a version row + `manifest_committed` event
- [ ] Reorder creates `clips_reordered` event
- [ ] No errors in browser console on timeline page

---

## Commit message (if pushing engine code to git)

```
feat(avt): Editor Core Engine — timeline_versions + timeline_events

Manifest commits now write version snapshots and an append-only event log
for human and agent auditability. Wired into save snapshot, reorder,
update, seed, and reset flows.

Requires SQL migration 20260610120000_editor_core_engine.sql on Supabase.
```
