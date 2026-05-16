do $$
begin
  if not exists (select 1 from pg_type where typname = 'shot_transition_type') then
    create type shot_transition_type as enum ('cut','crossfade','fade_black','fade_white','whip_pan','glitch','flash');
  end if;
end $$;

alter table public.shots
  add column if not exists trim_in_seconds      numeric(8,3),
  add column if not exists trim_out_seconds     numeric(8,3),
  add column if not exists transition_in_type   shot_transition_type,
  add column if not exists transition_out_type  shot_transition_type,
  add column if not exists transition_duration  numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shots_trim_in_out_ordering') then
    alter table public.shots add constraint shots_trim_in_out_ordering
      check (trim_in_seconds is null or trim_out_seconds is null or trim_out_seconds > trim_in_seconds);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shots_transition_duration_bounds') then
    alter table public.shots add constraint shots_transition_duration_bounds
      check (transition_duration is null or (transition_duration >= 0 and transition_duration <= 5));
  end if;
end $$;

comment on column public.shots.trim_in_seconds      is 'Seconds from the SOURCE clip start. NULL = clip start.';
comment on column public.shots.trim_out_seconds     is 'Seconds from the SOURCE clip start. NULL = clip end.';
comment on column public.shots.transition_in_type   is 'Transition entering this shot (from previous). NULL = hard cut.';
comment on column public.shots.transition_out_type  is 'Transition leaving this shot (into next). NULL = hard cut.';
comment on column public.shots.transition_duration  is 'Transition length, 0-5 seconds. NULL = render default (0.5s).';