"""The preview maker: its arithmetic, and one real copy made from synthetic media whose picture says which frame it is.

Run: python3 -m pytest scripts/render/preview/tests
"""
import json, os, shutil, subprocess, sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import make_preview as mp  # noqa: E402

needs_ffmpeg = pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="needs ffmpeg")


def test_the_storm_verse_is_1911_frames():
    start, end = mp.song_frames_to_seconds("3070-4980")
    assert round(start, 3) == 127.917 and round(end, 3) == 207.542
    assert mp.expected_frames(start, end) == 1911


def test_song_frames_are_first_and_last_shown():
    assert mp.song_frames_to_seconds("0-23") == (0.0, 1.0)
    assert mp.expected_frames(*mp.song_frames_to_seconds("100-100")) == 1
    for bad in ("", "10", "20-10", "a-b", "1-2-3"):
        with pytest.raises(mp.PreviewError):
            mp.song_frames_to_seconds(bad)


def test_a_stretch_must_run_forward():
    for start, end in ((5, 5), (5, 4), (-1, 4)):
        with pytest.raises(mp.PreviewError):
            mp.expected_frames(start, end)
    with pytest.raises(mp.PreviewError):
        mp.expected_frames(0, 1, 0)


def test_size_keeps_the_shape_and_never_enlarges():
    assert mp.scaled_size(3840, 2160) == (960, 540)
    assert mp.scaled_size(1920, 1080) == (960, 540)
    assert mp.scaled_size(2160, 3840) == (540, 960)
    assert mp.scaled_size(640, 360) == (640, 360)
    w, h = mp.scaled_size(1998, 1080)
    assert w == 960 and h % 2 == 0
    with pytest.raises(mp.PreviewError):
        mp.scaled_size(0, 1080)


def test_names():
    mp.check_names("storm_verse", 1)
    for section, version in (("Storm Verse", 1), ("", 1), ("_x", 1), ("ok", 0)):
        with pytest.raises(mp.PreviewError):
            mp.check_names(section, version)
    assert mp.storage_path("u", "p", "storm_verse", 3) == "u/p/effects_preview/storm_verse_v3.mp4"


def test_the_command_is_exact_length_silent_and_seekable():
    cmd = mp.ffmpeg_args("in.mov", "out.mp4", 1911, (960, 540), 24.0, 2.5)
    assert cmd[cmd.index("-frames:v") + 1] == "1911"
    assert cmd.index("-ss") < cmd.index("-i") and cmd[cmd.index("-ss") + 1] == "2.500000"
    assert "-an" in cmd and cmd[cmd.index("-g") + 1] == "12"
    assert cmd[cmd.index("-vf") + 1] == "fps=24,scale=960:540:flags=lanczos,format=yuv420p"
    assert cmd[cmd.index("-movflags") + 1] == "+faststart" and cmd[-1] == "out.mp4"


def test_the_record_is_what_the_app_reads():
    rec = mp.record("storm_verse", 3, 127.9166667, 207.5416667, 24.0, 1911, "Storm verse", {"lock": "LOCK_v1e"}, "2026-11-23T18:00:00Z")
    assert rec == {"section": "storm_verse", "version": 3, "song_start": 127.916667, "song_end": 207.541667, "fps": 24, "frames": 1911, "label": "Storm verse", "built_from": {"lock": "LOCK_v1e"}, "made_at": "2026-11-23T18:00:00Z"}
    row = mp.asset_row("u/p/effects_preview/storm_verse_v3.mp4", rec, 1911 / 24)
    assert row["asset_type"] == "other" and row["shot_id"] is None and row["version_number"] == 3
    assert row["metadata_json"]["bucket"] == "project-exports" and row["metadata_json"]["mime_type"] == "video/mp4"
    assert row["metadata_json"]["effects_preview"] is rec
    assert "label" not in mp.record("a", 1, 0, 1, 24.0, 24)


def test_length_checks():
    assert mp.frame_issues(1911, 1911) == [] and mp.frame_issues(1910, 1911) == []
    assert mp.frame_issues(1900, 1911) == ["the copy has 1900 frames, the stretch needs 1911"]
    assert mp.source_covers(79.625, 0, 127.9167, 207.5417)
    assert mp.source_covers(79.6, 0, 127.9167, 207.5417)          # a muxer's rounding
    assert not mp.source_covers(60, 0, 127.9167, 207.5417)
    assert not mp.source_covers(80, 5, 127.9167, 207.5417)


def test_built_from():
    assert mp.parse_built_from(["lock=LOCK_v1e", "script = a=b.py"]) == {"lock": "LOCK_v1e", "script": "a=b.py"}
    with pytest.raises(mp.PreviewError):
        mp.parse_built_from(["nokey"])


def test_refuses_without_a_stretch(capsys):
    assert mp.main(["x.mov", "--section", "a", "--version", "1"]) == 2
    assert "which stretch" in capsys.readouterr().err


@needs_ffmpeg
def test_a_real_copy_starts_where_it_says_and_is_exactly_as_long(tmp_path):
    """Source: 4 s at 30 fps, 384x216, grey that gets lighter with time (level = 40 + 40 x seconds).
    Copy: song frames 240-287 (2 s), taken from 1.0 s into the source → its frame 0 is the source's picture at 1.0 s."""
    src = str(tmp_path / "src.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i",
                    "color=c=gray:s=384x216:r=30:d=4,format=yuv420p,geq=lum='clip(40+40*T,0,255)':cb=128:cr=128",
                    "-c:v", "libx264", "-g", "15", "-pix_fmt", "yuv420p", src], check=True)
    out_dir = str(tmp_path / "out")
    code = mp.main([src, "--section", "test_ramp", "--version", "2", "--song-frames", "240-287", "--source-start", "1.0",
                    "--label", "Ramp", "--built-from", "lock=TEST", "--user", "u", "--project", "p", "--out-dir", out_dir])
    assert code == 0
    report = json.load(open(os.path.join(out_dir, "test_ramp_v2.json")))
    assert report["frames"] == 48 and report["size"] == "384x216" and report["seconds"] == 2.0
    assert report["upload_to"] == {"bucket": "project-exports", "path": "u/p/effects_preview/test_ramp_v2.mp4"}
    rec = report["row"]["metadata_json"]["effects_preview"]
    assert (rec["song_start"], rec["song_end"], rec["fps"], rec["frames"], rec["version"]) == (10.0, 12.0, 24, 48, 2)
    assert rec["built_from"]["lock"] == "TEST" and len(rec["built_from"]["source_sha256"]) == 64

    made = mp.probe(report["file"])
    assert made["frames"] == 48
    audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", report["file"]],
                           check=True, capture_output=True, text=True).stdout.strip()
    assert audio == ""

    def level(path, frame):
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-nostdin", "-i", path, "-vf", f"select=eq(n\\,{frame}),scale=1:1,format=gray",
                              "-frames:v", "1", "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
        return raw[0]

    # read with the same reader, the copy's frame k is the source's picture at 1.0 s + k/24 (30 fps source frames)
    for copy_frame, source_frame in ((0, 30), (24, 60), (47, 89)):
        assert abs(level(report["file"], copy_frame) - level(src, source_frame)) <= 4
    # ...and not the picture half a second either side: a slid copy fails here (the ramp moves ~27 levels in 0.5 s)
    assert abs(level(report["file"], 0) - level(src, 15)) > 15 and abs(level(report["file"], 0) - level(src, 45)) > 15


@needs_ffmpeg
def test_refuses_a_source_too_short_for_the_stretch(tmp_path, capsys):
    src = str(tmp_path / "short.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=gray:s=96x54:r=24:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", src], check=True)
    assert mp.main([src, "--section", "a", "--version", "1", "--song-start", "0", "--song-end", "5", "--out-dir", str(tmp_path / "o")]) == 2
    assert "cannot fill" in capsys.readouterr().err
    assert not os.path.exists(str(tmp_path / "o" / "a_v1.mp4"))


@needs_ffmpeg
def test_plan_makes_nothing(tmp_path, capsys):
    src = str(tmp_path / "s.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=gray:s=96x54:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", src], check=True)
    assert mp.main([src, "--section", "a", "--version", "1", "--song-start", "0", "--song-end", "2", "--out-dir", str(tmp_path / "o"), "--plan"]) == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["plan"] is True and plan["row"]["metadata_json"]["effects_preview"]["frames"] == 48
    assert not os.path.exists(str(tmp_path / "o"))
