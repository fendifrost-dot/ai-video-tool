"""Review-gate verdict logic: BLOCKED dimensions never yield PASS; a hard FAIL
dominates; a fully-supplied clean clip PASSes."""
import numpy as np

from workers.warp_worker.review import score


def _frames(n=6, h=60, w=40):
    rng = np.random.RandomState(1)
    return [rng.randint(0, 255, (h, w, 3), dtype=np.uint8) for _ in range(n)]


def _base_qa(flicker_ratio=0.95, edge_halo=0.3, id_drift=0.02, stripe_cv=0.02):
    return {
        "flicker_ratio": flicker_ratio,
        "identity_drift_outside": id_drift,
        "edge_halo": edge_halo,
        "stripe_width_cv": stripe_cv,
    }


def test_blocked_inputs_cannot_pass():
    src = _frames(); comp = _frames()
    r = score("s", src, comp, [], {}, _base_qa(), have_kolors=False, have_grok=False)
    assert r.outcome == "CONDITIONAL PASS"
    names = {d.name: d.status for d in r.dims}
    assert names["product_fidelity"] == "BLOCKED"
    assert names["base_frame_quality"] == "BLOCKED"
    assert "product_fidelity" in "\n".join(r.blocked)


def test_hard_fail_dominates():
    src = _frames(); comp = _frames()
    # very high flicker -> temporal_stability FAIL -> overall FAIL
    r = score("s", src, comp, [], {}, _base_qa(flicker_ratio=2.0, edge_halo=20.0),
              have_kolors=True, have_grok=True)
    assert r.outcome == "FAIL"


def test_full_inputs_await_human_review():
    src = _frames(); comp = _frames()
    r = score("s", src, comp, [], {"0": None}, _base_qa(),
              have_kolors=True, have_grok=True)
    # inputs present, machinery clean, but perceptual dims need sign-off
    assert r.outcome == "CONDITIONAL PASS"
    names = {d.name: d.status for d in r.dims}
    assert names["product_fidelity"] == "REVIEW"
    assert names["base_frame_quality"] == "REVIEW"


def test_human_signoff_reaches_pass():
    src = _frames(); comp = _frames()
    r = score("s", src, comp, [], {"0": None}, _base_qa(),
              have_kolors=True, have_grok=True, human_ok=True)
    assert r.outcome == "PASS"
    assert r.isolated_weakness == ""


def test_five_questions_and_dims_present():
    r = score("s", _frames(), _frames(), [], {}, _base_qa(), have_kolors=False, have_grok=False)
    assert len(r.questions) == 5
    assert {d.name for d in r.dims} == {
        "base_frame_quality", "temporal_stability", "product_fidelity",
        "occlusion_correctness", "artifact_severity",
    }
