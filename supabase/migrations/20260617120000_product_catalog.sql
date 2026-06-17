-- Phase 1 — Product Catalog (Design Studio + Product Library)
-- Canonical brand-scoped garment entities. Idempotent: safe to re-run.

-- =============================================================================
-- 1. Enums
-- =============================================================================
do $$ begin
  create type public.product_status as enum (
    'concept', 'approved', 'in_production', 'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_slot as enum (
    'top', 'bottom', 'outerwear', 'footwear', 'accessory', 'dress'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_asset_role as enum (
    'design_concept',
    'inspiration',
    'mood_board',
    'logo_placement_experiment',
    'front', 'back', 'side', 'detail',
    'on_model_reference',
    'tech_flat_front', 'tech_flat_back', 'tech_flat_side',
    'material_swatch',
    'manufacturer_spec'
  );
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 2. products
-- =============================================================================
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  sku              text not null,
  name             text not null,
  description      text,
  status           public.product_status not null default 'concept',
  slot             public.product_slot not null,
  season           text,
  materials_json   jsonb not null default '{}'::jsonb,
  metadata_json    jsonb not null default '{}'::jsonb,
  fit_profile_json jsonb not null default '{}'::jsonb,
  design_prompt    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, sku)
);

create index if not exists products_user_idx on public.products(user_id);
create index if not exists products_status_idx on public.products(user_id, status);
create index if not exists products_slot_idx on public.products(user_id, slot);

alter table public.products enable row level security;

drop policy if exists "Users access own products" on public.products;
create policy "Users access own products"
  on public.products
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 3. product_variants
-- =============================================================================
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  name          text not null,
  sku_suffix    text,
  colorway_json jsonb not null default '{}'::jsonb,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists product_variants_product_idx
  on public.product_variants(product_id);

alter table public.product_variants enable row level security;

drop policy if exists "Users access own product_variants" on public.product_variants;
create policy "Users access own product_variants"
  on public.product_variants
  for all
  using (
    product_id in (select id from public.products where user_id = auth.uid())
  )
  with check (
    product_id in (select id from public.products where user_id = auth.uid())
  );

-- =============================================================================
-- 4. product_assets
-- =============================================================================
create table if not exists public.product_assets (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete set null,
  asset_role       public.product_asset_role not null,
  file_url         text not null,
  storage_path     text,
  reference_images jsonb not null default '[]'::jsonb,
  sort_order       int not null default 0,
  uploaded_at      timestamptz not null default now()
);

create index if not exists product_assets_product_idx
  on public.product_assets(product_id);

create index if not exists product_assets_role_idx
  on public.product_assets(product_id, asset_role);

alter table public.product_assets enable row level security;

drop policy if exists "Users access own product_assets" on public.product_assets;
create policy "Users access own product_assets"
  on public.product_assets
  for all
  using (
    product_id in (select id from public.products where user_id = auth.uid())
  )
  with check (
    product_id in (select id from public.products where user_id = auth.uid())
  );

-- =============================================================================
-- 5. product_wardrobe_links (bridge — Phase 2 UI)
-- =============================================================================
create table if not exists public.product_wardrobe_links (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.products(id) on delete cascade,
  character_feature_id  uuid not null references public.character_features(id) on delete cascade,
  created_at            timestamptz not null default now(),
  unique (character_feature_id)
);

create index if not exists product_wardrobe_links_product_idx
  on public.product_wardrobe_links(product_id);

alter table public.product_wardrobe_links enable row level security;

drop policy if exists "Users access own product_wardrobe_links" on public.product_wardrobe_links;
create policy "Users access own product_wardrobe_links"
  on public.product_wardrobe_links
  for all
  using (
    product_id in (select id from public.products where user_id = auth.uid())
  )
  with check (
    product_id in (select id from public.products where user_id = auth.uid())
  );

-- =============================================================================
-- 6. updated_at triggers
-- =============================================================================
create or replace function public.set_products_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_products_updated_at();

create or replace function public.set_product_variants_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists product_variants_set_updated_at on public.product_variants;
create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_product_variants_updated_at();

-- =============================================================================
-- 7. Storage bucket — product-assets
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-assets', 'product-assets', false, 20971520,
    array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  op text;
begin
  foreach op in array array['select','insert','update','delete'] loop
    execute format(
      'drop policy if exists "product-assets_%s_own" on storage.objects',
      op
    );
  end loop;
end $$;

do $$
begin
  create policy "product-assets_select_own" on storage.objects
    for select
    using (
      bucket_id = 'product-assets'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy "product-assets_insert_own" on storage.objects
    for insert
    with check (
      bucket_id = 'product-assets'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy "product-assets_update_own" on storage.objects
    for update
    using (
      bucket_id = 'product-assets'
      and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
      bucket_id = 'product-assets'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy "product-assets_delete_own" on storage.objects
    for delete
    using (
      bucket_id = 'product-assets'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
end $$;

-- Path convention: product-assets {user_id}/{product_id}/{filename}
