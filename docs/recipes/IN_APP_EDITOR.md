# In-app cut

Class C (timelines, rendering, security). Draft until architecture, product, and security sign off.

The cut is a new set of tables (`edit_sequences`, `edit_clips`, `edit_markers`, `edit_sequence_versions`, `edit_renders`). It does not write `shots`, `shot_asset_assignments`, or `performance_syncs`. Lyric fit stays the one in `src/lib/storyboard/lyricSync.ts`. A slip on the board stays `slip_seconds`. A slip in the cut moves that clip's source in/out.

`cost_usd` on `edit_renders` is constrained to 0. `edit-render` returns a plan. `scripts/edit-render.mjs` is what runs ffmpeg. Neither calls a generation provider.

## What was verified here

- The YSL cold-open CSV (`src/lib/editor/__fixtures__/edl_v1_coldopen.csv`) imports as 44 picture events, 1133 frames, 47.208 s, song offset 13.792 s, 14 lipsync placeholders.
- The FCP7 XML imports both sequences (1133 and 1464 frames) and round-trips on frames and labels.
- A structural proxy (colour bars, no files attached) still encodes with ffmpeg and ffprobes to about 47.2 s. CI installs ffmpeg so that check runs in `verify`. The plan's cost stays 0 even when ffmpeg is absent.
- A sequence whose clips point at `project_assets` resolves those files and the song. The edge plan lists the real inputs and any missing media. `scripts/edit-render.mjs` downloads only this project's signed storage URLs, probes duration with ffprobe, and encodes. Placeholder clips with no file stay labelled slates. Nothing is written to variation `c067efb9-90af-418e-aa6d-58834f6e19de`.

## Mouth

A montage or restage clip is `mouth = model` (generated articulation). A camera take, or a dress/composite retimed to it, is `mouth = camera`. A constant offset, drift, or wrong articulation need different judgments — do not claim a slip will or will not “line it up,” and do not label a clip lip-synced because audio aligns. Placeholders in the cold open are camera (missing take). Mango “sync” events in that EDL are model mouth.

## Lyric fit

A shot is short only when it cuts a word that has timings, or the file runs out inside the shot. Lines longer than 4 s with no words, lines shorter than a frame, and lines from another section are not the shot's window.

## Audio sync

`performance-sync` measures mono 16 kHz PCM (band-pass 150–4000 Hz, then the existing onset + GCC-PHAT matcher, including the second-window drift). It refuses silence. `dryRun` defaults to true. A write is refused for project `764a63d2-93cd-44f3-905f-292f14ab2f51`. The stored offset +0.8538 s on take `70304981` was not changed. The sign convention is unchanged: positive means the song was already playing; a camera that rolled first measures negative.

`scripts/performance-sync.mjs` extracts the PCM with ffmpeg and prints the measurement. It does not write.

The stored hero files have no audio because the June 2026 trim recipe passed `-an`. `referenceTranscodeArgs` keeps AAC. Those files cannot be synced until a master that still has audio is transcoded with that argv and uploaded. This change does not invent audio for the files already in `project-references`.

Seedance's “4 s” file is 97 frames (4.041667 s). New filings store that. A stored `4` on a montage or restage is read as 97/24 without writing the row.

## What Fendi runs

1. Lovable SQL editor: `supabase/migrations/20261018020000_edit_sequences.sql`. Do not use the Supabase CLI.
2. Lovable → Edge Functions → redeploy `edit-render`, `performance-sync`, and `avt-mcp`. Those functions import only their own folder and `supabase/functions/_shared/` (the cut model, the aligner, and the matcher). Lovable does not bundle `src/` or a sibling function.
3. Lovable Publish for the Cut page (`/projects/$id/editor`).
4. Do not run this against the live YSL board's shots. Importing a sequence writes only the new tables.

Publish is not an edge redeploy.
