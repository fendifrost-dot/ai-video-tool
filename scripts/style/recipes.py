#!/usr/bin/env python3
"""Per-frame recipes for effects ffmpeg does not own. Local, CPU, numpy, $0.

These recreate an effect from frames that were filmed. They do not invent a
person, a garment, or a place. Optical flow here is a frame difference. RAFT
is the local upgrade when a real flow field is installed; this file does not
download it.

  python3 scripts/style/recipes.py --recipe pixel_sort --in clip.mp4 --out out.mp4
"""
from __future__ import annotations

import argparse
import subprocess

import numpy as np

RECIPES = (
    "pixel_sort",
    "row_glitch",
    "chromatic",
    "mirror",
    "kaleidoscope",
    "trails",
    "halation",
    "light_leak",
    "vhs",
    "lens",
    "motion_blur",
    "freeze",
    "signal_replay",
)


def _decode(path: str) -> tuple[list[np.ndarray], float, int, int]:
    probe = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate", "-of", "json", path]
    )
    import json
    stream = json.loads(probe)["streams"][0]
    width, height = int(stream["width"]), int(stream["height"])
    rate = stream.get("avg_frame_rate") or "24/1"
    num, den = rate.split("/")
    fps = float(num) / float(den) if float(den) else 24.0
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
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
        if len(frames) > 300:
            break
    proc.wait()
    if not frames:
        raise SystemExit("no frames")
    return frames, fps, width, height


def _encode(frames: list[np.ndarray], fps: float, path: str) -> None:
    height, width = frames[0].shape[:2]
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", f"{fps:.4f}", "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", path],
        stdin=subprocess.PIPE,
    )
    assert proc.stdin is not None
    for frame in frames:
        proc.stdin.write(frame.astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit("encode failed")


def pixel_sort(frame: np.ndarray) -> np.ndarray:
    out = frame.copy()
    luma = frame.mean(axis=2)
    mask = luma > 140
    for y in range(0, frame.shape[0], 2):
        cols = np.where(mask[y])[0]
        if cols.size < 8:
            continue
        span = out[y, cols[0] : cols[-1] + 1]
        order = np.argsort(span.mean(axis=1))
        out[y, cols[0] : cols[-1] + 1] = span[order]
    return out


def row_glitch(frame: np.ndarray, amount: int = 12) -> np.ndarray:
    out = frame.copy()
    height = frame.shape[0]
    for y in range(0, height, 7):
        shift = amount if (y // 7) % 2 == 0 else -amount
        out[y] = np.roll(frame[y], shift, axis=0)
    return out


def chromatic(frame: np.ndarray, shift: int = 3) -> np.ndarray:
    out = frame.copy()
    out[:, :, 0] = np.roll(frame[:, :, 0], shift, axis=1)
    out[:, :, 2] = np.roll(frame[:, :, 2], -shift, axis=1)
    return out


def mirror(frame: np.ndarray) -> np.ndarray:
    out = frame.copy()
    half = frame.shape[1] // 2
    out[:, half:] = frame[:, :half][:, ::-1]
    return out


def kaleidoscope(frame: np.ndarray) -> np.ndarray:
    flipped = mirror(frame)
    top = flipped[: frame.shape[0] // 2]
    out = flipped.copy()
    out[frame.shape[0] // 2 :] = top[::-1][: out.shape[0] - frame.shape[0] // 2]
    return out


def halation(frame: np.ndarray) -> np.ndarray:
    luma = frame.mean(axis=2, keepdims=True)
    glow = np.clip(luma - 160, 0, 255)
    # a cheap box of the highlights
    glow = (glow + np.roll(glow, 2, 0) + np.roll(glow, -2, 0) + np.roll(glow, 2, 1) + np.roll(glow, -2, 1)) / 5
    return np.clip(frame.astype(np.float32) + glow * 0.45, 0, 255).astype(np.uint8)


def light_leak(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    y = np.linspace(0, 1, height)[:, None]
    x = np.linspace(1, 0, width)[None, :]
    wash = np.zeros_like(frame, dtype=np.float32)
    wash[:, :, 0] = 90 * x * (1 - y)
    wash[:, :, 1] = 30 * x * (1 - y)
    return np.clip(frame.astype(np.float32) + wash, 0, 255).astype(np.uint8)


def vhs(frame: np.ndarray) -> np.ndarray:
    out = chromatic(frame, 2).astype(np.float32)
    out[::3, :, :] *= 0.75
    noise = np.random.default_rng(0).integers(-12, 13, size=out.shape)
    return np.clip(out + noise, 0, 255).astype(np.uint8)


def lens(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    cx, cy = (width - 1) / 2, (height - 1) / 2
    nx = (xx - cx) / cx
    ny = (yy - cy) / cy
    radius = nx * nx + ny * ny
    scale = 1 + 0.18 * radius
    src_x = np.clip((nx * scale * cx + cx).astype(np.int32), 0, width - 1)
    src_y = np.clip((ny * scale * cy + cy).astype(np.int32), 0, height - 1)
    return frame[src_y, src_x]


def motion_blur(frame: np.ndarray) -> np.ndarray:
    acc = frame.astype(np.float32)
    for shift in (2, 4, 6):
        acc += np.roll(frame, shift, axis=1)
    return (acc / 4).astype(np.uint8)


def signal_replay(frame: np.ndarray) -> np.ndarray:
    """A measured punch: a little more contrast, no new object."""
    mid = frame.astype(np.float32)
    return np.clip((mid - 128) * 1.15 + 128, 0, 255).astype(np.uint8)


def apply_recipe(name: str, frames: list[np.ndarray]) -> list[np.ndarray]:
    if name not in RECIPES:
        raise SystemExit(f"unknown recipe {name}")
    out: list[np.ndarray] = []
    previous = frames[0]
    held = frames[len(frames) // 2]
    for index, frame in enumerate(frames):
        if name == "pixel_sort":
            out.append(pixel_sort(frame))
        elif name == "row_glitch":
            out.append(row_glitch(frame))
        elif name == "chromatic":
            out.append(chromatic(frame))
        elif name == "mirror":
            out.append(mirror(frame))
        elif name == "kaleidoscope":
            out.append(kaleidoscope(frame))
        elif name == "trails":
            mixed = (frame.astype(np.float32) * 0.65 + previous.astype(np.float32) * 0.35).astype(np.uint8)
            out.append(mixed)
            previous = frame
        elif name == "halation":
            out.append(halation(frame))
        elif name == "light_leak":
            out.append(light_leak(frame))
        elif name == "vhs":
            out.append(vhs(frame))
        elif name == "lens":
            out.append(lens(frame))
        elif name == "motion_blur":
            out.append(motion_blur(frame))
        elif name == "freeze":
            out.append(held.copy())
        else:
            out.append(signal_replay(frame))
        if index == 0 and name == "trails":
            previous = frame
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply one per-frame style recipe. $0.")
    parser.add_argument("--recipe", required=True, choices=RECIPES)
    parser.add_argument("--in", dest="src", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    frames, fps, _w, _h = _decode(args.src)
    _encode(apply_recipe(args.recipe, frames), fps, args.out)
    print(args.out)


if __name__ == "__main__":
    main()
