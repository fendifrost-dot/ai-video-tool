# Asset store formats

Versioned production documents live as `project_assets` rows in Supabase (`qoyxgnkvjukovkrvdaiq`). They are not a second edit list. The cut stays `edit_sequences`.

| Document | `metadata_json.format` | Tool |
|---|---|---|
| Shot list | `avt.shot_list` | `avt_shot_list_get`, `avt_shot_list_save` |
| Beat grid | `avt.beat_grid` | `avt_beat_grid_get`, `avt_beat_grid_save` |
| Project rules | `avt.project_rules` | `avt_project_rules_get`, `avt_project_rules_save` |

`scripts/asset-store/beat_grid.py` builds a beat grid from a wav. The default detector is the standard library. librosa is used when it is installed. ffmpeg decodes anything that is not a wav. The script prints JSON. It does not upload and it does not delete. Store the JSON with `avt_beat_grid_save`.

Review previews in the rules file are 1080×1920, SAR 1:1. Face, mouth, and likeness fields are fixed: real pixels, no mouth alteration, no generated likeness.

Camera originals stay on the T7. Nothing in this folder deletes a T7 path.

Migration: `supabase/migrations/20261113120000_asset_store_extensions.sql`, applied in the Lovable SQL editor. Not applied by this repo's tests.
