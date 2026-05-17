# Song intelligence — implementation choice

## Decision

**Client-side Web Audio API + pure-JS BPM/beat detection lib**, results written directly to `song_analyses` from the browser. No edge function, no paid API.

## Options considered

| Option | Quality | Cost | Latency | Eng cost | Verdict |
|---|---|---|---|---|---|
| Spotify/Echo Nest hosted analysis | High | Paid + auth | ~1s | Low | Out — Phase A budget is $0 |
| Server-side librosa/essentia (Python) | Highest | Free | ~5–10s | Need separate Python service (Cloudflare Workers can't run Python; Supabase Edge runs Deno only) | Out — too much new infra for Phase A |
| TanStack Start server function w/ JS lib | Medium | Free | ~2–5s | Need to fetch the audio inside the worker, decode it with `audio-decode` or similar — Workers have no Web Audio API and `audio-decode` pulls Node-only deps | Out — bundle/runtime mismatch |
| Client-side Web Audio API + JS lib (chosen) | Medium | Free | ~1–3s on user machine | Add lib, run on upload, write rows | **Yes** |

## What we get from client-side analysis

- **BPM** — `web-audio-beat-detector` (Chris Wilson's algorithm via `chrisguttandin/web-audio-beat-detector`) gives a reliable tempo for the 4-on-floor / pop / hip-hop range that Fendi's catalog lives in. Accuracy degrades on highly syncopated or polyrhythmic material — we accept that and let the user override.
- **Beat map** — onset detection from spectral flux peaks. The same library exposes a beats array; for sub-bar markers we use the BPM to extrapolate.
- **Energy curve** — sample RMS energy over fixed windows (e.g. 250ms) — pure decoded-buffer math, no lib needed.
- **Drops** — peaks in the energy curve that are >1.5σ above the rolling mean for at least 1s. Heuristic but works for EDM/trap drops.
- **Sections (intro/verse/chorus)** — **not attempted in Phase A.** Detecting song structure without ML is unreliable. Leave `sections_json` empty and surface a "label sections manually" affordance in the UI. Phase C may add an LLM call that takes the energy curve + lyrics and emits section labels.
- **Duration** — trivial, `audioBuffer.duration`.

## Flow

1. On project page load, fetch the project's audio `project_asset` and any existing `song_analyses` row.
2. If no analysis exists, show "Run analysis" CTA. On click:
   - Stream the audio from the signed URL into the browser as an `ArrayBuffer`.
   - Decode via `AudioContext.decodeAudioData`.
   - Run BPM detection, build beat map, compute energy curve, detect drops.
   - Insert/upsert `song_analyses` row via Supabase client.
3. UI card re-renders with the analysis.
4. Re-analyze button repeats the flow, overwrites the row.

## Why no edge function?

The schema spec mentioned writing an edge function `avt-analyze-song`. We're deliberately not doing that:

- Web Audio API doesn't exist in Deno / Cloudflare Workers, so the function would need a different decode/analysis stack. Either of those requires bringing in WASM builds of FFmpeg or porting Python, both of which materially extend Phase A.
- Client-side analysis runs once per song, on the user's machine — there's no recurring cost or rate limit to manage.
- Failure mode is local (browser console + toast) which is fine for a single-user tool.

If we ever need server-side analysis (e.g. batch reanalyzing a back catalog, or because we want phase-locked analysis on a known-good machine), we add a Python worker on Cloudflare Containers or a small Render service later. The schema doesn't change.

## What the row looks like

```jsonc
{
  "bpm": 142,
  "duration_seconds": 198.4,
  "energy_curve_json": [
    { "t": 0, "energy": 0.12 },
    { "t": 0.25, "energy": 0.18 },
    // ...
  ],
  "beat_map_json": [
    { "t": 0.42, "beat": 1, "bar": 1 },
    { "t": 0.84, "beat": 2, "bar": 1 },
    // ...
  ],
  "drops_json": [
    { "t": 32.5, "intensity": 0.92 }
  ],
  "sections_json": [],
  "hooks_json": [],
  "analysis_provider": "web-audio-beat-detector"
}
```

## Library choice

`web-audio-beat-detector` — ~10KB, MIT, actively maintained, works with `AudioBuffer`. Already used in many similar tools. Fallback: if it fails (returns NaN or throws), we ask the user to enter the BPM manually and still compute the energy curve.
