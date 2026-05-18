# Library taxonomy

Phase 1 introduces a reference-image library that backs the new image-first
workflow (generate stills → lock looks → promote to video). Three asset
families: **wardrobe**, **locations**, **props**. They live in two different
shapes on purpose.

## Wardrobe — extends `character_features` (artist-scoped)

Wardrobe items belong to a specific artist's identity, the same way face,
jewelry and tattoos do. A YSL leather jacket on Fendi's wardrobe shelf is part
of *Fendi's* DNA, not a free-floating resource the way a marble lobby is. So
the wardrobe extension piggybacks on the existing `character_features` table:

- New `feature_type` values: `wardrobe_top`, `wardrobe_bottom`,
  `wardrobe_outerwear`, `wardrobe_footwear`, `wardrobe_accessory`.
- New columns shared with the Character DNA features: `tags text[]` for
  free-form fashion taxonomy ("denim", "vintage", "ysl") and `source_url text`
  for audit trail when an item was pulled from the open web.
- All the existing per-row toggles still apply (`is_locked`,
  `reinforce_on_drift`) — the prompt compiler will eventually pull locked
  wardrobe items the same way it pulls locked Character DNA features.

Why this is right: every relationship that wardrobe needs (artist FK, RLS via
artist ownership, prompt-compiler integration) already exists on
`character_features`. A separate `wardrobe_library` table would have to
duplicate all of that and then add a third concept (artist-scoped, not
project-scoped, not user-scoped). The CHECK-constraint feature_type makes the
extension a one-line schema change instead of an enum migration.

## Locations + Props — independent user-scoped libraries

Locations and props are different. A "marble lobby" image isn't tied to any
single artist; it's a piece of *world-building* the user wants to reuse across
projects and characters. Same for a "1973 Mercedes 280SL" — that prop image
should be available whether Fendi or a guest feature is on screen.

So `location_library` and `prop_library` are independent tables, user-scoped
(`user_id` FK, RLS by `user_id = auth.uid()`). Each row has:

- `name`, `file_url`, `storage_path`, `tags text[]`, `source_url`, `notes`
- `category` — constrained CHECK list per family
  - Locations: `interior | exterior | urban | nature | fantasy | studio`
  - Props: `vehicle | instrument | animal | object | logo | other`

## Project-level pinning

Users build the global library over months. Within a project they want a
focused subset — "for this video, these five locations and these three props".
That's `project_location_picks` and `project_prop_picks` — thin join tables
keyed by `(project_id, location_id)` / `(project_id, prop_id)` with RLS via
project ownership.

The pinning step is non-destructive; unpinning leaves the library item in
place for future projects. The picker UI on the project page lists pinned
items first, with an "Add from library" flow that surfaces everything else.

## Storage layout

Three private buckets, 20 MB cap, `image/jpeg|png|webp` only, signed URLs:

| Bucket          | Path convention                                |
|-----------------|------------------------------------------------|
| `wardrobe-refs` | `{user_id}/{artist_id}/{uuid}.{ext}`           |
| `location-refs` | `{user_id}/{uuid}.{ext}`                       |
| `prop-refs`     | `{user_id}/{uuid}.{ext}`                       |

The first segment is always `user_id` to satisfy the existing storage RLS
pattern (`auth.uid()::text = (storage.foldername(name))[1]`).

## URL-fetch pipeline

The `fetch-reference-image` edge function is a server-side image proxy. The
browser sends `{ url, targetType }`, the function:

1. Validates the URL (https only, no localhost/private IP ranges, max 1
   redirect, 30s timeout, 20 MB ceiling).
2. Sniffs MIME from response + magic bytes — only `jpeg | png | webp` pass.
3. Uploads to the appropriate bucket under the right path prefix using the
   service role key.
4. Returns `{ storage_path, file_url, mime_type, size_bytes }`.

The frontend then inserts a row into the appropriate library table with that
metadata. SSRF protection lives in a separate pure module
(`supabase/functions/_shared/urlValidator.ts`) so it can be unit-tested
without spinning up the Deno runtime.
