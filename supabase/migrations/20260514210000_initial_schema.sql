-- AI Music Video OS — Initial Schema
-- Single-user MVP. Every table is owner-scoped via user_id = auth.uid().
-- Author: Claude (planning + drafting). Review before applying.
-- Apply: paste into Lovable Supabase SQL editor, or `supabase db push` if CLI linked.

-- =============================================================================
-- 0. Extensions
-- =============================================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive text where useful

-- =============================================================================
-- 1. Enums
-- =============================================================================
create type project_status as enum ('draft', 'in_production', 'editing', 'complete', 'archived');

create type artist_asset_type as enum (
  'face_front','face_left','face_right','face_3q_left','face_3q_right',
  'face_top','face_bottom','mouth_open','mouth_closed',
  'expression','body','wardrobe','jewelry','tattoo','hair','other'
);

create type shot_type as enum ('performance','b_roll','narrative','vfx','transition','lyric_visual');
create type shot_status as enum ('planned','generated','approved','rejected','needs_regen');
create type shot_priority as enum ('low','normal','high','hero');

create type provider_name as enum (
  'runway','veo','gemini','grok','higgsfield','pika','fal',
  'openai','firefly','frame_io','manual','other'
);

create type prompt_template_category as enum (
  'text_to_video','image_to_video','lipsync','greenscreen',
  'vfx','b_roll','transition','performance','universal'
);

create type project_asset_type as enum (
  'reference_image','reference_video','audio','lyrics_doc',
  'generated_still','generated_clip','edited_clip',
  'premiere_export','ae_asset','lut','overlay','sfx',
  'thumbnail','social_cutdown','other'
);

create type approval_status as enum ('pending','approved','rejected','archived');

create type export_type as enum (
  'premiere_ready','after_effects','full_package','approved_clips_only','review_pack'
);

create type export_status as enum ('pending','building','complete','failed');

create type provider_job_status as enum ('queued','running','succeeded','failed','cancelled');

-- =============================================================================
-- 2. Shared trigger function: updated_at
-- =============================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 3. artists — reusable across projects
-- =============================================================================
create table public.artists (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  name                     text not null,
  bio                      text,
  identity_profile_json    jsonb not null default '{}'::jsonb,
  continuity_rules         text,
  forbidden_inaccuracies   text,
  preferred_lighting       text,
  camera_rules             text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index artists_user_id_idx on public.artists (user_id);
create trigger artists_set_updated_at before update on public.artists
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 4. artist_assets — face refs, 360 set, expressions, wardrobe samples
-- =============================================================================
create table public.artist_assets (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  artist_id              uuid not null references public.artists(id) on delete cascade,
  asset_type             artist_asset_type not null,
  file_url               text not null,                    -- supabase storage path
  description            text,
  tags                   text[] not null default '{}',
  is_primary_reference   boolean not null default false,
  metadata_json          jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
create index artist_assets_user_id_idx on public.artist_assets (user_id);
create index artist_assets_artist_id_idx on public.artist_assets (artist_id);
create index artist_assets_type_idx on public.artist_assets (artist_id, asset_type);

-- =============================================================================
-- 5. video_projects
-- =============================================================================
create table public.video_projects (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  artist_id             uuid references public.artists(id) on delete set null,
  title                 text not null,
  song_title            text,
  genre                 text,
  bpm                   numeric(6,2),
  mood                  text,
  visual_style          text,
  color_palette         text[] not null default '{}',
  wardrobe_notes        text,
  lyrics                text,
  song_structure_json   jsonb not null default '{}'::jsonb,    -- [{section:'intro', start:0, end:8}]
  treatment_json        jsonb not null default '{}'::jsonb,    -- treatment generator output
  status                project_status not null default 'draft',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index video_projects_user_id_idx on public.video_projects (user_id);
create index video_projects_artist_id_idx on public.video_projects (artist_id);
create index video_projects_status_idx on public.video_projects (user_id, status);
create trigger video_projects_set_updated_at before update on public.video_projects
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 6. shots
-- =============================================================================
create table public.shots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  project_id          uuid not null references public.video_projects(id) on delete cascade,
  shot_number         int not null,
  song_section        text,                                   -- 'verse_1', 'hook', 'bridge'
  timestamp_start     numeric(8,2),
  timestamp_end       numeric(8,2),
  duration_seconds    numeric(8,2)
                        generated always as (
                          case
                            when timestamp_end is not null and timestamp_start is not null
                              then timestamp_end - timestamp_start
                            else null
                          end
                        ) stored,
  shot_type           shot_type,
  scene_description   text,
  camera_direction    text,
  lighting            text,
  wardrobe            text,
  environment         text,
  recommended_tool    provider_name,
  priority            shot_priority not null default 'normal',
  status              shot_status not null default 'planned',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint shots_project_shot_number_unique unique (project_id, shot_number)
);
create index shots_project_id_idx on public.shots (project_id);
create index shots_user_id_idx on public.shots (user_id);
create index shots_project_status_idx on public.shots (project_id, status);
create trigger shots_set_updated_at before update on public.shots
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 7. prompt_templates — reusable formulas (seedable + user-built)
-- =============================================================================
create table public.prompt_templates (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete cascade,   -- NULL = global seed
  name                     text not null,
  description              text,
  provider                 provider_name,                                       -- target provider or null = universal
  category                 prompt_template_category not null default 'universal',
  template_body            text not null,                                       -- with {{artist.name}}, {{shot.lighting}} placeholders
  default_negative_prompt  text,
  default_settings_json    jsonb not null default '{}'::jsonb,
  is_seed                  boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index prompt_templates_user_id_idx on public.prompt_templates (user_id);
create index prompt_templates_seed_idx on public.prompt_templates (is_seed) where is_seed = true;
create index prompt_templates_provider_idx on public.prompt_templates (provider, category);
create trigger prompt_templates_set_updated_at before update on public.prompt_templates
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 8. prompts — every prompt is a row, fully traceable
-- =============================================================================
create table public.prompts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  project_id         uuid not null references public.video_projects(id) on delete cascade,
  shot_id            uuid references public.shots(id) on delete set null,
  template_id        uuid references public.prompt_templates(id) on delete set null,
  provider           provider_name not null,
  prompt_text        text not null,
  negative_prompt    text,
  settings_json      jsonb not null default '{}'::jsonb,                       -- aspect ratio, duration, seed, model variant
  version_number     int not null default 1,
  parent_prompt_id   uuid references public.prompts(id) on delete set null,    -- for variations
  result_asset_id    uuid,                                                      -- FK added after project_assets defined
  notes              text,
  created_at         timestamptz not null default now()
);
create index prompts_project_id_idx on public.prompts (project_id);
create index prompts_shot_id_idx on public.prompts (shot_id);
create index prompts_user_id_idx on public.prompts (user_id);
create index prompts_provider_idx on public.prompts (project_id, provider);
create index prompts_parent_idx on public.prompts (parent_prompt_id);

-- =============================================================================
-- 9. project_assets — unified asset table (refs + generated + approved + exports)
-- =============================================================================
create table public.project_assets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  project_id          uuid not null references public.video_projects(id) on delete cascade,
  shot_id             uuid references public.shots(id) on delete set null,
  prompt_id           uuid references public.prompts(id) on delete set null,
  asset_type          project_asset_type not null,
  file_url            text not null,
  source_tool         provider_name,                                             -- 'runway','veo','manual', etc.
  approval_status     approval_status not null default 'pending',
  version_number      int not null default 1,
  parent_asset_id     uuid references public.project_assets(id) on delete set null,   -- version stacks
  metadata_json       jsonb not null default '{}'::jsonb,                        -- duration, dimensions, fps, codec, file_size, original_filename
  notes               text,
  created_at          timestamptz not null default now()
);
create index project_assets_project_id_idx on public.project_assets (project_id);
create index project_assets_shot_id_idx on public.project_assets (shot_id);
create index project_assets_prompt_id_idx on public.project_assets (prompt_id);
create index project_assets_user_id_idx on public.project_assets (user_id);
create index project_assets_type_status_idx on public.project_assets (project_id, asset_type, approval_status);
create index project_assets_parent_idx on public.project_assets (parent_asset_id);

-- Close the circular FK from prompts -> project_assets
alter table public.prompts
  add constraint prompts_result_asset_fk
  foreign key (result_asset_id) references public.project_assets(id) on delete set null;
create index prompts_result_asset_idx on public.prompts (result_asset_id);

-- =============================================================================
-- 10. clip_reviews — per-asset scorecards
-- =============================================================================
create table public.clip_reviews (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  asset_id                 uuid not null references public.project_assets(id) on delete cascade,
  face_consistency_score   int check (face_consistency_score between 1 and 10),
  realism_score            int check (realism_score between 1 and 10),
  lighting_score           int check (lighting_score between 1 and 10),
  wardrobe_score           int check (wardrobe_score between 1 and 10),
  camera_score             int check (camera_score between 1 and 10),
  lipsync_score            int check (lipsync_score between 1 and 10),
  final_usefulness         boolean,
  notes                    text,
  created_at               timestamptz not null default now()
);
create index clip_reviews_asset_id_idx on public.clip_reviews (asset_id);
create index clip_reviews_user_id_idx on public.clip_reviews (user_id);

-- =============================================================================
-- 11. export_packages
-- =============================================================================
create table public.export_packages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid not null references public.video_projects(id) on delete cascade,
  export_type     export_type not null,
  file_url        text,                                                          -- zip in storage, null while building
  manifest_json   jsonb not null default '{}'::jsonb,
  status          export_status not null default 'pending',
  error_text      text,
  created_at      timestamptz not null default now()
);
create index export_packages_project_id_idx on public.export_packages (project_id);
create index export_packages_user_id_idx on public.export_packages (user_id);

-- =============================================================================
-- 12. provider_jobs — placeholder for future async API tracking
-- =============================================================================
create table public.provider_jobs (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  project_id               uuid not null references public.video_projects(id) on delete cascade,
  prompt_id                uuid references public.prompts(id) on delete set null,
  provider                 provider_name not null,
  external_job_id          text,
  status                   provider_job_status not null default 'queued',
  result_asset_id          uuid references public.project_assets(id) on delete set null,
  request_payload_json     jsonb not null default '{}'::jsonb,
  response_payload_json    jsonb not null default '{}'::jsonb,
  error_text               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index provider_jobs_project_id_idx on public.provider_jobs (project_id);
create index provider_jobs_prompt_id_idx on public.provider_jobs (prompt_id);
create index provider_jobs_external_idx on public.provider_jobs (provider, external_job_id);
create index provider_jobs_status_idx on public.provider_jobs (user_id, status);
create trigger provider_jobs_set_updated_at before update on public.provider_jobs
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- 13. Row-Level Security
-- =============================================================================
alter table public.artists           enable row level security;
alter table public.artist_assets     enable row level security;
alter table public.video_projects    enable row level security;
alter table public.shots             enable row level security;
alter table public.prompt_templates  enable row level security;
alter table public.prompts           enable row level security;
alter table public.project_assets    enable row level security;
alter table public.clip_reviews      enable row level security;
alter table public.export_packages   enable row level security;
alter table public.provider_jobs     enable row level security;

-- Standard owner-only policy: user_id = auth.uid()
-- Generated via DO block to avoid repetition.
do $$
declare
  t text;
  owner_tables text[] := array[
    'artists','artist_assets','video_projects','shots',
    'prompts','project_assets','clip_reviews','export_packages','provider_jobs'
  ];
begin
  foreach t in array owner_tables loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);

    execute format(
      'create policy "%s_select_own" on public.%I for select using (user_id = auth.uid())',
      t, t
    );
    execute format(
      'create policy "%s_insert_own" on public.%I for insert with check (user_id = auth.uid())',
      t, t
    );
    execute format(
      'create policy "%s_update_own" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t
    );
    execute format(
      'create policy "%s_delete_own" on public.%I for delete using (user_id = auth.uid())',
      t, t
    );
  end loop;
end $$;

-- prompt_templates: owner-only + read access to global seeds (user_id IS NULL)
drop policy if exists "prompt_templates_select" on public.prompt_templates;
drop policy if exists "prompt_templates_insert" on public.prompt_templates;
drop policy if exists "prompt_templates_update" on public.prompt_templates;
drop policy if exists "prompt_templates_delete" on public.prompt_templates;

create policy "prompt_templates_select" on public.prompt_templates
  for select using (user_id = auth.uid() or user_id is null);
create policy "prompt_templates_insert" on public.prompt_templates
  for insert with check (user_id = auth.uid() and is_seed = false);
create policy "prompt_templates_update" on public.prompt_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prompt_templates_delete" on public.prompt_templates
  for delete using (user_id = auth.uid());

-- =============================================================================
-- 14. Helpful comments
-- =============================================================================
comment on column public.artists.identity_profile_json is
  'Structured identity: { face, body, skin, hair, tattoos, jewelry, wardrobe_defaults, distinguishing_features }. Merged into every prompt by the compiler.';
comment on column public.artists.continuity_rules is
  'Free-form must-include rules: "always wears gold chain", "left-arm tattoo only", "never smiles directly at camera".';
comment on column public.artists.forbidden_inaccuracies is
  'Negative continuity rules — what the model must not generate. Folded into negative_prompt automatically.';
comment on column public.video_projects.song_structure_json is
  'Array of song sections: [{ name: "intro", bars: 4, start_seconds: 0, end_seconds: 8 }, ...]';
comment on column public.shots.duration_seconds is
  'Computed column = timestamp_end - timestamp_start (read-only).';
comment on column public.project_assets.parent_asset_id is
  'Self-FK for version stacks: variation/edit chains. NULL = original.';
comment on column public.prompts.parent_prompt_id is
  'Self-FK for prompt variations. NULL = original.';
comment on table public.provider_jobs is
  'Placeholder for future async API job tracking. Empty during MVP — manual workflow does not write to this table.';
