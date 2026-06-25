# grok-image-garment-proxy

Hero Frame Studio **Grok Image-Edit garment-truth** lane. Signs the captured hero frame + on-model wardrobe refs, calls xAI `POST /v1/images/edits`, uploads the result to `look-composites`, and completes an `artist_looks` row.

## Client

`src/lib/queries/grokImageGarment.ts` → `POST /functions/v1/grok-image-garment-proxy`

## xAI API key (required secret)

xAI uses **one API key** for image and video. Copy the same value already on Control Center as `Frost_Grok`.

In **Lovable → AI Video Tool → Edge Function secrets**, add:

| Secret | Value |
|--------|--------|
| `XAI_API_KEY` | Same as CC `Frost_Grok` (from [console.x.ai](https://console.x.ai)) |

Accepted aliases (first match wins): `XAI_API_KEY`, `FROST_GROK`, `GROK_API_KEY`.

No separate “image-only” key is needed.

## Deploy

1. Merge/push `main` with `supabase/functions/grok-image-garment-proxy/`
2. Lovable → Edge Functions → **redeploy** `grok-image-garment-proxy` (Publish alone does not redeploy functions)
3. Set `XAI_API_KEY` secret if not already present
4. Publish frontend

## Config

`supabase/config.toml`:

```toml
[functions.grok-image-garment-proxy]
verify_jwt = true
```

User JWT required (same as `wardrobe-vton-proxy`).

## Errors

| Error | Fix |
|-------|-----|
| `xai_api_key_missing` | Set `XAI_API_KEY` on AVT edge secrets |
| `wardrobe_no_image` | Wardrobe item needs on-model or product refs |
| `xai_edits_failed: 401` | Key invalid or revoked — re-copy from console.x.ai |
| `xai_edits_failed: 403` | Account may lack Imagine image access |

## Related

- Locked prompt: `src/lib/heroFrame/grokGarmentPrompt.ts`
- Handoff: `CURSOR_HANDOFF_grok_image_garment_lane_FINAL.md`
- Grok video gen (separate path): `proxy-provider-call` → CC `video-providers-grok-generate`
