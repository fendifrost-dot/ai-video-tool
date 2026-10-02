-- =============================================================================
-- lyric_lines — every lyric line and word on the song clock
-- (plan 2026-10-01 B1: "the pipeline has no lyric timing")
--
-- Filled by scripts/lyrics/align_lyrics.py (forced alignment of the known lyrics
-- against the song's transcript) or by a manual LRC import. Read by the
-- storyboard (lyrics inside every shot box = lyric_lines ∩ shot timeline), by the
-- literal-mode visualiser, by the batch runner's brief check, and by the cut-point
-- QA. Additive only; RLS = owner of the project, same shape as performance_syncs.
-- =============================================================================

create table if not exists public.lyric_lines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references public.video_projects(id) on delete cascade,
  line_index    integer not null,
  section       text not null default 'verse',          -- verse | hook | adlib | bridge | …
  block         integer,                                  -- blank-line block in the lyrics text
  text          text not null,
  start_seconds double precision not null,
  end_seconds   double precision not null,
  confidence    double precision not null default 1,     -- share of words matched directly by the aligner
  words_json    jsonb not null default '[]'::jsonb,       -- [{w, start, end, matched}]
  source        text not null default 'align_lyrics',     -- align_lyrics | lrc | manual
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lyric_lines_window check (end_seconds >= start_seconds)
);
create unique index if not exists lyric_lines_project_line on public.lyric_lines (project_id, line_index);
create index if not exists lyric_lines_project_time on public.lyric_lines (project_id, start_seconds);

alter table public.lyric_lines enable row level security;
drop policy if exists "Users access own lyric_lines" on public.lyric_lines;
create policy "Users access own lyric_lines"
  on public.lyric_lines for all
  using (project_id in (select id from public.video_projects where user_id = auth.uid()))
  with check (project_id in (select id from public.video_projects where user_id = auth.uid()));

-- the lines sung inside a window of the song clock (partial overlap counts; what the storyboard box shows)
create or replace function public.lyric_lines_in_window(p_project uuid, p_start double precision, p_end double precision)
returns setof public.lyric_lines
language sql stable
as $$
  select * from public.lyric_lines
  where project_id = p_project and start_seconds < p_end and end_seconds > p_start
  order by line_index
$$;
