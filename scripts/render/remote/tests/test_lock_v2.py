"""LOCK_v2 remote recipe. gcloud is a fake; nothing here contacts GCP."""

import hashlib
import json
import os
import re
import shlex
import signal
import stat
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import lock_v2  # noqa: E402
import plan  # noqa: E402
import remote_render  # noqa: E402


class Result:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _make_tree(tmp_path, clip_bytes=b"clip", manifest_bytes=None):
    lock = tmp_path / "final_lock_v2"
    lock.mkdir()
    (lock / "note.txt").write_bytes(b"tree-bytes")
    (lock / "SHA256SUMS").write_text(f"{_sha(b'tree-bytes')}  note.txt\n")
    clip = tmp_path / "clip.bin"
    clip.write_bytes(clip_bytes)
    size = len(clip_bytes) if manifest_bytes is None else manifest_bytes
    manifest = {
        "n_files": 1,
        "total_bytes": size,
        "files": [{"path": str(clip), "bytes": size, "sha256": _sha(clip_bytes)}],
    }
    (lock / "MANIFEST_LOCK_v2_inputs.json").write_text(json.dumps(manifest))
    return lock, clip


def test_workers_follow_the_15gb_rule_and_the_cpu_cap():
    assert lock_v2.v1e_workers_for_ram(60) == 4
    assert lock_v2.v1e_workers_for_ram(59.2) == 4
    assert lock_v2.v1e_workers_for_ram(32) == 2
    assert lock_v2.v1e_workers_for_ram(16) == 1
    assert lock_v2.v1e_workers_for_ram(15) == 1
    assert lock_v2.v1e_workers_for_ram(14) == 1
    assert lock_v2.v1e_effective_workers(4, 16) == 2
    assert lock_v2.final_workers_for_cpu(16, 24) == 4


def test_v1e_chunks_match_the_lock_order_and_final_ranges_cover_the_song():
    chunks = lock_v2.v1e_chunk_table()
    assert sum(chunk["nf"] for chunk in chunks) == plan.VERSE_NF
    assert chunks[0]["sf0"] == 3070 and chunks[0]["state_load"] is None
    assert lock_v2.state_at_arg(chunks) == "3310,3550,3790,4030,4224,4464,4704,4975"
    assert chunks[1]["state_load"] == "state_3310.npz"
    assert chunks[-1]["sf0"] == 4975 and chunks[-1]["nf"] == 6
    ranges = lock_v2.final_ranges(4)
    assert ranges[0][0] == 0
    assert ranges[-1][1] == plan.FULL_SONG_FRAMES - 1
    cursor = 0
    for start, end in ranges:
        assert start == cursor
        assert start % lock_v2.FINAL_CHUNK == 0
        cursor = end + 1
    assert cursor == plan.FULL_SONG_FRAMES


def test_projection_includes_transfer_and_install_and_stays_under_five_dollars():
    ram, vcpu, rate = lock_v2.machine_spec()
    proj = lock_v2.project(ram, vcpu, lock_v2.DOC_INPUT_GB, 5, rate)
    # 16 vCPU / 6 threads is the binding cap, under the 4 that 60 GB would start.
    assert proj["v1e_started"] == 2
    assert proj["v1e_effective"] == 2
    assert proj["final_started"] == 4
    assert proj["transfer_mb_s"] == 30
    assert proj["parts_hours"]["transfer"][0] < 0.5
    assert proj["parts_hours"]["install"][1] >= 0.25
    assert proj["parts_hours"]["final_chunks"][0] < proj["parts_hours"]["final_chunks"][1]
    assert proj["usd"][0] < proj["usd"][1] < 5
    assert proj["under"] is True
    text = lock_v2.projection_text(proj)
    assert "LOCK_v2 vs ceiling:" in text
    assert "(under)" in text
    assert "ffv1, libx264, prores_ks" in text
    assert "sequential" in text
    low = lock_v2.project(ram, vcpu, lock_v2.DOC_INPUT_GB, 1, rate)
    assert low["under"] is False
    assert low["usd"][1] > 1
    ram32, vcpu32, rate32 = lock_v2.machine_spec("c4-standard-32")
    wide_proj = lock_v2.project(
        ram32, vcpu32, lock_v2.DOC_INPUT_GB, 15, rate32, machine="c4-standard-32",
    )
    assert wide_proj["v1e_started"] == 5
    assert wide_proj["final_started"] == 8
    assert wide_proj["usd"][1] < 15
    assert wide_proj["hours"][1] < proj["hours"][1]
    highmem = lock_v2.machine_spec("c4-highmem-32")
    assert highmem[0] == 248 and highmem[1] == 32 and highmem[2] >= rate32
    ram24, vcpu24, rate24 = lock_v2.machine_spec("c4-standard-24")
    assert (ram24, vcpu24, rate24) == (90, 24, 1.21)
    assert lock_v2.v1e_workers(90, 24)["started"] == 4
    assert lock_v2.final_workers_for_cpu(24, 24) == 6


def test_recipe_argv_runs_state_then_chunks_and_keeps_scripts_unmodified():
    steps, envs = lock_v2.build_recipe("/opt/avt-comp/bin/python", lock_v2.LOCK_DIR, 4, 4, 16)
    names = [step["stage"] for step in steps]
    assert names == ["state_pass", "v1e_chunks", "final_chunks", "assemble"]
    assert "lock_repro" not in names
    opted, opted_env = lock_v2.build_recipe(
        "/opt/avt-comp/bin/python", lock_v2.LOCK_DIR, 4, 4, 16, lock_repro=True,
    )
    assert [step["stage"] for step in opted][0] == "lock_repro"
    repro = opted[0]["cmds"]
    assert [cmd["argv"][-1] for cmd in repro] == list(lock_v2.LOCK_NAMES)
    assert "setNumThreads(0)" in repro[0]["argv"][2]
    assert opted_env["repro"]["OMP_NUM_THREADS"] == "1"
    assert opted_env["repro"]["OPENCV_FOR_THREADS_NUM"] == "1"
    state = steps[0]["cmds"][0]
    assert "--state_only" in state
    assert state[state.index("--state_at") + 1] == lock_v2.state_at_arg()
    assert state[-1].endswith("/x.mkv")
    chunk_argvs = steps[1]["cmds"]
    assert "--state_load" not in chunk_argvs[0]
    assert "state_3310.npz" in chunk_argvs[1][chunk_argvs[1].index("--state_load") + 1]
    assert chunk_argvs[0][chunk_argvs[0].index("--out") + 1].endswith("chunk_3070.mkv")
    assert chunk_argvs[0][chunk_argvs[0].index("--md5log") + 1].endswith("chunk_3070.md5")
    assert steps[1]["slots"] == 4
    assert envs["v1e"]["ENC_NOAUDIO"] == "1"
    assert "ENC_LOSSLESS" not in envs["v1e"]
    assert envs["final"]["GRADE_PARAMS"].endswith("final_params_LOCK_v2.json")
    assert steps[3]["cmds"][0][1].endswith("final_render.py")
    assert "assemble" in steps[3]["cmds"][0]
    assert steps[2]["cmds"][0][2] == "chunks"


def test_pool_honors_slots_and_stops_the_others_on_failure():
    live = {"n": 0, "max": 0}

    class Proc:
        def __init__(self, code):
            self.code = code
            self.finished = False
            live["n"] += 1
            live["max"] = max(live["max"], live["n"])

        def poll(self):
            if not self.finished:
                self.finished = True
                live["n"] -= 1
            return self.code

        def kill(self):
            self.code = -9

    codes = iter([0, 0, 1, 0])

    def spawn(argv):
        return Proc(next(codes))

    with pytest.raises(SystemExit, match="worker exited"):
        lock_v2.run_pool([["a"], ["b"], ["c"], ["d"]], spawn, slots=2, sleep=lambda _s: None)
    assert live["max"] == 2
    assert live["n"] == 0


def test_repro_fallback_md5_and_v1e_and_final_lists():
    one = hashlib.md5(b"frame-a").hexdigest()
    two = hashlib.md5(b"frame-b").hexdigest()
    assert lock_v2.accept_repro("vhs", {"identical": True}, [], {})["via"] == "identical"
    matched = lock_v2.accept_repro("vhs", {"identical": False}, [one, two], {0: one, 1: two})
    assert matched["ok"] and matched["patch"] and matched["via"] == "frame_md5"
    assert not lock_v2.accept_repro("vhs", {"identical": False}, [one], {0: two})["ok"]
    assert lock_v2.ffmpeg_missing("") == ["ffv1", "libx264", "prores_ks"]
    assert lock_v2.ffmpeg_missing("ffv1 libx264 prores_ks") == []
    assert lock_v2.stack_versions_ok("2.5.5", "1.18.1", "5.1.0")
    assert not lock_v2.stack_versions_ok("2.5.5", "1.18.1", "4.10.0")

    frames = {frame: f"{frame:032x}" for frame in range(lock_v2.V1E_SF0, lock_v2.V1E_END)}
    reference = {frame: frames[frame] for frame in lock_v2.V1E_REF_FRAMES}
    still_frames = (3172, 3268, 3276, 3446, 3453, 3522, 3645, 3653, 3657, 3661, 3764)
    stills = {frame: frames[frame] for frame in still_frames}
    assert lock_v2.check_v1e(frames, reference, stills) == []
    broken = dict(stills)
    broken[3172] = "0" * 32
    assert any("3172" in item for item in lock_v2.check_v1e(frames, reference, broken))
    short = dict(frames)
    del short[4000]
    assert any("not 1911" in item for item in lock_v2.check_v1e(short, reference, stills))

    pre = "a" * 32
    final = "b" * 32
    chunk = {
        frame: {"md5_pre_grain": pre, "md5_final": final}
        for frame in range(plan.FULL_SONG_FRAMES)
    }
    parity = {"frames": [{"F": 120, "md5_pre_grain": pre, "md5_final": final}]}
    preview = {"120": pre, "200": pre}
    assert lock_v2.check_final_lists(chunk, parity, [preview]) == []
    bad = dict(chunk)
    bad[120] = {"md5_pre_grain": "c" * 32, "md5_final": final}
    assert any("md5_pre_grain" in item for item in lock_v2.check_final_lists(bad, parity, [preview]))
    spots = lock_v2.spot_frames([120, 200, 327, 444])
    assert spots == (120, 200, 327) or len(spots) == 3


def test_probe_accepts_the_delivery_shape_and_rejects_a_drift():
    def probe(codec="h264", fps="24/1", frames="5542", start="0.000000"):
        return {
            "streams": [
                {
                    "codec_type": "video", "codec_name": codec, "width": 1920, "height": 1080,
                    "avg_frame_rate": fps, "nb_frames": frames,
                },
                {"codec_type": "audio", "start_time": start},
            ],
        }
    assert lock_v2.probe_errors(probe(), codec="h264") == []
    assert lock_v2.probe_errors(probe(codec="prores"), codec="prores") == []
    assert any("fps" in item for item in lock_v2.probe_errors(probe(fps="30/1")))
    assert any("lag" in item for item in lock_v2.probe_errors(probe(start="0.500000")))
    assert any("nb_frames" in item for item in lock_v2.probe_errors(probe(frames="10")))


def test_sha256sums_and_manifest_stop_on_a_mismatch(tmp_path):
    lock, _clip = _make_tree(tmp_path)
    checked = lock_v2.preflight(str(lock))
    assert checked["files"] == 1
    assert checked["tree"] == 1
    (lock / "note.txt").write_bytes(b"edited")
    with pytest.raises(SystemExit, match="SHA256SUMS"):
        lock_v2.preflight(str(lock))
    (lock / "note.txt").write_bytes(b"tree-bytes")
    (tmp_path / "clip.bin").write_bytes(b"nope")
    with pytest.raises(SystemExit, match="manifest"):
        lock_v2.preflight(str(lock))


def _pad_sha(prefix):
    return (prefix + ("ab" * 32))[:64]


def test_frozen_renders_match_the_manifest_sha_not_sha256sums():
    base = "/workspace/partnership/first_half/claudia_vfx"
    rows = [
        {
            "path": f"{base}/vhs/v5b/lock/vhs_static_preview_v5b_1080p.mp4",
            "sha256": _pad_sha("d269656e"),
        },
        {
            "path": f"{base}/pixel_sort_salad/v1b/lock/pixel_sort_salad_preview_v1b_1080p.mp4",
            "sha256": _pad_sha("c0ffee01"),
        },
        {
            "path": f"{base}/spin_transitions/v1c/lock/spin_T1_v1c_preview_1080p.mp4",
            "sha256": _pad_sha("d701e77e"),
        },
        {
            "path": f"{base}/spin_transitions/v1c/lock/spin_T2T3_v1c_preview_1080p.mp4",
            "sha256": _pad_sha("f73755ad"),
        },
        {
            "path": f"{base}/spin_transitions/v1c/lock/spin_T4_v1c_preview_1080p.mp4",
            "sha256": _pad_sha("893d65b6"),
        },
        {
            "path": f"{base}/war_cry/claudia_build/v9c/lock/warcry_v9c_clip_1080p.mp4",
            "sha256": _pad_sha("0a0a0a0a"),
        },
        {
            "path": f"{base}/reverse_montage/v3b/lock/reverse_montage_preview_v3b_1080p.mp4",
            "sha256": _pad_sha("b1b1b1b1"),
        },
    ]
    log = "\n".join(
        "{'name': '%s', 'lock_sha256': '%s', 'identical': False}" % (name, row["sha256"])
        for name, row in (
            ("vhs", rows[0]),
            ("salad", rows[1]),
            ("spins_T1", rows[2]),
            ("spins_T2T3", rows[3]),
            ("spins_T4", rows[4]),
            ("war_cry", rows[5]),
            ("reverse_montage", rows[6]),
        )
    )
    shas = lock_v2.parse_lock_shas(log)
    assert shas["spins_T1"] == rows[2]["sha256"]
    assert shas["warcry"] == rows[5]["sha256"]
    found, errors, extras = lock_v2.frozen_coverage_errors(rows, shas)
    assert extras == []
    assert errors == []
    assert found["spins_T1"].endswith("spin_T1_v1c_preview_1080p.mp4")
    assert found["vhs"].endswith("vhs_static_preview_v5b_1080p.mp4")
    assert found["salad"].endswith("pixel_sort_salad_preview_v1b_1080p.mp4")
    assert "SHA256SUMS" not in " ".join(errors)
    bad = [dict(row) for row in rows]
    bad[2] = dict(bad[2], sha256=_pad_sha("ffffffff"))
    _found, bad_errors, _extra = lock_v2.frozen_coverage_errors(bad, shas)
    assert any("spins_T1" in item and "matched 0" in item for item in bad_errors)
    by_name, name_errors, _extra = lock_v2.frozen_coverage_errors(rows, None)
    assert name_errors == []
    assert by_name["spins_T2T3"].endswith("spin_T2T3_v1c_preview_1080p.mp4")
    assert lock_v2.frame_pair_ok(b"\x10\x20\x30", b"\x10\x20\x30")
    assert lock_v2.frame_pair_ok(b"\x10\x20\x30", b"\x10\x20\x32")
    assert not lock_v2.frame_pair_ok(b"\x00" * 30, b"\xff" * 30)
    text = lock_v2.projection_text(lock_v2.project(60, 16, 1, 15, 0.79))
    assert "lock repro: skipped" in text


def test_truncated_lock_repro_log_resolves_all_seven():
    # The box log cuts each line near 315 characters, before the closing brace.
    # Prefixes are the real lock_sha256 values; only vhs was printed in full.
    shas = {
        "vhs": "d269656e1686165d368d5053eda654fd467daa3e1994fd25fa881b1b9b9ebb1a",
        "salad": _pad_sha("ba9cdf2f"),
        "spins_T1": _pad_sha("d701e77e"),
        "spins_T2T3": _pad_sha("f73755ad"),
        "spins_T4": _pad_sha("893d65b6"),
        "warcry": _pad_sha("fa9b185e"),
        "montage": _pad_sha("a910e172"),
    }
    rows = [
        {"path": "/workspace/partnership/first_half/claudia_vfx/vhs/v5b/lock/vhs_static_preview_v5b_1080p.mp4", "sha256": shas["vhs"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/pixel_sort_salad/v1b/lock/pixel_sort_salad_preview_v1b_1080p.mp4", "sha256": shas["salad"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/spin_transitions/v1c/lock/spin_T1_v1c_preview_1080p.mp4", "sha256": shas["spins_T1"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/spin_transitions/v1c/lock/spin_T2T3_v1c_preview_1080p.mp4", "sha256": shas["spins_T2T3"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/spin_transitions/v1c/lock/spin_T4_v1c_preview_1080p.mp4", "sha256": shas["spins_T4"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/war_cry/claudia_build/v9c/lock/warcry_v9c_clip_1080p.mp4", "sha256": shas["warcry"]},
        {"path": "/workspace/partnership/first_half/claudia_vfx/reverse_montage/v3b/lock/reverse_montage_preview_v3b_1080p.mp4", "sha256": shas["montage"]},
    ]
    lines = []
    for name, digest in shas.items():
        line = (
            f"{name} rc=0 29s {{'name': '{name}', 'script': "
            f"'/tmp/claudia_lockrepro/{name}/scripts/build.py', "
            f"'rebuilt_sha256': '{digest}', 'lock_sha256': '{digest}', "
            f"'identical': True, 'frames': 180, 'pix_fmt': '"
        )
        assert "}" not in line
        assert len(line) > 200
        lines.append(line)
    lines.append("ALL_REPRO_DONE")
    parsed = lock_v2.parse_lock_shas("\n".join(lines))
    assert set(parsed) == set(lock_v2.LOCK_NAMES)
    assert parsed["vhs"] == shas["vhs"]
    assert parsed["spins_T1"].startswith("d701e77e")
    assert parsed["montage"].startswith("a910e172")
    found, errors, _extra = lock_v2.frozen_coverage_errors(rows, parsed)
    assert errors == []
    assert found["spins_T1"].endswith("spin_T1_v1c_preview_1080p.mp4")
    assert found["spins_T2T3"].endswith("spin_T2T3_v1c_preview_1080p.mp4")
    assert found["spins_T4"].endswith("spin_T4_v1c_preview_1080p.mp4")
    assert found["salad"].endswith("pixel_sort_salad_preview_v1b_1080p.mp4")
    assert found["warcry"].endswith("warcry_v9c_clip_1080p.mp4")
    assert found["montage"].endswith("reverse_montage_preview_v3b_1080p.mp4")
    assert found["vhs"].endswith("vhs_static_preview_v5b_1080p.mp4")


def test_vhs_missing_from_the_manifest_uses_the_known_path(tmp_path):
    root = tmp_path / "partnership"
    vhs = root / "first_half/claudia_vfx/vhs_static/v5b/renders/vhs_static_preview_v5b_1080p.mp4"
    vhs.parent.mkdir(parents=True)
    payload = b"vhs-v5b-frozen"
    vhs.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    base = "/workspace/partnership/first_half/claudia_vfx"
    rows = [
        {"path": f"{base}/pixel_sort_salad/v1b/lock/pixel_sort_salad_preview_v1b_1080p.mp4", "sha256": _pad_sha("ba9cdf2f")},
        {"path": f"{base}/spin_transitions/v1c/lock/spin_T1_v1c_preview_1080p.mp4", "sha256": _pad_sha("d701e77e")},
        {"path": f"{base}/spin_transitions/v1c/lock/spin_T2T3_v1c_preview_1080p.mp4", "sha256": _pad_sha("f73755ad")},
        {"path": f"{base}/spin_transitions/v1c/lock/spin_T4_v1c_preview_1080p.mp4", "sha256": _pad_sha("893d65b6")},
        {"path": f"{base}/war_cry/claudia_build/v9c/lock/warcry_v9c_clip_1080p.mp4", "sha256": _pad_sha("fa9b185e")},
        {"path": f"{base}/reverse_montage/v3b/lock/reverse_montage_preview_v3b_1080p.mp4", "sha256": _pad_sha("a910e172")},
    ]
    shas = {
        "vhs": digest,
        "salad": rows[0]["sha256"],
        "spins_T1": rows[1]["sha256"],
        "spins_T2T3": rows[2]["sha256"],
        "spins_T4": rows[3]["sha256"],
        "warcry": rows[4]["sha256"],
        "montage": rows[5]["sha256"],
    }

    def hasher(path):
        with open(path, "rb") as handle:
            return hashlib.sha256(handle.read()).hexdigest()

    found, errors, extras = lock_v2.resolve_frozen_renders(rows, shas, root=str(root), hasher=hasher)
    assert errors == []
    assert found["vhs"] == str(vhs)
    assert extras == [{"path": str(vhs), "sha256": digest, "bytes": len(payload)}]
    vhs.write_bytes(b"not-the-lock")
    _found, bad, _extra = lock_v2.resolve_frozen_renders(rows, shas, root=str(root), hasher=hasher)
    assert any("vhs" in item and "!=" in item for item in bad)
    vhs.unlink()
    _found, missing, _extra = lock_v2.resolve_frozen_renders(rows, shas, root=str(root), hasher=hasher)
    assert any("vhs" in item and "missing" in item for item in missing)


def test_reused_disk_skips_matching_tree_sha_and_chmods_writable(tmp_path):
    lock = tmp_path / "final_lock_v2"
    lock.mkdir()
    note = lock / "note.txt"
    note.write_bytes(b"tree-bytes")
    os.chmod(note, 0o444)
    stale = lock / "dryrun" / "SUPERSEDED.txt"
    stale.parent.mkdir()
    stale.write_bytes(b"old")
    os.chmod(stale, 0o444)
    (lock / "SHA256SUMS").write_text(f"{hashlib.sha256(b'tree-bytes').hexdigest()}  note.txt\n")
    rows = lock_v2.tree_transfer_rows(str(lock))
    assert [row["path"] for row in rows] == [str(note)]
    argvs = lock_v2.transfer_argvs(
        "vm", "p", "z", str(lock), [], "/tmp/env", os.path.dirname(plan.__file__), copy_tree=True,
    )
    assert not any("--recurse" in argv for argv in argvs)
    prepared = "\n".join(
        plan.remote_script(argv[-1]) for argv in argvs if len(argv) > 2 and argv[2] == "ssh"
    )
    assert "chmod -R u+w" in prepared
    assert "/workspace" in prepared
    copied = []

    def call(argv):
        if len(argv) > 2 and argv[2] == "ssh" and "sha256sum" in plan.remote_script(argv[-1]):
            return Result(0, stdout=str(note) + "\n")
        if len(argv) > 2 and argv[2] == "scp" and str(note) in argv[-1]:
            copied.append(argv)
        return Result(0, stdout="AVT_PARENTS_OK\n")

    plan._push_local({
        "transfer_argv": argvs,
        "transfer_rows": [],
        "tree_rows": rows,
        "instance_name": "vm",
        "project": "p",
        "zone": "z",
        "output": str(tmp_path),
        "output_is_dir": True,
        "transfer_attempts": 1,
        "side_files": {
            lock_v2.transfer_argvs.parent_local: lock_v2.transfer_argvs.parent_list,
        },
    }, call, lambda _seconds: None)
    assert copied == []


def test_lock_raws_reuse_identical_and_v1e_skips_a_finished_chunk(tmp_path):
    root = tmp_path / "claudia"
    os.makedirs(root)
    name = "vhs"
    raw_dir = os.path.join(lock_v2.LOCKREPRO, name)
    os.makedirs(raw_dir, exist_ok=True)
    raw = os.path.join(raw_dir, "frames_rgb24.raw")
    with open(raw, "wb") as handle:
        handle.write(b"raw-frames")
    digest = "d269656e" + "ab" * 28
    digest = digest[:64]
    repro = {
        "name": name, "identical": True, "pix_fmt": "rgb24",
        "lock_sha256": digest, "raw": "relative.raw",
    }
    with open(os.path.join(raw_dir, "repro.json"), "w") as handle:
        json.dump(repro, handle)
    calls = []

    def run_one(lock_name):
        calls.append(lock_name)
        return lock_v2._RunResult(0)

    rows = lock_v2.ensure_lock_raws(str(tmp_path), names=[name], run_one=run_one)
    assert calls == []
    saved = json.load(open(os.path.join(raw_dir, "repro.json")))
    assert saved["raw"] == raw
    assert any(row["path"] == raw for row in rows)
    os.remove(os.path.join(raw_dir, "repro.json"))

    def run_fresh(lock_name):
        calls.append(lock_name)
        with open(os.path.join(raw_dir, "repro.json"), "w") as handle:
            json.dump({
                "name": lock_name, "identical": True, "pix_fmt": "rgb24",
                "lock_sha256": digest, "raw": raw,
            }, handle)
        return lock_v2._RunResult(0)

    calls.clear()
    lock_v2.ensure_lock_raws(str(tmp_path), names=[name], run_one=run_fresh)
    assert calls == [name]
    for lock_name, pix in (("warcry", "bgr24"), ("montage", "yuv420p")):
        folder = os.path.join(lock_v2.LOCKREPRO, lock_name)
        os.makedirs(folder, exist_ok=True)
        raw_path = os.path.join(folder, "frames_rgb24.raw")
        with open(raw_path, "wb") as handle:
            handle.write(b"raw-frames")
        body = (
            "{'name': '%s', 'identical': True, 'pix_fmt': '%s', "
            "'lock_sha256': '%s', 'raw': '%s'}\n" % (lock_name, pix, digest, raw_path)
        )
        repro_path = os.path.join(folder, "repro.json")
        with open(repro_path, "w") as handle:
            handle.write(body)
        calls.clear()
        got = lock_v2.ensure_lock_raws(str(tmp_path), names=[lock_name], run_one=run_one)
        assert calls == []
        assert open(repro_path).read() == body
        assert all(row["path"].startswith("/tmp/") for row in got)
    bad = os.path.join(lock_v2.LOCKREPRO, "salad")
    os.makedirs(bad, exist_ok=True)
    with open(os.path.join(bad, "frames_rgb24.raw"), "wb") as handle:
        handle.write(b"raw-frames")
    with open(os.path.join(bad, "repro.json"), "w") as handle:
        json.dump({"name": "salad", "identical": False, "pix_fmt": "rgb24", "raw": "x"}, handle)
    calls.clear()
    try:
        lock_v2.ensure_lock_raws(str(tmp_path), names=["salad"], run_one=run_one)
    except SystemExit as exc:
        assert "will not be rebuilt" in str(exc)
    else:
        raise AssertionError("a present raw was rebuilt")
    assert calls == []
    chunk_dir = tmp_path / "v1e"
    chunk_dir.mkdir()
    chunk = {"sf0": 3070, "nf": 2, "state_load": None}
    mkv = chunk_dir / "chunk_3070.mkv"
    md5 = chunk_dir / "chunk_3070.md5"
    mkv.write_bytes(b"mkv")
    one = "a" * 32
    md5.write_text(one + "\n" + ("b" * 32) + "\n")
    assert lock_v2.v1e_chunk_complete(chunk, str(chunk_dir))
    md5.write_text(one + "\n")
    assert not lock_v2.v1e_chunk_complete(chunk, str(chunk_dir))
    script = lock_v2.startup_script(lock_v2.LOCK_DIR, 30)
    assert "mount --bind /workspace/partnership/.avt-scratch/v1e /var/avt/scratch/v1e" in script
    assert "mount --bind /workspace/partnership/.avt-scratch/states /var/avt/scratch/states" in script


def test_runner_source_does_not_hardcode_a_content_hash():
    text = open(os.path.join(HERE, "..", "lock_v2.py")).read()
    assert re.search(r"\b[0-9a-f]{64}\b", text) is None


def test_startup_installs_the_stack_and_passes_bash_n():
    script = lock_v2.startup_script(lock_v2.LOCK_DIR, 300)
    assert "--recipe lock_v2" in script
    assert "--lock-dir /workspace/partnership/final_lock_v2" in script
    assert "numpy==2.5.5" in script
    assert "scipy==1.18.1" in script
    assert "opencv-python-headless>=5.1,<5.2" in script
    assert "ffv1" in script and "libx264" in script and "prores_ks" in script
    assert "trap cleanup EXIT" in script
    assert "AVT_RENDER_FAIL" in script
    assert "AVT_ACCESS_TOKEN" not in script
    assert "BEGIN PRIVATE KEY" not in script
    completed = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert completed.returncode == 0, completed.stderr


def test_dry_run_prints_the_plan_and_calls_nothing(capsys):
    secret = "super-secret-token-value"
    called = []
    code = remote_render.main(
        ["--backend", "gcp", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", "/workspace/partnership/final_lock_v2", "--cost-ceiling", "5",
         "--zone", "us-central1-a"],
        env={"AVT_ACCESS_TOKEN": secret, "GCP_PROJECT": "avt-render"},
        call=lambda argv: called.append(argv) or Result(),
    )
    assert code == 0
    assert called == []
    out = capsys.readouterr().out
    assert "recipe: lock_v2" in out
    assert "c4-standard-16" in out
    assert "c4-standard-32" in out
    assert "machine comparison" in out
    assert "v1e workers: 2" in out
    assert "final_render workers: 4" in out
    assert "120 GB" in out
    assert "LOCK_v2 vs ceiling:" in out
    assert "(under)" in out
    assert "28.81 GB" in out
    assert "refuses the VM" in out
    assert "--recipe lock_v2" in out
    assert "--lock-dir /workspace/partnership/final_lock_v2" in out
    assert "--dry-run" in out
    assert "per-frame md5" in out
    assert "no preemptible quota" in out
    assert "did not create a VM" in out
    assert "full_sf3290" not in out
    assert secret not in out
    assert re.search(r"\b[0-9a-f]{64}\b", out) is None


def test_execute_refuses_when_the_projection_or_spot_or_a_hash_is_wrong(tmp_path, capsys):
    called = []

    def call(argv):
        called.append(argv)
        return Result()

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--cost-ceiling", "1", "--env-file", str(tmp_path / "env")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    assert called == []
    assert "would exceed the ceiling" in capsys.readouterr().err

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--spot", "--env-file", str(tmp_path / "env2")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    assert called == []
    assert "preemptible" in capsys.readouterr().err

    lock, _clip = _make_tree(tmp_path, clip_bytes=b"clip", manifest_bytes=9)
    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--env-file", str(tmp_path / "env3")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    assert called == []
    assert "manifest" in capsys.readouterr().err


def test_execute_pushes_absolute_paths_pulls_both_deliverables_and_deletes(tmp_path, capsys):
    lock, clip = _make_tree(tmp_path)
    output = tmp_path / "out"
    env_file = tmp_path / "env"
    calls = []
    seen_env = {}

    def call(argv):
        calls.append(list(argv))
        if any(str(env_file) == part for part in argv):
            seen_env["text"] = env_file.read_text()
            seen_env["mode"] = stat.S_IMODE(env_file.stat().st_mode)
        if "get-serial-port-output" in argv:
            return Result(stdout="\n".join([
                "AVT_STAGE setup 3",
                "AVT_STAGE verify 1",
                "AVT_STAGE lock_repro 2",
                "AVT_STAGE state_pass 4",
                "AVT_STAGE v1e_chunks 5",
                "AVT_STAGE final_chunks 6",
                "AVT_STAGE assemble 7",
                "AVT_RENDER_DONE",
            ]))
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--output", str(output), "--env-file", str(env_file),
         "--instance-name", "avt-test", "--cost-ceiling", "5"],
        env={
            "AVT_REMOTE_RENDER_CONFIRM": "1",
            "GCP_PROJECT": "avt-render",
            "AVT_ACCESS_TOKEN": "secret-token",
        },
        call=call,
    )
    assert code == 0, capsys.readouterr()
    create = next(argv for argv in calls if len(argv) > 3 and argv[3] == "create")
    assert "c4-standard-16" in create
    assert "120GB" in create
    assert "SPOT" not in create
    assert "DELETE" in create
    assert "auto-delete=no" in " ".join(create)
    assert calls[-1][3] == "delete"
    blob = "\n".join(" ".join(argv) for argv in calls)
    assert f"avt-test:{clip}" in blob
    assert "secret-token" not in blob
    assert lock_v2.H264_NAME in blob and lock_v2.PRORES_NAME in blob
    assert seen_env["text"].strip() == "AVT_REMOTE_RENDER_CONFIRM=1"
    assert seen_env["mode"] == 0o600
    assert not env_file.exists()
    summary = json.loads((output / "timing.json").read_text())
    assert summary["result"] == "done"
    assert summary["stages"]["verify"] == 1
    assert summary["stages"]["assemble"] == 7
    assert summary["projection"]["under"] is True
    assert "LOCK_v2 vs ceiling:" in summary["projection_text"]
    out = capsys.readouterr().out
    assert "sha256 ok on the launcher: 1 manifest files" in out
    assert "result: done" in out


def test_a_guest_failure_pulls_the_log_before_delete(tmp_path, capsys):
    lock, _clip = _make_tree(tmp_path)
    output = tmp_path / "out"
    calls = []

    def call(argv):
        calls.append(list(argv))
        if "get-serial-port-output" in argv:
            return Result(stdout="boom\nAVT_RENDER_FAIL guest\n")
        return Result(0)

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--output", str(output),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-test"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 2
    assert "AVT_RENDER_FAIL" in capsys.readouterr().err
    verbs = [argv[3] if len(argv) > 3 else "" for argv in calls]
    assert "delete" in verbs
    delete_at = max(index for index, argv in enumerate(calls) if len(argv) > 3 and argv[3] == "delete")
    pulled = [
        index for index, argv in enumerate(calls)
        if any("guest.log" in part for part in argv)
    ]
    assert pulled and pulled[0] < delete_at
    assert "AVT_RENDER_FAIL" in (output / "serial.txt").read_text()
    summary = json.loads((output / "timing.json").read_text())
    assert summary["result"] == "failed"


def test_cease_and_desist_path_survives_the_remote_shell(tmp_path):
    name = "PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav"
    audio = tmp_path / 'my audio & "takes"'
    audio.mkdir(parents=True)
    wav = audio / name
    payload = b"wav-bytes"
    wav.write_bytes(payload)
    lock = tmp_path / "final_lock_v2"
    lock.mkdir()
    (lock / "note.txt").write_bytes(b"tree-bytes")
    (lock / "SHA256SUMS").write_text(f"{_sha(b'tree-bytes')}  note.txt\n")
    manifest = {
        "n_files": 1,
        "total_bytes": len(payload),
        "files": [{"path": str(wav), "bytes": len(payload), "sha256": _sha(payload)}],
    }
    (lock / "MANIFEST_LOCK_v2_inputs.json").write_text(json.dumps(manifest))
    argvs = lock_v2.transfer_argvs(
        "avt-test", "p", "us-central1-a", str(lock), manifest["files"],
        "/tmp/avt-env", os.path.dirname(lock_v2.__file__),
    )
    copied = [
        argv for argv in argvs
        if argv[2] == "scp" and plan.final_of(argv) == str(wav)
    ]
    assert len(copied) == 1
    assert copied[0][-2] == str(wav)
    target = copied[0][-1]
    assert "'" not in target and '"' not in target
    assert "/.avt-incoming/" in target
    script = "\n".join(plan.remote_script(argv[-1]) for argv in argvs if plan.is_incoming_mv(argv))
    assert str(wav) in shlex.split(script)
    script = plan.remote_script(plan.gcloud_rejoin(argvs[0][-1]))
    parent = os.path.dirname(str(wav))
    assert parent in shlex.split(script)
    user_line = next(
        line.strip() for line in script.splitlines()
        if line.strip().startswith("sudo mkdir -p -- ") and parent in line
    )
    operands = user_line[len("sudo mkdir -p -- "):].split(" || ", 1)[0]
    printed = subprocess.run(
        ["bash", "-c", "printf '%s\\n' " + operands],
        capture_output=True, text=True, check=True,
    )
    assert parent in printed.stdout.splitlines()
    assert 'sudo chown -RP "$(id -un)":"$(id -gn)"' in script
    assert "refusing to chown" in script
    for line in script.splitlines():
        if 'chown -RP "$(id -un)"' in line:
            assert "/var/avt" not in shlex.split(line)
    assert "chmod 700 -- /var/avt" in script
    checked = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr
    # Hashing opens the path. It does not hand the name to a shell.
    assert lock_v2.verify_manifest_files(manifest["files"], plan.sha256_file) == []


def test_startup_leaves_workspace_to_the_login_user_and_passes_bash_n():
    script = lock_v2.startup_script(lock_v2.LOCK_DIR, 300, ram_gb=120, vcpu=32)
    head, _, tail = script.partition("if [ ! -f /tmp/avt-go ]")
    early = [line for line in head.splitlines() if line.startswith("mkdir ")]
    assert early and all("/workspace" not in line and "/tmp/" not in line for line in early)
    assert "chmod 700 /var/avt" in head
    assert "chown root:root /var/avt" in head
    assert "mkdir -p /tmp/claudia_lockrepro /tmp/avt-remote /workspace/partnership" in tail
    assert "--ram-gb 120 --vcpu 32" in script
    assert "install -m 600 /tmp/avt-env /var/avt/env" in script
    checked = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr


def test_lock_v2_pull_copies_var_avt_out_before_scp():
    argvs = lock_v2.pull_argvs("vm", "p", "z", "/out", "/out/timing.json")
    script = plan.remote_script(argvs[0][-1])
    assert f"sudo cp -a -- /var/avt/out/{lock_v2.H264_NAME} /tmp/avt-pull/out/{lock_v2.H264_NAME}" in script
    assert "sudo cp -a -- /var/avt/checks /tmp/avt-pull/checks" in script
    assert "sudo cp -a -- /var/avt/guest.log /tmp/avt-pull/guest.log" in script
    assert "sudo cp -a -- /var/avt/timing.json /tmp/avt-pull/timing.json" in script
    assert "sudo test -e /var/avt/out/" in script
    assert "[ -e /var/avt" not in script
    assert 'fail "required output was not published"' in script
    assert "chmod 700" not in script
    sources = [
        found for argv in argvs if argv[2] == "scp"
        for part in argv
        if (found := plan.scp_remote_path(part))
    ]
    assert sources == [
        f"/tmp/avt-pull/out/{lock_v2.H264_NAME}",
        f"/tmp/avt-pull/out/{lock_v2.PRORES_NAME}",
        "/tmp/avt-pull/checks",
        "/tmp/avt-pull/guest.log",
        "/tmp/avt-pull/timing.json",
    ]
    failed = lock_v2.failure_pull_argvs("vm", "p", "z", "/out", "/out/timing.json")
    assert failed[-1][-1] == "touch /tmp/avt-pulled"
    assert plan.scp_remote_path(failed[1][-2]) == "/tmp/avt-pull/guest.log"
    checked = subprocess.run(["bash", "-n"], input=script, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr


def test_c4_standard_32_scales_workers_and_stays_under_fifteen_dollars(tmp_path, capsys):
    terms = lock_v2.v1e_workers(120, 32)
    assert terms == {"ram": 8, "cpu": 5, "chunks": 9, "started": 5}
    assert lock_v2.v1e_workers(248, 32)["started"] == 5
    assert lock_v2.final_workers_for_cpu(32, 24) == 8
    ranges = lock_v2.final_ranges(8)
    assert len(ranges) == 8
    cursor = 0
    for start, end in ranges:
        assert start == cursor
        assert start % lock_v2.FINAL_CHUNK == 0
        cursor = end + 1
    assert cursor == plan.FULL_SONG_FRAMES
    compared = lock_v2.comparison_text(lock_v2.DOC_INPUT_GB, 15)
    assert "c4-standard-16:" in compared and "c4-standard-32:" in compared
    assert "$" in compared and " h," in compared

    lock, _clip = _make_tree(tmp_path)
    calls = []

    def call(argv):
        calls.append(list(argv))
        if "get-serial-port-output" in argv:
            return Result(stdout="AVT_RENDER_DONE")
        return Result(0)

    preview = remote_render.main(
        ["--backend", "gcp", "--dry-run", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--machine-type", "c4-standard-32", "--cost-ceiling", "15"],
        env={"GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert preview == 0
    preview_out = capsys.readouterr().out
    assert calls == []
    assert "machine comparison" in preview_out
    assert "c4-standard-16:" in preview_out and "c4-standard-32:" in preview_out
    assert "v1e workers: 5" in preview_out
    assert "final_render workers: 8" in preview_out
    assert "c4-standard-24:" in preview_out
    assert "CPUS_PER_VM_FAMILY" in preview_out
    assert "will fail create" in preview_out

    code = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--output", str(tmp_path / "out"),
         "--env-file", str(tmp_path / "env"), "--instance-name", "avt-wide",
         "--machine-type", "c4-standard-32", "--cost-ceiling", "15"],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert code == 0, capsys.readouterr()
    create = next(argv for argv in calls if "c4-standard-32" in argv)
    assert "c4-standard-32" in create
    assert "SPOT" not in calls[0]
    assert calls[-1][3] == "delete"
    assert "ceiling: $15.00" in capsys.readouterr().out
    summary = json.loads((tmp_path / "out" / "timing.json").read_text())
    assert summary["projection"]["v1e_started"] == 5
    assert summary["projection"]["final_started"] == 8
    assert summary["projection"]["usd"][1] < 15
    assert "c4-standard-16:" in summary["comparison_text"]
    assert "c4-standard-32:" in summary["comparison_text"]

    refused = remote_render.main(
        ["--backend", "gcp", "--execute", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--machine-type", "c4-standard-96",
         "--cost-ceiling", "15", "--env-file", str(tmp_path / "env2")],
        env={"AVT_REMOTE_RENDER_CONFIRM": "1", "GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert refused == 2
    assert "unknown --machine-type" in capsys.readouterr().err

    before = len(calls)
    tight = remote_render.main(
        ["--backend", "gcp", "--dry-run", "--stage-from", "local", "--recipe", "lock_v2",
         "--lock-dir", str(lock), "--machine-type", "c4-highmem-32", "--cost-ceiling", "15"],
        env={"GCP_PROJECT": "avt-render"},
        call=call,
    )
    assert tight == 0
    text = capsys.readouterr().out
    assert "c4-highmem-32" in text
    assert "248" in text
    assert len(calls) == before


def test_a_long_manifest_never_builds_an_oversize_argv():
    paths = []
    for index in range(380):
        paths.append(
            "/workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/"
            f"PARTNERSHIP - CEASE & DESIST MASTER  - {index:04d} (take \"A\" & b).wav"
        )
    pairs = [(path, 1_000_000 + index) for index, path in enumerate(paths)]
    decoded = plan.decode_probe_list(plan.encode_probe_list(pairs))
    assert decoded[0] == pairs[0]
    assert decoded[-1][0].endswith("(take \"A\" & b).wav")
    commands = plan.probe_commands("vm", "proj", "us-central1-a", pairs, "/tmp/avt-probe-local")
    assert [argv[2] for argv in commands] == ["scp", "ssh"]
    reader = plan.remote_script(commands[1][-1])
    assert "CEASE" not in reader
    assert "/tmp/avt-probe-list" in reader
    checked = subprocess.run(["bash", "-n"], input=reader, text=True, capture_output=True)
    assert checked.returncode == 0, checked.stderr
    rows = [{"path": path, "bytes": size, "sha256": "abc"} for path, size in pairs]
    argvs = lock_v2.transfer_argvs(
        "vm", "proj", "us-central1-a", "/workspace/partnership/final_lock_v2",
        rows, "/tmp/avt-env", os.path.dirname(lock_v2.__file__),
    )
    rels = [f"inputs/clip {index:04d} & take.wav" for index in range(380)]
    argvs.extend(plan.local_transfer_argvs(
        "vm", "proj", "us-central1-a",
        [{"rel": rel, "size": 10} for rel in rels],
        "/tmp/tree", "/tmp/lock.json", "/tmp/avt-env", os.path.dirname(plan.__file__),
    ))
    argvs.extend(commands)
    assert len(paths) >= 374
    for argv in argvs:
        assert plan.argv_within_limit(argv)
        for part in argv:
            assert len(part.encode()) <= plan.ARGV_LIMIT
    assert plan.argv_nbytes(commands[1]) < 16 * 1024


def test_path_preflight_accepts_the_cease_path_and_odd_names(tmp_path, capsys):
    lock = tmp_path / "final_lock_v2"
    lock.mkdir()
    names = [
        "/workspace/partnership/second_half/inputs/audio/PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav",
        "/workspace/partnership/second_half/inputs/it's a (take).wav",
        "/workspace/partnership/second_half/inputs/ratio:16x9.wav",
        "/tmp/plain.wav",
    ]
    rows = [{"path": path, "bytes": 4} for path in names]
    for index in range(46):
        (lock / f"tree{index}.bin").write_bytes(b"x")
    result = lock_v2.path_preflight(str(lock), manifest_files=rows, tree_files=[], require_section6=False)
    assert result["ok"], result["errors"]
    assert result["line"] == "path preflight: 4/4 pass"
    assert "path preflight: 4/4 pass" in capsys.readouterr().out
    argvs = lock_v2.transfer_argvs("vm", "p", "z", str(lock), rows, "/tmp/env", os.path.dirname(lock_v2.__file__))
    cease = next(argv for argv in argvs if plan.final_of(argv) == names[0])
    assert "'" not in cease[-1] and '"' not in cease[-1]


def _wheel_fetch(package, version):
    if package == "opencv-python-headless":
        return {"releases": {
            "5.1.0.95": [{
                "filename": "opencv_python_headless-5.1.0.95-cp37-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl",
            }],
        }}
    return {"urls": [{
        "filename": f"{package}-{version}-cp313-cp313-manylinux_2_28_x86_64.whl",
    }]}


def test_parent_check_uses_sudo_and_runs_after_mkdir():
    script = lock_v2._parent_reader()
    assert "sudo -n test -d" in script
    assert "[ ! -d" not in script
    rows = [{
        "path": "/workspace/partnership/final_lock_v2/scripts/final_render.py",
        "bytes": 10,
    }]
    argvs = lock_v2.transfer_argvs(
        "vm", "p", "z", lock_v2.LOCK_DIR, rows, "/tmp/env",
        os.path.dirname(lock_v2.__file__), copy_tree=False,
    )
    prefix = plan.prepare_prefix_length(argvs)
    assert prefix >= 3
    check = plan.remote_script(argvs[prefix - 1][-1])
    assert "AVT_PARENT_CHECK" in check
    assert "sudo -n test -d" in check
    mkdir = "\n".join(
        plan.remote_script(argv[-1]) for argv in argvs[:prefix]
        if len(argv) > 2 and argv[2] == "ssh"
    )
    assert "sudo test -d" in mkdir or "sudo -n test -d" in mkdir
    assert "/var/avt/checks" in mkdir
    assert "/tmp/avt-inputs-ready" in mkdir
    startup = lock_v2.startup_script(lock_v2.LOCK_DIR, 30)
    mount = startup.index('mount "$INPUT_DEV"')
    ready = startup.index("touch /tmp/avt-inputs-ready")
    assert mount < ready < startup.index("apt-get update")
    rehearsal = lock_v2.rehearsal_startup(False)
    assert rehearsal.index("touch /tmp/avt-inputs-ready") < rehearsal.index("apt-get update")
    assert "/var/avt/scratch/final" in rehearsal.split("apt-get", 1)[0]
    assert "/tmp/claudia_lockrepro" not in rehearsal.split("apt-get", 1)[0]
    called = []

    def call(argv):
        called.append(argv)
        result = Result(0, stdout="AVT_PARENTS_OK\n")
        return result

    plan._push_local({
        "transfer_argv": argvs,
        "transfer_rows": rows,
        "instance_name": "vm",
        "project": "p",
        "zone": "z",
        "output": "/tmp",
        "output_is_dir": True,
        "transfer_attempts": 1,
        "side_files": {lock_v2.transfer_argvs.parent_local: lock_v2.transfer_argvs.parent_list},
        "lock_rows": None,
    }, call, lambda _seconds: None)
    kinds = []
    for argv in called:
        if len(argv) > 2 and argv[2] == "ssh" and "AVT_PARENT_CHECK" in plan.remote_script(argv[-1]):
            kinds.append("check")
        elif len(argv) > 2 and argv[2] == "scp" and plan.final_of(argv) == rows[0]["path"]:
            kinds.append("file")
    assert "check" in kinds and "file" in kinds
    assert kinds.index("check") < kinds.index("file")


def test_rehearsal_uses_c4_and_logs_create_stderr(tmp_path, capsys):
    gaps, notes = plan.cpython313_wheel_gaps(_wheel_fetch)
    assert gaps == []
    assert any("numpy==2.5.5" in note for note in notes)
    assert any("abi3" in note or "opencv" in note for note in notes)
    broken = dict(_wheel_fetch("opencv-python-headless", None))
    broken["releases"] = {"5.1.0.95": [{"filename": "opencv_python_headless-5.1.0.95.tar.gz"}]}

    def missing(package, version):
        if package == "opencv-python-headless":
            return broken
        return _wheel_fetch(package, version)

    class Args:
        zone = "us-central1-a"
        lock_dir = str(tmp_path)
        output = str(tmp_path / "out")
        dry_run = False

    assert lock_v2.run_rehearsal(Args(), {}, None, False, wheel_fetch=missing) == 2
    assert "no CPython 3.13" in capsys.readouterr().err
    script = lock_v2.rehearsal_startup(False)
    assert "c4-standard-4" not in script
    assert lock_v2.guest_setup_shell().strip() in script
    assert lock_v2.guest_setup_shell().strip() in lock_v2.startup_script(lock_v2.LOCK_DIR, 10)
    assert script.index("/tmp/avt-go") < script.index("sha256sum -c")
    assert "import final_render" not in script
    assert "final_render.py chunks --range 124-127 --chunk 4" in script
    assert "/tmp/claudia_lockrepro/spins_T1/repro.json" in script
    assert "/tmp/avt-startup-failed" in script
    assert "AVT_RENDER_FAIL startup-$code" in script
    assert "publish" not in script
    lock = tmp_path / "final_lock_v2"
    (lock / "scripts").mkdir(parents=True)
    (lock / "scripts" / "final_render.py").write_text("print('help')\n")
    (lock / "params").mkdir()
    (lock / "params" / "final_params_LOCK_v2.json").write_text("{}\n")
    args = Args()
    args.lock_dir = str(lock)
    args.output = str(tmp_path / "out")
    calls = []

    def call(argv):
        calls.append(list(argv))
        if len(argv) > 3 and argv[3] == "create":
            result = Result(1, stdout="")
            result.stderr = "ERROR: E2 does not support Hyperdisk\n"
            return result
        return Result(0)

    code = lock_v2.run_rehearsal(
        args, {"GCP_PROJECT": "demo"}, call, True, wheel_fetch=_wheel_fetch,
    )
    assert code == 2
    create = next(argv for argv in calls if len(argv) > 3 and argv[3] == "create")
    assert "c4-standard-4" in create
    assert "hyperdisk-balanced" in create
    assert "debian-13" in create
    assert "e2-standard-4" not in create
    captured = capsys.readouterr()
    logged = (tmp_path / "out" / "execute.log").read_text()
    assert "Hyperdisk" in captured.err or "Hyperdisk" in captured.out or "Hyperdisk" in logged
    assert "gcloud create failed" in logged


def test_refused_ssh_stops_at_four_and_signal_deletes():
    now = [0.0]

    def clock():
        return now[0]

    def sleep(seconds):
        now[0] += seconds

    boots = {"n": 0}

    def boot_call(_argv):
        boots["n"] += 1
        if boots["n"] < 6:
            return Result(1, stdout="ssh: connect to host 10.0.0.5 port 22: Connection refused\n")
        if boots["n"] == 6:
            return Result(1, stdout="ssh: connect to host 10.0.0.5 port 22: Connection timed out\n")
        return Result(0, stdout="AVT_PREFLIGHT_OK\n")

    plan._call_each(
        [plan.gcp_ssh_argv("vm", "p", "z", "true")],
        boot_call, attempts=2, sleep=sleep, retry_seconds=0, clock=clock,
    )
    assert boots["n"] == 7
    assert now[0] < plan.BOOT_SSH_SECONDS
    later = {"n": 0}

    def later_call(_argv):
        later["n"] += 1
        if later["n"] == 1:
            return Result(0, stdout="AVT_PREFLIGHT_OK\n")
        return Result(1, stdout="ssh: connect to host 10.0.0.5 port 22: Connection refused\n")

    try:
        plan._call_each(
            [
                plan.gcp_ssh_argv("vm", "p", "z", "true"),
                plan.gcp_ssh_argv("vm", "p", "z", "echo later"),
            ],
            later_call, attempts=24, sleep=sleep, retry_seconds=0, clock=clock,
        )
    except SystemExit as exc:
        assert "prepare failed" in str(exc)
    else:
        raise AssertionError("a later refused ssh should fail that command only")
    assert later["n"] == 1 + plan.SSH_REFUSED_LIMIT
    deleted = []
    previous = signal.getsignal(signal.SIGTERM)
    plan.install_delete_on_signal(lambda: deleted.append("deleted"))
    try:
        handler = signal.getsignal(signal.SIGTERM)
        try:
            handler(signal.SIGTERM, None)
        except SystemExit as exc:
            assert exc.code == 128 + signal.SIGTERM
        assert deleted == ["deleted"]
    finally:
        signal.signal(signal.SIGTERM, previous)


def test_rehearsal5_guest_log_passes_each_stage():
    # The lines from rehearsal5's serial tail, plus the earlier stage lines
    # that same startup script prints. A timestamp prefix and --help text
    # must not zero the stages.
    log = "\n".join([
        "usage: final_render.py chunks [-h] --scratch SCRATCH",
        "the following arguments are required: mode, --scratch",
        "startup-script: AVT_STAGE setup 48",
        "AVT_STAGE verify 1",
        "smoke /var/avt/scratch/final/rehearsal_chunk.mkv 0.500000",
        "AVT_STAGE smoke 2",
        "assemble /var/avt/out/rehearsal_h264.mp4 h264",
        "assemble /var/avt/out/rehearsal_prores.mov prores",
        "AVT_STAGE assemble 0",
        "AVT_REHEARSAL_DONE",
    ])
    assert not plan.guest_startup_failed(log)
    assert not plan.guest_startup_failed("AVT_STARTUP_WAIT\n")
    scored = lock_v2.assess_guest_log(log)
    assert scored["setup"] == (True, 48.0)
    assert scored["verify"] == (True, 1.0)
    assert scored["smoke"] == (True, 2.0)
    assert scored["assemble"] == (True, 0.0)
    assert len({seconds for _ok, seconds in scored.values()}) == 4
    pulls = lock_v2._pull_commands(
        "vm", "p", "z",
        ["/var/avt/out/rehearsal_h264.mp4", "/var/avt/out/rehearsal_prores.mov"],
        [("/var/avt/out/rehearsal_h264.mp4", "/out/rehearsal_h264.mp4", False)],
    )
    published = plan.remote_script(pulls[0][-1])
    assert "sudo test -e /var/avt/out/rehearsal_h264.mp4" in published
    assert "sudo cp -a -- /var/avt/out/rehearsal_h264.mp4 /tmp/avt-pull/out/rehearsal_h264.mp4" in published
    assert plan.scp_remote_path(pulls[1][-2]) == "/tmp/avt-pull/out/rehearsal_h264.mp4"
