"""The test group for the face checks: every draft Fendi judges while a video is built, with its numbers. Local, $0.

The identity line (0.25) and any face-steadiness line are NOT certified: no number clears his face. This tool does not
change that, and nothing reads its output to decide anything. It keeps the evidence a line can later be derived from,
inside the project being built:

    export AVT_FACE_EVIDENCE=/Volumes/T7/_avt_work/alter_face_evidence/<video>.jsonl
    python -I scripts/alter/face_evidence.py add --run work/ --label "s12 block, draft 1" --verdict pass \
        --words "<what Fendi said about that draft's face, word for word>"
    python -I scripts/alter/face_evidence.py add --run work/ --label "s14, draft 2" --verdict reject --fault steady \
        --words "<his words>"
    python -I scripts/alter/face_evidence.py show

  add    reads take.json and draft.json from a run_draft.py folder (or --take-track / --draft-track), measures the
         face three ways, and appends one line to the ledger with his verdict and his words.
  show   prints the group, and for each measure whether it separates the faces he passed from the faces he rejected
         FOR THE FAULT THAT MEASURE IS ABOUT. It proposes nothing until the group is big enough, and it never writes
         a gate: turning a line on is a Class C change with the ledger in the same PR, and that PR reviews this
         method again with the line.

The three measures (higher = worse on all three):
  identity_distance  who the face is: 1 - cosine between the mean face embedding of the take and of the draft
                     (track_mouth.score_tracks). Judged against faces he rejected as not him (--fault who).
  embedding_jitter   how much the face embedding changes from one frame to the next in the draft, divided by the same
                     number on the take. Judged against faces he rejected as warping or sliding (--fault steady).
  shape_wobble       how far the face outline of a frame sits from where its two neighbours put it, after each
                     neighbour is fitted onto it by shift, turn and scale (so a head that moves, rolls or comes closer
                     reads 0), in face widths, divided by the same number on the take. Judged against --fault steady.

HYPOTHESIS, not a fact: a ratio of 1 means "as steady as his real face". The take is tracked at its own size and a
draft at 480p; the take against its own 640-wide copy is recorded as a control row so the size effect is visible.

A verdict counts only if it is about the FACE of that draft (--about face, the default). A draft he rejected for the
action, the scene or the mouth is recorded with --about and stays out of the face group. A line is read from redraws
only (--kind redraw, the default): a put-back or another person's face is shown beside the group, never counted in it,
except that another person's face counts as a "not him" for identity.

To correct a row, add it again with --correct: the ledger keeps both lines and the later one is used.
"""
import argparse, datetime, hashlib, json, math, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import track_mouth as tm  # noqa: E402

METHOD = "face_evidence/1"          # stamped on every row; rows of another method are never mixed into one reading
LEDGER_ENV = "AVT_FACE_EVIDENCE"
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MEASURES = ("identity_distance", "embedding_jitter", "shape_wobble")
FAULT_FOR = {"identity_distance": "who", "embedding_jitter": "steady", "shape_wobble": "steady"}
REJECT_KINDS = {"identity_distance": ("redraw", "other_person"), "embedding_jitter": ("redraw",), "shape_wobble": ("redraw",)}
ABOUT = ("face", "mouth", "action", "scene", "other")
KINDS = ("redraw", "putback", "other_person", "control")
FAULTS = ("who", "steady", "other")
# DECISION (27 Nov 2026), not a measured fact: the smallest group `show` will read a line from. A floor written before
# the group exists so it cannot be fitted to the result. It changes only in the Class C PR that proposes a line.
MIN_PASSES, MIN_REJECTS, MIN_TAKES = 5, 3, 2
MIN_WORD_CHARS = 12
NOTE = "recorded, not gated: these numbers clear nothing and fail nothing; Fendi judges the face"


def _unit(v):
    v = np.asarray(v, np.float64); n = np.linalg.norm(v)
    return None if not np.isfinite(n) or n < 1e-9 else v / n


def _usable(take, draft):
    """Per frame of the draft: is his face read in BOTH clips? Only when the clips pair frame for frame."""
    ft, fd = take["frames"], draft["frames"]
    if len(ft) != len(fd): return None
    return [bool(a.get("found") and b.get("found")) for a, b in zip(ft, fd)]


def embedding_jitter(track, usable=None):
    """(mean of 1 - cosine between the embeddings of neighbouring frames, pairs used). None without 8 pairs."""
    fr = track["frames"]; ok = usable or [True] * len(fr)
    e = [_unit(f["emb"]) if ok[i] and f.get("found") and f.get("emb") else None for i, f in enumerate(fr)]
    d = [1.0 - float(a @ b) for a, b in zip(e, e[1:]) if a is not None and b is not None]
    return (float(np.mean(d)), len(d)) if len(d) >= 8 else (None, len(d))


def _apply(matrix, pts):
    m = np.asarray(matrix, np.float64)
    return pts @ m[:, :2].T + m[:, 2]


def shape_wobble(track, usable=None):
    """(mean distance, in face widths, between a frame's outline and the average of its two neighbours once each is
    fitted onto it by shift, turn and scale; trios used). None without 8 trios, or without the frame's size."""
    fr, w, h = track["frames"], track.get("width"), track.get("height"); ok = usable or [True] * len(fr)
    if not w or not h: return None, 0
    pts = lambda f: np.array(f["oval"] + f["anchors"], np.float64) * [w, h]
    good = lambda i: ok[i] and fr[i].get("found") and fr[i].get("oval") and fr[i].get("anchors") and fr[i].get("face_width")
    out = []
    for i in range(1, len(fr) - 1):
        if not (good(i - 1) and good(i) and good(i + 1)): continue
        a, b, c = pts(fr[i - 1]), pts(fr[i]), pts(fr[i + 1])
        resid = (_apply(tm.similarity(a, b), a) + _apply(tm.similarity(c, b), c)) / 2 - b
        out.append(float(np.linalg.norm(resid, axis=1).mean() / (fr[i]["face_width"] * w)))
    return (float(np.mean(out)), len(out)) if len(out) >= 8 else (None, len(out))


def _ratio(draft, take):
    if draft is None or take is None or take < 1e-9: return None
    r = draft / take
    return round(r, 3) if math.isfinite(r) else None


def _num(v, places):
    return None if v is None or not math.isfinite(v) else round(v, places)


def measure(take, draft):
    """The three numbers for one draft against its take, with what each rests on. Unreadable = None, never a guess."""
    score = tm.score_tracks(take, draft); same = tm.same_identity_model(take, draft); use = _usable(take, draft)
    jt, jtn = embedding_jitter(take, use) if same else (None, 0); jd, jdn = embedding_jitter(draft, use) if same else (None, 0)
    wt, wtn = shape_wobble(take, use); wd, wdn = shape_wobble(draft, use)
    return {
        "identity_distance": _num(score.get("identity_distance"), 3), "identity_p95": _num(score.get("identity_p95"), 3),
        "embedding_jitter": _ratio(jd, jt), "shape_wobble": _ratio(wd, wt),
        "raw": {"jitter_take": _num(jt, 5), "jitter_draft": _num(jd, 5), "jitter_pairs": [jtn, jdn],
                "wobble_take": _num(wt, 5), "wobble_draft": _num(wd, 5), "wobble_trios": [wtn, wdn]},
        "frames": [len(take["frames"]), len(draft["frames"])], "fps": [take.get("fps"), draft.get("fps")],
        "paired_by": "frame" if use is not None else "each clip's own frames (lengths differ)",
        "mouth_timing": score.get("timing"), "coverage": score.get("coverage"),
        "identity_model_sha256": score.get("identity_model_sha256"),
    }


def steadiness_summary(take, draft):
    """What run_draft.py prints with every draft."""
    m = measure(take, draft)
    return {"embedding_jitter": m["embedding_jitter"], "shape_wobble": m["shape_wobble"], "against": "the take (1 = the take's own)",
            "certified": False, "note": NOTE}


def visible(text):
    return sum(1 for c in text if c.isprintable() and not c.isspace())


def make_row(take, draft, label, verdict, words="", about="face", kind="redraw", fault=None, project="", run="", when=None):
    if kind not in KINDS: raise ValueError(f"kind is one of {', '.join(KINDS)}")
    if about not in ABOUT: raise ValueError(f"about is one of {', '.join(ABOUT)}")
    if not label.strip(): raise ValueError("label: which shot and which draft")
    if kind == "control":
        verdict, fault = "control", None                      # a measurement of the method, not a verdict of his
    else:
        if verdict not in ("pass", "reject"): raise ValueError("verdict is pass or reject")
        if visible(words) < MIN_WORD_CHARS: raise ValueError("words: what Fendi said about this draft, word for word")
        if verdict == "reject" and about == "face":
            if fault not in FAULTS: raise ValueError("fault: what was wrong with the face: who (not him), steady (warps, slides) or other")
        else:
            fault = None
    m = measure(take, draft)
    if all(m[k] is None for k in MEASURES): raise ValueError("nothing could be measured: his face was not read on both clips")
    return {"method": METHOD, "when": when or datetime.date.today().isoformat(), "project": project, "label": label.strip(),
            "kind": kind, "verdict": verdict, "about": about, "fault": fault, "words": words.strip(), **m, "run": run}


def current(rows):
    """The ledger as it stands: a later line for the same pair of tracks and the same subject replaces the earlier."""
    seen = {}
    for n, r in enumerate(rows):
        pair = (r.get("take_sha256"), r.get("draft_sha256"))
        seen[(*pair, r.get("about")) if all(pair) else n] = r
    return list(seen.values())


def separation(rows, key):
    """Does `key` put every face he rejected for ITS fault above every face he passed? Redraws only; one method."""
    rows = [r for r in current(rows) if r.get("method") == METHOD and r.get("about") == "face" and r.get(key) is not None]
    p = [r for r in rows if r["verdict"] == "pass" and r.get("kind") == "redraw"]
    x = [r for r in rows if r["verdict"] == "reject" and r.get("fault") == FAULT_FOR[key] and r.get("kind") in REJECT_KINDS[key]]
    beside = [r for r in rows if r["verdict"] == "reject" and r.get("fault") == FAULT_FOR[key] and r.get("kind") not in REJECT_KINDS[key]]
    pv, xv = [r[key] for r in p], [r[key] for r in x]
    takes = len({r.get("take_sha256") for r in p + x})
    out = {"measure": key, "judged_against": f"faces rejected as '{FAULT_FOR[key]}'", "passes": len(p), "rejects": len(x),
           "takes": takes, "highest_pass": max(pv) if pv else None, "lowest_reject": min(xv) if xv else None,
           "certified": False}
    out["enough"] = enough = len(p) >= MIN_PASSES and len(x) >= MIN_REJECTS and takes >= MIN_TAKES
    need = f"needs {MIN_PASSES} passes and {MIN_REJECTS} rejects of redraws, from at least {MIN_TAKES} takes"
    if not pv or not xv:
        out["reads"] = f"no comparison yet: {need}"
    elif max(pv) < min(xv):
        out["separates"] = True
        if enough:
            out["candidate_line"] = round((max(pv) + min(xv)) / 2, 3)
            out["reads"] = (f"separates: every pass is under every reject. Candidate line {out['candidate_line']} "
                            f"(midway). A proposal for Fendi and a Class C review, not a gate.")
        else:
            out["reads"] = f"separates so far, on too few to read a line from ({need})"
    else:
        out["separates"] = False
        out["reads"] = (f"does NOT separate: a face he rejected as '{FAULT_FOR[key]}' reads as well as or better than a "
                        f"face he passed. On its own this number cannot be the gate for that fault.")
    if beside and pv:
        worse = sum(1 for r in beside if r[key] > max(pv))
        out["beside"] = f"outside the group: {worse} of {len(beside)} non-redraw rejects ({', '.join(sorted({r['kind'] for r in beside}))}) read above every pass"
    return out


def read_ledger(path):
    """Every line of the ledger, or a refusal naming the line that cannot be read. Never skips a line."""
    if not os.path.exists(path): return []
    rows = []
    for n, line in enumerate(open(path), 1):
        if not line.strip(): continue
        try:
            r = json.loads(line)
            if not isinstance(r, dict) or not all(k in r for k in ("verdict", "about", "label", "when")): raise ValueError
        except ValueError:
            sys.exit(f"refused: line {n} of {path} is not a ledger row. Fix or remove that line by hand; nothing was changed.")
        rows.append(r)
    return rows


def ledger_path(arg):
    path = arg or os.environ.get(LEDGER_ENV)
    if not path: sys.exit(f"refused: name the ledger with --ledger or ${LEDGER_ENV} (a .jsonl on the T7, one per project)")
    full = os.path.realpath(os.path.abspath(path))
    if "/Library/Mobile Documents" in full: sys.exit("refused: the ledger does not go in iCloud. Put it on the T7.")
    if full == ROOT or full.startswith(ROOT + os.sep): sys.exit("refused: the ledger does not go in the repo. Put it on the T7; it reaches the repo only in the PR that proposes a line.")
    return full


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0]); sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("--run", help="a run_draft.py folder (take.json and draft.json)")
    a.add_argument("--take-track"); a.add_argument("--draft-track")
    a.add_argument("--label", required=True); a.add_argument("--verdict", choices=("pass", "reject"))
    a.add_argument("--words", default="", help="Fendi's own words about this draft")
    a.add_argument("--about", default="face", choices=ABOUT, help="what his verdict was about")
    a.add_argument("--fault", choices=FAULTS, help="for a rejected face: who (not him), steady (warps, slides), other")
    a.add_argument("--kind", default="redraw", choices=KINDS)
    a.add_argument("--correct", action="store_true", help="replace the earlier row for this draft")
    a.add_argument("--project", default=""); a.add_argument("--when"); a.add_argument("--ledger")
    s = sub.add_parser("show"); s.add_argument("--ledger"); s.add_argument("--json", action="store_true")
    args = ap.parse_args(); path = ledger_path(args.ledger); rows = read_ledger(path)

    if args.cmd == "add":
        tt = args.take_track or (args.run and os.path.join(args.run, "take.json"))
        dt = args.draft_track or (args.run and os.path.join(args.run, "draft.json"))
        if not tt or not dt: sys.exit("refused: give --run, or both --take-track and --draft-track")
        for f in (tt, dt):
            if not os.path.isfile(f): sys.exit(f"refused: no track at {f}")
        run = os.path.relpath(os.path.abspath(args.run or os.path.dirname(dt)), os.path.dirname(path))
        try:
            row = make_row(json.load(open(tt)), json.load(open(dt)), args.label, args.verdict, args.words, args.about,
                           args.kind, args.fault, args.project, run, args.when)
        except (ValueError, KeyError, TypeError) as e:
            sys.exit(f"refused: {e if isinstance(e, ValueError) and str(e) else 'a track is not a track_mouth.py track'}")
        row.update({"take_sha256": sha(tt), "draft_sha256": sha(dt), "tracks": [os.path.basename(tt), os.path.basename(dt)]})
        same = [r for r in rows if (r.get("take_sha256"), r.get("draft_sha256"), r.get("about")) ==
                (row["take_sha256"], row["draft_sha256"], row["about"])]
        if same and not args.correct: sys.exit("refused: this draft's verdict is already in the ledger. To change it, add it again with --correct.")
        if args.correct: row["corrects"] = len(same)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as f: f.write(json.dumps(row) + "\n")
        print(json.dumps(row, indent=1)); return

    live = current(rows); other = sorted({str(r.get("method")) for r in live if r.get("method") != METHOD})
    seps = [separation(rows, k) for k in MEASURES]
    if args.json:
        print(json.dumps({"ledger": path, "method": METHOD, "certified": False, "note": NOTE, "other_methods": other,
                          "rows": live, "separation": seps}, indent=1)); return
    face = [r for r in live if r["about"] == "face" and r["verdict"] != "control"]
    print(f"{path}: {len(live)} rows, {len(face)} verdicts about the face, method {METHOD}\n")
    if other: print(f"LEFT OUT of every reading below: rows made with another method ({', '.join(other)}). Measure them again.\n")
    fmt = lambda v: "   -  " if v is None else f"{v:6.3f}"
    print("verdict  fault   kind          identity  jitter  wobble  about   label")
    for r in sorted(live, key=lambda r: (r["verdict"], r.get("identity_distance") or 0)):
        print(f"{r['verdict']:7s}  {(r.get('fault') or '-'):6s}  {r.get('kind', '-'):12s}  {fmt(r.get('identity_distance'))}  "
              f"{fmt(r.get('embedding_jitter'))}  {fmt(r.get('shape_wobble'))}  {r['about']:6s}  {r['label']} ({r['when']})")
    print()
    for s_ in seps:
        print(f"{s_['measure']:18s} against {s_['judged_against']}: passes {s_['passes']}, rejects {s_['rejects']}, takes {s_['takes']}: {s_['reads']}")
        if s_.get("beside"): print(f"{'':18s} {s_['beside']}")
    print("\nNo line here is certified. A number never clears his face; Fendi judges the face sheet.")


if __name__ == "__main__":
    main()
