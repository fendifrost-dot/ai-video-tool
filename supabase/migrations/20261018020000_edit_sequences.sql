-- In-app cut. A sequence is an edit of a project/variation: ordered clips with a source in/out
-- (where in the file) separate from the timeline, plus markers and a queued render plan.
--
-- This does not touch shots, shot_asset_assignments, or performance_syncs. Board alignment
-- stays derived (sync + slip + the shot window). cost_usd on a render is constrained to 0:
-- planning a cut never bills a provider.
--
-- Class C (timelines / rendering). Idempotent. Run in the Lovable SQL editor.
-- Rollback: drop the five tables (edit_renders, edit_markers, edit_clips,
-- edit_sequence_versions, edit_sequences) in that order.

create table if not exists public.edit_sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.video_projects (id) on delete cascade,
  variation_id uuid references public.video_variations (id) on delete set null,
  name text not null,
  version_number integer not null default 1 check (version_number >= 1),
  parent_sequence_id uuid references public.edit_sequences (id) on delete set null,
  fps double precision not null default 24 check (fps > 0 and fps <= 120),
  width integer not null default 720 check (width > 0 and width % 2 = 0),
  height integer not null default 1280 check (height > 0 and height % 2 = 0),
  song_asset_id uuid references public.project_assets (id) on delete set null,
  song_offset_seconds double precision not null default 0,
  song_name text not null default '',
  song_file text not null default '',
  song_duration_seconds double precision not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edit_clips (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.edit_sequences (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  track text not null check (track in ('V1', 'A1', 'A2')),
  item_order integer not null default 0,
  shot_id uuid references public.shots (id) on delete set null,
  asset_id uuid references public.project_assets (id) on delete set null,
  shot_key text,
  name text not null,
  file_name text,
  source_in_seconds double precision not null,
  source_out_seconds double precision not null,
  timeline_in_seconds double precision not null,
  timeline_out_seconds double precision not null,
  speed double precision not null default 1 check (speed > 0 and speed <= 8),
  transition text not null default 'cut' check (transition in ('cut', 'crossfade', 'dip', 'whip', 'flash')),
  transition_seconds double precision not null default 0 check (transition_seconds >= 0 and transition_seconds <= 2),
  label_color text,
  placeholder boolean not null default false,
  comment text not null default '',
  enabled boolean not null default true,
  media_duration_seconds double precision,
  mouth text check (mouth is null or mouth in ('camera', 'model')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (timeline_out_seconds > timeline_in_seconds),
  check (source_out_seconds > source_in_seconds)
);

create index if not exists edit_clips_sequence_idx on public.edit_clips (sequence_id, track, item_order);

create table if not exists public.edit_markers (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.edit_sequences (id) on delete cascade,
  clip_id uuid references public.edit_clips (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('beat', 'lyric', 'lipsync', 'comment')),
  name text not null default '',
  comment text not null default '',
  time_in_seconds double precision not null,
  time_out_seconds double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.edit_sequence_versions (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.edit_sequences (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  summary text not null default '',
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (sequence_id, version_number)
);

create table if not exists public.edit_renders (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.edit_sequences (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('proxy', 'final')),
  status text not null default 'planned' check (status in ('planned', 'queued', 'complete', 'failed')),
  plan jsonb not null,
  cost_usd numeric not null default 0 check (cost_usd = 0),
  output_bucket text,
  output_path text,
  output_asset_id uuid references public.project_assets (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists edit_sequences_updated_at on public.edit_sequences;
create trigger edit_sequences_updated_at before update on public.edit_sequences
  for each row execute function public.tg_set_updated_at();
drop trigger if exists edit_clips_updated_at on public.edit_clips;
create trigger edit_clips_updated_at before update on public.edit_clips
  for each row execute function public.tg_set_updated_at();
drop trigger if exists edit_renders_updated_at on public.edit_renders;
create trigger edit_renders_updated_at before update on public.edit_renders
  for each row execute function public.tg_set_updated_at();

alter table public.edit_sequences enable row level security;
alter table public.edit_clips enable row level security;
alter table public.edit_markers enable row level security;
alter table public.edit_sequence_versions enable row level security;
alter table public.edit_renders enable row level security;

-- Owner of the project, and the row's own user_id. Same shape as lyric_lines.
drop policy if exists edit_sequences_owner on public.edit_sequences;
create policy edit_sequences_owner on public.edit_sequences
  for all to authenticated
  using (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and project_id in (select id from public.video_projects where user_id = auth.uid())
  );

drop policy if exists edit_clips_owner on public.edit_clips;
create policy edit_clips_owner on public.edit_clips
  for all to authenticated
  using (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences))
  with check (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences));

drop policy if exists edit_markers_owner on public.edit_markers;
create policy edit_markers_owner on public.edit_markers
  for all to authenticated
  using (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences))
  with check (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences));

drop policy if exists edit_sequence_versions_owner on public.edit_sequence_versions;
create policy edit_sequence_versions_owner on public.edit_sequence_versions
  for all to authenticated
  using (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences))
  with check (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences));

drop policy if exists edit_renders_owner on public.edit_renders;
create policy edit_renders_owner on public.edit_renders
  for all to authenticated
  using (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences))
  with check (user_id = auth.uid() and sequence_id in (select id from public.edit_sequences));

grant select, insert, update, delete on public.edit_sequences to authenticated, service_role;
grant select, insert, update, delete on public.edit_clips to authenticated, service_role;
grant select, insert, update, delete on public.edit_markers to authenticated, service_role;
grant select, insert, update, delete on public.edit_sequence_versions to authenticated, service_role;
grant select, insert, update, delete on public.edit_renders to authenticated, service_role;
