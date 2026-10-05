#!/usr/bin/env python3
"""
The realism A/B's generation loop, against the answer world-still-proxy really gives. No network, nothing spent.

    python3 -m pytest scripts/qa/tests/test_realism_ab_generation.py -q

Why this exists: the first version read `images[].signedUrl`; the proxy returns `stills[].previewUrl`. Every answer
read as empty, and `while len(saved) < n` asked again — a billed call every few seconds with no end. A run must stop
on an answer it cannot use, and can never pass its estimate by more than the bounded top-up.
"""
import os, sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import realism_ab as R  # noqa: E402

ARMS = {"control": "a person in a doorway", "treatment": "a person in a doorway. grain; skin as it is"}
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16


def proxy(n_returned=None, **over):
    """A stand-in with the proxy's own answer shape (supabase/functions/world-still-proxy/index.ts, last line)."""
    calls = []

    def post(tag, prompt, want):
        calls.append((tag, prompt, want))
        k = want if n_returned is None else n_returned
        stills = [{"path": f"u/p/worlds/{tag}_{len(calls)}_{i}.png", "previewUrl": f"https://signed/{tag}/{len(calls)}/{i}", "bytes": 24, "assetId": None} for i in range(k)]
        return {"ok": k > 0, "billed": True, "actualCostUsd": round(0.07 * k, 4), "stills": stills, **over}

    return post, calls


def test_reads_the_proxys_real_answer():
    assert R.urls_of({"ok": True, "stills": [{"path": "a.png", "previewUrl": "https://x/a"}]}) == ["https://x/a"]
    assert R.urls_of({"ok": False, "error": "xai_error"}) == []


def test_a_full_run_makes_exactly_the_planned_calls_and_bills_the_estimate(tmp_path):
    post, calls = proxy()
    saved, billed = R.run_generation(post, lambda u: PNG, ARMS, 41, str(tmp_path), sleep=lambda s: None)
    assert len(saved["control"]) == 41 and len(saved["treatment"]) == 41
    assert len(calls) == 22                      # 11 calls an arm: ten of 4 and one of 1
    assert billed == pytest.approx(5.74)
    assert all(p.endswith(".png") for p in saved["control"])     # named for what the bytes are
    assert {c[1] for c in calls if c[0] == "treatment"} == {ARMS["treatment"]}


def test_the_arms_are_interleaved_not_run_one_after_the_other():
    order = [tag for tag, _ in R.plan_calls(41)]
    assert order.count("control") == order.count("treatment") == 11
    assert order[:11].count("control") not in (0, 11)            # the first half is not one arm
    assert R.plan_calls(41) == R.plan_calls(41)                   # fixed order, recorded with the run
    for tag in ("control", "treatment"):
        assert sum(w for t, w in R.plan_calls(41) if t == tag) == 41


def test_an_empty_answer_stops_after_one_call_and_never_asks_again(tmp_path):
    def post(tag, prompt, want):            # the shape the first version expected — what the proxy never sends
        post.calls += 1
        return {"ok": True, "billed": True, "actualCostUsd": 0.28, "images": []}
    post.calls = 0
    with pytest.raises(SystemExit) as e:
        R.run_generation(post, lambda u: PNG, ARMS, 41, str(tmp_path), sleep=lambda s: None)
    assert post.calls == 1
    assert "nothing was asked again" in str(e.value) and "$0.28" in str(e.value)


def test_a_refusal_stops_and_says_what_the_provider_said(tmp_path):
    def post(tag, prompt, want):
        return {"ok": False, "billed": False, "error": "xai_error", "httpStatus": 429, "detail": {"error": "used all available credits"}}
    with pytest.raises(SystemExit) as e:
        R.run_generation(post, lambda u: PNG, ARMS, 4, str(tmp_path), sleep=lambda s: None)
    assert "xai_error" in str(e.value) and "used all available credits" in str(e.value) and "$0.00" in str(e.value)


def test_short_answers_get_a_bounded_top_up_then_stop(tmp_path):
    post, calls = proxy(n_returned=1)       # one picture however many are asked for
    with pytest.raises(SystemExit) as e:
        R.run_generation(post, lambda u: PNG, ARMS, 41, str(tmp_path), sleep=lambda s: None)
    assert len(calls) == 22 + R.MAX_TOPUP_CALLS                 # the plan, then three more for the first arm, then stop
    assert "top-up" in str(e.value)


def test_scoring_writes_blind_copies_and_counts_dropped_faces_by_arm(tmp_path, monkeypatch):
    import json, random
    rng = random.Random(1)
    for tag in ("control", "treatment"):
        for i in range(4):
            (tmp_path / f"{tag}_{i:03d}.png").write_bytes(PNG)

    def fake_scorer():
        def score(path):
            if os.path.basename(path) == "treatment_003.png":
                return None                                     # no face found in one treatment picture
            return {"detail_mf_norm": rng.random(), "noise_hf": rng.random(), "sat_mean": rng.random()}
        return score

    monkeypatch.setattr(R, "scorer", fake_scorer)
    monkeypatch.setattr(sys, "argv", ["realism_ab.py", "--score-only", str(tmp_path)])
    R.main()
    out = json.load(open(tmp_path / "ab_result.json"))
    assert out["droppedNoFace"] == 1 and out["droppedNoFaceByArm"] == {"control": 0, "treatment": 1}
    key = json.load(open(tmp_path / "blind_key.json"))
    blind = sorted(os.listdir(tmp_path / "blind"))
    assert blind == sorted(name + ".png" for name in key)       # the pictures exist under names that do not say the arm
    assert not any("control" in b or "treatment" in b for b in blind)
