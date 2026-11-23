# Effects preview: watch what post has built, without a master render

Class C (timelines, rendering). Draft until architecture, product and security sign off. Nothing here calls a
generation provider, changes a board placement or touches the remote renderer (`scripts/render/remote/`).

Fendi, 23 Nov 2026: "we need to have a way to preview post production and what's been built with effects in real
time without rendering."

## The problem

- VERIFIED (`docs/REMOTE_RENDER.md`): the effects of Partnership / Cease & Desist are Python compositors that take
  1.5 to 3.9 s per frame on 4K ProRes. They cannot run while he watches.
- VERIFIED (`src/components/storyboard/SequencePlayer.tsx`, `src/components/editor/SequencePreview.tsx`): AVT plays
  the board and the cut against the song in the browser, plain clips only.
- OBSERVED (23 Nov): the only way to see an effect in context was a full master render, and none had come back.

## DECISION: preview copies, not live effects

Each stretch of the song that post has built gets ONE small file, the effect as actually rendered, at a size a
browser plays. AVT lays the newest copy over the board at its song time. Viewing is instant; only small per-section
files are ever made.

Not chosen: rebuilding each effect as a live browser effect. It would be a second version of every effect that can
drift from the final, and the storm verse (mattes, plates, 4K sources) cannot run live at all.

## The contract of a preview copy

| | |
|---|---|
| Picture | H.264 (`yuv420p`, BT.709 tagged, `+faststart`), the project's frame shape, long side 960 px (1920x1080 → 960x540) |
| Frame rate | the song clock's: 24 fps, constant |
| Sound | none. The song is the only sound in the player |
| Keyframes | one every 12 frames, so a seek lands quickly |
| Length | exactly `round((song_end - song_start) * fps)` frames; frame 0 is the picture at `song_start` |
| Stored at | `project-exports/<user>/<project>/effects_preview/<section>_v<N>.mp4` |
| Filed as | one `project_assets` row: `asset_type: "other"`, `source_tool: "manual"`, `shot_id: null`, `file_url` = the path, `version_number` = N |

`metadata_json` of the row:

```json
{
  "bucket": "project-exports",
  "mime_type": "video/mp4",
  "duration_seconds": 79.625,
  "effects_preview": {
    "section": "storm_verse",
    "version": 3,
    "song_start": 127.917,
    "song_end": 207.542,
    "fps": 24,
    "frames": 1911,
    "label": "Storm verse",
    "built_from": { "source": "verse_v9look_v1e.mov", "sha256": "…", "script": "render_verse_v9look_v1e_p.py", "lock": "LOCK_v1e" },
    "made_at": "2026-11-23T18:00:00Z"
  }
}
```

`section` is a slug (`[a-z0-9_]+`); `version` is a whole number from 1; `song_start` / `song_end` are seconds on the
SONG clock (never the file's). `label`, `built_from` and `made_at` are optional. A row whose record does not parse
is not played.

No schema change: the record lives in `metadata_json`, the file in an existing bucket under the owner's own folder,
read through the same signed links as every other asset. A record is played only when its file is in
`project-exports` under an `effects_preview/` folder (`isEffectsPreviewFile`).

A copy is kept out of the footage lists: `asset_type: "other"` gives it no role on a shot (`roleForAsset`), and a
row that carries the `effects_preview` key, readable or not, is left out of Setup's "Already in this project" and of
the Cut page's Versions panel (`MediaAsset.isEffectsPreview`, `groupVersions`). OBSERVED, not closed here: the
generic "pick a video" lists of the specialist tools (wardrobe lane, Grok edit, Hero Frame) still offer it.

## Which copy plays (pure: `src/lib/storyboard/effectsPreview.ts`)

1. Rejected rows (`approval_status: "rejected"`) are dropped. That takes a bad copy down without deleting it; if the
   section has an earlier version, that one shows again (reject every version to get the plain clip back).
2. Per `section`, only the highest remaining `version` counts (same version twice: the later `made_at`, then
   `created_at`). An older version never shows through, even where the new one is shorter.
3. Where two sections overlap on the song, the one made later is on top. The layer is built from the newest 50
   sections at most.
4. The result is a list of spans that do not overlap. At song time `t` inside a span the copy shows its own time
   `t - song_start`. Outside every span the board's clip plays as before.
5. A copy owns its stretch only once the browser can show it. No link yet, a refused link, a missing or broken file:
   the board plays there as if no copy were filed, and the strip still marks that one is.

## In the app

- **Review** (the board played against the song): an **Effects** switch in the transport, on by default when the
  project has a copy, and a strip under the scrub bar marking each stretch that has one, with its section and
  version. While a copy is on screen the shot's own timed events (flash, brightness) and reframe are not applied:
  they are already in the copy.
- **Cut page** (`/projects/$id/editor`): the same switch over the cut's monitor, addressed by the cut's song clock
  (`songOffset + timeline time`).
- With the switch off, or with no copies, both players behave exactly as before.

## What it is not

- Not the master: 960 px, 8-bit, long-GOP. Colour and fine detail are judged on the render, never here.
- Not proof that a render will succeed. It shows what post has ALREADY rendered for that stretch.
- Not automatic. Post makes and files a copy each time an effect changes (`docs/recipes/EFFECTS_PREVIEW.md`,
  `scripts/render/preview/make_preview.py`). A stretch with no copy shows the plain clip, and the strip says so.

## Security

No new function, table, policy, bucket or secret. The app signs a link for a path taken from a `project_assets` row,
as it already does for every asset on the board; this feature signs only in `project-exports` and only for a path
under `effects_preview/`.

What it does NOT do is prove who wrote the row. While SEC-4 is open (`RISK_REGISTER.md`: `project_assets` and
`project-exports` are writable beyond the owner), anyone who can insert a row into a project can put a picture over
a stretch of its Review and Cut players with one row and no board placement. That is the same exposure every asset
row has today, made more visible; it closes with SEC-4, and is recorded there. A rejected row is not shown, which is
the owner's way to take one down.

The maker script runs offline with ffmpeg, calls it with argument lists (no shell), validates the section slug and
the two ids before it builds any path, takes file paths as arguments, and prints the path and record to file; it
holds no token and uploads nothing.

## What was verified (23 Nov 2026)

- VERIFIED (tests, by category per `docs/TEST_TAXONOMY.md`): 22 unit cases (`effectsPreview.test.ts` 21,
  `versionLabels.test.ts` 1); 15 mocked-integration cases on the two players (`effectsPreviewUi.test.tsx` 9,
  `SequencePreviewEffects.test.tsx` 6); 14 Python cases on the maker, 3 of which encode synthetic media with ffmpeg
  and read frames back. Provider-live 0, real-media-benchmark 0, deployment-smoke 0.
- VERIFIED (one manual run, not in the suite): this branch served locally, signed in as the owner, Review of
  Partnership (`0c5c4421`). A copy made by `make_preview.py` from the storm verse's earlier v1 final
  (`verse_v9look_v1.mp4`, sha256 `703c117d…`, 1911 frames) and filed as asset `fcc60a64` shows as one bar at
  2:07 to 3:27; with the song playing, the copy's playhead was 0.03 s from `song time - song_start` at 6 s and at
  10 s; Effects off puts the board's clip back, on puts the copy back.
- OBSERVED: paused, a copy may rest up to 0.2 s from the playhead (the board's existing seek tolerance,
  `DRIFT_TOLERANCE`); playing, it is nudged to within a frame.
- NOT verified: the Cut page against a real cut (Partnership has no `edit_sequences`); the published app (nothing
  is live until Lovable Publish); phones.

## To make it live

Lovable **Publish** only (frontend). No SQL. No edge function redeploy.
