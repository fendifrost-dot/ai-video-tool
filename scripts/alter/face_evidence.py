"""The test group for the face checks: every draft Fendi judges while a video is built, with its numbers. Local, $0.

The identity line (0.25) and any face-steadiness line are NOT certified: no number clears his face. This tool does not
change that. It keeps the evidence a line can later be derived from, inside the project being built:

    python -I scripts/alter/face_evidence.py add  --run work/ --label "s12 block, draft 1" --verdict pass \
        --words "<what Fendi said about that draft's face, word for word>"
    python -I scripts/alter/face_evidence.py show

  add    reads take.json and draft.json from a run_draft.py folder (or --take-track / --draft-track), measures the
         face three ways, and appends one line to the ledger with his verdict and his words.
  show   prints the group, and for each measure whether it separates the faces he passed from the faces he rejected.
         It proposes nothing until the group is big enough (MIN_PASSES, MIN_REJECTS), and it never writes a gate:
         turning a line on is a Class C change with this ledger in the same PR.

The three measures (higher = worse on all three):
  identity_distance  1 - cosine between the mean face embedding of the take and of the draft (track_mouth.score_tracks).
  embedding_jitter   how much the face embedding changes from one frame to the next in the draft, divided by the same
                     number on the take. Above 1 = the face is less steady than his real one.
  shape_wobble       frame-to-frame acceleration of the face outline after the head's own movement is taken out, in
                     face widths, divided by the same number on the take.

A verdict counts only if it is about the FACE of that draft (--about face, the default). A draft he rejected for the
action, the scene or the mouth is recorded with --about and is left out of the face group.
"""
import argparse, datetime, hashlib, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import track_mouth as tm  # noqa: E402

LEDGER_ENV = "AVT_FACE_EVIDENCE"
MEASURES = ("identity_distance", "embedding_jitter", "shape_wobble")
ABOUT = ("face", "mouth", "action", "scene", "other")
# DECISION (27 Nov 2026), not a measured fact: the smallest group `show` will read a line from. A rule of the method,
# written before the group exists so it cannot be fitted to the result. Change it only in a reviewed PR.
MIN_PASSES, MIN_REJECTS = 5, 3
MIN_WORDS = 12


def _unit(v):
    v = np.asarray(v, np.float64); n = np.linalg.norm(v)
    return None if n < 1e-9 else v / n


def embedding_jitter(track):
    """Mean of 1 - cosine between the embeddings of neighbouring frames. None without 8 neighbouring pairs."""
    e = [_unit(f["emb"]) if f.get("found") and f.get("emb") else None for f in track["frames"]]
    d = [1.0 - float(a @ b) for a, b in zip(e, e[1:]) if a is not None and b is not None]
    return float(np.mean(d)) if len(d) >= 8 else None


def _points(frame, width, height):
    return np.array(frame["oval"] + frame["anchors"], np.float64) * [width, height]


def shape_wobble(track):
    """Mean second difference of the outline points with the whole head's movement removed, in face widths."""
    fr, w, h = track["frames"], track.get("width") or 1, track.get("height") or 1
    out = []
    for i in range(1, len(fr) - 1):
        trio = fr[i - 1:i + 2]
        if not all(f.get("found") and f.get("oval") and f.get("anchors") and f.get("face_width") for f in trio): continue
        a = _points(trio[0], w, h) - 2 * _points(trio[1], w, h) + _points(trio[2], w, h)
        a -= a.mean(0)
        out.append(float(np.linalg.norm(a, axis=1).mean() / (trio[1]["face_width"] * w)))
    return float(np.mean(out)) if len(out) >= 8 else None


def _ratio(draft, take):
    return None if draft is None or take is None or take < 1e-9 else round(draft / take, 3)


def measure(take, draft):
    """The three numbers for one draft against its take. A measure that cannot be read is None, never a guess."""
    score = tm.score_tracks(take, draft)
    same = tm.same_identity_model(take, draft)
    return {
        "identity_distance": score.get("identity_distance"), "identity_p95": score.get("identity_p95"),
        "embedding_jitter": _ratio(embedding_jitter(draft), embedding_jitter(take)) if same else None,
        "shape_wobble": _ratio(shape_wobble(draft), shape_wobble(take)),
        "mouth_timing": score.get("timing"), "coverage": score.get("coverage"),
        "identity_model_sha256": score.get("identity_model_sha256"),
    }


def visible(text):
    return sum(1 for c in text if c.isprintable() and not c.isspace())


def make_row(take, draft, label, verdict, words, about="face", kind="redraw", project="", run="", when=None):
    if verdict not in ("pass", "reject"): raise ValueError("verdict is pass or reject")
    if about not in ABOUT: raise ValueError(f"about is one of {', '.join(ABOUT)}")
    if visible(words) < MIN_WORDS: raise ValueError("words: what Fendi said about this draft, word for word")
    if not label.strip(): raise ValueError("label: which shot and which draft")
    m = measure(take, draft)
    if all(m[k] is None for k in MEASURES): raise ValueError("nothing could be measured: his face was not read on both clips")
    return {"when": when or datetime.date.today().isoformat(), "project": project, "label": label.strip(), "kind": kind,
            "verdict": verdict, "about": about, "words": words.strip(), **m, "run": run}


def face_group(rows):
    return [r for r in rows if r.get("about") == "face"]


def separation(rows, key):
    """Does `key` put every face he rejected above every face he passed? Rows without the number are left out."""
    p = [r[key] for r in face_group(rows) if r["verdict"] == "pass" and r.get(key) is not None]
    x = [r[key] for r in face_group(rows) if r["verdict"] == "reject" and r.get(key) is not None]
    out = {"measure": key, "passes": len(p), "rejects": len(x), "highest_pass": max(p) if p else None,
           "lowest_reject": min(x) if x else None}
    enough = len(p) >= MIN_PASSES and len(x) >= MIN_REJECTS
    out["enough"] = enough
    if not p or not x:
        out["reads"] = "no comparison yet: needs at least one face he passed and one he rejected"
    elif max(p) < min(x):
        out["separates"] = True
        if enough:
            out["candidate_line"] = round((max(p) + min(x)) / 2, 3)
            out["reads"] = (f"separates: every pass is under every reject. Candidate line {out['candidate_line']} "
                            f"(midway). A proposal for Fendi and a Class C review, not a gate.")
        else:
            out["reads"] = (f"separates so far, on too few to read a line from "
                            f"(needs {MIN_PASSES} passes and {MIN_REJECTS} rejects)")
    else:
        out["separates"] = False
        out["reads"] = "does NOT separate: a face he rejected reads better than a face he passed. On its own this number cannot be the gate."
    return out


def read_ledger(path):
    if not os.path.exists(path): return []
    return [json.loads(line) for line in open(path) if line.strip()]


def ledger_path(arg):
    path = arg or os.environ.get(LEDGER_ENV)
    if not path: sys.exit(f"refused: name the ledger with --ledger or ${LEDGER_ENV} (a .jsonl on the T7, one per project)")
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0]); sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("--run", help="a run_draft.py folder (take.json and draft.json)")
    a.add_argument("--take-track"); a.add_argument("--draft-track")
    a.add_argument("--label", required=True); a.add_argument("--verdict", required=True, choices=("pass", "reject"))
    a.add_argument("--words", required=True, help="Fendi's own words about this draft")
    a.add_argument("--about", default="face", choices=ABOUT, help="what his verdict was about")
    a.add_argument("--kind", default="redraw", help="redraw, putback, other_person ...")
    a.add_argument("--project", default=""); a.add_argument("--when"); a.add_argument("--ledger")
    s = sub.add_parser("show"); s.add_argument("--ledger"); s.add_argument("--json", action="store_true")
    args = ap.parse_args(); path = ledger_path(args.ledger)

    if args.cmd == "add":
        tt = args.take_track or (args.run and os.path.join(args.run, "take.json"))
        dt = args.draft_track or (args.run and os.path.join(args.run, "draft.json"))
        if not tt or not dt: sys.exit("refused: give --run, or both --take-track and --draft-track")
        try:
            row = make_row(json.load(open(tt)), json.load(open(dt)), args.label, args.verdict, args.words, args.about,
                           args.kind, args.project, os.path.abspath(args.run or os.path.dirname(dt)), args.when)
        except ValueError as e:
            sys.exit(f"refused: {e}")
        row["tracks_sha256"] = hashlib.sha256(open(tt, "rb").read() + open(dt, "rb").read()).hexdigest()[:16]
        if any(r.get("tracks_sha256") == row["tracks_sha256"] and r.get("about") == row["about"] for r in read_ledger(path)):
            sys.exit("refused: this draft's verdict is already in the ledger")
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "a") as f: f.write(json.dumps(row) + "\n")
        print(json.dumps(row, indent=1)); return

    rows = read_ledger(path); seps = [separation(rows, k) for k in MEASURES]
    if args.json:
        print(json.dumps({"ledger": path, "rows": rows, "separation": seps}, indent=1)); return
    print(f"{path}: {len(rows)} verdicts, {len(face_group(rows))} about the face\n")
    fmt = lambda v: "   -  " if v is None else f"{v:6.3f}"
    print("verdict  identity  jitter  wobble  about   label")
    for r in sorted(rows, key=lambda r: (r["verdict"], r.get("identity_distance") or 0)):
        print(f"{r['verdict']:7s}  {fmt(r.get('identity_distance'))}  {fmt(r.get('embedding_jitter'))}  "
              f"{fmt(r.get('shape_wobble'))}  {r['about']:6s}  {r['label']} ({r['when']})")
    print()
    for s_ in seps:
        print(f"{s_['measure']:18s} passes {s_['passes']}, rejects {s_['rejects']}: {s_['reads']}")
    print("\nNo line here is certified. A number never clears his face; Fendi judges the face sheet.")


if __name__ == "__main__":
    main()
