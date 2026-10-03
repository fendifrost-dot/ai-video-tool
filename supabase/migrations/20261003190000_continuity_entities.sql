-- =============================================================================
-- Continuity entities (Fendi, 2026-10-03: "A storyboard shot should reference these entities rather than recreate
-- them from prose.")
--
-- A place, a prop or a lighting state that more than one shot of a project shows, described ONCE:
--
--   • kind         location | prop | lighting
--   • key          its identity inside the project (PARIS_BLACK_RUNWAY) — what a shot record points at
--   • description  the canonical description every shot that points at it is generated from
--   • constraints  what must always / never be true of it when it is drawn
--   • approved_asset_id     the approved reference picture (a project_assets row — media is never copied)
--   • reference_asset_ids   the other reference pictures, uploaded or generated for it
--
-- Wardrobe LOOKS are not here: they are the existing artist_looks records, and a shot points at one the same way
-- (shots.spec_json → continuity.look). Nothing in this table duplicates them.
--
-- A shot points at entities from its own record (shots.spec_json → continuity {location, props[], lighting}) and
-- a timed event may point at a lighting state. There is no join table: the shot record stays the one place a
-- shot is described.
--
-- Additive and idempotent.
-- =============================================================================

create table if not exists public.continuity_entities (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id          uuid not null references public.video_projects(id) on delete cascade,
  kind                text not null check (kind in ('location', 'prop', 'lighting')),
  key                 text not null check (key ~ '^[A-Z0-9][A-Z0-9_]{0,59}$'),
  name                text not null,
  description         text not null default '',
  constraints         text not null default '',
  approved_asset_id   uuid references public.project_assets(id) on delete set null,
  reference_asset_ids uuid[] not null default '{}',
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, key)
);
create index if not exists continuity_entities_project_idx on public.continuity_entities (project_id, kind);

grant select, insert, update, delete on public.continuity_entities to authenticated;
grant all on public.continuity_entities to service_role;
alter table public.continuity_entities enable row level security;
drop policy if exists "Users access own continuity_entities" on public.continuity_entities;
create policy "Users access own continuity_entities"
  on public.continuity_entities for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

comment on table public.continuity_entities is
  'A place, prop or lighting state several shots of a project share, described once. Shots point at it by key from their own record; its approved picture is a project_assets row.';
