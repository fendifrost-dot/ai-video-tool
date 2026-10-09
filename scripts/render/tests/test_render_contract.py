"""The renderer executes the contract — on synthetic media whose pictures say what they are.

The contract is the fixture the app's own test writes and holds equal to what Review plays
(src/lib/storyboard/renderContract.test.ts → fixtures/contract_small.json). The media is made here by ffmpeg:
  take1.mp4   grey that gets lighter with time (level = 30 + 20 × seconds), so a frame says which moment of the file it is
  clip1.mp4   flat red      clip2.mp4   green that gets lighter with time, 1.2 s long
  still1.png  flat blue     song.wav    a tone
Then single frames of the render are read back and compared with what the contract says is on screen there.
Run: python3 -m pytest scripts/render/tests"""
import json, os, shutil, subprocess, sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import render_contract as rc  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "contract_small.json")
pytestmark = pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="needs ffmpeg")
W, H = 90, 160           # the media's own size (9:16)
SCALE = 12               # the contract's 1080×1920 frame, rendered at 90×160


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", *args], check=True)


def make_media(d):
    ramp = lambda base, per: f"geq=lum='clip({base}+{per}*T,0,255)':cb=128:cr=128"
    ff("-f", "lavfi", "-i", f"color=c=gray:s={W}x{H}:r=30:d=8,format=yuv420p,{ramp(30, 20)}", "-c:v", "libx264", "-g", "15", "-pix_fmt", "yuv420p", os.path.join(d, "take1.mp4"))
    ff("-f", "lavfi", "-i", f"color=c=0xC82828:s={W}x{H}:r=30:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", os.path.join(d, "clip1.mp4"))
    ff("-f", "lavfi", "-i", f"color=c=0x28C828:s={W}x{H}:r=30:d=1.2,format=yuv420p,geq=lum='clip(lum(X,Y)-40+60*T,0,255)':cb='cb(X,Y)':cr='cr(X,Y)'", "-c:v", "libx264", "-g", "10", "-pix_fmt", "yuv420p", os.path.join(d, "clip2.mp4"))
    # wider than the frame: it must be fitted whole, with black above and below
    ff("-f", "lavfi", "-i", "color=c=0x2828C8:s=160x90:d=1", "-frames:v", "1", os.path.join(d, "still1.png"))
    ff("-f", "lavfi", "-i", "sine=frequency=440:duration=20", os.path.join(d, "song.wav"))
    return {
        "project-references/u/p/take1.mp4": os.path.join(d, "take1.mp4"),
        "project-clips/u/p/clip1.mp4": os.path.join(d, "clip1.mp4"),
        "project-clips/u/p/clip2.mp4": os.path.join(d, "clip2.mp4"),
        "project-references/u/p/still1.png": os.path.join(d, "still1.png"),
        "project-audio/u/p/song.wav": os.path.join(d, "song.wav"),
    }


def frame_rgb(path, n, fps, box=None):
    """Mean R, G, B of output frame n (of the whole frame, or of a (x, y, w, h) part of it)."""
    crop = f",crop={box[2]}:{box[3]}:{box[0]}:{box[1]}" if box else ""
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-nostdin", "-i", path, "-vf", f"select=eq(n\\,{n}){crop},format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"], capture_output=True, check=True)
    px = r.stdout
    assert len(px) % 3 == 0 and len(px) > 0, f"frame {n} could not be read"
    count = len(px) // 3
    return tuple(sum(px[i::3]) / count for i in range(3))


@pytest.fixture(scope="module")
def rendered(tmp_path_factory):
    d = str(tmp_path_factory.mktemp("render"))
    media = make_media(d)
    media_path = os.path.join(d, "media.json")
    json.dump(media, open(media_path, "w"))
    out = os.path.join(d, "cut.mp4")
    result = rc.render(FIXTURE, media_path, out, scale=SCALE)
    return {"out": out, "result": result, "contract": json.load(open(FIXTURE)), "media": media, "media_path": media_path, "dir": d}


def test_the_file_is_the_contract(rendered):
    c, r = rendered["contract"], rendered["result"]
    assert r["frames"] == c["frames"] == 130
    assert abs(r["fps"] - c["fps"]) < 0.01
    assert (r["width"], r["height"]) == (90, 160)
    assert abs(r["seconds"] - c["duration_seconds"]) < 0.15
    assert r["audio"] == "aac"          # the song is in it
    assert r["shots"] == 5


def test_each_shot_shows_its_own_media_from_its_first_frame_to_its_last(rendered):
    out, c = rendered["out"], rendered["contract"]
    seg = {s["key"]: s for s in c["segments"]}
    mid = (0, 60, 90, 40)   # the middle of the frame (the still does not fill the frame top to bottom)
    # the red clip, on the first and the last frame of its shot — a cut, not a blend, on both sides
    for n in (seg["c002"]["frame_in"], seg["c002"]["frame_in"] + 5):
        r, g, b = frame_rgb(out, n, c["fps"], mid)
        assert r > 150 and g < 90 and b < 90, (n, r, g, b)
    r, g, b = frame_rgb(out, seg["c001"]["frame_out"] - 1, c["fps"], mid)
    assert abs(r - g) < 12 and abs(g - b) < 12, "the frame before the cut is still the grey take"
    # the blue still, fitted whole: blue across the middle, black above and below
    n = seg["c003"]["frame_in"] + 2
    r, g, b = frame_rgb(out, n, c["fps"], mid)
    assert b > 150 and r < 90 and g < 90, (r, g, b)
    assert max(frame_rgb(out, n, c["fps"], (0, 0, 90, 30))) < 25, "a wider picture is not cropped to fill the frame"
    # a shot with nothing on it is black
    assert max(frame_rgb(out, seg["c005"]["frame_in"] + 3, c["fps"])) < 25


def test_a_take_holds_its_first_picture_then_runs_on_the_song_clock(rendered):
    out, c = rendered["out"], rendered["contract"]
    f = c["segments"][0]["media"]["frames"]
    assert (f["lead"], f["play"]) == (9, 31)
    level = lambda n: frame_rgb(out, n, c["fps"])[1]
    held = [level(n) for n in (0, 4, f["lead"] - 1)]
    assert max(held) - min(held) < 2.5, "inside the lead-in the same picture holds"
    # then the file runs at its own rate: its grey level says which moment of the file is on screen (20 levels a second)
    for k in (0, 10, 30):
        want_seconds = f["source_first"] + k / c["fps"]
        luma = level(f["lead"] + k) * 219 / 255 + 16      # the file's grey is video-range luma; the frame read back is full-range RGB
        got_seconds = (luma - 30) / 20
        assert abs(got_seconds - want_seconds) < 0.12, (k, got_seconds, want_seconds)   # to the frame: 0.1 s at 10 fps, plus rounding


def test_a_clip_shorter_than_its_shot_holds_its_last_picture(rendered):
    out, c = rendered["out"], rendered["contract"]
    s = c["segments"][3]
    f = s["media"]["frames"]
    assert f["tail"] >= 7
    g = lambda n: frame_rgb(out, n, c["fps"])[1]
    playing = [g(s["frame_in"] + k) for k in (0, 6, f["play"] - 1)]
    assert playing[0] < playing[1] < playing[2], "while it has footage it runs"
    tail = [g(s["frame_in"] + f["play"] + k) for k in range(f["tail"])]
    assert max(tail) - min(tail) < 2.5 and abs(tail[0] - playing[2]) < 4, "then the last picture holds to the end of the shot"


def test_the_edits_effects_are_the_arithmetic_review_applies(rendered):
    out, c = rendered["out"], rendered["contract"]
    s = c["segments"][1]

    def expected(rgb, run):
        mix = lambda v: min(255.0, max(0.0, min(255.0, v * run["brightness"]) * run["contrast"] + 127.5 * (1 - run["contrast"]))) * (1 - run["flash"]) + 255 * run["flash"]
        return tuple(mix(v) for v in rgb)

    as_filmed = frame_rgb(out, s["frame_in"] + 2, c["fps"])
    assert as_filmed[0] > 150
    for run in s["picture_runs"]:
        got = frame_rgb(out, run["frame_in"], c["fps"])
        want = expected(as_filmed, run)
        assert all(abs(a - b) < 14 for a, b in zip(got, want)), (run, got, want)
    # the blackout holds, and the flash is white on its frame
    dark = next(r for r in s["picture_runs"] if r["brightness"] == 0.1 and r["flash"] == 0)
    assert max(frame_rgb(out, dark["frame_out"] - 1, c["fps"])) < 30
    flash = next(r for r in s["picture_runs"] if r["flash"] == 1)
    assert min(frame_rgb(out, flash["frame_in"], c["fps"])) > 225
    # the held image fades to black and stays black to its last frame
    fade = c["segments"][2]
    assert max(frame_rgb(out, fade["frame_out"] - 1, c["fps"])) < 25
    assert frame_rgb(out, fade["frame_in"] + 2, c["fps"], (0, 60, 90, 40))[2] > 150


def test_a_stretch_of_the_cut_renders_as_its_own_file(rendered, tmp_path):
    c = dict(rendered["contract"])
    # shots 2–3 only, as the app writes a section: frames re-counted from the stretch's own start, the song from 4 s
    part = {**c, "range": {"song_in": 4, "song_out": 10}, "frames": 60, "duration_seconds": 6, "audio": {**c["audio"], "song_in": 4}}
    part["segments"] = []
    for s in c["segments"][1:3]:
        shift = 40
        part["segments"].append({**s, "frame_in": s["frame_in"] - shift, "frame_out": s["frame_out"] - shift, "picture_runs": [{**r, "frame_in": r["frame_in"] - shift, "frame_out": r["frame_out"] - shift} for r in s["picture_runs"]]})
    p = tmp_path / "part.json"
    p.write_text(json.dumps(part))
    out = str(tmp_path / "part.mp4")
    r = rc.render(str(p), rendered["media_path"], out, scale=SCALE)
    assert r["frames"] == 60 and r["audio"] == "aac"
    assert frame_rgb(out, 0, 10)[0] > 150 and frame_rgb(out, 42, 10, (0, 60, 90, 40))[2] > 150


def test_it_refuses_what_it_cannot_execute_and_renders_nothing(rendered, tmp_path):
    c = rendered["contract"]

    def refused(change, media=None):
        bad = json.loads(json.dumps(c))
        change(bad)
        p = tmp_path / "bad.json"
        p.write_text(json.dumps(bad))
        m = tmp_path / "media.json"
        m.write_text(json.dumps(media if media is not None else rendered["media"]))
        out = tmp_path / "bad.mp4"
        with pytest.raises(rc.ContractError) as e:
            rc.render(str(p), str(m), str(out), scale=SCALE)
        assert not out.exists()
        return str(e.value)

    assert "version 2" in refused(lambda b: b.update(version=1))
    assert "lead + play + tail" in refused(lambda b: b["segments"][0]["media"]["frames"].update(play=5))
    assert "overlap" in refused(lambda b: b["segments"][1].update(frame_in=30))
    assert "outside the shot" in refused(lambda b: b["segments"][1]["picture_runs"][0].update(frame_out=999))
    assert "fitted whole" in refused(lambda b: b["frame"].update(fit="cover"))
    assert "no file given for project-clips/u/p/clip1.mp4" in refused(lambda b: None, {k: v for k, v in rendered["media"].items() if "clip1" not in k})


def test_the_plan_can_be_read_without_rendering(rendered, capsys):
    assert rc.main([FIXTURE, "--media", rendered["media_path"], "--plan", "--scale", str(SCALE)]) == 0
    printed = json.loads(capsys.readouterr().out)
    cmd = printed["command"]
    graph = cmd[cmd.index("-filter_complex") + 1]
    # every shot is one chain; nothing blends two shots (every transition is the cut Review plays)
    assert "xfade" not in graph and "blend" not in graph
    assert graph.count("tpad=") == 3 and "lutrgb" in graph      # three shots show a video file: each holds what it must
    assert cmd[cmd.index("-frames:v") + 1] == "130"
