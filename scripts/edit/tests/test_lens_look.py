"""The lens look on synthetic pictures: the blur's size, that nothing of him bleeds into the background, that his
solid pixels come back bit for bit, and the command line end to end (no model, no network).
Run: python3 -m pytest scripts/edit/tests/test_lens_look.py"""
import json, os, shutil, subprocess, sys
import numpy as np, cv2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lens_look as LL  # noqa: E402
import shoot_guide as SG  # noqa: E402

TOOL = os.path.join(os.path.dirname(__file__), "..", "lens_look.py")
W, H = 120, 200


def scene():
    """A green checker wall (red channel flat at 40), a pure red figure in the middle with a 2-pixel soft edge."""
    yy, xx = np.mgrid[0:H, 0:W]
    frame = np.zeros((H, W, 3), np.uint8); chk = ((xx // 6 + yy // 6) % 2).astype(bool)
    frame[chk] = (30, 180, 40); frame[~chk] = (20, 90, 40)                    # BGR
    hard = np.zeros((H, W), np.float32); hard[50:170, 40:80] = 1.0
    alpha = cv2.GaussianBlur(hard, (0, 0), 1.0); alpha[60:160, 46:74] = 1.0; alpha[alpha < 0.01] = 0
    fig = np.zeros((H, W, 3), np.float32); fig[:] = (10, 10, 230)
    frame = (frame * (1 - alpha[..., None]) + fig * alpha[..., None]).astype(np.uint8)
    return frame, alpha


def test_distances_same_framing_backs_the_camera_off():
    assert LL.target_distances("same_framing", 0.9, 1.6, 28, 84) == pytest.approx((2.7, 4.3))
    assert LL.target_distances("same_position", 0.9, 1.6, 28, 84) == pytest.approx((0.9, 2.5))


def test_blur_radius_is_the_thin_lens_disc_in_pixels():
    w_mm, _ = SG.frame_mm("vertical")
    r = LL.blur_radius_px(85, 1.8, 2.0, 3.0, w_mm, 1080)
    assert r == pytest.approx(0.5 * 0.6987 / 21.21 * 1080, rel=0.01)       # 17.8 px


def test_disc_kernel_is_normalised_and_oval_for_anamorphic():
    k = LL.disc_kernel(6.0); assert k.sum() == pytest.approx(1.0, abs=1e-5)
    rows = (k.sum(axis=1) > 1e-6).sum(); cols = (k.sum(axis=0) > 1e-6).sum(); assert abs(int(rows) - int(cols)) <= 1
    o = LL.disc_kernel(6.0, aspect=1.8)
    assert (o.sum(axis=1) > 1e-6).sum() > (o.sum(axis=0) > 1e-6).sum() + 3   # taller than wide


def test_his_solid_pixels_are_untouched_and_the_wall_is_blurred():
    frame, alpha = scene()
    out = LL.depth_of_field(frame, alpha, radius=7.0)
    solid = alpha >= 1.0
    assert np.array_equal(out[solid], frame[solid])
    wall = alpha == 0; far = np.zeros_like(wall); far[:, :25] = True; far &= wall
    assert out[..., 1][far].std() < 0.35 * frame[..., 1][far].std()        # the checker is gone
    assert abs(float(out[..., 1][far].mean()) - float(frame[..., 1][far].mean())) < 14   # and its light is kept


def test_nothing_of_him_bleeds_into_the_blurred_wall():
    frame, alpha = scene()
    out = LL.depth_of_field(frame, alpha, radius=7.0)
    grown = cv2.dilate((alpha > 0).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=6) > 0
    ring = grown & (alpha == 0)                                               # the wall within 6 px of him
    assert float(out[..., 2][ring].max()) <= 46                               # the wall's red is 40; a naive blur puts ~120 here
    naive = cv2.blur(frame, (15, 15))
    assert float(naive[..., 2][ring].max()) > 90                              # the fault this guards against is real


def test_soft_edge_loses_the_sharp_wall_not_the_figure():
    frame, alpha = scene()
    out = LL.depth_of_field(frame, alpha, radius=7.0)
    edge = (alpha > 0.3) & (alpha < 0.7)
    assert edge.any() and float(np.abs(out[..., 2][edge].astype(int) - frame[..., 2][edge].astype(int)).mean()) < 12   # his red stays


def test_crop_to_lens_shows_the_middle():
    img = np.zeros((H, W, 3), np.uint8); img[H // 4:3 * H // 4, W // 4:3 * W // 4] = 255
    out = LL.crop_to_lens(img, 2.0, (0.5, 0.5), cv2.INTER_LINEAR)
    assert out[4:-4, 4:-4].min() == 255 and np.array_equal(LL.crop_to_lens(img, 1.0, (0.5, 0.5), cv2.INTER_LINEAR), img)


def _video(path, frames, pix):
    h, w = frames[0].shape[:2]
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix, "-s", f"{w}x{h}", "-r", "24", "-i", "-",
                          "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv444p" if pix == "bgr24" else "gray", path], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); assert p.wait() == 0


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_command_line_end_to_end(tmp_path):
    frame, alpha = scene(); a8 = (alpha * 255).astype(np.uint8)
    src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4"); out = str(tmp_path / "out.mp4")
    _video(src, [frame] * 6, "bgr24"); _video(al, [a8] * 6, "gray")
    base = [sys.executable, TOOL, "--src", src, "--out", out, "--lens", "none", "--focal", "85", "--f-stop", "1.8", "--subject-m", "0.9", "--background-m", "1.6"]
    r = subprocess.run(base + ["--alpha", al], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "inside his matte, before the lens character: 0" in r.stdout
    meta = json.load(open(out + ".json"))
    assert meta["proof_max_diff_inside_matte"] == 0 and meta["physics"]["applied_blur_radius_px"] > 1 and meta["source"]["frames"] == 6
    # a matte of another length is refused (pairing is frame by frame)
    _video(al, [a8] * 5, "gray")
    r = subprocess.run(base + ["--alpha", al], capture_output=True, text=True)
    assert r.returncode != 0 and "frame by frame" in (r.stderr + r.stdout)
    # a wider lens than the take was shot on does not exist from the same position
    r = subprocess.run([sys.executable, TOOL, "--src", src, "--out", out, "--lens", "none", "--focal", "20", "--mode", "same_position"], capture_output=True, text=True)
    assert r.returncode != 0 and "does not exist" in (r.stderr + r.stdout)


# ----------------------------------------------------------------------------- depth mode (the model is replaced by a known map)
def test_metric_depth_is_tied_at_two_points():
    rel = np.array([[0.2, 0.6, 1.0]], np.float32)
    inv = LL.metric_inverse_depth(rel, near_rel=1.0, far_rel=0.2, subject_m=1.0, far_m=5.0)
    assert inv[0, 2] == pytest.approx(1.0) and inv[0, 0] == pytest.approx(0.2) and inv[0, 1] == pytest.approx(0.6)
    far_away = LL.metric_inverse_depth(rel, 1.0, 0.2, 1.0, None)
    assert far_away[0, 0] == pytest.approx(1e-4) and far_away[0, 2] == pytest.approx(1.0)


def test_radius_map_agrees_with_the_one_plane_numbers():
    phone, diag = SG.load_phone("iphone_14"); lens = phone["lenses"]["1x"]; w_mm, _ = SG.frame_mm("vertical", diag)
    s, B = 0.914, 1.6
    inv = np.array([[1 / s, 1 / (s + B)]], np.float32)
    r = LL.radius_map_px(inv, "same_framing", s, 28.0, 85.0, 1.8, lens, w_mm, 1080, 1.0)
    focus, bg = LL.target_distances("same_framing", s, B, 28.0, 85.0)
    r_t = LL.blur_radius_px(85.0, 1.8, focus, bg, w_mm, 1080); r_s = LL.source_radius_px(lens, s, B, w_mm, 1080, 1.0)
    assert r[0, 0] == pytest.approx(0.0, abs=0.05) and r[0, 1] == pytest.approx((r_t ** 2 - r_s ** 2) ** 0.5, rel=0.01)


def test_a_radius_map_blurs_each_part_by_its_own_amount():
    frame, alpha = scene()
    radius = np.zeros((H, W), np.float32); radius[:, W // 2:] = 7.0
    out = LL.depth_of_field(frame, alpha, radius)
    assert np.array_equal(out[alpha >= 1.0], frame[alpha >= 1.0])
    left = np.zeros((H, W), bool); left[:, :20] = True; right = np.zeros((H, W), bool); right[:, -20:] = True
    assert int(np.abs(out[left].astype(int) - frame[left].astype(int)).max()) <= 1          # radius 0: the picture as it was
    assert out[..., 1][right].std() < 0.35 * frame[..., 1][right].std()                      # radius 7: the checker is gone


def _moved(dx):
    """The checker wall with a hard-edged red figure moved sideways by dx pixels: (frame, alpha)."""
    yy, xx = np.mgrid[0:H, 0:W]; chk = ((xx // 6 + yy // 6) % 2).astype(bool)
    f = np.zeros((H, W, 3), np.uint8); f[chk] = (30, 180, 40); f[~chk] = (20, 90, 40)
    a = np.zeros((H, W), np.float32); a[60:160, 46 + dx:74 + dx] = 1.0
    f[a >= 1.0] = (10, 10, 230)
    return f, a


def test_clean_plate_takes_him_out():
    samples = [_moved(-30), _moved(0), _moved(30)]
    plate, hole = LL.clean_plate(samples)
    assert int(plate[..., 2].max()) < 120                         # no red figure left (the wall's red is 40)
    stays = [_moved(0), _moved(0)]
    plate2, hole2 = LL.clean_plate(stays)
    assert hole2.any() and int(plate2[..., 2].max()) < 120       # where he always stands, the wall is filled in


def test_static_depth_places_him_without_a_ghost():
    """A stand-in for the model: the wall's depth ramps left to right, he is nearest, and (like the real model) each
    picture is rescaled to 0..1 on its own, so the with-him and without-him maps do not share a scale."""
    ramp = np.tile(np.linspace(0.2, 0.6, W, dtype=np.float32), (H, 1))
    def fake(img):
        d = ramp.copy(); d[(img[..., 2] > 150) & (img[..., 1] < 80)] = 1.0
        return (d - d.min()) / (d.max() - d.min())
    samples = [_moved(-20), _moved(0), _moved(20)]
    inv, anchors = LL.static_inverse_depth(samples, subject_m=1.0, far_m=5.0, depth_fn=fake)
    # the wall behind where he stands follows the ramp: no step, no dip where his outline was
    row = inv[110]; assert float(np.abs(np.diff(row)).max()) < 0.02
    # tied to metres: the far edge is near 1/5, and his raw depth (1.0) maps to 1/1
    far_raw = float(np.percentile(ramp, 2)); expect = lambda raw: 0.2 + (raw - far_raw) / (1.0 - far_raw) * (1.0 - 0.2)
    assert inv[110, 1] == pytest.approx(expect(ramp[110, 1]), abs=0.03) and inv[110, W - 2] == pytest.approx(expect(ramp[110, W - 2]), abs=0.03)


def test_camera_shift_reads_the_background_not_him():
    rng = np.random.default_rng(3); wall = cv2.GaussianBlur((rng.random((H, W, 3)) * 255).astype(np.uint8), (0, 0), 1.2)
    a0 = np.zeros((H, W), np.float32); a0[60:160, 30:58] = 1.0; a1 = np.zeros((H, W), np.float32); a1[60:160, 60:88] = 1.0
    f0 = wall.copy(); f0[a0 >= 1.0] = (10, 10, 230); f1 = wall.copy(); f1[a1 >= 1.0] = (10, 10, 230)
    assert LL.camera_shift_px(f0, f1, a0, a1) < 0.5                # he walked 30 px; the camera did not move
    moved = np.roll(wall, 5, axis=1)
    assert LL.camera_shift_px(wall, moved) == pytest.approx(5.0, abs=0.6)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_command_line_guards(tmp_path):
    frame, alpha = scene(); a8 = (alpha * 255).astype(np.uint8)
    src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4"); out = str(tmp_path / "out.mp4")
    _video(src, [frame] * 12, "bgr24"); _video(al, [a8] * 12, "gray")
    run = lambda *args: subprocess.run([sys.executable, TOOL, *args], capture_output=True, text=True)
    # an output may not be the source or the matte, however the path is spelled
    r = run("--src", src, "--out", str(tmp_path / "." / "src.mp4"), "--lens", "none")
    assert r.returncode != 0 and "must not overwrite" in (r.stderr + r.stdout) and os.path.getsize(src) > 0
    # only a local file is read
    r = run("--src", "http://example.invalid/a.mp4", "--out", out, "--lens", "none")
    assert r.returncode != 0 and "not a local file path" in (r.stderr + r.stdout)
    # a file that is not the pinned depth model is not loaded
    r = run("--src", src, "--alpha", al, "--out", out, "--lens", "none", "--focal", "85", "--f-stop", "1.8", "--subject-m", "0.9",
            "--depth", "--depth-model", src)
    assert r.returncode != 0 and "not the pinned depth model" in (r.stderr + r.stdout) and not os.path.exists(out)
    # a window keeps every frame it rendered: the picture decides the length, not the audio
    r = run("--src", src, "--alpha", al, "--out", out, "--lens", "none", "--focal", "85", "--f-stop", "1.8", "--subject-m", "0.9",
            "--background-m", "1.6", "--start", "0.125", "--duration", "0.25")
    assert r.returncode == 0, r.stderr
    n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out],
                       capture_output=True, text=True).stdout.strip()
    assert int(n) == json.load(open(out + ".json"))["source"]["frames"] == 6


# ----------------------------------------------------------------------------- pairing by frame index (architecture review, 25 Nov 2026)
def _numbered(path, n, pix, audio=False, extra=()):
    """A clip whose frame k is a flat grey of level 10 + 4k, lossless, so a decoded frame says which frame it is."""
    frames = [np.full((H, W, 3) if pix == "bgr24" else (H, W), 10 + 4 * k, np.uint8) for k in range(n)]
    if not audio and not extra: return _video(path, frames, pix)
    raw = path + ".raw.mp4"; _video(raw, frames, pix)
    cmd = ["ffmpeg", "-v", "error", "-y", *extra, "-i", raw]
    if audio: cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={n / 24 + 0.2:.3f}", "-c:a", "aac"]
    r = subprocess.run(cmd + ["-c:v", "copy", path], capture_output=True, text=True)
    os.remove(raw); return r.returncode == 0


def _levels(gen): return [int(round(float(f.mean()))) for f in gen]


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_reader_pairs_by_frame_index_even_with_a_sound_track(tmp_path):
    src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4")
    assert _numbered(src, 48, "bgr24", audio=True); _numbered(al, 48, "gray")
    want = [10 + 4 * k for k in range(13, 21)]
    got_s = _levels(LL.reader(src, W, H, "bgr24", first=13, count=8)); got_a = _levels(LL.reader(al, W, H, "gray", first=13, count=8))
    assert all(abs(g - w) <= 1 for g, w in zip(got_s, want)) and len(got_s) == 8      # no frame repeated at the start of a window
    assert all(abs(g - w) <= 1 for g, w in zip(got_a, want)) and len(got_a) == 8
    picks = [3, 17, 40]
    assert [abs(g - (10 + 4 * k)) <= 1 for g, k in zip(_levels(LL.reader(src, W, H, "bgr24", picks=picks)), picks)] == [True] * 3
    assert len(list(LL.reader(src, W, H, "bgr24"))) == LL.probe(src)[3] == 48          # the whole clip: as many frames as were counted


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_probe_gives_the_displayed_size_of_a_rotated_clip(tmp_path):
    plain = str(tmp_path / "plain.mp4"); _numbered(plain, 4, "bgr24")
    assert LL.probe(plain)[:2] == (W, H)
    turned = str(tmp_path / "turned.mp4")
    if not _numbered(turned, 4, "bgr24", extra=("-display_rotation", "90")): pytest.skip("this ffmpeg cannot write a rotation tag")
    w, h = LL.probe(turned)[:2]
    assert (w, h) == (H, W)                                                             # stored upright-tagged sideways: read as displayed
    assert next(LL.reader(turned, w, h, "bgr24")).shape == (h, w, 3)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_window_with_sound_keeps_matte_and_picture_together(tmp_path):
    """The figure moves 3 px a frame and the matte moves with it. A matte one frame off leaves a strip of him
    blurred and a strip of wall sharp inside his outline; paired right, his whole body is the source's."""
    frames, mattes = [], []
    for k in range(36):
        f, a_ = _moved(-40 + 3 * k); frames.append(f); mattes.append((a_ * 255).astype(np.uint8))
    raw = str(tmp_path / "raw.mp4"); src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4"); out = str(tmp_path / "out.mp4")
    _video(raw, frames, "bgr24"); _video(al, mattes, "gray")
    assert subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-f", "lavfi", "-i", "sine=frequency=440:duration=1.7", "-c:v", "copy", "-c:a", "aac", src]).returncode == 0
    r = subprocess.run([sys.executable, TOOL, "--src", src, "--alpha", al, "--out", out, "--lens", "none", "--focal", "85", "--f-stop", "1.8",
                        "--subject-m", "0.9", "--background-m", "1.6", "--start", "0.51", "--duration", "0.5", "--crf", "0"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    meta = json.load(open(out + ".json")); first = meta["source"]["first_frame"]
    assert first == 12 and meta["source"]["frames"] == 12 and meta["matte_solid_share_of_frame"]["least"] > 0.05
    got = list(LL.reader(out, W, H, "bgr24"))
    assert len(got) == 12
    for i in (0, 5, 11):                                                                 # his body in the output is the red figure of the SAME source frame
        _, a_ = _moved(-40 + 3 * (first + i)); body = cv2.erode(a_, np.ones((5, 5), np.uint8)) >= 1.0
        assert float(got[i][..., 2][body].min()) > 180 and float(got[i][..., 1][body].max()) < 60


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_empty_matte_and_bad_arguments_are_refused(tmp_path):
    frame, alpha = scene()
    src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4"); out = str(tmp_path / "out.mp4")
    _video(src, [frame] * 6, "bgr24"); _video(al, [np.zeros((H, W), np.uint8)] * 6, "gray")
    dof = ["--src", src, "--alpha", al, "--out", out, "--lens", "none", "--focal", "85", "--f-stop", "1.8", "--subject-m", "0.9", "--background-m", "1.6"]
    run = lambda args: subprocess.run([sys.executable, TOOL, *args], capture_output=True, text=True)
    r = run(dof)
    assert r.returncode != 0 and "matte is empty" in (r.stderr + r.stdout)
    assert not os.path.exists(out) and not os.path.exists(out + ".v.mp4") and not os.path.exists(out + ".json")   # fail closed
    for bad, say in ((["--subject-m", "0"], "--subject-m must be above 0"), (["--f-stop", "-2"], "--f-stop must be above 0"), (["--about", "0.5"], "--about is two numbers")):
        r = run(dof + bad)
        assert r.returncode != 0 and say in (r.stderr + r.stdout) and "Traceback" not in r.stderr


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_same_position_crop_and_output_size(tmp_path):
    frame, alpha = scene(); a8 = (alpha * 255).astype(np.uint8)
    src = str(tmp_path / "src.mp4"); al = str(tmp_path / "alpha.mp4"); out = str(tmp_path / "out.mp4")
    _video(src, [frame] * 6, "bgr24"); _video(al, [a8] * 6, "gray")
    r = subprocess.run([sys.executable, TOOL, "--src", src, "--alpha", al, "--out", out, "--lens", "none", "--focal", "56", "--mode", "same_position",
                        "--f-stop", "2", "--subject-m", "0.9", "--background-m", "1.6", "--out-short-px", "60"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    meta = json.load(open(out + ".json"))
    assert meta["physics"]["crop"] == pytest.approx(2.0) and (meta["output"]["width"], meta["output"]["height"]) == (60, 100)
    assert meta["proof_max_diff_inside_matte"] == 0 and LL.probe(out)[:2] == (60, 100)
    assert meta["arguments"]["mode"] == "same_position" and meta["ffmpeg"].startswith("ffmpeg")


def test_the_proof_is_measured_before_his_pixels_are_copied_back():
    frame, alpha = scene(); solid = alpha >= 1.0
    wrong = frame.copy(); wrong[solid] //= 2
    assert LL.solid_drift(frame, frame, solid) == 0 and LL.solid_drift(wrong, frame, solid) > 50      # a real difference, not a constant
    assert LL.solid_drift(wrong, frame, np.zeros_like(solid)) == 0                                    # nothing solid: nothing to measure (main() refuses an empty matte)
    out, drift = LL.depth_of_field(frame, alpha, 7.0, check=True)
    assert drift == 0 and np.array_equal(out[solid], frame[solid])
    seen = {}
    real = LL.solid_drift
    def spy(o, f, m):
        seen["equal_before_copy"] = bool(np.array_equal(o[m], f[m])); o[m] = 0          # damage his pixels in the float result ...
        return 7
    LL.solid_drift = spy
    try: out, drift = LL.depth_of_field(frame, alpha, 7.0, check=True)
    finally: LL.solid_drift = real
    assert drift == 7                                                                    # ... the damage is what gets reported,
    assert seen["equal_before_copy"] is True                                             # the float maths itself had left him alone,
    assert np.array_equal(out[solid], frame[solid])                                      # and the copy-back comes after the measurement
