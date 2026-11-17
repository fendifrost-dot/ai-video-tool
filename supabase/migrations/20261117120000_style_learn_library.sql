-- Style Learn library. NOT APPLIED.
-- Class C (a new assembly record beside the timeline). Do not run this in Lovable
-- until Fendi approves it. This file does not touch storage policies and it does
-- not grant service_role.
--
-- These tables are not public.style_profiles. That table is the timeline's
-- color/vfx rows (kind color|vfx, params_json).
--
-- Rollback: drop table public.style_learn_effects; drop table public.style_learn_profiles;

create table if not exists public.style_learn_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.video_projects (id) on delete cascade,
  label text not null default '',
  summary text not null default '',
  document jsonb not null,
  superseded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists style_learn_profiles_project_idx
  on public.style_learn_profiles (project_id, created_at desc);

create table if not exists public.style_learn_effects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.video_projects (id) on delete cascade,
  profile_id uuid references public.style_learn_profiles (id) on delete set null,
  effect_key text not null,
  taxonomy_id text not null,
  plain text not null,
  variant_of uuid references public.style_learn_effects (id) on delete set null,
  document jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists style_learn_effects_project_idx
  on public.style_learn_effects (project_id, effect_key);

alter table public.style_learn_profiles enable row level security;
alter table public.style_learn_effects enable row level security;

drop policy if exists style_learn_profiles_owner on public.style_learn_profiles;
create policy style_learn_profiles_owner on public.style_learn_profiles
  for all to authenticated
  using (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  );

drop policy if exists style_learn_effects_owner on public.style_learn_effects;
create policy style_learn_effects_owner on public.style_learn_effects
  for all to authenticated
  using (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  );

grant select, insert, update, delete on public.style_learn_profiles to authenticated;
grant select, insert, update, delete on public.style_learn_effects to authenticated;
