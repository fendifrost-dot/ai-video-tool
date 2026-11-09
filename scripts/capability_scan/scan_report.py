#!/usr/bin/env python3
"""Build the dated capability-scan report from the gap registry and a catalog snapshot.

Usage:
  python -I scripts/capability_scan/scan_report.py --gaps docs/capability/GAPS.md \
      --new docs/capability/scans/2026-11-16_higgsfield.json \
      [--prev docs/capability/scans/2026-11-09_higgsfield.json] \
      --out docs/capability/scans/2026-11-16.md
  python -I scripts/capability_scan/scan_report.py --selftest

A snapshot is a JSON list of {id, name, provider_name, description, tags, modes, media_roles}. The script does no
network I/O: the agent saves what the catalog tools return. It never calls a provider and never spends.
"""
import argparse, json, re, sys, datetime, tempfile, os

GAP_ROW = re.compile(r"^\|\s*\*{0,2}(G\d+)\*{0,2}\s*\|")

def load_gaps(path):
    rows = []
    for line in open(path, encoding="utf-8"):
        m = GAP_ROW.match(line)
        if not m:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6:
            continue
        rows.append({"id": m.group(1), "workflow": cells[1].strip("*"), "fails": cells[2], "kill": cells[3], "candidates": cells[4], "status": cells[5]})
    return rows

def load_snapshot(path):
    if not path:
        return {}
    with open(path, encoding="utf-8") as f:
        items = json.load(f)
    out = {}
    for it in items:
        mid = it.get("id")
        if not mid:
            continue
        out[mid] = {
            "name": it.get("name", ""), "provider": it.get("provider_name", ""), "description": it.get("description", ""),
            "tags": sorted(it.get("tags", [])), "modes": sorted(it.get("modes", [])), "media_roles": sorted(it.get("media_roles", [])),
        }
    return out

def diff(prev, new):
    added = sorted(set(new) - set(prev))
    removed = sorted(set(prev) - set(new))
    changed = []
    for mid in sorted(set(prev) & set(new)):
        a, b = prev[mid], new[mid]
        delta = {k: (a[k], b[k]) for k in ("tags", "modes", "media_roles") if a[k] != b[k]}
        if delta:
            changed.append((mid, delta))
    return added, removed, changed

EDIT_TAGS = {"video-edit", "object-replacement", "reference", "identity", "video-reference"}

def relevant(item):
    return bool(EDIT_TAGS & set(item["tags"])) or any(m in ("video_edit", "edit", "video-edit") for m in item["modes"])

def render(date, gaps, prev, new, prev_name, new_name):
    added, removed, changed = diff(prev, new)
    L = [f"# Capability scan {date}", "", f"Snapshot: `{new_name}`" + (f" vs `{prev_name}`" if prev_name else " (first snapshot, no diff)"), "",
         "Every line below is OBSERVED from catalog text or HYPOTHESIS; nothing here is a benchmark result. $0 spent.", "",
         "## New since last scan", ""]
    if not prev:
        L.append(f"First snapshot: {len(new)} models recorded. Relevant to the video-edit gaps: " + ", ".join(f"`{m}`" for m in sorted(new) if relevant(new[m])) + ".")
    else:
        L.append("| Model | Provider | Tags | Relevant to G1/G2/G5? |"); L.append("|---|---|---|---|")
        for m in added:
            it = new[m]; L.append(f"| `{m}` {it['name']} | {it['provider']} | {', '.join(it['tags'])} | {'yes' if relevant(it) else 'no'} |")
        if not added:
            L.append("| (none) | | | |")
        L += ["", "## Changed contracts", ""]
        for m, d in changed:
            L.append(f"- `{m}`: " + "; ".join(f"{k} {a} → {b}" for k, (a, b) in d.items()))
        if not changed:
            L.append("- (none)")
        L += ["", "## Removed", ""] + ([f"- `{m}`" for m in removed] or ["- (none)"])
    L += ["", "## Gaps and what this scan says about each", ""]
    for g in gaps:
        L += [f"### {g['id']} — {g['workflow']}", "", f"Status in registry: **{g['status']}**. Kill criterion: {g['kill']}", "",
              "Candidates to judge (fill in: contract, price, what it must prove, cheapest test):", ""]
        for m in sorted(new):
            if relevant(new[m]):
                L.append(f"- `{m}` {new[m]['name']} ({new[m]['provider']}): modes {new[m]['modes'] or '-'}; tags {', '.join(new[m]['tags'])} — HYPOTHESIS, untested")
        L.append("")
    L += ["## Benchmark proposals (Fendi funds or parks)", "", "| Gap | Candidate | Take | Inputs | Measurements | Cost per roll | Kill criterion |", "|---|---|---|---|---|---|---|", "", "## Registry edits made in this PR", "", "- (list the GAPS.md rows changed, or 'none')", ""]
    return "\n".join(L)

def selftest():
    gaps_md = "| Id | Desired | Fails | Kill | Cands | Status |\n|---|---|---|---|---|---|\n| **G1** | swap in motion | smears | holds 4 s | x | OPEN |\n"
    prev = [{"id": "a", "name": "A", "provider_name": "P", "tags": ["video-edit"], "modes": ["edit"], "media_roles": ["video_references"]}]
    new = prev + [{"id": "b", "name": "B", "provider_name": "P", "tags": ["reference"], "modes": [], "media_roles": []}]
    new[0] = dict(new[0], modes=["edit", "extend"])
    with tempfile.TemporaryDirectory() as d:
        g = os.path.join(d, "g.md"); open(g, "w").write(gaps_md)
        p = os.path.join(d, "p.json"); json.dump(prev, open(p, "w"))
        n = os.path.join(d, "n.json"); json.dump(new, open(n, "w"))
        gaps = load_gaps(g); assert gaps[0]["id"] == "G1" and gaps[0]["status"] == "OPEN", gaps
        a, r, c = diff(load_snapshot(p), load_snapshot(n))
        assert a == ["b"] and r == [] and c and c[0][0] == "a" and "modes" in c[0][1], (a, r, c)
        out = render("2026-01-01", gaps, load_snapshot(p), load_snapshot(n), "p", "n")
        assert "`b` B" in out and "modes ['edit'] → ['edit', 'extend']" in out and "### G1" in out
    print("selftest ok")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gaps"); ap.add_argument("--new"); ap.add_argument("--prev"); ap.add_argument("--out"); ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not (a.gaps and a.new and a.out):
        ap.error("--gaps, --new and --out are required")
    report = render(a.date, load_gaps(a.gaps), load_snapshot(a.prev), load_snapshot(a.new), os.path.basename(a.prev) if a.prev else "", os.path.basename(a.new))
    open(a.out, "w", encoding="utf-8").write(report)
    print(f"wrote {a.out}")

if __name__ == "__main__":
    sys.exit(main())
