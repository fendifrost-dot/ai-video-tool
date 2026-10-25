"""The provisional YSL mask catalog scores from its own rules and cannot launch a GPU job.
No weights, no network, no clip. Run: python -m pytest scripts/edit/tests/test_ysl_mask_benchmark.py"""
import json, os, sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
EDIT = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(EDIT, "..", ".."))
sys.path.insert(0, EDIT)
import ysl_mask_benchmark as Y  # noqa: E402
import segmenters as S  # noqa: E402

SUMMARY = os.path.join(ROOT, "docs", "research", "results", "2026-10-23-sam3-person-masks", "c044", "mediapipe", "summary.json")


@pytest.fixture(scope="module")
def catalog():
    return Y.load_catalog()


@pytest.fixture(scope="module")
def rows(catalog):
    return Y.select(catalog)


def test_catalog_is_provisional_and_free(catalog):
    assert catalog["status"] == "PROVISIONAL" and catalog["frozen"] is False
    assert catalog["actual_cost_usd"] == 0
    assert catalog["lineage"]["source_sha256"] == "MISSING"
    assert catalog["lineage"]["per_item_sha256"] == "MISSING"
    assert catalog["default_segmenter"] == "mediapipe" == S.DEFAULT_SEGMENTER
    assert "face/hair/skin" in catalog["face_protection"]["required_proof"]
    blob = json.dumps(catalog)
    assert "https://github.com/fendifrost-dot/fendi-control-center/issues/78" in blob
    assert not any(len(part) == 64 and all(ch in "0123456789abcdef" for ch in part) for part in blob.split('"'))


def test_selection_covers_the_named_defects(rows):
    chosen = {row["slot"]: row["winner"][3] for row in rows if row.get("selected")}
    assert len(chosen) >= 5
    assert len({item["id"] for item in chosen.values()}) == len(chosen)
    assert chosen["missing_black_shoe"]["id"] == "shoe-floor-c044"
    assert chosen["missing_black_shoe"]["category"] == "segmentation"
    assert chosen["black_halo_dark_rim"]["baseline_kind"] == "veed"
    assert chosen["black_halo_dark_rim"]["mask_compare"] == "sam3_vs_veed_not_mediapipe"
    assert chosen["double_silhouette"]["category"] == "compositing"
    assert chosen["small_face_landmarker"]["id"] == "small-face-c044"
    assert chosen["profile_face_manual"]["id"] == "profile-c009-clip-face"
    assert chosen["edge_flicker_encode"]["category"] == "generation"
    assert chosen["edge_flicker_generative_hold"]["category"] == "generation"
    assert chosen["protected_brim"]["sam3_pass_is_not"]
    assert "edge_flicker_mask_temporal" not in chosen
    assert {item["category"] for item in chosen.values()} >= {"segmentation", "generation", "compositing"}
    for item in chosen.values():
        assert item["source_asset_id"]
        assert item["frames"] or item["time_window"]
        assert item["baseline_kind"] != "none"


def test_margins_and_ceiling(rows):
    by_slot = {row["slot"]: row for row in rows}
    shoe = by_slot["missing_black_shoe"]
    assert shoe["runner"][3]["id"] == "shoe-wall-blob-c044"
    assert shoe["margin"] == 2 and shoe["confidence"] == "Med"
    assert by_slot["profile_face_manual"]["evidence_ceiling"] is True
    assert by_slot["edge_flicker_encode"]["evidence_ceiling"] is False
    assert by_slot["edge_flicker_mask_temporal"]["selected"] is False
    hold = by_slot["edge_flicker_generative_hold"]
    assert hold["runner"] is None and hold["margin"] is None and hold["confidence"] == "Low"


def test_parked_generation_is_not_selected(catalog, rows):
    parked = {item["id"] for item in catalog["parked_generation"]}
    assert {"glasses-kept", "mouth-lipsync-35c85578", "garment-is-genjutsu-rebuild"} <= parked
    selected = {item["id"] for item in Y.selected_items(rows)}
    assert parked.isdisjoint(selected)


def test_song_time_is_derived_not_a_new_measurement():
    item = next(c for c in Y.load_catalog()["candidates"] if c["id"] == "shoe-floor-c044")
    times = Y.song_times(item)
    assert times[50] == pytest.approx(75.885 + 50 / 59.94005994005994)
    assert times[90] == pytest.approx(75.885 + 90 / 59.94005994005994)


def test_mediapipe_summary_has_no_sam3_metrics_yet():
    with open(SUMMARY) as f:
        summary = json.load(f)
    got = Y.comparable_from_summary(summary)
    assert got["sam3_matte"] is None
    assert [row["frame"] for row in got["frames"]] == [0, 50, 90, 180]
    assert all(row["face"] == "head zoom x4" for row in got["frames"])
    assert all(row["iou"] is None and row["sam3_person_px"] is None for row in got["frames"])
    assert got["frames"][1]["mediapipe_person_px"] == 79274


def test_temporal_iou_on_a_synthetic_matte():
    same = np.ones((2, 2), dtype=np.float32)
    assert Y.temporal_iou([same, same]) == [1.0]
    empty = np.zeros((2, 2), dtype=np.float32)
    assert Y.temporal_iou([same, empty]) == [0.0]


def test_launch_is_refused_and_plan_spends_nothing(capsys):
    assert Y.main(["--launch-gpu"]) == 3
    err = capsys.readouterr().out
    assert "REFUSED" in err and "Fal" in err and "Hugging Face" in err
    assert "huggingface_hub" not in sys.modules
    assert Y.main(["--plan"]) == 0
    plan = capsys.readouterr().out
    assert "Actual cost so far: $0.00" in plan
    assert "APPROVAL sam3-c044-take" in plan and "APPROVAL sam3-c009-take-optional" in plan
    assert "REFUSING Fal" in plan
    assert "hf_" not in plan


def test_scorecard_matches_the_generator():
    text = Y.render_scorecard()
    with open(Y.SCORECARD_PATH) as f:
        assert f.read() == text
    assert "PROVISIONAL" in text and "MISSING" in text
    assert "issues/78" in text
    assert "`shoe-floor-c044`" in text and "`flicker-hat-gop-c044`" in text
