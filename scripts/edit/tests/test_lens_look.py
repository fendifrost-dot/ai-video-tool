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
