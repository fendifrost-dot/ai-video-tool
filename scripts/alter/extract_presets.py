#!/usr/bin/env python3
"""Turn the MIT scenario-alter presets file into AVT's catalog.

The skill ZIP is not committed. Pass the unpacked presets.json:

  python3 scripts/alter/extract_presets.py /path/to/presets.json supabase/functions/_shared/alter/catalog.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MODE = {"O": "swap", "M": "motion", "R": "restyle"}


MODULE_HEAD = (
    "// GENERATED from catalog.json by scripts/alter/extract_presets.py. Do not edit: change catalog.json and regenerate.\n"
    "// A TypeScript module, not a JSON import: the edge runtime loads avt-mcp through this file, and a JSON module that\n"
    "// the deploy did not ship or the runtime refused would take every MCP tool down at load.\n"
)


def write_module(payload: dict, dest: Path) -> None:
    dest.write_text(MODULE_HEAD + "export default " + json.dumps(payload, indent=2) + ";\n")


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--module-only":      # regenerate catalog.data.ts from catalog.json
        source = Path(sys.argv[2])
        write_module(json.loads(source.read_text()), source.with_name("catalog.data.ts"))
        return
    source = Path(sys.argv[1])
    dest = Path(sys.argv[2])
    raw = json.loads(source.read_text())
    presets = []
    for item in raw["presets"]:
        presets.append(
            {
                "name": item["name"],
                "group": item["group"],
                "mode": MODE[item["mode"]],
                "opening": item["mode"],
                "check": item["check"],
                "targetFrame": item["target_frame"],
                "change": item["change"].replace("@image1", "@Image1").replace("@video1", "@Video1"),
                "fill": item["fill"],
                "refs": item["refs"],
            }
        )
    payload = {
        "attribution": {
            "title": "scenario-alter",
            "license": "MIT",
            "source": "https://www.scenario.com/explorations/alter/",
            "note": "Preset text and the checker's published gates come from the scenario-alter skill (frontmatter license: MIT). AVT does not call the Scenario MCP. Prompts address the provider's @Video1 and @Image tags.",
        },
        "openings": {key: value.replace("@video1", "@Video1") for key, value in raw["openings"].items()},
        "close": raw["close"],
        "presets": presets,
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, indent=2) + "\n")
    write_module(payload, dest.with_name("catalog.data.ts"))
    print(f"{len(presets)} presets -> {dest} and catalog.data.ts")


if __name__ == "__main__":
    main()
