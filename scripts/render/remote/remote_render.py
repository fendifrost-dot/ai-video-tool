#!/usr/bin/env python3
"""Remote and Mac runner for the locked Partnership chunk render.

Default is a dry-run: it prints the plan, the cost ceiling, and the commands.
It does not call gcloud, AWS, or Homebrew. ``--execute`` spends money on GCP
only when ``AVT_REMOTE_RENDER_CONFIRM=1`` is set, and the VM is deleted on the
way out. ``--stage-from local`` copies the lock tree with ``gcloud compute scp``
and does not read AVT credentials. See docs/REMOTE_RENDER.md.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import plan  # noqa: E402


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Plan or run a Partnership chunked render. Dry-run is the default.")
    parser.add_argument("--backend", choices=("gcp", "aws", "mac", "linux"), default="gcp")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan and exit. This is the default.")
    parser.add_argument("--execute", action="store_true", help="Do the work. Refuses unless AVT_REMOTE_RENDER_CONFIRM=1.")
    parser.add_argument("--guest", action="store_true", help="Run on the machine that already has the files (the VM or the Mac).")
    parser.add_argument("--spot", action="store_true", help="GCP Spot. The printed dollars stay the on-demand ceiling.")
    parser.add_argument("--zone", default="us-central1-a")
    parser.add_argument("--machine-type", default="c4-standard-16")
    parser.add_argument("--ram-gb", type=float, default=None)
    parser.add_argument("--vcpu", type=int, default=None)
    parser.add_argument("--sf0", type=int, default=plan.VERSE_SF0)
    parser.add_argument("--nf", type=int, default=plan.VERSE_NF)
    parser.add_argument("--max-hours", type=float, default=8)
    parser.add_argument("--instance-name", default="avt-render-partnership")
    parser.add_argument(
        "--lock", default="",
        help="Path to the lock JSON. Any file name. Required for --stage-from local and before a GCP execute.",
    )
    parser.add_argument(
        "--stage-from", choices=("avt", "local"), default="avt",
        help="avt reads project-clips. local copies the lock tree from this machine with gcloud compute scp and needs no AVT credentials.",
    )
    parser.add_argument(
        "--cost-ceiling", type=float, default=plan.DEFAULT_COST_CEILING_USD,
        help="Abort before create, or delete the VM, if projected or elapsed on-demand cost would exceed this many dollars. Default 5.",
    )
    parser.add_argument("--output", default="final.mp4", help="Where local stage pulls final.mp4.")
    parser.add_argument("--timing-file", default="", help="Guest stage record. The summary is also written beside --output.")
    parser.add_argument("--work-root", default=plan.WORK_ROOT)
    parser.add_argument("--parity-dir", default="", help="Directory of Linux full_sfNNNN.png stills.")
    parser.add_argument("--run-dir", default="", help="Where chunks are written. Default: <work-root>/remote_run")
    parser.add_argument("--python", default="", help="Interpreter for the compositor. Default: python3, or the Mac venv.")
    parser.add_argument("--env-file", default="")
    return parser.parse_args(argv)


def load_lock(path):
    with open(path) as handle:
        data = json.load(handle)
    files = data["files"] if isinstance(data, dict) else data
    return plan.summarize_lock(files)


def _subprocess_call(argv):
    completed = subprocess.run(argv, capture_output=True, text=True)
    completed.stdout = (completed.stdout or "") + (completed.stderr or "")
    return completed


def write_env_file(path, env, stage_from="avt"):
    """Mode 0600. Callers delete the file. The contents are not logged.

    Local stage sends the confirm flag only. AVT tokens stay on the launcher.
    """
    lines = ["AVT_REMOTE_RENDER_CONFIRM=1"]
    if stage_from != "local":
        for key in ("AVT_ACCESS_TOKEN", "AVT_ANON_KEY", "AVT_BATCH_SECRET"):
            if env.get(key):
                lines.append(f"{key}={env[key]}")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write("\n".join(lines) + "\n")


def compare_png_dirs(candidate_dir, reference_dir, names):
    try:
        import cv2
    except ImportError as exc:
        raise SystemExit("parity needs opencv (cv2) to read the stills") from exc
    total = 0
    for name in names:
        reference = cv2.imread(os.path.join(reference_dir, name), cv2.IMREAD_COLOR)
        candidate = cv2.imread(os.path.join(candidate_dir, name), cv2.IMREAD_COLOR)
        if reference is None or candidate is None:
            raise SystemExit(f"parity still missing: {name}")
        if reference.shape != candidate.shape:
            raise SystemExit(f"parity shape differs for {name}")
        total += plan.differing_pixels_rgb24(reference.tobytes(), candidate.tobytes())
    return total


def python_for(backend, explicit):
    if explicit:
        return explicit
    mac_venv = os.path.expanduser("~/.cache/avt/venv_comp/bin/python")
    if backend == "mac" and os.path.isfile(mac_venv):
        return mac_venv
    return sys.executable or "python3"


def run_guest(args, env):
    """Verify hashes, parity-check a handful of frames, then render chunks. Stops on a diff."""
    if env.get("AVT_REMOTE_RENDER_CONFIRM") != "1":
        raise SystemExit("refusing guest render without AVT_REMOTE_RENDER_CONFIRM=1")
    if os.path.abspath(args.work_root) != os.path.abspath(plan.WORK_ROOT):
        raise SystemExit(
            f"the locked compositor hardcodes {plan.WORK_ROOT}. "
            "Put the files there. Editing the script would change its sha256."
        )
    if not args.parity_dir:
        raise SystemExit("guest render needs --parity-dir of Linux full_sfNNNN.png stills")
    stage_local = args.stage_from == "local"
    # A token in the guest environment must not fetch or upload on a local stage.
    token = None if stage_local else env.get("AVT_ACCESS_TOKEN")

    def fetch_to(bucket, object_path, dest):
        plan.fetch_storage_object(token, env.get("AVT_ANON_KEY", ""), bucket, object_path, dest)

    if not args.lock:
        if stage_local:
            raise SystemExit("guest local stage needs --lock")
        if not token:
            raise SystemExit("guest render needs --lock, or AVT_ACCESS_TOKEN to fetch the lock bundle")
        bundle = os.path.join(args.work_root, ".avt-archives", "LOCK_v1e_bundle.tgz")
        os.makedirs(os.path.dirname(bundle), exist_ok=True)
        if not os.path.isfile(bundle):
            fetch_to("project-clips", plan.BUNDLE_OBJECT, bundle)
        args.lock = plan.extract_named_tar(bundle, args.work_root)
    summary = load_lock(args.lock)
    if token:
        plan.materialize(summary["files"], args.work_root, fetch_to)
    checked = plan.verify_tree(summary["files"], args.work_root)
    if not checked["ok"]:
        raise SystemExit("sha256 check failed:\n" + "\n".join(checked["errors"][:20]))
    where = "guest" if stage_local else "work tree"
    print(f"sha256 ok on the {where}: {checked['checked']} files", flush=True)
    run_dir = args.run_dir or os.path.join(args.work_root, "remote_run")
    os.makedirs(os.path.join(run_dir, "parity", "stills"), exist_ok=True)
    os.makedirs(os.path.join(run_dir, "states"), exist_ok=True)
    ram = args.ram_gb
    if ram is None:
        ram = 32 if args.backend == "mac" else 60
    started, _effective = plan.effective_workers(ram, args.vcpu)
    built = plan.guest_steps(
        python_for(args.backend, args.python), args.work_root, run_dir,
        sf0=args.sf0, nf=args.nf, workers=started,
    )
    with open(os.path.join(run_dir, "chunks.txt"), "w") as handle:
        handle.write(plan.concat_list(built["chunks"]))
    child_env = os.environ.copy()
    child_env.update(built["env"])

    def call(argv):
        subprocess.run(argv, check=True, env=child_env)

    def spawn(argv):
        return subprocess.Popen(argv, env=child_env)

    def compare():
        count = compare_png_dirs(
            os.path.join(run_dir, "parity", "stills"), args.parity_dir, plan.still_names(),
        )
        return plan.parity_verdict(count, "mac" if args.backend == "mac" else "linux")

    timer = plan.StageTimer()

    def on_stage(name, phase):
        if phase == "begin":
            timer.begin(name)
        elif phase == "end":
            seconds = timer.end(name)
            print(f"AVT_STAGE {name} {seconds:.3f}", flush=True)

    run_dir_final = os.path.join(run_dir, "final.mp4")
    guest_vcpu = args.vcpu or (16 if args.backend == "linux" else None)
    slots = plan.cpu_slots(guest_vcpu) or started
    plan.run_steps(
        built["steps"], call, compare, on_stage=on_stage, spawn=spawn, slots=slots,
    )
    if args.timing_file:
        plan.write_guest_timing(args.timing_file, timer.seconds)
    if token and os.path.isfile(run_dir_final):
        from urllib.request import urlopen
        with open(run_dir_final, "rb") as handle:
            request = plan.storage_upload_request(
                "project-clips",
                f"{plan.UPLOAD_PREFIX}/{args.instance_name}/final.mp4",
                token,
                handle,
                anon_key=env.get("AVT_ANON_KEY", ""),
                content_length=os.path.getsize(run_dir_final),
            )
            try:
                with urlopen(request, timeout=300) as response:
                    if getattr(response, "status", 200) >= 300:
                        raise SystemExit("upload failed")
            except Exception as exc:
                if isinstance(exc, SystemExit):
                    raise
                raise SystemExit("upload failed") from None
    verdict = compare()
    print(verdict["verdict"])
    return 0


def main(argv=None, env=None, call=None):
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    args = parse_args(argv)
    if not math.isfinite(args.cost_ceiling) or args.cost_ceiling < 0:
        print("refusing: --cost-ceiling must be a non-negative number of dollars", file=sys.stderr)
        return 2
    confirm = bool(args.execute or args.guest) and env.get("AVT_REMOTE_RENDER_CONFIRM") == "1"
    if (args.execute or args.guest) and not confirm:
        print("refusing: set AVT_REMOTE_RENDER_CONFIRM=1 to run. A dry-run is the default and spends nothing.", file=sys.stderr)
        return 2
    if args.dry_run and args.execute:
        confirm = False
    if args.backend == "mac" and confirm and not args.guest:
        if sys.platform != "darwin" or os.uname().machine != "arm64":
            print("the mac backend runs only on macOS arm64 (Apple Silicon Mac Studio).", file=sys.stderr)
            return 2
    if args.lock and not os.path.isfile(args.lock):
        print(f"refusing: --lock is not a file: {args.lock}", file=sys.stderr)
        return 2
    lock_summary = load_lock(args.lock) if args.lock else None
    env_file = args.env_file or "/tmp/avt-env"
    ram = args.ram_gb
    if ram is None and args.backend == "mac":
        ram = 32
    report = plan.build_plan(
        args.backend, env, sf0=args.sf0, nf=args.nf, ram_gb=ram, vcpu=args.vcpu,
        spot=args.spot, zone=args.zone, max_hours=args.max_hours,
        instance_name=args.instance_name, lock_summary=lock_summary,
        confirm=confirm, parity_dir=args.parity_dir, env_file=env_file,
        stage_from=args.stage_from, cost_ceiling=args.cost_ceiling, output=args.output,
        lock_path=args.lock, source_root=args.work_root, timing_path=args.timing_file,
    )
    if args.machine_type != "c4-standard-16" and args.backend == "gcp":
        report["machine"] = args.machine_type
        report["create_argv"] = plan.gcp_create_argv(
            args.instance_name, report["project"], args.zone, machine=args.machine_type,
            spot=args.spot, max_hours=report["capped_hours"],
        )
    if not confirm or args.dry_run:
        sys.stdout.write(plan.format_report(report))
        return 0
    if args.backend == "aws":
        print(report["aws"]["note"], file=sys.stderr)
        return 2
    if args.guest or args.backend in ("mac", "linux"):
        try:
            return run_guest(args, env)
        except SystemExit as exc:
            print(exc, file=sys.stderr)
            return 2
    if args.backend == "gcp":
        try:
            write_env_file(env_file, env, stage_from=args.stage_from)
            if call is None:
                call = _subprocess_call
            plan.execute_gcp(report, call)
        except SystemExit as exc:
            print(exc, file=sys.stderr)
            return 2
        finally:
            if os.path.isfile(env_file):
                os.remove(env_file)
        return 0
    print(f"backend {args.backend} has no execute path", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
