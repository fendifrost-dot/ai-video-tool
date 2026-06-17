-- Phases 5–6 — Manufacturing Studio + Collections
-- Idempotent: safe to re-run.

-- =============================================================================
-- Phase 5 — tech_packs + manufacturing_packages
-- =============================================================================
create table if not exists public.tech_packs (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'draft',
  spec_json     jsonb not null default '{}'::jsonb,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tech_packs_status_check') then
    alter table public.tech_packs drop constraint tech_packs_status_check;
  end if;
  alter table public.tech_packs
    add constraint tech_packs_status_check
    check (status in ('draft', 'approved', 'sent', 'archived'));
end $$;

create index if not exists tech_packs_product_idx on public.tech_packs(product_id);

alter table public.tech_packs enable row level security;
drop policy if exists "Users access own tech_packs" on public.tech_packs;
create policy "Users access own tech_packs"
  on public.tech_packs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.manufacturing_packages (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  tech_pack_id  uuid references public.tech_packs(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  package_json  jsonb not null default '{}'::jsonb,
  storage_path  text,
  created_at    timestamptz not null default now()
);

create index if not exists manufacturing_packages_product_idx
  on public.manufacturing_packages(product_id);

alter table public.manufacturing_packages enable row level security;
drop policy if exists "Users access own manufacturing_packages" on public.manufacturing_packages;
create policy "Users access own manufacturing_packages"
  on public.manufacturing_packages for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- Phase 6 — collections
-- =============================================================================
create table if not exists public.collections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  season        text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists collections_user_idx on public.collections(user_id);

alter table public.collections enable row level security;
drop policy if exists "Users access own collections" on public.collections;
create policy "Users access own collections"
  on public.collections for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.collection_products (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (collection_id, product_id)
);

create index if not exists collection_products_collection_idx
  on public.collection_products(collection_id);

alter table public.collection_products enable row level security;
drop policy if exists "Users access own collection_products" on public.collection_products;
create policy "Users access own collection_products"
  on public.collection_products for all
  using (
    collection_id in (select id from public.collections where user_id = auth.uid())
  )
  with check (
    collection_id in (select id from public.collections where user_id = auth.uid())
  );

-- updated_at triggers
create or replace function public.set_tech_packs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tech_packs_set_updated_at on public.tech_packs;
create trigger tech_packs_set_updated_at
  before update on public.tech_packs
  for each row execute function public.set_tech_packs_updated_at();

create or replace function public.set_collections_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_collections_updated_at();
