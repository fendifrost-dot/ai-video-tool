#!/usr/bin/env python3
"""Beat grid from real audio. ffmpeg decodes. Onsets are standard-library. librosa is used when it is installed.

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

Samples = list[float]


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def read_wav(path: str) -> tuple[Samples, int]:
    with wave.open(path, "rb") as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        count = handle.getnframes()
        raw = handle.readframes(count)
    if width == 2:
        samples = [struct.unpack_from("<h", raw, i)[0] / 32768.0 for i in range(0, len(raw), 2)]
    elif width == 4:
        samples = [struct.unpack_from("<i", raw, i)[0] / 2147483648.0 for i in range(0, len(raw), 4)]
    else:
        raise SystemExit(f"unsupported wav width {width}")
    if channels > 1:
        mixed = []
        for index in range(0, len(samples), channels):
            mixed.append(sum(samples[index : index + channels]) / channels)
        samples = mixed
    return samples, rate


def decode_with_ffmpeg(path: str) -> tuple[Samples, int]:
    rate = 22050
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"],
        check=True,
        capture_output=True,
    )
    raw = proc.stdout
    samples = [struct.unpack_from("<h", raw, i)[0] / 32768.0 for i in range(0, len(raw) - 1, 2)]
    return samples, rate


def onsets(samples: Samples, rate: int, hop: int = 512) -> list[int]:
    if len(samples) < hop * 2:
        return []
    energy = []
    for start in range(0, len(samples) - hop, hop):
        window = samples[start : start + hop]
        energy.append(math.sqrt(sum(sample * sample for sample in window) / hop))
    if len(energy) < 3:
        return []
    flux = [0.0]
    for index in range(1, len(energy)):
        flux.append(max(0.0, energy[index] - energy[index - 1]))
    threshold = max(_median(flux) * 3.0, max(flux) * 0.35, 1e-6)
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
    intervals = [(hits[index + 1] - hits[index]) / rate for index in range(len(hits) - 1)]
    period = _median(intervals)
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


def load_audio(path: str) -> tuple[Samples, int]:
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
    doc = grid_from_onsets(onsets(samples, rate), rate, args.fps, args.song_asset_id)
    try:
        import librosa  # type: ignore
        import numpy as np

        audio = np.asarray(samples, dtype=np.float64)
        tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=rate, units="frames")
        times = librosa.frames_to_time(beat_frames, sr=rate)
        hits = [int(t * rate) for t in times]
        if len(hits) >= 2:
            doc = grid_from_onsets(hits, rate, args.fps, args.song_asset_id)
            bpm_lib = float(np.atleast_1d(tempo)[0])
            if math.isfinite(bpm_lib) and bpm_lib > 0:
                doc["bpm"] = round(bpm_lib, 3)
    except Exception:
        pass
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
