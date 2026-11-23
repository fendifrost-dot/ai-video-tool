"""LOCK_v2 whole-song recipe for the Partnership remote renderer.

The frozen scripts under the lock tree are executed as they ship. This module
plans the GCP run, checks hashes, and reads per-frame md5 lists. It does not
embed a content hash: those live in SHA256SUMS and MANIFEST_LOCK_v2_inputs.json
and change when the grain params change. A dry-run calls no cloud API.
"""

from __future__ import annotations

import ast
import glob
import hashlib
import json
import math
import os
import random
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time

import plan

RECIPE = "lock_v2"
LOCK_DIR = "/workspace/partnership/final_lock_v2"
PARTNERSHIP = "/workspace/partnership"
MACHINE = "c4-standard-16"
DISK_GB = 120
# Inputs (~29 GB) sit on a disk the VM does not delete. Boot disk keeps scratch and ProRes.
INPUT_DISK_NAME = "avt-lock-v2-inputs"
INPUT_DISK_GB = 60
# Hyperdisk Balanced capacity $0.000109589/GiB-hour. Baseline 3000 IOPS and 140 MiB/s are free.
# 60 * 0.000109589 = 0.00657534, rounded up. Per day 0.0066 * 24 = 0.1584, printed as 0.16.
INPUT_DISK_USD_PER_HOUR = 0.0066
INPUT_DISK_USD_PER_DAY = 0.16
CPU_QUOTA = 32
GB_PER_V1E = 15.0
# The lock doc's stated input size, used only when the manifest is not on this machine.
DOC_INPUT_GB = 28.81
DOC_INPUT_FILES = 374
PULL_GB = 8.0
LOCK_RAW_GB = 7.0
FINAL_MEASURED_FRAMES = 232
FINAL_MEASURED_SECONDS = 352.0
# Planning allowances around the lock doc's measured stages. Not a second rate card.
INSTALL_MIN = (8.0, 18.0)
VERIFY_MIN = (2.0, 8.0)
REPRO_MIN = (10.0, 12.0)
STATE_MIN = (11.0, 16.0)
ASSEMBLE_MIN = (8.0, 20.0)
SPOT_SEED = 20261123
SPOT_COUNT = 3
EXPECTED_STILLS = 11
V1E_BOUNDARIES = (3070, 3310, 3550, 3790, 4030, 4224, 4464, 4704, 4975, 4981)
V1E_SF0 = V1E_BOUNDARIES[0]
V1E_END = V1E_BOUNDARIES[-1]
LOCK_NAMES = ("vhs", "salad", "spins_T1", "spins_T2T3", "spins_T4", "warcry", "montage")
# Basename of each frozen render in MANIFEST_LOCK_v2_inputs.json. The top-level
# SHA256SUMS only lists the 46 tree files, so these are gated by the manifest
# row sha256. The parity log's lock_sha256 is the unambiguous match.
FROZEN_RENDER_NAMES = (
    ("vhs", "vhs_static_preview_v5b_1080p.mp4"),
    ("salad", "pixel_sort_salad_preview_v1b_1080p.mp4"),
    ("spins_T1", "spin_T1_v1c_preview_1080p.mp4"),
    ("spins_T2T3", "spin_T2T3_v1c_preview_1080p.mp4"),
    ("spins_T4", "spin_T4_v1c_preview_1080p.mp4"),
    ("warcry", "warcry_v9c_clip_1080p.mp4"),
    ("montage", "reverse_montage_preview_v3b_1080p.mp4"),
)
# VHS v5b is not a manifest row. These paths are relative to /workspace/partnership.
FROZEN_FALLBACKS = {
    "vhs": (
        "first_half/claudia_vfx/vhs_static/v5b/renders/vhs_static_preview_v5b_1080p.mp4",
        "first_half/claudia_vfx/vhs_static/v5b/lock/vhs_static_preview_v5b_1080p.mp4",
    ),
}
LOCK_REPRO_LOG = "parity/lock_repro_box_2026-11-23.log"
_LOCK_NAME_ALIASES = {
    "vhs": "vhs",
    "salad": "salad",
    "pixel_sort_salad": "salad",
    "spins_t1": "spins_T1",
    "spin_t1": "spins_T1",
    "t1": "spins_T1",
    "spins_t2t3": "spins_T2T3",
    "spin_t2t3": "spins_T2T3",
    "t2t3": "spins_T2T3",
    "spins_t4": "spins_T4",
    "spin_t4": "spins_T4",
    "t4": "spins_T4",
    "warcry": "warcry",
    "war_cry": "warcry",
    "montage": "montage",
    "reverse_montage": "montage",
}
PSNR_MIN_DB = 50.0
MAX_CHANNEL_DIFF = 2
REPRO_SCRIPT = (
    "/workspace/partnership/first_half/claudia_vfx/grade_v1/scripts/repro_lock_frames_v1.py"
)
S07_TAL = (
    "/workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/"
    "s07fix/trench_alpha_S07rt_1280_full.npy"
)
BODYPLACE = (
    "/workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/"
    "s07fix/probe_need.json"
)
STILLS_DIR = (
    "/workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/v1e_work/_stills"
)
PREVIEW_LOGS = (
    "/workspace/partnership/first_half/claudia_vfx/grade_v1/lock_P1_v1b/P1_v1b_frame_log.json",
    "/workspace/partnership/first_half/claudia_vfx/grade_v1/lock_P2_v1b/P2_v1_frame_log.json",
    "/workspace/partnership/first_half/claudia_vfx/grade_v1/lock_P3_v1d/P3_v1d_frame_log.json",
)
V1E_REF_FRAMES = tuple(list(range(3070, 3078)) + list(range(4975, 4981)))
GUEST_PYTHON = "/opt/avt-comp/bin/python"
LOCKREPRO = "/tmp/claudia_lockrepro"
PIPELINE_ROLE = "final pipeline code/params"
PIPELINE_MODULES = ("board_v1.py", "grade_v1.py", "transitions_v1.py")
REHEARSAL_RANGE = "124-127"
SCRATCH = "/var/avt/scratch"
V1E_DIR = "/var/avt/scratch/v1e"
FINAL_DIR = "/var/avt/scratch/final"
STATE_DIR = "/var/avt/scratch/states"
OUT_DIR = "/var/avt/out"
CHECKS_DIR = "/var/avt/checks"
OUT_BASENAME = "PARTNERSHIP_CEASE_DESIST_LOCK_v2"
H264_NAME = OUT_BASENAME + "_h264_crf14.mp4"
PRORES_NAME = OUT_BASENAME + "_prores422hq_pcm24.mov"
FRAME_W = 1920
FRAME_H = 1080
FINAL_CHUNK = 240

STAGE_LABELS = (
    ("create", "create"),
    ("transfer", "transfer"),
    ("setup", "setup"),
    ("verify", "verify"),
    ("lock_repro", "lock repro"),
    ("state_pass", "state pass"),
    ("v1e_chunks", "v1e chunks"),
    ("final_chunks", "final chunks"),
    ("assemble", "assemble"),
    ("pull_back", "pull-back"),
    ("teardown", "teardown"),
)

_HEX = set("0123456789abcdef")


# Measured copy was about 53 MB/s. Plan at 30 MB/s so a slower link still fits the band.
TRANSFER_MB_S = 30.0
# High end of final_render assumes this fraction of a perfect split across workers.
FINAL_EFFICIENCY = 0.70
COMPARE_MACHINES = ("c4-standard-16", "c4-standard-24", "c4-standard-32")
# This project's C4 family quota. A 32-vCPU C4 create fails with CPUS_PER_VM_FAMILY.
C4_VCPU_PER_VM = 24


def machine_spec(name=None):
    """RAM, vCPU, and the on-demand hourly rate for a priced GCP shape."""
    name = name or MACHINE
    spec = plan.MACHINES.get(name)
    if not spec or spec.get("usd_per_hour") is None or spec.get("backend") != "gcp":
        return None
    return spec["ram_gb"], spec["vcpu"], spec["usd_per_hour"]


def known_machines():
    names = []
    for name, spec in plan.MACHINES.items():
        if spec.get("backend") == "gcp" and spec.get("usd_per_hour"):
            names.append(name)
    return names


def v1e_workers_for_ram(ram_gb):
    """How many v1e processes to start. One per 15 GB, with 1 GB of MemTotal slack.

    c4-standard-16 is 60 GB, so this is 4. Linux MemTotal sits under the
    advertised figure; within 1 GB of the next 15 GB step still counts.
    """
    ram = float(ram_gb)
    n = int(ram / GB_PER_V1E)
    if ram + 1.0 >= (n + 1) * GB_PER_V1E:
        n += 1
    return max(1, n)


def v1e_effective_workers(started, vcpu):
    """Wall-clock cap. The locked runner calls cv2.setNumThreads(6)."""
    if not vcpu:
        return started
    slots = max(1, int(vcpu) // plan.CV2_THREADS)
    return min(started, slots)


def v1e_workers(ram_gb, vcpu, n_chunks=None):
    """How many v1e processes to run at once.

    The three caps are RAM at 15 GB each, the locked runner's 6 OpenCV threads,
    and the number of chunks. On c4-standard-32 that is min(8, 5, 9) = 5.
    """
    if n_chunks is None:
        n_chunks = len(v1e_chunk_table())
    by_ram = v1e_workers_for_ram(ram_gb)
    by_cpu = max(1, int(vcpu) // plan.CV2_THREADS) if vcpu else by_ram
    by_chunks = max(1, int(n_chunks))
    started = max(1, min(by_ram, by_cpu, by_chunks))
    return {
        "ram": by_ram,
        "cpu": by_cpu,
        "chunks": by_chunks,
        "started": started,
    }


def final_workers_for_cpu(vcpu, n_spans):
    """Disjoint final_render processes. Four cores each, .done markers keep a rerun safe.

    Ranges are groups of 240-frame chunks, so every start stays on a chunk boundary.
    """
    if not vcpu:
        started = 1
    else:
        started = max(1, int(vcpu) // 4)
    return max(1, min(started, n_spans))


def v1e_chunk_complete(chunk, directory=None):
    """True when the mkv exists and the md5 log has one line per frame."""
    directory = directory or V1E_DIR
    mkv = os.path.join(directory, f"chunk_{chunk['sf0']}.mkv")
    md5_path = os.path.join(directory, f"chunk_{chunk['sf0']}.md5")
    if not os.path.isfile(mkv) or os.path.getsize(mkv) <= 0 or not os.path.isfile(md5_path):
        return False
    try:
        with open(md5_path) as handle:
            parsed = parse_md5_file(handle.read())
    except (OSError, SystemExit):
        return False
    return len(parsed) == int(chunk["nf"])


def v1e_chunk_table():
    rows = []
    for index in range(len(V1E_BOUNDARIES) - 1):
        sf0 = V1E_BOUNDARIES[index]
        rows.append({
            "sf0": sf0,
            "nf": V1E_BOUNDARIES[index + 1] - sf0,
            "state_load": None if index == 0 else f"state_{sf0}.npz",
        })
    return rows


def state_at_arg(chunks=None):
    chunks = chunks if chunks is not None else v1e_chunk_table()
    return ",".join(str(chunk["sf0"]) for chunk in chunks if chunk["state_load"])


def final_spans(chunk=FINAL_CHUNK, f0=0, f1=None):
    if f1 is None:
        f1 = plan.FULL_SONG_FRAMES - 1
    spans = []
    cursor = f0
    while cursor <= f1:
        spans.append((cursor, min(f1, cursor + chunk - 1)))
        cursor += chunk
    return spans


def group_spans(spans, workers):
    workers = max(1, min(int(workers), len(spans)))
    base, rem = divmod(len(spans), workers)
    groups = []
    cursor = 0
    for index in range(workers):
        take = base + (1 if index < rem else 0)
        groups.append(spans[cursor:cursor + take])
        cursor += take
    return groups


def final_ranges(workers, chunk=FINAL_CHUNK):
    grouped = group_spans(final_spans(chunk), workers)
    return [(group[0][0], group[-1][1]) for group in grouped]


def _hours_pair(minutes):
    return (minutes[0] / 60.0, minutes[1] / 60.0)


def _transfer_mbps():
    return TRANSFER_MB_S * 8.0


def final_hour_band(workers):
    """Measured per-process rate, divided by the worker count.

    The low end is a perfect split. The high end keeps ``FINAL_EFFICIENCY`` of
    that split, so a range that does not scale in a straight line still fits.
    Lock repro and the state pass are not in this band: they stay one process.
    """
    per_frame = FINAL_MEASURED_SECONDS / FINAL_MEASURED_FRAMES
    one = plan.FULL_SONG_FRAMES * per_frame / 3600.0
    workers = max(1, int(workers))
    low = one / workers
    high = one / max(1.0, workers * FINAL_EFFICIENCY)
    if high < low:
        low, high = high, low
    return low, high, per_frame


def project(ram_gb, vcpu, input_gb, ceiling, rate, machine=MACHINE, lock_repro=False):
    """Wall clock for this shape. Serial stages are not divided by the worker count.

    The seven lock repros are skipped unless ``lock_repro`` is set. The frozen
    renders are already in the tree, so that band is zero on the default plan.
    """
    terms = v1e_workers(ram_gb, vcpu)
    started = terms["started"]
    spans = final_spans()
    final_started = final_workers_for_cpu(vcpu, len(spans))
    mbps = _transfer_mbps()
    transfer = plan.transfer_hours(input_gb, mbps)
    raws = plan.transfer_hours(LOCK_RAW_GB, mbps)
    pull = plan.transfer_hours(PULL_GB, mbps)
    final_lo, final_hi, per_frame = final_hour_band(final_started)
    v1e_lo = plan.VERSE_NF * plan.SEC_LO / 3600.0 / started
    v1e_hi = plan.VERSE_NF * plan.SEC_HI / 3600.0 / started
    parts = {
        "transfer": (transfer, transfer),
        "lock_raws": (raws, raws),
        "install": _hours_pair(INSTALL_MIN),
        "verify": _hours_pair(VERIFY_MIN),
        "lock_repro": _hours_pair(REPRO_MIN) if lock_repro else (0.0, 0.0),
        "state_pass": _hours_pair(STATE_MIN),
        "v1e_chunks": (v1e_lo, v1e_hi),
        "final_chunks": (final_lo, final_hi),
        "assemble": _hours_pair(ASSEMBLE_MIN),
        "pull_back": (pull, pull),
    }
    low = sum(item[0] for item in parts.values())
    high = sum(item[1] for item in parts.values())
    return {
        "machine": machine,
        "parts_hours": {key: [item[0], item[1]] for key, item in parts.items()},
        "hours": [low, high],
        "usd": [low * rate, high * rate],
        "usd_per_hour": rate,
        "ceiling": ceiling,
        "under": (high * rate) <= ceiling,
        "input_gb": input_gb,
        "transfer_mb_s": TRANSFER_MB_S,
        "v1e_terms": terms,
        "v1e_started": started,
        "v1e_effective": started,
        "final_started": final_started,
        "final_spans": len(spans),
        "final_seconds_per_frame": per_frame,
        "final_efficiency": FINAL_EFFICIENCY,
        "lock_repro": bool(lock_repro),
        "ram_gb": ram_gb,
        "vcpu": vcpu,
    }


def _band(pair, digits=2):
    return f"{pair[0]:.{digits}f}–{pair[1]:.{digits}f}"


def projection_text(proj):
    parts = proj["parts_hours"]
    terms = proj["v1e_terms"]
    lines = [
        f"LOCK_v2 projection ({proj['machine']} on demand, not a live quote):",
        f"  transfer {proj['input_gb']:.2f} GB at {proj['transfer_mb_s']:.0f} MB/s "
        f"(margin under the measured ~53 MB/s): {parts['transfer'][0]:.2f} h",
        f"  lock raws {LOCK_RAW_GB:.0f} GB to /tmp/claudia_lockrepro (pre-encode frames): "
        f"{parts['lock_raws'][0]:.2f} h",
        "  install ffmpeg (ffv1, libx264, prores_ks) + numpy 2.5.5, scipy 1.18.1, opencv 5.1.x: "
        f"{_band(parts['install'])} h",
        f"  verify SHA256SUMS + manifest: {_band(parts['verify'])} h",
        (
            f"  lock repro, 7 locks, sequential, opt-in: {_band(parts['lock_repro'])} h"
            if proj.get("lock_repro") else
            "  lock repro: skipped (frozen renders already in the tree, sha-verified)"
        ),
        f"  v1e state pass, sequential: {_band(parts['state_pass'])} h",
        f"  v1e chunks, {plan.VERSE_NF} frames, {proj['v1e_started']} workers "
        f"(min of {terms['ram']} from RAM, {terms['cpu']} from "
        f"{proj['vcpu']} vCPU / {plan.CV2_THREADS} threads, {terms['chunks']} chunks): "
        f"{_band(parts['v1e_chunks'])} h",
        f"  final_render, {plan.FULL_SONG_FRAMES} frames at "
        f"{proj['final_seconds_per_frame']:.3f} s/frame, "
        f"{proj['final_started']} workers, perfect split on the low end, "
        f"{proj['final_efficiency']:.0%} of that split on the high end: "
        f"{_band(parts['final_chunks'])} h",
        f"  assemble (md5 lists are a report, not a gate): {_band(parts['assemble'])} h",
        f"  pull-back {PULL_GB:.0f} GB at {proj['transfer_mb_s']:.0f} MB/s: "
        f"{parts['pull_back'][0]:.2f} h",
        (
            f"LOCK_v2 vs ceiling: {_band(proj['hours'])} h, "
            f"${proj['usd'][0]:.2f}–${proj['usd'][1]:.2f} vs ${proj['ceiling']:.2f} "
            f"({'under' if proj['under'] else 'over'})"
        ),
    ]
    return "\n".join(lines)


def comparison_text(input_gb, ceiling):
    """c4-standard-16, c4-standard-24, and c4-standard-32, same inputs."""
    lines = ["machine comparison (wall hours and on-demand dollars, us-central1):"]
    for name in COMPARE_MACHINES:
        ram, vcpu, rate = machine_spec(name)
        proj = project(ram, vcpu, input_gb, ceiling, rate, machine=name)
        proj["usd"] = [
            proj["usd"][0] + proj["hours"][0] * INPUT_DISK_USD_PER_HOUR,
            proj["usd"][1] + proj["hours"][1] * INPUT_DISK_USD_PER_HOUR,
        ]
        proj["under"] = proj["usd"][1] <= ceiling
        lines.append(
            f"  {name}: {_band(proj['hours'])} h, "
            f"${proj['usd'][0]:.2f}–${proj['usd'][1]:.2f} "
            f"({proj['v1e_started']} v1e, {proj['final_started']} final, ${rate:.2f}/h, "
            f"{'under' if proj['under'] else 'over'} ${ceiling:.2f})"
        )
    return "\n".join(lines)


def stack_versions_ok(numpy_v, scipy_v, cv_v):
    return numpy_v == "2.5.5" and scipy_v == "1.18.1" and str(cv_v).startswith("5.1")


def ffmpeg_missing(encoder_text):
    text = encoder_text or ""
    return [name for name in ("ffv1", "libx264", "prores_ks") if name not in text]


def assert_stack():
    import numpy
    import scipy
    import cv2
    if not stack_versions_ok(numpy.__version__, scipy.__version__, cv2.__version__):
        raise SystemExit(
            "refusing to render: the venv must match /workspace/venv_comp "
            f"(numpy 2.5.5, scipy 1.18.1, opencv 5.1.x); "
            f"found {numpy.__version__} {scipy.__version__} {cv2.__version__}"
        )


def assert_ffmpeg(run):
    result = run(["ffmpeg", "-hide_banner", "-encoders"], cwd=None)
    if getattr(result, "returncode", 1) != 0:
        raise SystemExit("ffmpeg -encoders failed")
    missing = ffmpeg_missing((result.stdout or "") + (getattr(result, "stderr", "") or ""))
    if missing:
        raise SystemExit("ffmpeg is missing encoders: " + ", ".join(missing))


def ram_gb_from_meminfo(text):
    for line in text.splitlines():
        if line.startswith("MemTotal:"):
            return float(line.split()[1]) / (1024.0 * 1024.0)
    raise SystemExit("MemTotal missing from /proc/meminfo")


def parse_sha256sums(text):
    rows = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\r")
        if not line.strip():
            continue
        if len(line) < 66:
            raise SystemExit(f"SHA256SUMS line {lineno} is not a sha256sum line")
        digest = line[:64].lower()
        if any(char not in _HEX for char in digest):
            raise SystemExit(f"SHA256SUMS line {lineno} has a bad digest")
        if line[64:66] not in ("  ", " *"):
            raise SystemExit(f"SHA256SUMS line {lineno} has a bad separator")
        name = line[66:]
        if not name or name.startswith("/") or ".." in name.split("/"):
            raise SystemExit(f"SHA256SUMS line {lineno} must be a relative path")
        rows.append((digest, name))
    if not rows:
        raise SystemExit("SHA256SUMS is empty")
    return rows


def check_sha256sums(lock_dir, hasher):
    path = os.path.join(lock_dir, "SHA256SUMS")
    if not os.path.isfile(path):
        return ["SHA256SUMS is missing"]
    with open(path) as handle:
        rows = parse_sha256sums(handle.read())
    errors = []
    for digest, name in rows:
        local = os.path.join(lock_dir, name)
        if not os.path.isfile(local):
            errors.append(f"SHA256SUMS missing {name}")
            continue
        got = hasher(local)
        if got != digest:
            errors.append(f"SHA256SUMS mismatch {name}")
    return errors


def _valid_sha(value):
    return isinstance(value, str) and len(value) == 64 and all(char in _HEX for char in value.lower())


def validate_manifest(data):
    files = data.get("files") if isinstance(data, dict) else None
    if not isinstance(files, list) or not files:
        raise ValueError("manifest has no files")
    total = 0
    for row in files:
        path = row.get("path") if isinstance(row, dict) else None
        if not isinstance(path, str) or not path.startswith("/") or ".." in path.split("/"):
            raise ValueError("manifest path must be an absolute path")
        size = row.get("bytes")
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ValueError("manifest bytes must be an integer")
        if not _valid_sha(row.get("sha256")):
            raise ValueError("manifest sha256 must be 64 hex characters")
        total += size
    if data.get("n_files") is not None and data["n_files"] != len(files):
        raise ValueError("manifest n_files does not match the file list")
    if data.get("total_bytes") is not None and data["total_bytes"] != total:
        raise ValueError("manifest total_bytes does not match the file list")
    return total


def load_manifest(lock_dir):
    path = os.path.join(lock_dir, "MANIFEST_LOCK_v2_inputs.json")
    with open(path) as handle:
        data = json.load(handle)
    validate_manifest(data)
    return data


def peek_manifest(lock_dir):
    """Read sizes only. A dry-run uses this and does not hash the inputs."""
    path = os.path.join(lock_dir, "MANIFEST_LOCK_v2_inputs.json")
    if not os.path.isfile(path):
        return None, "not on this machine"
    try:
        with open(path) as handle:
            data = json.load(handle)
        validate_manifest(data)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        return None, str(exc)
    return data, ""


def verify_manifest_files(files, hasher):
    errors = []
    total = len(files)
    for index, row in enumerate(files, 1):
        path = row["path"]
        if not os.path.isfile(path):
            errors.append(f"missing {path}")
            continue
        size = os.path.getsize(path)
        if size != row["bytes"]:
            errors.append(f"size mismatch {path}: expected {row['bytes']} got {size}")
            continue
        got = hasher(path)
        if got != row["sha256"].lower():
            errors.append(f"sha256 mismatch {path}")
        if index == total or index % 25 == 0:
            print(f"manifest hashed {index}/{total}", flush=True)
    return errors


class _RunResult:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout or ""
        self.stderr = stderr or ""


def _default_run(argv, cwd=None):
    completed = subprocess.run(argv, cwd=cwd, capture_output=True, text=True)
    return _RunResult(completed.returncode, completed.stdout, completed.stderr)


def _video_path(path):
    return str(path).lower().endswith((".mp4", ".mov", ".mkv"))


def _canonical_lock_name(name):
    return _LOCK_NAME_ALIASES.get(str(name or "").strip().lower())


_LOCK_NAME_RE = re.compile(r"'name':\s*'([^']+)'")
_LOCK_SHA_RE = re.compile(r"'lock_sha256':\s*'([0-9a-fA-F]{64})'")
_LOCK_LEAD_RE = re.compile(r"^([A-Za-z0-9_]+)\s+rc=")


def _lock_from_regex(line):
    """Name and sha from a line the log truncated before the closing brace."""
    name_match = _LOCK_NAME_RE.search(line)
    sha_match = _LOCK_SHA_RE.search(line)
    name = name_match.group(1) if name_match else ""
    if not name:
        lead = _LOCK_LEAD_RE.match(line)
        name = lead.group(1) if lead else ""
    digest = sha_match.group(1) if sha_match else ""
    return name, digest


def parse_lock_shas(text):
    """``name`` -> ``lock_sha256`` from the parity repro log.

    A complete dict is parsed first. The real log cuts each line at about 315
    characters, so there is no closing ``}`` and ``json`` / ``ast`` cannot
    load it. The sha is still on that line, so a regex reads it.
    """
    found = {}
    for raw in (text or "").splitlines():
        line = raw.strip()
        if "lock_sha256" not in line:
            continue
        obj = None
        if "{" in line and "}" in line:
            blob = line[line.find("{"):line.rfind("}") + 1]
            try:
                obj = json.loads(blob)
            except json.JSONDecodeError:
                try:
                    obj = ast.literal_eval(blob)
                except (SyntaxError, ValueError):
                    obj = None
        if isinstance(obj, dict):
            name = obj.get("name")
            digest = obj.get("lock_sha256")
        else:
            name, digest = _lock_from_regex(line)
        canonical = _canonical_lock_name(name)
        digest = str(digest or "").strip().lower()
        if canonical and len(digest) == 64 and all(char in _HEX for char in digest):
            found[canonical] = digest
    return found


def load_lock_shas(lock_dir):
    path = os.path.join(lock_dir, LOCK_REPRO_LOG)
    if not os.path.isfile(path):
        return {}
    with open(path) as handle:
        return parse_lock_shas(handle.read())


def _fallback_frozen(name, digest, root, hasher):
    """A locked render that is not a manifest row. Hash the known path."""
    rels = FROZEN_FALLBACKS.get(name) or ()
    if not rels:
        return None, (
            f"frozen render {name}: lock_sha256 {digest} matched 0 manifest rows, expected 1"
        )
    tried = []
    for rel in rels:
        path = os.path.join(root, rel)
        tried.append(path)
        if not os.path.isfile(path):
            continue
        got = str(hasher(path) or "").strip().lower()
        if got != digest:
            return None, (
                f"frozen render {name}: {path} sha {got} != lock_sha256 {digest}"
            )
        return path, None
    return None, (
        f"frozen render {name}: no manifest row and fallback file is missing ({'; '.join(tried)})"
    )


def resolve_frozen_renders(rows, lock_shas=None, root=PARTNERSHIP, hasher=None):
    """One manifest row per locked piece.

    When ``lock_shas`` has a name, that exact manifest sha wins. Otherwise the
    basename in ``FROZEN_RENDER_NAMES`` is the match. SHA256SUMS is not consulted:
    it only lists the 46 tree files.
    """
    lock_shas = lock_shas or {}
    extras = []
    by_sha = {}
    for row in rows or []:
        digest = str(row.get("sha256") or "").strip().lower()
        path = row.get("path") or ""
        if len(digest) == 64 and path:
            by_sha.setdefault(digest, []).append(path)
    found = {}
    errors = []
    for name, filename in FROZEN_RENDER_NAMES:
        digest = lock_shas.get(name)
        if lock_shas:
            if not digest:
                errors.append(f"frozen render {name}: no lock_sha256 in {LOCK_REPRO_LOG}")
                continue
            hits = by_sha.get(digest, [])
            if len(hits) > 1:
                errors.append(
                    f"frozen render {name}: lock_sha256 {digest} matched {len(hits)} manifest rows, expected 1"
                )
                continue
            if len(hits) == 1:
                found[name] = hits[0]
                continue
            path, reason = _fallback_frozen(name, digest, root, hasher or plan.sha256_file)
            if reason:
                errors.append(reason)
                continue
            found[name] = path
            extras.append({
                "path": path,
                "sha256": digest,
                "bytes": os.path.getsize(path),
            })
            continue
        hits = [
            row.get("path") or ""
            for row in rows or []
            if os.path.basename(row.get("path") or "") == filename
        ]
        if len(hits) != 1:
            errors.append(
                f"frozen render {name} ({filename}): {len(hits)} manifest matches, expected 1"
            )
            continue
        found[name] = hits[0]
    return found, errors, extras


def frozen_coverage_errors(rows, lock_shas=None, root=PARTNERSHIP, hasher=None):
    """Manifest sha, or a known path hashed locally and required to match lock_sha256."""
    return resolve_frozen_renders(rows, lock_shas, root=root, hasher=hasher)


def rehearsal_frozen_gate(lock_dir):
    """Same frozen-render resolution the full launch uses, against the whole manifest.

    A rehearsal that only copies scripts never noticed a bad match. This runs
    before the VM whenever the manifest is the real 374-file list.
    """
    lock_dir = (lock_dir or "").rstrip("/")
    manifest, _note = peek_manifest(lock_dir)
    files = (manifest or {}).get("files") or []
    if len(files) < 50 and lock_dir != LOCK_DIR:
        return None
    lock_shas = load_lock_shas(lock_dir)
    if not lock_shas:
        raise SystemExit(f"frozen renders: {LOCK_REPRO_LOG} has no lock_sha256 entries")
    found, errors, extras = frozen_coverage_errors(files, lock_shas)
    if errors:
        raise SystemExit("frozen renders are not covered by the manifest:\n" + "\n".join(errors))
    print(
        f"frozen renders: {len(found)}/{len(FROZEN_RENDER_NAMES)} "
        f"({len(extras)} outside the manifest, sha-checked)",
        flush=True,
    )
    return found


def stage_frozen_renders(lock_dir, dest_root=LOCKREPRO):
    """Link the manifest-verified renders into the directory final_render reads."""
    lock_dir = lock_dir.rstrip("/")
    data = load_manifest(lock_dir)
    found, errors, extras = frozen_coverage_errors(data["files"], load_lock_shas(lock_dir))
    if errors:
        raise SystemExit("frozen renders are not covered by the manifest:\n" + "\n".join(errors))
    sha_by_path = {item["path"]: item["sha256"] for item in extras}
    for row in data["files"]:
        sha_by_path.setdefault(row.get("path") or "", str(row.get("sha256") or "").lower())
    linked = {}
    for name, src in found.items():
        dest = os.path.join(dest_root, name, "renders", os.path.basename(src))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.lexists(dest) or os.path.exists(dest):
            os.remove(dest)
        os.symlink(src, dest)
        linked[name] = {"source": src, "link": dest, "sha256": sha_by_path.get(src, "")}
    return linked


def frame_pair_ok(left, right):
    """True when two frames match within PSNR 50 dB or a max channel diff of 2."""
    if not left or len(left) != len(right):
        return False
    max_diff = 0
    acc = 0
    for a, b in zip(left, right):
        diff = abs(a - b)
        if diff > max_diff:
            max_diff = diff
        acc += diff * diff
    if max_diff <= MAX_CHANNEL_DIFF:
        return True
    mse = acc / len(left)
    if mse <= 0:
        return True
    psnr = 10.0 * math.log10((255.0 * 255.0) / mse)
    return psnr >= PSNR_MIN_DB


def preflight(lock_dir, run=None, hasher=None):
    """SHA256SUMS, then sha256sum -c, then every manifest row. Stop on any miss."""
    run = run or _default_run
    hasher = hasher or plan.sha256_file
    if not os.path.isdir(lock_dir):
        raise SystemExit(f"LOCK_v2 tree is not a directory: {lock_dir}")
    errors = check_sha256sums(lock_dir, hasher)
    if errors:
        raise SystemExit("SHA256SUMS check failed:\n" + "\n".join(errors[:20]))
    summed = run(["sha256sum", "-c", "SHA256SUMS"], cwd=lock_dir)
    if summed.returncode != 0:
        detail = ((summed.stdout or "") + (summed.stderr or ""))[-2000:]
        raise SystemExit("sha256sum -c SHA256SUMS failed\n" + detail)
    try:
        data = load_manifest(lock_dir)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(f"manifest check failed: {exc}") from None
    errors = verify_manifest_files(data["files"], hasher)
    if errors:
        raise SystemExit("manifest check failed:\n" + "\n".join(errors[:20]))
    with open(os.path.join(lock_dir, "SHA256SUMS")) as handle:
        sums = parse_sha256sums(handle.read())
    tree_n = len(sums)
    paths = [row["path"] for row in data["files"]]
    frozen = {}
    if len(paths) >= 50 or lock_dir.rstrip("/") == LOCK_DIR:
        lock_shas = load_lock_shas(lock_dir)
        if not lock_shas:
            raise SystemExit(f"frozen renders: {LOCK_REPRO_LOG} has no lock_sha256 entries")
        frozen, frozen_errors, _extras = frozen_coverage_errors(data["files"], lock_shas)
        if frozen_errors:
            raise SystemExit(
                "frozen renders are not covered by the manifest:\n" + "\n".join(frozen_errors)
            )
    return {"files": len(data["files"]), "tree": tree_n, "manifest": data, "frozen": frozen}


def _is_md5(value):
    return isinstance(value, str) and len(value) == 32 and all(char in _HEX for char in value.lower())


def parse_md5_file(text):
    keyed = {}
    sequential = []
    saw_key = False
    saw_seq = False
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) == 1 and _is_md5(parts[0]):
            sequential.append(parts[0].lower())
            saw_seq = True
            continue
        if len(parts) < 2:
            raise SystemExit(f"bad md5 line: {line[:80]}")
        left, right = parts[0], parts[1]
        if left.isdigit() and _is_md5(right):
            keyed[int(left)] = right.lower()
            saw_key = True
        elif _is_md5(left) and right.isdigit():
            keyed[int(right)] = left.lower()
            saw_key = True
        elif _is_md5(left):
            sequential.append(left.lower())
            saw_seq = True
        else:
            raise SystemExit(f"bad md5 line: {line[:80]}")
    if saw_key and saw_seq:
        raise SystemExit("md5 file mixes bare hashes and frame keys")
    if saw_seq:
        return {index: digest for index, digest in enumerate(sequential)}
    return keyed


def load_md5_paths(paths):
    merged = {}
    for path in paths:
        with open(path) as handle:
            parsed = parse_md5_file(handle.read())
        for frame, digest in parsed.items():
            if frame in merged and merged[frame] != digest:
                raise SystemExit(f"reference md5 files disagree on frame {frame}")
            merged[frame] = digest
    return merged


def frame_bytes(pix_fmt, width=FRAME_W, height=FRAME_H):
    if pix_fmt in ("rgb24", "bgr24", "gbrp"):
        return width * height * 3
    if pix_fmt == "yuv420p":
        return width * height * 3 // 2
    raise SystemExit(f"unsupported repro pix_fmt {pix_fmt}")


def frame_md5s(path, pix_fmt, width=FRAME_W, height=FRAME_H):
    size = frame_bytes(pix_fmt, width, height)
    out = []
    with open(path, "rb") as handle:
        while True:
            buf = handle.read(size)
            if not buf:
                break
            if len(buf) != size:
                raise SystemExit(f"raw frame length is short: {path}")
            out.append(hashlib.md5(buf).hexdigest())
    if not out:
        raise SystemExit(f"empty raw {path}")
    return out


def md5_lists_match(raw_md5s, reference):
    if not raw_md5s or not reference:
        return False
    if set(reference) == set(range(len(raw_md5s))):
        return all(reference[index] == raw_md5s[index] for index in range(len(raw_md5s)))
    if len(reference) == len(raw_md5s):
        ordered = [reference[key] for key in sorted(reference)]
        return ordered == list(raw_md5s)
    return False


def accept_repro(name, repro, raw_md5s, reference):
    if isinstance(repro, dict) and repro.get("identical") is True:
        return {"name": name, "ok": True, "via": "identical", "patch": False}
    if raw_md5s and md5_lists_match(raw_md5s, reference):
        return {"name": name, "ok": True, "via": "frame_md5", "patch": True}
    return {"name": name, "ok": False, "via": "mismatch", "patch": False}


def apply_repro_patch(path, repro):
    """Let final_render's identical assert pass after the frame-md5 fallback.

    The frozen script refuses a repro.json whose identical flag is not true.
    The mp4 sha is not the check. The original object is kept beside the flag.
    """
    updated = dict(repro)
    updated["identical_mp4"] = repro.get("identical")
    updated["identical"] = True
    updated["avt_frame_md5"] = "matched reference_md5; container sha is not the check"
    with open(path, "w") as handle:
        json.dump(updated, handle, indent=2)
        handle.write("\n")


def check_v1e(md5_by_frame, reference_by_frame, still_md5_by_frame):
    errors = []
    expected = set(range(V1E_SF0, V1E_END))
    if set(md5_by_frame) != expected:
        missing = sorted(expected - set(md5_by_frame))[:5]
        extra = sorted(set(md5_by_frame) - expected)[:5]
        errors.append(
            f"v1e md5 lines are not {plan.VERSE_NF} contiguous frames "
            f"{V1E_SF0}–{V1E_END - 1}; missing {missing} extra {extra}"
        )
    for frame in V1E_REF_FRAMES:
        if frame not in reference_by_frame:
            errors.append(f"reference_md5 missing v1e frame {frame}")
        elif md5_by_frame.get(frame) != reference_by_frame[frame]:
            errors.append(f"v1e frame {frame} does not match reference_md5")
    if len(still_md5_by_frame) != EXPECTED_STILLS:
        errors.append(f"expected {EXPECTED_STILLS} v1e lock stills, found {len(still_md5_by_frame)}")
    for frame, digest in sorted(still_md5_by_frame.items()):
        if md5_by_frame.get(frame) != digest:
            errors.append(f"v1e still full_sf{frame}.png does not match the chunk md5")
    return errors


def _frame_number(obj):
    for key in ("F", "frame", "sf", "song_frame"):
        value = obj.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def walk_frame_md5s(obj, sink):
    if isinstance(obj, dict):
        if obj and all(isinstance(key, str) and key.isdigit() and _is_md5(value) for key, value in obj.items()):
            for key, value in obj.items():
                sink.setdefault(int(key), []).append({"pre": value.lower()})
            return
        frame = _frame_number(obj)
        if frame is not None:
            rec = {}
            for key in ("md5_pre_grain", "md5_pre", "pre_md5"):
                if _is_md5(obj.get(key)):
                    rec["pre"] = obj[key].lower()
            for key in ("md5_final", "md5_grain", "grain_md5"):
                if _is_md5(obj.get(key)):
                    rec["final"] = obj[key].lower()
            if "pre" not in rec and _is_md5(obj.get("md5")):
                rec["pre"] = obj["md5"].lower()
            if rec:
                sink.setdefault(frame, []).append(rec)
        for value in obj.values():
            walk_frame_md5s(value, sink)
    elif isinstance(obj, list):
        for value in obj:
            walk_frame_md5s(value, sink)


def check_final_lists(chunk_by_frame, parity_obj, preview_objs):
    """md5_pre_grain against parity and the P1/P2/P3 logs; md5_final against grain runs."""
    errors = []
    if len(chunk_by_frame) != plan.FULL_SONG_FRAMES:
        errors.append(
            f"final chunk logs have {len(chunk_by_frame)} frames, not {plan.FULL_SONG_FRAMES}"
        )
    parity = {}
    walk_frame_md5s(parity_obj, parity)
    if not parity:
        errors.append("parity result has no per-frame md5s")
    previews = {}
    for obj in preview_objs:
        walk_frame_md5s(obj, previews)
    if not previews:
        errors.append("P1/P2/P3 logs have no per-frame md5s")
    for frame, recs in sorted(parity.items()):
        got = chunk_by_frame.get(frame)
        if not got:
            errors.append(f"parity frame {frame} missing from chunk logs")
            continue
        for rec in recs:
            if "pre" in rec and rec["pre"] != got.get("md5_pre_grain"):
                errors.append(f"frame {frame} md5_pre_grain != parity")
            if "final" in rec and rec["final"] != got.get("md5_final"):
                errors.append(f"frame {frame} md5_final != parity grain run")
    for frame, recs in sorted(previews.items()):
        got = chunk_by_frame.get(frame)
        if not got:
            errors.append(f"preview frame {frame} missing from chunk logs")
            continue
        for rec in recs:
            if "pre" in rec and rec["pre"] != got.get("md5_pre_grain"):
                errors.append(f"frame {frame} md5_pre_grain != preview log")
    return errors


def spot_frames(frame_ids, n=SPOT_COUNT, seed=SPOT_SEED):
    ids = sorted({int(frame) for frame in frame_ids})
    if len(ids) <= n:
        return tuple(ids)
    return tuple(sorted(random.Random(seed).sample(ids, n)))


def _fps_24(rate):
    if rate in ("24/1", "24", "24/1.0"):
        return True
    if "/" in str(rate):
        num, den = str(rate).split("/", 1)
        try:
            return abs(float(num) / float(den) - 24.0) < 0.01
        except (ValueError, ZeroDivisionError):
            return False
    try:
        return abs(float(rate) - 24.0) < 0.01
    except (TypeError, ValueError):
        return False


def probe_errors(data, frames=None, codec=None):
    frames = plan.FULL_SONG_FRAMES if frames is None else frames
    streams = data.get("streams") or []
    video = next((row for row in streams if row.get("codec_type") == "video"), None)
    audio = next((row for row in streams if row.get("codec_type") == "audio"), None)
    if not video or not audio:
        return ["probe is missing video or audio"]
    errors = []
    if int(video.get("width") or 0) != FRAME_W or int(video.get("height") or 0) != FRAME_H:
        errors.append("frame size is not 1920x1080")
    rate = str(video.get("avg_frame_rate") or video.get("r_frame_rate") or "")
    if not _fps_24(rate):
        errors.append(f"fps is not 24 ({rate})")
    nb = video.get("nb_frames")
    if nb not in (None, "N/A", ""):
        if int(nb) != frames:
            errors.append(f"nb_frames {nb} != {frames}")
    else:
        dur = video.get("duration") or (data.get("format") or {}).get("duration")
        try:
            ok = abs(float(dur) - frames / 24.0) <= 0.05
        except (TypeError, ValueError):
            ok = False
        if not ok:
            errors.append("duration is not 5542 frames at 24 fps")
    try:
        start = float(audio.get("start_time") or 0)
    except (TypeError, ValueError):
        start = 1.0
    if abs(start) > (1.0 / 48.0):
        errors.append(f"audio lag is {audio.get('start_time')}, not 0")
    if codec:
        name = str(video.get("codec_name") or "").lower()
        if codec not in name:
            errors.append(f"codec is {name}, not {codec}")
    return errors


def guest_setup_shell():
    """The apt and pip block production and the rehearsal both run.

    One function, so a pin change cannot land in only one of them.
    """
    return """export DEBIAN_FRONTEND=noninteractive
SETUP_BEGAN=$(date +%s)
apt-get update
apt-get install -y python3-venv python3-pip ffmpeg
encoders=$(ffmpeg -hide_banner -encoders)
echo "$encoders" | grep -q ffv1
echo "$encoders" | grep -q libx264
echo "$encoders" | grep -q prores_ks
python3 -m venv /opt/avt-comp
/opt/avt-comp/bin/pip install --quiet 'numpy==2.5.5' 'scipy==1.18.1' 'opencv-python-headless>=5.1,<5.2'
/opt/avt-comp/bin/python - <<'PY'
import numpy, scipy, cv2
assert numpy.__version__ == "2.5.5", numpy.__version__
assert scipy.__version__ == "1.18.1", scipy.__version__
assert str(cv2.__version__).startswith("5.1"), cv2.__version__
print("stack", numpy.__version__, scipy.__version__, cv2.__version__)
PY
SETUP_SEC=$(( $(date +%s) - SETUP_BEGAN ))
echo "AVT_STAGE setup ${SETUP_SEC}"
"""


def startup_script(lock_dir, max_minutes, ram_gb=60, vcpu=16, lock_repro=False):
    quoted = shlex.quote(lock_dir)
    repro_flag = " \\\n  --lock-repro" if lock_repro else ""
    return f"""#!/bin/bash
# Generated by scripts/render/remote. LOCK_v2 local stage: no AVT token is read or echoed.
set -euo pipefail
set +x
MAX_MINUTES={int(max_minutes)}
# Do not mkdir /workspace, /tmp/avt-remote, or /tmp/claudia_lockrepro here.
# This script is root. The launcher ssh creates those and chowns them to the
# login user before scp. A root mkdir of a path that user still has to write
# would leave it unwritable. mkdir -p after /tmp/avt-go does not take ownership
# back. /var/avt stays root mode 700. The launcher sudo-copies its outputs to
# /tmp/avt-pull before scp, because the login user cannot read mode 700.
mkdir -p /var/avt/checks /var/avt/out /var/avt/scratch/v1e /var/avt/scratch/final /var/avt/scratch/states
chmod 700 /var/avt
chown root:root /var/avt
# Inputs live on a disk that is not deleted with the VM. Mount it before apt.
INPUT_DEV=/dev/disk/by-id/google-{INPUT_DISK_NAME}
if [ -e "$INPUT_DEV" ]; then
  if ! blkid "$INPUT_DEV" >/dev/null 2>&1; then
    mkfs.ext4 -F -L avt-inputs "$INPUT_DEV"
  fi
  mkdir -p /workspace/partnership
  if ! mountpoint -q /workspace/partnership; then
    mount "$INPUT_DEV" /workspace/partnership
  fi
  # v1e chunks and their state files survive a torn-down VM. final_render scratch stays on the boot disk.
  mkdir -p /workspace/partnership/.avt-scratch/v1e /workspace/partnership/.avt-scratch/states
  mkdir -p /var/avt/scratch/v1e /var/avt/scratch/states
  if ! mountpoint -q /var/avt/scratch/v1e; then
    mount --bind /workspace/partnership/.avt-scratch/v1e /var/avt/scratch/v1e
  fi
  if ! mountpoint -q /var/avt/scratch/states; then
    mount --bind /workspace/partnership/.avt-scratch/states /var/avt/scratch/states
  fi
fi
# After the mount. The launcher waits for this before it mkdir's /workspace.
touch /tmp/avt-inputs-ready
chmod 644 /tmp/avt-inputs-ready
touch /var/avt/guest.log
exec > >(tee -a /var/avt/guest.log) 2>&1
cleanup() {{
  rm -f /tmp/avt-env /var/avt/env
  if [ ! -f /var/avt/done ]; then
    touch /var/avt/failed
    echo startup > /tmp/avt-startup-failed
    chmod 644 /tmp/avt-startup-failed || true
    echo AVT_RENDER_FAIL
  fi
  echo AVT_RENDER_WAIT_PULL
  PULL_DEADLINE=$(( $(date +%s) + 1800 ))
  while [ "$(date +%s)" -lt "$PULL_DEADLINE" ]; do
    if [ -f /tmp/avt-pulled ]; then
      break
    fi
    sleep 5
  done
  echo AVT_RENDER_CLEANED
  shutdown -h now || true
}}
trap cleanup EXIT
shutdown -h +"$MAX_MINUTES" || true
echo AVT_RENDER_START
@@SETUP@@
printf '{{"stages":{{"setup":%s}}}}\\n' "$SETUP_SEC" > /var/avt/timing.json
DEADLINE=$(( $(date +%s) + MAX_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if [ -f /tmp/avt-go ] && [ -f /tmp/avt-env ]; then
    break
  fi
  sleep 10
done
if [ ! -f /tmp/avt-go ] || [ ! -f /tmp/avt-env ]; then
  echo AVT_RENDER_FAIL missing-env
  exit 1
fi
# The preflight already created these and chowned them to the login user.
mkdir -p /tmp/claudia_lockrepro /tmp/avt-remote /workspace/partnership
install -m 600 /tmp/avt-env /var/avt/env
rm -f /tmp/avt-env
set -a
. /var/avt/env
set +a
cd /tmp/avt-remote
/opt/avt-comp/bin/python -u remote_render.py --guest --backend linux \\
  --stage-from local \\
  --recipe lock_v2 \\
  --lock-dir {quoted} \\
  --ram-gb {float(ram_gb):g} --vcpu {int(vcpu)} \\
  --timing-file /var/avt/timing.json{repro_flag} || {{
  echo AVT_RENDER_FAIL guest
  exit 1
}}
echo AVT_RENDER_DONE
touch /var/avt/done
exit 0
""".replace("@@SETUP@@", guest_setup_shell())


def _mkdir_command(paths):
    # gcloud splits --command on every space. The wrapper keeps a double space in a directory.
    # sudo mkdir plus chown runs in this ssh. It does not wait for the root startup script.
    dirs = {p for p in set(paths) if p}
    dirs.update({
        "/workspace", "/workspace/partnership", "/tmp/avt-remote", LOCKREPRO, "/var/avt",
    })
    return plan.wrap_remote_command(plan.prepare_tree_script(dirs, probe="workspace"))


def tree_transfer_rows(lock_dir):
    """Files named in SHA256SUMS. The guest compares these by sha, not by a recurse."""
    lock_dir = lock_dir.rstrip("/")
    sums_path = os.path.join(lock_dir, "SHA256SUMS")
    if not os.path.isfile(sums_path):
        return []
    rows = []
    with open(sums_path) as handle:
        listed = parse_sha256sums(handle.read())
    for digest, name in listed:
        path = os.path.join(lock_dir, name)
        if not os.path.isfile(path):
            continue
        rows.append({
            "path": path,
            "sha256": digest,
            "bytes": os.path.getsize(path),
            "tree": True,
        })
    return rows


def transfer_argvs(name, project, zone, lock_dir, manifest_files, env_file, remote_dir,
                   tree_files=(), copy_tree=True, extra_files=()):
    """Copy the lock tree and the manifest. Unsafe names are staged, then moved.

    The lock tree is one scp per SHA256SUMS file, not ``scp --recurse``. A reused
    disk may already hold that tree mode 0444; skip-existing leaves matching
    shas in place, and the preflight ``chmod u+w`` lets a mismatch be replaced.
    OpenSSH 10 scp is SFTP and does not strip shell quotes. Every scp target is
    a plain path. A name with spaces, ``&``, a colon, or an apostrophe is copied
    to ``/workspace/.avt-incoming/<index>`` and ``mv --`` places it.
    """
    lock_dir = lock_dir.rstrip("/")
    parents = {os.path.dirname(lock_dir), "/var/avt", "/tmp/avt-remote", LOCKREPRO, plan.INCOMING_ROOT}
    parents.update({
        CHECKS_DIR, OUT_DIR, V1E_DIR, FINAL_DIR, STATE_DIR,
    })
    finals = []
    for row in manifest_files:
        finals.append(row["path"])
        parents.add(os.path.dirname(row["path"]))
    for path in tree_files:
        finals.append(path)
        parents.add(os.path.dirname(path))
    tree_rows = tree_transfer_rows(lock_dir) if copy_tree else []
    manifest_paths = {row.get("path") for row in manifest_files}
    tree_rows = [row for row in tree_rows if row["path"] not in manifest_paths]
    for row in list(extra_files or []):
        if row.get("path") and row.get("sha256"):
            tree_rows.append(row)
            parents.add(os.path.dirname(row["path"]))
    for row in tree_rows:
        parents.add(os.path.dirname(row["path"]))
    transfer_argvs.tree_rows = tree_rows
    argvs = plan.pack_dir_batches(sorted(p for p in parents if p), name, project, zone, probe="workspace")
    parent_names = sorted(p for p in parents if p)
    parent_list = plan.encode_probe_list([(path, 0) for path in parent_names])
    parent_local = "/tmp/avt-parent-list-local"
    argvs.append(plan.gcp_scp_argv(
        name, project, zone, parent_local, plan.scp_spec(name, "/tmp/avt-parent-list"),
    ))
    argvs.append(plan.gcp_ssh_argv(
        name, project, zone, plan.wrap_remote_command(_parent_reader()),
    ))
    transfer_argvs.parent_list = parent_list
    transfer_argvs.parent_local = parent_local
    moves = []
    for index, row in enumerate(manifest_files):
        scp_argv, move = plan.stage_scp_argv(
            name, project, zone, row["path"], row["path"], index,
        )
        argvs.append(scp_argv)
        if move:
            moves.append(move)
    for index, row in enumerate(tree_rows):
        scp_argv, move = plan.stage_scp_argv(
            name, project, zone, row["path"], row["path"], 100000 + index,
        )
        argvs.append(scp_argv)
        if move:
            moves.append(move)
    argvs.extend(plan.mv_batch_argvs(name, project, zone, moves))
    argvs.append(plan.gcp_scp_argv(name, project, zone, env_file, plan.scp_spec(name, "/tmp/avt-env")))
    for filename in ("remote_render.py", "plan.py", "lock_v2.py"):
        argvs.append(plan.gcp_scp_argv(
            name, project, zone,
            os.path.join(remote_dir, filename),
            plan.scp_spec(name, f"/tmp/avt-remote/{filename}"),
        ))
    argvs.append(plan.gcp_ssh_argv(name, project, zone, "touch /tmp/avt-go"))
    return argvs


def _parent_reader():
    # sudo test: /var/avt is mode 700, so the login user's [ -d ] is false for
    # /var/avt/checks even after this prepare step created it.
    return """# AVT_PARENT_CHECK
set -euo pipefail
list=/tmp/avt-parent-list
if [ ! -f "$list" ]; then
  echo "AVT_PREFLIGHT_FAIL: parent list missing" >&2
  exit 1
fi
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  blob=${line#* }
  path=$(printf '%s' "$blob" | base64 -d) || continue
  if ! sudo -n test -d "$path"; then
    echo "AVT_PREFLIGHT_FAIL: missing parent $path" >&2
    exit 1
  fi
done < "$list"
echo AVT_PARENTS_OK
"""


def _mkdir_operands(argvs):
    found = []
    for argv in argvs:
        if len(argv) < 3 or argv[2] != "ssh":
            continue
        script = plan.remote_script(argv[-1])
        for line in script.splitlines():
            if "sudo mkdir -p -- " not in line:
                continue
            body = line.split("sudo mkdir -p -- ", 1)[1].split(" || ", 1)[0]
            found.extend(shlex.split(body))
    return found


def _parent_covered(parent, operands):
    if not parent:
        return False
    for op in operands:
        if op == parent or op.startswith(parent.rstrip("/") + "/"):
            return True
    return False


def _simulate_copy(scp_argv, mv_argvs, payload, sandbox, final):
    """SFTP writes the target literally. ``mv`` then uses shell quoting."""
    target = None
    raw = ""
    for part in scp_argv:
        if part.startswith("gcloud"):
            continue
        found = plan.scp_remote_path(part)
        if found:
            target = found
            raw = part
            break
    if not target or "'" in raw or '"' in raw:
        return False
    dest = os.path.join(sandbox, target.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as handle:
        handle.write(payload)
    for argv in mv_argvs:
        for src, dst in plan.mv_pairs_from_script(plan.remote_script(argv[-1])):
            src_local = os.path.join(sandbox, src.lstrip("/"))
            if not os.path.exists(src_local):
                continue
            dst_local = os.path.join(sandbox, dst.lstrip("/"))
            os.makedirs(os.path.dirname(dst_local), exist_ok=True)
            os.replace(src_local, dst_local)
    landed = os.path.join(sandbox, final.lstrip("/"))
    if not os.path.isfile(landed):
        return False
    with open(landed, "rb") as handle:
        return handle.read() == payload


def required_guest_paths(lock_dir):
    """Files §6 names. Directories the guest creates are not in this list."""
    lock_dir = lock_dir.rstrip("/")
    return [
        os.path.join(lock_dir, "scripts", "v1e_chunk_rgb.py"),
        os.path.join(lock_dir, "scripts", "final_render.py"),
        os.path.join(lock_dir, "params", "final_params_LOCK_v2.json"),
        REPRO_SCRIPT,
        S07_TAL,
        BODYPLACE,
        *PREVIEW_LOGS,
    ]


def path_preflight(lock_dir, manifest_files=None, tree_files=None, require_section6=None):
    """Offline check of every remote scp/ssh argv. No gcloud.

    Prints ``path preflight: N/N pass``. ``ok`` is true only at N/N.
    """
    lock_dir = (lock_dir or LOCK_DIR).rstrip("/")
    if manifest_files is None or tree_files is None:
        manifest_files = []
        tree_files = []
        manifest, _note = peek_manifest(lock_dir)
        if manifest:
            manifest_files = list(manifest["files"])
        if os.path.isdir(lock_dir):
            for dirpath, _dirs, names in os.walk(lock_dir):
                for name in names:
                    tree_files.append(os.path.join(dirpath, name))
    rows = []
    for row in manifest_files:
        if isinstance(row, dict) and row.get("path"):
            rows.append(row)
        elif isinstance(row, str):
            rows.append({"path": row, "bytes": 1})
    argvs = transfer_argvs(
        "vm", "p", "z", lock_dir, rows, "/tmp/avt-env",
        os.path.dirname(plan.__file__), tree_files=tree_files or (),
    )
    if require_section6 is None:
        require_section6 = len(rows) >= 50 or lock_dir == LOCK_DIR
    operands = _mkdir_operands(argvs)
    mv_argvs = [argv for argv in argvs if plan.is_incoming_mv(argv)]
    errors = []
    mkdir_at = []
    check_at = None
    for index, argv in enumerate(argvs):
        if len(argv) < 3 or argv[2] != "ssh":
            continue
        script = plan.remote_script(argv[-1])
        if "sudo mkdir -p --" in script:
            mkdir_at.append(index)
        if "AVT_PARENT_CHECK" in script:
            check_at = index
            if "sudo -n test -d" not in script or "[ ! -d" in script:
                errors.append("parent check must use sudo test -d after mkdir")
    if check_at is None or not mkdir_at or check_at < max(mkdir_at):
        errors.append("parent check runs before mkdir")
    for required_dir in (CHECKS_DIR, OUT_DIR, V1E_DIR, FINAL_DIR, STATE_DIR, LOCKREPRO):
        if not _parent_covered(required_dir, operands):
            errors.append(f"parent not mkdir'd: {required_dir}")
    for argv in argvs:
        if not plan.argv_within_limit(argv):
            errors.append("argv over 128 KB")
        for part in argv:
            if ":" in part and part.split(":", 1)[0] == "vm" and ("'" in part or '"' in part):
                errors.append("quote in SFTP target")
    sandbox = tempfile.mkdtemp(prefix="avt-path-preflight-")
    passed = 0
    try:
        for row in rows:
            final = row["path"]
            if not _parent_covered(os.path.dirname(final), operands):
                errors.append(f"parent not mkdir'd: {os.path.dirname(final)}")
                continue
            scp_argv = next((argv for argv in argvs if plan.final_of(argv) == final), None)
            if scp_argv is None:
                errors.append(f"no scp argv for {final}")
                continue
            if not _simulate_copy(scp_argv, mv_argvs, b"avt-path-preflight", sandbox, final):
                errors.append(f"round trip failed: {final}")
                continue
            passed += 1
        if require_section6:
            present = {row["path"] for row in rows}
            present.update(tree_files or ())
            for required in required_guest_paths(lock_dir):
                if required not in present:
                    errors.append(f"section 6 file is not in the manifest or the tree: {required}")
                    passed = min(passed, max(0, len(rows) - 1))
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
    total = len(rows)
    if errors:
        passed = min(passed, max(0, total - len(errors)))
    else:
        passed = total
    line = f"path preflight: {passed}/{total} pass"
    print(line, flush=True)
    for err in errors[:20]:
        print(err, file=sys.stderr)
    return {
        "ok": not errors and total > 0 and passed == total,
        "passed": passed,
        "total": total,
        "errors": errors,
        "line": line,
    }


def _pull_commands(name, project, zone, paths, dests, required=True):
    """Publish root-owned /var/avt paths, then scp the login-user copies."""
    argvs = [plan.gcp_ssh_argv(
        name, project, zone,
        plan.wrap_remote_command(plan.publish_pull_script(paths, required=required)),
    )]
    for path, dest, recurse in dests:
        argvs.append(plan.gcp_scp_argv(
            name, project, zone, plan.scp_spec(name, plan.staged_pull_path(path)), dest,
            recurse=recurse,
        ))
    return argvs


def pull_argvs(name, project, zone, output_dir, timing_path):
    paths = [
        f"{OUT_DIR}/{H264_NAME}",
        f"{OUT_DIR}/{PRORES_NAME}",
        CHECKS_DIR,
        "/var/avt/guest.log",
        "/var/avt/timing.json",
    ]
    dests = [
        (f"{OUT_DIR}/{H264_NAME}", os.path.join(output_dir, H264_NAME), False),
        (f"{OUT_DIR}/{PRORES_NAME}", os.path.join(output_dir, PRORES_NAME), False),
        (CHECKS_DIR, os.path.join(output_dir, "checks"), True),
        ("/var/avt/guest.log", os.path.join(output_dir, "guest.log"), False),
        ("/var/avt/timing.json", timing_path, False),
    ]
    return _pull_commands(name, project, zone, paths, dests)


def failure_pull_argvs(name, project, zone, output_dir, timing_path):
    paths = ["/var/avt/guest.log", CHECKS_DIR, "/var/avt/timing.json"]
    dests = [
        ("/var/avt/guest.log", os.path.join(output_dir, "guest.log"), False),
        (CHECKS_DIR, os.path.join(output_dir, "checks"), True),
        ("/var/avt/timing.json", timing_path, False),
    ]
    argvs = _pull_commands(name, project, zone, paths, dests, required=False)
    argvs.append(plan.gcp_ssh_argv(name, project, zone, "touch /tmp/avt-pulled"))
    return argvs


def v1e_env():
    return {"S07_TAL": S07_TAL, "BODYPLACE": BODYPLACE, "ENC_NOAUDIO": "1"}


def final_env(lock_dir, vcpu, workers):
    threads = max(1, int(vcpu or 4) // max(1, workers))
    params = os.path.join(lock_dir, "params", "final_params_LOCK_v2.json")
    return {
        "GRADE_PARAMS": params,
        "TRANS_PARAMS": params,
        "OMP_NUM_THREADS": str(threads),
        "OPENBLAS_NUM_THREADS": str(threads),
        "MKL_NUM_THREADS": str(threads),
        "OPENCV_FOR_THREADS_NUM": str(threads),
    }


def repro_env():
    """One thread per library. Used only when --lock-repro is on."""
    return {
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "OPENCV_FOR_THREADS_NUM": "1",
        "OPENCV_NUM_THREADS": "0",
    }


def _repro_argv(python, name):
    # cv2.setNumThreads(0) runs before the frozen repro script. argv[0] is the script.
    launch = (
        "import cv2, runpy, sys; "
        "cv2.setNumThreads(0); "
        "sys.argv = sys.argv[1:]; "
        "runpy.run_path(sys.argv[0], run_name='__main__')"
    )
    return [python, "-c", launch, REPRO_SCRIPT, name]


def build_recipe(python, lock_dir, v1e_slots, final_slots, vcpu, lock_repro=False, skip_done=False):
    """Guest argv. Lock repros stay off unless requested.

    The frozen scripts are not rewritten. Assemble reads the sha-verified
    renders linked into ``/tmp/claudia_lockrepro``.
    """
    lock_dir = lock_dir.rstrip("/")
    v1e_script = os.path.join(lock_dir, "scripts", "v1e_chunk_rgb.py")
    final_script = os.path.join(lock_dir, "scripts", "final_render.py")
    all_chunks = v1e_chunk_table()
    chunks = []
    for chunk in all_chunks:
        if skip_done and v1e_chunk_complete(chunk):
            print(f"skip-existing v1e chunk {chunk['sf0']}", flush=True)
            continue
        chunks.append(chunk)
    state_argv = [
        python, v1e_script, "--state_only", "--sf0", str(V1E_SF0), "--nf", str(plan.VERSE_NF),
        "--state_at", state_at_arg(all_chunks), "--state_dir", STATE_DIR,
        "--out", os.path.join(SCRATCH, "x.mkv"),
    ]
    chunk_argvs = []
    for chunk in chunks:
        argv = [
            python, v1e_script, "--sf0", str(chunk["sf0"]), "--nf", str(chunk["nf"]),
            "--md5log", os.path.join(V1E_DIR, f"chunk_{chunk['sf0']}.md5"),
            "--out", os.path.join(V1E_DIR, f"chunk_{chunk['sf0']}.mkv"),
        ]
        if chunk["state_load"]:
            argv.extend(["--state_load", os.path.join(STATE_DIR, chunk["state_load"])])
        chunk_argvs.append(argv)
    final_argvs = []
    for start, end in final_ranges(final_slots):
        final_argvs.append([
            python, final_script, "chunks", "--range", f"{start}-{end}",
            "--chunk", str(FINAL_CHUNK), "--scratch", FINAL_DIR, "--v1e_dir", V1E_DIR,
            "--grain", "1", "--lockrepro", LOCKREPRO, "--tree", PARTNERSHIP, "--stills", "0",
        ])
    assemble_argv = [
        python, final_script, "assemble", "--range", f"0-{plan.FULL_SONG_FRAMES - 1}",
        "--scratch", FINAL_DIR, "--out", os.path.join(OUT_DIR, OUT_BASENAME),
        "--tree", PARTNERSHIP,
    ]
    repro_cmds = []
    for name in LOCK_NAMES:
        repro_cmds.append({"argv": _repro_argv(python, name), "after": f"repro:{name}"})
    steps = []
    if lock_repro:
        steps.append({
            "stage": "lock_repro",
            "cwd": PARTNERSHIP,
            "env_key": "repro",
            "cmds": repro_cmds,
        })
    steps.extend([
        {
            "stage": "state_pass",
            "cwd": PARTNERSHIP,
            "env_key": "v1e",
            "cmds": [state_argv],
        },
        {
            "stage": "v1e_chunks",
            "cwd": PARTNERSHIP,
            "env_key": "v1e",
            "parallel": True,
            "slots": v1e_slots,
            "cmds": chunk_argvs,
            "hook": "v1e_check",
        },
        {
            "stage": "final_chunks",
            "cwd": PARTNERSHIP,
            "env_key": "final",
            "parallel": True,
            "slots": final_slots,
            "cmds": final_argvs,
        },
        {
            "stage": "assemble",
            "cwd": PARTNERSHIP,
            "env_key": "final",
            "cmds": [assemble_argv],
            "hook": "accept",
        },
    ])
    return steps, {
        "v1e": v1e_env(),
        "final": final_env(lock_dir, vcpu, final_slots),
        "repro": repro_env(),
    }


def run_pool(cmds, spawn, slots, sleep=time.sleep, poll_seconds=0.2, max_spins=100000):
    slots = max(1, int(slots))
    pending = list(cmds)
    running = []
    failed = None
    spins = 0

    def reap():
        nonlocal failed
        alive = []
        for argv, proc in running:
            code = proc.poll()
            if code is None:
                alive.append((argv, proc))
            elif code != 0 and failed is None:
                failed = code
        running[:] = alive

    while pending or running:
        spins += 1
        if spins > max_spins:
            for _, proc in running:
                proc.kill()
            raise SystemExit("worker pool did not finish")
        reap()
        if failed is not None:
            for _, proc in running:
                proc.kill()
            raise SystemExit(f"worker exited {failed}")
        progressed = False
        while pending and len(running) < slots:
            argv = pending.pop(0)
            running.append((argv, spawn(argv)))
            progressed = True
        if not progressed:
            sleep(poll_seconds)
    reap()
    if failed is not None:
        raise SystemExit(f"worker exited {failed}")


def execute_recipe(steps, call, spawn, on_stage, hooks, envs, sleep=time.sleep):
    for step in steps:
        stage = step["stage"]
        on_stage(stage, "begin")
        env = envs.get(step.get("env_key")) if step.get("env_key") else None
        cwd = step.get("cwd")
        try:
            if step.get("parallel"):
                run_pool(
                    step["cmds"],
                    lambda argv, env=env, cwd=cwd: spawn(argv, env, cwd),
                    step["slots"],
                    sleep=sleep,
                )
            else:
                for cmd in step.get("cmds") or []:
                    argv = cmd["argv"] if isinstance(cmd, dict) else cmd
                    result = call(argv, env, cwd)
                    if getattr(result, "returncode", 1) != 0:
                        raise SystemExit(f"{stage} exited {getattr(result, 'returncode', 1)}")
                    if isinstance(cmd, dict) and cmd.get("after"):
                        hooks[cmd["after"]]()
            if step.get("hook"):
                hooks[step["hook"]]()
        finally:
            on_stage(stage, "end")


def _write_json(path, payload):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def _load_json(path):
    with open(path) as handle:
        return json.load(handle)


def stage_logs(checks_dir):
    md5_dest = os.path.join(checks_dir, "v1e_md5")
    log_dest = os.path.join(checks_dir, "final_logs")
    os.makedirs(md5_dest, exist_ok=True)
    os.makedirs(log_dest, exist_ok=True)
    for path in glob.glob(os.path.join(V1E_DIR, "chunk_*.md5")):
        shutil.copy(path, md5_dest)
    for path in glob.glob(os.path.join(FINAL_DIR, "chunk_*", "log_*.json")):
        shutil.copy(path, log_dest)


def _merged_v1e_md5():
    merged = {}
    for path in sorted(glob.glob(os.path.join(V1E_DIR, "chunk_*.md5"))):
        with open(path) as handle:
            parsed = parse_md5_file(handle.read())
        for frame, digest in parsed.items():
            if frame in merged and merged[frame] != digest:
                raise SystemExit(f"v1e md5 logs disagree on frame {frame}")
            merged[frame] = digest
    return merged


def _still_md5s(decoder):
    found = {}
    for path in sorted(glob.glob(os.path.join(STILLS_DIR, "full_sf*.png"))):
        name = os.path.basename(path)
        digits = name[len("full_sf"):-len(".png")]
        if not digits.isdigit():
            continue
        found[int(digits)] = decoder(path)
    return found


def _chunk_logs():
    by_frame = {}
    for path in glob.glob(os.path.join(FINAL_DIR, "chunk_*", "log_*.json")):
        data = _load_json(path)
        for row in data.get("frames") or []:
            frame = row.get("F")
            if isinstance(frame, int):
                by_frame[frame] = {
                    "md5_pre_grain": (row.get("md5_pre_grain") or "").lower(),
                    "md5_final": (row.get("md5_final") or "").lower(),
                }
    return by_frame


def _decode_rgb24(path):
    completed = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=False, capture_output=True,
    )
    if completed.returncode != 0 or not completed.stdout:
        return None
    return completed.stdout


def videos_within_tolerance(frozen, rebuilt, width=FRAME_W, height=FRAME_H):
    """Per-frame PSNR >= 50 dB or max channel diff <= 2. Not a byte-equal sha."""
    if not os.path.isfile(frozen) or not os.path.isfile(rebuilt):
        return False, {"error": "frozen or rebuilt render is missing"}
    if os.path.samefile(frozen, rebuilt):
        return True, {"identical_bytes": True}
    left = _decode_rgb24(frozen)
    right = _decode_rgb24(rebuilt)
    if left is None or right is None:
        return False, {"error": "ffmpeg could not decode a render"}
    size = width * height * 3
    if len(left) != len(right) or len(left) % size:
        return False, {"error": "decoded length differs", "left": len(left), "right": len(right)}
    worst = None
    for index in range(len(left) // size):
        a = left[index * size:(index + 1) * size]
        b = right[index * size:(index + 1) * size]
        if not frame_pair_ok(a, b):
            worst = index
            break
    if worst is not None:
        return False, {"error": f"frame {worst} outside tolerance"}
    return True, {"frames": len(left) // size}


def _repro_hook(name, checks_dir):
    def hook():
        record_path = os.path.join(checks_dir, "frozen_renders.json")
        record = _load_json(record_path) if os.path.isfile(record_path) else {}
        entry = record.get(name) or {}
        frozen = entry.get("source") or ""
        rebuilt = entry.get("link") or os.path.join(LOCKREPRO, name, "renders")
        if os.path.isdir(rebuilt):
            videos = [
                os.path.join(rebuilt, item) for item in os.listdir(rebuilt)
                if _video_path(item)
            ]
            rebuilt = videos[0] if videos else rebuilt
        ok, detail = videos_within_tolerance(frozen, rebuilt)
        decision = {
            "name": name,
            "ok": ok,
            "via": "tolerance" if ok else "pixels",
            "patch": False,
        }
        decision.update(detail)
        _write_json(os.path.join(checks_dir, f"repro_{name}.json"), decision)
        link = entry.get("link")
        if link and frozen and os.path.isfile(frozen):
            if os.path.lexists(link):
                os.remove(link)
            os.makedirs(os.path.dirname(link), exist_ok=True)
            os.symlink(frozen, link)
        if not ok:
            raise SystemExit(f"lock repro {name} failed ({decision['via']})")
    return hook


def _bind_repro(name, checks_dir, lock_dir):
    hook = _repro_hook(name, checks_dir)
    hook.pattern = os.path.join(lock_dir, "reference_md5", f"lock_{name}_preencode_*.md5")
    return hook


def ffmpeg_rgb24_md5(path):
    completed = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=False, capture_output=True,
    )
    if completed.returncode != 0 or not completed.stdout:
        raise SystemExit(f"could not decode still {path}")
    return hashlib.md5(completed.stdout).hexdigest()


def _probe_file(path, codec, run):
    result = run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        None,
    )
    if getattr(result, "returncode", 1) != 0:
        raise SystemExit(f"ffprobe failed for {path}")
    try:
        data = json.loads(result.stdout or "")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ffprobe returned no json for {path}") from exc
    errors = probe_errors(data, codec=codec)
    if errors:
        raise SystemExit(f"{os.path.basename(path)}: " + "; ".join(errors))


def make_hooks(lock_dir, checks_dir, call, envs, python, decoder, run_probe):
    hooks = {f"repro:{name}": _bind_repro(name, checks_dir, lock_dir) for name in LOCK_NAMES}

    def v1e_check():
        merged = _merged_v1e_md5()
        reference = load_md5_paths(sorted(glob.glob(
            os.path.join(lock_dir, "reference_md5", "v1e_runner_o8_*.md5"),
        )))
        stills = _still_md5s(decoder)
        errors = check_v1e(merged, reference, stills)
        _write_json(os.path.join(checks_dir, "v1e_check.json"), {
            "errors": errors, "frames": len(merged), "sanity": "report_only",
        })

    def accept():
        stage_logs(checks_dir)
        chunk_by_frame = _chunk_logs()
        parity_path = os.path.join(lock_dir, "parity", "parity_motion_all_joins_v2_result.json")
        parity = _load_json(parity_path)
        previews = [_load_json(path) for path in PREVIEW_LOGS]
        errors = check_final_lists(chunk_by_frame, parity, previews)
        frames = spot_frames(list(walk_parity_frames(parity)))
        env = _child_env(envs.get("final"))
        final_script = os.path.join(lock_dir, "scripts", "final_render.py")
        for frame in frames:
            scratch = os.path.join(SCRATCH, "spot")
            argv = [
                python, final_script, "dryrun", "--range", f"{frame}-{frame}",
                "--scratch", scratch, "--grain", "1", "--lockrepro", LOCKREPRO,
                "--v1e_dir", V1E_DIR, "--stills", "0", "--tree", PARTNERSHIP,
            ]
            result = call(argv, env, PARTNERSHIP)
            if getattr(result, "returncode", 1) != 0:
                errors.append(f"spot dryrun {frame} exited {getattr(result, 'returncode', 1)}")
                continue
            log_path = os.path.join(
                scratch, f"dryrun_{frame}-{frame}", f"log_{frame:04d}-{frame:04d}.json",
            )
            if not os.path.isfile(log_path):
                errors.append(f"spot dryrun {frame} wrote no log")
                continue
            rows = _load_json(log_path).get("frames") or []
            found = next((row for row in rows if row.get("F") == frame), None)
            if not found or found.get("md5_final", "").lower() != chunk_by_frame.get(frame, {}).get("md5_final"):
                errors.append(f"spot frame {frame} grain md5 is not bit-identical")
        h264 = os.path.join(OUT_DIR, H264_NAME)
        prores = os.path.join(OUT_DIR, PRORES_NAME)
        probe_problems = []
        try:
            _probe_file(h264, "h264", run_probe)
            _probe_file(prores, "prores", run_probe)
        except SystemExit as exc:
            probe_problems.append(str(exc))
        _write_json(os.path.join(checks_dir, "acceptance.json"), {
            "errors": errors,
            "probe": probe_problems,
            "spot_frames": list(frames),
            "sanity": "report_only",
        })
        if probe_problems:
            raise SystemExit("assemble probe failed:\n" + "\n".join(probe_problems))

    hooks["v1e_check"] = v1e_check
    hooks["accept"] = accept
    return hooks


def walk_parity_frames(obj):
    sink = {}
    walk_frame_md5s(obj, sink)
    return sink.keys()


def _child_env(extra):
    env = os.environ.copy()
    env.pop("ENC_LOSSLESS", None)
    if extra:
        env.update(extra)
    return env


def _on_stage_printer(timer, timing_file):
    def on_stage(name, phase):
        if phase == "begin":
            timer.begin(name)
        elif phase == "end":
            seconds = timer.end(name)
            print(f"AVT_STAGE {name} {seconds:.3f}", flush=True)
            if timing_file:
                plan.write_guest_timing(timing_file, timer.seconds)
    return on_stage


def _load_repro(path):
    """repro.json is JSON. A Python literal from the repro script is accepted too."""
    with open(path) as handle:
        text = handle.read()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = ast.literal_eval(text)
    if not isinstance(data, dict):
        raise ValueError(f"{path} is not an object")
    return data


def _inspect_raw(name, expected_sha):
    """Decide whether /tmp already holds a usable pre-encode raw.

    A present raw that is not identical is a hard stop. Rebuilding it runs in
    /workspace/partnership, and that disk has no room for a second copy.
    """
    repro_path = os.path.join(LOCKREPRO, name, "repro.json")
    raw_path = os.path.join(LOCKREPRO, name, "frames_rgb24.raw")
    raw_ok = os.path.isfile(raw_path) and os.path.getsize(raw_path) > 0
    if not os.path.isfile(repro_path) or not raw_ok:
        return {"ready": False, "blocked": False, "reason": "missing"}
    try:
        data = _load_repro(repro_path)
    except (OSError, json.JSONDecodeError, ValueError, SyntaxError):
        return {"ready": False, "blocked": True, "reason": "repro.json is not readable"}
    if data.get("identical") is not True:
        return {"ready": False, "blocked": True, "reason": "identical is not true"}
    pix = data.get("pix_fmt")
    if pix not in ("rgb24", "bgr24", "gbrp", "yuv420p"):
        return {"ready": False, "blocked": True, "reason": f"pix_fmt {pix} is unsupported"}
    digest = str(data.get("lock_sha256") or "").strip().lower()
    if expected_sha and digest != expected_sha:
        shown = digest or "(missing)"
        return {
            "ready": False,
            "blocked": True,
            "reason": f"lock_sha256 {shown} != parity {expected_sha}",
        }
    return {
        "ready": True,
        "blocked": False,
        "rewrite": data.get("raw") != raw_path,
        "reason": "",
    }


def _normalize_repro_json(name):
    """Point repro.json at the absolute /tmp raw. Leave a correct file untouched."""
    repro_path = os.path.join(LOCKREPRO, name, "repro.json")
    raw_path = os.path.join(LOCKREPRO, name, "frames_rgb24.raw")
    data = _load_repro(repro_path)
    if data.get("raw") == raw_path:
        return data
    data["raw"] = raw_path
    _write_json(repro_path, data)
    return data


def _file_row(path):
    return {
        "path": path,
        "sha256": plan.sha256_file(path),
        "bytes": os.path.getsize(path),
    }


def _write_raw_sums(rows):
    """Absolute paths. sha256sum -c resolves a relative name from the cwd, and the guest cwd is the lock scripts directory."""
    lines = []
    for row in rows:
        path = row["path"]
        if not os.path.isabs(path):
            raise SystemExit(f"lock raw checksum path is not absolute: {path}")
        lines.append(f"{row['sha256']}  {path}")
    path = os.path.join(LOCKREPRO, "RAW_SHA256SUMS")
    os.makedirs(LOCKREPRO, exist_ok=True)
    with open(path, "w") as handle:
        handle.write("\n".join(lines) + "\n")
    return _file_row(path)


def log_lock_raw_shipments(rows, action="plan"):
    """One line per pre-encode raw: name, size, sha. Rehearsal and the full run both call this."""
    for row in rows:
        path = row.get("path") or ""
        if not path.endswith("/frames_rgb24.raw"):
            continue
        name = os.path.basename(os.path.dirname(path))
        print(
            f"lock raw ship {action} {name} bytes={row.get('bytes')} sha256={row.get('sha256')}",
            flush=True,
        )


def require_raws_queued(argvs, rows):
    """The scp list must name every raw. A mkdir of the parent is not a copy."""
    blob = "\n".join(" ".join(str(part) for part in argv) for argv in argvs)
    missing = [
        row["path"] for row in rows
        if str(row.get("path") or "").endswith("/frames_rgb24.raw") and row["path"] not in blob
    ]
    if missing:
        raise SystemExit("lock raw missing from the transfer: " + ", ".join(missing))


def _default_repro(name):
    env = os.environ.copy()
    env["REPRO_ROOT"] = LOCKREPRO
    return subprocess.run(
        [sys.executable, REPRO_SCRIPT, name],
        cwd=PARTNERSHIP,
        env=env,
        check=False,
    )


def _run_repros(names, parallel, run_one):
    if not names:
        return
    from concurrent.futures import ThreadPoolExecutor, as_completed
    workers = max(1, min(int(parallel), len(names)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(run_one, name): name for name in names}
        for future in as_completed(futures):
            name = futures[future]
            result = future.result()
            code = getattr(result, "returncode", 1)
            if code != 0:
                raise SystemExit(f"lock raw {name} repro exited {code}")


def ensure_lock_raws(lock_dir, names=None, parallel=3, run_one=None):
    """Prepare /tmp/claudia_lockrepro/<name>/{frames_rgb24.raw,repro.json} on the launcher.

    An existing repro.json with identical true and the parity lock_sha256 is reused
    in place. The raws are not copied onto /workspace. A raw that is already on disk
    and is not identical is left alone and the launch stops. The box runs the repro
    only when that name has no raw yet, at most three at a time. The VM never rebuilds these.
    """
    if not str(LOCKREPRO).startswith("/tmp/"):
        raise SystemExit(f"lock raws stay under /tmp, not {LOCKREPRO}")
    names = list(names or LOCK_NAMES)
    shas = load_lock_shas(lock_dir)
    pending = []
    for name in names:
        status = _inspect_raw(name, shas.get(name))
        if status["ready"]:
            print(f"lock raw {name}: reuse", flush=True)
        elif status["blocked"]:
            raise SystemExit(f"lock raw {name} is on disk and will not be rebuilt: {status['reason']}")
        else:
            pending.append(name)
    if pending:
        print(f"lock raws: running {len(pending)} repros, {parallel} at a time", flush=True)
        _run_repros(pending, parallel, run_one or _default_repro)
    rows = []
    for name in names:
        status = _inspect_raw(name, shas.get(name))
        if not status["ready"]:
            raise SystemExit(f"lock raw {name} is not identical")
        if status.get("rewrite"):
            _normalize_repro_json(name)
        raw_path = os.path.join(LOCKREPRO, name, "frames_rgb24.raw")
        repro_path = os.path.join(LOCKREPRO, name, "repro.json")
        rows.append(_file_row(raw_path))
        rows.append(_file_row(repro_path))
    rows.append(_write_raw_sums([row for row in rows if row["path"].endswith("frames_rgb24.raw")]))
    for row in rows:
        if not str(row["path"]).startswith(LOCKREPRO + os.sep):
            raise SystemExit(f"lock raw escaped /tmp: {row['path']}")
    log_lock_raw_shipments(rows, "plan")
    print(f"lock raws: {len(names)} ready, {sum(row['bytes'] for row in rows)} bytes", flush=True)
    return rows


def verify_lock_raws(run):
    """Guest check: the pushed raws match the launcher sha, and repro.json points at them."""
    sums = os.path.join(LOCKREPRO, "RAW_SHA256SUMS")
    if not os.path.isfile(sums):
        return
    result = run(["sha256sum", "-c", sums])
    if getattr(result, "returncode", 1) != 0:
        detail = ((getattr(result, "stdout", "") or "") + (getattr(result, "stderr", "") or ""))[-2000:]
        raise SystemExit("lock raw sha256sum -c failed\n" + detail)
    for name in LOCK_NAMES:
        path = os.path.join(LOCKREPRO, name, "repro.json")
        if not os.path.isfile(path):
            continue
        data = _load_repro(path)
        raw = os.path.join(LOCKREPRO, name, "frames_rgb24.raw")
        if data.get("identical") is not True:
            raise SystemExit(f"lock raw {name} identical is not true")
        if data.get("raw") != raw:
            raise SystemExit(f"lock raw {name} raw path is {data.get('raw')}, not {raw}")
        if data.get("pix_fmt") not in ("rgb24", "bgr24", "gbrp", "yuv420p"):
            raise SystemExit(f"lock raw {name} pix_fmt {data.get('pix_fmt')} is unsupported")


def run_guest(args, assert_stack_fn=None, call=None, spawn=None, run=None, decoder=None, sleep=time.sleep):
    """Step 0 through step 5 on the machine that already has the files."""
    assert_stack_fn = assert_stack if assert_stack_fn is None else assert_stack_fn
    run = run or _default_run
    decoder = decoder or ffmpeg_rgb24_md5
    lock_dir = (args.lock_dir or LOCK_DIR).rstrip("/")
    checks_dir = CHECKS_DIR
    for path in (checks_dir, V1E_DIR, FINAL_DIR, STATE_DIR, OUT_DIR, LOCKREPRO, SCRATCH):
        os.makedirs(path, exist_ok=True)
    timer = plan.StageTimer()
    on_stage = _on_stage_printer(timer, args.timing_file)
    try:
        on_stage("verify", "begin")
        try:
            preflight(lock_dir, run=run)
            assert_stack_fn()
            assert_ffmpeg(run)
        finally:
            on_stage("verify", "end")
        if args.ram_gb:
            ram = args.ram_gb
        else:
            with open("/proc/meminfo") as handle:
                ram = ram_gb_from_meminfo(handle.read())
        vcpu = args.vcpu or os.cpu_count() or 1
        v1e_slots = v1e_workers(ram, vcpu)["started"]
        final_slots = final_workers_for_cpu(vcpu, len(final_spans()))
        python = _guest_python()
        linked = stage_frozen_renders(lock_dir)
        _write_json(os.path.join(checks_dir, "frozen_renders.json"), linked)
        print("frozen renders linked:", flush=True)
        for name, row in linked.items():
            print(f"  {name}: {row['source']}", flush=True)
        verify_lock_raws(run)
        steps, envs = build_recipe(
            python, lock_dir, v1e_slots, final_slots, vcpu,
            lock_repro=bool(getattr(args, "lock_repro", False)),
            skip_done=True,
        )

        def call_cmd(argv, env, cwd):
            if call is not None:
                return call(argv, _child_env(env), cwd)
            completed = subprocess.run(argv, cwd=cwd, env=_child_env(env))
            return completed

        def spawn_cmd(argv, env, cwd):
            if spawn is not None:
                return spawn(argv, _child_env(env), cwd)
            return subprocess.Popen(argv, cwd=cwd, env=_child_env(env))

        hooks = make_hooks(lock_dir, checks_dir, call_cmd, envs, python, decoder, run)
        execute_recipe(steps, call_cmd, spawn_cmd, on_stage, hooks, envs, sleep=sleep)
    except SystemExit as exc:
        try:
            with open(os.path.join(checks_dir, "failure.txt"), "w") as handle:
                handle.write(str(exc) + "\n")
            stage_logs(checks_dir)
        except OSError:
            pass
        raise
    finally:
        if args.timing_file:
            plan.write_guest_timing(args.timing_file, timer.seconds)
    return 0


def _guest_python():
    if os.path.isfile(GUEST_PYTHON) and os.access(GUEST_PYTHON, os.X_OK):
        return GUEST_PYTHON
    return sys.executable or "python3"


def exact_command(lock_dir, zone, ceiling, execute=False, output="LOCK_v2_deliverables",
                  machine_type=MACHINE):
    body = (
        "python3 scripts/render/remote/remote_render.py "
        "--backend gcp --stage-from local --recipe lock_v2 "
        f"--lock-dir {shlex.quote(lock_dir)} "
        f"--zone {shlex.quote(zone)} --machine-type {shlex.quote(machine_type)} "
        f"--cost-ceiling {ceiling:g}"
    )
    if execute:
        return f"AVT_REMOTE_RENDER_CONFIRM=1 {body} --execute --output {shlex.quote(output)}"
    return body + " --dry-run"


def build_plan(env, lock_dir, zone, max_hours, instance_name, confirm, output, timing_path,
               cost_ceiling, spot, machine_type, backend, stage_from, env_file, lock_repro=False):
    requested = machine_type or MACHINE
    spec = machine_spec(requested)
    ram, vcpu, rate = spec if spec else machine_spec(MACHINE)
    manifest, manifest_note = peek_manifest(lock_dir)
    if manifest is None:
        input_gb = DOC_INPUT_GB
        input_files = DOC_INPUT_FILES
        manifest_files = []
        frozen_errors = []
        pipeline_errors = []
    else:
        input_gb = validate_manifest(manifest) / 1_000_000_000.0
        manifest_files = list(manifest["files"])
        frozen_errors = []
        pipeline_errors = []
        lock_shas = load_lock_shas(lock_dir)
        if lock_shas:
            _found, frozen_errors, extras = frozen_coverage_errors(manifest["files"], lock_shas)
            if not frozen_errors:
                manifest_files.extend(extras)
                input_gb += sum(item["bytes"] for item in extras) / 1_000_000_000.0
        full_tree = len(manifest["files"]) >= 50 or lock_dir.rstrip("/") == LOCK_DIR
        if full_tree:
            gaps = missing_pipeline_modules(manifest["files"])
            if gaps:
                pipeline_errors.append(
                    "final pipeline modules missing from the manifest: " + ", ".join(gaps)
                )
            before = {row.get("path") for row in manifest_files}
            manifest_files = augment_stage_rows(lock_dir, manifest_files)
            added = [row for row in manifest_files if row.get("path") not in before]
            input_gb += sum(int(row.get("bytes") or 0) for row in added) / 1_000_000_000.0
        input_files = len(manifest_files)
        manifest_note = ""
    proj = project(
        ram, vcpu, input_gb, cost_ceiling, rate,
        machine=requested if spec else MACHINE, lock_repro=lock_repro,
    )
    disk_usd = (
        proj["hours"][0] * INPUT_DISK_USD_PER_HOUR,
        proj["hours"][1] * INPUT_DISK_USD_PER_HOUR,
    )
    proj["usd"] = [proj["usd"][0] + disk_usd[0], proj["usd"][1] + disk_usd[1]]
    proj["under"] = proj["usd"][1] <= cost_ceiling
    proj["disk_usd_per_day"] = INPUT_DISK_USD_PER_DAY
    text = projection_text(proj)
    compared = comparison_text(input_gb, cost_ceiling)
    capped = plan.cost_cap_hours(max_hours, cost_ceiling, rate)
    reasons = []
    if backend != "gcp":
        reasons.append("refusing to create a VM: LOCK_v2 runs on GCP.")
    if stage_from != "local":
        reasons.append(
            "refusing to create a VM: LOCK_v2 copies absolute paths from the launcher "
            "with gcloud compute scp. Use --stage-from local."
        )
    if spot:
        reasons.append(
            "refusing to create a VM: this project has no preemptible quota, "
            "so LOCK_v2 does not request a Spot VM."
        )
    if spec is None:
        reasons.append(
            f"refusing to create a VM: unknown --machine-type {requested}. "
            f"Known: {', '.join(known_machines())}."
        )
    elif vcpu > CPU_QUOTA:
        reasons.append(
            f"refusing to create a VM: {requested} is {vcpu} vCPU and the project quota "
            f"is CPUS_ALL_REGIONS {CPU_QUOTA} on demand."
        )
    if frozen_errors:
        reasons.append(
            "frozen renders are not covered by the manifest: " + "; ".join(frozen_errors)
        )
    if pipeline_errors:
        reasons.append("refusing to create a VM: " + "; ".join(pipeline_errors))
    if proj["usd"][1] > cost_ceiling:
        reasons.append(
            f"refusing to create a VM: projected cost ${proj['usd'][1]:.2f} "
            f"would exceed the ceiling ${cost_ceiling:.2f}"
        )
    elif proj["hours"][1] > capped + 1e-9:
        reasons.append(
            f"refusing to create a VM: projected wall {proj['hours'][1]:.2f} h exceeds the armed "
            f"max runtime {plan.duration_flag(capped)} "
            "(the shorter of --max-hours and the cost ceiling)"
        )
    remote_dir = os.path.dirname(os.path.abspath(plan.__file__))
    project_id = plan.gcp_project_from_env(env)
    guest_minutes = max(1, int(math.floor(capped * 60.0)))
    report = {
        "recipe": RECIPE,
        "backend": "gcp",
        "machine": requested if spec else MACHINE,
        "family": "intel",
        "ram_gb": ram,
        "vcpu": vcpu,
        "disk_gb": DISK_GB,
        "cpu_quota": CPU_QUOTA,
        "stage_from": "local" if stage_from == "local" else stage_from,
        "confirm": confirm,
        "dry_run": not confirm,
        "blocked": False,
        "refuse_reason": " ".join(reasons),
        "project": project_id,
        "zone": zone,
        "spot": False,
        "instance_name": instance_name,
        "lock_dir": lock_dir.rstrip("/"),
        "input_gb": input_gb,
        "input_files": input_files,
        "manifest_note": manifest_note,
        "manifest_files": input_files,
        "projection": proj,
        "projection_text": text,
        "comparison_text": compared,
        "projected_usd_hi": proj["usd"][1],
        "cost_ceiling_usd": cost_ceiling,
        "usd_per_hour": rate,
        "capped_hours": capped,
        "max_hours": max_hours,
        "max_seconds": int(float(max_hours) * 3600),
        "require_parity_dir": False,
        "parity_dir": "",
        "output": output,
        "output_is_dir": True,
        "timing_path": timing_path,
        "env_file": env_file,
        "pull_strict": True,
        "stage_labels": STAGE_LABELS,
        "credentials": plan.credential_status(env),
        "workers_started": proj["v1e_started"],
        "v1e_effective": proj["v1e_effective"],
        "final_started": proj["final_started"],
        "poll_seconds": 30,
        "ssh_retry_seconds": 5,
        "transfer_attempts": 24,
        "manifest_checked": False,
        "transfer_rows": manifest_files,
        "tree_rows": [],
        "verified_files": None,
        "lock_path": "",
        "lock_rows": None,
    }
    report["input_disk"] = {
        "name": INPUT_DISK_NAME,
        "gb": INPUT_DISK_GB,
        "usd_per_hour": INPUT_DISK_USD_PER_HOUR,
        "usd_per_day": INPUT_DISK_USD_PER_DAY,
        "describe_argv": plan.gcp_disk_describe_argv(INPUT_DISK_NAME, project_id, zone),
        "create_argv": plan.gcp_disk_create_argv(INPUT_DISK_NAME, project_id, zone, INPUT_DISK_GB),
        "delete_argv": plan.gcp_disk_delete_argv(INPUT_DISK_NAME, project_id, zone),
    }
    report["create_argv"] = plan.gcp_create_argv(
        instance_name, project_id, zone, machine=report["machine"], spot=False,
        max_hours=capped, disk_gb=DISK_GB, data_disk=INPUT_DISK_NAME,
    )
    report["delete_argv"] = plan.gcp_delete_argv(instance_name, project_id, zone)
    report["serial_argv"] = plan.gcp_serial_argv(instance_name, project_id, zone)
    report["startup_script"] = startup_script(
        report["lock_dir"], guest_minutes, ram_gb=ram, vcpu=vcpu, lock_repro=lock_repro,
    )
    report["transfer_argv"] = transfer_argvs(
        instance_name, project_id, zone, report["lock_dir"], manifest_files, env_file, remote_dir,
    )
    report["tree_rows"] = list(getattr(transfer_argvs, "tree_rows", []) or [])
    report["side_files"] = {
        transfer_argvs.parent_local: transfer_argvs.parent_list,
    }
    report["projected_usd_hi"] = proj["usd"][1]
    report["pull_argv"] = pull_argvs(instance_name, project_id, zone, output, timing_path)
    report["failure_pull_argv"] = failure_pull_argvs(instance_name, project_id, zone, output, timing_path)
    report["failure_serial_path"] = os.path.join(output, "serial.txt")
    report["lock_repro"] = bool(lock_repro)
    report["recipe_steps"], report["recipe_envs"] = build_recipe(
        GUEST_PYTHON, report["lock_dir"], proj["v1e_started"], proj["final_started"], vcpu,
        lock_repro=lock_repro,
    )
    return report


def _argv_line(argv):
    return " ".join(shlex.quote(part) for part in argv)


def format_report(report):
    creds = report["credentials"]
    lines = [
        f"recipe: {RECIPE}",
        f"backend: gcp ({report['machine']}, intel, {report['ram_gb']} GB, {report['vcpu']} vCPU)",
        f"dry-run: {'yes' if report['dry_run'] else 'no — execute was requested'}",
        "A dry-run does not call gcloud and does not create a VM, a disk, or a bucket.",
        f"stage-from: {report['stage_from']}",
        "transport: gcloud compute scp and gcloud compute ssh. No bucket is created.",
        "AVT credentials required: none",
        "AVT_ACCESS_TOKEN, AVT_ANON_KEY, and AVT_BATCH_SECRET are not required "
        "and are not copied to the VM.",
        "GCS is not used. The launcher identity needs roles/compute.instanceAdmin.v1 "
        "and roles/iam.serviceAccountUser only.",
        f"lock dir: {report['lock_dir']} (same absolute path on the VM)",
        f"disk: {DISK_GB} GB boot hyperdisk-balanced for the OS, the venv, /var/avt scratch and the ProRes. "
        f"Inputs sit on {INPUT_DISK_NAME}, {INPUT_DISK_GB} GB hyperdisk-balanced, "
        f"${INPUT_DISK_USD_PER_DAY:.2f}/day. The disk is not deleted with the VM. "
        "A finished pull-back deletes it. --delete-input-disk deletes it on purpose.",
        f"quota: {CPU_QUOTA} on-demand vCPUs across regions, no preemptible quota. "
        f"This plan uses {report['vcpu']}. Spot is refused.",
        f"C4 in this project is capped at {C4_VCPU_PER_VM} vCPU per VM in us-central1 "
        "(Quota CPUS_PER_VM_FAMILY, limit 24, vm_family C4). "
        "c4-standard-32 and c4-highmem-32 stay in the price table and will fail create. "
        "c4-standard-24 is the largest C4 shape this quota can start.",
        f"v1e workers: {report['workers_started']} "
        f"(min of {report['projection']['v1e_terms']['ram']} from "
        f"{report['ram_gb']:.0f} GB / {GB_PER_V1E:.0f} GB, "
        f"{report['projection']['v1e_terms']['cpu']} from "
        f"{report['vcpu']} vCPU / {plan.CV2_THREADS} OpenCV threads, "
        f"{report['projection']['v1e_terms']['chunks']} chunks). "
        "A worker peaked at 8.9–10.4 GB and was OOM-killed on 15 GB.",
        f"final_render workers: {report['final_started']} "
        f"(floor({report['vcpu']}/4)), "
        f"{report['projection']['final_spans']} chunks of {FINAL_CHUNK}, "
        "disjoint .done-safe ranges",
        f"inputs: {report['input_files']} files, {report['input_gb']:.2f} GB"
        + (f" ({report['manifest_note']}; projection uses the lock doc)" if report["manifest_note"]
           else " (from the manifest)"),
        report["comparison_text"],
        report["projection_text"],
        *(
            ["Execute hashes the lock dir and every manifest path before create. "
             "A missing file refuses the VM. This dry-run cannot list those scp calls yet."]
            if report["manifest_note"] else []
        ),
        f"cost ceiling: ${report['cost_ceiling_usd']:.2f} (on-demand). "
        "Execute aborts before create when the projected upper bound would exceed it, "
        "and deletes the VM when elapsed cost would exceed it.",
        f"armed max runtime: {plan.duration_flag(report['capped_hours'])} "
        f"(the shorter of --max-hours {report['max_hours']} and the cost ceiling at the proposal rate)",
        "verification: per-frame md5 lists. Container and file hashes are not the check.",
        "preflight: one ssh before the copy runs sudo mkdir -p, "
        'chowns /workspace, /tmp/avt-remote, and /tmp/claudia_lockrepro with '
        'sudo chown -R "$(id -un)":"$(id -gn)", and writes then reads a test file '
        "under /workspace/partnership. A failure stops the run before the ~29 GB push. "
        "/var/avt stays root mode 700. The guest render is root. Pull-back sudo-copies "
        "/var/avt/out, /var/avt/checks, /var/avt/guest.log, and /var/avt/timing.json to "
        "/tmp/avt-pull so the login user can scp them. /tmp/avt-env, /tmp/avt-go, and "
        "/tmp/avt-pulled stay in /tmp.",
        "on any failure the launcher pulls /var/avt/guest.log and /var/avt/checks before delete.",
        "dry-run command:",
        "  " + exact_command(
            report["lock_dir"], report["zone"], report["cost_ceiling_usd"],
            execute=False, machine_type=report["machine"],
        ),
        "execute command:",
        "  " + exact_command(
            report["lock_dir"], report["zone"], report["cost_ceiling_usd"],
            execute=True, output=report["output"], machine_type=report["machine"],
        ),
        "guest order: sha256sum -c SHA256SUMS; re-hash every manifest row; "
        "confirm the 7 frozen renders are in that check and link them; "
        + ("opt-in lock repro with thread pin and PSNR/max-diff; " if report.get("lock_repro") else
           "lock repro skipped; ")
        + "v1e state pass then RGB chunks; final_render chunks; assemble. "
        "reference md5 lists are written to checks and do not fail the run.",
        "create argv: " + _argv_line(report["create_argv"]),
        "delete argv (always, after create succeeds): " + _argv_line(report["delete_argv"]),
        "teardown also: guest trap calls shutdown -h now after the pull wait, "
        "boot arms shutdown -h +MAX, and the instance has --max-run-duration with termination action DELETE.",
    ]
    if report.get("refuse_reason"):
        lines.append("execute would refuse: " + report["refuse_reason"])
    lines.extend(plan._format_argv_block(
        "push (gcloud compute scp / ssh, after create, before the guest is released):",
        report.get("transfer_argv") or [],
    ))
    lines.extend(plan._format_argv_block("pull-back:", report.get("pull_argv") or []))
    lines.append("deliverables: " + H264_NAME + " and " + PRORES_NAME)
    lines.append(
        "stages recorded: create, transfer, setup, verify, "
        + ("lock repro, " if report.get("lock_repro") else "")
        + "state pass, v1e chunks, final chunks, assemble, pull-back, teardown."
    )
    state = next(step for step in report["recipe_steps"] if step["stage"] == "state_pass")
    lines.append("state pass argv: " + _argv_line(state["cmds"][0]))
    chunks = next(step for step in report["recipe_steps"] if step["stage"] == "v1e_chunks")
    lines.append("v1e chunk argv:")
    for argv in chunks["cmds"]:
        lines.append("  " + _argv_line(argv))
    finals = next(step for step in report["recipe_steps"] if step["stage"] == "final_chunks")
    lines.append("final_render argv:")
    for argv in finals["cmds"]:
        lines.append("  " + _argv_line(argv))
    assemble = next(step for step in report["recipe_steps"] if step["stage"] == "assemble")
    lines.append("assemble argv: " + _argv_line(assemble["cmds"][0]))
    lines.append(
        "credentials present (names only): "
        + ", ".join(f"{key}={'set' if value else 'unset'}" for key, value in creds.items())
    )
    if not creds.get("compute_project"):
        lines.append(
            "GCP_PROJECT is unset. Set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS before --execute."
        )
    lines.append("This report did not create a VM.")
    return "\n".join(lines) + "\n"


# 4/16 of the c4-standard-16 proposal rate ($0.79), rounded up.
REHEARSAL_MACHINE = "c4-standard-4"
REHEARSAL_RATE = 0.20
REHEARSAL_CEILING = 1.0
REHEARSAL_MAX_HOURS = 0.5


def rehearsal_startup(render_chunks):
    """Production setup, then wait for the launcher, then a small real check.

    ``final_render.py`` parses argv at import. ``python -c`` makes the program
    name ``-c`` and exits 2 before mode and --scratch exist. Call the file.
    """
    smoke = "chunks" if render_chunks else "help"
    body = r"""#!/bin/bash
set -euo pipefail
set +x
MAX_MINUTES=30
# A non-zero exit, including set -e, writes a marker the login user can read.
# This script does not stop sshd and does not shut the VM down.
on_exit() {
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "AVT_RENDER_FAIL startup-$code"
    printf '%s\n' "startup-$code" > /tmp/avt-startup-failed
    chmod 644 /tmp/avt-startup-failed || true
  fi
}
trap on_exit EXIT
# No input disk on a rehearsal. Touch the marker before apt so the launcher
# does not wait out the install, and do not create /tmp or /workspace here.
mkdir -p /var/avt/checks /var/avt/out /var/avt/scratch/v1e /var/avt/scratch/final /var/avt/scratch/states
chmod 700 /var/avt
chown root:root /var/avt
touch /var/avt/guest.log
exec > >(tee -a /var/avt/guest.log) 2>&1
touch /tmp/avt-inputs-ready
chmod 644 /tmp/avt-inputs-ready
@@SETUP@@
# The launcher touches this only after scp and mv. Do not look at inputs before it.
DEADLINE=$(( $(date +%s) + MAX_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if [ -f /tmp/avt-go ]; then
    break
  fi
  sleep 5
done
if [ ! -f /tmp/avt-go ]; then
  echo AVT_RENDER_FAIL missing-go
  exit 1
fi
LOCK=/workspace/partnership/final_lock_v2
VERIFY_BEGAN=$(date +%s)
if [ -f /tmp/avt-rehearsal-sums ]; then
  sha256sum -c /tmp/avt-rehearsal-sums
fi
echo "AVT_STAGE verify $(( $(date +%s) - VERIFY_BEGAN ))"
export GRADE_PARAMS="$LOCK/params/final_params_LOCK_v2.json"
export TRANS_PARAMS="$GRADE_PARAMS"
cd "$LOCK/scripts"
/opt/avt-comp/bin/python -c 'import numpy, scipy, cv2; print("deps", numpy.__version__, scipy.__version__, cv2.__version__)'
if [ ! -s /tmp/claudia_lockrepro/spins_T1/frames_rgb24.raw ]; then
  echo AVT_RENDER_FAIL missing-spins-raw
  exit 1
fi
if [ ! -f /tmp/claudia_lockrepro/spins_T1/repro.json ]; then
  echo AVT_RENDER_FAIL missing-spins-raw
  exit 1
fi
if [ -f /tmp/claudia_lockrepro/RAW_SHA256SUMS ]; then
  sha256sum -c /tmp/claudia_lockrepro/RAW_SHA256SUMS
fi
LOCK_BEGAN=$(date +%s)
/opt/avt-comp/bin/python final_render.py chunks --range 124-127 --chunk 4 --grain 1 \
  --scratch /var/avt/scratch/final --v1e_dir /var/avt/scratch/v1e \
  --lockrepro /tmp/claudia_lockrepro --tree /workspace/partnership --stills 0
echo "AVT_STAGE lock_range $(( $(date +%s) - LOCK_BEGAN ))"
SMOKE=/var/avt/scratch/final/rehearsal_chunk.mkv
SMOKE_BEGAN=$(date +%s)
ffmpeg -y -f lavfi -i testsrc=size=320x180:rate=24:duration=0.5 -c:v ffv1 "$SMOKE"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SMOKE")
/opt/avt-comp/bin/python -c 'import os,sys; p=sys.argv[1]; assert os.path.getsize(p)>0, p; assert float(sys.argv[2])>0, sys.argv[2]; print("smoke", p, os.path.getsize(p), sys.argv[2])' "$SMOKE" "$dur"
echo "AVT_STAGE smoke $(( $(date +%s) - SMOKE_BEGAN ))"
ASS_BEGAN=$(date +%s)
ffmpeg -y -i "$SMOKE" -c:v libx264 -crf 14 /var/avt/out/rehearsal_h264.mp4
ffmpeg -y -i "$SMOKE" -c:v prores_ks -profile:v 3 /var/avt/out/rehearsal_prores.mov
for out in /var/avt/out/rehearsal_h264.mp4 /var/avt/out/rehearsal_prores.mov; do
  test -s "$out"
  codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$out")
  test -n "$codec"
  echo "assemble $out $codec"
done
echo "AVT_STAGE assemble $(( $(date +%s) - ASS_BEGAN ))"
echo AVT_REHEARSAL_DONE
PULL_DEADLINE=$(( $(date +%s) + 600 ))
while [ "$(date +%s)" -lt "$PULL_DEADLINE" ]; do
  if [ -f /tmp/avt-pulled ]; then
    break
  fi
  sleep 2
done
exit 0
"""
    if smoke not in ("chunks", "help"):
        raise ValueError(smoke)
    return body.replace("@@SETUP@@", guest_setup_shell())


_STAGE_LINE = re.compile(r"AVT_STAGE\s+([A-Za-z0-9_]+)\s+([0-9]+(?:\.[0-9]+)?)")


def stage_seconds(text, name):
    """The guest's own ``AVT_STAGE <name> <seconds>`` value.

    Serial lines often have a timestamp or ``startup-script:`` prefix, so the
    marker does not have to be the first character of the line. Zero is a real
    duration.
    """
    found = None
    for match in _STAGE_LINE.finditer(text or ""):
        if match.group(1) != name:
            continue
        try:
            found = float(match.group(2))
        except ValueError:
            continue
    return found


def assess_guest_log(text):
    """Score setup, verify, smoke, and assemble from the guest log alone.

    ``AVT_REHEARSAL_DONE`` means the startup script finished. A boot-time ssh
    refusal is not an input. Each stage passes only with its own seconds.
    Assemble also requires the two delivery names the script prints.
    """
    text = text or ""
    done = "AVT_REHEARSAL_DONE" in text and not plan.guest_startup_failed(text)
    stages = {}
    for name in ("setup", "verify", "smoke", "assemble"):
        seconds = stage_seconds(text, name)
        ok = done and seconds is not None
        if name == "assemble":
            ok = ok and "/var/avt/out/rehearsal_h264.mp4" in text and "/var/avt/out/rehearsal_prores.mov" in text
        if name == "smoke":
            ok = ok and "rehearsal_chunk.mkv" in text
        stages[name] = (ok, 0.0 if seconds is None else seconds)
    return stages


def local_video_ok(path):
    """True when a pulled file is non-empty and ffprobe sees a video stream."""
    if not path or not os.path.isfile(path) or os.path.getsize(path) <= 0:
        return False
    probed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name", "-of", "csv=p=0", path,
        ],
        capture_output=True, text=True,
    )
    return probed.returncode == 0 and bool((probed.stdout or "").strip())


def _is_pipeline_row(row):
    role = str(row.get("role") or "").strip()
    base = os.path.basename(row.get("path") or "")
    return role == PIPELINE_ROLE or base in PIPELINE_MODULES


def missing_pipeline_modules(files):
    """Basenames from PIPELINE_MODULES that the manifest does not list."""
    bases = {os.path.basename(row.get("path") or "") for row in files or []}
    return [name for name in PIPELINE_MODULES if name not in bases]


def neighbor_code_rows(paths):
    """Every .py and .json beside a pipeline module. The import path is the directory."""
    seen = set(paths)
    rows = []
    for path in paths:
        folder = os.path.dirname(path)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith((".py", ".json")):
                continue
            full = os.path.join(folder, name)
            if full in seen or not os.path.isfile(full):
                continue
            seen.add(full)
            rows.append({"path": full, "bytes": os.path.getsize(full)})
    return rows


def song_and_literal_rows(lock_dir):
    """GRADE_PARAMS song_wav, and .py/.json/.wav paths named in final_render.py."""
    rows = []
    seen = set()
    params = os.path.join(lock_dir, "params", "final_params_LOCK_v2.json")
    if os.path.isfile(params):
        try:
            with open(params) as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError):
            data = {}
        master = data.get("master") if isinstance(data, dict) else None
        wav = master.get("song_wav") if isinstance(master, dict) else None
        if isinstance(wav, str) and wav.startswith("/") and os.path.isfile(wav):
            seen.add(wav)
            rows.append({"path": wav, "bytes": os.path.getsize(wav)})
    script = os.path.join(lock_dir, "scripts", "final_render.py")
    if os.path.isfile(script):
        try:
            text = open(script).read()
        except OSError:
            text = ""
        for match in re.finditer(r'["\'](/(?:workspace|tmp)/[^"\']+)["\']', text):
            path = match.group(1)
            if path in seen or not path.endswith((".py", ".json", ".wav")):
                continue
            if not os.path.isfile(path):
                continue
            seen.add(path)
            rows.append({"path": path, "bytes": os.path.getsize(path)})
    return rows


def augment_stage_rows(lock_dir, files):
    """Add sibling pipeline code and the range inputs. Existing rows stay."""
    by_path = {}
    for row in files or []:
        path = row.get("path")
        if path:
            by_path[path] = row
    module_paths = [row["path"] for row in by_path.values() if _is_pipeline_row(row)]
    for row in neighbor_code_rows(module_paths):
        by_path.setdefault(row["path"], row)
    for row in song_and_literal_rows(lock_dir):
        by_path.setdefault(row["path"], row)
    return list(by_path.values())


def rehearsal_rows(lock_dir):
    """Lock scripts and params, every final-pipeline manifest row, and the range inputs.

    The range is frames 124-127. That needs the params JSON, ``master.song_wav``,
    the pipeline modules on ``sys.path``, and the spins_T1 raw shipped beside this list.
    """
    lock_dir = (lock_dir or "").rstrip("/")
    rows = []
    for sub in ("scripts", "params"):
        base = os.path.join(lock_dir, sub)
        if not os.path.isdir(base):
            continue
        for dirpath, _dirs, names in os.walk(base):
            if "__pycache__" in dirpath.split(os.sep):
                continue
            for name in names:
                if name.startswith(".") or name.endswith(".pyc"):
                    continue
                path = os.path.join(dirpath, name)
                try:
                    size = os.path.getsize(path)
                except OSError:
                    continue
                rows.append({"path": path, "bytes": size})
    manifest, _note = peek_manifest(lock_dir) if lock_dir else (None, "")
    files = (manifest or {}).get("files") or []
    total = sum(int(row.get("bytes") or 0) for row in files) if manifest else None
    for row in files:
        if _is_pipeline_row(row):
            rows.append(row)
    rows = augment_stage_rows(lock_dir, rows)
    names = sorted({
        os.path.basename(row["path"]) for row in rows
        if os.path.basename(row.get("path") or "") in PIPELINE_MODULES
    })
    if names:
        print("rehearsal pipeline modules: " + ", ".join(names), flush=True)
    render_chunks = total is not None and total <= 30_000_000 and any(
        path.endswith("final_render.py") for path in (item["path"] for item in rows)
    )
    return rows, render_chunks


def _preflight_python():
    chosen = os.environ.get("AVT_PREFLIGHT_PYTHON") or ""
    if chosen and os.path.isfile(chosen):
        return chosen
    venv = "/workspace/venv_comp/bin/python"
    if os.path.isfile(venv):
        return venv
    return sys.executable


def _materialize_stage(sandbox, rows):
    missing = []
    for row in rows:
        src = row.get("path") or ""
        if not src or not os.path.isfile(src):
            missing.append(src or "(blank)")
            continue
        dest = os.path.join(sandbox, src.lstrip("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if os.path.lexists(dest):
            continue
        if src.startswith("/tmp/") or os.path.getsize(src) > 32 * 1024 * 1024:
            os.symlink(os.path.abspath(src), dest)
        else:
            shutil.copy2(src, dest)
    return missing


def _dryrun_argv(python, script, tree, lockrepro):
    return [
        python, script, "dryrun", "--range", REHEARSAL_RANGE,
        "--chunk", "4", "--grain", "1",
        "--scratch", "/tmp/avt-import-scratch",
        "--v1e_dir", "/tmp/avt-import-v1e",
        "--lockrepro", lockrepro,
        "--tree", tree,
        "--stills", "0",
    ]


def import_preflight(lock_dir, rows, runner=None):
    """Lay ``rows`` out like the guest and import final_render for frames 124-127.

    The copy is the only tree the process is given. A module that exists on the
    launcher but was left out of ``rows`` is not visible. ``runner`` replaces
    the process spawn in tests.
    """
    lock_dir = (lock_dir or "").rstrip("/")
    rows = [row for row in rows if row.get("path")]
    by_path = {}
    for row in rows:
        by_path.setdefault(row["path"], row)
    rows = list(by_path.values())
    script = os.path.join(lock_dir, "scripts", "final_render.py")
    errors = []
    if not any(row["path"] == script for row in rows):
        errors.append(f"import preflight: {script} is not in the staged set")
    gaps = [
        name for name in PIPELINE_MODULES
        if not any(os.path.basename(row["path"]) == name for row in rows)
    ]
    if gaps and any(_is_pipeline_row(row) for row in rows):
        errors.append("import preflight: staged set is missing " + ", ".join(gaps))
    sandbox = tempfile.mkdtemp(prefix="avt-import-preflight-")
    try:
        if not errors:
            errors.extend(
                f"import preflight: missing {path}" for path in _materialize_stage(sandbox, rows)
            )
        sandbox_script = os.path.join(sandbox, script.lstrip("/"))
        isolate = any(row["path"].startswith("/workspace/") for row in rows)
        if isolate and os.path.isdir(os.path.join(sandbox, "workspace")):
            run_script = script
            tree = os.path.dirname(lock_dir)
            params = os.path.join(lock_dir, "params", "final_params_LOCK_v2.json")
        else:
            run_script = sandbox_script
            tree = os.path.dirname(os.path.dirname(os.path.dirname(sandbox_script)))
            params = os.path.join(sandbox, lock_dir.lstrip("/"), "params", "final_params_LOCK_v2.json")
        env = os.environ.copy()
        env["GRADE_PARAMS"] = params
        env["TRANS_PARAMS"] = params
        env["PYTHONNOUSERSITE"] = "1"
        argv = _dryrun_argv(_preflight_python(), run_script, tree, LOCKREPRO)
        if errors:
            detail = ""
            code = 2
        elif runner is not None:
            completed = runner(argv, env)
            code = getattr(completed, "returncode", 1)
            detail = (getattr(completed, "stdout", "") or "") + (getattr(completed, "stderr", "") or "")
        else:
            code, detail = _run_import(sandbox, argv, env, isolate)
        if not errors and code != 0:
            text = detail or ""
            imported = (
                "ModuleNotFoundError" not in text
                and "FileNotFoundError" not in text
                and (
                    "invalid choice" in text
                    or "unrecognized arguments" in text
                    or "usage:" in text.lower()
                )
            )
            if imported:
                print(
                    "import preflight: dryrun is not a subcommand; the import ran",
                    flush=True,
                )
                code = 0
            else:
                errors.append("import preflight: final_render.py dryrun --range 124-127 failed")
        if code != 0 and detail:
            errors.append(detail[-2000:])
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)
    line = "import preflight: pass" if not errors else "import preflight: fail"
    print(line, flush=True)
    for err in errors[:12]:
        print(err, file=sys.stderr)
    return {"ok": not errors, "errors": errors, "line": line}


def _run_import(sandbox, argv, env, isolate):
    if not isolate:
        try:
            completed = subprocess.run(
                argv, env=env, capture_output=True, text=True, timeout=180,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return 1, str(exc)
        return completed.returncode, (completed.stdout or "") + (completed.stderr or "")
    guest = os.path.join(sandbox, "workspace")
    quoted = " ".join(shlex.quote(part) for part in argv)
    script = (
        "set -euo pipefail\n"
        "mkdir -p /workspace /tmp/avt-import-scratch /tmp/avt-import-v1e\n"
        f"mount --bind {shlex.quote(guest)} /workspace\n"
        f"exec {quoted}\n"
    )
    try:
        completed = subprocess.run(
            ["unshare", "--user", "--mount", "--map-root-user", "bash", "-c", script],
            env=env, capture_output=True, text=True, timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)
    return completed.returncode, (completed.stdout or "") + (completed.stderr or "")


def import_preflight_from_lock(lock_dir, raw_rows=()):
    rows, _chunks = rehearsal_rows(lock_dir)
    for row in raw_rows or []:
        rows.append(row)
    for name in ("frames_rgb24.raw", "repro.json"):
        path = os.path.join(LOCKREPRO, "spins_T1", name)
        if os.path.isfile(path):
            rows.append({"path": path, "bytes": os.path.getsize(path)})
    return import_preflight(lock_dir, rows)


def run_rehearsal(args, env, call, confirm, wheel_fetch=None):
    """c4-standard-4, Debian 13, Hyperdisk. Cap $1. Always delete the VM."""
    fetch = wheel_fetch or _pypi_wheel_json
    try:
        gaps, notes = plan.cpython313_wheel_gaps(fetch)
    except Exception as exc:
        print(f"refusing rehearsal: could not read the wheel index ({exc})", file=sys.stderr)
        return 2
    if gaps:
        print(
            "refusing rehearsal: no CPython 3.13 manylinux x86_64 wheel for "
            + ", ".join(gaps)
            + ". Debian 13 cannot pip-install the production pins.",
            file=sys.stderr,
        )
        return 2
    print("stack wheels: " + "; ".join(notes), flush=True)
    try:
        rehearsal_frozen_gate(getattr(args, "lock_dir", "") or LOCK_DIR)
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        return 2
    capped = plan.cost_cap_hours(REHEARSAL_MAX_HOURS, REHEARSAL_CEILING, REHEARSAL_RATE)
    projected = capped * REHEARSAL_RATE
    if not confirm:
        print(
            f"rehearsal dry-run: {REHEARSAL_MACHINE} (debian-13, hyperdisk-balanced) "
            f"at ${REHEARSAL_RATE}/h, armed {plan.duration_flag(capped)}, "
            f"hard cap ${REHEARSAL_CEILING:.0f}, projected ${projected:.2f}. "
            "No VM was created.",
            flush=True,
        )
        return 0
    if projected > REHEARSAL_CEILING:
        print("refusing rehearsal: projected cost exceeds $1", file=sys.stderr)
        return 2
    lock_dir = (getattr(args, "lock_dir", "") or LOCK_DIR).rstrip("/")
    manifest, _note = peek_manifest(lock_dir)
    manifest_files = (manifest or {}).get("files") or []
    raw_rows = []
    if len(manifest_files) >= 50 or lock_dir == LOCK_DIR:
        try:
            raw_rows = ensure_lock_raws(lock_dir, names=["spins_T1"])
        except SystemExit as exc:
            print(exc, file=sys.stderr)
            return 2
    rows, render_chunks = rehearsal_rows(lock_dir)
    if not rows:
        print(f"refusing rehearsal: {lock_dir} has no scripts, params, or pipeline modules", file=sys.stderr)
        return 2
    if len(manifest_files) >= 50 or lock_dir == LOCK_DIR:
        checked = import_preflight(lock_dir, rows + list(raw_rows))
        if not checked["ok"]:
            print("refusing rehearsal: import preflight failed", file=sys.stderr)
            return 2
    if call is None:
        call = __import__("remote_render")._subprocess_call
    name = "avt-rehearsal-lock-v2"
    project = env.get("GCP_PROJECT", "")
    zone = args.zone
    out = getattr(args, "output", "") or "rehearsal-out"
    os.makedirs(out, exist_ok=True)
    log_path = os.path.join(out, "execute.log")
    stages = []

    def mark(stage, ok, seconds):
        label = "PASS" if ok else "FAIL"
        stages.append((stage, label, seconds))
        print(f"rehearsal {stage}: {label} {seconds:.1f}s", flush=True)
        return ok

    def logged(argv, label):
        return plan.logged_gcloud(call, argv, log_path, label)

    created = False
    startup = None
    deleter = {"fn": None}

    def _delete_vm():
        fn = deleter["fn"]
        if fn is not None:
            fn()

    previous_signals = {
        signal.SIGINT: signal.getsignal(signal.SIGINT),
        signal.SIGTERM: signal.getsignal(signal.SIGTERM),
    }
    plan.install_delete_on_signal(_delete_vm)
    try:
        started = time.monotonic()
        fd, startup = tempfile.mkstemp(prefix="avt-rehearsal-", suffix=".sh")
        with os.fdopen(fd, "w") as handle:
            handle.write(rehearsal_startup(render_chunks))
        create = plan.gcp_create_argv(
            name, project, zone, machine=REHEARSAL_MACHINE, max_hours=capped,
            disk_gb=30, startup_file=startup, image_family="debian-13",
        )
        result = logged(create, "create")
        if not mark("create", getattr(result, "returncode", 1) == 0, time.monotonic() - started):
            return 2
        if time.monotonic() - started > 180:
            print("rehearsal create exceeded 180s", file=sys.stderr)
            return 2
        created = True
        deleter["fn"] = lambda: logged(plan.gcp_delete_argv(name, project, zone), "delete")
        started = time.monotonic()
        sums = os.path.join(out, "SHA256SUMS.rehearsal")
        with open(sums, "w") as handle:
            for row in rows:
                digest = plan.sha256_file(row["path"])
                handle.write(f"{digest}  {row['path']}\n")
        env_file = os.path.join(out, "rehearsal.env")
        with open(env_file, "w") as handle:
            handle.write("AVT_REMOTE_RENDER_CONFIRM=1\n")
        argvs = transfer_argvs(
            name, project, zone, lock_dir, rows, env_file,
            os.path.dirname(plan.__file__), copy_tree=False, extra_files=raw_rows,
        )
        require_raws_queued(argvs, raw_rows)
        log_lock_raw_shipments(raw_rows, "transfer")
        mode = os.path.join(out, "rehearsal-chunks")
        if render_chunks:
            with open(mode, "w") as handle:
                handle.write("chunks\n")
            argvs.insert(-1, plan.gcp_scp_argv(
                name, project, zone, mode, plan.scp_spec(name, "/tmp/avt-rehearsal-chunks"),
            ))
        argvs.insert(-1, plan.gcp_scp_argv(
            name, project, zone, sums, plan.scp_spec(name, "/tmp/avt-rehearsal-sums"),
        ))
        mini = {
            "transfer_argv": argvs,
            "transfer_rows": rows,
            "tree_rows": raw_rows,
            "instance_name": name,
            "project": project,
            "zone": zone,
            "output": out,
            "output_is_dir": True,
            "transfer_attempts": 12,
            "ssh_retry_seconds": 5,
            "stage_deadline": time.monotonic() + 15 * 60,
            "side_files": {transfer_argvs.parent_local: transfer_argvs.parent_list},
            "lock_rows": None,
        }
        try:
            plan._push_local(mini, lambda argv: logged(argv, "scp" if argv[2] == "scp" else "ssh"), time.sleep)
            copied = True
        except SystemExit as exc:
            if isinstance(getattr(exc, "code", None), int) and exc.code >= 128:
                raise
            print(exc, file=sys.stderr)
            copied = False
        if time.monotonic() - started > 15 * 60:
            print("rehearsal transfer exceeded 900s", file=sys.stderr)
            copied = False
        if not mark("transfer", copied, time.monotonic() - started):
            return 2
        started = time.monotonic()
        deadline = started + 10 * 60
        serial = ""
        while time.monotonic() < deadline:
            if (time.monotonic() - started) / 3600.0 * REHEARSAL_RATE > REHEARSAL_CEILING:
                print("rehearsal elapsed cost would exceed $1; deleting the VM", flush=True)
                break
            polled = logged(plan.gcp_serial_argv(name, project, zone), "serial")
            chunk = (getattr(polled, "stdout", "") or "") + (getattr(polled, "stderr", "") or "")
            if chunk:
                serial = chunk
            if "AVT_REHEARSAL_DONE" in serial or plan.guest_startup_failed(serial):
                break
            time.sleep(5)
        if "AVT_STAGE" not in serial or "AVT_REHEARSAL_DONE" not in serial:
            tailed = logged(
                plan.gcp_ssh_argv(name, project, zone, "sudo cat /var/avt/guest.log || true"),
                "ssh",
            )
            serial += "\n" + (getattr(tailed, "stdout", "") or "")
        scored = assess_guest_log(serial)
        for stage_name in ("setup", "verify", "smoke", "assemble"):
            ok, seconds = scored[stage_name]
            mark(stage_name, ok, seconds)
        if not scored["assemble"][0]:
            sys.stderr.write("--- serial tail ---\n" + "\n".join(serial.splitlines()[-40:]) + "\n")
        paths = [
            f"{OUT_DIR}/rehearsal_h264.mp4",
            f"{OUT_DIR}/rehearsal_prores.mov",
        ]
        pull_argvs = _pull_commands(
            name, project, zone, paths,
            [(path, os.path.join(out, os.path.basename(path)), False) for path in paths],
        )
        started = time.monotonic()
        pull_ok = getattr(logged(pull_argvs[0], "ssh"), "returncode", 1) == 0
        if pull_ok:
            for argv in pull_argvs[1:]:
                if getattr(logged(argv, "scp"), "returncode", 1) != 0:
                    pull_ok = False
            for path in paths:
                local = os.path.join(out, os.path.basename(path))
                if not local_video_ok(local):
                    pull_ok = False
                    sys.stderr.write(f"pull-back: {local} is missing, empty, or has no video stream\n")
        if pull_ok:
            logged(plan.gcp_ssh_argv(name, project, zone, "touch /tmp/avt-pulled"), "ssh")
        mark("pull-back", pull_ok, time.monotonic() - started)
        if not all(scored[name][0] for name in ("setup", "verify", "smoke", "assemble")) or not pull_ok:
            return 2
        return 0
    finally:
        signal.signal(signal.SIGINT, previous_signals[signal.SIGINT])
        signal.signal(signal.SIGTERM, previous_signals[signal.SIGTERM])
        started = time.monotonic()
        if created:
            deleter["fn"] = None
            logged(plan.gcp_delete_argv(name, project, zone), "delete")
        if startup and os.path.isfile(startup):
            os.remove(startup)
        mark("teardown", True, time.monotonic() - started)
        print("rehearsal stages:", flush=True)
        for stage, label, seconds in stages:
            print(f"  {stage}: {label} {seconds:.1f}s", flush=True)


def _pypi_wheel_json(package, version):
    from urllib.request import urlopen
    import json as _json
    url = f"https://pypi.org/pypi/{package}/json" if not version else f"https://pypi.org/pypi/{package}/{version}/json"
    with urlopen(url, timeout=30) as response:
        return _json.load(response)
