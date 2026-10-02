-- =============================================================================
-- SHOT OVERRIDES — the frame
-- =============================================================================
-- An override's `direction` is what HAPPENS in the box ("a slow truck reveals the car; the models step
-- inside; the doorman stops the younger pair …"). A still model given that sentence draws every beat at
-- once — measured 2026-10-02 on the first storyboard → Runs test: the still came back as two pictures
-- stacked, one per beat, and the motion model was then paid to animate it.
--
-- `frame` is what the picture SHOWS when the shot opens: the place, who and what is in it, the light.
-- "From the lyrics" already receives it (the scene's `visual`) and had nowhere to keep it; a director
-- can type it too. The compiler uses it as the still's prompt and keeps `direction` for the motion.
--
-- Additive: one nullable text column. No policy, function or other table is altered; the table's RLS
-- (user_id = auth.uid()) already covers it.
-- =============================================================================

alter table public.shot_overrides
  add column if not exists frame text;

comment on column public.shot_overrides.frame is
  'What the picture shows when the shot opens (place, people, objects, light) — the still prompt. `direction` is what happens — the motion prompt.';
