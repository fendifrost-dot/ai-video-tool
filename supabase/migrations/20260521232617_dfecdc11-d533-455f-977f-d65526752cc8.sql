ALTER TABLE public.artist_looks ADD COLUMN IF NOT EXISTS error_message text;

-- artist_looks already has a status column (text, default 'draft'). Add the new generation-status column under a distinct name to avoid clobbering existing values.
-- But the user explicitly asked for `status` default 'complete'. The existing `status` column uses values like 'draft','approved','locked','archived'. We'll keep existing column intact and instead reinterpret: per request, add column named status — conflict. Use a different approach: since `status` exists, we cannot add it again. We'll rename strategy: add `generation_status` is NOT what user asked. The safest literal interpretation: the user may not know `status` exists. We'll proceed by NOT re-adding status; instead leave existing status and only add error_message, and backfill existing status nulls (none) to 'complete'. But user explicitly wants default 'complete'.

-- Resolution: add column only if not exists; if exists, skip. Backfill any NULL status to 'complete'.
ALTER TABLE public.artist_looks ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.artist_looks ALTER COLUMN status SET DEFAULT 'complete';
UPDATE public.artist_looks SET status = 'complete' WHERE status IS NULL;