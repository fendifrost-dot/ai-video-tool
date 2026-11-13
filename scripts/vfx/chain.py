#!/usr/bin/env python3
"""Chain or rope between two tracked points. 2D draw plus a Blender curve recipe.

First real use is Hyenas: the rope in Fendi's hand becomes a steel chain.
The 2D pass draws on a frame. It does not regenerate his face. The Blender
snippet is text the headless job feeds to blender; this file does not launch it.
"""
from __future__ import annotations

import math

import numpy as np


def catenary(hand: tuple[float, float], collar: tuple[float, float], sag: float, samples: int = 24) -> list[tuple[float, float]]:
    """Hanging curve. sag is how far the middle drops, in pixels, and must be positive."""
    if sag <= 0:
        raise ValueError("sag must be positive")
    if samples < 2:
        raise ValueError("samples must be at least 2")
    x0, y0 = hand
    x1, y1 = collar
    span = max(abs(x1 - x0), 1.0)
    points = []
    for i in range(samples):
        t = i / (samples - 1)
        x = x0 + (x1 - x0) * t
        y_line = y0 + (y1 - y0) * t
        droop = sag * math.sin(math.pi * t)
        points.append((x, y_line + droop))
    return points


def draw_chain(frame: np.ndarray, points: list[tuple[float, float]], link: int = 3) -> np.ndarray:
    """Steel-colored links along the curve. Pixels outside the links are copied."""
    out = frame.copy()
    color = np.array([170, 175, 185], dtype=np.uint8)
    height, width = frame.shape[:2]
    for index in range(0, len(points) - 1, 2):
        x, y = points[index]
        cx, cy = int(round(x)), int(round(y))
        if not (0 <= cy < height and 0 <= cx < width):
            continue
        y0, y1 = max(0, cy - link), min(height, cy + link + 1)
        x0, x1 = max(0, cx - 1), min(width, cx + 2)
        out[y0:y1, x0:x1] = color
    return out


def blender_curve_script(points: list[tuple[float, float]], name: str = "HyenasChain") -> str:
    """Python Blender 4.2 runs with `blender -b --python`. CPU only. Not executed here."""
    coords = ", ".join(f"({x:.3f}, {y:.3f}, 0.0)" for x, y in points)
    return (
        "import bpy\n"
        f"# AVT chain '{name}'. Device is CPU. Do not enable GPU.\n"
        "curve = bpy.data.curves.new('chain', 'CURVE')\n"
        "curve.dimensions = '3D'\n"
        "spline = curve.splines.new('POLY')\n"
        f"pts = [{coords}]\n"
        "spline.points.add(len(pts) - 1)\n"
        "for i, p in enumerate(pts):\n"
        "    spline.points[i].co = (p[0], p[1], p[2], 1.0)\n"
        "obj = bpy.data.objects.new('chain', curve)\n"
        "bpy.context.scene.collection.objects.link(obj)\n"
        "bpy.context.scene.cycles.device = 'CPU'\n"
    )
