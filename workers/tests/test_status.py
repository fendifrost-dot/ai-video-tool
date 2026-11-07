"""Persisted status: resume / skip-completed / atomic write / rollup."""
import os

from workers.warp_worker.status import DONE, FAILED, BLOCKED_REANCHOR, FrameStatus, JobStatus


def test_persist_and_resume(tmp_path):
    p = os.path.join(tmp_path, "status.json")
    job = JobStatus.load_or_create(p, "shot", 3)
    job.set_frame(FrameStatus(index=0, status=DONE, kind="anchor"))
    job.flush()
    assert os.path.exists(p)

    # reload -> resume sees the done frame
    job2 = JobStatus.load_or_create(p, "shot", 3)
    assert job2.is_done(0) is True
    assert job2.is_done(1) is False


def test_resume_rejects_shape_mismatch(tmp_path):
    p = os.path.join(tmp_path, "status.json")
    job = JobStatus.load_or_create(p, "shot", 3)
    job.set_frame(FrameStatus(index=0, status=DONE))
    job.flush()
    # different frame_count -> fresh (do not resume a different shot geometry)
    job2 = JobStatus.load_or_create(p, "shot", 5)
    assert job2.is_done(0) is False


def test_rollup_counts_and_completion(tmp_path):
    p = os.path.join(tmp_path, "status.json")
    job = JobStatus.load_or_create(p, "shot", 3)
    job.set_frame(FrameStatus(index=0, status=DONE))
    job.set_frame(FrameStatus(index=1, status=DONE))
    job.set_frame(FrameStatus(index=2, status=BLOCKED_REANCHOR))
    r = job.rollup()
    assert r["done"] == 2 and r["blocked"] == 1 and r["complete"] is False
    assert job.data["job_status"] == "incomplete"

    job.set_frame(FrameStatus(index=2, status=DONE))
    r = job.rollup()
    assert r["complete"] is True and job.data["job_status"] == "ready"


def test_atomic_write_leaves_no_tmp(tmp_path):
    p = os.path.join(tmp_path, "status.json")
    job = JobStatus.load_or_create(p, "shot", 1)
    job.set_frame(FrameStatus(index=0, status=FAILED, error="boom"))
    job.flush()
    leftovers = [f for f in os.listdir(tmp_path) if f.endswith(".tmp")]
    assert leftovers == []
