"""Plan a Partnership chunked render. This module does not call a cloud API.

The locked compositor is ``render_verse_v9look_v1e_p.py``. It is deterministic
on one machine: a state-only pass writes the running state at each chunk start,
and a chunk that loads that state matches a single pass (see LOCK v1e). Workers
are sized by RAM at 7.5 GB each. Nothing here creates a VM, a bucket, or a bill.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import shlex
import sys
import tarfile
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

GB_PER_WORKER = 7.5
RESERVE_GB = 4.0
# render_verse_v9look_v1e_p.py calls cv2.setNumThreads(6). That is the locked script.
CV2_THREADS = 6

VERSE_SF0 = 3070
VERSE_NF = 1911
FULL_SONG_FRAMES = 5542
SEC_LO = 3.4
SEC_HI = 3.9
OVERHEAD_H = 0.75
# Proposal rate for c4-standard-16. Not a live price quote.
PROPOSAL_USD_PER_HOUR = 0.79
# Hard stop for a paid run. Elapsed cost uses this same on-demand rate, including Spot.
DEFAULT_COST_CEILING_USD = 5.0
# The launcher's lock tree, and a plain scp rate used only for the dry-run line.
# 18e9 bytes at 100 Mbit/s is 0.40 h, which sits inside the 0.75 h setup pad.
LOCAL_TREE_GB = 18.0
ASSUMED_SCP_MBPS = 100.0

# Frames already proven identical between the locked compositor and the chunk
# runner on the Linux box (ptest_v1e/IDENTITY.json, look_v1e_vs_p).
PARITY_SF0 = 3290
PARITY_NF = 12

WORK_ROOT = "/workspace/partnership/second_half"
CHUNK_REL = "claudia_dx/v1/render_verse_v9look_v1e_p.py"
CHUNK_SHA256 = "70cf2a794f78195fb976fd7178d4c2470699600d3ba55f7551d98a6b4d573348"

BUNDLE_OBJECT = (
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/"
    "0c5c4421-1298-4919-bf62-2764ce7837fa/claudia_dx/lock_v1e/LOCK_v1e_bundle.tgz"
)
UPLOAD_PREFIX = (
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/"
    "0c5c4421-1298-4919-bf62-2764ce7837fa/claudia_dx/remote_render"
)
SUPABASE_URL = "https://qoyxgnkvjukovkrvdaiq.supabase.co"

# Members of LOCK_v1e_bundle.tgz, listed from the object in project-clips on 2026-11-22.
# The lock JSON still says "box only" for the chunk runner; the bundle was uploaded after that line.
BUNDLE_MEMBERS = frozenset({
    "claudia_dx/v1/render_verse_v9look_v1e_p.py",
    "claudia_dx/v1/renders/verse_v9look_v1/LOCK_v1e.md",
    "claudia_dx/v1/renders/verse_v9look_v1/LOCK_v1e.json",
    "claudia_dx/v1/renders/verse_v9look_v1/lock_v1e/avt_uploads.json",
    "claudia_dx/v1/renders/verse_v9look_v1/lock_v1e/make_lock.py",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/prove.sh",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/prove2.sh",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/cmp.py",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/cmp_v1e_stills.py",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/memsamp.py",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/IDENTITY.json",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/IDENTITY_v1e_stills.json",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/mem_peak.json",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/mem2_peak.json",
    "claudia_dx/v1/renders/verse_v9look_v1/ptest_v1e/prove.log",
})

# Printed even when --lock is omitted, from LOCK_v1e.md (2026-11-22).
KNOWN_GAPS = (
    "Plate memmaps under claudia_dx/v1/renders/verse_v9look_v1/_plates/ "
    "(about 6.48 GB) are not in AVT storage. The lock says they are rebuildable "
    "and a re-run of plate_prep.py may not be bit-identical. A T7 copy is required.",
    "The two 4K ProRes deliverables under matte_real/deliver/ "
    "(head and body, song 176.000–208.458, about 11.12 GB) are not in AVT storage. "
    "The lock recommends a T7 copy.",
)

MACHINES = {
    "c4-standard-16": {
        "backend": "gcp",
        "vcpu": 16,
        "ram_gb": 60,
        "usd_per_hour": PROPOSAL_USD_PER_HOUR,
        "family": "intel",
    },
    "i7i.4xlarge": {
        "backend": "aws",
        "vcpu": 16,
        "ram_gb": 128,
        "usd_per_hour": None,
        "family": "intel",
    },
    "mac-studio": {
        "backend": "mac",
        "vcpu": None,
        "ram_gb": 32,
        "usd_per_hour": 0.0,
        "family": "apple-arm64",
    },
}


def worker_count(ram_gb, gb_per_worker=GB_PER_WORKER, reserve_gb=RESERVE_GB):
    """How many chunk processes fit. One worker is returned even when RAM is tight."""
    if ram_gb <= 0:
        raise ValueError("ram_gb must be positive")
    usable = ram_gb - reserve_gb
    n = int(usable // gb_per_worker)
    return max(1, n)


def ram_is_tight(ram_gb, gb_per_worker=GB_PER_WORKER, reserve_gb=RESERVE_GB):
    return (ram_gb - reserve_gb) < gb_per_worker


def cpu_slots(vcpu, threads=CV2_THREADS):
    if not vcpu:
        return None
    return max(1, int(vcpu) // threads)


def effective_workers(ram_gb, vcpu):
    """Processes we start follow RAM. Wall-clock uses the CPU cap when we know it."""
    started = worker_count(ram_gb)
    slots = cpu_slots(vcpu)
    if slots is None:
        return started, started
    return started, min(started, slots)


def chunk_ranges(sf0, nf, workers):
    if sf0 < 0 or nf <= 0 or workers <= 0:
        raise ValueError("sf0, nf and workers must describe a real span")
    workers = min(int(workers), int(nf))
    base, rem = divmod(int(nf), workers)
    out = []
    cursor = int(sf0)
    for i in range(workers):
        n = base + (1 if i < rem else 0)
        out.append({
            "index": i,
            "sf0": cursor,
            "nf": n,
            "state_load": None if i == 0 else f"state_{cursor}.npz",
        })
        cursor += n
    return out


def _hours(frames, sec_per_frame, workers):
    return (frames * sec_per_frame / 3600.0) / max(1, workers)


def cost_band(frames, effective, usd_per_hour=PROPOSAL_USD_PER_HOUR,
              sec_lo=SEC_LO, sec_hi=SEC_HI, overhead_h=OVERHEAD_H):
    """Hours and dollars. Proposal case is parallel chunks plus setup, no second full decode.

    The state-only pass walks every frame once before the chunks. Count it when snapshots
    do not already exist. The dollar rate is the proposal's on-demand figure when given.
    """
    def wall(sec, with_state):
        parallel = _hours(frames, sec, effective) + overhead_h
        if with_state:
            parallel += _hours(frames, sec, 1)
        return parallel

    proposal = (wall(sec_lo, False), wall(sec_hi, False))
    with_state = (wall(sec_lo, True), wall(sec_hi, True))
    money = None
    money_state = None
    if usd_per_hour is not None:
        money = (proposal[0] * usd_per_hour, proposal[1] * usd_per_hour)
        money_state = (with_state[0] * usd_per_hour, with_state[1] * usd_per_hour)
    return {
        "frames": frames,
        "effective_workers": effective,
        "proposal_hours": proposal,
        "with_state_pass_hours": with_state,
        "proposal_usd": money,
        "with_state_pass_usd": money_state,
        "usd_per_hour": usd_per_hour,
        "overhead_hours": overhead_h,
        "seconds_per_frame": (sec_lo, sec_hi),
    }


def rel_path(path):
    marker = "second_half/"
    if marker in path:
        return path.split(marker, 1)[1]
    return path.lstrip("/")


def classify_backup(backup, rel=None):
    """Turn one lock-file backup string into an AVT object, an archive member, or a gap."""
    backup = (backup or "").strip()
    if backup == "box only" and rel in BUNDLE_MEMBERS:
        return {
            "kind": "archive_member",
            "bucket": "project-clips",
            "object": BUNDLE_OBJECT,
            "member": rel,
            "note": "lock JSON says box only; the bytes are in LOCK_v1e_bundle.tgz",
        }
    if not backup or backup == "box only" or backup.startswith("rebuildable"):
        return {"kind": "not_on_avt", "detail": backup or "no backup"}
    marker = "project-clips/"
    i = backup.find(marker)
    if i < 0:
        return {"kind": "not_on_avt", "detail": backup}
    rest = backup[i + len(marker):]
    if " :: " in rest:
        obj, member = rest.split(" :: ", 1)
        member = member.split(" (", 1)[0].strip()
        return {
            "kind": "archive_member",
            "bucket": "project-clips",
            "object": obj.strip(),
            "member": member,
        }
    obj = rest.split(" (", 1)[0].strip()
    return {"kind": "object", "bucket": "project-clips", "object": obj}


def summarize_lock(files):
    rows = []
    for item in files:
        rel = rel_path(item["path"])
        row = classify_backup(item.get("backup", ""), rel)
        row.update({
            "path": item["path"],
            "rel": rel,
            "sha256": item.get("sha256"),
            "size": item.get("size"),
            "group": item.get("group"),
        })
        rows.append(row)
    missing = [r for r in rows if r["kind"] == "not_on_avt"]
    return {"files": rows, "missing": missing, "on_avt": len(rows) - len(missing)}


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_tree(rows, root):
    """Hash every file that is present. Missing files and hash mismatches are errors.

    A lock row that is not on AVT is still an error when the local file is absent.
    A local file with the lock's sha256 is accepted, which is how a Mac with a T7
    copy can render pictures that were never uploaded.
    """
    errors = []
    checked = 0
    for row in rows:
        local = os.path.join(root, row["rel"])
        if not os.path.isfile(local):
            if row["kind"] == "not_on_avt":
                errors.append(f"not on AVT and not local: {row['rel']}")
            else:
                errors.append(f"missing local file: {row['rel']}")
            continue
        if not row.get("sha256"):
            errors.append(f"lock row has no sha256: {row['rel']}")
            continue
        got = sha256_file(local)
        checked += 1
        if got != row["sha256"]:
            errors.append(f"sha256 mismatch {row['rel']}: expected {row['sha256']} got {got}")
    return {"checked": checked, "errors": errors, "ok": not errors}


def materialize(rows, root, fetch_to):
    """Write lock rows that are missing locally. ``fetch_to(bucket, object, dest)`` streams one object.

    Rows that are not on AVT are skipped here; ``verify_tree`` reports them if the file is still absent.
    Archive members share one download per tarball.
    """
    archives = {}
    written = []
    for row in rows:
        local = os.path.join(root, row["rel"])
        if os.path.isfile(local) or row["kind"] == "not_on_avt":
            continue
        os.makedirs(os.path.dirname(local), exist_ok=True)
        if row["kind"] == "object":
            fetch_to(row["bucket"], row["object"], local)
            written.append(row["rel"])
        elif row["kind"] == "archive_member":
            key = (row["bucket"], row["object"])
            if key not in archives:
                dest = os.path.join(root, ".avt-archives", os.path.basename(row["object"]))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                fetch_to(key[0], key[1], dest)
                archives[key] = dest
            with tarfile.open(archives[key], "r:*") as tar:
                extracted = tar.extractfile(row["member"])
                if extracted is None:
                    raise SystemExit(f"archive {row['object']} has no member {row['member']}")
                with open(local, "wb") as handle:
                    handle.write(extracted.read())
            written.append(row["rel"])
    return written


def extract_named_tar(blob_path, root):
    """Extract a tarball whose members are paths under the work root. Returns the lock JSON path."""
    with tarfile.open(blob_path, "r:*") as tar:
        if hasattr(tarfile, "data_filter"):
            tar.extractall(root, filter="data")
        else:
            tar.extractall(root)
    return os.path.join(root, "claudia_dx/v1/renders/verse_v9look_v1/LOCK_v1e.json")


def fetch_storage_object(token, anon_key, bucket, object_path, dest, opener=None):
    """Stream one Storage object to ``dest``. Errors do not include the signed URL or the token."""
    opener = opener or urlopen
    sign = Request(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{object_path}",
        data=json.dumps({"expiresIn": 7200}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": anon_key or token,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with opener(sign, timeout=120) as response:
            payload = json.loads(response.read().decode())
    except HTTPError as exc:
        raise SystemExit(f"storage sign failed ({exc.code})") from None
    signed = payload.get("signedURL") or payload.get("signedUrl")
    if not signed:
        raise SystemExit("storage sign failed")
    url = signed if signed.startswith("http") else SUPABASE_URL + "/storage/v1" + signed
    try:
        with opener(url, timeout=300) as response, open(dest, "wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
    except HTTPError as exc:
        raise SystemExit(f"storage download failed ({exc.code})") from None


def differing_pixels_rgb24(reference, candidate):
    """Count pixels whose RGB triple differs. Equal buffers short-circuit to 0."""
    if len(reference) != len(candidate):
        raise ValueError(f"frame byte length {len(reference)} != {len(candidate)}")
    if len(reference) % 3 != 0:
        raise ValueError("rgb24 length must be a multiple of 3")
    if reference == candidate:
        return 0
    ref = memoryview(reference)
    cand = memoryview(candidate)
    differ = 0
    for i in range(0, len(reference), 3):
        if ref[i:i + 3] != cand[i:i + 3]:
            differ += 1
    return differ


def parity_verdict(differing_pixels, backend):
    ok = differing_pixels == 0
    if ok:
        text = (
            "ACCEPTABLE: 0 pixels differ from the reference frames. "
            "On the checked frames this machine matches the locked render. "
            "That is the gate for using the output as the picture."
        )
    elif backend == "mac":
        text = (
            f"NOT ACCEPTABLE as the master: {differing_pixels} pixels differ. "
            "The lock was rendered on Intel Linux (ffmpeg 7.1.5, numpy 2.5.5, scipy 1.18.1). "
            "Apple Silicon uses a different ffmpeg build and a different libm, so ProRes decode "
            "and the compositor's floats need not match. Keep the Mac frames as a preview. "
            "Do not concatenate them into the deliverable. "
            "The picture to ship is a run whose parity diff is 0: the original Linux worker, "
            "or a GCP c4-standard-16 (Intel, the same CPU family)."
        )
    else:
        text = (
            f"NOT ACCEPTABLE: {differing_pixels} pixels differ. "
            "On one machine the chunk runner is bit-identical to a single pass, so a diff means "
            "the decoder, the inputs, or the CPU family is not the lock. "
            "Do not concatenate. Correct the machine or the files and run this check again."
        )
    return {"acceptable": ok, "differing_pixels": differing_pixels, "backend": backend, "verdict": text}


def still_names(sf0=PARITY_SF0, nf=PARITY_NF):
    return [f"full_sf{sf0 + i}.png" for i in range(nf)]


def render_argv(python, script, sf0, nf, out, extra=()):
    return [python, script, "--sf0", str(sf0), "--nf", str(nf), "--out", out, *extra]


def compositor_env(root):
    """Environment the locked command exports. Paths stay under the hardcoded root."""
    return {
        "S07_TAL": os.path.join(root, "claudia_dx/v1/renders/verse_v9look_v1/s07fix/trench_alpha_S07rt_1280_full.npy"),
        "BODYPLACE": os.path.join(root, "claudia_dx/v1/renders/verse_v9look_v1/s07fix/probe_need.json"),
        "ENC_LOSSLESS": "1",
        "ENC_NOAUDIO": "1",
    }


def guest_steps(python, root, run_dir, sf0=VERSE_SF0, nf=VERSE_NF, workers=1,
                parity_sf0=PARITY_SF0, parity_nf=PARITY_NF):
    """Ordered work on the machine that renders. Parity is before any full chunk.

    Parallel chunk steps share ``parallel: True``. The first chunk has no snapshot.
    Later chunks load the state file the state-only pass writes at their start frame.
    """
    script = os.path.join(root, CHUNK_REL)
    chunks = chunk_ranges(sf0, nf, workers)
    parity_dir = os.path.join(run_dir, "parity")
    stills = ",".join(str(parity_sf0 + i) for i in range(parity_nf))
    steps = [{
        "name": "parity",
        "argv": render_argv(
            python, script, parity_sf0, parity_nf, os.path.join(parity_dir, "parity.mp4"),
            ["--stills", stills, "--stilldir", os.path.join(parity_dir, "stills")],
        ),
    }, {
        "name": "compare",
    }]
    state_at = ",".join(str(c["sf0"]) for c in chunks if c["state_load"])
    state_dir = os.path.join(run_dir, "states")
    if state_at:
        steps.append({
            "name": "state_only",
            "argv": render_argv(
                python, script, sf0, nf, os.path.join(state_dir, "unused.mp4"),
                ["--state_only", "--state_at", state_at, "--state_dir", state_dir],
            ),
        })
    for chunk in chunks:
        extra = ["--md5log", os.path.join(run_dir, f"c{chunk['sf0']}.md5")]
        if chunk["state_load"]:
            extra.extend(["--state_load", os.path.join(state_dir, chunk["state_load"])])
        steps.append({
            "name": f"chunk_{chunk['sf0']}",
            "parallel": True,
            "argv": render_argv(
                python, script, chunk["sf0"], chunk["nf"],
                os.path.join(run_dir, f"c{chunk['sf0']}.mp4"), extra,
            ),
        })
    wav = os.path.join(root, "inputs/audio/PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav")
    steps.append({
        "name": "concat",
        "argv": [
            "ffmpeg", "-y", "-v", "error",
            "-f", "concat", "-safe", "0", "-i", os.path.join(run_dir, "chunks.txt"),
            "-ss", f"{sf0 / 24:.6f}", "-i", wav,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest",
            os.path.join(run_dir, "final.mp4"),
        ],
    })
    return {"steps": steps, "chunks": chunks, "env": compositor_env(root)}


def concat_list(chunks):
    return "".join(f"file 'c{c['sf0']}.mp4'\n" for c in chunks)


def state_load_path(argv):
    if "--state_load" not in argv:
        return None
    return argv[argv.index("--state_load") + 1]


def run_pipelined(state_argv, chunk_argvs, spawn, slots, sleep=time.sleep, poll_seconds=0.2,
                  max_spins=100000):
    """Run the state walk beside the chunks. Same argv, so the pixels do not change.

    Chunk 0 has no snapshot and starts at once. A later chunk starts when its
    ``state_<frame>.npz`` is on disk and a CPU slot is free. The state process
    holds one slot until it exits. ``spawn`` returns an object with ``poll``,
    ``wait``, and ``kill`` (a ``subprocess.Popen``).
    """
    slots = max(1, int(slots))
    running = []
    pending = list(chunk_argvs)
    failed = None
    state_proc = spawn(state_argv)
    running.append(("state", state_proc))

    def reap():
        nonlocal failed
        alive = []
        for name, proc in running:
            code = proc.poll()
            if code is None:
                alive.append((name, proc))
            elif code != 0 and failed is None:
                failed = (name, code)
        running[:] = alive

    spins = 0
    while pending or running:
        spins += 1
        if spins > max_spins:
            for _, proc in running:
                proc.kill()
            raise SystemExit("state walk did not produce the snapshot")
        reap()
        if failed:
            for _, proc in running:
                proc.kill()
            raise SystemExit(f"{failed[0]} exited {failed[1]}")
        started = False
        while pending and len(running) < slots:
            path = state_load_path(pending[0])
            if path and not os.path.isfile(path):
                if state_proc.poll() is not None:
                    for _, proc in running:
                        proc.kill()
                    raise SystemExit(f"state walk ended without {os.path.basename(path)}")
                break
            argv = pending.pop(0)
            running.append(("chunk", spawn(argv)))
            started = True
        if not started:
            sleep(poll_seconds)
    if state_proc.poll() not in (0, None):
        raise SystemExit(f"state exited {state_proc.poll()}")


def run_steps(steps, call, compare, parallel_call=None, on_stage=None, spawn=None, slots=2,
              pipe_sleep=time.sleep):
    """Run steps in order. A failed compare does not start the full render.

    ``call`` and ``parallel_call`` receive argv lists. The default parallel path
    starts every chunk argv through ``call`` only after compare has accepted.
    When ``spawn`` is set, the state walk and the chunks share the CPU slots:
    chunk 0 starts immediately, and a later chunk waits for its snapshot.
    ``on_stage(name, phase)`` sees parity, state_pass, chunks, and concat.
    """
    def mark(name, phase):
        if on_stage is not None:
            on_stage(name, phase)

    i = 0
    while i < len(steps):
        step = steps[i]
        if step["name"] == "compare":
            try:
                result = compare()
            finally:
                mark("parity", "end")
            if not result["acceptable"]:
                raise SystemExit(result["verdict"])
            i += 1
            continue
        if step["name"] == "state_only" and spawn is not None:
            state_argv = step["argv"]
            i += 1
            group = []
            while i < len(steps) and steps[i].get("parallel"):
                group.append(steps[i]["argv"])
                i += 1
            mark("state_pass", "begin")
            mark("chunks", "begin")
            try:
                run_pipelined(state_argv, group, spawn, slots, sleep=pipe_sleep)
            finally:
                mark("state_pass", "end")
                mark("chunks", "end")
            continue
        if step.get("parallel"):
            group = []
            while i < len(steps) and steps[i].get("parallel"):
                group.append(steps[i]["argv"])
                i += 1
            mark("chunks", "begin")
            try:
                if parallel_call:
                    parallel_call(group)
                else:
                    for argv in group:
                        call(argv)
            finally:
                mark("chunks", "end")
            continue
        label = {"parity": "parity", "state_only": "state_pass", "concat": "concat"}.get(step["name"])
        if label:
            mark(label, "begin")
        try:
            call(step["argv"])
        finally:
            # Parity closes after the compare, so a diff is inside that stage.
            if label and label != "parity":
                mark(label, "end")
        i += 1


def credential_status(env):
    """Which credential names are set. Values are never read out of this dict for display."""
    names = (
        "GCP_PROJECT",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "AVT_BATCH_SECRET",
        "AVT_ANON_KEY",
        "AVT_ACCESS_TOKEN",
    )
    present = {name: bool(env.get(name)) for name in names}
    present["compute_project"] = bool(env.get("GCP_PROJECT") or env.get("GOOGLE_CLOUD_PROJECT"))
    return present


def gcp_project_from_env(env):
    return env.get("GCP_PROJECT") or env.get("GOOGLE_CLOUD_PROJECT") or ""


STAGE_LABELS = (
    ("create", "create"),
    ("transfer", "transfer"),
    ("setup", "setup"),
    ("parity", "parity"),
    ("state_pass", "state pass"),
    ("chunks", "chunks"),
    ("concat", "concat"),
    ("pull_back", "pull-back"),
    ("teardown", "teardown"),
)


def duration_flag(hours):
    """A gcloud duration. A whole number of hours stays ``Nh`` (an 8h cap still reads 8h)."""
    seconds = max(1, int(math.floor(float(hours) * 3600.0 + 1e-9)))
    if seconds % 3600 == 0:
        return f"{seconds // 3600}h"
    if seconds % 60 == 0:
        return f"{seconds // 60}m"
    return f"{seconds}s"


def cost_cap_hours(max_hours, ceiling_usd, usd_per_hour):
    """The shorter of the caller's hour cap and the on-demand dollar ceiling."""
    if usd_per_hour is None or usd_per_hour <= 0 or ceiling_usd is None:
        return float(max_hours)
    return min(float(max_hours), float(ceiling_usd) / float(usd_per_hour))


def uses_state_pass(chunks):
    return any(chunk.get("state_load") for chunk in chunks)


def transfer_hours(gib=LOCAL_TREE_GB, mbps=ASSUMED_SCP_MBPS):
    """Hours to copy ``gib`` gigabytes (decimal) at ``mbps`` megabits/s."""
    if mbps <= 0:
        raise ValueError("mbps must be positive")
    seconds = (float(gib) * 1_000_000_000 * 8) / (float(mbps) * 1_000_000)
    return seconds / 3600.0


def one_pass_hours(frames, sec, overhead_h=OVERHEAD_H):
    """One in-order pass of every frame, plus setup. Not a second decode on top."""
    return _hours(frames, sec, 1) + overhead_h


def projected_usd_hi(cost, transfer_h=0.0):
    """Upper on-demand dollars for the 2-wide render the owner priced.

    ``cost_band`` also stores a stacked "state pass is a second full decode" figure.
    That stack is not this projection. A copy that finishes inside the setup pad
    adds nothing; a slower copy adds only the part that sticks out past setup.
    """
    rate = cost.get("usd_per_hour")
    if rate is None:
        return None
    extra = max(0.0, float(transfer_h) - float(cost["overhead_hours"]))
    return (cost["proposal_hours"][1] + extra) * rate


def full_song_vs_ceiling(rate, ceiling, slots=2):
    """One line: full-song wall and dollars against the ceiling.

    The first pair is the 2-wide render (the gated projection). The second pair is
    one overlapped pass, which is the wall if ``--state_only`` repeats a full
    decode and occupies one of the two CPU slots while the other slot renders.
    """
    two = cost_band(FULL_SONG_FRAMES, max(1, slots), rate)
    one_hours = (
        one_pass_hours(FULL_SONG_FRAMES, SEC_LO),
        one_pass_hours(FULL_SONG_FRAMES, SEC_HI),
    )
    one_usd = (one_hours[0] * rate, one_hours[1] * rate)

    def side(high):
        return "under" if high <= ceiling else "over"

    return (
        f"full song vs ceiling: {_hours_text(two['proposal_hours'])}, "
        f"{_usd(two['proposal_usd'])} vs ${ceiling:.2f} ({side(two['proposal_usd'][1])}); "
        f"one overlapped pass if state_only repeats a full decode: "
        f"{one_hours[0]:.2f}–{one_hours[1]:.2f} h, ${one_usd[0]:.2f}–${one_usd[1]:.2f} "
        f"vs ${ceiling:.2f} ({side(one_usd[1])})"
    )


def mkdir_command(rels, remote_root=WORK_ROOT):
    dirs = {remote_root, "/var/avt", "/tmp/avt-remote"}
    for rel in rels:
        parent = os.path.dirname(rel)
        if parent and parent != ".":
            dirs.add(os.path.join(remote_root, parent))
    quoted = " ".join(shlex.quote(path) for path in sorted(dirs))
    return f"mkdir -p -- {quoted}"


def gcp_ssh_argv(name, project, zone, command):
    return [
        "gcloud", "compute", "ssh", "--quiet",
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        name,
        "--command", command,
    ]


def gcp_scp_argv(name, project, zone, source, dest, recurse=False):
    argv = ["gcloud", "compute", "scp", "--quiet"]
    if recurse:
        argv.append("--recurse")
    argv.extend([
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        source,
        dest,
    ])
    return argv


def local_transfer_argvs(name, project, zone, rows, source_root, lock_path,
                         env_file, remote_dir, parity_dir=""):
    """Copy the lock tree with scp. No bucket and no AVT credential.

    One ``gcloud compute scp`` per lock row keeps each remote path equal to the
    lock's relative path under the hardcoded work root. Parents are created first
    because scp does not mkdir them. ``touch /tmp/avt-go`` is last, so the guest
    does not start until the tree, the lock, the parity stills, and the runner
    are on the VM.
    """
    remote_root = WORK_ROOT
    rels = [row["rel"] for row in rows]
    argvs = [gcp_ssh_argv(name, project, zone, mkdir_command(rels, remote_root))]
    for row in rows:
        local = os.path.join(source_root, row["rel"])
        remote = os.path.join(remote_root, row["rel"])
        argvs.append(gcp_scp_argv(name, project, zone, local, f"{name}:{remote}"))
    if parity_dir:
        argvs.append(gcp_scp_argv(
            name, project, zone, parity_dir, f"{name}:/var/avt/parity", recurse=True,
        ))
    if lock_path:
        argvs.append(gcp_scp_argv(name, project, zone, lock_path, f"{name}:/var/avt/lock.json"))
    argvs.append(gcp_scp_argv(name, project, zone, env_file, f"{name}:/tmp/avt-env"))
    # Two files, not the whole package: scp of a directory renames into the dest.
    for filename in ("remote_render.py", "plan.py"):
        argvs.append(gcp_scp_argv(
            name, project, zone,
            os.path.join(remote_dir, filename),
            f"{name}:/tmp/avt-remote/{filename}",
        ))
    argvs.append(gcp_ssh_argv(name, project, zone, "touch /tmp/avt-go"))
    return argvs


def local_pull_argvs(name, project, zone, output, timing_path, remote_final=None):
    remote_final = remote_final or os.path.join(WORK_ROOT, "remote_run", "final.mp4")
    return [
        gcp_scp_argv(name, project, zone, f"{name}:{remote_final}", output),
        gcp_scp_argv(name, project, zone, f"{name}:/var/avt/timing.json", timing_path),
    ]


class StageTimer:
    """Wall time per stage. ``clock`` is injectable so tests do not sleep."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.started = {}
        self.seconds = {}

    def begin(self, name):
        self.started[name] = self.clock()

    def end(self, name):
        started = self.started.pop(name, None)
        if started is None:
            self.seconds.setdefault(name, 0.0)
            return self.seconds[name]
        self.seconds[name] = self.clock() - started
        return self.seconds[name]


def parse_stage_markers(text):
    found = {}
    for line in (text or "").splitlines():
        parts = line.strip().split()
        if len(parts) == 3 and parts[0] == "AVT_STAGE":
            try:
                found[parts[1]] = float(parts[2])
            except ValueError:
                continue
    return found


def load_guest_stages(path):
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path) as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    stages = data.get("stages", {}) if isinstance(data, dict) else {}
    out = {}
    for key, value in stages.items():
        try:
            out[str(key)] = float(value)
        except (TypeError, ValueError):
            continue
    return out


def write_guest_timing(path, seconds):
    """Merge guest stage seconds into the file the boot script may already have started."""
    if not path:
        return
    stages = load_guest_stages(path)
    stages.update(seconds)
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w") as handle:
        json.dump({"stages": stages}, handle)


def assemble_timing(launcher_stages, serial_text, timing_path, elapsed_seconds,
                    usd_per_hour, projected_usd, ceiling_usd, output, verified=None,
                    result="done"):
    stages = {}
    stages.update(parse_stage_markers(serial_text))
    stages.update(load_guest_stages(timing_path))
    # The launcher measured these four. A guest echo does not replace them.
    for key in ("create", "transfer", "pull_back", "teardown"):
        if key in (launcher_stages or {}):
            stages[key] = launcher_stages[key]
    elapsed_usd = None
    if usd_per_hour is not None and elapsed_seconds is not None:
        elapsed_usd = (elapsed_seconds / 3600.0) * usd_per_hour
    return {
        "stages": stages,
        "elapsed_vm_seconds": elapsed_seconds,
        "elapsed_usd": elapsed_usd,
        "usd_per_hour": usd_per_hour,
        "projected_usd_hi": projected_usd,
        "cost_ceiling_usd": ceiling_usd,
        "output": output,
        "verified_files": verified,
        "result": result,
    }


def format_timing(summary):
    lines = ["timing and cost:"]
    stages = summary.get("stages") or {}
    labels = summary.get("stage_labels") or STAGE_LABELS
    for key, label in labels:
        if key in stages:
            lines.append(f"  {label}: {stages[key]:.1f}s")
        else:
            lines.append(f"  {label}: not recorded")
    elapsed = summary.get("elapsed_vm_seconds")
    if elapsed is None:
        lines.append("elapsed vm: not recorded")
    else:
        lines.append(f"elapsed vm: {elapsed:.1f}s")
    spent = summary.get("elapsed_usd")
    rate = summary.get("usd_per_hour")
    if spent is None:
        lines.append("elapsed cost: not priced")
    else:
        lines.append(f"elapsed cost: ${spent:.2f} at ${rate}/h on demand")
    projected = summary.get("projected_usd_hi")
    if projected is not None:
        lines.append(f"projected upper bound: ${projected:.2f}")
    ceiling = summary.get("cost_ceiling_usd")
    if ceiling is not None:
        lines.append(f"ceiling: ${ceiling:.2f}")
    lines.append(f"result: {summary.get('result', 'done')}")
    if summary.get("output"):
        lines.append(f"output: {summary['output']}")
    verified = summary.get("verified_files")
    if verified is not None:
        lines.append(f"sha256 checked on the launcher: {verified} files")
    if summary.get("projection_text"):
        lines.append(summary["projection_text"])
    return "\n".join(lines) + "\n"


def _argv_text(argv):
    return " ".join(shlex.quote(part) for part in argv)


def _format_argv_block(title, argvs, limit=24):
    lines = [title]
    if not argvs:
        lines.append("  (none)")
        return lines
    if len(argvs) <= limit:
        lines.extend("  " + _argv_text(argv) for argv in argvs)
        return lines
    head = argvs[:3]
    tail = argvs[-2:]
    lines.extend("  " + _argv_text(argv) for argv in head)
    skipped = len(argvs) - len(head) - len(tail)
    lines.append(f"  ... {skipped} more gcloud compute scp calls ...")
    lines.extend("  " + _argv_text(argv) for argv in tail)
    return lines


def _write_startup(script):
    fd, path = tempfile.mkstemp(prefix="avt-startup-", suffix=".sh")
    with os.fdopen(fd, "w") as handle:
        handle.write(script)
    os.chmod(path, 0o600)
    return path


def _with_startup(argv, path):
    out = []
    for item in argv:
        if item.startswith("startup-script="):
            out.append("startup-script=" + path)
        else:
            out.append(item)
    return out


def gcp_create_argv(name, project, zone, machine="c4-standard-16", spot=False,
                    max_hours=8, disk_gb=200, startup_file="startup.sh",
                    image_family="debian-13"):
    argv = [
        "gcloud", "compute", "instances", "create", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        "--machine-type", machine,
        "--image-family", image_family,
        "--image-project", "debian-cloud",
        "--boot-disk-size", f"{disk_gb}GB",
        "--boot-disk-type", "hyperdisk-balanced",
        "--scopes", "https://www.googleapis.com/auth/logging.write",
        "--metadata-from-file", f"startup-script={startup_file}",
        "--max-run-duration", duration_flag(max_hours),
        "--instance-termination-action", "DELETE",
    ]
    if spot:
        argv.extend(["--provisioning-model", "SPOT", "--maintenance-policy", "TERMINATE"])
    return argv


def gcp_delete_argv(name, project, zone):
    return [
        "gcloud", "compute", "instances", "delete", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        "--quiet",
    ]


def gcp_serial_argv(name, project, zone):
    return [
        "gcloud", "compute", "instances", "get-serial-port-output", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
    ]


def gcp_prepare_argv(name, project, zone, env_file, remote_dir):
    """Copy the env file and this package to the guest. The env file is not metadata."""
    common = ["--project", project or "GCP_PROJECT", "--zone", zone]
    return [
        ["gcloud", "compute", "scp", *common, env_file, f"{name}:/tmp/avt-env"],
        ["gcloud", "compute", "scp", "--recurse", *common, remote_dir, f"{name}:/tmp/avt-remote"],
        ["gcloud", "compute", "ssh", *common, name, "--command", "touch /tmp/avt-go"],
    ]


def startup_script(max_minutes=480, stage_from="avt", vcpu=None):
    """Guest boot script. Trap and a timed shutdown both run, plus GCP max-run-duration.

    Secrets arrive as /tmp/avt-env over scp, not in instance metadata. The trap removes
    that file. The script never echoes the token. Local stage does not put an AVT
    token in the env file; the guest only checks the confirm flag and the lock JSON.
    """
    if stage_from == "local":
        return _startup_script_local(max_minutes, vcpu=vcpu)
    return _startup_script_avt(max_minutes, vcpu=vcpu)


def _vcpu_flag(vcpu):
    if not vcpu:
        return ""
    return f"  --vcpu {int(vcpu)} \\\n"


def _startup_script_avt(max_minutes, vcpu=None):
    return f"""#!/bin/bash
# Generated by scripts/render/remote. Do not put secrets in this file.
set -euo pipefail
set +x
MAX_MINUTES={int(max_minutes)}
mkdir -p /var/avt /workspace/partnership/second_half
chmod 700 /var/avt
cleanup() {{
  rm -f /tmp/avt-env /var/avt/env
  echo AVT_RENDER_CLEANED
  shutdown -h now || true
}}
trap cleanup EXIT
shutdown -h +"$MAX_MINUTES" || true
echo AVT_RENDER_START
for _ in $(seq 1 60); do
  if [ -f /tmp/avt-go ] && [ -f /tmp/avt-env ]; then
    break
  fi
  sleep 10
done
if [ ! -f /tmp/avt-go ] || [ ! -f /tmp/avt-env ]; then
  echo AVT_RENDER_FAIL missing-env
  exit 1
fi
install -m 600 /tmp/avt-env /var/avt/env
rm -f /tmp/avt-env
set -a
. /var/avt/env
set +a
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3-venv python3-pip ffmpeg
python3 -m venv /opt/avt-comp
/opt/avt-comp/bin/pip install --quiet 'numpy==2.5.5' 'scipy==1.18.1' 'opencv-python-headless'
cd /tmp/avt-remote
/opt/avt-comp/bin/python remote_render.py --guest --backend linux \
{_vcpu_flag(vcpu)}  --work-root /workspace/partnership/second_half \
  --parity-dir "${{AVT_PARITY_DIR:-/var/avt/parity}}" || {{
  echo AVT_RENDER_FAIL guest
  exit 1
}}
echo AVT_RENDER_DONE
# Leave the marker visible on the serial console before the trap shuts the guest down.
sleep 20
"""


def _startup_script_local(max_minutes, vcpu=None):
    """Install while the launcher is still copying. Render only after /tmp/avt-go.

    The wait covers a multi-gigabyte scp. It is bounded by the same MAX_MINUTES as
    the guest shutdown, not by a fixed 10 minute poll.
    """
    return f"""#!/bin/bash
# Generated by scripts/render/remote. Local stage: no AVT token is read or echoed.
set -euo pipefail
set +x
MAX_MINUTES={int(max_minutes)}
mkdir -p /var/avt /workspace/partnership/second_half
chmod 700 /var/avt
cleanup() {{
  rm -f /tmp/avt-env /var/avt/env
  if [ -f /var/avt/done ]; then
    echo AVT_RENDER_WAIT_PULL
    PULL_DEADLINE=$(( $(date +%s) + 1800 ))
    while [ "$(date +%s)" -lt "$PULL_DEADLINE" ]; do
      if [ -f /tmp/avt-pulled ]; then
        break
      fi
      sleep 5
    done
  else
    echo AVT_RENDER_FAIL
  fi
  echo AVT_RENDER_CLEANED
  shutdown -h now || true
}}
trap cleanup EXIT
shutdown -h +"$MAX_MINUTES" || true
echo AVT_RENDER_START
export DEBIAN_FRONTEND=noninteractive
SETUP_BEGAN=$(date +%s)
apt-get update
apt-get install -y python3-venv python3-pip ffmpeg
python3 -m venv /opt/avt-comp
/opt/avt-comp/bin/pip install --quiet 'numpy==2.5.5' 'scipy==1.18.1' 'opencv-python-headless'
SETUP_SEC=$(( $(date +%s) - SETUP_BEGAN ))
printf '{{"stages":{{"setup":%s}}}}\\n' "$SETUP_SEC" > /var/avt/timing.json
echo "AVT_STAGE setup ${{SETUP_SEC}}"
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
install -m 600 /tmp/avt-env /var/avt/env
rm -f /tmp/avt-env
set -a
. /var/avt/env
set +a
cd /tmp/avt-remote
/opt/avt-comp/bin/python -u remote_render.py --guest --backend linux \\
  --stage-from local \\
  --lock /var/avt/lock.json \\
{_vcpu_flag(vcpu)}  --work-root /workspace/partnership/second_half \\
  --parity-dir "${{AVT_PARITY_DIR:-/var/avt/parity}}" \\
  --timing-file /var/avt/timing.json || {{
  echo AVT_RENDER_FAIL guest
  exit 1
}}
echo AVT_RENDER_DONE
touch /var/avt/done
exit 0
"""


def _call_each(argvs, call, attempts, sleep, retry_seconds, retry_first_only=False):
    """Run each argv. The first command is the one retried, so a multi-gigabyte scp is not repeated."""
    for index, argv in enumerate(argvs):
        tries = attempts if index == 0 or not retry_first_only else 1
        for attempt in range(tries):
            result = call(argv)
            if getattr(result, "returncode", 1) == 0:
                break
            if attempt + 1 < tries:
                sleep(retry_seconds)
        else:
            raise SystemExit("prepare failed; deleting the instance")


def _elapsed_cost(plan, billing_start, clock):
    if billing_start is None:
        return None
    rate = plan.get("usd_per_hour")
    if rate is None:
        return None
    return ((clock() - billing_start) / 3600.0) * rate


def _guard_elapsed_cost(plan, billing_start, clock):
    ceiling = plan.get("cost_ceiling_usd")
    spent = _elapsed_cost(plan, billing_start, clock)
    if spent is None or ceiling is None:
        return
    if spent > ceiling:
        raise SystemExit(
            f"elapsed cost ${spent:.2f} would exceed the ceiling ${ceiling:.2f}; deleting the instance"
        )


def execute_gcp(plan, call, sleep=time.sleep, clock=time.monotonic):
    """Create the instance, wait, and always delete it if create succeeded.

    ``call(argv)`` returns an object with ``returncode`` and ``stdout``.
    This function does not invent a project and does not skip the delete.
    A local stage hashes the lock tree before create, copies it with scp, and
    pulls ``final.mp4`` back before the delete.
    """
    if not plan.get("confirm"):
        raise SystemExit(
            "refusing to create a VM. Pass --execute and set AVT_REMOTE_RENDER_CONFIRM=1. "
            "A dry-run prints the plan and spends nothing."
        )
    if plan.get("blocked"):
        if plan.get("stage_from") == "local":
            raise SystemExit("refusing to create a VM: --stage-from local needs --lock")
        raise SystemExit(
            "refusing to create a VM: the lock still has inputs that are not on AVT and not in the work tree. "
            "See docs/REMOTE_RENDER.md."
        )
    if plan.get("refuse_reason"):
        raise SystemExit(plan["refuse_reason"])
    if not plan.get("project"):
        raise SystemExit(
            "refusing to create a VM: GCP_PROJECT is unset. "
            "The repo audit found no Compute project. Set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS."
        )
    if plan.get("require_parity_dir", True) and not plan.get("parity_dir"):
        raise SystemExit(
            "refusing to create a VM: --parity-dir is required. "
            "The 12 reference frames are compared before the full render."
        )
    projected = plan.get("projected_usd_hi")
    ceiling = plan.get("cost_ceiling_usd")
    if projected is not None and ceiling is not None and projected > ceiling:
        raise SystemExit(
            f"refusing to create a VM: projected cost ${projected:.2f} "
            f"would exceed the ceiling ${ceiling:.2f}"
        )
    if plan.get("stage_from") == "local" and not plan.get("manifest_checked"):
        if not plan.get("lock_path") or plan.get("lock_rows") is None:
            raise SystemExit("refusing to create a VM: --stage-from local needs --lock")
        checked = verify_tree(plan["lock_rows"], plan.get("source_root") or WORK_ROOT)
        if not checked["ok"]:
            detail = "\n".join(checked["errors"][:20])
            raise SystemExit("local sha256 check failed:\n" + detail)
        plan["verified_files"] = checked["checked"]
        print(f"sha256 ok on the launcher: {checked['checked']} files", flush=True)

    created = False
    billing_start = None
    outcome = None
    pull_failed = False
    serial_text = ""
    startup_path = None
    timer = StageTimer(clock)
    try:
        timer.begin("create")
        try:
            script = plan.get("startup_script")
            create_argv = plan["create_argv"]
            if script:
                startup_path = _write_startup(script)
                create_argv = _with_startup(create_argv, startup_path)
            created_result = call(create_argv)
        finally:
            timer.end("create")
        if created_result.returncode != 0:
            raise SystemExit(f"gcloud create failed ({created_result.returncode}); no instance to delete")
        created = True
        billing_start = clock()
        timer.begin("transfer")
        try:
            if plan.get("stage_from") == "local":
                argvs = plan.get("transfer_argv") or []
            else:
                argvs = plan.get("prepare_argv") or []
            _call_each(
                argvs, call,
                attempts=int(plan.get("transfer_attempts") or 1),
                sleep=sleep,
                retry_seconds=plan.get("ssh_retry_seconds", 5),
                retry_first_only=plan.get("stage_from") == "local",
            )
        finally:
            timer.end("transfer")
        _guard_elapsed_cost(plan, billing_start, clock)
        deadline = clock() + plan["max_seconds"]
        while clock() < deadline:
            _guard_elapsed_cost(plan, billing_start, clock)
            serial = call(plan["serial_argv"])
            serial_text = serial.stdout or ""
            if "AVT_RENDER_DONE" in serial_text:
                outcome = "done"
                break
            if "AVT_RENDER_FAIL" in serial_text:
                if plan.get("failure_pull_argv"):
                    outcome = "failed"
                raise SystemExit("guest reported AVT_RENDER_FAIL; deleting the instance")
            sleep(plan["poll_seconds"])
        else:
            if plan.get("failure_pull_argv"):
                outcome = "timeout"
            raise SystemExit("timed out waiting for the guest; deleting the instance")
    finally:
        if startup_path and os.path.isfile(startup_path):
            os.remove(startup_path)
        if created and outcome != "done" and plan.get("failure_pull_argv"):
            # The guest trap waits so this pull finishes before shutdown or delete.
            # A failed scp must not skip the delete.
            timer.begin("pull_back")
            try:
                if plan.get("output_is_dir") and plan.get("output"):
                    os.makedirs(plan["output"], exist_ok=True)
                serial_path = plan.get("failure_serial_path")
                if serial_path:
                    parent = os.path.dirname(serial_path)
                    if parent:
                        os.makedirs(parent, exist_ok=True)
                    with open(serial_path, "w") as handle:
                        handle.write(serial_text)
                for argv in plan["failure_pull_argv"]:
                    try:
                        call(argv)
                    except (Exception, SystemExit):
                        pass
            except (Exception, SystemExit):
                pass
            finally:
                timer.end("pull_back")
        if created and plan.get("stage_from") == "local" and outcome == "done":
            timer.begin("pull_back")
            try:
                if plan.get("output_is_dir") and plan.get("output"):
                    os.makedirs(plan["output"], exist_ok=True)
                for dest in (plan.get("output"), plan.get("timing_path")):
                    parent = os.path.dirname(dest or "")
                    if parent:
                        os.makedirs(parent, exist_ok=True)
                for argv in plan.get("pull_argv") or []:
                    result = call(argv)
                    failed_pull = getattr(result, "returncode", 1) != 0
                    if failed_pull and (plan.get("pull_strict") or (argv and argv[-1] == plan.get("output"))):
                        pull_failed = True
                if not pull_failed:
                    # The guest trap waits for this before it shuts itself down.
                    call(gcp_ssh_argv(
                        plan["instance_name"], plan.get("project"), plan.get("zone"),
                        "touch /tmp/avt-pulled",
                    ))
            finally:
                timer.end("pull_back")
        timer.begin("teardown")
        try:
            if created:
                deleted = call(plan["delete_argv"])
                if deleted.returncode != 0:
                    call(plan["delete_argv"])
        finally:
            timer.end("teardown")
        elapsed = None if billing_start is None else clock() - billing_start
        summary = assemble_timing(
            timer.seconds,
            serial_text,
            plan.get("timing_path") if plan.get("stage_from") == "local" else "",
            elapsed,
            plan.get("usd_per_hour"),
            plan.get("projected_usd_hi"),
            plan.get("cost_ceiling_usd"),
            plan.get("output"),
            verified=plan.get("verified_files"),
            result=outcome or "aborted",
        )
        if plan.get("stage_labels"):
            summary["stage_labels"] = list(plan["stage_labels"])
        if plan.get("projection"):
            summary["projection"] = plan["projection"]
        if plan.get("projection_text"):
            summary["projection_text"] = plan["projection_text"]
        plan["timing"] = summary
        if plan.get("stage_from") == "local" and plan.get("timing_path"):
            try:
                parent = os.path.dirname(plan["timing_path"])
                if parent:
                    os.makedirs(parent, exist_ok=True)
                with open(plan["timing_path"], "w") as handle:
                    json.dump(summary, handle, indent=2)
                    handle.write("\n")
            except OSError:
                pass
        sys.stdout.write(format_timing(summary))
    if pull_failed:
        raise SystemExit("pull-back failed; the instance was deleted")
    return outcome


def aws_stub(ram_gb=128, vcpu=16):
    started, effective = effective_workers(ram_gb, vcpu)
    return {
        "implemented": False,
        "instance_type": "i7i.4xlarge",
        "family": "intel",
        "ram_gb": ram_gb,
        "vcpu": vcpu,
        "workers_started": started,
        "effective_workers": effective,
        "note": (
            "Stub only. This process does not call AWS, does not create an instance, "
            "and does not look up a price. i7i.4xlarge is the Intel backup named in the proposal "
            "(16 vCPU, 128 GB). Wire it only after the GCP path has a project."
        ),
        "would_run": [
            "aws ec2 run-instances --instance-type i7i.4xlarge  # NOT IMPLEMENTED",
        ],
    }


def storage_upload_request(bucket, object_path, token, body, content_type="video/mp4", anon_key="", content_length=None):
    """A Storage upload request. The token is a header, never part of the URL or an error string."""
    if not token:
        raise SystemExit("refusing upload: AVT_ACCESS_TOKEN is unset")
    if object_path.startswith("/") or ".." in object_path.split("/"):
        raise SystemExit("refusing upload: object path must be relative and stay inside the prefix")
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    if anon_key:
        headers["apikey"] = anon_key
    if content_length is None and isinstance(body, (bytes, bytearray)):
        content_length = len(body)
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    return Request(url, data=body, method="POST", headers=headers)


def build_plan(backend, env, sf0=VERSE_SF0, nf=VERSE_NF, ram_gb=None, vcpu=None,
               spot=False, zone="us-central1-a", max_hours=8, instance_name="avt-render-partnership",
               lock_summary=None, confirm=False, parity_dir="", env_file="/tmp/avt-env",
               stage_from="avt", cost_ceiling=DEFAULT_COST_CEILING_USD, output="final.mp4",
               lock_path="", source_root=None, timing_path=""):
    """One report for dry-run or execute. ``confirm`` is required before any VM create."""
    backend = backend.lower()
    stage_from = (stage_from or "avt").lower()
    if stage_from not in ("avt", "local"):
        raise SystemExit(f"unknown --stage-from {stage_from!r}")
    source_root = source_root or WORK_ROOT
    if not timing_path:
        timing_path = os.path.splitext(output)[0] + ".timing.json"
    if backend == "gcp":
        spec = dict(MACHINES["c4-standard-16"])
        machine = "c4-standard-16"
    elif backend == "aws":
        spec = dict(MACHINES["i7i.4xlarge"])
        machine = "i7i.4xlarge"
    elif backend == "mac":
        spec = dict(MACHINES["mac-studio"])
        machine = "mac-studio"
    elif backend == "linux":
        spec = {"vcpu": vcpu, "ram_gb": ram_gb or 16, "usd_per_hour": 0.0, "family": "linux"}
        machine = "linux-guest"
    else:
        raise SystemExit(f"unknown backend {backend!r}")
    if ram_gb is not None:
        spec["ram_gb"] = ram_gb
    if vcpu is not None:
        spec["vcpu"] = vcpu
    started, effective = effective_workers(spec["ram_gb"], spec.get("vcpu"))
    project = gcp_project_from_env(env) if backend == "gcp" else ""
    missing = []
    rows = None
    if lock_summary is not None:
        missing = lock_summary["missing"]
        rows = lock_summary["files"]
    chunks = chunk_ranges(sf0, nf, started)
    state_pass = uses_state_pass(chunks)
    # AVT execute is blocked while any lock row is absent from storage. Local stage
    # expects those rows on disk; it is blocked only when no lock file was named.
    # The project check is separate so a missing project is not reported as a missing file.
    if backend == "gcp" and stage_from == "local":
        blocked = lock_summary is None
        transfer_h = transfer_hours()
    elif backend == "gcp":
        blocked = lock_summary is None or bool(missing)
        transfer_h = 0.0
    else:
        blocked = False
        transfer_h = 0.0
    rate = spec.get("usd_per_hour")
    cost_verse = cost_band(nf, effective, rate)
    projected = projected_usd_hi(cost_verse, transfer_h if backend == "gcp" else 0.0)
    capped = cost_cap_hours(max_hours, cost_ceiling, rate if backend == "gcp" else None)
    max_seconds = int(float(max_hours) * 3600)
    remote_dir = os.path.dirname(os.path.abspath(__file__))
    plan = {
        "backend": backend,
        "machine": machine,
        "family": spec.get("family"),
        "ram_gb": spec["ram_gb"],
        "vcpu": spec.get("vcpu"),
        "workers_started": started,
        "effective_workers": effective,
        "ram_tight": ram_is_tight(spec["ram_gb"]),
        "gb_per_worker": GB_PER_WORKER,
        "reserve_gb": RESERVE_GB,
        "sf0": sf0,
        "nf": nf,
        "chunks": chunks,
        "cost_verse": cost_verse,
        "cost_full_song": cost_band(FULL_SONG_FRAMES, effective, rate),
        "credentials": credential_status(env),
        "project": project,
        "spot": spot,
        "zone": zone,
        "max_hours": max_hours,
        "max_seconds": max_seconds,
        "instance_name": instance_name,
        "missing": missing,
        "blocked": blocked,
        "confirm": confirm,
        "parity_dir": parity_dir,
        "parity_frames": still_names(),
        "known_gaps": KNOWN_GAPS,
        "upload_prefix": UPLOAD_PREFIX,
        "work_root": WORK_ROOT,
        "chunk_sha256": CHUNK_SHA256,
        "dry_run": not confirm,
        "stage_from": stage_from,
        "cost_ceiling_usd": cost_ceiling,
        "projected_usd_hi": projected,
        "usd_per_hour": rate,
        "transfer_hours": transfer_h if backend == "gcp" else 0.0,
        "scp_mbps": ASSUMED_SCP_MBPS,
        "tree_gb": LOCAL_TREE_GB,
        "uses_state_pass": state_pass,
        "capped_hours": capped,
        "output": output,
        "timing_path": timing_path,
        "lock_path": lock_path,
        "source_root": source_root,
        "lock_rows": rows,
        "verified_files": None,
    }
    if backend == "gcp":
        plan["create_argv"] = gcp_create_argv(
            instance_name, project, zone, machine=machine, spot=spot, max_hours=capped,
        )
        plan["delete_argv"] = gcp_delete_argv(instance_name, project, zone)
        plan["serial_argv"] = gcp_serial_argv(instance_name, project, zone)
        plan["env_file"] = env_file
        plan["prepare_argv"] = gcp_prepare_argv(
            instance_name, project, zone, env_file=env_file, remote_dir=remote_dir,
        )
        if parity_dir:
            plan["prepare_argv"].append([
                "gcloud", "compute", "scp", "--recurse",
                "--project", project or "GCP_PROJECT", "--zone", zone,
                parity_dir, f"{instance_name}:/var/avt/parity",
            ])
        plan["poll_seconds"] = 30
        plan["ssh_retry_seconds"] = 5
        # First ssh only. About two minutes for the guest to accept a connection.
        plan["transfer_attempts"] = 24 if stage_from == "local" else 1
        guest_minutes = max(1, int(math.floor(capped * 60.0)))
        plan["startup_script"] = startup_script(
            max_minutes=guest_minutes, stage_from=stage_from, vcpu=spec.get("vcpu"),
        )
        if stage_from == "local":
            plan["transfer_argv"] = local_transfer_argvs(
                instance_name, project, zone, rows or [], source_root, lock_path,
                env_file=env_file, remote_dir=remote_dir, parity_dir=parity_dir,
            )
            plan["pull_argv"] = local_pull_argvs(
                instance_name, project, zone, output, timing_path,
            )
    elif backend == "aws":
        plan["aws"] = aws_stub(spec["ram_gb"], spec.get("vcpu") or 16)
        plan["blocked"] = True
    elif backend == "mac":
        plan["setup"] = "bash scripts/render/remote/setup-mac.sh"
        plan["blocked"] = False
    return plan


def _rate_line(usd_per_hour):
    if usd_per_hour is None:
        return "rate: not priced (the AWS stub does not look up a price)"
    if usd_per_hour == 0:
        return "rate: $0 cloud (this backend does not rent a machine)"
    return (
        f"rate: {usd_per_hour} USD/h "
        "(c4-standard-16 proposal rate, not a live quote; Spot is not priced, so this is the ceiling)"
    )


def _usd(pair):
    if not pair:
        return "not priced"
    return f"${pair[0]:.2f}–${pair[1]:.2f}"


def _hours_text(pair):
    return f"{pair[0]:.2f}–{pair[1]:.2f} h"


def _stage_lines(plan):
    """How bytes get to the guest. Local stage names no AVT credential."""
    stage = plan.get("stage_from", "avt")
    creds = plan["credentials"]
    lines = [f"stage-from: {stage}"]
    if stage == "local":
        lines.append("transport: gcloud compute scp and gcloud compute ssh. No bucket is created.")
        lines.append("AVT credentials required: none")
        lines.append(
            "AVT_ACCESS_TOKEN, AVT_ANON_KEY, and AVT_BATCH_SECRET are not required "
            "and are not copied to the VM."
        )
        if creds.get("AVT_ACCESS_TOKEN") or creds.get("AVT_ANON_KEY") or creds.get("AVT_BATCH_SECRET"):
            lines.append("An AVT credential is set in the environment and is ignored for this local stage.")
        lines.append(
            "GCS is not used. A bucket would need roles/storage.admin to create and "
            "roles/storage.objectAdmin to read and write objects, plus the storage.googleapis.com API. "
            "Enabling that API needs roles/serviceusage.serviceUsageAdmin. "
            "This mode uses neither. The launcher identity needs roles/compute.instanceAdmin.v1 "
            "and roles/iam.serviceAccountUser only."
        )
        lines.append(f"lock: {plan.get('lock_path') or '(not set — required before execute)'}")
        lines.append(f"source tree: {plan.get('source_root')}")
        rows = plan.get("lock_rows")
        if rows is not None:
            lines.append(f"lock rows: {len(rows)}")
        lines.append(
            "sha256: the launcher checks every lock row against the lock JSON before create, "
            "and the guest checks the same rows again before the parity gate."
        )
    return lines


def _ceiling_lines(plan):
    lines = []
    ceiling = plan.get("cost_ceiling_usd")
    if ceiling is not None:
        lines.append(
            f"cost ceiling: ${ceiling:.2f} (on-demand). "
            "Execute aborts before create when the projected upper bound would exceed it, "
            "and deletes the VM when elapsed cost would exceed it."
        )
    projected = plan.get("projected_usd_hi")
    if projected is not None:
        lines.append(
            f"projected on-demand upper bound for this span (2-wide, setup included): ${projected:.2f}"
        )
        if ceiling is not None and projected > ceiling:
            lines.append(
                "execute would refuse: projected cost exceeds the ceiling. No VM would be created."
            )
    if plan.get("cost_full_song", {}).get("usd_per_hour") is not None and ceiling is not None:
        lines.append(full_song_vs_ceiling(
            plan["cost_full_song"]["usd_per_hour"], ceiling, slots=plan.get("effective_workers") or 2,
        ))
        if plan.get("stage_from") == "local":
            lines.append(
                f"scp {plan.get('tree_gb', LOCAL_TREE_GB):.0f} GB at "
                f"{plan.get('scp_mbps', ASSUMED_SCP_MBPS):.0f} Mbit/s is "
                f"{plan.get('transfer_hours', 0):.2f} h, inside the {OVERHEAD_H} h setup "
                "when the copy is not slower than that pad."
            )
    if plan.get("backend") == "gcp" and plan.get("capped_hours") is not None:
        lines.append(
            f"armed max runtime: {duration_flag(plan['capped_hours'])} "
            f"(the shorter of --max-hours {plan['max_hours']} and the cost ceiling at the proposal rate)"
        )
    return lines


def format_report(plan):
    """Plain-language dry-run. No secret values."""
    creds = plan["credentials"]
    stage = plan.get("stage_from", "avt")
    if stage == "local":
        result_line = f"result: pulled back to {plan.get('output')} (not uploaded to AVT)"
    else:
        result_line = f"upload prefix (project-clips): {plan['upload_prefix']}/<run-id>/"
    lines = [
        f"backend: {plan['backend']} ({plan['machine']}, {plan['family']})",
        f"dry-run: {'yes' if plan['dry_run'] else 'no — execute was requested'}",
        "no VM, disk, bucket, or cloud API call is made by a dry-run.",
        *_stage_lines(plan),
        *_ceiling_lines(plan),
        f"RAM: {plan['ram_gb']} GB, reserve {plan['reserve_gb']} GB, {plan['gb_per_worker']} GB per worker",
        f"workers started (RAM): {plan['workers_started']}",
        f"workers that fit the CPU at once: {plan['effective_workers']} "
        f"(OpenCV is pinned to {CV2_THREADS} threads in the locked script)",
        f"verse span: sf0 {plan['sf0']} nf {plan['nf']} ({len(plan['chunks'])} chunks)",
        f"verse proposal wall clock (parallel chunks + {OVERHEAD_H} h setup, no second decode): "
        f"{_hours_text(plan['cost_verse']['proposal_hours'])}",
        f"verse if the state-only pass is a full extra decode: "
        f"{_hours_text(plan['cost_verse']['with_state_pass_hours'])}",
        f"full song {FULL_SONG_FRAMES} frames, proposal wall clock: "
        f"{_hours_text(plan['cost_full_song']['proposal_hours'])}  "
        f"on-demand upper bound {_usd(plan['cost_full_song']['proposal_usd'])}",
        f"full song including a state-only pass: "
        f"{_hours_text(plan['cost_full_song']['with_state_pass_hours'])}  "
        f"{_usd(plan['cost_full_song']['with_state_pass_usd'])}",
        _rate_line(plan["cost_verse"]["usd_per_hour"]),
        f"parity gate before the full run: frames {plan['parity_frames'][0]} … {plan['parity_frames'][-1]}",
        "acceptable only when differing pixels = 0. Any other count stops the full run.",
        f"chunk script sha256 {plan['chunk_sha256']}",
        result_line,
        "credentials present (names only): "
        + ", ".join(f"{key}={'set' if value else 'unset'}" for key, value in creds.items()),
    ]
    if plan["ram_tight"]:
        lines.append("warning: usable RAM is under 7.5 GB, so a worker may be killed by the OOM killer.")
    if plan["backend"] == "mac":
        lines.append(
            "Mac Studio: run bash scripts/render/remote/setup-mac.sh first. "
            "The locked script hardcodes /workspace/partnership/second_half, so the files have to live there. "
            "Do not edit the script to move it; that would change the sha256."
        )
        lines.append(
            "Apple Silicon vs the lock: 0 differing pixels means the checked frames match and the Mac output can be the picture. "
            "Any differing pixel means the Mac output is a preview only. Ship the Intel run instead."
        )
    if plan["backend"] == "gcp":
        lines.append("create argv: " + " ".join(plan["create_argv"]))
        lines.append(
            "The boot script is generated when you execute. "
            "startup-script=startup.sh in the create line is that slot, not a file you write."
        )
        lines.append("delete argv (always, after create succeeds): " + " ".join(plan["delete_argv"]))
        lines.append("teardown also: guest trap calls shutdown -h now, boot arms shutdown -h +MAX, "
                     "and the instance has --max-run-duration with termination action DELETE.")
        if not creds["compute_project"]:
            lines.append(
                "GCP_PROJECT is unset. The audit found no Compute project in the repos. "
                "Set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS before --execute. "
                "Do not reuse Control Center's GOOGLE_SERVICE_ACCOUNT_JSON; that key is Drive-scoped."
            )
        if stage == "local":
            lines.extend(_format_argv_block(
                "push (gcloud compute scp / ssh, after create, before the guest is released):",
                plan.get("transfer_argv") or [],
            ))
            lines.extend(_format_argv_block("pull-back:", plan.get("pull_argv") or []))
            lines.append(
                "stages recorded: create, transfer, setup, parity, state pass, chunks, concat, pull-back, teardown."
            )
    if plan["backend"] == "aws":
        lines.append(plan["aws"]["note"])
        lines.append(plan["aws"]["would_run"][0])
    if stage == "local":
        lines.append(
            f"Inputs are the rows of {plan.get('lock_path') or 'the --lock JSON'}. "
            f"They are read from {plan.get('source_root')} on this machine and copied to "
            f"{plan['work_root']} on the guest. Nothing is fetched from AVT storage."
        )
        if plan["missing"]:
            lines.append(
                f"lock rows with no AVT object: {len(plan['missing'])}. "
                "Local stage does not need them on AVT. Each one must match the lock sha256 under the source tree."
            )
    else:
        lines.append("Inputs the lock does not have on AVT:")
        for gap in plan["known_gaps"]:
            lines.append(f"  - {gap}")
        if plan["missing"]:
            lines.append(f"lock rows not on AVT: {len(plan['missing'])}")
    if plan["blocked"] and plan["backend"] == "gcp":
        if stage == "local":
            lines.append("GCP execute needs --lock. The file name is not assumed.")
        else:
            lines.append(
                "GCP execute is blocked until GCP_PROJECT is set and every lock row is on AVT. "
                "A Mac with the T7 copy can hash local files and render; the VM only sees AVT."
            )
    lines.append("This report did not create a VM.")
    return "\n".join(lines) + "\n"
