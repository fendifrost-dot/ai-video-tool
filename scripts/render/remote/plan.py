"""Plan a Partnership chunked render. This module does not call a cloud API.

The locked compositor is ``render_verse_v9look_v1e_p.py``. It is deterministic
on one machine: a state-only pass writes the running state at each chunk start,
and a chunk that loads that state matches a single pass (see LOCK v1e). Workers
are sized by RAM at 7.5 GB each. Nothing here creates a VM, a bucket, or a bill.
"""

from __future__ import annotations

import hashlib
import json
import os
import tarfile
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


def run_steps(steps, call, compare, parallel_call=None):
    """Run steps in order. A failed compare does not start the full render.

    ``call`` and ``parallel_call`` receive argv lists. The default parallel path
    starts every chunk argv through ``call`` only after compare has accepted.
    """
    i = 0
    while i < len(steps):
        step = steps[i]
        if step["name"] == "compare":
            result = compare()
            if not result["acceptable"]:
                raise SystemExit(result["verdict"])
            i += 1
            continue
        if step.get("parallel"):
            group = []
            while i < len(steps) and steps[i].get("parallel"):
                group.append(steps[i]["argv"])
                i += 1
            if parallel_call:
                parallel_call(group)
            else:
                for argv in group:
                    call(argv)
            continue
        call(step["argv"])
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
        "--max-run-duration", f"{int(max_hours)}h",
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


def startup_script(max_minutes=480):
    """Guest boot script. Trap and a timed shutdown both run, plus GCP max-run-duration.

    Secrets arrive as /tmp/avt-env over scp, not in instance metadata. The trap removes
    that file. The script never echoes the token.
    """
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
  --work-root /workspace/partnership/second_half \
  --parity-dir "${{AVT_PARITY_DIR:-/var/avt/parity}}" || {{
  echo AVT_RENDER_FAIL guest
  exit 1
}}
echo AVT_RENDER_DONE
# Leave the marker visible on the serial console before the trap shuts the guest down.
sleep 20
"""


def execute_gcp(plan, call, sleep=time.sleep, clock=time.monotonic):
    """Create the instance, wait, and always delete it if create succeeded.

    ``call(argv)`` returns an object with ``returncode`` and ``stdout``.
    This function does not invent a project and does not skip the delete.
    """
    if not plan.get("confirm"):
        raise SystemExit(
            "refusing to create a VM. Pass --execute and set AVT_REMOTE_RENDER_CONFIRM=1. "
            "A dry-run prints the plan and spends nothing."
        )
    if plan.get("blocked"):
        raise SystemExit(
            "refusing to create a VM: the lock still has inputs that are not on AVT and not in the work tree. "
            "See docs/REMOTE_RENDER.md."
        )
    if not plan.get("project"):
        raise SystemExit(
            "refusing to create a VM: GCP_PROJECT is unset. "
            "The repo audit found no Compute project. Set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS."
        )
    if not plan.get("parity_dir"):
        raise SystemExit(
            "refusing to create a VM: --parity-dir is required. "
            "The 12 reference frames are compared before the full render."
        )
    created = False
    try:
        created_result = call(plan["create_argv"])
        if created_result.returncode != 0:
            raise SystemExit(f"gcloud create failed ({created_result.returncode}); no instance to delete")
        created = True
        for argv in plan["prepare_argv"]:
            prepared = call(argv)
            if prepared.returncode != 0:
                raise SystemExit("prepare failed; deleting the instance")
        deadline = clock() + plan["max_seconds"]
        while clock() < deadline:
            serial = call(plan["serial_argv"])
            text = serial.stdout or ""
            if "AVT_RENDER_DONE" in text:
                return "done"
            if "AVT_RENDER_FAIL" in text:
                raise SystemExit("guest reported AVT_RENDER_FAIL; deleting the instance")
            sleep(plan["poll_seconds"])
        raise SystemExit("timed out waiting for the guest; deleting the instance")
    finally:
        if created:
            deleted = call(plan["delete_argv"])
            if deleted.returncode != 0:
                call(plan["delete_argv"])


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
               lock_summary=None, confirm=False, parity_dir="", env_file="/tmp/avt-env"):
    """One report for dry-run or execute. ``confirm`` is required before any VM create."""
    backend = backend.lower()
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
    if lock_summary is not None:
        missing = lock_summary["missing"]
    # A GCP execute is blocked while any lock row is absent from AVT. The project
    # check is separate so a missing project is not reported as a missing file.
    blocked = backend == "gcp" and (lock_summary is None or bool(missing))
    max_seconds = int(max_hours * 3600)
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
        "chunks": chunk_ranges(sf0, nf, started),
        "cost_verse": cost_band(nf, effective, spec.get("usd_per_hour")),
        "cost_full_song": cost_band(FULL_SONG_FRAMES, effective, spec.get("usd_per_hour")),
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
    }
    if backend == "gcp":
        plan["create_argv"] = gcp_create_argv(
            instance_name, project, zone, machine=machine, spot=spot, max_hours=max_hours,
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
        plan["startup_script"] = startup_script(max_minutes=max_hours * 60)
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


def format_report(plan):
    """Plain-language dry-run. No secret values."""
    creds = plan["credentials"]
    lines = [
        f"backend: {plan['backend']} ({plan['machine']}, {plan['family']})",
        f"dry-run: {'yes' if plan['dry_run'] else 'no — execute was requested'}",
        "no VM, disk, bucket, or cloud API call is made by a dry-run.",
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
        f"upload prefix (project-clips): {plan['upload_prefix']}/<run-id>/",
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
        lines.append("delete argv (always, after create succeeds): " + " ".join(plan["delete_argv"]))
        lines.append("teardown also: guest trap calls shutdown -h now, boot arms shutdown -h +MAX, "
                     "and the instance has --max-run-duration with termination action DELETE.")
        if not creds["compute_project"]:
            lines.append(
                "GCP_PROJECT is unset. The audit found no Compute project in the repos. "
                "Set GCP_PROJECT and GOOGLE_APPLICATION_CREDENTIALS before --execute. "
                "Do not reuse Control Center's GOOGLE_SERVICE_ACCOUNT_JSON; that key is Drive-scoped."
            )
    if plan["backend"] == "aws":
        lines.append(plan["aws"]["note"])
        lines.append(plan["aws"]["would_run"][0])
    lines.append("Inputs the lock does not have on AVT:")
    for gap in plan["known_gaps"]:
        lines.append(f"  - {gap}")
    if plan["missing"]:
        lines.append(f"lock rows not on AVT: {len(plan['missing'])}")
    if plan["blocked"] and plan["backend"] == "gcp":
        lines.append(
            "GCP execute is blocked until GCP_PROJECT is set and every lock row is on AVT. "
            "A Mac with the T7 copy can hash local files and render; the VM only sees AVT."
        )
    lines.append("This report did not create a VM.")
    return "\n".join(lines) + "\n"
