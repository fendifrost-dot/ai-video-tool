# Song ↔ performance synchronization (YSL Real Video #1)

**Status:** MEASURED · 2026-09-20 · Claude takeover · $0 · reproducible.

## The problem this solves

The performance master is one continuous recording. Its `t = 0` is **not** the song's `t = 0`: the
camera was rolling, the song was already playing in the room, and Fendi walks into frame during the
intro. Every editorial decision must therefore be made on the **song clock** and mapped to a
**source range** on the master through one canonical, inspectable record.

```
song_time = performance_time · (1 + drift_ppm / 1e6) + offset_seconds
```

## Canonical record — YSL (Ice On)

| Field | Value |
|---|---|
| Song asset | `067a4cbf-6fd0-4601-9111-df1119c52fa6` — `7. YSL (ICE ON) - ALBUM MASTER - 04.21.24.wav`, 201.874 s, 48 kHz stereo float |
| Performance asset | `55bdc383-50e7-41b8-9ec9-8bda031ac5e0` — `IMG_5633.mov`, 190.330 s, 3840×2160 HEVC (display rotation −90° → portrait), AAC 48 kHz. **This is the only master encode that carries the audio track** (`hero_clip_h264.mp4`, `hero_clip_hd_1080.mp4` are video-only). |
| `offset_seconds` | **0.8538** |
| `drift_ppm` | −0.22 (i.e. none) |
| Method | `gcc_phat_windowed_16k_10s` — 30 windows × 10 s, hop 6 s, GCC-PHAT against the full song at 16 kHz |
| Evidence | 23 / 30 windows consistent (2nd-best peak < 0.6 of best), median 0.8538 s, min 0.8536, max 0.8538; the 7 inconsistent windows are loop-ambiguous hook repeats where the second candidate sits ±8–110 s away, never near the true offset |
| Record | `docs/sync/ysl-ice-on.performance-sync.json` (full per-window table) · code constant `YSL_ICE_ON_PERFORMANCE_SYNC` in `src/lib/sync/performanceSync.ts` |

Consequences: master `0:00.000` = song `0:00.854`; master ends at song `3:11.19`; the song runs to
`3:21.87` (fade from ~3:06). The visual pre-roll (empty closet, walk-in) is master 0–≈9 s = song
0.85–≈10 s, inside the 12-s intro. Song ranges before 0.854 s or after 191.19 s have no performance
coverage and `sourceRangeForSongRange()` returns `null` for them.

## Musical grid (measured from the album master, not assumed)

Onset-envelope comb filter over 120–125 BPM at 1/16-beat phase steps: **122.00 BPM**, downbeat at
**0.000 s**, beat 0.4918 s, bar 1.9672 s. (The earlier treatment seed's 140 BPM was an explicit
hypothesis; it is superseded.) Landmarks from the transcript + energy: hook tag at bar 8 (15.74 s),
verse 1 from bar 10, pre-hook rapid-fire verse at bar 24 (47.21 s), **hook block bars 32–45
(62.95–90.49 s, four repeats)**, breakdown with no bass 141.6–157.4 s, outro hook from 173.1 s.

## Reproduce

```
python3 scripts/sync/align_song_performance.py song.wav master_audio.m4a --out sync.json
```
Inputs are decoded to mono 16 kHz by ffmpeg; the script prints the record and the per-window table.
Any new master/song pair gets its own row in `public.performance_syncs`
(migration `20260920120000_performance_sync_source_ranges.sql`). If no window is consistent the script
exits 2 and the operator supplies a manual offset (`status = 'manual'`) — the sync is never guessed.

## How the edit uses it

`timeline_items` now carries `source_asset_id`, `source_in_seconds`, `source_out_seconds`, `sync_id`,
`output_asset_id`, `treatment_shot_id`, `look_id`, `production_status`, `provenance_json`. A
performance shot on the song clock `[start, end)` resolves to master
`[songToPerformance(start), songToPerformance(end))`; the rendered/transformed clip goes in
`asset_id` / `output_asset_id`; the master is never cut destructively. `ShotSpec.timeline` stays on
the song clock and `ShotSpec.source.range` holds the resolved master range.
