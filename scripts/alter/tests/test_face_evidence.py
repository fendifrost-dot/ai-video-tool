"""The face test group's arithmetic and its refusals, without the models (numpy only)."""
import json, math, os, subprocess, sys
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import face_evidence as fe
import track_mouth as tm

WORDS = "The face looked clean. That's definitely a pass."
SCRIPT = [sys.executable, os.path.join(os.path.dirname(fe.__file__), "face_evidence.py")]


def track(n=48, emb_noise=0.0, wobble=0.0, seed=1, sha=tm.ARC_SHA256, width=1080, height=1920, move=None, dims=True):
    """A head in a tall frame. `move(i)` gives (centre, face width as a share of the frame width, roll) per frame;
    `emb_noise` shakes the embedding; `wobble` shakes single outline points."""
    rng = np.random.default_rng(seed); base = rng.normal(size=512)
    ring = np.array([[np.cos(a), np.sin(a)] for a in np.linspace(0, 2 * np.pi, 42, endpoint=False)]) * 0.5
    move = move or (lambda i: ((0.4 + 0.002 * i, 0.3 + 0.001 * i), 0.15, 0.0))
    frames = []
    for i in range(n):
        centre, fw, roll = move(i); c, s = math.cos(roll), math.sin(roll)
        px = ring @ np.array([[c, s], [-s, c]]) * fw * width                      # the outline in pixels, rolled
        pts = np.array(centre) + px / [width, height] + rng.normal(size=ring.shape) * wobble
        frames.append({"t": i / 24.0, "found": True, "openness": 0.1 + 0.05 * np.sin(i * 0.8), "turn": 0.0,
                       "face_width": fw, "lips": [[0.0, 0.3]] * 20, "oval": pts[:36].tolist(),
                       "anchors": pts[36:].tolist(), "emb": (base + rng.normal(size=512) * emb_noise).tolist()})
    out = {"fps": 24.0, "identity_model_sha256": sha, "frames": frames}
    if dims: out.update({"width": width, "height": height})
    return out


def test_a_steadier_face_reads_lower_and_a_shakier_one_higher():
    take = track(emb_noise=0.10, wobble=0.0005)
    steady = fe.measure(take, track(emb_noise=0.05, wobble=0.00025, seed=1))
    shaky = fe.measure(take, track(emb_noise=0.20, wobble=0.0010, seed=1))
    assert steady["embedding_jitter"] < 1 < shaky["embedding_jitter"]
    assert steady["shape_wobble"] < 1 < shaky["shape_wobble"]
    assert shaky["raw"]["wobble_trios"] == [46, 46] and shaky["raw"]["jitter_pairs"] == [47, 47]


def test_the_take_against_itself_reads_one_and_zero():
    take = track(emb_noise=0.1, wobble=0.0005)
    m = fe.measure(take, take)
    assert m["embedding_jitter"] == 1.0 and m["shape_wobble"] == 1.0 and m["identity_distance"] == 0.0


def test_a_head_that_speeds_up_rolls_and_comes_closer_is_not_wobble():
    rigid = track(move=lambda i: ((0.3 + 0.0002 * i * i, 0.3 + 0.0001 * i * i), 0.10 + 0.0003 * i * i / 10, 0.0004 * i * i))
    value, trios = fe.shape_wobble(rigid)
    assert trios == 46 and value < 1e-4
    shaken, _ = fe.shape_wobble(track(wobble=0.0005, move=lambda i: ((0.3 + 0.0002 * i * i, 0.3), 0.15, 0.0)))
    assert shaken > 100 * value


def test_wobble_is_the_same_at_any_size_of_frame():
    a, _ = fe.shape_wobble(track(wobble=0.0005, width=1080, height=1920))
    b, _ = fe.shape_wobble(track(wobble=0.0005, width=540, height=960))
    assert abs(a - b) < 1e-9


def test_a_track_without_its_frame_size_is_not_guessed():
    assert fe.shape_wobble(track(wobble=0.0005, dims=False)) == (None, 0)
    m = fe.measure(track(emb_noise=0.1, wobble=0.0005), track(emb_noise=0.1, wobble=0.0005, dims=False))
    assert m["shape_wobble"] is None and m["embedding_jitter"] is not None


def test_embedding_numbers_need_the_pinned_model_on_both_tracks():
    m = fe.measure(track(emb_noise=0.1, wobble=0.0005), track(emb_noise=0.1, wobble=0.0005, sha=None))
    assert m["identity_distance"] is None and m["embedding_jitter"] is None
    assert m["shape_wobble"] is not None


def test_only_frames_read_in_both_clips_are_used():
    take, draft = track(emb_noise=0.1, wobble=0.0005), track(emb_noise=0.1, wobble=0.0005, seed=2)
    for i in range(10, 20): draft["frames"][i]["found"] = False
    m = fe.measure(take, draft)
    assert m["raw"]["jitter_pairs"][0] == m["raw"]["jitter_pairs"][1] < 47 and m["paired_by"] == "frame"


def test_a_broken_embedding_is_none_not_nan():
    draft = track(emb_noise=0.1, wobble=0.0005)
    for f in draft["frames"]: f["emb"] = [float("nan")] * 512
    m = fe.measure(track(emb_noise=0.1, wobble=0.0005), draft)
    assert m["embedding_jitter"] is None and m["identity_distance"] is None


def test_a_row_needs_his_words_a_label_a_fault_and_something_measured():
    take = track(emb_noise=0.1, wobble=0.0005)
    with pytest.raises(ValueError, match="words"): fe.make_row(take, take, "s1", "pass", "ok ​​​​​​​​​​")
    with pytest.raises(ValueError, match="label"): fe.make_row(take, take, " ", "pass", WORDS)
    with pytest.raises(ValueError, match="verdict"): fe.make_row(take, take, "s1", "fine", WORDS)
    with pytest.raises(ValueError, match="fault"): fe.make_row(take, take, "s1", "reject", WORDS)
    with pytest.raises(ValueError, match="kind"): fe.make_row(take, take, "s1", "pass", WORDS, kind="lookalike")
    blind = {"frames": [{"t": 0.0, "found": False}] * 20}
    with pytest.raises(ValueError, match="nothing could be measured"): fe.make_row(take, blind, "s1", "pass", WORDS)
    row = fe.make_row(take, take, "s1 draft 1", "pass", WORDS, when="2026-11-27")
    assert row["verdict"] == "pass" and row["about"] == "face" and row["words"] == WORDS and row["method"] == fe.METHOD
    assert fe.make_row(take, take, "s1", "reject", WORDS, about="action")["fault"] is None
    control = fe.make_row(take, take, "take against its small copy", None, kind="control")
    assert control["verdict"] == "control" and control["words"] == ""
    stranger = fe.make_row(take, take, "another man, same frame", None, kind="other_person")
    assert (stranger["verdict"], stranger["fault"], stranger["about"], stranger["words"]) == ("reject", "who", "face", "")
    with pytest.raises(ValueError, match="no frames"): fe.make_row(take, {"frames": []}, "s1", "pass", WORDS)


def rows(passes, rejects, key="embedding_jitter", about="face", fault="steady", kind="redraw", takes=3):
    mk = lambda i, v, verdict, k: {"method": fe.METHOD, "verdict": verdict, "about": about, "kind": k, key: v,
                                   "fault": fault if verdict == "reject" else None,
                                   "take_sha256": f"{'P' if verdict == 'pass' else 'R'}{i % takes}", "draft_sha256": f"{verdict}{i}"}
    return [mk(i, v, "pass", "redraw") for i, v in enumerate(passes)] + [mk(i, v, "reject", kind) for i, v in enumerate(rejects)]


def test_one_of_each_is_a_comparison_but_not_a_line():
    s = fe.separation(rows([0.77], [1.58]), "embedding_jitter")
    assert s["separates"] is True and s["enough"] is False and "candidate_line" not in s and s["certified"] is False


def test_a_line_is_proposed_only_from_a_big_enough_group_that_separates():
    s = fe.separation(rows([0.7, 0.8, 0.9, 0.95, 1.0], [1.4, 1.5, 1.6]), "embedding_jitter")
    assert s["enough"] and s["candidate_line"] == 1.2 and "not a gate" in s["reads"] and s["certified"] is False
    assert "candidate_line" not in fe.separation(rows([0.7, 0.8, 0.9, 0.95], [1.4, 1.5, 1.6]), "embedding_jitter")
    assert "candidate_line" not in fe.separation(rows([0.7, 0.8, 0.9, 0.95, 1.0], [1.4, 1.5]), "embedding_jitter")
    one_take = fe.separation(rows([0.7, 0.8, 0.9, 0.95, 1.0], [1.4, 1.5, 1.6], takes=1), "embedding_jitter")
    assert one_take["takes"] == [1, 1] and "candidate_line" not in one_take
    lopsided = rows([0.7, 0.8, 0.9, 0.95, 1.0], [1.4, 1.5, 1.6])
    for r in lopsided:
        if r["verdict"] == "reject": r["take_sha256"] = "one take"
    assert fe.separation(lopsided, "embedding_jitter")["takes"] == [3, 1] and "candidate_line" not in fe.separation(lopsided, "embedding_jitter")


def test_a_reject_that_reads_as_well_as_a_pass_rules_the_measure_out_for_that_fault():
    s = fe.separation(rows([0.021] * 5, [0.010] * 3, key="identity_distance", fault="who"), "identity_distance")
    assert s["separates"] is False and "cannot be the gate for that fault" in s["reads"] and "candidate_line" not in s
    tie = fe.separation(rows([1.2], [1.2]), "embedding_jitter")
    assert tie["separates"] is False and "as well as or better" in tie["reads"]


def test_a_measure_is_judged_only_against_its_own_fault():
    warped = rows([0.021], [0.010], key="identity_distance", fault="steady")
    s = fe.separation(warped, "identity_distance")
    assert s["rejects"] == 0 and "separates" not in s and "no comparison yet" in s["reads"]


def test_a_putback_is_shown_beside_the_group_and_never_counted_in_it():
    s = fe.separation(rows([0.77], [1.58], kind="putback"), "embedding_jitter")
    assert s["rejects"] == 0 and "separates" not in s and "1 of 1 non-redraw rejects (putback)" in s["beside"]
    who = fe.separation(rows([0.02], [0.6], key="identity_distance", fault="who", kind="other_person"), "identity_distance")
    assert who["rejects"] == 1 and who["separates"] is True


def test_rows_of_another_method_and_other_subjects_stay_out():
    old = rows([0.7], [1.5]); [r.update(method="face_evidence/0") for r in old]
    assert fe.separation(old, "embedding_jitter")["passes"] == 0
    s = fe.separation(rows([0.7], [1.5], about="action"), "embedding_jitter")
    assert s["passes"] == 0 and s["rejects"] == 0
    assert fe.separation([{"method": fe.METHOD, "verdict": "pass", "about": "face", "kind": "redraw", "embedding_jitter": None}], "embedding_jitter")["passes"] == 0


def cli(*args, env=None):
    return subprocess.run(SCRIPT + list(args), capture_output=True, text=True, env=env)


def test_the_ledger_from_add_to_show(tmp_path):
    (tmp_path / "take.json").write_text(json.dumps(track(emb_noise=0.1, wobble=0.0005)))
    (tmp_path / "draft.json").write_text(json.dumps(track(emb_noise=0.2, wobble=0.001)))
    ledger = tmp_path / "group" / "ledger.jsonl"
    add = ["add", "--run", str(tmp_path), "--label", "s1 draft 1", "--verdict", "reject", "--fault", "steady",
           "--words", "The face was warping on clip 3.", "--ledger", str(ledger)]
    first = cli(*add); assert first.returncode == 0, first.stderr
    row = json.loads(first.stdout)
    assert len(row["take_sha256"]) == 64 and row["take_sha256"] != row["draft_sha256"] and row["run"] == ".."
    again = cli(*add); assert again.returncode != 0 and "--correct" in again.stderr
    assert len(ledger.read_text().splitlines()) == 1
    fixed = cli(*add[:6], "pass", *add[9:], "--correct"); assert fixed.returncode == 0, fixed.stderr
    assert len(ledger.read_text().splitlines()) == 2
    shown = cli("show", "--ledger", str(ledger))
    assert "1 rows, 1 verdicts about the face" in shown.stdout and "No line here is certified" in shown.stdout
    as_json = json.loads(cli("show", "--ledger", str(ledger), "--json").stdout)
    assert as_json["certified"] is False and as_json["rows"][0]["verdict"] == "pass"
    moved = cli(*add[:6], "reject", "--about", "action", *add[9:], "--correct"); assert moved.returncode == 0, moved.stderr
    live = json.loads(cli("show", "--ledger", str(ledger), "--json").stdout)["rows"]
    assert len(live) == 1 and live[0]["about"] == "action" and len(ledger.read_text().splitlines()) == 3
    (tmp_path / "other").mkdir()
    (tmp_path / "other" / "take.json").write_text(json.dumps(track(emb_noise=0.1, wobble=0.0005, seed=5)))
    (tmp_path / "other" / "draft.json").write_text(json.dumps(track(emb_noise=0.1, wobble=0.0005, seed=6)))
    nothing = cli("add", "--run", str(tmp_path / "other"), "--label", "s2", "--verdict", "pass", "--words", WORDS,
                  "--ledger", str(ledger), "--correct")
    assert nothing.returncode != 0 and "no row in the ledger to correct" in nothing.stderr


def test_refusals(tmp_path):
    no_env = {k: v for k, v in os.environ.items() if k != fe.LEDGER_ENV}
    none = cli("show", env=no_env); assert none.returncode != 0 and "refused" in none.stderr
    in_repo = os.path.join(fe.ROOT, "docs", "ledger.jsonl")
    repo = cli("add", "--run", str(tmp_path), "--label", "s1", "--verdict", "pass", "--words", WORDS, "--ledger", in_repo)
    assert "does not go in the repo" in repo.stderr and not os.path.exists(in_repo)
    assert cli("show", "--ledger", in_repo).returncode == 0          # a ledger committed with a Class C PR can be read
    cloud = cli("show", "--ledger", os.path.expanduser("~/Library/Mobile Documents/x/ledger.jsonl")); assert "iCloud" in cloud.stderr
    ledger = tmp_path / "ledger.jsonl"
    missing = cli("add", "--run", str(tmp_path / "nowhere"), "--label", "s1", "--verdict", "pass", "--words", WORDS, "--ledger", str(ledger))
    assert missing.returncode != 0 and "no track at" in missing.stderr
    (tmp_path / "take.json").write_text("[]"); (tmp_path / "draft.json").write_text("[]")
    junk = cli("add", "--run", str(tmp_path), "--label", "s1", "--verdict", "pass", "--words", WORDS, "--ledger", str(ledger))
    assert junk.returncode != 0 and "not a track_mouth.py track" in junk.stderr and not ledger.exists()
    ledger.write_text('{"verdict": "pass", "about": "face", "label": "a", "when": "2026-11-27"}\n{"verdict": "pa')
    broken = cli("show", "--ledger", str(ledger))
    assert broken.returncode != 0 and "line 2" in broken.stderr and "Traceback" not in broken.stderr


def test_the_summary_run_draft_prints_says_it_gates_nothing():
    take = track(emb_noise=0.1, wobble=0.0005)
    s = fe.steadiness_summary(take, track(emb_noise=0.2, wobble=0.001))
    assert s["certified"] is False and "clear nothing" in s["note"] and s["embedding_jitter"] > 1
