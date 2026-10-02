#!/usr/bin/env python3
"""
COVERAGE QA — does the cut move the way a music video moves? (deterministic, $0)

    python3 scripts/qa/coverage_qa.py --shotspecs cov/shotspecs_coverage.json --bpm 122 [--presets config/coverage_presets.json] --out cov/coverage_qa.json

Reads the shots (any shotspecs: the generated coverage or a hand-written treatment) and reports, against the rules in
config/coverage_presets.json: the share of PERFORMANCE time with a camera move, the longest static run in seconds, the
share of consecutive performance cuts that repeat a move or a framing, the mean cut length in bars, and the per-section
cut cadence. PASS when the static share ≤ rules.static_share_max, the longest static run ≤ rules.max_static_run_s and
no consecutive repeats; otherwise the report names the cuts. Fendi 2026-10-02: "movement and switching angles should be
the norm for the tool, not the exception".
"""
import argparse, json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--shotspecs", required=True); ap.add_argument("--bpm", type=float, required=True); ap.add_argument("--presets", default=os.path.join(ROOT, "config", "coverage_presets.json")); ap.add_argument("--out", required=True)
    a = ap.parse_args(); rules = json.load(open(a.presets))["rules"]; bar = 240.0 / a.bpm
    shots = sorted(json.load(open(a.shotspecs))["shots"], key=lambda s: s["timeline"]["start"])
    perf = [s for s in shots if s.get("kind") == "performance"]
    static_t = 0.0; total = 0.0; longest = 0.0; run = 0.0; repeats_move = []; repeats_framing = []; prev = None; lens = []
    for s in perf:
        d = s["timeline"]["end"] - s["timeline"]["start"]; total += d; lens.append(d / bar)
        mv = (s.get("cameraMotion") or {}).get("type") or "static"; fr = s.get("framing")
        if mv in ("static", None, ""): static_t += d; run += d; longest = max(longest, run)
        else: run = 0.0
        if prev is not None:
            if mv == prev[0] and mv != "static": repeats_move.append((prev[2], s["id"], mv))
            if fr and fr == prev[1]: repeats_framing.append((prev[2], s["id"], fr))
        prev = (mv, fr, s["id"])
    moving_share = 1 - static_t / max(1e-6, total)
    by_section = {}
    for s in perf:
        sec = (s.get("coverage") or {}).get("section") or s.get("section") or "default"; by_section.setdefault(sec, []).append((s["timeline"]["end"] - s["timeline"]["start"]) / bar)
    verdict = "PASS" if (static_t / max(1e-6, total)) <= rules["static_share_max"] and longest <= rules["max_static_run_s"] and not repeats_move and (not rules.get("no_repeat_angle_consecutive") or not repeats_framing) else "FAIL"
    rep = {"verdict": verdict, "performance_cuts": len(perf), "moving_share": round(moving_share, 3), "static_share": round(1 - moving_share, 3), "static_share_max": rules["static_share_max"], "longest_static_run_s": round(longest, 2), "max_static_run_s": rules["max_static_run_s"],
           "mean_cut_bars": round(sum(lens) / max(1, len(lens)), 2), "cut_cadence_bars_by_section": {k: round(sum(v) / len(v), 2) for k, v in by_section.items()}, "repeated_moves": repeats_move, "repeated_framings": repeats_framing,
           "moves": [(s["id"], (s.get("cameraMotion") or {}).get("type") or "static", s.get("framing")) for s in perf]}
    json.dump(rep, open(a.out, "w"), indent=1); print(json.dumps({k: v for k, v in rep.items() if k != "moves"}, indent=1))


if __name__ == "__main__":
    main()
