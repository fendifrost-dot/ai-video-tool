create table if not exists public.character_features (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  feature_type text not null,
  label text not null,
  file_url text,
  storage_path text,
  is_primary boolean not null default false,
  is_locked boolean not null default false,
  reinforce_on_drift boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now()
);

create index if not exists character_features_artist_idx
  on public.character_features(artist_id);
create index if not exists character_features_type_idx
  on public.character_features(artist_id, feature_type);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'character_features_feature_type_check') then
    alter table public.character_features
      add constraint character_features_feature_type_check
      check (feature_type in ('face','teeth','hands','tattoos','jewelry','hair','body'));
  end if;
end $$;

alter table public.character_features enable row level security;

drop policy if exists "Users access own character_features" on public.character_features;

create policy "Users access own character_features"
  on public.character_features
  for all
  using (artist_id in (select id from public.artists where user_id = auth.uid()))
  with check (artist_id in (select id from public.artists where user_id = auth.uid()));