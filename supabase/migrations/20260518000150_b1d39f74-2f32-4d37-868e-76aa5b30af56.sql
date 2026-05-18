-- Phase 1 — Wardrobe & Location Image Library
alter table public.character_features
  add column if not exists tags text[] not null default '{}',
  add column if not exists source_url text;

create index if not exists character_features_tags_idx
  on public.character_features using gin (tags);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'character_features_feature_type_check') then
    alter table public.character_features drop constraint character_features_feature_type_check;
  end if;
  alter table public.character_features
    add constraint character_features_feature_type_check
    check (feature_type in (
      'face','teeth','hands','tattoos','jewelry','hair','body',
      'wardrobe_top','wardrobe_bottom','wardrobe_outerwear',
      'wardrobe_footwear','wardrobe_accessory'
    ));
end $$;

create table if not exists public.location_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_url text not null,
  storage_path text,
  tags text[] not null default '{}',
  source_url text,
  category text,
  notes text,
  uploaded_at timestamptz not null default now()
);
create index if not exists location_library_user_idx on public.location_library(user_id);
create index if not exists location_library_category_idx on public.location_library(user_id, category);
create index if not exists location_library_tags_idx on public.location_library using gin (tags);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'location_library_category_check') then
    alter table public.location_library drop constraint location_library_category_check;
  end if;
  alter table public.location_library
    add constraint location_library_category_check
    check (category is null or category in ('interior','exterior','urban','nature','fantasy','studio'));
end $$;

alter table public.location_library enable row level security;
drop policy if exists "Users access own location_library" on public.location_library;
create policy "Users access own location_library" on public.location_library
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.prop_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_url text not null,
  storage_path text,
  tags text[] not null default '{}',
  source_url text,
  category text,
  notes text,
  uploaded_at timestamptz not null default now()
);
create index if not exists prop_library_user_idx on public.prop_library(user_id);
create index if not exists prop_library_category_idx on public.prop_library(user_id, category);
create index if not exists prop_library_tags_idx on public.prop_library using gin (tags);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'prop_library_category_check') then
    alter table public.prop_library drop constraint prop_library_category_check;
  end if;
  alter table public.prop_library
    add constraint prop_library_category_check
    check (category is null or category in ('vehicle','instrument','animal','object','logo','other'));
end $$;

alter table public.prop_library enable row level security;
drop policy if exists "Users access own prop_library" on public.prop_library;
create policy "Users access own prop_library" on public.prop_library
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.project_location_picks (
  project_id uuid not null references public.video_projects(id) on delete cascade,
  location_id uuid not null references public.location_library(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (project_id, location_id)
);
create index if not exists project_location_picks_project_idx on public.project_location_picks(project_id);
alter table public.project_location_picks enable row level security;
drop policy if exists "Users access own project_location_picks" on public.project_location_picks;
create policy "Users access own project_location_picks" on public.project_location_picks
  for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

create table if not exists public.project_prop_picks (
  project_id uuid not null references public.video_projects(id) on delete cascade,
  prop_id uuid not null references public.prop_library(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (project_id, prop_id)
);
create index if not exists project_prop_picks_project_idx on public.project_prop_picks(project_id);
alter table public.project_prop_picks enable row level security;
drop policy if exists "Users access own project_prop_picks" on public.project_prop_picks;
create policy "Users access own project_prop_picks" on public.project_prop_picks
  for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wardrobe-refs','wardrobe-refs',false,20971520,array['image/jpeg','image/png','image/webp']),
  ('location-refs','location-refs',false,20971520,array['image/jpeg','image/png','image/webp']),
  ('prop-refs','prop-refs',false,20971520,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare buckets text[] := array['wardrobe-refs','location-refs','prop-refs']; b text; op text;
begin
  foreach b in array buckets loop
    foreach op in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists "%s_%s_own" on storage.objects', b, op);
    end loop;
  end loop;
end $$;

do $$
declare buckets text[] := array['wardrobe-refs','location-refs','prop-refs']; b text;
begin
  foreach b in array buckets loop
    execute format($f$create policy "%1$s_select_own" on storage.objects for select using (bucket_id = %1$L and auth.uid()::text = (storage.foldername(name))[1])$f$, b);
    execute format($f$create policy "%1$s_insert_own" on storage.objects for insert with check (bucket_id = %1$L and auth.uid()::text = (storage.foldername(name))[1])$f$, b);
    execute format($f$create policy "%1$s_update_own" on storage.objects for update using (bucket_id = %1$L and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = %1$L and auth.uid()::text = (storage.foldername(name))[1])$f$, b);
    execute format($f$create policy "%1$s_delete_own" on storage.objects for delete using (bucket_id = %1$L and auth.uid()::text = (storage.foldername(name))[1])$f$, b);
  end loop;
end $$;