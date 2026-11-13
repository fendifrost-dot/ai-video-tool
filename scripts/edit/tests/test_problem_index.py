"""The SessionStart hook prints docs/PROBLEM_INDEX.md into every session; it must run, and the index must stay short
enough to be shown whole (hook output past ~10,000 characters is cut)."""
import os, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def test_hook_prints_the_whole_index():
    r = subprocess.run([os.path.join(ROOT, ".claude", "hooks", "session-start.sh")], capture_output=True, text=True,
                       env={**os.environ, "CLAUDE_PROJECT_DIR": ROOT})
    assert r.returncode == 0, r.stderr
    idx = open(os.path.join(ROOT, "docs", "PROBLEM_INDEX.md")).read()
    assert idx.strip() in r.stdout
    assert len(r.stdout) < 9500, f"hook output {len(r.stdout)} chars: move detail to the linked docs, keep rows short"


def test_every_script_the_index_names_exists():
    import re
    idx = open(os.path.join(ROOT, "docs", "PROBLEM_INDEX.md")).read()
    names = set(re.findall(r"`([a-z_]+\.py)", idx))
    found = {f for _, _, fs in os.walk(os.path.join(ROOT, "scripts")) for f in fs}
    missing = sorted(n for n in names if n not in found)
    assert not missing, missing
