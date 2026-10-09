"""Every script's --help must print. argparse formats help strings with %, so one unescaped "alpha_%05d.png" in a
help text made `--help` a traceback (composite_environment.py and camera_engine.py, found 2026-10-02)."""
import os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def argparse_scripts():
    out = []
    for base, _, files in os.walk(os.path.join(ROOT, "scripts")):
        if os.sep + "tests" in base or "__pycache__" in base: continue
        for f in files:
            p = os.path.join(base, f)
            if f.endswith(".py") and "argparse" in open(p, encoding="utf-8", errors="ignore").read(): out.append(p)
    return sorted(out)


def test_help_strings_are_percent_safe():
    """static: a % in a help string must be %% or a %(name)s reference (cheap, and names the line)."""
    bad = []
    for p in argparse_scripts():
        for n, line in enumerate(open(p, encoding="utf-8", errors="ignore"), 1):
            for m in re.finditer(r'help=(f?)("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')', line):
                if re.search(r"%(?!%|\()", m.group(2).replace("%%", "")): bad.append(f"{os.path.relpath(p, ROOT)}:{n}")
    assert not bad, bad


def test_the_edit_and_qa_tools_print_help():
    """dynamic, on the lanes this change touched (running all ~40 scripts imports half the ML stack)."""
    for rel in ("scripts/edit/camera_engine.py", "scripts/edit/composite_environment.py", "scripts/edit/camera_coverage.py"):
        r = subprocess.run([sys.executable, os.path.join(ROOT, rel), "--help"], capture_output=True, text=True)
        assert r.returncode == 0, (rel, r.stderr[-400:])
