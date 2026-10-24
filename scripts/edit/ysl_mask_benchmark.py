"""Provisional YSL mask-defect catalog and the compare plan. Does not launch a GPU job.

The segmenter flag and the contact sheets already live on PR #381 (`scripts/edit/segmenters.py`,
`segmenter_compare.py`, `sam3_matte_runner.py`). This tool loads the catalog, scores it with the
written rules, and prints the runs that still need Fendi's approval. `--launch-gpu` always refuses.

MediaPipe stays the default. A later put-back still has to print
`max |out-original| on face/hair/skin: 0`.

Usage:
  python3 scripts/edit/ysl_mask_benchmark.py
  python3 scripts/edit/ysl_mask_benchmark.py --write-scorecard
  python3 scripts/edit/ysl_mask_benchmark.py --plan
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CATALOG_PATH = os.path.join(ROOT, "docs", "benchmark", "ysl-mask-defects-v0", "catalog.json")
SCORECARD_PATH = os.path.join(ROOT, "docs", "benchmark", "ysl-mask-defects-v0", "scorecard.md")
CATEGORIES = ("segmentation", "generation", "compositing")

# Fields segmenter_compare.py already writes, plus the temporal metric this file computes locally.
COMPARE_FIELDS = (
    "frame", "mediapipe_person_px", "face", "face_box",
    "sam3_person_px", "sam3_face_px", "iou", "mediapipe_only_px", "sam3_only_px",
)


def load_catalog(path=CATALOG_PATH):
    with open(path) as f:
        return json.load(f)


def score_candidate(c):
    """Documentary score. Higher means a better-cited candidate, not a better mask."""
    named = 2 if c.get("fendi_quote") else (1 if c.get("verified_cause") else 0)
    source = 1 if c.get("source_asset_id") else 0
    if c.get("frames"):
        timecode = 2
    elif c.get("time_window"):
        timecode = 1
    else:
        timecode = 0
    if c.get("baseline_artifact"):
        baseline = 2
    elif c.get("baseline_cited"):
        baseline = 1
    else:
        baseline = 0
    output = 1 if c.get("defect_output_asset_id") or c.get("current_output_asset_id") else 0
    category = 1 if c.get("category") in CATEGORIES else 0
    parts = dict(named_rejection=named, source_asset=source, timecode=timecode,
                 baseline=baseline, output_asset=output, category_explicit=category)
    parts["total"] = named + source + timecode + baseline + output + category
    return parts


def confidence(margin, has_runner):
    if not has_runner:
        return "Low"
    if margin >= 3:
        return "High"
    if margin >= 1:
        return "Med"
    return "Low"


def song_times(item):
    """Song seconds for listed frames. DERIVED from song_start_s and fps already stored on the item."""
    if not item.get("frames") or not item.get("fps") or item.get("song_start_s") is None:
        return {}
    return {int(frame): item["song_start_s"] + frame / item["fps"] for frame in item["frames"]}


def select(catalog):
    """One winner and one runner-up per selectable slot. Unselectable slots stay empty."""
    by_slot = {}
    for cand in catalog["candidates"]:
        by_slot.setdefault(cand["slot"], []).append(cand)
    rows = []
    for slot in catalog["slots"]:
        ranked = []
        for cand in by_slot.get(slot["id"], []):
            parts = score_candidate(cand)
            ranked.append((parts["total"], 1 if cand.get("baseline_artifact") else 0, cand["id"], cand, parts))
        ranked.sort(key=lambda row: (-row[0], -row[1], row[2]))
        eligible = [row for row in ranked if row[3].get("selectable", True)]
        if not slot.get("select") or not eligible:
            rows.append(dict(slot=slot["id"], group=slot.get("group"), selected=False, ranked=ranked))
            continue
        winner = eligible[0]
        runner = eligible[1] if len(eligible) > 1 else None
        margin = None if runner is None else winner[0] - runner[0]
        rows.append(dict(
            slot=slot["id"], group=slot.get("group"), selected=True, ranked=ranked,
            winner=winner, runner=runner, margin=margin,
            confidence=confidence(margin, runner is not None),
            evidence_ceiling=winner[4]["named_rejection"] < 2,
        ))
    return rows


def selected_items(rows):
    return [row["winner"][3] for row in rows if row.get("selected")]


def temporal_iou(frames, thresh=0.5):
    """Frame-to-frame IoU of a person matte. `frames` is a sequence of 2D arrays. Local arithmetic only."""
    out = []
    prev = None
    for frame in frames:
        cur = frame > thresh
        if prev is not None:
            inter = int((prev & cur).sum())
            union = int((prev | cur).sum())
            out.append(inter / union if union else 1.0)
        prev = cur
    return out


def comparable_from_summary(summary):
    """Normalize a segmenter_compare.py summary.json into the shared metric rows. Missing SAM 3 stays null."""
    rows = []
    for frame in summary.get("per_frame", []):
        rows.append({key: frame.get(key) for key in COMPARE_FIELDS})
    return dict(clip=summary.get("clip"), sam3_matte=summary.get("sam3_matte"), frames=rows)


def _fmt_score(parts):
    return " ".join(f"{key}={parts[key]}" for key in
                    ("named_rejection", "source_asset", "timecode", "baseline", "output_asset", "category_explicit", "total"))


def _fmt_times(item):
    times = song_times(item)
    if not times:
        return item.get("time_window") or "—"
    bits = [f"f{frame} → song {times[frame]:.3f}s" for frame in item["frames"]]
    extra = item.get("time_window")
    return "; ".join(bits) + (f"; {extra}" if extra else "")


def render_scorecard(catalog=None):
    catalog = catalog or load_catalog()
    rows = select(catalog)
    lines = []
    a = lines.append
    a("# YSL mask-defect scorecard")
    a("")
    a("**Status: PROVISIONAL.** Not frozen. Full source SHA-256 and per-item SHA-256 are MISSING, so this is an unverified sample under `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md` v1.0. An agent does not approve it.")
    a("")
    a(f"Algorithm: `{catalog['algorithm_version']}`. Actual cost of producing this scorecard: **${catalog['actual_cost_usd']:.2f}**.")
    a("")
    a(f"**DECISION (truncation).** {catalog['truncation']['reason']}")
    a("")
    a("## Selected items")
    a("")
    a("| Slot | Winner | Runner-up | Margin | Confidence | Category | Source | When | Baseline | Defect output | Current output |")
    a("|---|---|---|---:|---|---|---|---|---|---|---|")
    for row in rows:
        if not row.get("selected"):
            a(f"| `{row['slot']}` | — | — | — | — | {row['group']} | unselected | — | — | — | — |")
            continue
        win, run = row["winner"][3], row["runner"][3] if row["runner"] else None
        ceil = ", quote absent" if row["evidence_ceiling"] else ""
        a("| `{slot}` | `{wid}` | `{rid}` | {margin} | {conf}{ceil} | {cat} | `{src}` | {when} | {base} | `{defect}` | `{cur}` |".format(
            slot=row["slot"], wid=win["id"], rid=run["id"] if run else "—",
            margin="—" if row["margin"] is None else row["margin"], conf=row["confidence"], ceil=ceil, cat=win["category"],
            src=win.get("source_asset_id") or "—", when=_fmt_times(win).replace("|", "/"),
            base=win.get("baseline_kind") or "—",
            defect=win.get("defect_output_asset_id") or "—",
            cur=win.get("current_output_asset_id") or "—"))
    a("")
    a("Song times on take `2f3723d0` are **DERIVED** from song 75.885 s at frame 0 and fps 59.94005994005994. They were not re-read from the file.")
    a("")
    a("## Full scores")
    a("")
    for row in rows:
        a(f"### `{row['slot']}`")
        a("")
        if row.get("selected"):
            note = "Evidence ceiling: no Fendi quote on the winner, so the margin is not proof of the defect." if row["evidence_ceiling"] else "The winner carries a Fendi quote."
            margin = "—" if row["margin"] is None else row["margin"]
            a(f"Winner `{row['winner'][3]['id']}` total {row['winner'][0]}, runner-up `{row['runner'][3]['id'] if row['runner'] else '—'}` total {row['runner'][0] if row['runner'] else '—'}, margin {margin}, confidence {row['confidence']}. {note}")
            a("")
        else:
            a("Not selected. This slot is a metric holder, not a claimed defect.")
            a("")
        for total, _base, _cid, cand, parts in row["ranked"]:
            flag = "selectable" if cand.get("selectable", True) else "not selectable"
            a(f"- `{cand['id']}` ({flag}) {_fmt_score(parts)} — {cand.get('cause_label', '')}: {cand.get('cause_cite', '')}")
        a("")
    a("## Face protection")
    a("")
    face = catalog["face_protection"]
    a(f"Required proof, unchanged: `{face['required_proof']}`. {face['sam3_may_not']} Default segmenter remains `{catalog['default_segmenter']}`.")
    a("")
    a("## Parked generation (not mask items)")
    a("")
    for item in catalog["parked_generation"]:
        a(f"- `{item['id']}` ({item['category']}): {item['note']}")
    a("")
    a("## Approval-needed runs (not started)")
    a("")
    a("| Run | Required | Hardware | Hard cap | Expected | Status |")
    a("|---|---|---|---:|---|---|")
    for run in catalog["approval_runs"]:
        a(f"| `{run['id']}` | {run['required']} | {run['hardware']} | ${run['hard_cap_usd']:.2f} | ${run['expected_usd_low']:.2f}–${run['expected_usd_high']:.2f} ({run['expected_label']}) | {run['status']} |")
    a("")
    a("The $1.00/h a10g-small rate is **HYPOTHESIS**: it is the comment in `scripts/edit/sam3_matte_runner.py`, not a price fetched for this scorecard. Timeout 30 m × $1.00/h = $0.50 hard cap per job. Nothing here was launched.")
    a("")
    a("## Lineage")
    a("")
    for key, value in catalog["lineage"].items():
        a(f"- {key}: {value}")
    a("")
    a("## Freeze checklist")
    a("")
    a("- [ ] Full candidate set of frames loaded (this pass truncated on purpose)")
    a("- [x] Scoring method written and applied to every catalog candidate")
    a("- [x] Winner, runner-up, and margin recorded per selectable slot")
    a("- [x] Confidence assigned from the margin")
    a("- [x] Scorecard produced for a person to read")
    a("- [ ] Human approval — stopped here")
    a("- [ ] Frozen provenance package (source SHA-256 and per-item SHA-256 still MISSING)")
    a("- [ ] chmod 444 and SHA256SUMS")
    a("")
    a(f"Coordination: {catalog['coordination']['issue']} — {catalog['coordination']['note']}")
    a("")
    return "\n".join(lines)


def plan_lines(catalog=None):
    catalog = catalog or load_catalog()
    lines = [
        "PLAN ONLY. No clip is opened, no model is loaded, no job is submitted.",
        f"Actual cost so far: ${catalog['actual_cost_usd']:.2f}.",
        "Default segmenter: mediapipe. Face proof stays required on any later put-back.",
        "Ready locally, $0, when the clip and AVT_MODELS are on the machine that already has them:",
        "  python3 scripts/edit/segmenter_compare.py <c044 take> <out> --frames 0,50,90,180",
        "  (MediaPipe half already committed under docs/research/results/2026-10-23-sam3-person-masks/c044/mediapipe/)",
        "Not ready: SAM 3 half. See approval runs. Do not call sam3_matte_runner.py from this tool.",
    ]
    for run in catalog["approval_runs"]:
        lines.append(
            f"APPROVAL {run['id']} required={run['required']} cap=${run['hard_cap_usd']:.2f} "
            f"expected=${run['expected_usd_low']:.2f}-{run['expected_usd_high']:.2f} {run['expected_label']} status={run['status']}"
        )
        lines.append(f"  blocker: {run['blocker']}")
    lines.append("REFUSING Fal and Hugging Face Jobs in this process.")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description="YSL mask-defect catalog. Does not spend.")
    ap.add_argument("--write-scorecard", action="store_true", help="rewrite docs/benchmark/ysl-mask-defects-v0/scorecard.md")
    ap.add_argument("--plan", action="store_true", help="print the $0 plan and the approval-needed runs")
    ap.add_argument("--launch-gpu", action="store_true", help="refused; present so a paid launch cannot be the default path")
    ap.add_argument("--catalog", default=CATALOG_PATH)
    args = ap.parse_args(argv)
    if args.launch_gpu:
        print("REFUSED: ysl_mask_benchmark.py does not launch Fal, Hugging Face Jobs, or any paid GPU inference.")
        print("Approval-needed commands stay in the scorecard until Fendi approves a spend.")
        return 3
    catalog = load_catalog(args.catalog)
    if catalog.get("default_segmenter") != "mediapipe":
        print("REFUSED: catalog default_segmenter must stay mediapipe.")
        return 4
    text = render_scorecard(catalog)
    if args.write_scorecard:
        with open(SCORECARD_PATH, "w") as f:
            f.write(text)
        print(SCORECARD_PATH)
    if args.plan or not args.write_scorecard:
        print("\n".join(plan_lines(catalog)))
    if not args.plan and not args.write_scorecard:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
