alter table public.clip_reviews
  add column if not exists drift_flags jsonb not null default '[]'::jsonb;