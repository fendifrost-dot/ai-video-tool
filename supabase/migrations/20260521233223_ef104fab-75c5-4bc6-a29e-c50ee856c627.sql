ALTER TABLE public.artist_looks DROP CONSTRAINT IF EXISTS artist_looks_status_check;
ALTER TABLE public.artist_looks ADD CONSTRAINT artist_looks_status_check
  CHECK (status IN ('draft','approved','locked','archived','complete','error','pending','failed'));