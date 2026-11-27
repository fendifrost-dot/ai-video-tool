"""The draft comes back about 7% fast: conform_draft.py must bring it to the take's exact frame count and rate, and
must refuse a file that is not the take played a little fast. run_draft.py's helpers are pure and tested here too."""
import os, shutil, subprocess, sys
from fractions import Fraction

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))
import conform_draft as cd  # noqa: E402
import run_draft as rd  # noqa: E402


def test_stretch_is_the_measured_drift():
    # docs/alter/TEST_2026-11-26.md: 89 frames at 24 fps for a 96-frame source
    assert cd.stretch(96, Fraction(24), 89, Fraction(24)) == Fraction(96, 89)
    assert abs(float(cd.stretch(96, Fraction(24), 89, Fraction(24))) - 1.0787) < 1e-4
    # a draft at another rate is compared by length, not by frame count
    assert cd.stretch(240, Fraction(60000, 1001), 89, Fraction(24)) == (Fraction(240) * 1001 / 60000) / (Fraction(89) / 24)


def test_filter_stretches_interpolates_and_cuts_to_the_take():
    vf = cd.conform_filter(96, Fraction(24), 89, Fraction(24))
    assert vf.startswith("setpts=PTS*96/89,minterpolate=fps=24/1:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    assert "trim=end_frame=96" in vf and vf.endswith("setpts=N/((24/1)*TB)")
    cmd = cd.conform_command("raw.mp4", "out.mp4", 96, Fraction(24), 89, Fraction(24))
    assert cmd[cmd.index("-bf") + 1] == "0" and "-an" in cmd          # no B-frames (the tracker read 98 frames), no audio
    assert cmd[cmd.index("-video_track_timescale") + 1] == "24000"
    ntsc = cd.conform_command("raw.mp4", "out.mp4", 240, Fraction(60000, 1001), 222, Fraction(24))
    assert ntsc[ntsc.index("-r") + 1] == "60000/1001" and ntsc[ntsc.index("-video_track_timescale") + 1] == "60000"


def test_run_draft_helpers():
    assert rd.sheet_seconds(96, 24.0) == "0.50,1.00,1.50,2.00,2.50,3.00,3.50"
    assert rd.sheet_size(1400, 1400) == "960x960" and rd.sheet_size(640, 640) == "640x640"
    assert rd.sheet_size(2160, 3840) == "540x960"
    cmd = rd.compare_command("take.mp4", "draft.mp4", "out.mp4", 640, 24)
    assert cmd[cmd.index("-level") + 1] == "4.0" and cmd[cmd.index("-r") + 1] == "24"   # a phone plays it
    assert "0:a:0?" in cmd                                                                 # the take's audio, if it has any
    assert "hstack=inputs=2" in cmd[cmd.index("-filter_complex") + 1]


def _has_minterpolate():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"): return False
    r = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
    return "minterpolate" in r.stdout and "tpad" in r.stdout


def _clip(path, frames, rate=24, speed=None):
    vf = "testsrc2=size=160x120:rate=%d" % rate
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", vf]
    if speed: cmd += ["-vf", f"setpts=PTS/{speed}"]
    cmd += ["-frames:v", str(frames), "-r", str(rate), "-pix_fmt", "yuv420p", "-c:v", "libx264", path]
    subprocess.run(cmd, check=True)


@pytest.mark.skipif(not _has_minterpolate(), reason="needs ffmpeg with minterpolate and tpad")
def test_conform_writes_exactly_the_take_length(tmp_path):
    take, raw, out = (str(tmp_path / n) for n in ("take.mp4", "raw.mp4", "out.mp4"))
    _clip(take, 96); _clip(raw, 89)
    facts = cd.conform(take, raw, out)
    assert facts["take_frames"] == 96 and facts["raw_frames"] == 89 and facts["out_frames"] == 96
    assert abs(facts["stretch"] - 1.0787) < 1e-3
    frames, rate, _, _ = cd.probe(out)
    assert frames == 96 and rate == Fraction(24)


@pytest.mark.skipif(not _has_minterpolate(), reason="needs ffmpeg with minterpolate and tpad")
def test_conform_refuses_a_clip_that_is_not_the_take_a_little_fast(tmp_path):
    take, short, out = (str(tmp_path / n) for n in ("take.mp4", "short.mp4", "out.mp4"))
    _clip(take, 96); _clip(short, 48)                    # half the length: trimmed or another clip
    with pytest.raises(ValueError) as e: cd.conform(take, short, out)
    assert "not the take played a little fast" in str(e.value) and not os.path.exists(out)
    assert cd.conform(take, short, out, force=True)["out_frames"] == 96
