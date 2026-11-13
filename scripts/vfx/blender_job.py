#!/usr/bin/env python3
"""Headless Blender command. The binary is not launched by tests.

The box default is the 5.2 LTS executable at /workspace/tools/blender/current/blender
(symlink to blender-5.2.4-linux-x64). 4.2.3 remains on disk as a fallback.
Override with AVT_BLENDER. Cycles is CPU. Frames are rendered in chunks.
"""
from __future__ import annotations

import os
import re


DEFAULT_BLENDER = "/workspace/tools/blender/current/blender"
BLENDER_SKILL_CONSTRAINT = ">=5.2"


def blender_bin() -> str:
    return os.environ.get("AVT_BLENDER", DEFAULT_BLENDER)


def parse_blender_version(text: str) -> str | None:
    """Read the version from `blender --version` text. Does not run Blender."""
    match = re.search(r"Blender\s+(\d+\.\d+(?:\.\d+)?)", text)
    return match.group(1) if match else None


def frame_chunks(start: int, end: int, size: int) -> list[tuple[int, int]]:
    if size < 1:
        raise ValueError("chunk size must be positive")
    if end < start:
        raise ValueError("end is before start")
    chunks = []
    cursor = start
    while cursor <= end:
        stop = min(end, cursor + size - 1)
        chunks.append((cursor, stop))
        cursor = stop + 1
    return chunks


def cycles_argv(blend: str, start: int, end: int, out_pattern: str, blender: str | None = None) -> list[str]:
    binary = blender or blender_bin()
    return [
        binary,
        "-b",
        blend,
        "-E",
        "CYCLES",
        "--cycles-device",
        "CPU",
        "-o",
        out_pattern,
        "-s",
        str(start),
        "-e",
        str(end),
        "-a",
    ]
