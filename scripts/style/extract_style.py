#!/usr/bin/env python3
"""Learn an editing style from a reference video. Local, CPU, $0.

ffmpeg decodes the picture and the audio. Shot cuts are a chroma distance, or
PySceneDetect when it is installed. Beats are the onset flux in
scripts/asset-store/beat_grid.py, or librosa when it is installed. Blur uses
OpenCV when it is installed, otherwise a numpy Laplacian.

No network. --vision is off unless you pass it, and even then this script does
not call a model. A local label file is read only when AVT_STYLE_VISION=local
and AVT_STYLE_VISION_LABELS points at a JSON list of strings. Anything else is
recorded as refused.

  python3 scripts/style/extract_style.py reference.mp4 --out style.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import subprocess
import sys

import numpy as np

MATCHED = [
    "shot boundaries",
    "shot-length distribution",
    "hard cuts",
    "flash and white frames",
    "letterbox and aspect",
    "average contrast and saturation",
    "cut timing against audio onsets",
    "starter-taxonomy effects whose signal fires",
]
APPROXIMATED = [
    "crossfades and whip pans",
    "speed ramps and slow motion",
    "zoom and shake intensity",
    "color grade as lift, gamma, gain and a generated LUT",
    "grain and vignette amount",
    "text and caption overlays",
    "strobe, RGB split, and glitch",
    "vision-model labels",
    "unclassified visual events",
]

TRANSITIONS = ("hard_cut", "crossfade", "flash", "whip")


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _round(value: float, places: int = 4) -> float:
    return round(float(value), places)


def _probe(path: str) -> dict:
    raw = subprocess.check_output(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]
    )
    data = json.loads(raw)
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video:
        raise SystemExit("no video stream")
    width = int(video["width"])
    height = int(video["height"])
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "24/1"
    num, den = rate.split("/")
    fps = float(num) / float(den) if float(den) else 24.0
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    audio = any(stream.get("codec_type") == "audio" for stream in data.get("streams", []))
    return {"width": width, "height": height, "fps": fps if fps > 0 else 24.0, "duration": duration, "audio": audio}


def _sample_fps(src_fps: float, duration: float) -> float:
    cap = 24.0 if duration <= 90 else 12.0 if duration <= 300 else 8.0
    return max(1.0, min(src_fps, cap))


def _decode(path: str, sample_fps: float, width: int = 160) -> tuple[list[np.ndarray], float]:
    probe = _probe(path)
    height = int(round(width * probe["height"] / probe["width"]))
    if height % 2:
        height += 1
    if height < 2:
        height = 2
    proc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-i", path,
            "-vf", f"fps={sample_fps},scale={width}:{height}",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        stdout=subprocess.PIPE,
    )
    assert proc.stdout is not None
    frame_bytes = width * height * 3
    frames: list[np.ndarray] = []
    while True:
        buf = proc.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        frames.append(np.frombuffer(buf, dtype=np.uint8).reshape(height, width, 3).copy())
        if len(frames) > 20000:
            break
    proc.wait()
    if proc.returncode != 0 or not frames:
        raise SystemExit("ffmpeg could not decode frames")
    return frames, sample_fps


def _luma(frame: np.ndarray) -> np.ndarray:
    rgb = frame.astype(np.float32) / 255.0
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def _center(frame: np.ndarray) -> np.ndarray:
    """Middle of the picture, so letterbox bars do not dilute a cut or a white frame."""
    height, width = frame.shape[:2]
    y0, y1 = int(height * 0.2), max(int(height * 0.8), int(height * 0.2) + 1)
    x0, x1 = int(width * 0.1), max(int(width * 0.9), int(width * 0.1) + 1)
    return frame[y0:y1, x0:x1]


def _mean_rgb(frame: np.ndarray) -> np.ndarray:
    return _center(frame).astype(np.float32).mean(axis=(0, 1)) / 255.0


def _color_dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.abs(a - b).mean())


def _blur_var(frame: np.ndarray) -> float:
    try:
        import cv2  # type: ignore

        gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        return float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:
        luma = _luma(frame)
        lap = (
            -4 * luma[1:-1, 1:-1]
            + luma[:-2, 1:-1]
            + luma[2:, 1:-1]
            + luma[1:-1, :-2]
            + luma[1:-1, 2:]
        )
        return float(lap.var())


def _scene_times(path: str) -> list[float] | None:
    try:
        from scenedetect import open_video, SceneManager  # type: ignore
        from scenedetect.detectors import ContentDetector  # type: ignore
    except Exception:
        return None
    try:
        video = open_video(path)
        manager = SceneManager()
        manager.add_detector(ContentDetector())
        manager.detect_scenes(video)
        return [scene[0].get_seconds() for scene in manager.get_scene_list()]
    except Exception:
        return None


def _load_beat_module():
    path = os.path.join(os.path.dirname(__file__), "..", "asset-store", "beat_grid.py")
    spec = importlib.util.spec_from_file_location("avt_beat_grid", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("beat grid module is missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _onsets(path: str) -> tuple[list[float], str]:
    module = _load_beat_module()
    samples, rate = module.load_audio(path)
    detector = "onset-flux"
    hits = module.onsets(samples, rate)
    try:
        import librosa  # type: ignore

        audio = np.asarray(samples, dtype=np.float64)
        _tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=rate, units="frames")
        times = librosa.frames_to_time(beat_frames, sr=rate)
        librosa_hits = [float(time) for time in times]
        if len(librosa_hits) >= 2:
            return librosa_hits, "librosa"
    except Exception:
        pass
    return [hit / rate for hit in hits], detector


def _bars(frames: list[np.ndarray]) -> tuple[float, float, float, float]:
    stack = np.stack([_luma(frame) for frame in frames])
    row = stack.mean(axis=(0, 2))
    col = stack.mean(axis=(0, 1))

    def run(mask: np.ndarray, start: int, step: int) -> int:
        count = 0
        index = start
        while 0 <= index < len(mask) and mask[index]:
            count += 1
            index += step
        return count

    row_black = row < 0.06
    col_black = col < 0.06
    top = run(row_black, 0, 1)
    bottom = run(row_black, len(row_black) - 1, -1)
    left = run(col_black, 0, 1)
    right = run(col_black, len(col_black) - 1, -1)
    height = len(row)
    width = len(col)

    def frac(count: int, size: int) -> float:
        ratio = count / size
        if ratio < 0.04 or ratio > 0.45:
            return 0.0
        return _round(ratio, 4)

    return frac(top, height), frac(bottom, height), frac(left, width), frac(right, width)


def _inner(frame: np.ndarray, bars: tuple[float, float, float, float]) -> np.ndarray:
    height, width = frame.shape[:2]
    top = int(round(bars[0] * height))
    bottom = int(round(bars[1] * height))
    left = int(round(bars[2] * width))
    right = int(round(bars[3] * width))
    y1 = max(top + 1, height - bottom)
    x1 = max(left + 1, width - right)
    return frame[top:y1, left:x1]


def _grade(frames: list[np.ndarray]) -> dict:
    if not frames:
        return {"contrast": 1, "saturation": 1, "grain": 0, "vignette": 0, "lift": 0, "gamma": 1, "gain": 1}
    rgb = np.concatenate([frame.reshape(-1, 3) for frame in frames]).astype(np.float32) / 255.0
    luma = 0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]
    peak = rgb.max(axis=1)
    sat = (peak - rgb.min(axis=1)) / np.maximum(peak, 1e-6)
    p5, p50, p95 = np.percentile(luma, [5, 50, 95])
    grain_scores = []
    vignette_scores = []
    for frame in frames[:: max(1, len(frames) // 8)]:
        picture = _luma(frame)
        if picture.shape[0] < 5 or picture.shape[1] < 5:
            continue
        blur = (
            picture[:-2, 1:-1]
            + picture[2:, 1:-1]
            + picture[1:-1, :-2]
            + picture[1:-1, 2:]
            + picture[1:-1, 1:-1]
        ) / 5
        grain_scores.append(float(np.abs(picture[1:-1, 1:-1] - blur).mean()))
        height, width = picture.shape
        center = picture[height // 4 : 3 * height // 4, width // 4 : 3 * width // 4].mean()
        edge = np.concatenate(
            [
                picture[: max(1, height // 8), :].ravel(),
                picture[-max(1, height // 8) :, :].ravel(),
                picture[:, : max(1, width // 8)].ravel(),
                picture[:, -max(1, width // 8) :].ravel(),
            ]
        ).mean()
        vignette_scores.append(0.0 if center < 0.05 else _clip(1 - float(edge) / float(center), 0, 1))
    return {
        "contrast": _round(_clip(float(luma.std()) / 0.18, 0.6, 1.8)),
        "saturation": _round(_clip(float(sat.mean()) / 0.35, 0.4, 1.8)),
        "grain": _round(_clip((sum(grain_scores) / len(grain_scores) if grain_scores else 0) / 0.08, 0, 1)),
        "vignette": _round(_clip(sum(vignette_scores) / len(vignette_scores) if vignette_scores else 0, 0, 1)),
        "lift": _round(_clip(float(p5) - 0.04, -0.1, 0.15)),
        "gamma": _round(_clip(0.45 / max(float(p50), 0.05), 0.6, 1.6)),
        "gain": _round(_clip(float(p95) / 0.92, 0.7, 1.3)),
    }


def _edge(luma: np.ndarray) -> float:
    if luma.shape[1] < 2:
        return 0.0
    return float(np.abs(np.diff(luma, axis=1)).mean())


def _text_presence(frames: list[np.ndarray], bars: tuple[float, float, float, float]) -> float:
    hits = 0
    for frame in frames:
        inner = _luma(_inner(frame, bars))
        height = inner.shape[0]
        if height < 8:
            continue
        band = inner[int(height * 0.8) :, :]
        middle = inner[int(height * 0.35) : int(height * 0.65), :]
        if _edge(band) > 1.8 * max(_edge(middle), 1e-4):
            hits += 1
    return _round(hits / len(frames) if frames else 0, 4)


def _rgb_split(frame: np.ndarray) -> float:
    picture = frame.astype(np.float32)
    red, blue = picture[:, :, 0], picture[:, :, 2]
    aligned = float(np.abs(red - blue).mean())
    if aligned < 1:
        return 0.0
    shifted = float(np.abs(red[:, 2:] - blue[:, :-2]).mean())
    return max(0.0, (aligned - shifted) / (aligned + 1))


def _row_tear(prev: np.ndarray, frame: np.ndarray) -> float:
    a = _luma(prev).mean(axis=1)
    b = _luma(frame).mean(axis=1)
    if abs(float(a.mean()) - float(b.mean())) > 0.2:
        return 0.0
    return float((np.abs(a - b) > 0.25).mean())


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = (len(ordered) - 1) * p
    i = int(k)
    frac = k - i
    if i + 1 < len(ordered):
        return ordered[i] * (1 - frac) + ordered[i + 1] * frac
    return ordered[i]


def _aspect(width: int, height: int) -> str:
    if height <= 0:
        return "unknown"
    ratio = width / height
    for name, target in (("16:9", 16 / 9), ("9:16", 9 / 16), ("1:1", 1), ("4:3", 4 / 3)):
        if abs(ratio - target) < 0.08:
            return name
    return f"{width}:{height}"


def _vision(enabled: bool) -> dict:
    if not enabled:
        return {"enabled": False, "labels": [], "status": "off"}
    if os.environ.get("AVT_STYLE_VISION") == "local" and os.environ.get("AVT_STYLE_VISION_LABELS"):
        with open(os.environ["AVT_STYLE_VISION_LABELS"], "r", encoding="utf-8") as handle:
            labels = json.load(handle)
        if isinstance(labels, list) and all(isinstance(label, str) and len(label) <= 80 for label in labels[:24]):
            return {"enabled": True, "labels": labels[:24], "status": "local"}
    return {"enabled": False, "labels": [], "status": "refused"}


def _summary(count: int, duration: float, length: dict, timing: dict, transitions: dict, grade: dict, aspect: str, letterbox: bool, text: float, fx: dict, vision: dict) -> str:
    dominant = max(TRANSITIONS, key=lambda key: transitions[key])
    names = [name for name, on in (("strobe", fx["strobe"]), ("RGB split", fx["rgb_split"]), ("glitch", fx["glitch"])) if on]
    fx_line = ", ".join(names) if names else "none of strobe, RGB split, or glitch"
    bars = "with letterbox bars" if letterbox else "without letterbox"
    return (
        f"{count} shots over {duration:.1f}s (median {length['median']:.2f}s, from {length['p10']:.2f}s to {length['p90']:.2f}s). "
        f"Cuts land on the beat {timing['on_beat_ratio'] * 100:.0f}% of the time (median offset {abs(timing['median_offset_seconds']) * 1000:.0f} ms). "
        f"Preference: {timing['prefer']}. Transitions are mostly {dominant.replace('_', ' ')}. "
        f"Grade contrast {grade['contrast']:.2f}, saturation {grade['saturation']:.2f}, grain {grade['grain']:.2f}, vignette {grade['vignette']:.2f}. "
        f"Frame {aspect} {bars}. Text-like overlays on about {text * 100:.0f}% of frames. "
        f"Detected FX: {fx_line}. Vision labels are {vision['status']}."
    )


def _recipe(tier: str, kind: str, why: str, filter_name: str | None = None, per_frame: str | None = None, avt_function: str | None = None, avt_route: str | None = None) -> dict:
    return {
        "tier": tier,
        "kind": kind,
        "filter": filter_name,
        "per_frame": per_frame,
        "params": {},
        "timing": "on the measured window",
        "avt_function": avt_function,
        "avt_route": avt_route,
        "why": why,
    }


# Code first. A local model only for a matte. Generative only when something new is invented,
# and then only as a pointer at an AVT function that already exists.
_EFFECTS = {
    "flash": ("light", "hard", ["flash", "white frame"], ["flash frame", "white hit"], "the screen flashes white", True, _recipe("code", "ffmpeg", "A white frame is a brightness ramp on the frames you have.", "xfade=fadewhite")),
    "hard_cut": ("transition", "sharp", ["hard cut", "cut"], ["smash cut"], "the picture cuts", True, _recipe("code", "ffmpeg", "A cut is a timing rule. Nothing is generated.")),
    "crossfade": ("transition", "soft", ["crossfade", "dissolve"], ["mix"], "one shot dissolves into the next", False, _recipe("code", "ffmpeg", "ffmpeg xfade mixes the two shots that were filmed.", "xfade=fade")),
    "whip": ("camera", "fast", ["whip pan"], ["swish pan"], "the camera whips and the picture smears", True, _recipe("code", "per_frame", "The smear is a per-frame blur of the frames that were filmed.", per_frame="motion_blur")),
    "letterbox": ("frame", "wide", ["letterbox"], ["bars"], "black bars frame the picture", False, _recipe("code", "ffmpeg", "Bars are a pad around the filmed frame.", "pad")),
    "text_overlay": ("overlay", "graphic", ["text", "caption"], ["titles", "kinetic type"], "a graphic or words sit on the frame", False, _recipe("code", "ffmpeg", "The detector sees a high-contrast band. It does not read or rewrite the words.")),
    "grade": ("color", "graded", ["color grade"], ["lut", "look"], "the color is graded", False, _recipe("code", "ffmpeg", "The grade is a generated .cube from the measured curves.", "lut3d")),
    "grain": ("texture", "filmic", ["film grain"], ["grain"], "the picture is grainy", False, _recipe("code", "ffmpeg", "Grain is procedural noise on the filmed frame.", "noise")),
    "vignette": ("lens", "close", ["vignette"], ["falloff"], "the corners fall dark", False, _recipe("code", "ffmpeg", "A vignette is a falloff on the filmed frame.", "vignette")),
    "strobe": ("light", "hard", ["strobe"], ["flicker"], "the brightness pulses", True, _recipe("code", "ffmpeg", "A strobe is a timed brightness pulse.", "eq=brightness")),
    "rgb_split": ("glitch", "digital", ["RGB split"], ["channel offset"], "the color channels slide apart", False, _recipe("code", "per_frame", "The channels of the filmed frame are slid.", per_frame="chromatic")),
    "glitch": ("glitch", "broken", ["glitch"], ["tear"], "rows of the picture tear", False, _recipe("code", "per_frame", "Rows of the filmed frame are shifted. Nothing new is drawn.", per_frame="row_glitch")),
    "zoom_punch": ("camera", "punchy", ["zoom punch"], ["punch-in"], "the shot punches in", True, _recipe("code", "ffmpeg", "A punch-in is a crop of the filmed frame.", "scale+crop")),
    "shake": ("camera", "restless", ["camera shake"], ["handheld"], "the frame shakes", False, _recipe("code", "ffmpeg", "Shake is a small crop offset. Withheld on a performance take when it is heavy.", "crop")),
}


def _one_effect(index: int, taxonomy_id: str, start: float, end: float, intensity: float, signals: dict, source: str) -> dict:
    category, mood, names, aliases, plain, tempo, recipe = _EFFECTS[taxonomy_id]
    bucket = round(max(0.0, min(1.0, intensity)) * 5)
    return {
        "id": f"fx-{index}",
        "taxonomy_id": taxonomy_id,
        "plain": plain,
        "names": names,
        "aliases": aliases,
        "category": category,
        "mood": mood,
        "intensity": _round(intensity),
        "tempo_sync": tempo,
        "start": _round(start, 3),
        "end": _round(max(end, start + 0.04), 3),
        "source_label": source,
        "signals": {key: _round(value) for key, value in signals.items()},
        "recipe": recipe,
        "preview": {"time": _round(start, 3), "thumbnail_jpeg_base64": "", "clip": None},
        "variant_of": None,
        "effect_key": f"{taxonomy_id}:code:{bucket}",
    }


def _unclassified(index: int, start: float, end: float, signals: dict, source: str) -> dict:
    words = []
    if signals.get("luma_spike", 0) >= 0.35:
        words.append("the picture suddenly gets very bright")
    if signals.get("color_jump", 0) >= 0.35:
        words.append("the color jumps")
    if signals.get("motion_spike", 0) >= 0.35:
        words.append("the picture lurches")
    plain = ", and ".join(words) if words else "something distinctive happens in the picture"
    intensity = max(signals.values()) if signals else 0.5
    bucket = round(max(0.0, min(1.0, intensity)) * 5)
    return {
        "id": f"fx-{index}",
        "taxonomy_id": "unclassified",
        "plain": plain,
        "names": ["unclassified event"],
        "aliases": ["something", "the thing"],
        "category": "open",
        "mood": "unknown",
        "intensity": _round(intensity),
        "tempo_sync": False,
        "start": _round(start, 3),
        "end": _round(max(end, start + 0.04), 3),
        "source_label": source,
        "signals": {key: _round(value) for key, value in signals.items()},
        "recipe": _recipe("code", "per_frame", "The measured brightness, color and motion are replayed. No new object is drawn.", per_frame="signal_replay"),
        "preview": {"time": _round(start, 3), "thumbnail_jpeg_base64": "", "clip": None},
        "variant_of": None,
        "effect_key": f"unclassified:code:{bucket}",
    }


def _preview_jpeg(video: str, time: float) -> str:
    import base64
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, time):.3f}", "-i", video, "-frames:v", "1", "-vf", "scale=96:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
        capture_output=True,
    )
    if proc.returncode != 0 or len(proc.stdout) < 50 or len(proc.stdout) > 60000:
        return ""
    return base64.b64encode(proc.stdout).decode("ascii")


def _build_effects(shots: list, grade: dict, letterbox: bool, text: float, fx: dict, camera: dict, lumas: list, colors: list, motions: list, step: float, source: str, video: str) -> tuple[list, dict]:
    effects: list[dict] = []
    covered: list[tuple[float, float]] = []

    def cover(start: float, end: float) -> bool:
        return any(not (end < a or start > b) for a, b in covered)

    def add(effect: dict) -> None:
        effects.append(effect)
        covered.append((effect["start"], effect["end"]))

    for shot in shots:
        kind = shot["transition_out"]
        start, end = float(shot["start"]), float(shot["end"])
        if kind == "flash":
            add(_one_effect(len(effects), "flash", end - 0.08, end, 0.9, {"luma_spike": 0.9}, source))
        elif kind == "crossfade":
            add(_one_effect(len(effects), "crossfade", end - 0.12, end, 0.6, {"crossfade": 0.8}, source))
        elif kind == "whip":
            add(_one_effect(len(effects), "whip", end - 0.12, end, 0.7, {"whip": 0.8, "blur": 0.7}, source))
        elif shot["index"] < len(shots) - 1:
            add(_one_effect(len(effects), "hard_cut", end - 0.04, end, 0.8, {"hard_cut": 1}, source))
    if letterbox:
        add(_one_effect(len(effects), "letterbox", 0, shots[-1]["end"], 0.8, {"letterbox": 1}, source))
    if text >= 0.2:
        add(_one_effect(len(effects), "text_overlay", 0, shots[-1]["end"], min(1, text), {"edge_band": min(1, text)}, source))
    if abs(grade["contrast"] - 1) >= 0.15 or abs(grade["saturation"] - 1) >= 0.15:
        add(_one_effect(len(effects), "grade", 0, shots[-1]["end"], 0.6, {"grade": 0.6}, source))
    if grade["grain"] >= 0.25:
        add(_one_effect(len(effects), "grain", 0, shots[-1]["end"], grade["grain"], {"grain": grade["grain"]}, source))
    if grade["vignette"] >= 0.25:
        add(_one_effect(len(effects), "vignette", 0, shots[-1]["end"], grade["vignette"], {"vignette": grade["vignette"]}, source))
    if fx["strobe"]:
        add(_one_effect(len(effects), "strobe", 0, shots[-1]["end"], 0.7, {"strobe": 0.8}, source))
    if fx["rgb_split"]:
        add(_one_effect(len(effects), "rgb_split", 0, shots[-1]["end"], 0.6, {"rgb_shift": 0.4}, source))
    if fx["glitch"]:
        add(_one_effect(len(effects), "glitch", 0, shots[-1]["end"], 0.6, {"row_tear": 0.4}, source))
    if camera["zoom"] >= 0.35:
        add(_one_effect(len(effects), "zoom_punch", 0, shots[-1]["end"], camera["zoom"], {"zoom": camera["zoom"]}, source))
    if camera["shake"] >= 0.35:
        add(_one_effect(len(effects), "shake", 0, shots[-1]["end"], camera["shake"], {"shake": camera["shake"]}, source))

    # Open window: a loud change no named effect already covers.
    window = max(1, int(round(0.4 / step)))
    for start_i in range(1, max(1, len(lumas) - window), window):
        end_i = min(len(lumas) - 1, start_i + window)
        start_t, end_t = start_i * step, end_i * step
        if cover(start_t, end_t):
            continue
        luma_jump = abs(lumas[end_i] - lumas[start_i])
        color_jump = float(np.abs(colors[end_i] - colors[start_i]).mean()) if colors else 0
        motion = max(motions[start_i:end_i + 1] or [0])
        signals = {"luma_spike": luma_jump, "color_jump": color_jump, "motion_spike": motion}
        if max(signals.values()) < 0.45:
            continue
        add(_unclassified(len(effects), start_t, end_t, signals, source))

    for effect in effects[:6]:
        effect["preview"]["thumbnail_jpeg_base64"] = _preview_jpeg(video, effect["preview"]["time"])
    counts = {"code": 0, "local_model": 0, "generative": 0}
    for effect in effects:
        counts[effect["recipe"]["tier"]] += 1
    total = len(effects) or 1
    resolution = {
        "code": _round(counts["code"] / total if effects else 0),
        "local_model": _round(counts["local_model"] / total if effects else 0),
        "generative": _round(counts["generative"] / total if effects else 0),
        "counts": counts,
    }
    return effects, resolution


def extract(path: str, vision: bool, label: str | None = None) -> dict:
    probe = _probe(path)
    sample_fps = _sample_fps(probe["fps"], probe["duration"] or 1)
    frames, sample_fps = _decode(path, sample_fps)
    step = 1 / sample_fps
    colors = [_mean_rgb(frame) for frame in frames]
    lumas = [float(_luma(_center(frame)).mean()) for frame in frames]
    blurs = [_blur_var(frame) for frame in frames]
    motions = [0.0]
    for index in range(1, len(frames)):
        motions.append(float(np.abs(_luma(frames[index]) - _luma(frames[index - 1])).mean()))
    distances = [0.0]
    for index in range(1, len(colors)):
        distances.append(_color_dist(colors[index], colors[index - 1]))

    scene_detector = "chroma-distance"
    forced = _scene_times(path)
    cut_at = set()
    if forced:
        scene_detector = "pyscenedetect"
        for time in forced:
            if time <= 0.04:
                continue
            cut_at.add(min(len(frames) - 1, max(1, int(round(time / step)))))
    else:
        for index, dist in enumerate(distances):
            if dist >= 0.16:
                cut_at.add(index)

    boundaries = [0, *sorted(cut_at), len(frames)]
    raw: list[tuple[int, int]] = []
    for start, end in zip(boundaries, boundaries[1:]):
        if end > start:
            raw.append((start, end))

    shots_idx: list[tuple[int, int, str]] = []
    for start, end in raw:
        duration = (end - start) * step
        bright = float(np.mean(lumas[start:end])) > 0.82
        if duration < 0.15 and bright and shots_idx:
            prev_start, prev_end, _kind = shots_idx[-1]
            shots_idx[-1] = (prev_start, prev_end, "flash")
            continue
        if duration < 0.15 and bright and not shots_idx:
            continue
        kind = "hard_cut"
        if start in cut_at and blurs:
            median_blur = _percentile(blurs, 0.5)
            if median_blur > 1e-4 and blurs[min(start, len(blurs) - 1)] < 0.25 * median_blur and motions[min(start, len(motions) - 1)] > 0.08:
                kind = "whip"
        shots_idx.append((start, end, kind))
    if not shots_idx:
        shots_idx = [(0, len(frames), "hard_cut")]

    # A run of moderate change across the boundary is a dissolve, not a whip.
    for index in range(len(shots_idx) - 1):
        boundary = shots_idx[index + 1][0]
        window = distances[max(1, boundary - 2) : boundary + 3]
        if len(window) >= 3 and all(0.08 <= dist < 0.22 for dist in window):
            start, end, _kind = shots_idx[index]
            shots_idx[index] = (start, end, "crossfade")

    bars = _bars(frames)
    letterbox = any(bar > 0 for bar in bars)
    inners = [_inner(frame, bars) for frame in frames]
    video_motion = _percentile(motions[1:] or [0], 0.5)
    shots = []
    for index, (start, end, kind) in enumerate(shots_idx):
        shot_frames = inners[start:end] or inners[start : start + 1]
        shot_motion = _percentile(motions[start:end] or [0], 0.5)
        speed = 1.0
        if video_motion >= 0.03:
            if shot_motion < 0.35 * video_motion:
                speed = 0.5
            elif shot_motion > 2.5 * video_motion:
                speed = 1.5
        center_detail = []
        for frame in shot_frames[:: max(1, len(shot_frames) // 4)]:
            luma = _luma(frame)
            height, width = luma.shape
            center = luma[height // 3 : 2 * height // 3, width // 3 : 2 * width // 3]
            center_detail.append(_edge(center))
        zoom = 0.0
        if len(center_detail) >= 2 and center_detail[0] > 1e-4:
            zoom = _clip(abs(center_detail[-1] - center_detail[0]) / center_detail[0], 0, 1)
        shake = 0.0
        if end - start > 2:
            diffs = motions[start:end]
            shake = _clip(float(np.std(diffs)) / 0.15, 0, 1)
        intensity = _clip(shot_motion / 0.2, 0, 1)
        fx = []
        if kind == "flash":
            fx.append("flash")
        shots.append({
            "index": index,
            "start": _round(start * step, 3),
            "end": _round(end * step, 3),
            "transition_out": kind if index < len(shots_idx) - 1 else "hard_cut",
            "speed": speed,
            "motion": {"zoom": _round(zoom), "shake": _round(shake), "intensity": _round(intensity)},
            "grade": _grade(shot_frames),
            "fx": fx,
        })

    durations = [shot["end"] - shot["start"] for shot in shots]
    length = {
        "count": len(shots),
        "mean": _round(sum(durations) / len(durations), 4),
        "median": _round(_percentile(durations, 0.5), 4),
        "p10": _round(_percentile(durations, 0.1), 4),
        "p90": _round(_percentile(durations, 0.9), 4),
    }
    onsets: list[float] = []
    audio_name = "none"
    if probe["audio"]:
        onsets, audio_name = _onsets(path)
    offsets = []
    for shot in shots[1:]:
        if not onsets:
            break
        nearest = min(onsets, key=lambda hit: abs(hit - shot["start"]))
        offsets.append(shot["start"] - nearest)
    on_beat = 0.0
    median_offset = 0.0
    if offsets:
        window = 0.08
        on_beat = sum(1 for offset in offsets if abs(offset) <= window) / len(offsets)
        median_offset = _percentile(offsets, 0.5)
    timing = {
        "on_beat_ratio": _round(on_beat, 4),
        "median_offset_seconds": _round(median_offset, 4),
        "prefer": "beat" if on_beat >= 0.5 and onsets else "free",
    }
    counts = {key: 0 for key in TRANSITIONS}
    for shot in shots:
        counts[shot["transition_out"]] += 1
    transitions = {key: _round(counts[key] / len(shots), 4) for key in TRANSITIONS}
    speeds = [shot["speed"] for shot in shots]
    speed = {
        "slow_motion_ratio": _round(sum(1 for item in speeds if item < 0.99) / len(speeds), 4),
        "fast_ratio": _round(sum(1 for item in speeds if item > 1.01) / len(speeds), 4),
    }
    camera = {
        "zoom": _round(sum(shot["motion"]["zoom"] for shot in shots) / len(shots)),
        "shake": _round(sum(shot["motion"]["shake"] for shot in shots) / len(shots)),
        "intensity": _round(sum(shot["motion"]["intensity"] for shot in shots) / len(shots)),
    }
    grade = _grade(inners)
    peaks = 0
    for index in range(1, len(lumas) - 1):
        if lumas[index] > lumas[index - 1] + 0.35 and lumas[index] > lumas[index + 1] + 0.35:
            peaks += 1
    duration = probe["duration"] or (len(frames) * step)
    split_scores = [_rgb_split(frame) for frame in frames[:: max(1, len(frames) // 12)]]
    tears = [_row_tear(frames[index - 1], frames[index]) for index in range(1, len(frames))]
    fx = {
        "strobe": peaks >= 3 and peaks / max(duration, 0.1) >= 2,
        "rgb_split": bool(split_scores) and _percentile(split_scores, 0.5) > 0.12,
        "glitch": bool(tears) and sum(1 for tear in tears if tear > 0.2) / len(tears) > 0.08,
    }
    text = _text_presence(frames, bars)
    vision_doc = _vision(vision)
    aspect = _aspect(probe["width"], probe["height"])
    summary = _summary(len(shots), duration, length, timing, transitions, grade, aspect, letterbox, text, fx, vision_doc)
    source_label = label or os.path.basename(path)
    effects, resolution = _build_effects(shots, grade, letterbox, text, fx, camera, lumas, colors, motions, step, source_label, path)
    return {
        "format": "avt.style_profile",
        "format_version": 1,
        "cost_usd": 0,
        "summary": summary,
        "source": {
            "label": source_label,
            "duration_seconds": _round(duration, 3),
            "width": probe["width"],
            "height": probe["height"],
            "fps": _round(probe["fps"], 3),
        },
        "shots": shots,
        "shot_length": length,
        "cut_timing": timing,
        "transitions": transitions,
        "speed": speed,
        "camera": camera,
        "grade": grade,
        "frame": {
            "aspect": aspect,
            "letterbox": letterbox,
            "bar_top": bars[0],
            "bar_bottom": bars[1],
            "bar_left": bars[2],
            "bar_right": bars[3],
        },
        "overlays": {"text_presence": text},
        "fx": fx,
        "vision": vision_doc,
        "fidelity": {"matched": MATCHED, "approximated": APPROXIMATED},
        "detectors": {
            "scenes": scene_detector,
            "audio": audio_name,
            "vision": vision_doc["status"],
            "sample_fps": _round(sample_fps, 3),
        },
        "effects": effects,
        "resolution": resolution,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract an avt.style_profile from a reference video. $0.")
    parser.add_argument("video")
    parser.add_argument("--out")
    parser.add_argument("--label")
    parser.add_argument("--vision", action="store_true", help="Off by default. Does not call a paid or remote model.")
    args = parser.parse_args()
    profile = extract(args.video, args.vision, args.label)
    text = json.dumps(profile, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.write("\n")
    print(text)


if __name__ == "__main__":
    main()
