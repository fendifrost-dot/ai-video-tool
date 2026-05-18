-- Phase 2 — Looks Composer
create table if not exists public.artist_looks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft',
  generated_image_url text,
  generated_storage_path text,
  thumbnail_url text,
  composition_recipe_json jsonb not null default '{}'::jsonb,
  pipeline_used text,
  cost_cents integer not null default 0,
  iterations integer not null default 1,
  parent_look_id uuid references public.artist_looks(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'artist_looks_status_check'
  ) then
    alter table public.artist_looks drop constraint artist_looks_status_check;
  end if;
  alter table public.artist_looks
    add constraint artist_looks_status_check
    check (status in ('draft','approved','locked','archived'));
end $$;

create index if not exists artist_looks_artist_idx on public.artist_looks(artist_id);
create index if not exists artist_looks_status_idx on public.artist_looks(artist_id, status);
create index if not exists artist_looks_parent_idx on public.artist_looks(parent_look_id);

alter table public.artist_looks enable row level security;

drop policy if exists "Users access own artist_looks" on public.artist_looks;
create policy "Users access own artist_looks"
  on public.artist_looks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_artist_looks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists artist_looks_set_updated_at on public.artist_looks;
create trigger artist_looks_set_updated_at
  before update on public.artist_looks
  for each row execute function public.set_artist_looks_updated_at();

create table if not exists public.project_look_picks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  look_id uuid not null references public.artist_looks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  picked_at timestamptz not null default now(),
  unique(project_id, look_id)
);

create index if not exists project_look_picks_project_idx on public.project_look_picks(project_id);
create index if not exists project_look_picks_look_idx on public.project_look_picks(look_id);

alter table public.project_look_picks enable row level security;

drop policy if exists "Users access own project_look_picks" on public.project_look_picks;
create policy "Users access own project_look_picks"
  on public.project_look_picks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.shots
  add column if not exists locked_look_id uuid
    references public.artist_looks(id) on delete set null;

create index if not exists shots_locked_look_idx on public.shots(locked_look_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('look-composites', 'look-composites', false, 20971520,
    array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare op text;
begin
  foreach op in array array['select','insert','update','delete'] loop
    execute format(
      'drop policy if exists "look_composites_%s_own" on storage.objects', op
    );
  end loop;
end $$;

create policy "look_composites_select_own" on storage.objects
  for select
  using (
    bucket_id = 'look-composites'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "look_composites_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'look-composites'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "look_composites_update_own" on storage.objects
  for update
  using (
    bucket_id = 'look-composites'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'look-composites'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "look_composites_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'look-composites'
    and auth.uid()::text = (storage.foldername(name))[1]
  );