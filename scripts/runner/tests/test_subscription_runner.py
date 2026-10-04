#!/usr/bin/env python3
"""
The subscription runner's rules — what it may do with a row, and that nothing is sent twice or as something else.
No CLI, no network, nothing spent.

    python3 -m pytest scripts/runner/tests -q
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import higgsfield_subscription_runner as R  # noqa: E402

OP = {"verified": True, "avt_model": "seedance-2.5-reference", "job_type": "seedance_x", "params": {"prompt": "prompt", "duration": "duration", "resolution": "resolution", "aspect_ratio": "aspect-ratio", "generate_audio": None},
      "video_reference_flag": "--video-references", "image_reference_flag": "--image-references"}


def row(**over):
    billing = {"route": "subscription", "source": "higgsfield_plan_credits", **over.pop("billing", {})}
    r = {"id": "r1", "status": "queued", "external_job_id": None, "result_asset_id": None,
         "request_payload_json": {"promptText": "a low hero angle", "modelVariant": "seedance-2.5-reference", "duration": 4, "aspectRatio": "9:16",
                                  "settings": {"route": "seedance_ref", "resolution": "720p", "sourcePath": "u/p/src.mp4", "billing": billing}}}
    r.update(over)
    return r


def test_an_api_job_is_never_touched():
    assert R.next_step(row(billing={"route": "api"})) == "not_ours"


def test_a_fresh_job_is_submitted_then_polled_then_done():
    assert R.next_step(row()) == "submit"
    assert R.next_step(row(external_job_id="hf1", status="running")) == "poll"
    assert R.next_step(row(external_job_id="hf1", status="succeeded", result_asset_id="a1")) == "done"


def test_a_started_submit_without_a_job_id_is_never_submitted_again():
    assert R.next_step(row(billing={"runner": {"submitStartedAt": "2026-10-04T02:00:00Z"}})) == "unreconciled"


def test_nothing_is_substituted():
    cfg = {"operations": {"seedance_ref": dict(OP, verified=False)}}
    assert R.operation_for(row(), cfg)[0] is None
    assert R.operation_for(row(), {"operations": {}})[0] is None
    other = row(); other["request_payload_json"]["modelVariant"] = "kling-2.5-turbo-pro-i2v"
    op, why = R.operation_for(other, {"operations": {"seedance_ref": OP}})
    assert op is None and "kling" in why
    assert R.operation_for(row(), {"operations": {"seedance_ref": OP}})[0] == OP


def test_the_request_is_sent_as_recorded():
    args = R.cli_args(OP, row(), {"video": "/tmp/s.mp4"})
    assert args == ["seedance_x", "--prompt", "a low hero angle", "--duration", "4", "--resolution", "720p", "--aspect-ratio", "9:16", "--video-references", "/tmp/s.mp4"]


def test_reading_the_cli():
    assert R.job_id_of({"id": "abc"}) == "abc" and R.job_id_of([{"job_id": "x"}]) == "x" and R.job_id_of({"error": "no"}) is None
    assert R.state_of({"status": "completed", "results": [{"url": "https://cdn/x.mp4"}]}) == "succeeded"
    assert R.state_of({"status": "queued"}) == "running" and R.state_of({"status": "nsfw"}) == "failed"
    assert R.credits_of({"credits": 12}) == 12.0 and R.credits_of({"cost": {"credits": "7.5"}}) == 7.5 and R.credits_of({}) is None
