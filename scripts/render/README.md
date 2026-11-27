# scripts/render — the renderer that executes a render contract

`render_contract.py` turns `storyboard_timeline.json` (render contract version 3, written by the app's Export from
the same timeline Review plays) into one MP4, with ffmpeg. It decides nothing editorial: the contract says, per shot
and in output frames, which file, where its picture starts, how long it holds and plays, and what the edit does to
the picture.

```
python3 scripts/render/render_contract.py storyboard_timeline.json --media media.json --out cut.mp4
python3 scripts/render/render_contract.py storyboard_timeline.json --media media.json --plan      # the ffmpeg command only
python3 -m pytest scripts/render/tests                                                            # needs ffmpeg
```

`media.json`: `{ "<bucket>/<path>": "<local path or https URL>" }` for every file the contract names.

It is not wired into the app: the app's servers cannot run ffmpeg. What is missing and the smallest way to add it is
in `docs/RENDER_CONTRACT_AND_BOUNDARY.md`.

The Partnership verse compositor (`render_verse_v9look_v1e_p.py`, locked, not in this repo) has its own runner in
`scripts/render/remote/`. That path is a dry-run by default. Read `docs/REMOTE_RENDER.md` before any execute.

## Effects preview copies

`scripts/render/preview/make_preview.py` turns a finished effects file into the small copy AVT plays in place over
the song (Review and the Cut page), checks its frame count against the stretch of the song it covers, and prints
where to upload it and the row to file. It uploads nothing. Contract: `docs/design/EFFECTS_PREVIEW.md`; how post
uses it: `docs/recipes/EFFECTS_PREVIEW.md`.

```
python3 -I scripts/render/preview/make_preview.py <finished file> --section storm_verse --version 1 --song-frames 3070-4980 --out-dir <folder>
python3 -m pytest scripts/render/preview/tests                                                     # needs ffmpeg
```
