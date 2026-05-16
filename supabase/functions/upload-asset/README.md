# upload-asset

Server-side upload bypass. Solves the **detached File hang** that breaks
browser-side uploads for files injected by browser automation (Chrome MCP) or
held past `input.value = ""`.

## When to use

- **Normal UI flows (drag-and-drop, file picker):** prefer the browser path
  (`uploadToBucket(bucket, path, file)` in `src/lib/storage.ts`). It's faster
  (one fewer network hop) and works fine for files the user picked.
- **Programmatic uploads** — Claude in Cowork moving a file in, scripts, CI,
  anything that has raw bytes — call this function. It never touches a File
  object, so the detached-source hang can't happen.

## Calling it

```bash
curl -X POST "$SUPABASE_URL/functions/v1/upload-asset" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: video/mp4" \
  -H "X-Bucket: project-clips" \
  -H "X-Path: $USER_ID/$PROJECT_ID/$SHOT_ID/clip_0001.mp4" \
  --data-binary @/path/to/clip.mp4
```

Response: `{ ok: true, bucket, path, size_bytes }`.

## Auth model

- The caller supplies their own JWT in `Authorization: Bearer ...`.
- The function verifies the JWT, then uses the service-role key internally to
  bypass storage RLS. **It re-enforces the RLS invariant manually:** the path
  MUST start with `${userId}/`, returning 403 otherwise.
- This means the function is no more powerful than a logged-in user, just
  immune to browser File semantics.

## Configuration

Needs these env vars (Supabase Edge Functions sets `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` automatically when deployed):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Limits

- 500 MB body cap (matches the UI). Bumping requires editing `MAX_BYTES`.
- Bucket whitelist: `artist-assets`, `project-audio`, `project-references`,
  `project-clips`, `project-exports`.

## Deployment

Edge functions deploy through the Lovable Cloud panel. Path is
`supabase/functions/upload-asset/index.ts`. Once deployed, the URL is:

```
https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/upload-asset
```

## Why a separate function instead of fixing the browser path

The browser path is fixed — `uploadToBucket` materialises File -> ArrayBuffer
before posting, and the new timeout wrapper makes any remaining hang surface
as an actionable error. But there's an entire class of integrations (Claude
moving files in on behalf of the user, future CLI tooling, batch imports)
where there's no benefit to round-tripping through a synthetic File. This
function lets those callers stay in their native domain.
