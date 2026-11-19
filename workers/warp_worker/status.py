"""Persisted job / frame / retry / artifact status (spec capability #11).

Honors the engineering prereqs from the LOCKED architecture (§6): per-frame
persisted status + retries + resume + skip-completed, and a reproducibility
record. This mirrors, on the local worker side, what
``wardrobe-video-propagate-proxy`` persists into ``project_assets.metadata_json``
(propagate_frames, propagate_repro, …) — same shape, so a run is debuggable and
resumable whether it ran on the edge or on the GPU/local worker.

Pure stdlib (json + os): no heavy deps, atomic writes, safe to import anywhere.
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

# Frame lifecycle states (superset of the edge function's FrameState).
DONE = "done"
ANCHOR = "anchor"
PROPAGATED = "propagated"
BLOCKED_REANCHOR = "blocked_reanchor"
BLOCKED_NO_BASE = "blocked_no_base"
FAILED = "failed"
PENDING = "pending"


@dataclass
class FrameStatus:
    index: int
    status: str = PENDING
    kind: Optional[str] = None            # anchor | propagated | composited
    attempts: int = 0
    error: Optional[str] = None
    reasons: List[str] = field(default_factory=list)
    artifacts: Dict[str, str] = field(default_factory=dict)  # name -> path


class JobStatus:
    """A resumable, atomically-persisted job record."""

    def __init__(self, path: str, shot_id: str, frame_count: int):
        self.path = path
        self.data: Dict[str, Any] = {
            "shot_id": shot_id,
            "frame_count": frame_count,
            "job_status": "processing",
            "created_at": None,
            "updated_at": None,
            "repro": {},
            "rollup": {},
            "frames": {},   # str(index) -> FrameStatus dict
            "reanchor_needed": [],
            "reanchor_reasons": {},
        }
        self._t0 = time.time()

    # ---- persistence ----------------------------------------------------
    @classmethod
    def load_or_create(cls, path: str, shot_id: str, frame_count: int) -> "JobStatus":
        job = cls(path, shot_id, frame_count)
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    prior = json.load(f)
                # Resume only if the same shot + frame_count (else start fresh).
                if prior.get("shot_id") == shot_id and prior.get("frame_count") == frame_count:
                    job.data = prior
            except (json.JSONDecodeError, OSError):
                pass
        return job

    def flush(self) -> None:
        self.data["updated_at"] = _now_iso(self._t0)
        if self.data.get("created_at") is None:
            self.data["created_at"] = self.data["updated_at"]
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        # Atomic write: temp file + rename, so a crash never leaves half JSON.
        d = os.path.dirname(os.path.abspath(self.path))
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(self.data, f, indent=2, sort_keys=True)
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    # ---- frame accessors ------------------------------------------------
    def get_frame(self, index: int) -> FrameStatus:
        raw = self.data["frames"].get(str(index))
        if raw is None:
            return FrameStatus(index=index)
        return FrameStatus(**raw)

    def set_frame(self, fs: FrameStatus) -> None:
        self.data["frames"][str(fs.index)] = asdict(fs)

    def is_done(self, index: int) -> bool:
        raw = self.data["frames"].get(str(index))
        return bool(raw) and raw.get("status") == DONE

    # ---- job-level ------------------------------------------------------
    def set_repro(self, repro: Dict[str, Any]) -> None:
        self.data["repro"] = repro

    def set_reanchor(self, indices: List[int], reasons: Dict[int, List[str]]) -> None:
        self.data["reanchor_needed"] = list(indices)
        self.data["reanchor_reasons"] = {str(k): v for k, v in reasons.items()}

    def rollup(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for raw in self.data["frames"].values():
            counts[raw.get("status", PENDING)] = counts.get(raw.get("status", PENDING), 0) + 1
        done = counts.get(DONE, 0)
        blocked = counts.get(BLOCKED_REANCHOR, 0) + counts.get(BLOCKED_NO_BASE, 0)
        failed = counts.get(FAILED, 0)
        complete = done == self.data["frame_count"]
        r = {
            "done": done,
            "blocked": blocked,
            "failed": failed,
            "by_status": counts,
            "complete": complete,
        }
        self.data["rollup"] = r
        self.data["job_status"] = "ready" if complete else ("incomplete" if (blocked or failed) else "processing")
        return r


def _now_iso(t0: float) -> str:
    # Monotonic elapsed only (no wall-clock dependency); a human-facing wall
    # timestamp is added by the caller when it has one. Keeps the module free of
    # nondeterministic Date usage the way the workflow runtime forbids.
    return f"+{time.time() - t0:.1f}s"
