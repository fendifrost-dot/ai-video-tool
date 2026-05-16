-- =============================================================================
-- shots — timeline-assembly fields (Capability C foundation)
-- =============================================================================
-- These columns let a future Phase-2 render pipeline assemble approved clips
-- into a finished music video — trim points + transitions per clip — without
-- another schema change. All columns are nullable so existing rows keep
-- working unchanged.
--
-- Apply via Lovable Cloud → Database → SQL Editor. Idempotent — safe to
-- re-run; uses ADD COLUMN IF NOT EXISTS plus type-check before enum create.
-- =============================================================================

-- Transition types. Conservative starting set — covers ~95% of music-video
-- needs. The render engine will map these to ffmpeg/AE/Premiere primitives.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shot_transition_type') then
    create type shot_transition_type as enum (
      'cut',         -- hard cut, no transition (default)
      'crossfade',   -- alpha dissolve
      'fade_black',  -- fade to/from black
      'fade_white',  -- fade to/from white
      'whip_pan',    -- motion-blur swipe
      'glitch',      -- digital tear / RGB-split style
      'flash'        -- single-frame white flash
    );
  end if;
end $$;

-- Trim points: seconds relative to the SOURCE CLIP. NULL = use whole clip.
-- transition_in/out apply BETWEEN consecutive shots (out of shot N feeds
-- into in of shot N+1). Duration is in seconds; defaults to 0.5s at render
-- time if a transition type is set but duration is NULL.
alter table public.shots
  add column if not exists trim_in_seconds      numeric(8,3),
  add column if not exists trim_out_seconds     numeric(8,3),
  add column if not exists transition_in_type   shot_transition_type,
  add column if not exists transition_out_type  shot_transition_type,
  add column if not exists transition_duration  numeric(5,2);

-- Sanity constraint: trim_out must be > trim_in when both are set.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shots_trim_in_out_ordering'
  ) then
    alter table public.shots
      add constraint shots_trim_in_out_ordering
      check (
        trim_in_seconds is null
        or trim_out_seconds is null
        or trim_out_seconds > trim_in_seconds
      );
  end if;
end $$;

-- Sanity constraint: transition_duration must be >= 0 and reasonably small.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shots_transition_duration_bounds'
  ) then
    alter table public.shots
      add constraint shots_transition_duration_bounds
      check (
        transition_duration is null
        or (transition_duration >= 0 and transition_duration <= 5)
      );
  end if;
end $$;

-- Helpful column comments — they show up in Supabase UI + types regeneration.
comment on column public.shots.trim_in_seconds is
  'Seconds from the start of the SOURCE clip to begin using. NULL = clip start.';
comment on column public.shots.trim_out_seconds is
  'Seconds from the start of the SOURCE clip to stop using. NULL = clip end.';
comment on column public.shots.transition_in_type is
  'Transition type entering this shot (from the previous shot). NULL = hard cut.';
comment on column public.shots.transition_out_type is
  'Transition type leaving this shot (into the next shot). NULL = hard cut. Set to match transition_in_type of the next shot or render engine will use the out side.';
comment on column public.shots.transition_duration is
  'Length of the transition in seconds, 0-5. NULL = render default (0.5s).';
