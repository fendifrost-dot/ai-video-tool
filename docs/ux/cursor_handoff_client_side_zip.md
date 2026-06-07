# Cursor Handoff — Client-Side Zip for Style LoRA Training (CODE ONLY, AVT REPO ONLY)

## Scope at a glance

- **Repo:** `fendifrost-dot/ai-video-tool` (AVT) **ONLY**. Do NOT touch `fendifrost-dot/fendi-control-center` (CC) — it's already correctly configured with the Fal webhook and needs no changes.
- **Files to touch:** Frontend (`src/components/styleReferences/StyleReferencesTab.tsx` + `package.json` for the jszip dep) and one edge function (`supabase/functions/train-style-lora-proxy/index.ts`).
- **Code only.** No schema, no DB migrations, no storage bucket creation, no RLS policies. Anything DDL or storage-config goes through Lovable's SQL Editor (not chat, not Cursor). I'll handle that separately.

## Why

The current training kickoff path keeps hitting Supabase edge function ceilings:
1. CC's `EdgeRuntime.waitUntil` polling Fal → killed before Fal completes
2. Reduced steps from 1000 → 300 → same waitUntil cutoff
3. Fal webhook on CC's submit (so no CC polling needed) → also failed because the AVT proxy's zip+upload+CC-submit chain runs in its OWN `EdgeRuntime.waitUntil` and that ceiling is hit FIRST

**This handoff is the durable architectural fix:** move zip + upload to the BROWSER. The user's machine has no edge-function ceiling. Proxy becomes a thin shim. Scales to 200+ images with no further architecture work.

## Repo state

- AVT main HEAD: `20d47c935e` (proxy persists request_id, forwards webhook URL with artist_id query param)
- CC main HEAD: `f20929286d` (train-style-lora switched to Fal webhook mode, polling removed)
- Both repos clean, only `main`
- CC is already in the right shape — **don't touch CC**

## Constraints (hard rules)

- **No schema, no storage buckets, no RLS, no migrations.** Code only.
- All code via local commits + push to GitHub.
- Lovable chat is for redeploy/publish ONLY — never code or schema or data asks.
- Don't touch CC (already correct).
- Don't touch the compose-look pipeline.
- Don't change wardrobe/accessories/locations/props uploads.
- Keep the existing duplicate-training guard in the proxy.

## The fix (code only)

### 1. Frontend: client-side zip

In `src/components/styleReferences/StyleReferencesTab.tsx` (or wherever the "Train Style LoRA from all" button handler lives):

When the user clicks Train Style LoRA:

1. Query the artist's `style_reference` rows for their public URLs from `character_features.file_url`.
2. Fetch each image in the browser (no auth needed — bucket is public):
   ```ts
   const blobs = await Promise.all(urls.map(u => fetch(u).then(r => r.blob())));
   ```
3. Bundle into one .zip using `jszip` (already a standard library — install with `npm i jszip` and commit the package.json change):
   ```ts
   import JSZip from 'jszip';
   const zip = new JSZip();
   blobs.forEach((blob, i) => zip.file(`image_${String(i).padStart(3, '0')}.jpg`, blob));
   const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
   ```
4. Upload the zip to a storage bucket Fendi will create separately — assume the bucket is named `training-zips` and is public. Path: `${artistId}/${Date.now()}.zip`. Use the existing Supabase storage client:
   ```ts
   const path = `${artistId}/${Date.now()}.zip`;
   const { error } = await supabase.storage.from('training-zips').upload(path, zipBlob, {
     contentType: 'application/zip',
     upsert: false,
   });
   if (error) throw error;
   const { data: { publicUrl } } = supabase.storage.from('training-zips').getPublicUrl(path);
   ```
5. POST the zip URL to the proxy:
   ```ts
   await supabase.functions.invoke('train-style-lora-proxy', {
     body: {
       artist_id: artistId,
       zip_url: publicUrl,
       trigger_word: 'FENDIFITS',
       image_count: blobs.length,
     },
   });
   ```
6. UI shows real progress through the phases: "Fetching photos (X/Y)..." → "Zipping..." → "Uploading zip..." → "Starting training...". After the proxy returns, the existing polling banner takes over.

**Note on missing bucket:** If you push this BEFORE I've created the `training-zips` bucket in Lovable's SQL Editor, the upload will fail with a 404 on the bucket. Add a try/catch + user-facing error: "Training storage not configured yet — ping Claude to create the bucket." That way you can push without waiting on me. I'll create the bucket in parallel.

### 2. AVT proxy: become a thin shim

In `supabase/functions/train-style-lora-proxy/index.ts`:

- Accept the new request body shape: `{ artist_id, zip_url, trigger_word, image_count }`. The proxy NO LONGER fetches images, NO LONGER zips, NO LONGER uploads.
- Keep the existing duplicate-training guard (reject if `style_lora_training.status === 'pending'` and `started_at` < 30 min ago).
- Write `style_lora_training` to artist row: `{ status: 'pending', started_at: now, image_count, trigger_word, zip_url }`.
- POST to CC with `{ images_data_url: zip_url, trigger_word, callback_url: '<AVT_callback>?artist_id=<id>' }` — CC already accepts this shape with the Fal webhook on its side.
- After CC returns `{ status: 'queued', request_id }`, persist `request_id` to the artist row's `style_lora_training.request_id`.
- Return immediately with the proxy's standard success shape.
- DELETE the `EdgeRuntime.waitUntil` wrapping from this codepath entirely.

The whole proxy handler should now run in well under 1s.

### 3. Backward compat (optional)

If you want to keep the old proxy shape working as a fallback (server-side zip), branch on the presence of `zip_url` in the body. If absent → run the legacy path. If present → use the new thin shim path. Otherwise just rip out the old path cleanly — the frontend will only ever call with `zip_url` after this PR.

I'd vote: rip it out cleanly. Less code to maintain.

## Commit messages

- Frontend: `feat(styleReferences): build training zip client-side and pass URL to proxy — eliminates Supabase background-task ceiling`
- Proxy: `refactor(train-style-lora-proxy): accept pre-built zip_url, become thin shim to CC — no more in-function image fetching/zipping/uploading`

## Push + hand back

1. Push commits.
2. I'll create the `training-zips` storage bucket + RLS policies via Lovable SQL Editor (separate from your work).
3. I'll drive AVT Lovable chat: *"Please redeploy train-style-lora-proxy from latest main and publish the frontend."*
4. I'll clear the stale `pending` state.
5. Fendi clicks Train Style LoRA from the live app. With the new flow: browser fetches photos, builds zip, uploads, proxy returns instantly, Fal trains, Fal webhook arrives. Status flips to `complete`, new FENDIFITS LoRA lands.
6. I run the failing-case smoke test through `lora_segmented_inpaint` and report whether the new LoRA finally produces a full-body Stage 1.

## What success looks like end-to-end

- User clicks Train Style LoRA
- UI shows real progress: "Fetching photos..." → "Zipping..." → "Uploading zip..." → "Starting training..."
- Proxy call completes in <1s
- `style_lora_training.request_id` populates on the artist row (proves CC was reached)
- 3-5 min later: Fal's webhook fires, `lora.url` swaps to FENDIFITS, `lora_legacy_face` populated, status → `complete`
- UI shows completion toast
- LoRA is ready for the compose pipeline to use

If this works for 45 images it'll work for 200 with no further architecture change.

## If anything is ambiguous

Ask before committing. Especially:
- Whether to use jszip vs a different in-browser zip library (jszip is standard, ~95KB, well-supported)
- Whether to keep the legacy proxy path as fallback or rip it out cleanly
- Where exactly to wire the new flow in StyleReferencesTab (existing handler structure)

I'd rather pause and clarify than ship half-resolved.
