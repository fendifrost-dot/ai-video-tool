# wardrobe-video-lucy-proxy

**Lane C** of the wardrobe video-swap benchmark — Decart **Lucy** video-native
video-to-video (BATCH). One prerecorded clip in, one edited clip out, via
`decart/lucy-edit/*` / `decart/lucy-restyle` on Fal, reached through CC `fal-run`
submit + `fal-queue-poll` (the same transport as `make-scrub-proxy-proxy`).

```
source clip  →  [THIS: Lucy v2v whole-clip garment edit]  →  edited clip
```

No frame extract / per-frame swap / reassemble: Lucy is **temporally native**, so
there is no per-frame "boiling" by construction. Measuring that temporal behaviour
against Lane A (keyframe+propagation) and Lane B (per-frame VTON) is the point.

## Read this before using it — the honesty boundary

Batch Lucy is **prompt-driven**. It takes a **text** garment instruction, **not**
the SL-bomber image (the only Lucy endpoints that accept a `reference_image_url`
garment image — `decart/lucy2-vton/realtime`, `decart/lucy-2-5/realtime` — are
**realtime WebRTC**, no `video_url`, and need a custom wrapper; see
`docs/LANE_C_LUCY_VIDEO_VTON.md`). So this lane **regenerates** garment pixels and
**cannot** satisfy the hard product rule *"No AI-regeneration of garment imagery;
pixel preservation is mandatory"* (CLAUDE.md). It is a **benchmark / diagnostic**
that is **expected to fail** the construction+stripe half of the kill criterion
(`docs/VIDEO_SWAP_ARCHITECTURE.md` §7) while (uniquely) passing the flicker half.
**Never** promote it to the shippable swap. Recorded on the asset as
`lucy_repro.garment_source = "text_prompt"`, `pixel_preserving = false`.

## Engine — env-selectable, reversible

| `LUCY_V2V_FAL_MODEL` | Path taken |
|----------------------|------------|
| **unset (default)** | Lane C is **off** — the function returns `500 missing_LUCY_V2V_FAL_MODEL` and is never called by any existing lane |
| `decart/lucy-edit/fast` | cheapest/distilled batch edit (~$0.04/video-sec) — good for the short-clip benchmark |
| `decart/lucy-edit/pro` | higher-quality batch edit; adds `resolution=720p` |
| `decart/lucy-edit/dev` | dev-tier batch edit |
| `decart/lucy-restyle` | long-form (≤10-min clips); adds `seed` |
| any `*/realtime` slug | **refused** at the door (`server_misconfigured`) — realtime needs the WebRTC wrapper, not submit/poll |

Input is shaped per the actual `LucyEditProInput` / `LucyRestyleInput` schema by
`_shared/lucyV2v.ts` (`buildLucyV2vBody`): `{ prompt, video_url, resolution?, seed? }`.
Output `{ video: { url } }` is read by `extractLucyVideoUrl`.

## One-line CC allowlist

Add the chosen id to CC `switchx-restyle`'s fal-run model allowlist — same pattern
as `SCRUB_PROXY_FAL_MODEL` / `VIDEO_COMPOSE_FAL_MODEL` / the Lane B Kolors id:

```
decart/lucy-edit/fast
```

(Add `decart/lucy-edit/pro` and/or `decart/lucy-restyle` if benchmarking those.)

## Client

`src/lib/queries/wardrobeVideoFrames.ts` → `runLaneCRoundtrip()`:
`POST wardrobe-video-lucy-proxy` → poll `metadata_json.lucy_status` → done.

Request body:

```jsonc
{
  "assetId": "<project_assets id of the source clip>",
  "artistId": "<artist id>",
  "wardrobeFeatureId": "<character_features id — names the garment in the prompt>",
  "transferMode": "jacket_only" | "full_look",
  "prompt": "<optional> override the auto-built garment-edit prompt"
}
```

Writes the edited clip to `project-exports/<user>/<asset>/lucy/<session>.mp4` and
patches the source asset: `lucy_status` (`processing`/`ready`/`failed`),
`lucy_out_path`, `lucy_out_bucket`, `lucy_engine`, `lucy_repro`, `lucy_error`.

## Secrets (Lovable → AI Video Tool → Edge Function secrets)

| Secret | Value |
|--------|-------|
| `COMPOSE_LOOK_CC_URL` | CC base ending `/compose-look` (shared with the other wardrobe proxies) |
| `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`) | CC proxy secret |
| `LUCY_V2V_FAL_MODEL` | **required to enable** — a batch Lucy id (see table) |
| `LUCY_V2V_RESOLUTION` | *optional* `720p` (pro/restyle only) |

`SUPABASE_*` are already present.

## Deploy

1. Push `main` with `supabase/functions/wardrobe-video-lucy-proxy/` and
   `supabase/functions/_shared/lucyV2v.ts`.
2. **CC:** add `decart/lucy-edit/fast` (and any other chosen Lucy id) to CC
   `switchx-restyle`'s fal-run allowlist; **redeploy CC `switchx-restyle`**.
3. **AVT Lovable → Edge Function secrets:** set
   `LUCY_V2V_FAL_MODEL=decart/lucy-edit/fast`.
4. **AVT Lovable → Edge Functions → redeploy** `wardrobe-video-lucy-proxy`
   (Publish ≠ redeploy).
5. Publish frontend (engine is server-selected; no client change required to run).

## Known limits

- **Prompt-driven, not product-accurate** — see the honesty boundary above. This
  is the lane's defining constraint, not a bug.
- **Batch window.** `lucy-edit` renders roughly at clip length; keep the benchmark
  clip 2–4 s so the background task finishes inside the edge cap. `lucy-restyle`
  is the ≤10-min long-form path if ever needed.
- **Pricing** (as documented 2026-07-28, confirm on the model page): `lucy-edit/fast`
  ~$0.04/video-sec, `lucy-edit/pro` ~$0.15/video-sec @720p, realtime ~$0.02/sec.
