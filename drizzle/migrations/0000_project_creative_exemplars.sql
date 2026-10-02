-- =============================================================================
-- CREATIVE EXEMPLARS — the director's own bar, as project data
-- =============================================================================
-- Fendi (2026-10-01): the generated treatment's creativity is far below the scenes he
-- describes himself ("a model opens a door, flicks the switch, inside is the arctic…";
-- "four kids carry a wheel-less car on their shoulders"). If the generator cannot reach
-- that level on its own, he wants an organised place to put those ideas in.
--
-- `lyric-visualizer-proxy` has taken `exemplars` ("the artist's own creative exemplars —
-- the bar every scene is held to") since it shipped, but nothing stored any, so every call
-- said "(none supplied)". This column is where they live: one scene per array element,
-- written by the director on the treatment page, sent with every regenerate-from-lyrics.
--
-- Additive: one nullable-safe column with a default; no policy, function or other table
-- is altered. video_projects RLS already scopes rows to their owner.
-- =============================================================================

alter table public.video_projects
  add column if not exists creative_exemplars text[] not null default '{}';

comment on column public.video_projects.creative_exemplars is
  'The director''s own example scenes — the creative bar generated shots are held to. One scene per element; sent to lyric-visualizer-proxy as `exemplars`.';