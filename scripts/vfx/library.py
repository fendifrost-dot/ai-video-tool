#!/usr/bin/env python3
"""Deterministic VFX and transitions. Frames and beats, not seconds.

Each effect takes uint8 RGB frames and returns uint8 RGB frames of the same shape.
A pixel is copied from one source or the other. Nothing here fades to black, and
nothing redraws a face. OpenCV is not required; the math is numpy.

The runner is expected to hand one chunk at a time. This module does not open a file.
"""
from __future__ import annotations

import numpy as np

from limits import (
    BURST_FRAMES,
    MAX_CEILING_HOLD_FRAMES,
    MOUTH_PIVOT_Y_MAX,
    PUNCH_FRAMES,
    PUNCH_SCALE,
    ZOOM_MAX,
    ZOOM_MIN,
)


def _u8(frame: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(frame), 0, 255).astype(np.uint8)


def _pivot(frame: np.ndarray, pivot) -> tuple[float, float]:
    height, width = frame.shape[:2]
    if pivot is None:
        return height * 0.42, width * 0.5
    py, px = float(pivot[0]), float(pivot[1])
    if py > height * MOUTH_PIVOT_Y_MAX:
        raise ValueError("zoom pivot is on the mouth")
    return py, px


def _zoom(frame: np.ndarray, scale: float, pivot) -> np.ndarray:
    if scale < ZOOM_MIN or scale > ZOOM_MAX:
        raise ValueError(f"scale {scale} is outside {ZOOM_MIN}..{ZOOM_MAX}")
    height, width = frame.shape[:2]
    py, px = _pivot(frame, pivot)
    yy, xx = np.mgrid[0:height, 0:width]
    src_y = np.clip(np.rint(py + (yy - py) / scale).astype(np.int32), 0, height - 1)
    src_x = np.clip(np.rint(px + (xx - px) / scale).astype(np.int32), 0, width - 1)
    return frame[src_y, src_x]


def _hold_ok(scales: list[float]) -> None:
    run = 0
    for scale in scales:
        run = run + 1 if abs(scale - ZOOM_MAX) < 1e-6 else 0
        if run > MAX_CEILING_HOLD_FRAMES:
            raise ValueError("zoom holds the ceiling for more than 4 frames")


def envelope(name: str, count: int) -> list[float]:
    """Scale per frame. Ceiling and floor are hard. No hold at the ceiling past 4 frames."""
    if count < 1:
        raise ValueError("envelope needs at least one frame")
    t = np.linspace(0, 1, count)
    if name == "slam_in":
        scales = (1.06 - 0.06 * t).tolist()
    elif name == "snap_out":
        scales = (1.0 + 0.05 * t).tolist()
    elif name == "pull_out_crash":
        scales = (1.0 - 0.06 * np.sin(np.pi * t)).tolist()
        scales[-1] = 1.04
    elif name == "turn_zoom":
        scales = (1.0 + 0.04 * np.sin(2 * np.pi * t)).tolist()
    elif name == "double_pump":
        scales = (1.0 + 0.03 * np.sin(4 * np.pi * t)).tolist()
    elif name == "downbeat_punch":
        scales = [PUNCH_SCALE if i < PUNCH_FRAMES else 1.0 for i in range(count)]
    else:
        raise ValueError(f"unknown envelope {name}")
    _hold_ok(scales)
    for scale in scales:
        if scale < ZOOM_MIN or scale > ZOOM_MAX:
            raise ValueError(f"envelope {name} left {ZOOM_MIN}..{ZOOM_MAX}")
    return scales


def apply_zoom(frames: list[np.ndarray], name: str, pivot=None) -> list[np.ndarray]:
    scales = envelope(name, len(frames))
    if name == "downbeat_punch" and len(frames) >= PUNCH_FRAMES:
        # the punch itself is two frames at about 1.5 percent
        scales = [PUNCH_SCALE if i < PUNCH_FRAMES else 1.0 for i in range(len(frames))]
    return [_zoom(frame, scale, pivot) for frame, scale in zip(frames, scales)]


def smoke_ember_burst(outgoing: list[np.ndarray], incoming: list[np.ndarray]) -> list[np.ndarray]:
    """Eight frames, cut-4..cut+3. Per-pixel switch. Outgoing bright pixels break up last."""
    if len(outgoing) != BURST_FRAMES or len(incoming) != BURST_FRAMES:
        raise ValueError("smoke burst is 8 frames, cut-4 through cut+3")
    height, width = outgoing[0].shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    noise = ((xx * 13 + yy * 7) % 17) / 16.0
    out = []
    for index, (left, right) in enumerate(zip(outgoing, incoming)):
        bright = left.mean(axis=2) > 180
        # incoming reforms in the dark first; bright outgoing features switch last
        threshold = (index + 1) / BURST_FRAMES
        take_incoming = (noise > threshold) & ~bright
        if index >= BURST_FRAMES - 2:
            take_incoming = noise > 0.15
        mask = take_incoming[..., None]
        mixed = np.where(mask, right, left)
        # exact copy: every pixel equals one parent, never a blend
        if not (np.all((mixed == left) | (mixed == right))):
            raise RuntimeError("burst blended a pixel")
        out.append(mixed.astype(np.uint8))
    return out


def page_turn(outgoing: np.ndarray, incoming: np.ndarray, progress: float) -> np.ndarray:
    """Hard column switch, like a page. progress 0 keeps the outgoing frame."""
    width = outgoing.shape[1]
    cut = int(np.clip(round(progress * width), 0, width))
    frame = outgoing.copy()
    frame[:, :cut] = incoming[:, :cut]
    return frame


def seam_tick(frame: np.ndarray, column: int | None = None) -> np.ndarray:
    out = frame.copy()
    col = frame.shape[1] // 2 if column is None else column
    out[:, col : col + 1] = 255
    return out


def light_wrap(frame: np.ndarray, side: str, color: tuple[int, int, int]) -> np.ndarray:
    out = frame.astype(np.int16)
    band = max(1, frame.shape[1] // 16)
    tint = np.array(color, dtype=np.int16)
    if side == "left":
        out[:, :band] = np.clip(out[:, :band] + tint // 4, 0, 255)
    elif side == "right":
        out[:, -band:] = np.clip(out[:, -band:] + tint // 4, 0, 255)
    else:
        raise ValueError("side must be left or right")
    return out.astype(np.uint8)


def contact_shadow(frame: np.ndarray, floor_row: int) -> np.ndarray:
    out = frame.copy()
    row = int(np.clip(floor_row, 1, frame.shape[0] - 1))
    out[row:] = (out[row:].astype(np.int16) * 7 // 10).astype(np.uint8)
    return out


def ambient_occlusion(frame: np.ndarray, floor_row: int) -> np.ndarray:
    out = frame.copy()
    row = int(np.clip(floor_row, 1, frame.shape[0] - 2))
    band = out[row - 1 : row + 2].astype(np.int16)
    out[row - 1 : row + 2] = np.clip(band - 18, 0, 255).astype(np.uint8)
    return out


def fog_between(back: np.ndarray, front: np.ndarray, matte: np.ndarray, density: float = 0.35) -> np.ndarray:
    """Haze sits on the background. The matted subject is copied, not dissolved."""
    if not 0 <= density <= 0.6:
        raise ValueError("fog density must stay at or under 0.6")
    haze = np.full_like(back, 180)
    base = _u8(back.astype(np.float32) * (1 - density) + haze.astype(np.float32) * density)
    mask = matte.astype(bool)
    if mask.ndim == 2:
        mask = mask[..., None]
    return np.where(mask, front, base).astype(np.uint8)


def grain_match(frame: np.ndarray, sigma: float, seed: int = 1) -> np.ndarray:
    if sigma < 0 or sigma > 12:
        raise ValueError("grain sigma must be 0..12")
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, sigma, frame.shape)
    return _u8(frame.astype(np.float32) + noise)


def match_black(frame: np.ndarray, plate_black: int) -> np.ndarray:
    floor = int(frame.min())
    shift = int(plate_black) - floor
    return _u8(frame.astype(np.int16) + shift)


def whip_smear(frame: np.ndarray, amount: int, direction: str = "left") -> np.ndarray:
    amount = int(np.clip(amount, 0, 12))
    if amount == 0:
        return frame.copy()
    out = frame.astype(np.float32)
    acc = np.zeros_like(out)
    for step in range(amount):
        shift = step if direction == "right" else -step
        acc += np.roll(out, shift, axis=1)
    return _u8(acc / amount)


def luma_wipe(outgoing: np.ndarray, incoming: np.ndarray, threshold: int) -> np.ndarray:
    take = incoming.mean(axis=2) >= threshold
    return np.where(take[..., None], incoming, outgoing).astype(np.uint8)


def mask_reveal(outgoing: np.ndarray, incoming: np.ndarray, matte: np.ndarray) -> np.ndarray:
    mask = matte.astype(bool)
    if mask.ndim == 2:
        mask = mask[..., None]
    return np.where(mask, incoming, outgoing).astype(np.uint8)


def split_screen(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    cut = left.shape[1] // 2
    frame = left.copy()
    frame[:, cut:] = right[:, cut:]
    return frame


def freeze_shatter(frame: np.ndarray, pieces: int = 4) -> np.ndarray:
    """Hold the frame and offset blocks. No fade."""
    out = frame.copy()
    height = frame.shape[0]
    band = max(1, height // pieces)
    for index in range(pieces):
        start = index * band
        end = height if index == pieces - 1 else start + band
        shift = 1 if index % 2 == 0 else -1
        out[start:end] = np.roll(frame[start:end], shift, axis=1)
    return out


def light_leak(frame: np.ndarray, strength: int = 40) -> np.ndarray:
    """Additive warm light. Never multiplies toward black."""
    if strength < 0 or strength > 80:
        raise ValueError("light leak strength must be 0..80")
    leak = np.zeros_like(frame, dtype=np.int16)
    leak[..., 0] = strength
    leak[..., 1] = strength // 2
    return np.clip(frame.astype(np.int16) + leak, 0, 255).astype(np.uint8)


def flash_frame(frame: np.ndarray) -> np.ndarray:
    """One bright frame. Not a frame of black."""
    return np.clip(frame.astype(np.int16) + 70, 0, 255).astype(np.uint8)


def speed_ramp_indexes(count: int, subject: str) -> list[int]:
    """B-roll only. Returns source indexes. Performance footage is refused."""
    if subject == "fendi_performance":
        raise ValueError("speed ramp is b-roll only")
    if subject not in ("ai_broll", "no_fendi"):
        raise ValueError("subject must be ai_broll or no_fendi")
    # compress the tail: later output frames skip ahead in the source
    return [min(count - 1, int(i * 1.5)) for i in range(count)]


def match_cut_shift(before: np.ndarray, after: np.ndarray, matte_before: np.ndarray, matte_after: np.ndarray) -> tuple[int, int]:
    """Translation that lines the subject centroids up. The frames are not warped here."""
    def centroid(mask: np.ndarray) -> tuple[float, float]:
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            return mask.shape[0] / 2, mask.shape[1] / 2
        return float(ys.mean()), float(xs.mean())
    y0, x0 = centroid(matte_before)
    y1, x1 = centroid(matte_after)
    return int(round(y0 - y1)), int(round(x0 - x1))


EFFECTS = {
    "smoke_ember_burst": {"params": {"frames": BURST_FRAMES}, "fn": "smoke_ember_burst"},
    "page_turn": {"params": {"progress": 0.5}, "fn": "page_turn"},
    "seam_tick": {"params": {}, "fn": "seam_tick"},
    "downbeat_punch": {"params": {"scale": PUNCH_SCALE, "frames": PUNCH_FRAMES}, "fn": "apply_zoom"},
    "zoom_slam_in": {"params": {"envelope": "slam_in"}, "fn": "apply_zoom"},
    "zoom_snap_out": {"params": {"envelope": "snap_out"}, "fn": "apply_zoom"},
    "zoom_pull_out_crash": {"params": {"envelope": "pull_out_crash"}, "fn": "apply_zoom"},
    "zoom_turn": {"params": {"envelope": "turn_zoom"}, "fn": "apply_zoom"},
    "zoom_double_pump": {"params": {"envelope": "double_pump"}, "fn": "apply_zoom"},
    "light_wrap": {"params": {"side": "left", "color": [255, 180, 80]}, "fn": "light_wrap"},
    "contact_shadow": {"params": {"floor_row": 0}, "fn": "contact_shadow"},
    "ambient_occlusion": {"params": {}, "fn": "ambient_occlusion"},
    "fog_haze": {"params": {"density": 0.35}, "fn": "fog_between"},
    "grain_match": {"params": {"sigma": 4, "seed": 1}, "fn": "grain_match"},
    "black_level_match": {"params": {"plate_black": 16}, "fn": "match_black"},
    "whip_smear": {"params": {"amount": 4, "direction": "left"}, "fn": "whip_smear"},
    "luma_wipe": {"params": {"threshold": 128}, "fn": "luma_wipe"},
    "mask_reveal": {"params": {}, "fn": "mask_reveal"},
    "split_screen": {"params": {}, "fn": "split_screen"},
    "freeze_shatter": {"params": {"pieces": 4}, "fn": "freeze_shatter"},
    "light_leak": {"params": {"strength": 40}, "fn": "light_leak"},
    "flash_frame": {"params": {}, "fn": "flash_frame"},
    "speed_ramp": {"params": {"subject": "ai_broll"}, "fn": "speed_ramp_indexes"},
    "match_cut": {"params": {}, "fn": "match_cut_shift"},
}
