#!/usr/bin/env python3
"""First cut from a shot list and a beat grid.

The result is an edit_sequences document: the same fields avt_edit_save writes.
It is not a new EDL. Timeline in/out are song frames snapped to beats.
Performance clips keep speed at 1.
"""
from __future__ import annotations


def _beat(grid: dict, index: int) -> int:
    beats = grid["beats"]
    if index < 0 or index >= len(beats):
        raise ValueError(f"beat {index} is outside the grid")
    return int(beats[index]["frame"])


def beat_to_cut(project_id: str, shot_list: dict, beat_grid: dict, assets: dict[str, dict]) -> dict:
    fps = float(beat_grid["fps"])
    if fps <= 0:
        raise ValueError("fps must be positive")
    clips = []
    beat_index = 0
    for slot in shot_list["slots"]:
        asset = assets.get(slot["slot"])
        if not asset:
            raise ValueError(f"slot {slot['slot']} has no asset")
        length = int(slot["length_frames"])
        start = _beat(beat_grid, beat_index)
        # snap the end to the beat at or after start + length
        end_beat = beat_index
        while end_beat < len(beat_grid["beats"]) - 1 and _beat(beat_grid, end_beat) < start + length:
            end_beat += 1
        end = _beat(beat_grid, end_beat)
        if end <= start:
            end = start + length
        performance = slot["subject"] == "fendi_performance"
        source_in = float(asset.get("source_in", 0))
        clips.append({
            "id": slot["slot"],
            "track": "V1",
            "order": len(clips),
            "shotId": asset.get("shot_id"),
            "shotKey": slot["slot"],
            "assetId": asset["asset_id"],
            "assetVersion": asset.get("version"),
            "name": slot["slot"],
            "sourceIn": source_in,
            "sourceOut": source_in + (end - start) / fps,
            "songZeroOffset": float(asset.get("song_zero_offset", start / fps)),
            "timelineIn": start / fps,
            "timelineOut": end / fps,
            "timelineInFrame": start,
            "timelineOutFrame": end,
            "speed": 1,
            "transition": asset.get("transition", "cut"),
            "transitionSeconds": 0,
            "layerStack": asset.get("layer_stack", []),
            "grade": asset.get("grade", {}),
            "locked": False,
            "timeRemapAllowed": not performance,
            "enabled": True,
            "placeholder": False,
        })
        beat_index = end_beat
    return {
        "projectId": project_id,
        "name": "beat-to-cut",
        "fps": fps,
        "width": 1080,
        "height": 1920,
        "locked": False,
        "songAssetId": beat_grid.get("song_asset_id"),
        "clips": clips,
        "markers": [
            {"kind": "beat", "timeIn": beat["frame"] / fps, "name": "downbeat" if beat["downbeat"] else "beat"}
            for beat in beat_grid["beats"]
        ],
    }
