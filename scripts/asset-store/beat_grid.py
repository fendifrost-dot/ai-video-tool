#!/usr/bin/env python3
"""Beat grid from real audio. ffmpeg decodes; numpy finds onsets. librosa is used when it is installed.

The document is avt.beat_grid (format_version 1). It is stored as a project_assets row.
This script does not upload and does not delete.

  python3 scripts/asset-store/beat_grid.py --wav clicks.wav --fps 24 --song-asset-id <uuid>
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import subprocess
import wave

import numpy as np


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        raw = handle.readframes(handle.getnframes())
    if width == 2:
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif width == 4:
        samples = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise SystemExit(f"unsupported wav width {width}")
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, rate


def decode_with_ffmpeg(path: str) -> tuple[np.ndarray, int]:
    rate = 22050
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"],
        check=True,
        capture_output=True,
    )
    samples = np.frombuffer(proc.stdout, dtype="<i2").astype(np.float64) / 32768.0
    return samples, rate


def onsets(samples: np.ndarray, rate: int, hop: int = 512) -> list[int]:
    if samples.size < hop * 2:
        return []
    energy = np.array([
        float(np.sqrt(np.mean(samples[i : i + hop] ** 2)))
        for i in range(0, samples.size - hop, hop)
    ])
    if energy.size < 3:
        return []
    flux = np.maximum(0.0, np.diff(energy, prepend=energy[0]))
    threshold = max(float(np.median(flux)) * 3.0, float(np.max(flux)) * 0.35, 1e-6)
    hits: list[int] = []
    refractory = int(rate * 0.25 / hop)
    last = -refractory
    for index, value in enumerate(flux):
        if value >= threshold and index - last >= refractory and value >= flux[max(0, index - 1)] and value >= flux[min(len(flux) - 1, index + 1)]:
            hits.append(index * hop)
            last = index
    return hits


def grid_from_onsets(hits: list[int], rate: int, fps: float, song_asset_id: str) -> dict:
    if len(hits) < 2:
        raise SystemExit("not enough onsets for a beat grid")
    intervals = np.diff(np.array(hits, dtype=np.float64)) / rate
    period = float(np.median(intervals))
    if period <= 0:
        raise SystemExit("beat period is zero")
    bpm = 60.0 / period
    beats = []
    for index, sample in enumerate(hits):
        frame = int(round(sample / rate * fps))
        beats.append({"frame": frame, "downbeat": index % 4 == 0})
    deduped = []
    for beat in beats:
        if deduped and deduped[-1]["frame"] == beat["frame"]:
            deduped[-1]["downbeat"] = deduped[-1]["downbeat"] or beat["downbeat"]
            continue
        deduped.append(beat)
    if not any(beat["downbeat"] for beat in deduped):
        deduped[0]["downbeat"] = True
    span = deduped[-1]["frame"] - deduped[0]["frame"]
    return {
        "format": "avt.beat_grid",
        "format_version": 1,
        "song_asset_id": song_asset_id,
        "fps": fps,
        "bpm": round(bpm, 3),
        "beats": deduped,
        "sections": [{"name": "all", "in_frame": deduped[0]["frame"], "out_frame": deduped[0]["frame"] + max(span, 1)}],
    }


def load_audio(path: str) -> tuple[np.ndarray, int]:
    if path.lower().endswith(".wav"):
        try:
            return read_wav(path)
        except wave.Error:
            return decode_with_ffmpeg(path)
    return decode_with_ffmpeg(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wav", required=True)
    parser.add_argument("--fps", type=float, default=24)
    parser.add_argument("--song-asset-id", required=True)
    args = parser.parse_args()
    samples, rate = load_audio(args.wav)
    try:
        import librosa  # type: ignore

        tempo, beat_frames = librosa.beat.beat_track(y=samples, sr=rate, units="frames")
        times = librosa.frames_to_time(beat_frames, sr=rate)
        hits = [int(t * rate) for t in times]
        bpm_lib = float(np.atleast_1d(tempo)[0])
        doc = grid_from_onsets(hits or onsets(samples, rate), rate, args.fps, args.song_asset_id)
        if math.isfinite(bpm_lib) and bpm_lib > 0:
            doc["bpm"] = round(bpm_lib, 3)
    except Exception:
        doc = grid_from_onsets(onsets(samples, rate), rate, args.fps, args.song_asset_id)
    print(json.dumps(doc))


def write_click_wav(path: str, bpm: float = 120, seconds: float = 4, rate: int = 22050) -> None:
    period = int(rate * 60 / bpm)
    total = int(rate * seconds)
    buf = bytearray()
    for index in range(total):
        click = index % period < int(rate * 0.01)
        value = 16000 if click else 0
        buf += struct.pack("<h", value)
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(buf)


if __name__ == "__main__":
    main()
