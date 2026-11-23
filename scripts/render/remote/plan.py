"""Plan a Partnership chunked render. This module does not call a cloud API.

The locked compositor is ``render_verse_v9look_v1e_p.py``. It is deterministic
on one machine: a state-only pass writes the running state at each chunk start,
and a chunk that loads that state matches a single pass (see LOCK v1e). Workers
are sized by RAM at 7.5 GB each. Nothing here creates a VM, a bucket, or a bill.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import shlex
import signal
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
# The first LOCK_v2 execute moved about 53 MB/s (424 Mbit/s) and then aborted.
# 100 Mbit/s is 12.5 MB/s, under that measurement, so the printed hours stay high.
# 18e9 bytes at 100 Mbit/s is 0.40 h, which sits inside the 0.75 h setup pad.
LOCAL_TREE_GB = 18.0
OBSERVED_SCP_MB_PER_SEC = 53.0
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
    # us-central1 on-demand. Catalog $1.1860/h (2026-11-12); a second read was $1.2096/h.
    # The higher figure, rounded up. 24 vCPU is this project's C4 per-VM quota.
    "c4-standard-24": {
        "backend": "gcp",
        "vcpu": 24,
        "ram_gb": 90,
        "usd_per_hour": 1.21,
        "family": "intel",
    },
    # us-central1 on-demand, Linux, no disk. Catalog $1.58136/h on 2026-11-12, rounded up.
    "c4-standard-32": {
        "backend": "gcp",
        "vcpu": 32,
        "ram_gb": 120,
        "usd_per_hour": 1.59,
        "family": "intel",
    },
    # us-central1 on-demand. Catalog $2.08542/h; a second read was $2.1169/h.
    # The higher figure, rounded up, so a ceiling check does not under-price the VM.
    "c4-highmem-32": {
        "backend": "gcp",
        "vcpu": 32,
        "ram_gb": 248,
        "usd_per_hour": 2.12,
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
    # An argv list. The wav name has spaces and "&"; a shell string would split it.
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


def wrap_remote_command(script):
    """A ``gcloud compute ssh --command`` string that survives ``split(' ')``.

    gcloud splits ``--command`` on every space and the ssh client joins the
    pieces with one space before the remote shell sees them. A quoted path with
    two spaces in a row would come back as one space. The payload is base64,
    which has no spaces, and bash on the guest runs the real script.
    """
    blob = base64.b64encode(script.encode("utf-8")).decode("ascii")
    return f"printf %s {blob} | base64 -d | bash"


def remote_script(command):
    """The script a wrapped command will run. An ordinary command is returned as-is."""
    if not command or " | base64 -d | bash" not in command or not command.startswith("printf %s "):
        return command or ""
    try:
        blob = shlex.split(command)[2]
        return base64.b64decode(blob).decode("utf-8")
    except (IndexError, ValueError, UnicodeDecodeError):
        return command


def gcloud_rejoin(command):
    """What the remote shell receives after gcloud splits ``--command`` on spaces."""
    return " ".join((command or "").split(" "))


# The Debian ssh user is not root. These trees are the ones that user must write
# with scp. /var/avt is not in this list: the guest render is root and that
# directory stays mode 700.
LOGIN_USER_ROOTS = (
    "/workspace",
    "/tmp/avt-remote",
    "/tmp/claudia_lockrepro",
    "/tmp/avt-stage",
)
VAR_AVT = "/var/avt"
PULL_STAGE = "/tmp/avt-pull"
STAGE_DIR = "/tmp/avt-stage"
STAGE_LOCK = "/tmp/avt-stage/lock.json"
STAGE_PARITY = "/tmp/avt-stage/parity"
PROBE_PATH = "/workspace/partnership/.avt-write-probe"
PROBE_BODY = "avt-write-probe"
# Touched by the guest only after the input disk is mounted, or immediately when
# this boot has no input disk. The launcher must not mkdir /workspace before it.
INPUTS_READY = "/tmp/avt-inputs-ready"


def _under(path, root):
    return path == root or path.startswith(root + "/")


def login_user_roots(dirs):
    """Which login-user trees ``dirs`` touch. Order is stable."""
    found = []
    for root in LOGIN_USER_ROOTS:
        if any(_under(path, root) for path in dirs):
            found.append(root)
    return found


def _split_login_and_var(dirs):
    user, var = [], []
    for path in sorted({p for p in dirs if p and p != "/"}):
        if _under(path, VAR_AVT):
            var.append(path)
        else:
            user.append(path)
    return user, var


def _fail_line(message):
    return f" || fail {shlex.quote(message)}"


def _chown_login_user(roots):
    """chown the login-user trees only. Never a home directory, /etc, or a symlink.

    ``chown -RP`` does not follow a symlink out of the tree into ``~/.ssh`` or sshd's files.
    """
    lines = []
    for root in roots:
        if root not in LOGIN_USER_ROOTS:
            raise ValueError(f"refusing to chown {root}")
        quoted = shlex.quote(root)
        lines.append(
            f"case {quoted} in\n"
            "  /workspace|/tmp/avt-remote|/tmp/claudia_lockrepro|/tmp/avt-stage) ;;\n"
            f"  *) fail {shlex.quote('refusing to chown ' + root)} ;;\n"
            "esac"
        )
        lines.append(
            f"[ ! -L {quoted} ]" + _fail_line(f"refusing to chown symlink {root}")
        )
    quoted = " ".join(shlex.quote(path) for path in roots)
    lines.append(
        f'sudo chown -RP "$(id -un)":"$(id -gn)" -- {quoted}'
        + _fail_line("sudo chown failed")
    )
    return "\n".join(lines)


def prepare_tree_script(dirs, probe="workspace"):
    """Create parent dirs as root, then hand the login-user trees to that user.

    The ssh login on the Debian 13 image cannot create ``/workspace``. The guest
    startup script is root and may mkdir some of the same paths. This command
    does not wait for it. ``mkdir -p`` does not change the owner of a directory
    that already exists, and the chown is in this same ssh, before any scp.

    ``/var/avt`` is created here when asked and then forced back to root mode
    700. It is not chowned to the login user. A probe writes and reads a file
    under ``/workspace/partnership`` so a permission failure stops the run
    before the large copy. ``probe="tmp"`` only checks ``/tmp``, which is where
    ``/tmp/avt-env``, ``/tmp/avt-go``, and ``/tmp/avt-pulled`` live.
    """
    user, var = _split_login_and_var(dirs)
    lines = [
        "set -euo pipefail",
        'fail() { echo "AVT_PREFLIGHT_FAIL: $*" >&2; exit 1; }',
        'sudo -n true || fail "sudo -n was refused; the login user cannot create /workspace"',
    ]
    if probe == "workspace":
        # The root startup mounts the input disk, then touches this file.
        # mkdir before that lands on the boot disk and the mount hides it.
        lines.extend([
            f"ready={shlex.quote(INPUTS_READY)}",
            "deadline=$(( $(date +%s) + 600 ))",
            'while [ ! -f "$ready" ]; do',
            '  if [ "$(date +%s)" -ge "$deadline" ]; then',
            '    fail "input disk was not ready; refusing to mkdir /workspace before the mount"',
            "  fi",
            "  sleep 2",
            "done",
        ])
    if user:
        quoted = " ".join(shlex.quote(path) for path in user)
        lines.append(f"sudo mkdir -p -- {quoted}" + _fail_line("sudo mkdir failed"))
        roots = login_user_roots(user)
        if roots:
            lines.append(_chown_login_user(roots))
    if var:
        quoted = " ".join(shlex.quote(path) for path in var)
        lines.append(f"sudo mkdir -p -- {quoted}" + _fail_line("sudo mkdir of /var/avt failed"))
        lines.append(
            "sudo chown root:root -- /var/avt"
            + _fail_line("could not keep /var/avt owned by root")
        )
        lines.append(
            "sudo chmod 700 -- /var/avt"
            + _fail_line("could not keep /var/avt mode 700")
        )
    for path in user + var:
        # sudo, because /var/avt is mode 700 and the login user cannot search it.
        lines.append(
            "sudo -n test -d " + shlex.quote(path)
            + _fail_line(f"missing after mkdir: {path}")
        )
    if probe == "workspace":
        lines.extend([
            "sudo mkdir -p -- /workspace/partnership"
            + _fail_line("sudo mkdir of /workspace/partnership failed"),
            _chown_login_user(["/workspace"]),
            f"probe={shlex.quote(PROBE_PATH)}",
            f"printf '%s\\n' {shlex.quote(PROBE_BODY)} > \"$probe\""
            + _fail_line("login user cannot write /workspace/partnership"),
            'read_back=$(cat -- "$probe")'
            + _fail_line("login user cannot read the test file under /workspace/partnership"),
            'rm -f -- "$probe"'
            + _fail_line("login user cannot remove the test file under /workspace/partnership"),
            '[ "$read_back" = avt-write-probe ]'
            + _fail_line("the test file under /workspace/partnership did not read back"),
        ])
    if probe in ("workspace", "tmp"):
        lines.extend([
            "tmp_probe=/tmp/avt-write-probe",
            f"printf '%s\\n' {shlex.quote(PROBE_BODY)} > \"$tmp_probe\""
            + _fail_line(
                "login user cannot write /tmp "
                "(needed for /tmp/avt-env, /tmp/avt-go, and /tmp/avt-pulled)"
            ),
            'rm -f -- "$tmp_probe"'
            + _fail_line("login user cannot remove a file in /tmp"),
        ])
    lines.append("echo AVT_PREFLIGHT_OK")
    return "\n".join(lines) + "\n"


def preflight_refused(result):
    """True when the guest script reported a permission failure, not a dead ssh."""
    return "AVT_PREFLIGHT_FAIL" in _result_text(result)


def mkdir_command(rels, remote_root=WORK_ROOT):
    dirs = {remote_root, "/tmp/avt-remote", STAGE_DIR, "/workspace/partnership", VAR_AVT}
    for rel in rels:
        parent = os.path.dirname(rel)
        if parent and parent != ".":
            dirs.add(os.path.join(remote_root, parent))
    return wrap_remote_command(prepare_tree_script(dirs, probe="workspace"))


def install_var_avt_script(lock=False, parity=False):
    """Move staged files into ``/var/avt`` as root and lock the directory.

    scp runs as the login user. ``/var/avt`` is mode 700, so the user cannot
    write it. The files land in ``/tmp/avt-stage`` and this ssh installs them.
    """
    lines = [
        "set -euo pipefail",
        'fail() { echo "AVT_PREFLIGHT_FAIL: $*" >&2; exit 1; }',
        'sudo -n true || fail "sudo -n was refused while installing /var/avt"',
        "sudo mkdir -p -- /var/avt" + _fail_line("sudo mkdir of /var/avt failed"),
    ]
    if parity:
        lines.extend([
            "if [ -d /tmp/avt-stage/parity ]; then",
            "  sudo rm -rf -- /var/avt/parity" + _fail_line("could not replace /var/avt/parity"),
            "  sudo cp -a -- /tmp/avt-stage/parity /var/avt/parity"
            + _fail_line("could not install parity stills into /var/avt/parity"),
            "else",
            '  fail "parity stills were not staged at /tmp/avt-stage/parity"',
            "fi",
        ])
    if lock:
        lines.extend([
            "if [ -f /tmp/avt-stage/lock.json ]; then",
            "  sudo install -m 600 -- /tmp/avt-stage/lock.json /var/avt/lock.json"
            + _fail_line("could not install /var/avt/lock.json"),
            "else",
            '  fail "lock file was not staged at /tmp/avt-stage/lock.json"',
            "fi",
        ])
    lines.extend([
        "sudo chown root:root -- /var/avt" + _fail_line("could not keep /var/avt owned by root"),
        "sudo chmod 700 -- /var/avt" + _fail_line("could not keep /var/avt mode 700"),
        "echo AVT_VAR_AVT_INSTALLED",
    ])
    return "\n".join(lines) + "\n"


def staged_pull_path(remote_path):
    """Login-user path a ``/var/avt`` file is copied to before scp."""
    if remote_path == VAR_AVT or remote_path.startswith(VAR_AVT + "/"):
        return PULL_STAGE + remote_path[len(VAR_AVT):]
    return PULL_STAGE + "/" + os.path.basename(remote_path.rstrip("/"))


def publish_pull_script(paths, required=True):
    """Copy root-only outputs to ``/tmp/avt-pull`` for the login user.

    The guest render runs as root. ``/var/avt`` is mode 700, so a login-user
    ``[ -e ]`` is false for a file that is there, and the copy was skipped.
    Existence is ``sudo test``. A required path that is missing fails the
    script after every path has been attempted, so the scp is not pointed at
    a directory that was never created.
    """
    lines = [
        "set -euo pipefail",
        'fail() { echo "AVT_PULL_FAIL: $*" >&2; exit 1; }',
        'sudo -n true || fail "sudo -n was refused while publishing outputs for pull-back"',
        "sudo rm -rf -- /tmp/avt-pull" + _fail_line("could not clear /tmp/avt-pull"),
        "sudo mkdir -p -- /tmp/avt-pull" + _fail_line("could not create /tmp/avt-pull"),
        "missing=0",
    ]
    for path in paths:
        dest = staged_pull_path(path)
        parent = os.path.dirname(dest) or "/"
        src_q = shlex.quote(path)
        dest_q = shlex.quote(dest)
        lines.append(f"if sudo test -e {src_q}; then")
        lines.append(
            f"  sudo mkdir -p -- {shlex.quote(parent)}"
            + _fail_line(f"could not create {parent}")
        )
        lines.append(f"  sudo rm -rf -- {dest_q}" + _fail_line(f"could not replace {dest}"))
        lines.append(
            f"  sudo cp -a -- {src_q} {dest_q}" + _fail_line(f"could not copy {path}")
        )
        lines.append("else")
        lines.append(f"  echo {shlex.quote('AVT_PULL_MISSING ' + path)} >&2")
        lines.append("  missing=1")
        lines.append("fi")
    lines.extend([
        'sudo chown -R "$(id -un)":"$(id -gn)" -- /tmp/avt-pull'
        + _fail_line("could not chown /tmp/avt-pull to the login user"),
        "sudo chmod -R a+rX -- /tmp/avt-pull"
        + _fail_line("could not make /tmp/avt-pull readable"),
    ])
    if required:
        lines.extend([
            'if [ "$missing" -ne 0 ]; then',
            '  fail "required output was not published"',
            "fi",
        ])
    lines.append("echo AVT_PULL_PUBLISHED")
    return "\n".join(lines) + "\n"


def gcp_ssh_argv(name, project, zone, command):
    # One connection attempt. A refused port must return, not sit in gcloud's own retries.
    return [
        "gcloud", "compute", "ssh", "--quiet",
        "--ssh-flag=-oConnectTimeout=15",
        "--ssh-flag=-oConnectionAttempts=1",
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        name,
        "--command", command,
    ]


# OpenSSH 10 scp speaks SFTP and does not shell-parse the remote path.
# A quote character in the target becomes a literal character in the filename.
INCOMING_ROOT = "/workspace/.avt-incoming"
_UNSAFE_SFTP = set("\"'`& \t\n*?[]{}|\\;<>():")
_SCP_FINAL = {}


def path_needs_staging(path):
    """True when the path must not be an SFTP target.

    Spaces, a second space, ``&``, quotes, apostrophes, and colons are staged
    under an ASCII name and moved with a shell ``mv`` after the copy.
    """
    if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
        return True
    if any(char in _UNSAFE_SFTP for char in path):
        return True
    return False


def tag_final(argv, final):
    """Remember the real guest path of an scp whose target may be a temp name."""
    _SCP_FINAL[tuple(argv)] = final
    return argv


def final_of(argv):
    """Real guest path for an scp argv, or None when it was not tagged."""
    if not argv:
        return None
    return _SCP_FINAL.get(tuple(argv))


def scp_spec(name, path):
    """``instance:path`` for SFTP. The path is literal. No shell quotes.

    Callers stage an unsafe path under ``INCOMING_ROOT`` first. A quote in
    this string would be created on the guest as part of the filename.
    """
    if path_needs_staging(path) or "'" in path or '"' in path:
        raise ValueError(f"refusing an SFTP target that is not a plain path: {path}")
    return f"{name}:{path}"


def scp_remote_path(spec):
    """Literal absolute path after the colon, or None.

    Quote characters are rejected. SFTP would treat them as part of the name,
    and ``shlex`` would hide that.
    """
    host, sep, word = (spec or "").partition(":")
    if not sep or not host or "/" in host:
        return None
    if not word.startswith("/") or "'" in word or '"' in word:
        return None
    return word


def incoming_path(index):
    return f"{INCOMING_ROOT}/{int(index):05d}"


def stage_scp_argv(name, project, zone, local, final, index):
    """One scp argv and, when the final path is unsafe, the ``(temp, final)`` move."""
    if path_needs_staging(final):
        temp = incoming_path(index)
        argv = tag_final(
            gcp_scp_argv(name, project, zone, local, scp_spec(name, temp)),
            final,
        )
        return argv, (temp, final)
    argv = tag_final(
        gcp_scp_argv(name, project, zone, local, scp_spec(name, final)),
        final,
    )
    return argv, None


def incoming_mv_script(pairs):
    """Shell moves. ``shlex.quote`` is correct here: ssh runs a shell, SFTP does not."""
    lines = ["# AVT_INCOMING_MV", "set -euo pipefail"]
    for src, dest in pairs:
        lines.append(f"mv -- {shlex.quote(src)} {shlex.quote(dest)}")
    lines.append("echo AVT_INCOMING_MOVED")
    return "\n".join(lines) + "\n"


def is_incoming_mv(argv):
    if len(argv) < 4 or argv[2:4] != ["ssh", "--quiet"]:
        return False
    return remote_script(argv[-1]).startswith("# AVT_INCOMING_MV")


def mv_pairs_from_script(script):
    pairs = []
    for line in (script or "").splitlines():
        if not line.startswith("mv "):
            continue
        parts = shlex.split(line)
        if len(parts) >= 3 and parts[0] == "mv":
            pairs.append((parts[-2], parts[-1]))
    return pairs


def mv_batch_argvs(name, project, zone, moves):
    """ssh ``mv`` batches that stay under ``ARGV_LIMIT``."""
    if not moves:
        return []
    batches = []
    current = []
    for move in moves:
        trial = current + [move]
        argv = gcp_ssh_argv(
            name, project, zone, wrap_remote_command(incoming_mv_script(trial)),
        )
        if current and not argv_within_limit(argv):
            batches.append(current)
            current = [move]
        else:
            current = trial
    if current:
        batches.append(current)
    return [
        gcp_ssh_argv(name, project, zone, wrap_remote_command(incoming_mv_script(batch)))
        for batch in batches
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
    lock's relative path under the hardcoded work root. The first ssh creates
    those parents with sudo and checks the login user can write
    ``/workspace/partnership``. The lock and the parity stills are staged under
    ``/tmp`` and installed into ``/var/avt`` as root, because that directory is
    mode 700. ``/tmp/avt-env`` and ``touch /tmp/avt-go`` stay in ``/tmp``, which
    the login user can write. ``touch /tmp/avt-go`` is last, so the guest does
    not start until the tree, the lock, the parity stills, and the runner are
    on the VM.
    """
    remote_root = WORK_ROOT
    rels = [row["rel"] for row in rows]
    dirs = {remote_root, "/tmp/avt-remote", STAGE_DIR, "/workspace/partnership", VAR_AVT, INCOMING_ROOT}
    moves = []
    staged = []
    for index, row in enumerate(rows):
        local = os.path.join(source_root, row["rel"])
        remote = os.path.join(remote_root, row["rel"])
        parent = os.path.dirname(remote)
        if parent and parent != ".":
            dirs.add(parent)
        scp_argv, move = stage_scp_argv(name, project, zone, local, remote, index)
        staged.append(scp_argv)
        if move:
            moves.append(move)
    argvs = pack_dir_batches(sorted(dirs), name, project, zone, probe="workspace")
    argvs.extend(staged)
    argvs.extend(mv_batch_argvs(name, project, zone, moves))
    if parity_dir:
        argvs.append(gcp_scp_argv(
            name, project, zone, parity_dir, scp_spec(name, STAGE_PARITY), recurse=True,
        ))
    if lock_path:
        argvs.append(gcp_scp_argv(name, project, zone, lock_path, scp_spec(name, STAGE_LOCK)))
    argvs.append(gcp_scp_argv(name, project, zone, env_file, scp_spec(name, "/tmp/avt-env")))
    # Two files, not the whole package: scp of a directory renames into the dest.
    for filename in ("remote_render.py", "plan.py"):
        argvs.append(gcp_scp_argv(
            name, project, zone,
            os.path.join(remote_dir, filename),
            scp_spec(name, f"/tmp/avt-remote/{filename}"),
        ))
    if parity_dir or lock_path:
        argvs.append(gcp_ssh_argv(
            name, project, zone,
            wrap_remote_command(install_var_avt_script(
                lock=bool(lock_path), parity=bool(parity_dir),
            )),
        ))
    argvs.append(gcp_ssh_argv(name, project, zone, "touch /tmp/avt-go"))
    return argvs


def local_pull_argvs(name, project, zone, output, timing_path, remote_final=None):
    remote_final = remote_final or os.path.join(WORK_ROOT, "remote_run", "final.mp4")
    paths = ["/var/avt/timing.json", remote_final]
    return [
        gcp_ssh_argv(name, project, zone, wrap_remote_command(publish_pull_script(paths))),
        gcp_scp_argv(name, project, zone, scp_spec(name, staged_pull_path(remote_final)), output),
        gcp_scp_argv(
            name, project, zone, scp_spec(name, staged_pull_path("/var/avt/timing.json")), timing_path,
        ),
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
    if summary.get("kept_disk"):
        lines.append(
            f"kept disk: {summary['kept_disk']} ${summary.get('kept_disk_usd_per_day', 0):.2f}/day "
            "(the VM was deleted; this disk was not)"
        )
    if summary.get("output"):
        lines.append(f"output: {summary['output']}")
    verified = summary.get("verified_files")
    if verified is not None:
        lines.append(f"sha256 checked on the launcher: {verified} files")
    if summary.get("projection_text"):
        lines.append(summary["projection_text"])
    return "\n".join(lines) + "\n"


def _argv_text(argv):
    rendered = " ".join(shlex.quote(part) for part in argv)
    if len(argv) >= 2 and argv[-2] == "--command":
        script = remote_script(argv[-1])
        if script and script != argv[-1]:
            rendered += "\n    # remote shell: " + script
    return rendered


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
                    image_family="debian-13", data_disk=""):
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
    if data_disk:
        # auto-delete=no: a failed run keeps the inputs. The VM itself still deletes.
        argv.extend([
            "--disk",
            f"name={data_disk},device-name={data_disk},mode=rw,auto-delete=no",
        ])
    if spot:
        argv.extend(["--provisioning-model", "SPOT", "--maintenance-policy", "TERMINATE"])
    return argv


def gcp_disk_describe_argv(name, project, zone):
    return [
        "gcloud", "compute", "disks", "describe", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        "--format=value(name)",
    ]


def gcp_disk_create_argv(name, project, zone, gb, disk_type="hyperdisk-balanced"):
    return [
        "gcloud", "compute", "disks", "create", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        "--size", f"{int(gb)}GB",
        "--type", disk_type,
        # Baseline performance is free. Anything above it is billed.
        "--provisioned-iops", "3000",
        "--provisioned-throughput", "140",
    ]


def gcp_disk_delete_argv(name, project, zone):
    return [
        "gcloud", "compute", "disks", "delete", name,
        "--project", project or "GCP_PROJECT",
        "--zone", zone,
        "--quiet",
    ]


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


def gcp_prepare_argv(name, project, zone, env_file, remote_dir, parity_dir=""):
    """Copy the env file and this package to the guest. The env file is not metadata.

    ``/tmp/avt-remote`` is not created first. ``scp --recurse`` of a directory
    onto an existing dest nests the package, and the guest ``cd``s to that path.
    ``/tmp`` is world-writable, so the login user creates it. Parity stills are
    staged under ``/tmp`` and installed into ``/var/avt`` as root.
    """
    # No /workspace chown. The AVT guest creates that tree as root and writes it.
    script = prepare_tree_script([STAGE_DIR, VAR_AVT], probe="tmp")
    argvs = [
        gcp_ssh_argv(name, project, zone, wrap_remote_command(script)),
        gcp_scp_argv(name, project, zone, env_file, scp_spec(name, "/tmp/avt-env")),
        gcp_scp_argv(name, project, zone, remote_dir, scp_spec(name, "/tmp/avt-remote"), recurse=True),
    ]
    if parity_dir:
        argvs.append(gcp_scp_argv(
            name, project, zone, parity_dir, scp_spec(name, STAGE_PARITY), recurse=True,
        ))
        argvs.append(gcp_ssh_argv(
            name, project, zone, wrap_remote_command(install_var_avt_script(parity=True)),
        ))
    argvs.append(gcp_ssh_argv(name, project, zone, "touch /tmp/avt-go"))
    return argvs


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
# The guest is root. /workspace is where this stage downloads the lock tree.
# /var/avt stays root mode 700. /tmp/avt-env is scp'd by the login user into /tmp.
mkdir -p /var/avt /workspace/partnership/second_half
chmod 700 /var/avt
chown root:root /var/avt
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
# Do not mkdir /workspace or /tmp/avt-remote here. This script is root, and the
# launcher ssh has to scp into those paths as the login user. mkdir -p after
# /tmp/avt-go does not take an existing directory back from that user.
# /var/avt stays root mode 700. The launcher sudo-copies timing.json out before scp.
mkdir -p /var/avt
chmod 700 /var/avt
chown root:root /var/avt
touch /tmp/avt-inputs-ready
chmod 644 /tmp/avt-inputs-ready
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
# The preflight already created these and chowned them to the login user.
mkdir -p /workspace/partnership/second_half /tmp/avt-remote
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


def manifest_index(argv, rows, root=WORK_ROOT):
    """0-based lock-row index of an scp argv, or None when the argv is not a lock file."""
    if not rows or len(argv) < 3 or argv[2] != "scp":
        return None
    path = final_of(argv)
    if not path:
        for part in argv:
            if ":" not in part:
                continue
            found = scp_remote_path(part)
            if found:
                path = found
                break
    if not path:
        return None
    prefix = root.rstrip("/") + "/"
    for index, row in enumerate(rows):
        remote = _row_remote(row, root)
        if remote == path:
            return index
        rel = row.get("rel") if isinstance(row, dict) else None
        if rel and path == prefix + rel:
            return index
    return None


def _result_text(result):
    stdout = getattr(result, "stdout", "") or ""
    stderr = getattr(result, "stderr", "") or ""
    if stderr and stdout.endswith(stderr):
        return stdout
    if stdout and stderr:
        return stdout + "\n" + stderr
    return stdout or stderr


def _tail_text(text, limit=50):
    lines = (text or "").splitlines()
    if len(lines) <= limit:
        return "\n".join(lines)
    return "\n".join(lines[-limit:])


def format_prepare_failure(index, argv, result, rows=None):
    """The argv and the last output lines of one failed prepare step."""
    where = f"step {index}"
    manifest = manifest_index(argv, rows or [])
    if manifest is None:
        where += "; no lock row on this command"
    else:
        row = rows[manifest] if rows else {}
        rel = (row.get("rel") or row.get("path") or "") if isinstance(row, dict) else ""
        where += f"; manifest index {manifest} (item {manifest + 1})"
        if rel:
            where += f": {rel}"
    lines = [
        f"prepare failed at {where}",
        "argv:",
        _argv_text(argv),
        "--- last output lines ---",
        _tail_text(_result_text(result), 50) or "(no stdout or stderr)",
    ]
    return "\n".join(lines) + "\n"


def prepare_failure_path(output, output_is_dir=False):
    """``<output>/prepare_failure.log``. A file output puts the log beside that file."""
    if not output:
        return None
    if output_is_dir or output.endswith(os.sep) or os.path.isdir(output):
        directory = output
    else:
        directory = os.path.dirname(os.path.abspath(output)) or "."
    return os.path.join(directory, "prepare_failure.log")


def write_prepare_failure(output, text, output_is_dir=False):
    path = prepare_failure_path(output, output_is_dir=output_is_dir)
    if not path:
        return None
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w") as handle:
        handle.write(text)
    return path


def format_gcloud_failure(label, argv, result):
    """argv plus the stderr/stdout of one failed gcloud call."""
    code = getattr(result, "returncode", 1)
    lines = [
        f"gcloud {label} failed ({code})",
        "argv:",
        _argv_text(argv),
        "--- last output lines ---",
        _tail_text(_result_text(result), 50) or "(no stdout or stderr)",
    ]
    return "\n".join(lines) + "\n"


def format_create_failure(argv, result):
    """argv plus the gcloud stderr/stdout of a failed instance create."""
    return format_gcloud_failure("create", argv, result)


def logged_gcloud(call, argv, log_path, label):
    """Run one gcloud argv. A failure is written to stdout and ``log_path``."""
    try:
        result = call(argv)
    except OSError as exc:
        result = type("CallResult", (), {})()
        result.returncode = 1
        result.stdout = ""
        result.stderr = f"{exc.__class__.__name__}: {exc}"
    if getattr(result, "returncode", 1) != 0:
        text = format_gcloud_failure(label, argv, result)
        sys.stdout.write(text)
        sys.stderr.write(text)
        if log_path:
            try:
                parent = os.path.dirname(log_path)
                if parent:
                    os.makedirs(parent, exist_ok=True)
                with open(log_path, "a") as handle:
                    handle.write(text)
            except OSError as exc:
                sys.stderr.write(f"could not write {log_path} ({exc})\n")
    return result


def _wheel_names(payload):
    urls = payload.get("urls") or []
    return [item.get("filename") or "" for item in urls]


def wheel_supports_cpython313_manylinux_x86_64(filename):
    """True for a cp313 wheel or an abi3 wheel pip can install on CPython 3.13."""
    name = filename or ""
    if "manylinux" not in name or "x86_64" not in name or not name.endswith(".whl"):
        return False
    return "cp313" in name or "abi3" in name


def cpython313_wheel_gaps(fetch):
    """Packages with no Debian 13 / CPython 3.13 x86_64 wheel.

    ``fetch(name, version)`` returns the PyPI JSON. ``version`` None means the
    latest release. opencv 5.1 publishes abi3 wheels, which install on 3.13.
    """
    gaps = []
    notes = []
    for package, version in (("numpy", "2.5.5"), ("scipy", "1.18.1")):
        payload = fetch(package, version)
        names = _wheel_names(payload)
        if any(wheel_supports_cpython313_manylinux_x86_64(name) and "cp313" in name for name in names):
            notes.append(f"{package}=={version} cp313 manylinux x86_64")
        else:
            gaps.append(f"{package}=={version}")
    payload = fetch("opencv-python-headless", None)
    releases = payload.get("releases") or {}
    found = None
    for version in releases:
        if not str(version).startswith("5.1."):
            continue
        names = [item.get("filename") or "" for item in releases[version]]
        if any(wheel_supports_cpython313_manylinux_x86_64(name) for name in names):
            found = version
    if found:
        notes.append(f"opencv-python-headless=={found} manylinux x86_64 (cp313 or abi3)")
    else:
        gaps.append("opencv-python-headless 5.1.x")
    return gaps, notes


def write_execute_log(output, text, output_is_dir=False):
    """Write a create failure to ``execute.log`` and ``prepare_failure.log``."""
    failure = prepare_failure_path(output, output_is_dir=output_is_dir)
    if not failure:
        return None
    directory = os.path.dirname(failure) or "."
    os.makedirs(directory, exist_ok=True)
    execute_path = os.path.join(directory, "execute.log")
    with open(execute_path, "w") as handle:
        handle.write(text)
    with open(failure, "w") as handle:
        handle.write(text)
    return execute_path


def _raise_prepare_failure(index, argv, result, rows, output, output_is_dir=False):
    text = format_prepare_failure(index, argv, result, rows=rows)
    sys.stderr.write(text)
    log_path = None
    try:
        log_path = write_prepare_failure(output, text, output_is_dir=output_is_dir)
    except OSError as exc:
        sys.stderr.write(f"could not write prepare_failure.log ({exc})\n")
    manifest = manifest_index(argv, rows or [])
    if manifest is None:
        where = f"step {index}"
    else:
        where = f"manifest index {manifest}"
    message = f"prepare failed at {where}; deleting the instance"
    if log_path:
        message += f". see {log_path}"
    raise SystemExit(message)


SSH_REFUSED_LIMIT = 4


def connection_refused(result):
    return "Connection refused" in _result_text(result)


def guest_startup_failed(text):
    """True when the guest startup script has already exited in failure."""
    text = text or ""
    return any(marker in text for marker in (
        "AVT_RENDER_FAIL",
        "AVT_STARTUP_FAIL",
        "startup-script failed",
        "arguments are required",
    ))


def install_delete_on_signal(delete):
    """On SIGINT or SIGTERM, delete the VM before the process leaves.

    A signal handler runs; ``finally`` does not run for SIGTERM. ``delete`` no-ops
    until the caller has a VM.
    """
    def handler(signum, _frame):
        sys.stderr.write(f"signal {signum}; deleting the VM\n")
        try:
            delete()
        except Exception as exc:
            sys.stderr.write(f"delete after signal {signum} failed: {exc}\n")
        raise SystemExit(128 + int(signum))

    signal.signal(signal.SIGTERM, handler)
    signal.signal(signal.SIGINT, handler)
    return handler


def _call_each(argvs, call, attempts, sleep, retry_seconds, retry_first_only=False,
               rows=None, output=None, index_offset=0, output_is_dir=False, deadline=None):
    """Run each argv. The first command is retried. A refused ssh stops after four.

    A permission failure is not retried. ``Connection refused`` uses a short
    backoff and then fails the stage with the ssh stderr, instead of repeating
    the same preflight for the rest of the cap.
    """
    for index, argv in enumerate(argvs):
        absolute = index + index_offset
        tries = attempts if index == 0 or not retry_first_only else 1
        result = None
        attempt = 0
        refused = 0
        backoff = 2
        while True:
            if deadline is not None and time.monotonic() > deadline:
                raise SystemExit("stage wall clock exceeded; deleting the instance")
            result = call(argv)
            if getattr(result, "returncode", 1) == 0:
                break
            if preflight_refused(result):
                _raise_prepare_failure(
                    absolute, argv, result, rows, output, output_is_dir=output_is_dir,
                )
            attempt += 1
            if connection_refused(result):
                refused += 1
                if refused >= SSH_REFUSED_LIMIT:
                    _raise_prepare_failure(
                        absolute, argv, result, rows, output, output_is_dir=output_is_dir,
                    )
                sleep(backoff)
                backoff = min(backoff * 2, 16)
                continue
            if attempt >= tries:
                _raise_prepare_failure(
                    absolute, argv, result, rows, output, output_is_dir=output_is_dir,
                )
            sleep(retry_seconds)


def _row_size(row):
    if not isinstance(row, dict):
        return None
    raw = row.get("size")
    if raw is None:
        raw = row.get("bytes")
    if isinstance(raw, bool):
        return None
    try:
        size = int(raw)
    except (TypeError, ValueError):
        return None
    if size < 0:
        return None
    return size


def _row_remote(row, root=WORK_ROOT):
    if not isinstance(row, dict):
        return None
    path = row.get("path")
    if isinstance(path, str) and path.startswith("/"):
        return path
    rel = row.get("rel")
    if rel:
        return os.path.join(root, rel)
    return None


# gcloud puts every argument in one exec. A 374-path probe exceeded ARG_MAX
# (E2BIG, "Argument list too long"). Stay under this for each element and the
# whole argv, leaving room for the environment.
ARGV_LIMIT = 128 * 1024
PROBE_LIST = "/tmp/avt-probe-list"
# Fixed reader. The path list is a file, not part of this command. base64 keeps
# spaces, '&', quotes, and newlines out of the shell. stat -c is GNU.
PROBE_READER = """set -euo pipefail
list=/tmp/avt-probe-list
if [ ! -f "$list" ]; then
  echo "AVT_PROBE_FAIL missing list" >&2
  exit 1
fi
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "" ) continue ;;
  esac
  size=${line%% *}
  blob=${line#* }
  path=$(printf '%s' "$blob" | base64 -d) || continue
  if [ -f "$path" ] && [ "$(stat -c %s -- "$path")" -eq "$size" ]; then
    printf '%s\\n' "$path"
  fi
done < "$list"
"""


def argv_nbytes(argv):
    """Bytes this argv would hand to exec, including a NUL after each element."""
    total = 0
    for part in argv:
        total += len(os.fsencode(str(part))) + 1
    return total


def argv_within_limit(argv, limit=ARGV_LIMIT):
    for part in argv:
        if len(os.fsencode(str(part))) > limit:
            return False
    return argv_nbytes(argv) <= limit


def encode_probe_list(pairs):
    """One ``size base64(path)`` line per file. Empty when nothing is probeable."""
    lines = []
    for path, size in pairs:
        try:
            size_i = int(size)
        except (TypeError, ValueError):
            continue
        if size_i < 0 or not isinstance(path, str) or not path:
            continue
        blob = base64.b64encode(path.encode("utf-8")).decode("ascii")
        lines.append(f"{size_i} {blob}")
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def decode_probe_list(text):
    """Inverse of ``encode_probe_list``. A bad line is skipped."""
    found = []
    for line in (text or "").splitlines():
        if " " not in line:
            continue
        size_s, blob = line.split(" ", 1)
        try:
            size_i = int(size_s)
            path = base64.b64decode(blob).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            continue
        found.append((path, size_i))
    return found


def probe_commands(name, project, zone, pairs, list_file):
    """scp the path list, then a short ssh that reads it. Neither argv grows with the rows."""
    if not encode_probe_list(pairs):
        return []
    return [
        gcp_scp_argv(name, project, zone, list_file, scp_spec(name, PROBE_LIST)),
        gcp_ssh_argv(name, project, zone, wrap_remote_command(PROBE_READER)),
    ]


def pack_dir_batches(dirs, name, project, zone, probe="workspace"):
    """ssh commands that mkdir ``dirs``. Each argv stays within ``ARGV_LIMIT``.

    The first command is the write probe. Later commands only mkdir the parents
    that did not fit. One path is never split across commands.
    """
    pending = [path for path in dirs if path]
    batches = []
    first = []
    for path in pending:
        trial = first + [path]
        argv = gcp_ssh_argv(
            name, project, zone, wrap_remote_command(prepare_tree_script(trial, probe=probe)),
        )
        if first and not argv_within_limit(argv):
            break
        first = trial
    batches.append(first)
    pending = pending[len(first):]
    while pending:
        chunk = []
        for path in pending:
            trial = chunk + [path]
            argv = gcp_ssh_argv(
                name, project, zone,
                wrap_remote_command(prepare_tree_script(trial, probe=None)),
            )
            if chunk and not argv_within_limit(argv):
                break
            chunk = trial
        if not chunk:
            chunk = [pending[0]]
        batches.append(chunk)
        pending = pending[len(chunk):]
    argvs = []
    for index, batch in enumerate(batches):
        script = prepare_tree_script(batch, probe=probe if index == 0 else None)
        argvs.append(gcp_ssh_argv(
            name, project, zone, wrap_remote_command(script),
        ))
    return argvs


def without_existing(argvs, present):
    """Drop scp argvs whose remote path is already the right file. Other commands stay."""
    present = set(present or ())
    if not present:
        return list(argvs)
    kept = []
    for argv in argvs:
        path = final_of(argv) if len(argv) > 2 and argv[2] == "scp" else None
        if path is None and len(argv) > 2 and argv[2] == "scp":
            for part in argv:
                found = scp_remote_path(part) if ":" in part else None
                if found:
                    path = found
                    break
        if path and path in present:
            continue
        kept.append(argv)
    return kept


def _lock_pairs(rows, root=WORK_ROOT):
    pairs = []
    for row in rows or []:
        size = _row_size(row)
        remote = _row_remote(row, root)
        if size is None or not remote:
            continue
        pairs.append((remote, size))
    return pairs


def _present_from_probe(text, wanted):
    found = set()
    for line in (text or "").splitlines():
        path = line.strip()
        if path in wanted:
            found.add(path)
    return found


def _probe_present(plan_obj, call, pairs):
    """Copy a path list, then ask which files are already the right size.

    None means the check failed and the caller must copy. The list is a file,
    so the gcloud argv does not grow with the manifest. An OSError from an
    over-long argv is the same as a failed check.
    """
    commands = probe_commands(
        plan_obj["instance_name"], plan_obj.get("project"), plan_obj.get("zone"),
        pairs, list_file="",
    )
    if not commands:
        return set()
    fd, local = tempfile.mkstemp(prefix="avt-probe-", suffix=".list")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(encode_probe_list(pairs))
        commands = probe_commands(
            plan_obj["instance_name"], plan_obj.get("project"), plan_obj.get("zone"),
            pairs, list_file=local,
        )
        for argv in commands:
            try:
                result = call(argv)
            except OSError:
                return None
            if getattr(result, "returncode", 1) != 0:
                return None
        wanted = {path for path, _size in pairs}
        return _present_from_probe(getattr(result, "stdout", "") or "", wanted)
    finally:
        try:
            os.remove(local)
        except OSError:
            pass


def prepare_prefix_length(argvs):
    """How many leading commands create parents and then prove they exist.

    That prefix is mkdir batches, the parent-list copy, and the parent check.
    File copies stay after it. A check that ran first would report directories
    the following mkdir had not created yet.
    """
    end = 0
    for index, argv in enumerate(argvs or []):
        kind = argv[2] if len(argv) > 2 else ""
        if kind == "ssh":
            script = remote_script(argv[-1])
            if "sudo mkdir -p --" in script or "AVT_PARENT_CHECK" in script:
                end = index + 1
                continue
        if kind == "scp" and end:
            remote = ""
            for part in argv:
                found = scp_remote_path(part) if isinstance(part, str) and ":" in part else None
                if found:
                    remote = found
                    break
            if remote == "/tmp/avt-parent-list":
                end = index + 1
                continue
        if end:
            break
    return end


def _push_local(plan, call, sleep):
    """Copy the lock tree. A same-size file already on the guest is not sent again.

    mkdir is retried until ssh accepts a connection. Each file is sent once, and
    a failed send is retried only when the guest does not already have that
    byte size, so a retry does not start the tree over.
    """
    argvs = list(plan.get("transfer_argv") or [])
    if not argvs:
        return
    prefix_n = prepare_prefix_length(argvs)
    for path, text in (plan.get("side_files") or {}).items():
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w") as handle:
            handle.write(text)
    rows = plan.get("transfer_rows")
    if rows is None:
        rows = plan.get("lock_rows") or []
    output = plan.get("output")
    output_is_dir = bool(plan.get("output_is_dir"))
    attempts = int(plan.get("transfer_attempts") or 1)
    retry_seconds = plan.get("ssh_retry_seconds", 5)
    _call_each(
        argvs[:prefix_n], call, attempts=attempts, sleep=sleep, retry_seconds=retry_seconds,
        rows=rows, output=output, output_is_dir=output_is_dir,
        deadline=plan.get("stage_deadline"),
    )
    body = list(enumerate(argvs[prefix_n:], start=prefix_n))
    tail = []
    if body and body[-1][1][2:4] == ["ssh", "--quiet"] and body[-1][1][-1] == "touch /tmp/avt-go":
        tail = [body[-1][1]]
        body = body[:-1]
    pairs = _lock_pairs(rows)
    present = _probe_present(plan, call, pairs)
    skipped_finals = set()
    if present:
        before = len(body)
        kept = []
        for index, argv in body:
            if is_incoming_mv(argv):
                kept.append((index, argv))
                continue
            final = final_of(argv)
            if [argv] != without_existing([argv], present):
                if final:
                    skipped_finals.add(final)
                continue
            kept.append((index, argv))
        body = kept
        skipped = before - len(body)
        if skipped:
            print(f"skip-existing: {skipped} files already on the guest", flush=True)
    deferred_mv = []
    for index, argv in body:
        if is_incoming_mv(argv):
            deferred_mv.append((index, argv))
            continue
        result = call(argv)
        if getattr(result, "returncode", 1) == 0:
            continue
        if preflight_refused(result):
            _raise_prepare_failure(index, argv, result, rows, output, output_is_dir=output_is_dir)
        path = final_of(argv)
        if path is None:
            for part in argv:
                found = scp_remote_path(part) if ":" in part else None
                if found:
                    path = found
                    break
        size = None
        for pair in pairs:
            if pair[0] == path:
                size = pair[1]
                break
        if path is not None and size is not None:
            again = _probe_present(plan, call, [(path, size)])
            if again and path in again:
                print(f"skip-existing: {path}", flush=True)
                continue
        result = call(argv)
        if getattr(result, "returncode", 1) != 0:
            _raise_prepare_failure(index, argv, result, rows, output, output_is_dir=output_is_dir)
    moves = []
    for _index, argv in deferred_mv:
        moves.extend(mv_pairs_from_script(remote_script(argv[-1])))
    moves = [pair for pair in moves if pair[1] not in skipped_finals]
    if moves:
        _call_each(
            mv_batch_argvs(plan["instance_name"], plan.get("project"), plan.get("zone"), moves),
            call, attempts=1, sleep=sleep, retry_seconds=retry_seconds,
            rows=rows, output=output, index_offset=len(argvs) - 1,
            output_is_dir=output_is_dir,
        )
    if tail:
        _call_each(
            tail, call, attempts=1, sleep=sleep, retry_seconds=retry_seconds,
            rows=rows, output=output, index_offset=len(argvs) - 1,
            output_is_dir=output_is_dir,
        )


def _hourly_burn(plan):
    """VM rate plus the input disk, when this plan keeps one."""
    rate = plan.get("usd_per_hour")
    disk = (plan.get("input_disk") or {}).get("usd_per_hour") or 0.0
    if rate is None and not disk:
        return None
    return float(rate or 0.0) + float(disk)


def _elapsed_cost(plan, billing_start, clock):
    if billing_start is None:
        return None
    burn = _hourly_burn(plan)
    if burn is None:
        return None
    return ((clock() - billing_start) / 3600.0) * burn


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
    disk_ready = False
    billing_start = None
    deleter = {"fn": None}

    def _delete_vm():
        fn = deleter["fn"]
        if fn is not None:
            fn()

    previous_signals = {
        signal.SIGINT: signal.getsignal(signal.SIGINT),
        signal.SIGTERM: signal.getsignal(signal.SIGTERM),
    }
    install_delete_on_signal(_delete_vm)
    outcome = None
    pull_failed = False
    serial_text = ""
    startup_path = None
    timer = StageTimer(clock)
    disk = plan.get("input_disk") or None
    try:
        if disk:
            described = call(disk["describe_argv"])
            if getattr(described, "returncode", 1) != 0:
                made = call(disk["create_argv"])
                if getattr(made, "returncode", 1) != 0:
                    text = format_create_failure(disk["create_argv"], made)
                    sys.stderr.write(text)
                    try:
                        write_execute_log(
                            plan.get("output"), text, output_is_dir=bool(plan.get("output_is_dir")),
                        )
                    except OSError:
                        pass
                    raise SystemExit(
                        f"gcloud disk create failed ({getattr(made, 'returncode', 1)}); no instance to delete"
                    )
            disk_ready = True
        timer.begin("create")
        try:
            script = plan.get("startup_script")
            create_argv = plan["create_argv"]
            if script:
                startup_path = _write_startup(script)
                create_argv = _with_startup(create_argv, startup_path)
            try:
                created_result = call(create_argv)
            except OSError as exc:
                created_result = type("CreateResult", (), {})()
                created_result.returncode = 1
                created_result.stdout = ""
                created_result.stderr = f"{exc.__class__.__name__}: {exc}"
        finally:
            timer.end("create")
        if created_result.returncode != 0:
            text = format_create_failure(create_argv, created_result)
            sys.stderr.write(text)
            log_path = None
            try:
                log_path = write_execute_log(
                    plan.get("output"), text, output_is_dir=bool(plan.get("output_is_dir")),
                )
            except OSError as exc:
                sys.stderr.write(f"could not write execute.log ({exc})\n")
            message = (
                f"gcloud create failed ({created_result.returncode}); no instance to delete"
            )
            if log_path:
                message += f". see {log_path}"
            raise SystemExit(message)
        created = True
        billing_start = clock()
        deleter["fn"] = lambda: call(plan["delete_argv"])
        if clock == time.monotonic:
            plan["stage_deadline"] = clock() + min(float(plan.get("max_seconds") or 3600), 45 * 60)
        timer.begin("transfer")
        try:
            if plan.get("stage_from") == "local":
                _push_local(plan, call, sleep)
            else:
                _call_each(
                    plan.get("prepare_argv") or [], call,
                    attempts=int(plan.get("transfer_attempts") or 1),
                    sleep=sleep,
                    retry_seconds=plan.get("ssh_retry_seconds", 5),
                    rows=plan.get("lock_rows"),
                    output=plan.get("output"),
                    output_is_dir=bool(plan.get("output_is_dir")),
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
            if "AVT_RENDER_FAIL" in serial_text or guest_startup_failed(serial_text):
                if plan.get("failure_pull_argv"):
                    outcome = "failed"
                raise SystemExit("guest reported AVT_RENDER_FAIL; deleting the instance")
            sleep(plan["poll_seconds"])
        else:
            if plan.get("failure_pull_argv"):
                outcome = "timeout"
            raise SystemExit("timed out waiting for the guest; deleting the instance")
    finally:
        signal.signal(signal.SIGINT, previous_signals[signal.SIGINT])
        signal.signal(signal.SIGTERM, previous_signals[signal.SIGTERM])
        deleter["fn"] = None
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
            # The VM is gone. The input disk survives a failure on purpose.
            # A finished pull-back is the only path that deletes it.
            if disk_ready and disk and outcome == "done" and not pull_failed:
                removed = call(disk["delete_argv"])
                if getattr(removed, "returncode", 1) != 0:
                    call(disk["delete_argv"])
                else:
                    disk_ready = False
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
        if plan.get("comparison_text"):
            summary["comparison_text"] = plan["comparison_text"]
        if disk_ready and disk:
            summary["kept_disk"] = disk["name"]
            summary["kept_disk_usd_per_day"] = disk["usd_per_day"]
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
            parity_dir=parity_dir,
        )
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
            "and the guest checks the same rows again before the parity gate. "
            "Both checks open the path in Python. They do not pass it through a shell."
        )
        lines.append(
            "Remote scp paths are one shell word (spaces, &, quotes, parentheses). "
            "After mkdir, a lock file already on the guest at the lock's byte size is not sent again."
        )
        lines.append(
            "preflight: one ssh, before the copy, runs sudo mkdir -p and "
            'sudo chown -R "$(id -un)":"$(id -gn)" of /workspace to the login user, '
            "then writes and reads a test file under /workspace/partnership. "
            "A failure stops there, before the large copy. /var/avt stays root mode 700. "
            "The lock and the parity stills are installed into it with sudo. "
            "Pull-back sudo-copies /var/avt/timing.json and the final file to /tmp/avt-pull, "
            "then scp reads that copy. /tmp/avt-env, /tmp/avt-go, and /tmp/avt-pulled stay in /tmp."
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
                "when the copy is not slower than that pad. "
                f"{plan.get('scp_mbps', ASSUMED_SCP_MBPS):.0f} Mbit/s is "
                f"{plan.get('scp_mbps', ASSUMED_SCP_MBPS) / 8:.1f} MB/s, under the "
                f"{OBSERVED_SCP_MB_PER_SEC:.0f} MB/s measured on the first execute."
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
