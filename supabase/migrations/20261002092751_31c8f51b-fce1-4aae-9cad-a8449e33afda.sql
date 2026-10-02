-- =============================================================================
-- SHOT OVERRIDES — the director's hand on a generated storyboard box
-- =============================================================================
-- Fendi (2026-10-02): "a manual override of the generated treatment inside each
-- storyboard box."
--
-- Why it keys on a SPEC ID and not a shots row: the storyboard renders from the
-- structured treatment (`video_projects.treatment_json` →
-- `structuredTreatmentToShotSpecs`), not from `public.shots`. A box the director
-- is looking at may have no shots row at all — the treatment is only committed
-- later. So the override hangs off (project_id, spec_id), survives regeneration
-- of the treatment, and is re-applied to whatever spec carries that id next.
--
-- Every column but the key is NULLABLE on purpose: an override states ONLY the
-- fields the director changed. A null field means "leave the generated value
-- alone", which is what lets the coverage planner keep filling a cleared camera
-- move while an explicitly set one is left untouched.
--
-- Additive: no existing table, policy or function is altered.
-- =============================================================================

create table if not exists public.shot_overrides (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.video_projects(id) on delete cascade,
  -- The ShotSpec id (a clip/grid key, not a uuid) the override belongs to.
  spec_id           text not null,
  user_id           uuid not null default auth.uid(),
  -- The overridable creative fields. Null = not overridden.
  direction         text,
  camera_motion     jsonb,
  framing           text,
  transition_in     jsonb,
  required_elements text[],
  notes             text,
  updated_at        timestamptz not null default now(),
  unique (project_id, spec_id)
);

create index if not exists shot_overrides_project on public.shot_overrides (project_id);

comment on table public.shot_overrides is
  'Per-storyboard-box manual override of the generated treatment, keyed by ShotSpec id (not a shots row — the storyboard renders from treatment_json). Null columns mean "not overridden" so the coverage planner still fills them.';

-- -----------------------------------------------------------------------------
-- RLS — owner-scoped, same shape as lyric_lines.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.shot_overrides to authenticated;
grant all on public.shot_overrides to service_role;

alter table public.shot_overrides enable row level security;
drop policy if exists "Users access own shot_overrides" on public.shot_overrides;
create policy "Users access own shot_overrides"
  on public.shot_overrides for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());