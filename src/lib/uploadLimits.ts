// =============================================================================
// Upload size limits & routing thresholds
// =============================================================================
// Single source of truth for the client-side upload caps. The `upload-asset`
// edge function keeps its OWN numeric literal (Deno modules can't import from
// `src/`); if you change MAX_UPLOAD_BYTES here, mirror it in
// supabase/functions/upload-asset/index.ts.
//
// NOTE: these are CLIENT caps only. Supabase enforces a project-level Storage
// file-size limit (and per-bucket file_size_limit) server-side — those must be
// raised to >= MAX_UPLOAD_BYTES in the Supabase dashboard or uploads 413 no
// matter what these constants say.

/** Hard ceiling per uploaded file — comfortably fits 4K masters. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

/** Human-readable form of MAX_UPLOAD_BYTES for UI copy. */
export const MAX_UPLOAD_LABEL = "4 GB";

/**
 * Files larger than this go through the resumable (TUS) direct-to-Storage path,
 * which streams in 6 MB chunks (constant memory) and resumes across network
 * blips. Files at or below it stay on the existing single-shot path — image /
 * LUT / overlay / small-clip flows are byte-identical to before.
 */
export const STREAM_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB
