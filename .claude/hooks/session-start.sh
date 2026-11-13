#!/bin/bash
# Puts docs/PROBLEM_INDEX.md (symptom -> the tool that already fixed it) in front of every AVT session, local and cloud,
# at start, resume, clear and compact. Fendi, 13 Nov 2026: agents kept re-solving problems the YSL notes had already
# solved. Prints only; installs nothing; never fails the session.
set -uo pipefail
idx="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}/docs/PROBLEM_INDEX.md"
if [ -f "$idx" ]; then
  echo "AVT PROBLEM INDEX (docs/PROBLEM_INDEX.md). Look up the symptom here BEFORE solving it; use the proven tool first."
  echo
  cat "$idx"
else
  echo "AVT: docs/PROBLEM_INDEX.md is missing on this checkout. Read it from main before solving any visible problem."
fi
exit 0
