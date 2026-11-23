"""The remote render planner spends nothing: no gcloud, no network, no VM."""

import io
import json
import os
import shlex
import stat
import subprocess
import sys
import tarfile

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import plan  # noqa: E402
import remote_render  # noqa: E402


class Result:
    def __init__(self, returncode=0, stdout=""):
        self.returncode = returncode
        self.stdout = stdout


def test_workers_follow_ram():
    assert plan.worker_count(16) == 1
    assert plan.worker_count(32) == 3
    assert plan.worker_count(60) == 7
    assert plan.worker_count(128) == 16
    assert plan.worker_count(10) == 1
    assert plan.ram_is_tight(10)
    assert not plan.ram_is_tight(32)
    started, effective = plan.effective_workers(60, 16)
    assert started == 7
    assert effective == 2  # 16 vCPU / 6 OpenCV threads


def test_chunks_cover_the_span_and_later_chunks_load_state():
    chunks = plan.chunk_ranges(3070, 10, 3)
    assert [c["nf"] for c in chunks] == [4, 3, 3]
    assert chunks[0]["state_load"] is None
    assert chunks[1]["state_load"] == f"state_{chunks[1]['sf0']}.npz"
    assert sum(c["nf"] for c in chunks) == 10
    assert chunks[0]["sf0"] == 3070
    assert chunks[-1]["sf0"] + chunks[-1]["nf"] == 3080


def test_full_song_cost_is_the_proposal_band_not_a_live_quote():
    band = plan.cost_band(plan.FULL_SONG_FRAMES, effective=2)
    low, high = band["proposal_usd"]
    assert 2.0 < low < high < 5.0
    state_low, state_high = band["with_state_pass_usd"]
    assert state_low > high
    assert band["usd_per_hour"] == 0.79


def test_classify_avt_object_archive_and_gap():
    prefix = (
        "AVT project-clips/3ca10935-8c3d-4479-9a0c-8bfe8050840c/"
        "0c5c4421-1298-4919-bf62-2764ce7837fa/claudia_dx/lock_v1e/"
    )
    direct = plan.classify_backup(prefix + "s07fix/trench_alpha_S07rt_1280_full.npy (sha256 verified)")
    assert direct["kind"] == "object"
    assert direct["object"].endswith("trench_alpha_S07rt_1280_full.npy")
    archived = plan.classify_backup(
        prefix + "lock_v1e_small_inputs.tgz :: claudia_dx/v1/render_verse_v9look_v1e.py (sha256 verified)"
    )
    assert archived["kind"] == "archive_member"
    assert archived["member"] == "claudia_dx/v1/render_verse_v9look_v1e.py"
    box = plan.classify_backup("box only", plan.CHUNK_REL)
    assert box["kind"] == "archive_member"
    assert box["object"] == plan.BUNDLE_OBJECT
    gap = plan.classify_backup("rebuildable: plate_prep.py needs a T7 copy")
    assert gap["kind"] == "not_on_avt"


def test_sha256_and_materialize(tmp_path):
    payload = b"frame-bytes"
    digest = __import__("hashlib").sha256(payload).hexdigest()
    tar_path = tmp_path / "small.tgz"
    with tarfile.open(tar_path, "w:gz") as tar:
        info = tarfile.TarInfo("claudia_dx/v1/note.txt")
        info.size = len(payload)
        tar.addfile(info, io.BytesIO(payload))
    rows = [
        {"kind": "object", "bucket": "project-clips", "object": "direct.bin", "rel": "direct.bin", "sha256": digest},
        {"kind": "archive_member", "bucket": "project-clips", "object": "small.tgz",
         "member": "claudia_dx/v1/note.txt", "rel": "claudia_dx/v1/note.txt", "sha256": digest},
        {"kind": "not_on_avt", "rel": "plates/S01_rt.npy", "sha256": "abc", "detail": "T7"},
    ]
    fetched = []

    def fetch_to(bucket, obj, dest):
        fetched.append(obj)
        if obj == "direct.bin":
            with open(dest, "wb") as handle:
                handle.write(payload)
        else:
            with open(dest, "wb") as handle:
                handle.write(tar_path.read_bytes())

    written = plan.materialize(rows, str(tmp_path / "root"), fetch_to)
    assert "direct.bin" in written
    root = tmp_path / "root"
    assert (root / "claudia_dx/v1/note.txt").read_bytes() == payload
    checked = plan.verify_tree(rows, str(root))
    assert any("S01_rt.npy" in error for error in checked["errors"])
    (root / "plates").mkdir()
    (root / "plates/S01_rt.npy").write_bytes(payload)
    rows[2]["sha256"] = digest
    assert plan.verify_tree(rows, str(root))["ok"]
    rows[0]["sha256"] = "0" * 64
    again = plan.verify_tree(rows, str(root))
    assert any("sha256 mismatch" in error for error in again["errors"])


def test_parity_zero_is_acceptable_and_mac_drift_is_not():
    frame = b"\x01\x02\x03" * 4
    assert plan.differing_pixels_rgb24(frame, frame) == 0
    drifted = bytearray(frame)
    drifted[0] = 9
    count = plan.differing_pixels_rgb24(frame, bytes(drifted))
    assert count == 1
    ok = plan.parity_verdict(0, "mac")
    assert ok["acceptable"]
    bad = plan.parity_verdict(count, "mac")
    assert not bad["acceptable"]
    assert "NOT ACCEPTABLE" in bad["verdict"]
    assert "Apple Silicon" in bad["verdict"]
    assert "preview" in bad["verdict"]
    linux = plan.parity_verdict(count, "linux")
    assert "Do not concatenate" in linux["verdict"]


def test_run_steps_stops_before_chunks_when_parity_fails():
    steps = plan.guest_steps("python3", plan.WORK_ROOT, "/tmp/run", nf=8, workers=2)["steps"]
    names = [step["name"] for step in steps]
    assert names[0] == "parity"
    assert names[1] == "compare"
    assert "state_only" in names
    assert names.index("compare") < names.index("state_only")
    called = []

    def call(argv):
        called.append(argv)

    with pytest.raises(SystemExit) as exc:
        plan.run_steps(steps, call, lambda: plan.parity_verdict(4, "mac"))
    assert "NOT ACCEPTABLE" in str(exc.value)
    assert called and called[0][1].endswith("render_verse_v9look_v1e_p.py")
    assert "--nf" in called[0] and called[0][called[0].index("--nf") + 1] == str(plan.PARITY_NF)
    assert not any("--state_only" in argv for argv in called)


def test_startup_traps_and_does_not_embed_secrets():
    script = plan.startup_script(max_minutes=480)
    assert "trap cleanup EXIT" in script
    assert "shutdown -h now" in script
    assert 'shutdown -h +"$MAX_MINUTES"' in script
    assert "AVT_RENDER_DONE" in script
    assert "AVT_RENDER_FAIL" in script
    assert "rm -f /tmp/avt-env" in script
    assert "BEGIN PRIVATE KEY" not in script
    assert "sha256" not in script.lower() or "numpy==2.5.5" in script
    assert "--parity-dir" in script
    assert "--guest" in script


def test_execute_always_deletes_after_a_successful_create(tmp_path):
    plan_gcp = plan.build_plan(
        "gcp",
        {"GCP_PROJECT": "example-project"},
        confirm=True,
        parity_dir="/stills",
        lock_summary={"missing": [], "files": [], "on_avt": 0},
        instance_name="avt-render-test",
        env_file="/tmp/does-not-need-to-exist",
        output=str(tmp_path / "final.mp4"),
    )
    assert plan_gcp["blocked"] is False
    assert "--max-run-duration" in plan_gcp["create_argv"]
    assert "DELETE" in plan_gcp["create_argv"]
    assert "hyperdisk-balanced" in plan_gcp["create_argv"]
    assert "--provisioning-model" not in plan_gcp["create_argv"]
    calls = []

    def call(argv):
        calls.append(argv)
        # gcloud compute instances <verb>
        if argv[3] == "get-serial-port-output":
            return Result(stdout="boot\nAVT_RENDER_DONE\n")
        return Result(0)

    assert plan.execute_gcp(plan_gcp, call, sleep=lambda _s: None, clock=lambda: 0) == "done"
    assert calls[-1][3] == "delete"

    calls.clear()

    def fail_prepare(argv):
        calls.append(argv)
        if argv[3] == "create":
            return Result(0)
        return Result(1)

    with pytest.raises(SystemExit):
        plan.execute_gcp(plan_gcp, fail_prepare, sleep=lambda _s: None, clock=lambda: 0)
    assert calls[-1][3] == "delete"

    calls.clear()

    def fail_create(argv):
        calls.append(argv)
        return Result(1)

    with pytest.raises(SystemExit):
        plan.execute_gcp(plan_gcp, fail_create, sleep=lambda _s: None, clock=lambda: 0)
    assert all(argv[3] != "delete" for argv in calls)


def test_execute_refuses_without_project_parity_or_confirm():
    bare = plan.build_plan("gcp", {}, confirm=True, parity_dir="/stills",
                           lock_summary={"missing": [], "files": [], "on_avt": 0})
    with pytest.raises(SystemExit, match="GCP_PROJECT"):
        plan.execute_gcp(bare, lambda argv: Result())
    no_parity = plan.build_plan("gcp", {"GCP_PROJECT": "p"}, confirm=True,
                                lock_summary={"missing": [], "files": [], "on_avt": 0})
    with pytest.raises(SystemExit, match="parity-dir"):
        plan.execute_gcp(no_parity, lambda argv: Result())
    dry = plan.build_plan("gcp", {"GCP_PROJECT": "p"}, confirm=False, parity_dir="/stills",
                          lock_summary={"missing": [], "files": [], "on_avt": 0})
    with pytest.raises(SystemExit, match="dry-run"):
        plan.execute_gcp(dry, lambda argv: Result())


def test_aws_stub_does_not_call_aws():
    stub = plan.aws_stub()
    assert stub["implemented"] is False
    assert "NOT IMPLEMENTED" in stub["would_run"][0]
    assert stub["workers_started"] == 16
    text = plan.format_report(plan.build_plan("aws", {}))
    assert "does not call AWS" in text
    assert "This report did not create a VM." in text


def test_upload_request_keeps_the_token_out_of_the_url():
    request = plan.storage_upload_request("project-clips", "a/b/final.mp4", "secret-token", b"x", anon_key="anon")
    assert "secret-token" not in request.full_url
    assert request.get_header("Authorization") == "Bearer secret-token"
    with pytest.raises(SystemExit):
        plan.storage_upload_request("project-clips", "../escape.mp4", "t", b"x")


def test_cli_dry_run_prints_mac_workers_and_hides_secrets(capsys):
    secret = "super-secret-token-value"
    code = remote_render.main(
        ["--backend", "mac", "--ram-gb", "32", "--dry-run"],
        env={"AVT_ACCESS_TOKEN": secret, "GCP_PROJECT": ""},
    )
    assert code == 0
    out = capsys.readouterr().out
    assert "workers started (RAM): 3" in out
    assert "Apple Silicon" in out
    assert "did not create a VM" in out
    assert secret not in out
    assert "0 differing pixels" in out


def test_cli_execute_without_confirm_does_not_call_gcloud(capsys):
    called = []
    code = remote_render.main(
        ["--backend", "gcp", "--execute"],
        env={},
        call=lambda argv: called.append(argv) or Result(),
    )
    assert code == 2
    assert called == []
    assert "spends nothing" in capsys.readouterr().err


def test_cli_gcp_execute_deletes_and_removes_the_env_file(tmp_path, capsys):
    env_file = tmp_path / "env"
    calls = []

    def call(argv):
        calls.append(list(argv))
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    lock = tmp_path / "lock.json"
    lock.write_text('{"files": []}')
    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--parity-dir", str(tmp_path),
         "--lock", str(lock), "--instance-name", "avt-test", "--env-file", str(env_file)],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "example-project",
             "AVT_ACCESS_TOKEN": "token-value"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    assert calls[-1][3] == "delete"
    assert not env_file.exists()
    assert all("token-value" not in " ".join(argv) for argv in calls)


def test_setup_script_refuses_this_linux_box():
    script = os.path.join(HERE, "..", "setup-mac.sh")
    import subprocess
    completed = subprocess.run(["bash", script], capture_output=True, text=True)
    assert completed.returncode != 0
    assert "Apple Silicon" in completed.stderr


def _lock(path, files):
    path.write_text(json.dumps({"files": files}))
    return path


def _row(rel, payload, backup="box only"):
    return {
        "path": f"/workspace/partnership/second_half/{rel}",
        "sha256": __import__("hashlib").sha256(payload).hexdigest(),
        "size": len(payload),
        "backup": backup,
    }


def test_uncapped_duration_stays_hours_and_the_default_ceiling_is_under_five_dollars():
    assert "8h" in plan.gcp_create_argv("n", "p", "z", max_hours=8)
    report = plan.build_plan("gcp", {"GCP_PROJECT": "avt-render"})
    value = report["create_argv"][report["create_argv"].index("--max-run-duration") + 1]
    assert value == plan.duration_flag(report["capped_hours"])
    assert value != "8h"
    seconds = int(value[:-1])
    assert value.endswith("s")
    assert seconds / 3600.0 * plan.PROPOSAL_USD_PER_HOUR <= 5.0
    assert report["projected_usd_hi"] < 5.0
    full = plan.build_plan(
        "gcp", {"GCP_PROJECT": "avt-render"}, nf=plan.FULL_SONG_FRAMES,
        stage_from="local", lock_summary={"missing": [], "files": [], "on_avt": 0},
        lock_path="/tmp/LOCK_v2.json",
    )
    # The gated figure is the 2-wide band, about $2.66–$2.96, not a second decode.
    assert full["projected_usd_hi"] < 5.0
    assert full["cost_full_song"]["proposal_usd"][1] < 5.0
    one_hi = plan.one_pass_hours(plan.FULL_SONG_FRAMES, plan.SEC_HI) * plan.PROPOSAL_USD_PER_HOUR
    assert one_hi > 5.0
    assert full["cost_full_song"]["with_state_pass_usd"][1] > one_hi
    assert plan.transfer_hours() < plan.OVERHEAD_H
    # 100 Mbit/s is 12.5 MB/s, under the 53 MB/s the first execute measured.
    assert plan.ASSUMED_SCP_MBPS / 8 < plan.OBSERVED_SCP_MB_PER_SEC
    band = plan.cost_band(plan.FULL_SONG_FRAMES, 2)
    assert plan.projected_usd_hi(band, plan.transfer_hours()) == plan.projected_usd_hi(band, 0)


def test_local_dry_run_needs_no_avt_credentials_and_calls_nothing(tmp_path, capsys):
    secret = "super-secret-token-value"
    lock = _lock(tmp_path / "LOCK_v2.json", [_row("plates/missing.npy", b"not-on-this-disk")])
    called = []
    code = remote_render.main(
        ["--backend", "gcp", "--stage-from", "local", "--lock", str(lock),
         "--work-root", str(tmp_path), "--cost-ceiling", "5"],
        env={"AVT_ACCESS_TOKEN": secret, "AVT_ANON_KEY": secret, "AVT_BATCH_SECRET": secret},
        call=lambda argv: called.append(argv) or Result(),
    )
    assert code == 0
    assert called == []
    out = capsys.readouterr().out
    assert "stage-from: local" in out
    assert "AVT credentials required: none" in out
    assert "are not required" in out
    assert "gcloud compute scp" in out
    assert "gcloud compute ssh" in out
    assert "cost ceiling: $5.00" in out
    assert "roles/storage.objectAdmin" in out
    assert "roles/compute.instanceAdmin.v1" in out
    assert "full_sf3290.png" in out and "full_sf3301.png" in out
    assert "state pass" in out and "pull-back" in out
    assert "not uploaded to AVT" in out
    assert "full song vs ceiling:" in out
    assert "2.66" in out or "$2.66" in out
    assert "(under)" in out
    assert str(lock) in out
    assert "lock rows: 1" in out
    assert "no AVT object: 1" in out
    assert "LOCK_v1e" not in out
    assert "blocked until" not in out
    assert "did not create a VM" in out
    assert secret not in out
    assert "is ignored for this local stage" in out


def test_avt_stage_is_still_the_default(capsys):
    code = remote_render.main(["--backend", "gcp", "--dry-run"], env={})
    assert code == 0
    out = capsys.readouterr().out
    assert "stage-from: avt" in out
    assert "upload prefix (project-clips):" in out
    assert "AVT credentials required: none" not in out
    assert "Inputs the lock does not have on AVT:" in out


def test_local_execute_pushes_the_tree_pulls_the_file_and_deletes(tmp_path, capsys):
    payload = b"plate-bytes"
    rel = "claudia_dx/v1/note.txt"
    root = tmp_path / "tree"
    (root / rel).parent.mkdir(parents=True)
    (root / rel).write_bytes(payload)
    lock = _lock(tmp_path / "LOCK_v2.json", [_row(rel, payload)])
    env_file = tmp_path / "env"
    output = tmp_path / "out" / "final.mp4"
    parity = tmp_path / "stills"
    parity.mkdir()
    calls = []
    seen_env = {}

    def call(argv):
        calls.append(list(argv))
        joined = " ".join(argv)
        if joined.endswith(":/tmp/avt-env") or any(part.endswith(":/tmp/avt-env") for part in argv):
            seen_env["text"] = env_file.read_text()
            seen_env["mode"] = stat.S_IMODE(env_file.stat().st_mode)
        if "get-serial-port-output" in argv:
            return Result(stdout="\n".join([
                "AVT_STAGE setup 11",
                "AVT_STAGE parity 2",
                "AVT_STAGE state_pass 3",
                "AVT_STAGE chunks 4",
                "AVT_STAGE concat 1",
                "sha256 ok on the guest: 1 files",
                "AVT_RENDER_DONE",
            ]))
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(parity), "--output", str(output),
         "--env-file", str(env_file), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={
            "AVT_REMOTE_RENDER_CONFIRM": "1",
            "GCP_PROJECT": "avt-render",
            "AVT_ACCESS_TOKEN": "secret-token",
            "AVT_ANON_KEY": "secret-anon",
            "AVT_BATCH_SECRET": "secret-batch",
        },
        call=call,
    )
    assert code == 0, capsys.readouterr()
    verbs = [argv[2] for argv in calls]
    assert verbs[0] == "instances"
    assert calls[0][3] == "create"
    assert "--max-run-duration" in calls[0]
    assert "DELETE" in calls[0]
    assert calls[-1][3] == "delete"
    pushed = [argv for argv in calls if argv[2] == "scp" and any(rel in part for part in argv)]
    assert pushed
    assert any(part.endswith(f":/workspace/partnership/second_half/{rel}") for argv in pushed for part in argv)
    assert any(str(lock) in argv for argv in calls)
    assert any(
        plan.scp_remote_path(part) == "/tmp/avt-stage/lock.json"
        for argv in calls if argv[2] == "scp" for part in argv
    )
    assert any(
        "/var/avt/lock.json" in plan.remote_script(argv[-1])
        for argv in calls if argv[2] == "ssh" and argv[-1].startswith("printf ")
    )
    assert any(
        plan.scp_remote_path(part) == "/tmp/avt-pull/final.mp4"
        for argv in calls if argv[2] == "scp" for part in argv
    )
    assert any(argv[-1] == str(output) for argv in calls)
    assert seen_env["text"].strip().splitlines() == ["AVT_REMOTE_RENDER_CONFIRM=1"]
    assert seen_env["mode"] == 0o600
    blob = "\n".join(" ".join(argv) for argv in calls)
    assert "secret-token" not in blob
    assert "secret-anon" not in blob
    assert "LOCK_v1e" not in blob
    out = capsys.readouterr().out
    assert "sha256 ok on the launcher: 1 files" in out
    assert "state pass: 3.0s" in out
    assert "setup: 11.0s" in out
    assert "pull-back:" in out
    assert "ceiling: $5.00" in out
    assert "result: done" in out
    summary = json.loads(output.with_suffix(".timing.json").read_text())
    assert summary["stages"]["state_pass"] == 3
    assert summary["stages"]["chunks"] == 4
    assert summary["result"] == "done"
    assert "create" in summary["stages"]
    assert "teardown" in summary["stages"]
    assert not env_file.exists()
    assert any("touch /tmp/avt-pulled" in argv for argv in calls)


def test_local_hash_mismatch_does_not_create(tmp_path, capsys):
    root = tmp_path / "tree"
    rel = "plates/S0.npy"
    (root / rel).parent.mkdir(parents=True)
    (root / rel).write_bytes(b"nope")
    bad = _row(rel, b"expected")
    lock = _lock(tmp_path / "LOCK_v2.json", [bad])
    calls = []
    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--env-file", str(tmp_path / "env")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=lambda argv: calls.append(argv) or Result(),
    )
    assert code == 2
    assert calls == []
    assert "sha256" in capsys.readouterr().err


def test_projected_cost_over_the_ceiling_does_not_create(tmp_path, capsys):
    lock = _lock(tmp_path / "LOCK_v2.json", [])
    calls = []
    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(tmp_path),
         "--parity-dir", str(tmp_path), "--nf", str(plan.FULL_SONG_FRAMES),
         "--env-file", str(tmp_path / "env"), "--cost-ceiling", "2"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=lambda argv: calls.append(argv) or Result(),
    )
    assert code == 2
    assert calls == []
    assert "would exceed the ceiling" in capsys.readouterr().err


def test_full_song_at_the_default_ceiling_is_not_refused(tmp_path, capsys):
    lock = _lock(tmp_path / "LOCK_v2.json", [])
    calls = []

    def call(argv):
        calls.append(list(argv))
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(tmp_path),
         "--parity-dir", str(tmp_path), "--nf", str(plan.FULL_SONG_FRAMES),
         "--env-file", str(tmp_path / "env"), "--cost-ceiling", "5",
         "--output", str(tmp_path / "final.mp4")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    assert calls[0][3] == "create"
    assert "would exceed the ceiling" not in capsys.readouterr().err


def test_pipeline_starts_chunk_zero_beside_the_state_walk(tmp_path):
    built = plan.guest_steps("python3", plan.WORK_ROOT, str(tmp_path), nf=8, workers=2)
    later = [step for step in built["steps"] if step.get("parallel") and "--state_load" in step["argv"]][0]
    snap = later["argv"][later["argv"].index("--state_load") + 1]
    order = []

    class Proc:
        def __init__(self, argv):
            self.argv = list(argv)
            self.returncode = None
            if "--state_only" in self.argv:
                order.append("start-state")
            elif "--state_load" in self.argv:
                order.append("start-later")
            else:
                order.append("start-chunk0")

        def poll(self):
            if "--state_only" in self.argv:
                if "start-chunk0" in order and self.returncode is None:
                    os.makedirs(os.path.dirname(snap), exist_ok=True)
                    open(snap, "wb").close()
                    self.returncode = 0
                    order.append("end-state")
                    return 0
                return self.returncode
            self.returncode = 0
            return 0

        def wait(self):
            self.returncode = 0
            return 0

        def kill(self):
            self.returncode = -9

    plan.run_steps(
        built["steps"], lambda argv: None, lambda: plan.parity_verdict(0, "linux"),
        spawn=lambda argv: Proc(argv), slots=2, pipe_sleep=lambda _s: None,
    )
    assert order.index("start-chunk0") < order.index("end-state")
    assert order.index("end-state") < order.index("start-later")
    assert os.path.isfile(snap)
    assert "--state_load" in later["argv"]
    assert later["argv"][later["argv"].index("--state_load") + 1] == snap


def test_elapsed_cost_deletes_the_instance():
    report = plan.build_plan(
        "gcp", {"GCP_PROJECT": "avt-render"},
        confirm=True, parity_dir="/stills",
        lock_summary={"missing": [], "files": [], "on_avt": 0},
        instance_name="avt-render-test",
        cost_ceiling=5,
    )
    assert report["max_seconds"] == 8 * 3600
    clock = {"t": 0.0}

    def now():
        return clock["t"]

    calls = []

    def call(argv):
        calls.append(argv)
        if "get-serial-port-output" in argv:
            clock["t"] = 7 * 3600
            return Result(stdout="still working")
        return Result(0)

    with pytest.raises(SystemExit, match="would exceed the ceiling"):
        plan.execute_gcp(report, call, sleep=lambda _s: None, clock=now)
    assert any(argv[3] == "create" for argv in calls)
    assert calls[-1][3] == "delete"


def test_scp_paths_keep_spaces_and_the_lock_name(tmp_path):
    rel = "inputs/my audio/clip.wav"
    rows = [{"rel": rel, "kind": "not_on_avt", "sha256": "abc"}]
    argvs = plan.local_transfer_argvs(
        "avt-test", "avt-render", "us-central1-a", rows, str(tmp_path),
        str(tmp_path / "LOCK_v2.json"), "/tmp/avt-env", os.path.dirname(plan.__file__),
        parity_dir=str(tmp_path / "stills"),
    )
    copied = [argv for argv in argvs if argv[2] == "scp" and argv[-2].endswith("clip.wav")]
    assert len(copied) == 1
    assert copied[0][-2] == os.path.join(str(tmp_path), rel)
    remote = f"{plan.WORK_ROOT}/{rel}"
    assert plan.final_of(copied[0]) == remote
    assert "'" not in copied[0][-1] and '"' not in copied[0][-1]
    assert "/.avt-incoming/" in copied[0][-1]
    assert argvs[-1][2] == "ssh"
    assert argvs[-1][-1] == "touch /tmp/avt-go"
    script = plan.remote_script(plan.gcloud_rejoin(argvs[0][-1]))
    assert f"{plan.WORK_ROOT}/inputs/my audio" in shlex.split(script)
    assert any(
        plan.scp_remote_path(part) == "/tmp/avt-stage/lock.json" and "LOCK_v2.json" in argv[-2]
        for argv in argvs for part in argv
    )
    install = [
        plan.remote_script(argv[-1]) for argv in argvs
        if argv[2] == "ssh" and "install -m 600" in plan.remote_script(argv[-1])
    ]
    assert install and "/var/avt/lock.json" in install[0]
    assert "chmod 700 -- /var/avt" in install[0]


def test_local_startup_mentions_no_token_and_passes_bash_n():
    import subprocess
    script = plan.startup_script(max_minutes=379, stage_from="local")
    assert "--stage-from local" in script
    assert "--lock /var/avt/lock.json" in script
    assert "--guest" in script
    assert "--parity-dir" in script
    assert "trap cleanup EXIT" in script
    assert "shutdown -h now" in script
    assert 'shutdown -h +"$MAX_MINUTES"' in script
    assert "AVT_RENDER_DONE" in script
    assert "AVT_RENDER_FAIL" in script
    assert "rm -f /tmp/avt-env" in script
    assert "AVT_ACCESS_TOKEN" not in script
    assert "BEGIN PRIVATE KEY" not in script
    assert "numpy==2.5.5" in script
    completed = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert completed.returncode == 0, completed.stderr


def test_guest_local_verifies_the_lock_and_does_not_fetch(tmp_path, monkeypatch):
    monkeypatch.setattr(plan, "WORK_ROOT", str(tmp_path))

    def boom(*_args, **_kwargs):
        raise AssertionError("AVT storage was called")

    monkeypatch.setattr(plan, "materialize", boom)
    monkeypatch.setattr(plan, "fetch_storage_object", boom)
    rel = "claudia_dx/note.txt"
    (tmp_path / rel).parent.mkdir(parents=True)
    (tmp_path / rel).write_bytes(b"present")
    lock = _lock(tmp_path / "LOCK_v2.json", [_row(rel, b"other-bytes")])
    args = remote_render.parse_args([
        "--guest", "--backend", "linux", "--stage-from", "local",
        "--lock", str(lock), "--work-root", str(tmp_path), "--parity-dir", str(tmp_path),
    ])
    with pytest.raises(SystemExit, match="sha256"):
        remote_render.run_guest(args, {
            "AVT_REMOTE_RENDER_CONFIRM": "1",
            "AVT_ACCESS_TOKEN": "secret-token",
        })


def test_on_stage_closes_parity_before_any_chunk():
    steps = plan.guest_steps("python3", plan.WORK_ROOT, "/tmp/run", nf=8, workers=2)["steps"]
    seen = []

    def on_stage(name, phase):
        seen.append((name, phase))

    with pytest.raises(SystemExit):
        plan.run_steps(steps, lambda argv: None, lambda: plan.parity_verdict(2, "linux"), on_stage=on_stage)
    assert seen[0] == ("parity", "begin")
    assert ("parity", "end") in seen
    assert ("chunks", "begin") not in seen
    assert ("state_pass", "begin") not in seen


def test_missing_lock_file_refuses_without_a_traceback(capsys):
    code = remote_render.main(
        ["--backend", "gcp", "--stage-from", "local", "--dry-run",
         "--lock", "/tmp/does-not-exist-LOCK_v2.json"],
        env={},
    )
    assert code == 2
    err = capsys.readouterr().err
    assert "not a file" in err
    assert "Traceback" not in err


def test_local_env_file_drops_avt_credentials(tmp_path):
    path = tmp_path / "env"
    remote_render.write_env_file(str(path), {
        "AVT_ACCESS_TOKEN": "secret-token",
        "AVT_ANON_KEY": "secret-anon",
        "AVT_BATCH_SECRET": "secret-batch",
    }, stage_from="local")
    text = path.read_text()
    assert text == "AVT_REMOTE_RENDER_CONFIRM=1\n"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    remote_render.write_env_file(str(path), {"AVT_ACCESS_TOKEN": "secret-token"}, stage_from="avt")
    assert "AVT_ACCESS_TOKEN=secret-token" in path.read_text()


CEASE_REL = "inputs/audio/PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav"
SHELL_RELS = (
    CEASE_REL,
    'inputs/my audio & "takes"/he said "no" (take 1).wav',
    "inputs/odd/it's a (clip).wav",
    "inputs/audio  masters/clip.wav",
)


def _bash_word(word):
    completed = subprocess.run(
        ["bash", "-c", f"set -- {word}; printf %s \"$1\""],
        capture_output=True, text=True, check=True,
    )
    return completed.stdout


def test_remote_shell_keeps_spaces_ampersand_quotes_and_parens(tmp_path):
    rows = [{"rel": rel, "kind": "not_on_avt", "sha256": "abc", "size": 3} for rel in SHELL_RELS]
    argvs = plan.local_transfer_argvs(
        "avt-test", "avt-render", "us-central1-a", rows, str(tmp_path),
        str(tmp_path / "LOCK_v2.json"), "/tmp/avt-env", os.path.dirname(plan.__file__),
    )
    for rel in SHELL_RELS:
        remote = f"{plan.WORK_ROOT}/{rel}"
        copied = [
            argv for argv in argvs
            if argv[2] == "scp" and plan.final_of(argv) == remote
        ]
        assert len(copied) == 1
        assert copied[0][-2] == os.path.join(str(tmp_path), rel)
        target = copied[0][-1].split(":", 1)[1]
        assert "'" not in target and '"' not in target
        assert " " not in target
        script = "\n".join(
            plan.remote_script(argv[-1]) for argv in argvs if plan.is_incoming_mv(argv)
        )
        assert remote in shlex.split(script)
    assert "MASTER  -" in f"{plan.WORK_ROOT}/{CEASE_REL}"
    script = plan.remote_script(plan.gcloud_rejoin(argvs[0][-1]))
    user_line = next(
        line.strip() for line in script.splitlines()
        if line.strip().startswith("sudo mkdir -p -- ") and plan.WORK_ROOT in line
    )
    words = shlex.split(user_line.split(" || ", 1)[0])
    assert words[:4] == ["sudo", "mkdir", "-p", "--"]
    listing = "printf '%s\\n' " + user_line[len("sudo mkdir -p -- "):].split(" || ", 1)[0]
    printed = subprocess.run(
        ["bash", "-c", listing], capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    for rel in SHELL_RELS:
        parent = os.path.dirname(f"{plan.WORK_ROOT}/{rel}")
        assert parent in words
        assert parent in printed
    assert 'sudo chown -RP "$(id -un)":"$(id -gn)"' in script
    assert "refusing to chown" in script
    for line in script.splitlines():
        if 'chown -RP "$(id -un)"' in line:
            assert "/var/avt" not in line
    assert "chmod 700 -- /var/avt" in script
    probed = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert probed.returncode == 0, probed.stderr
    startup = plan.startup_script(stage_from="local")
    assert "CEASE" not in startup
    concat = [step for step in plan.guest_steps("python3", plan.WORK_ROOT, "/tmp/run", nf=8, workers=1)["steps"]
              if step["name"] == "concat"][0]["argv"]
    wav = os.path.join(plan.WORK_ROOT, CEASE_REL)
    assert concat.count(wav) == 1
    assert concat[0] == "ffmpeg"


def test_verify_tree_hashes_a_shell_metacharacter_path(tmp_path):
    payload = b"wav-bytes"
    path = tmp_path / CEASE_REL
    path.parent.mkdir(parents=True)
    path.write_bytes(payload)
    digest = __import__("hashlib").sha256(payload).hexdigest()
    checked = plan.verify_tree(
        [{"rel": CEASE_REL, "kind": "not_on_avt", "sha256": digest}],
        str(tmp_path),
    )
    assert checked["ok"]
    assert checked["checked"] == 1


def _local_tree(tmp_path, rels):
    root = tmp_path / "tree"
    files = []
    for rel in rels:
        payload = rel.encode()
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(payload)
        files.append(_row(rel, payload))
    lock = _lock(tmp_path / "LOCK_v2.json", files)
    return root, lock


def test_prepare_failure_logs_the_cease_manifest_index(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, ["plates/a.npy", CEASE_REL])
    output = tmp_path / "out" / "final.mp4"
    calls = []
    noise = "\n".join(f"L{i:03d}" for i in range(60))

    def call(argv):
        calls.append(list(argv))
        if len(argv) > 3 and argv[3] == "delete":
            assert (tmp_path / "out" / "prepare_failure.log").is_file()
            return Result(0)
        if argv[2] == "scp" and plan.final_of(argv) == f"{plan.WORK_ROOT}/{CEASE_REL}":
            return Result(1, stdout=noise + "\nremote shell broke on &\n")
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(output),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    err = capsys.readouterr().err
    assert "manifest index 1" in err
    assert "deleting the instance" in err
    log = (tmp_path / "out" / "prepare_failure.log").read_text()
    assert f"manifest index 1 (item 2): {CEASE_REL}" in log
    assert "remote shell broke on &" in log
    assert "L000" not in log
    assert "L010" not in log
    assert "L011" in log
    assert "argv:" in log
    assert calls[-1][3] == "delete"


def test_same_size_file_is_not_sent_again(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, [CEASE_REL, "plates/a.npy"])
    remote = f"{plan.WORK_ROOT}/{CEASE_REL}"
    calls = []

    def call(argv):
        calls.append(list(argv))
        if argv[2] == "ssh":
            script = plan.remote_script(argv[-1])
            if "/tmp/avt-probe-list" in script:
                return Result(stdout=remote + "\n")
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(tmp_path / "final.mp4"),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    sent = [
        plan.scp_remote_path(part)
        for argv in calls if argv[2] == "scp"
        for part in argv
    ]
    assert remote not in sent
    assert f"{plan.WORK_ROOT}/plates/a.npy" in sent
    assert "skip-existing: 1" in capsys.readouterr().out
    assert calls[-1][3] == "delete"


def test_a_failed_copy_is_not_retried_when_the_bytes_are_already_there(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, [CEASE_REL])
    remote = f"{plan.WORK_ROOT}/{CEASE_REL}"
    calls = []
    sent = []
    probes = {"n": 0}

    def call(argv):
        calls.append(list(argv))
        if argv[2] == "ssh":
            script = plan.remote_script(argv[-1])
            if "stat -c" in script:
                probes["n"] += 1
                if probes["n"] > 1:
                    return Result(stdout=remote + "\n")
                return Result(stdout="")
        if argv[2] == "scp" and plan.final_of(argv) == remote:
            sent.append(argv)
            return Result(1, stdout="connection reset\n")
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(tmp_path / "final.mp4"),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    assert len(sent) == 1
    assert f"skip-existing: {remote}" in capsys.readouterr().out
    assert not (tmp_path / "prepare_failure.log").exists()
    assert calls[-1][3] == "delete"


def test_local_startup_does_not_claim_workspace_before_the_copy():
    script = plan.startup_script(stage_from="local")
    head, _, tail = script.partition("if [ ! -f /tmp/avt-go ]")
    early = [line for line in head.splitlines() if line.startswith("mkdir ")]
    assert early and all("/workspace" not in line and "/tmp/" not in line for line in early)
    assert "mkdir -p /var/avt" in head
    assert "chmod 700 /var/avt" in head
    assert "chown root:root /var/avt" in head
    assert "/workspace/partnership/second_half" in tail
    assert "install -m 600 /tmp/avt-env /var/avt/env" in script
    checked = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr


def test_pull_publishes_root_outputs_for_the_login_user(tmp_path):
    final = os.path.join(plan.WORK_ROOT, "remote_run", "final.mp4")
    argvs = plan.local_pull_argvs("vm", "p", "z", str(tmp_path / "final.mp4"), str(tmp_path / "t.json"))
    script = plan.remote_script(argvs[0][-1])
    assert f"sudo cp -a -- {final} /tmp/avt-pull/final.mp4" in script
    assert "sudo cp -a -- /var/avt/timing.json /tmp/avt-pull/timing.json" in script
    assert 'sudo chown -R "$(id -un)":"$(id -gn)" -- /tmp/avt-pull' in script
    assert "sudo chmod -R a+rX -- /tmp/avt-pull" in script
    sources = [
        found for argv in argvs if argv[2] == "scp"
        for part in argv
        if (found := plan.scp_remote_path(part))
    ]
    assert sources == ["/tmp/avt-pull/final.mp4", "/tmp/avt-pull/timing.json"]
    assert "touch /tmp/avt-go" not in script
    checked = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr


def test_preflight_permission_failure_stops_before_the_copy(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, ["plates/a.npy"])
    calls = []

    def call(argv):
        calls.append(list(argv))
        if len(argv) > 3 and argv[3] == "delete":
            return Result(0)
        if argv[2] == "ssh" and "avt-write-probe" in plan.remote_script(argv[-1]):
            return Result(
                1,
                stdout="mkdir: cannot create directory '/workspace': Permission denied\n"
                "AVT_PREFLIGHT_FAIL: login user cannot write /workspace/partnership\n",
            )
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(tmp_path / "out" / "final.mp4"),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    captured = capsys.readouterr()
    err = captured.err
    assert "prepare failed at step 0" in err
    assert "AVT_PREFLIGHT_FAIL" in err
    assert "prepare_failure.log" in err
    assert not any(argv[2] == "scp" for argv in calls)
    preflights = [
        argv for argv in calls
        if argv[2] == "ssh" and "avt-write-probe" in plan.remote_script(argv[-1])
    ]
    assert len(preflights) == 1
    assert calls[-1][3] == "delete"
    assert "ceiling: $5.00" in captured.out
    log = (tmp_path / "out" / "prepare_failure.log").read_text()
    assert "Permission denied" in log


def test_preflight_retries_a_refused_connection_then_copies(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, ["plates/a.npy"])
    tries = {"n": 0}

    def call(argv):
        if argv[2] == "ssh" and "avt-write-probe" in plan.remote_script(argv[-1]):
            tries["n"] += 1
            if tries["n"] < 3:
                return Result(1, stdout="Connection refused\n")
            return Result(0, stdout="AVT_PREFLIGHT_OK\n")
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(tmp_path / "final.mp4"),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    assert tries["n"] == 3


def test_create_failure_records_gcloud_stderr(tmp_path, capsys):
    root, lock = _local_tree(tmp_path, ["plates/a.npy"])
    calls = []
    quota = "Quota 'CPUS_PER_VM_FAMILY' exceeded. Limit: 24.0 in region us-central1, vm_family: C4\n"

    def call(argv):
        calls.append(list(argv))
        if len(argv) > 3 and argv[3] == "create":
            result = Result(1, stdout="")
            result.stderr = quota
            return result
        return Result(0)

    output = tmp_path / "deliverables" / "final.mp4"
    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local",
         "--lock", str(lock), "--work-root", str(root),
         "--parity-dir", str(tmp_path), "--output", str(output),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test",
         "--cost-ceiling", "5"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    err = capsys.readouterr().err
    assert "CPUS_PER_VM_FAMILY" in err
    assert "gcloud create failed (1)" in err
    assert "no instance to delete" in err
    assert not any(len(argv) > 3 and argv[3] == "delete" for argv in calls)
    logged = (tmp_path / "deliverables" / "execute.log").read_text()
    assert quota.strip() in logged
    assert quota.strip() in (tmp_path / "deliverables" / "prepare_failure.log").read_text()
    assert "argv:" in logged
