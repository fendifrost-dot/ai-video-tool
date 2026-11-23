"""The remote render planner spends nothing: no gcloud, no network, no VM."""

import io
import os
import stat
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


def test_execute_always_deletes_after_a_successful_create():
    plan_gcp = plan.build_plan(
        "gcp",
        {"GCP_PROJECT": "example-project"},
        confirm=True,
        parity_dir="/stills",
        lock_summary={"missing": [], "files": [], "on_avt": 0},
        instance_name="avt-render-test",
        env_file="/tmp/does-not-need-to-exist",
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
