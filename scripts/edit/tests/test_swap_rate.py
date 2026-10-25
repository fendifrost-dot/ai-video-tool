"""The put-back interpolates a swap to the original's frame rate (swap_rate.py): the rule and a real ffmpeg run."""
import json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from swap_rate import needs_interpolation, minterpolate_command, interpolate_swap


def test_the_rule():
    assert needs_interpolation(59.94, 22.23)          # the c044 case: Genjutsu's ~22 fps inside a 59.94 fps window
    assert needs_interpolation(59.94, 24.0)
    assert not needs_interpolation(59.94, 60000 / 1001)   # the same rate written two ways
    assert not needs_interpolation(24.0, 24.0)


def test_the_command_names_the_rate_and_the_size():
    c = minterpolate_command("in.mp4", "60000/1001", "out.mp4", 1080, 1920)
    vf = c[c.index("-vf") + 1]
    assert vf.startswith("minterpolate=fps=60000/1001:mi_mode=mci") and vf.endswith("scale=1080:1920:flags=lanczos")
    assert c[-1] == "out.mp4"


def test_a_22fps_clip_comes_out_at_the_original_rate():
    """ffmpeg really interpolates: a 1 s 22 fps test clip becomes ~60 frames at 60000/1001."""
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "swap.mp4"), os.path.join(d, "swap_at_source_rate.mp4")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x288:rate=22:duration=1",
                        "-pix_fmt", "yuv420p", src], check=True)
        interpolate_swap(src, "60000/1001", dst)
        o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,nb_frames",
                            "-of", "json", dst], capture_output=True, text=True).stdout
        st = json.loads(o)["streams"][0]
        assert st["r_frame_rate"] == "60000/1001"
        assert 55 <= int(st["nb_frames"]) <= 62
