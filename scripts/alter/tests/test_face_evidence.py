"""The face test group's arithmetic and its refusals, without the models (numpy only)."""
import json, os, subprocess, sys
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import face_evidence as fe
import track_mouth as tm

WORDS = "The face looked clean. That's definitely a pass."


def track(n=48, emb_noise=0.0, wobble=0.0, seed=1, sha=tm.ARC_SHA256, width=1080, height=1920):
    """A head drifting across a tall frame. `emb_noise` shakes the embedding; `wobble` shakes single outline points."""
    rng = np.random.default_rng(seed); base = rng.normal(size=512)
    ring = np.array([[np.cos(a), np.sin(a)] for a in np.linspace(0, 2 * np.pi, 42, endpoint=False)]) * 0.5
    frames = []
    for i in range(n):
        centre = np.array([0.4 + 0.002 * i, 0.3 + 0.001 * i]); fw = 0.15
        pts = centre + ring * [fw, fw * width / height] + rng.normal(size=ring.shape) * wobble
        frames.append({"t": i / 24.0, "found": True, "openness": 0.1 + 0.05 * np.sin(i * 0.8), "turn": 0.0,
                       "face_width": fw, "lips": [[0.0, 0.3]] * 20, "oval": pts[:36].tolist(),
                       "anchors": pts[36:].tolist(), "emb": (base + rng.normal(size=512) * emb_noise).tolist()})
    return {"fps": 24.0, "width": width, "height": height, "identity_model_sha256": sha, "frames": frames}


def test_a_steadier_face_reads_lower_and_a_shakier_one_higher():
    take = track(emb_noise=0.10, wobble=0.0005)
    steady = fe.measure(take, track(emb_noise=0.05, wobble=0.00025, seed=1))
    shaky = fe.measure(take, track(emb_noise=0.20, wobble=0.0010, seed=1))
    assert steady["embedding_jitter"] < 1 < shaky["embedding_jitter"]
    assert steady["shape_wobble"] < 1 < shaky["shape_wobble"]


def test_the_take_against_itself_reads_one_and_zero():
    take = track(emb_noise=0.1, wobble=0.0005)
    m = fe.measure(take, take)
    assert m["embedding_jitter"] == 1.0 and m["shape_wobble"] == 1.0 and m["identity_distance"] == 0.0


def test_head_movement_alone_is_not_wobble():
    still = track(wobble=0.0)
    assert fe.shape_wobble(still) < 1e-9


def test_embedding_numbers_need_the_pinned_model_on_both_tracks():
    m = fe.measure(track(emb_noise=0.1, wobble=0.0005), track(emb_noise=0.1, wobble=0.0005, sha=None))
    assert m["identity_distance"] is None and m["embedding_jitter"] is None
    assert m["shape_wobble"] is not None


def test_a_row_needs_his_words_a_label_and_something_measured():
    take = track(emb_noise=0.1, wobble=0.0005)
    with pytest.raises(ValueError, match="words"): fe.make_row(take, take, "s1", "pass", "ok ​​​​​​​​​​")
    with pytest.raises(ValueError, match="label"): fe.make_row(take, take, " ", "pass", WORDS)
    with pytest.raises(ValueError, match="verdict"): fe.make_row(take, take, "s1", "fine", WORDS)
    blind = {"frames": [{"t": 0.0, "found": False}] * 20}
    with pytest.raises(ValueError, match="nothing could be measured"): fe.make_row(take, blind, "s1", "pass", WORDS)
    row = fe.make_row(take, take, "s1 draft 1", "pass", WORDS, when="2026-11-27")
    assert row["verdict"] == "pass" and row["about"] == "face" and row["words"] == WORDS


def rows(passes, rejects, key="embedding_jitter", about="face"):
    mk = lambda v, verdict: {"verdict": verdict, "about": about, key: v}
    return [mk(v, "pass") for v in passes] + [mk(v, "reject") for v in rejects]


def test_one_of_each_is_a_comparison_but_not_a_line():
    s = fe.separation(rows([0.77], [1.58]), "embedding_jitter")
    assert s["separates"] is True and s["enough"] is False and "candidate_line" not in s


def test_a_line_is_proposed_only_from_a_big_enough_group_that_separates():
    s = fe.separation(rows([0.7, 0.8, 0.9, 0.95, 1.0], [1.4, 1.5, 1.6]), "embedding_jitter")
    assert s["enough"] and s["candidate_line"] == 1.2 and "not a gate" in s["reads"]


def test_a_reject_that_reads_better_than_a_pass_rules_the_measure_out():
    s = fe.separation(rows([0.021] * 5, [0.010] * 3, key="identity_distance"), "identity_distance")
    assert s["separates"] is False and "cannot be the gate" in s["reads"] and "candidate_line" not in s


def test_a_verdict_about_something_else_stays_out_of_the_face_group():
    s = fe.separation(rows([0.7], [1.5], about="action"), "embedding_jitter")
    assert s["passes"] == 0 and s["rejects"] == 0


def test_add_then_show_and_the_same_draft_twice_is_refused(tmp_path):
    take, draft = tmp_path / "take.json", tmp_path / "draft.json"
    take.write_text(json.dumps(track(emb_noise=0.1, wobble=0.0005)))
    draft.write_text(json.dumps(track(emb_noise=0.2, wobble=0.001)))
    ledger = tmp_path / "group" / "ledger.jsonl"
    cmd = [sys.executable, os.path.join(os.path.dirname(fe.__file__), "face_evidence.py")]
    add = cmd + ["add", "--run", str(tmp_path), "--label", "s1 draft 1", "--verdict", "reject", "--words",
                 "The face was warping on clip 3.", "--ledger", str(ledger)]
    assert subprocess.run(add, capture_output=True, text=True).returncode == 0
    again = subprocess.run(add, capture_output=True, text=True)
    assert again.returncode != 0 and "already in the ledger" in again.stderr
    shown = subprocess.run(cmd + ["show", "--ledger", str(ledger)], capture_output=True, text=True)
    assert "1 verdicts" in shown.stdout and "No line here is certified" in shown.stdout
    none = subprocess.run(cmd + ["show"], capture_output=True, text=True, env={k: v for k, v in os.environ.items() if k != fe.LEDGER_ENV})
    assert none.returncode != 0 and "refused" in none.stderr
