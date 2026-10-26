#!/usr/bin/env python3
"""face_check.py — put a generated clip's face next to his real face before anyone looks at the clip.

Fendi, 26 Oct 2026, on a b-roll render whose mouth came back pressed and thin: "you have so many images of my
face in my tool you should be referencing before coming back to me. Mouth closed doesn't mean mouth awkwardly
bunched up." This is that check, as a step that runs before a render is posted, never after.

One sheet, three rows:
  1. the generated clip — his face, cropped, at the sampled seconds (frames where no face is found are black);
  2. the reference clip (the @Video1 the render copied) — his real face at the same seconds;
  3. his face pictures from the tool (character_features, feature_type "face": neutral, three-quarter, …).

The sheet is for eyes, not for a score: a person (the agent first, Fendi second) compares the lips, the beard,
the glasses and the shape of the face row by row. Nothing is written back; nothing is spent.

    python3 -I scripts/edit/face_check.py --generated out.mp4 --reference ref.mp4 \
        --face neutral.jpg --face three_quarter_left.jpg --out sheet.jpg [--seconds 1.8,2.0,…] [--zoom 1.6]

Needs ffmpeg on PATH and the MediaPipe selfie segmenter model in $AVT_MODELS (default ./models), as
body_only_swap.py; the face is the segmenter's face-skin class, its largest connected blob.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

import numpy as np

FACE_CLASS = 3  # selfie multiclass: 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 other
TILE = 260


def frames_of(path: str, w: int, h: int) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def fps_of(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    n, d = out.split("/")
    return float(n) / float(d)


def face_crop(seg, img: np.ndarray, zoom: float):
    import cv2
    import mediapipe as mp

    cat = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img))).category_mask.numpy_view())
    fs = (cat == FACE_CLASS).astype(np.uint8)
    k, _lab, st, _c = cv2.connectedComponentsWithStats(fs)
    if k < 2:
        return None
    bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])]
    side = int(max(bw, bh) * zoom)
    cx, cy = bx + bw // 2, by + bh // 2
    x0, y0 = max(0, cx - side // 2), max(0, cy - side // 2)
    crop = img[y0 : y0 + side, x0 : x0 + side]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (TILE, TILE), interpolation=cv2.INTER_CUBIC)


def labelled(tile: np.ndarray | None, text: str) -> np.ndarray:
    import cv2

    t = (tile if tile is not None else np.zeros((TILE, TILE, 3), np.uint8)).copy()
    cv2.putText(t, text, (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return t


def row_of(tiles: list[np.ndarray], title: str, width: int | None = None) -> np.ndarray:
    import cv2

    row = np.concatenate(tiles, axis=1)
    if width is not None and row.shape[1] < width:
        row = np.concatenate([row, np.zeros((row.shape[0], width - row.shape[1], 3), np.uint8)], axis=1)
    elif width is not None:
        row = row[:, :width]
    bar = np.full((32, row.shape[1], 3), 255, np.uint8)
    cv2.putText(bar, title, (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    return np.concatenate([bar, row])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--generated", required=True, help="the rendered clip")
    ap.add_argument("--reference", required=True, help="the clip it copied (@Video1), same seconds")
    ap.add_argument("--face", action="append", default=[], help="a face picture from the tool (repeatable)")
    ap.add_argument("--out", required=True, help="the sheet to write (jpg)")
    ap.add_argument("--seconds", default="1.8,2.0,2.2,2.4,2.6,3.4,3.6,3.8,3.95", help="sample times, seconds from the first frame")
    ap.add_argument("--zoom", type=float, default=1.6, help="crop side = face box × zoom")
    ap.add_argument("--size", default="720x1280", help="frame size the clips are read at (WxH)")
    a = ap.parse_args(argv)

    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    # the same model folder as body_only_swap.py (env AVT_MODELS, default ./models)
    model = os.path.join(os.environ.get("AVT_MODELS", "models"), "selfie_multiclass_256x256.tflite")
    if not os.path.exists(model):
        print(f"segmenter model not found: {model} (set AVT_MODELS to the folder with selfie_multiclass_256x256.tflite)", file=sys.stderr)
        return 2
    seg = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=model), running_mode=vision.RunningMode.IMAGE, output_category_mask=True)
    )
    w, h = (int(x) for x in a.size.lower().split("x"))
    secs = [float(s) for s in a.seconds.split(",") if s.strip()]
    rows = []
    found = {}
    for title, path in (("generated: " + os.path.basename(a.generated), a.generated), ("reference (his real face): " + os.path.basename(a.reference), a.reference)):
        V = frames_of(path, w, h)
        fps = fps_of(path)
        tiles, n = [], 0
        for s in secs:
            i = min(len(V) - 1, int(round(s * fps)))
            f = face_crop(seg, V[i], a.zoom)
            n += f is not None
            tiles.append(labelled(f, f"{s:.2f}s"))
        found[title] = (n, len(secs))
        rows.append(row_of(tiles, title))
    if a.face:
        tiles = []
        for p in a.face:
            img = cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB)
            s = 1280 / img.shape[0]
            img = cv2.resize(img, (int(img.shape[1] * s), 1280))
            f = face_crop(seg, img, a.zoom)
            tiles.append(labelled(f, os.path.basename(p)[:18]))
        rows.append(row_of(tiles, "his face pictures in the tool (character_features face)", width=rows[0].shape[1]))
    sheet = np.concatenate(rows)
    cv2.imwrite(a.out, cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
    for title, (n, total) in found.items():
        print(f"{title}: face found on {n}/{total} samples")
    print(f"wrote {a.out} {sheet.shape[1]}x{sheet.shape[0]} — look at it before the clip is posted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
