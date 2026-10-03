# scripts/render — the renderer that executes a render contract

`render_contract.py` turns `storyboard_timeline.json` (render contract version 2, written by the app's Export from
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
