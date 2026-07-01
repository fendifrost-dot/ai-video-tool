-- Raise storage bucket size limits so full-resolution 4K source-video masters
-- ingest without the "degrade to fit the uploader" downscale that produced the
-- ~406x720 proxy clips.
--
-- Buckets affected:
--   project-references — source reference videos (asset_type = reference_video)
--                        land here; was 100 MB (104857600).
--   project-clips      — generated / edited clips (generated_clip, edited_clip,
--                        etc.) land here; was 500 MB (524288000). Raised too so
--                        4K generated/edited masters don't hit the same wall.
--
-- New limit: 4 GB (4294967296) to match MAX_UPLOAD_BYTES in src/lib/uploadLimits.ts
-- and MAX_BYTES in supabase/functions/upload-asset/index.ts.
--
-- IMPORTANT — this bucket limit is NECESSARY BUT NOT SUFFICIENT. Supabase also
-- enforces a PROJECT-WIDE Storage "Upload file size limit" (Dashboard → Storage
-- → Settings) that caps every upload regardless of the per-bucket value. That
-- global limit is NOT settable via SQL and must be raised to >= 4 GB in the
-- dashboard, or uploads still fail with 413.

update storage.buckets
   set file_size_limit = 4294967296  -- 4 GB
 where id in ('project-references', 'project-clips');
