"""Gate = Python port of flowBreak.ts. These assertions mirror the TS test
expectations so the two sides can never silently diverge."""
from workers.warp_worker.gate import Thresholds, plan_reanchors, should_reanchor
from workers.warp_worker.interfaces import FlowMetrics


def test_no_metrics_never_reanchors():
    m = FlowMetrics(index=5)
    assert should_reanchor(m).reanchor is False


def test_low_confidence_triggers():
    d = should_reanchor(FlowMetrics(index=1, confidence=0.4))
    assert d.reanchor is True
    assert any("low_confidence" in r for r in d.reasons)


def test_confidence_at_threshold_does_not_trigger():
    # threshold is strict "<", so exactly minConfidence is fine
    assert should_reanchor(FlowMetrics(index=1, confidence=0.6)).reanchor is False


def test_rotation_and_occlusion_and_cut():
    d = should_reanchor(FlowMetrics(index=1, rotationDeg=40, occlusionRatio=0.5, sceneCut=True))
    assert d.reanchor is True
    assert "scene_cut" in d.reasons
    assert any("large_rotation" in r for r in d.reasons)
    assert any("occlusion" in r for r in d.reasons)


def test_plan_skips_existing_anchors_and_sorts():
    metrics = [
        FlowMetrics(index=3, confidence=0.2),
        FlowMetrics(index=1, confidence=0.1),
        FlowMetrics(index=2, confidence=0.1),  # already an anchor -> skipped
    ]
    plan = plan_reanchors(metrics, existing_keyframes=[2])
    assert plan.reanchor_at == [1, 3]
    assert 2 not in plan.reanchor_at
    assert set(plan.reasons.keys()) == {1, 3}


def test_custom_thresholds():
    t = Thresholds(min_confidence=0.9, max_rotation_deg=10, max_occlusion_ratio=0.1)
    assert should_reanchor(FlowMetrics(index=1, confidence=0.85), t).reanchor is True
