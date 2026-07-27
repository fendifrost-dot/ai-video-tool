# Handoff — AVT scrub proxy (P3)

Goal (Fendi's design): on upload, transcode a lightweight **~720p H.264 "scrub proxy"**
next to the untouched 4K master, point the Hero Frame Studio scrubber/preview at the
proxy so the browser never decodes the 2 GB master, and still pull the hero frame at
**full resolution from the master** at the chosen timestamp.

## Shipped in this repo (client half — a no-op until a proxy exists)

- `src/lib/video/scrubProxy.ts` — proxy metadata contract + pure resolver
  (`resolveScrubSource` prefers a `ready` proxy, else the master). Unit-tested
  (`scrubProxy.test.ts`, 11 cases).
- `src/pages/HeroFrameStudioPage.tsx` — the visible scrubber `<video>` loads the
  resolved scrub source; a hidden full-res master `<video>` is mounted only when a
  proxy is active, and hero-frame **capture always reads the master** (pixel
  preservation). With no proxy present, behavior is byte-identical to before.

### The metadata contract an upstream transcode must write onto the video asset

On `project_assets.metadata_json` of the master video row:

```jsonc
{
  "scrub_proxy_path":   "<user_id>/<...>/<name>.proxy.mp4", // 720p H.264 in Storage
  "scrub_proxy_bucket": "project-references",               // optional; defaults to master bucket
  "scrub_proxy_status": "pending" | "processing" | "ready" | "failed"
}
```

The scrubber switches to the proxy the moment `status === "ready"` and a path is set.
Nothing else in the client needs to change.

## Remaining — needs infrastructure OUTSIDE this repo (not a src/ change)

A 2 GB 4K → 720p transcode cannot run in a Supabase Deno edge function (no ffmpeg,
short CPU/wall-clock limits) nor in the browser (the very 4K-decode choke we're
avoiding). It needs an external worker. Two pieces to build:

1. **Transcode dispatch + job** — on video upload (or a "make proxy" action),
   dispatch a transcode to an external encoder and write `scrub_proxy_status`.
   Options, cheapest-integration first:
   - **Fal ffmpeg endpoint via Control Center** (AVT already reaches Fal through CC
     `switchx-restyle` / `fal-run` + `fal-queue-poll`; AVT holds no `FAL_KEY`). A
     scale/encode graph to 1280×720 H.264, faststart.
   - Mux / Cloudflare Stream ingest (returns a rendition URL).
   - A container/worker job with real ffmpeg.
   New AVT edge function e.g. `make-scrub-proxy-proxy` to kick it off; mirror the
   existing `*-proxy` + `*-callback` pattern (see `wardrobe-vton-proxy` /
   `faceswap-callback`).
2. **Callback** — on transcode completion, upload the 720p file to Storage and
   patch the master asset's `metadata_json` with `scrub_proxy_path` +
   `scrub_proxy_status: "ready"` (or `"failed"`). Same shape as
   `faceswap-callback` / `compose-look-callback`.

Wiring point in the client uploader if you want to auto-kick transcode on upload:
`src/components/assets/AssetUploadDropzone.tsx` (after `create.mutateAsync`, when
`file.type.startsWith("video/")`), or trigger from the callback side.

### Optional future step (also infra, not shipped)

"Hero frame pulled full-res **server-side** at the timestamp" (per Fendi's design)
likewise needs a worker that seeks the master and extracts a frame — same class of
infra as the transcode. Today capture stays client-side against the master (with the
rotation-fixed WebCodecs fallback from P1), which is correct; a server-side extractor
would remove the last bit of browser 4K decoding. Deferred.

## Deploy

- Client half: **Publish** (frontend). No edge redeploy for what's in this repo.
- Remaining infra: new edge function(s) + external encoder wiring → edge redeploy of
  the new functions once written.
