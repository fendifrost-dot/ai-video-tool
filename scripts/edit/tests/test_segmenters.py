"""SAM 3 person masks behind a flag (scripts/edit/segmenters.py): no weights, no network, no GPU here.
- flag / env selection, default mediapipe; the gated-access error path; the token is read from env only, never printed
- the matte contract (shape, dtype, range, fps) over a fake backend; instance choice; tracker seeding; save/load
- category refinement (the shoe, the halo) and the face geometry fallback
- the GPU runner refuses to spend without credentials
- the put-back scripts run under a stub `mediapipe` on a synthetic clip: the default path is byte-identical with and
  without --segmenter mediapipe, and --segmenter sam3 with precomputed mattes keeps the face proof at 0.
Run: /path/to/python -m pytest scripts/edit/tests/test_segmenters.py"""
import hashlib, json, os, shutil, subprocess, sys
import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
EDIT = os.path.dirname(HERE)
STUBS = os.path.join(HERE, "stubs")
sys.path.insert(0, EDIT)
import segmenters as S  # noqa: E402

HAVE_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
needs_ffmpeg = pytest.mark.skipif(not HAVE_FFMPEG, reason="ffmpeg/ffprobe not on PATH")


# ------------------------------------------------------------------------------------------------------ selection
def test_default_is_mediapipe_without_flag_or_env():
    assert S.choose_segmenter(None, env={}) == "mediapipe"


def test_env_then_flag_precedence():
    assert S.choose_segmenter(None, env={"AVT_SEGMENTER": "sam3"}) == "sam3"
    assert S.choose_segmenter("mediapipe", env={"AVT_SEGMENTER": "sam3"}) == "mediapipe"
    assert S.choose_segmenter(" SAM3 ", env={}) == "sam3"


def test_unknown_segmenter_is_refused():
    with pytest.raises(S.SegmenterError):
        S.choose_segmenter("rvm", env={})


def test_parser_defaults_leave_the_default_path():
    import argparse
    A = S.add_segmenter_args(argparse.ArgumentParser()).parse_args([])
    assert A.segmenter is None and A.sam3_prompt == "man in cap" and A.sam3_matte_dir is None
    assert S.choose_segmenter(A.segmenter, env={}) == "mediapipe"
    B = S.add_segmenter_args(argparse.ArgumentParser()).parse_args(["--segmenter", "sam3", "--sam3-point", "12,34", "--sam3-box", "1,2,3,4"])
    assert S.parse_point(B.sam3_point) == (12.0, 34.0) and S.parse_box(B.sam3_box) == (1.0, 2.0, 3.0, 4.0)


# ------------------------------------------------------------------------------------------------------ token + gating
def test_token_comes_from_env_only(monkeypatch):
    assert S.hf_token(env={"HF_TOKEN": " hf_abc "}) == "hf_abc"
    assert S.hf_token(env={"HUGGINGFACE_HUB_TOKEN": "hf_x"}) == "hf_x"
    monkeypatch.setitem(sys.modules, "huggingface_hub", None)   # no hub installed: no cached login either
    assert S.hf_token(env={}) is None


class _Resp:
    def __init__(self, code): self.status_code = code


class GatedRepoError(Exception):
    pass


class _Gated:
    @classmethod
    def from_pretrained(cls, *a, **k): raise GatedRepoError("Access to model facebook/sam3 is restricted")


class _Http403:
    @classmethod
    def from_pretrained(cls, *a, **k):
        e = Exception("403 Client Error"); e.response = _Resp(403); raise e


class _Broken:
    @classmethod
    def from_pretrained(cls, *a, **k): raise ValueError("shape mismatch")


def test_gated_access_fails_fast_with_the_request_url(capsys):
    b = S.Sam3Backend(token="hf_secret_value", device="cpu")
    with pytest.raises(S.Sam3AccessError) as ei:
        b._from_pretrained(_Gated)
    msg = str(ei.value)
    assert "https://huggingface.co/facebook/sam3" in msg and "HF_TOKEN" in msg and "--segmenter mediapipe" in msg
    assert "hf_secret_value" not in msg and "hf_secret_value" not in capsys.readouterr().out
    with pytest.raises(S.Sam3AccessError):
        b._from_pretrained(_Http403)
    with pytest.raises(ValueError):   # other failures keep their own type
        b._from_pretrained(_Broken)


def test_is_access_error_shapes():
    e = Exception("x"); e.response = _Resp(401)
    assert S.is_access_error(e) and S.is_access_error(GatedRepoError("gated")) and not S.is_access_error(ValueError("nope"))


# ------------------------------------------------------------------------------------------------------ matte contract
class FakeBackend:
    """Two instances: object 7 is him (large, every frame), object 2 a passer-by (small, some frames)."""
    def __init__(self, n=6, h=40, w=30): self.n, self.h, self.w = n, h, w; self.calls = []

    def describe(self): return dict(model="fake/sam3", revision="test", device="cpu")

    def video_instances(self, frames, prompt):
        self.calls.append(("video", prompt))
        for k in range(len(frames)):
            him = np.zeros((self.h, self.w), bool); him[5 + k:30 + k, 8:20] = True
            inst = [(7, 0.9, him)]
            if k % 2 == 0:
                other = np.zeros((self.h, self.w), bool); other[2:8, 24:28] = True; inst.append((2, 0.6, other))
            yield k, inst

    def video_tracked(self, frames, point=None, box=None):
        self.calls.append(("tracker", point, box))
        for k in range(len(frames)):
            m = np.zeros((self.h, self.w), bool); m[10:20, 10:20] = True; yield k, m

    def image_instances(self, image, prompt):
        self.calls.append(("image", prompt))
        m = np.zeros(image.shape[:2], bool); m[6:16, 10:18] = True
        return [(0.8, m)]


def _frames(n=6, h=40, w=30): return np.zeros((n, h, w, 3), np.uint8)


def test_person_matte_contract_and_instance_choice():
    be = FakeBackend(); seg = S.Sam3Segmenter(be, prompt="man in cap")
    m = seg.person_matte(_frames(), 59.94)
    assert m.alpha.shape == (6, 40, 30) and m.alpha.dtype == np.float32 and m.fps == 59.94
    assert float(m.alpha.min()) == 0.0 and float(m.alpha.max()) == 1.0
    assert m.provenance["object_id"] == 7 and m.provenance["mode"] == "text" and m.prompt == "man in cap"
    assert m.alpha[0, 2:8, 24:28].sum() == 0          # the passer-by is not in his matte
    assert m.alpha[3, 8:33, 8:20].all()               # he is, on every frame
    assert be.calls == [("video", "man in cap")]


def test_union_merges_every_instance():
    m = S.Sam3Segmenter(FakeBackend(), union=True).person_matte(_frames(), 24)
    assert m.alpha[0, 2:8, 24:28].all() and m.provenance["union"] is True and "object_id" not in m.provenance


def test_point_or_box_seed_uses_the_tracker():
    be = FakeBackend(); m = S.Sam3Segmenter(be, point=(15, 15)).person_matte(_frames(), 24)
    assert be.calls == [("tracker", (15, 15), None)] and m.provenance["mode"] == "tracker" and m.alpha[2, 12, 12] == 1.0


def test_validate_refuses_bad_mattes():
    with pytest.raises(S.SegmenterError): S.Matte(np.zeros((3, 4, 5), np.float64), 24).validate()
    with pytest.raises(S.SegmenterError): S.Matte(np.zeros((4, 5), np.float32), 24).validate()
    with pytest.raises(S.SegmenterError): S.Matte(np.full((2, 4, 5), 1.5, np.float32), 24).validate()
    with pytest.raises(S.SegmenterError): S.Matte(np.zeros((2, 4, 5), np.float32), 0).validate()


def test_face_mask_is_restricted_to_the_matte():
    seg = S.Sam3Segmenter(FakeBackend(), face_prompt="face")
    img = np.zeros((40, 30, 3), np.uint8)
    inside = np.zeros((40, 30), bool); inside[:, :16] = True
    fm = seg.face_mask(img, inside)
    assert fm is not None and fm[6:16, 10:16].all() and not fm[:, 16:].any()
    assert seg.face_mask(img, np.zeros((40, 30), bool)) is None   # too few pixels under the matte


@needs_ffmpeg
def test_matte_save_and_load_roundtrip(tmp_path):
    m = S.Sam3Segmenter(FakeBackend(n=8, h=48, w=32)).person_matte(_frames(8, 48, 32), 59.94)
    m.provenance["seed"] = None
    p = m.save(str(tmp_path / "clip.mp4.matte.mp4"), "60000/1001")
    assert os.path.exists(p) and os.path.exists(S.sidecar_path(p))
    meta = json.load(open(S.sidecar_path(p)))
    assert meta["frames"] == 8 and meta["fps"] == 59.94 and meta["prompt"] == "man in cap" and meta["model"] == "fake/sam3"
    back = S.Matte.load(p, 32, 48, 8)
    assert back.alpha.shape == (8, 48, 32) and back.alpha.dtype == np.float32 and back.fps == 59.94
    a, b = m.alpha > 0.5, back.alpha > 0.5
    assert (a & b).sum() / max(1, (a | b).sum()) > 0.97                    # H.264 keeps the shape
    with pytest.raises(S.SegmenterError):
        S.Matte.load(p, 32, 48, 9)                                          # a matte of another clip is refused
    half = S.Matte.load(p, 16, 24)                                          # scaled on load
    assert half.alpha.shape == (8, 24, 16)


# ------------------------------------------------------------------------------------------------------ refinement
def test_refine_categories_recovers_the_shoe_and_drops_the_halo():
    cat = np.zeros((20, 20), np.uint8); cat[4:14, 4:14] = 4; cat[6:9, 6:9] = 3; cat[14:18, 4:14] = 4   # a halo band below him
    person = np.zeros((20, 20), np.float32); person[4:16, 4:14] = 1.0                                 # SAM 3: him + the shoe rows 14-15
    out = S.refine_categories(cat, person, grow=0)
    assert (out[14:16, 4:14] == 4).all()      # inside the matte, MediaPipe's clothes stay
    assert (out[16:18, 4:14] == 0).all()      # outside the matte, MediaPipe's halo goes
    assert (out[6:9, 6:9] == 3).all()         # face skin keeps its label
    cat2 = np.zeros((20, 20), np.uint8); cat2[4:14, 4:14] = 4
    out2 = S.refine_categories(cat2, person, grow=0)
    assert (out2[14:16, 4:14] == 4).all()     # the dark shoe MediaPipe called background becomes clothes
    assert (S.refine_categories(cat, person, grow=2)[16:17, 4:14] == 4).all()   # a 2 px grow keeps the edge band


def test_face_geometry_from_mask():
    m = np.zeros((60, 40), bool); m[10:50, 10:30] = True
    pts, brow, fh, eye = S.face_geometry_from_mask(m)
    assert fh == pytest.approx(39, abs=1) and brow == pytest.approx(10 + 0.25 * fh, abs=0.5) and eye == pytest.approx(10 + 0.4 * fh, abs=0.5)
    assert pts.shape[1] == 2 and pts[:, 0].min() >= 10 and pts[:, 0].max() <= 29
    assert S.face_geometry_from_mask(np.zeros((60, 40), bool)) is None


def test_resolve_alpha_source():
    assert S.resolve_alpha_source("/x/alpha.mp4", "mediapipe") == ("file", "/x/alpha.mp4")
    assert S.resolve_alpha_source("sam3", "sam3") == ("sam3", None)
    assert S.resolve_alpha_source("sam3:/tmp/c.mp4", "sam3") == ("sam3", "/tmp/c.mp4")
    with pytest.raises(S.SegmenterError):
        S.resolve_alpha_source("sam3", "mediapipe")


# ------------------------------------------------------------------------------------------------------ the GPU runner
def _clean_env(tmp_path):
    env = {k: v for k, v in os.environ.items() if k not in ("HF_TOKEN", "HUGGINGFACE_HUB_TOKEN", "HF_HOME")}
    env["HOME"] = str(tmp_path); env["HF_HOME"] = str(tmp_path / "hf"); env["PYTHONPATH"] = STUBS
    return env


def test_runner_without_credentials_prints_howto_and_exits_2(tmp_path):
    clip = tmp_path / "c.mp4"; clip.write_bytes(b"x")
    r = subprocess.run([sys.executable, os.path.join(EDIT, "sam3_matte_runner.py"), str(clip), str(tmp_path / "out")],
                       capture_output=True, text=True, env=_clean_env(tmp_path))
    assert r.returncode == 2, r.stdout + r.stderr
    assert "HF_TOKEN" in r.stdout and "huggingface.co/facebook/sam3" in r.stdout and "nothing was spent" in r.stdout
    assert not (tmp_path / "out").exists()


def test_runner_dry_run_prints_the_plan_without_the_token(tmp_path):
    clip = tmp_path / "c.mp4"; clip.write_bytes(b"x")
    env = _clean_env(tmp_path); env["HF_TOKEN"] = "hf_do_not_print"
    r = subprocess.run([sys.executable, os.path.join(EDIT, "sam3_matte_runner.py"), str(clip), str(tmp_path / "out"), "--dry-run",
                        "--face-frames", "0,60"], capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "a10g-small" in r.stdout and "/output/c.mp4.matte.mp4" in r.stdout and "--face-frames" in r.stdout
    assert "hf token: present" in r.stdout and "hf_do_not_print" not in r.stdout


# ------------------------------------------------------------------------------------------------------ the scripts
def _write_video(path, frames, rate="24"):
    n, h, w, _ = frames.shape
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", rate, "-i", "-",
                          "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p", path], stdin=subprocess.PIPE)
    p.stdin.write(np.ascontiguousarray(frames).tobytes()); p.stdin.close(); assert p.wait() == 0


def _synthetic_take(n=8, h=160, w=96, jacket=(40, 200, 40), shoe=(20, 20, 20)):
    """A grey room; him: blue hair block, red face block, green jacket, yellow hands, a dark shoe on a dark floor."""
    f = np.full((n, h, w, 3), 120, np.uint8); f[:, 130:, :] = 28                       # dark floor
    for k in range(n):
        x = 30 + k                                                                       # he drifts a px per frame
        f[k, 20:34, x:x + 24] = (30, 30, 220)                                            # hair / cap
        f[k, 34:62, x + 2:x + 22] = (220, 40, 40)                                        # face
        f[k, 62:110, x - 6:x + 30] = jacket                                              # jacket
        f[k, 90:104, x - 12:x - 6] = (220, 220, 40); f[k, 90:104, x + 30:x + 36] = (220, 220, 40)   # hands
        f[k, 110:132, x + 2:x + 22] = (90, 90, 200)                                      # trousers
        f[k, 132:142, x - 2:x + 26] = shoe                                               # the shoe, on the dark floor
    return f


def _person_alpha(frames):
    g = frames.astype(int); bg = (np.abs(g - 120).max(3) < 6) | (np.abs(g - 28).max(3) < 6)
    return (~bg).astype(np.float32)


def _md5(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return hashlib.md5(raw).hexdigest()


def _run(script, args, tmp_path, extra_env=None):
    env = _clean_env(tmp_path); env["AVT_MODELS"] = str(tmp_path); env.update(extra_env or {})
    return subprocess.run([sys.executable, os.path.join(EDIT, script), *args], capture_output=True, text=True, env=env, cwd=str(tmp_path))


@needs_ffmpeg
def test_body_only_swap_default_path_is_byte_identical_and_sam3_keeps_the_proof(tmp_path):
    orig = _synthetic_take(); swap = _synthetic_take(jacket=(200, 200, 200), shoe=(230, 230, 230))
    o, s = str(tmp_path / "orig.mp4"), str(tmp_path / "swap.mp4"); _write_video(o, orig); _write_video(s, swap)
    r0 = _run("body_only_swap.py", [o, s, str(tmp_path / "a")], tmp_path)
    assert r0.returncode == 0, r0.stdout + r0.stderr[-2000:]
    assert "segmenter mediapipe" in r0.stdout and "max |out-original| on face/hair/skin: 0" in r0.stdout
    r1 = _run("body_only_swap.py", [o, s, str(tmp_path / "b"), "--segmenter", "mediapipe"], tmp_path)
    assert r1.returncode == 0, r1.stderr[-2000:]
    r2 = _run("body_only_swap.py", [o, s, str(tmp_path / "c")], tmp_path, {"AVT_SEGMENTER": "mediapipe"})
    assert r2.returncode == 0, r2.stderr[-2000:]
    h0, h1, h2 = (_md5(str(tmp_path / d / "c033_body_only_swap.mp4")) for d in "abc")
    assert h0 == h1 == h2, "the default path must not change with the flag spelled out or set by env"
    # sam3 with precomputed mattes (what the GPU runner leaves behind): no model is loaded, the proof holds
    mdir = tmp_path / "mattes"; mdir.mkdir()
    S.Matte(_person_alpha(orig), 24, "man in cap", dict(model="fake/sam3")).save(S.matte_path_for(str(mdir), o), "24")
    S.Matte(_person_alpha(swap), 24, "man in cap", dict(model="fake/sam3")).save(S.matte_path_for(str(mdir), s), "24")
    r3 = _run("body_only_swap.py", [o, s, str(tmp_path / "d"), "--segmenter", "sam3", "--sam3-matte-dir", str(mdir)], tmp_path)
    assert r3.returncode == 0, r3.stdout + r3.stderr[-2000:]
    assert "matte loaded" in r3.stdout and "segmenter sam3" in r3.stdout and "max |out-original| on face/hair/skin: 0" in r3.stdout
    assert os.path.exists(tmp_path / "d" / "person_000.png") and os.path.exists(tmp_path / "d" / "c033_body_only_swap.mp4")
    r4 = _run("body_only_swap.py", [o, s, str(tmp_path / "e"), "--segmenter", "sam3", "--sam3-matte-dir", str(tmp_path / "none")],
              tmp_path)   # no matte, no weights: fails without touching the default output
    assert r4.returncode != 0 and not os.path.exists(tmp_path / "e" / "c033_body_only_swap.mp4")


@needs_ffmpeg
def test_replace_him_default_path_is_byte_identical_and_sam3_reads_its_cache(tmp_path):
    take = _synthetic_take(n=10); clip = _synthetic_take(n=10, jacket=(60, 60, 60))
    t, c = str(tmp_path / "take.mp4"), str(tmp_path / "clip.mp4"); _write_video(t, take); _write_video(c, clip)
    ta, ca = str(tmp_path / "take_alpha.mp4"), str(tmp_path / "clip_alpha.mp4")
    _write_video(ta, np.repeat((_person_alpha(take) * 255).astype(np.uint8)[..., None], 3, 3))
    _write_video(ca, np.repeat((_person_alpha(clip) * 255).astype(np.uint8)[..., None], 3, 3))
    seg = tmp_path / "segments.json"
    seg.write_text(json.dumps(dict(song_start_clip=0.0, song_start_take=0.0, segments=[dict({"from": 2, "to": 6}, head_y=20, height=122, head_x=48, track=False)])))
    base = [c, ca, t, ta, str(seg)]
    r0 = _run("replace_him_in_clip.py", base + [str(tmp_path / "o0.mp4"), "--size", "96x160", "--report", str(tmp_path / "r0.json")], tmp_path)
    assert r0.returncode == 0, r0.stdout + r0.stderr[-2000:]
    assert "segmenter mediapipe" in r0.stdout and "replaced 5" in r0.stdout
    r1 = _run("replace_him_in_clip.py", base + [str(tmp_path / "o1.mp4"), "--size", "96x160", "--segmenter", "mediapipe"], tmp_path)
    assert r1.returncode == 0, r1.stderr[-2000:]
    assert _md5(str(tmp_path / "o0.mp4")) == _md5(str(tmp_path / "o1.mp4"))
    rep = json.load(open(tmp_path / "r0.json")); assert all(r["faces"] == [True, True] for r in rep if "scale" in r)
    # sam3: the take's alpha from a cache the GPU runner (or a local sam3_matte.py) wrote; no model is loaded
    cache = str(tmp_path / "take.sam3.mp4")
    S.Matte(_person_alpha(take), 24, "man in cap", dict(model="fake/sam3")).save(cache, "24")
    r2 = _run("replace_him_in_clip.py", [c, ca, t, "sam3:" + cache, str(seg), str(tmp_path / "o2.mp4"), "--size", "96x160", "--segmenter", "sam3"], tmp_path)
    assert r2.returncode == 0, r2.stdout + r2.stderr[-2000:]
    assert "matte loaded" in r2.stdout and "replaced 5" in r2.stdout
    r3 = _run("replace_him_in_clip.py", [c, ca, t, "sam3", str(seg), str(tmp_path / "o3.mp4"), "--size", "96x160"], tmp_path)
    assert r3.returncode != 0 and "needs --segmenter sam3" in (r3.stderr + r3.stdout)   # sam3 alpha under the default backend is refused
