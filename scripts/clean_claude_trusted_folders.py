#!/usr/bin/env python3
"""
Safely remove iCloud (CloudDocs) paths from Claude's localAgentModeTrustedFolders.

WHY: iCloud trusted folders (especially the CloudDocs root and the MODEST media
folder) let Claude hydrate huge media trees and fill the internal disk. This script
strips every iCloud path from the trusted-folders list while keeping local paths.

SAFETY:
  - QUIT the Claude desktop app completely BEFORE running with --apply. The app
    writes to this file during normal use and can overwrite changes.
  - A timestamped backup is written next to the original before any change.
  - JSON is parsed and re-serialized (no fragile text surgery).

RUN:
    python3 scripts/clean_claude_trusted_folders.py            # dry run
    python3 scripts/clean_claude_trusted_folders.py --apply    # backup + write
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime

CONFIG = os.path.expanduser(
    "~/Library/Application Support/Claude/claude_desktop_config.json"
)

ICLOUD_MARKER = "com~apple~CloudDocs"


def main() -> None:
    apply = "--apply" in sys.argv

    if not os.path.exists(CONFIG):
        sys.exit(f"Config not found: {CONFIG}")

    with open(CONFIG, encoding="utf-8") as f:
        data = json.load(f)

    prefs = data.get("preferences", {})
    trusted = list(prefs.get("localAgentModeTrustedFolders", []))

    keep = [p for p in trusted if ICLOUD_MARKER not in p]
    remove = [p for p in trusted if ICLOUD_MARKER in p]

    print("Current trusted folders:")
    for p in trusted:
        print("   ", p)
    print("\nWould REMOVE (iCloud):")
    for p in remove:
        print("  -", p)
    print("\nWould KEEP:")
    for p in keep:
        print("  +", p)

    if not remove:
        print("\nNothing to remove. Config already clean.")
        return

    if not apply:
        print("\nDry run only. Re-run with --apply to write the change.")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"{CONFIG}.backup_{stamp}"
    shutil.copy2(CONFIG, backup)
    print(f"\nBackup written: {backup}")

    prefs["localAgentModeTrustedFolders"] = keep
    data["preferences"] = prefs
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print("Applied. iCloud trusted folders removed.")
    print("Relaunch Claude (fully quit first if it was running).")


if __name__ == "__main__":
    main()
