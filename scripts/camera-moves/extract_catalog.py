#!/usr/bin/env python3
"""Build the AVT camera-move catalog from Sirio Berati's MIT pill library.

Reads templates/<id>/README.md and pill.mp4. Writes catalog.json. Does not
copy the mp4s. Posters are copied separately by this script when --posters
is set.

Source: https://github.com/sirioberati/ai-filmmaking-camera-control-seedance-2-5
License: MIT, Copyright (c) 2026 Sirio Berati.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

UPSTREAM = "https://github.com/sirioberati/ai-filmmaking-camera-control-seedance-2-5"
COMMIT = "602aa2348b0ae67589ce533fff571adced724811"

# The source keeps these as camera studies, not clips to send (README, "Things that matter most").
STUDY_IDS = {
    "CAM01-LockedOff",
    "CAM26-DutchAngle",
    "CAM29-LowAngleHero",
    "CAM30-HighAngle",
    "CAM46-RackBetweenPeople",
    "FAM03-TrunkShot",
}

# Needles are matched on the id and the name first, so a sentence like
# "follow someone" does not turn a pan into a follow.
KIND_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("dolly_zoom", ("dolly zoom", "dollyzoom")),
    ("crash_zoom", ("crash zoom", "crashzoom")),
    ("whip", ("whip", "snap")),
    ("fpv", ("fpv",)),
    ("rack", ("rack focus", "rackbetween", "rack")),
    ("roll", ("barrel",)),
    ("dutch", ("dutch",)),
    ("pedestal", ("pedestal",)),
    ("crane", ("crane", "overhead", "top-down", "top down", "rise")),
    ("orbit", ("orbit", "360", "booth", "glambot", "spin", "spiral", "arc")),
    ("drone", ("drone", "dive", "fall", "fly through", "flythrough", "flyby", "probe")),
    ("handheld", ("handheld", "run and gun", "runandgun", "snorricam")),
    ("pov", ("pov", "trunk")),
    ("lead", ("steadicam lead", "walk-and-talk", "walk and talk")),
    ("track", ("track", "truck", "slider", "parallax", "wipe")),
    ("tilt", ("tilt",)),
    ("pan", ("pan",)),
    ("zoom", ("zoom",)),
    ("dolly", ("push", "pull", "dolly")),
    ("follow", ("follow", "chase")),
    ("locked", ("locked",)),
]

PRIMARY_KINDS = {
    "dolly_zoom",
    "crash_zoom",
    "whip",
    "fpv",
    "rack",
    "roll",
    "dutch",
    "pedestal",
    "crane",
    "orbit",
    "drone",
    "handheld",
    "pov",
    "lead",
    "track",
    "tilt",
    "pan",
    "zoom",
    "dolly",
}


def category_of(move_id: str) -> str:
    match = re.match(r"^([A-Z]+)", move_id)
    return match.group(1) if match else "CAM"


def needle_in(text: str, needle: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(needle)}", text) is not None


def hits_of(text: str) -> list[str]:
    found: list[str] = []
    for kind, needles in KIND_RULES:
        if any(needle_in(text, needle) for needle in needles):
            found.append(kind)
    return found


def kind_of(move_id: str, name: str, says: str, numbers: str) -> str:
    name_hits = hits_of(f"{move_id} {name}".lower())
    primary = [kind for kind in name_hits if kind in PRIMARY_KINDS]
    if "dolly_zoom" in primary:
        return "dolly_zoom"
    if "crash_zoom" in primary:
        return "crash_zoom"
    if len(primary) >= 2:
        return "compound"
    if len(primary) == 1:
        return primary[0]
    if name_hits:
        return name_hits[0]
    text_hits = [kind for kind in hits_of(f"{says} {numbers}".lower()) if kind in PRIMARY_KINDS]
    if len(text_hits) >= 2:
        return "compound"
    if len(text_hits) == 1:
        return text_hits[0]
    prefix = category_of(move_id)
    if prefix in {"ONE", "SC", "SHOW", "STORY", "ACT"}:
        return "compound"
    return "locked"


def field(text: str, label: str) -> str:
    match = re.search(rf"\*\*{re.escape(label)}\.\*\*\s*(.+)", text)
    return match.group(1).strip() if match else ""


def probe(path: Path) -> dict:
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate,duration",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        text=True,
    )
    data = json.loads(raw)
    stream = data["streams"][0]
    num, den = stream.get("avg_frame_rate", "0/1").split("/")
    fps = float(num) / float(den) if float(den) else 0
    duration = float(stream.get("duration") or data["format"]["duration"])
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": round(fps, 3),
        "durationSec": round(duration, 3),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--posters", type=Path)
    args = parser.parse_args()
    templates = args.source / "templates"
    moves = []
    if args.posters:
        args.posters.mkdir(parents=True, exist_ok=True)
    for readme in sorted(templates.glob("*/README.md")):
        folder = readme.parent
        move_id = folder.name
        text = readme.read_text(encoding="utf-8")
        title = re.search(r"^#\s+[^:]+:\s+(.+)$", text, re.M)
        name = title.group(1).strip() if title else move_id
        family = ""
        family_match = re.search(r"^Family:\s*(.+)$", text, re.M)
        if family_match:
            family = family_match.group(1).strip()
        says = field(text, "What it says")
        use = field(text, "Use it for")
        numbers = field(text, "Camera numbers")
        avoid = field(text, "Avoid")
        pill = folder / "pill.mp4"
        if not pill.is_file():
            raise SystemExit(f"missing pill: {pill}")
        media = probe(pill)
        poster_name = f"{move_id}.jpg"
        if args.posters:
            src = folder / "poster.jpg"
            if src.is_file():
                shutil.copyfile(src, args.posters / poster_name)
        prefix = category_of(move_id)
        moves.append(
            {
                "id": move_id,
                "name": name,
                "category": prefix,
                "family": family,
                "says": says,
                "use": use,
                "numbers": numbers,
                "avoid": avoid,
                "kind": kind_of(move_id, name, says, numbers),
                "studyOnly": move_id in STUDY_IDS or prefix == "ANG",
                "durationSec": media["durationSec"],
                "width": media["width"],
                "height": media["height"],
                "fps": media["fps"],
                "pillBytes": pill.stat().st_size,
                "pillSha256": sha256(pill),
                "poster": f"/camera-moves/posters/{poster_name}",
                "upstreamPath": f"templates/{move_id}/pill.mp4",
                "upstreamUrl": f"{UPSTREAM}/tree/{COMMIT}/templates/{move_id}",
            }
        )
    payload = {
        "attribution": {
            "title": "AI filmmaking camera control with Seedance 2.5 and three.js",
            "author": "Sirio Berati",
            "license": "MIT",
            "copyright": "Copyright (c) 2026 Sirio Berati",
            "repository": UPSTREAM,
            "commit": COMMIT,
            "notice": "Move names, descriptions, camera numbers, poster stills, and pill-clip hashes are from that repository. AVT does not vendor Tein. The pill mp4s are staged by scripts/camera-moves/render-references.mjs.",
        },
        "moves": moves,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"moves {len(moves)} -> {args.out}")


if __name__ == "__main__":
    main()
