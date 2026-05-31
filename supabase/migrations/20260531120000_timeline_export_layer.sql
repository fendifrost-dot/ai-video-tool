-- Universal Timeline / Export Layer
-- Idempotent — safe to re-run via Lovable SQL editor.

-- ---------------------------------------------------------------------------
-- 1. export_type extensions (Rule 1) — not referenced in this file
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'export_type' and e.enumlabel = 'premiere'
  ) then
    alter type public.export_type add value 'premiere';
  end if;
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'export_type' and e.enumlabel = 'resolve'
  ) then
    alter type public.export_type add value 'resolve';
  end if;
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'export_type' and e.enumlabel = 'remotion'
  ) then
    alter type public.export_type add value 'remotion';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. style_profiles (user_id ownership — prompt_templates precedent)
-- ---------------------------------------------------------------------------
create table if not exists public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references public.video_projects(id) on delete cascade,
  kind text not null,
  name text not null,
  params_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'style_profiles_kind_check') then
    alter table public.style_profiles
      add constraint style_profiles_kind_check
      check (kind in ('color', 'vfx'));
  end if;
end $$;

create index if not exists style_profiles_user_idx
  on public.style_profiles(user_id);

create index if not exists style_profiles_project_idx
  on public.style_profiles(project_id);

drop trigger if exists style_profiles_set_updated_at on public.style_profiles;
create trigger style_profiles_set_updated_at
  before update on public.style_profiles
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. timeline_manifests
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  song_analysis_id uuid references public.song_analyses(id) on delete set null,
  title text,
  aspect_ratio text,
  frame_rate int not null default 24,
  resolution text,
  duration_frames int,
  manifest_json jsonb not null default '{}'::jsonb,
  version_number int not null default 1,
  export_status public.export_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timeline_manifests_project_idx
  on public.timeline_manifests(project_id);

drop trigger if exists timeline_manifests_set_updated_at on public.timeline_manifests;
create trigger timeline_manifests_set_updated_at
  before update on public.timeline_manifests
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. timeline_items
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null references public.timeline_manifests(id) on delete cascade,
  storyboard_node_id uuid references public.storyboard_nodes(id) on delete set null,
  shot_id uuid references public.shots(id) on delete set null,
  asset_id uuid references public.project_assets(id) on delete set null,
  track text not null default 'V1',
  item_order int not null,
  start_frame int not null,
  end_frame int not null,
  trim_in_frame int not null default 0,
  trim_out_frame int,
  song_section text,
  cut_type text,
  transition_in_json jsonb not null default '{}'::jsonb,
  transition_out_json jsonb not null default '{}'::jsonb,
  speed numeric not null default 1,
  color_profile_id uuid references public.style_profiles(id) on delete set null,
  vfx_profile_id uuid references public.style_profiles(id) on delete set null,
  text_overlays_json jsonb not null default '[]'::jsonb,
  approved boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.timeline_items.approved is
  'Locked into this cut (edit decision). Distinct from clip approval on project_assets or storyboard_nodes.status.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'timeline_items_frame_order_check') then
    alter table public.timeline_items
      add constraint timeline_items_frame_order_check
      check (end_frame > start_frame);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timeline_items_cut_type_check') then
    alter table public.timeline_items
      add constraint timeline_items_cut_type_check
      check (cut_type is null or cut_type in (
        'hard_cut','crossfade','flash','whip','glitch','match_cut'
      ));
  end if;
end $$;

create index if not exists timeline_items_manifest_idx
  on public.timeline_items(manifest_id, track, item_order);

drop trigger if exists timeline_items_set_updated_at on public.timeline_items;
create trigger timeline_items_set_updated_at
  before update on public.timeline_items
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. export_packages extension (Rule 1)
-- ---------------------------------------------------------------------------
alter table public.export_packages
  add column if not exists manifest_id uuid references public.timeline_manifests(id) on delete set null;

create index if not exists export_packages_manifest_idx
  on public.export_packages(manifest_id);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table public.style_profiles enable row level security;
alter table public.timeline_manifests enable row level security;
alter table public.timeline_items enable row level security;

drop policy if exists "style_profiles_select" on public.style_profiles;
drop policy if exists "style_profiles_insert" on public.style_profiles;
drop policy if exists "style_profiles_update" on public.style_profiles;
drop policy if exists "style_profiles_delete" on public.style_profiles;

create policy "style_profiles_select" on public.style_profiles
  for select using (user_id = auth.uid() or user_id is null);
create policy "style_profiles_insert" on public.style_profiles
  for insert with check (user_id = auth.uid());
create policy "style_profiles_update" on public.style_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "style_profiles_delete" on public.style_profiles
  for delete using (user_id = auth.uid());

drop policy if exists "Users access own timeline_manifests" on public.timeline_manifests;
create policy "Users access own timeline_manifests"
  on public.timeline_manifests for all
  using (
    project_id in (select id from public.video_projects where user_id = auth.uid())
  )
  with check (
    project_id in (select id from public.video_projects where user_id = auth.uid())
  );

drop policy if exists "Users access own timeline_items" on public.timeline_items;
create policy "Users access own timeline_items"
  on public.timeline_items for all
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
