#!/usr/bin/env python3
"""
Aggregate the per-part Astra results (as stored by astra-visual-review-proxy under
project-exports/.../astra-reviews/<draftId>/<partId>.json) into ONE review in the
src/lib/qa/astraVisualReview.ts `AstraReviewSchema` shape, and optionally diff it against a
previous aggregate (same defect-identity rules as diffReviews()).

  python3 scripts/qa/aggregate_astra_review.py --parts review_v2/*.json --manifest pkg_v2/manifest.json \
      --project-id <uuid> --out astra_review_v2.json [--prev astra_review_v1.json]

Defects from every part are merged by defect_id (first occurrence wins; severities are
upgraded if a later part rates the same defect higher). `watched_video` is false: the
frame-strip path is the only one available on the API today.
"""
import argparse, glob, json, sys

SEV = {"blocker": 3, "major": 2, "minor": 1, "note": 0}
OWNERS = {"wardrobe_generation", "temporal_propagation", "brand_repair", "identity", "environment", "compositing_mask",
          "edit_fx", "source_range", "sync", "broll", "export_quality", "treatment", "unknown"}

def norm_defect(d):
    d = dict(d)
    if d.get("recommended_owner") not in OWNERS: d["recommended_owner"] = "unknown"
    tr = d.get("time_range") or [0, 0]
    d["time_range"] = [max(0.0, float(tr[0])), max(0.0, float(tr[1]))]
    d.setdefault("song_range", None); d.setdefault("shot_id", None); d.setdefault("requires_treatment_change", False)
    return d

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", nargs="+", required=True); ap.add_argument("--manifest", required=True)
    ap.add_argument("--project-id", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--prev", default=None); ap.add_argument("--reviewer", default="gpt-6-astra")
    a = ap.parse_args()
    man = json.load(open(a.manifest))
    files = sorted(f for pat in a.parts for f in glob.glob(pat))
    shots, transitions, defects, answers, escalate = [], [], {}, {}, []
    overall = None; final = None; ts = None; cost = 0.0; usage = {"input_tokens": 0, "output_tokens": 0}; parts_meta = {}
    for f in files:
        rec = json.load(open(f)); r = rec.get("review") or {}
        if not r: print(f"warning: {f} has no parsed review", file=sys.stderr); continue
        pid = rec.get("partId", f)
        parts_meta[pid] = {"responseId": rec.get("responseId"), "model": rec.get("model"), "actualCostUsd": rec.get("actualCostUsd"), "reviewedAt": rec.get("reviewedAt")}
        cost += float(rec.get("actualCostUsd") or 0); ts = ts or rec.get("reviewedAt")
        u = rec.get("usage") or {}; usage["input_tokens"] += int(u.get("input_tokens") or 0); usage["output_tokens"] += int(u.get("output_tokens") or 0)
        for s in r.get("shots", []):
            s = dict(s); s.setdefault("observations", []); s.setdefault("defects", [])
            if s.get("recommended_owner") in (None, "none") or s.get("recommended_owner") not in OWNERS: s["recommended_owner"] = None
            s.setdefault("recommended_action", None); shots.append(s)
        for t in r.get("transitions", []):
            t = dict(t); t.setdefault("defects", []); t.setdefault("recommended_action", None); t["draft_time"] = max(0.0, float(t.get("draft_time") or 0)); transitions.append(t)
        for d in r.get("defects", []) + r.get("sequence_defects", []):
            d = norm_defect(d); k = d["defect_id"]
            if k not in defects or SEV.get(d["severity"], 0) > SEV.get(defects[k]["severity"], 0): defects[k] = d
        ans = r.get("answers") or {}
        if isinstance(ans, list):  # strict-schema parts return [{question, answer, evidence}]
            for q in ans: answers[str(q.get("question", len(answers) + 1))] = f'{q.get("answer", "")} — evidence: {q.get("evidence", "")}'.strip(" —")
        else: answers.update(ans)
        escalate += [e for e in (r.get("escalate_to_fendi") or []) if e not in escalate]
        if r.get("overall"): overall = r["overall"]
        if r.get("final_verdict"): final = r["final_verdict"]
    if overall is None: raise SystemExit("no part carried `overall` (the sequence part is missing)")
    worst = max((SEV[d["severity"]] for d in defects.values()), default=0)
    if final is None: final = "REPAIR_REQUIRED" if worst >= 1 else "PASS"
    review = {
        "schema_version": 1, "draft_id": man["draftId"], "project_id": a.project_id,
        "treatment_version": man.get("treatmentVersion", "unknown"), "reviewer": a.reviewer,
        "review_timestamp": ts or "", "watched_video": False, "overall": overall,
        "shots": sorted(shots, key=lambda s: s["shot_id"]), "transitions": sorted(transitions, key=lambda t: t["draft_time"]),
        "sequence_defects": sorted(defects.values(), key=lambda d: (-SEV[d["severity"]], d["time_range"][0])),
        "answers": answers, "final_verdict": final, "escalate_to_fendi": escalate,
        "_provenance": {"parts": parts_meta, "totalCostUsd": round(cost, 4), "usage": usage, "note": "aggregated by scripts/qa/aggregate_astra_review.py from the proxy-stored part files"},
    }
    # Items the reviewer declared outside its evidence (silent sampled frames). They are not
    # repair work for any subsystem; they go to native-media QA or to the authority.
    unverifiable = [d["defect_id"] for d in defects.values() if str(d.get("description", "")).upper().startswith("UNVERIFIABLE FROM SAMPLES")]
    review["_native_media_qa_required"] = sorted(unverifiable)
    if a.prev:
        prev = json.load(open(a.prev)); p = {d["defect_id"]: d for d in prev["sequence_defects"]}
        review["_diff_vs_prev"] = {
            "prev_draft_id": prev["draft_id"],
            "resolved": sorted(k for k in p if k not in defects),
            "persisting": sorted(k for k in p if k in defects),
            "introduced": sorted(k for k in defects if k not in p),
        }
    json.dump(review, open(a.out, "w"), indent=2)
    by_owner = {}
    for d in defects.values(): by_owner.setdefault(d["recommended_owner"], []).append(f'{d["severity"]}:{d["defect_id"]}')
    print(json.dumps({"final_verdict": final, "overall": {k: v for k, v in overall.items() if k != "summary"}, "defects": len(defects), "by_owner": by_owner, "cost": round(cost, 4), "native_media_qa_required": review["_native_media_qa_required"], "diff": review.get("_diff_vs_prev")}, indent=2))

if __name__ == "__main__":
    main()
