"""The camera engine's WORLD placement, depth occlusion and zoom-about-a-point, on synthetic layers (no model, no
network: the plate's depth is supplied). Run: python3 -m pytest scripts/edit/tests"""
import json, os, subprocess, sys
import numpy as np, cv2

ENGINE = os.path.join(os.path.dirname(__file__), "..", "camera_engine.py")
W, H = 180, 320
FLAT_LENS = {"preset": "clean_50", "grain": 0, "vignette": 0, "dof": 0, "distortion": 0, "chromatic": 0, "flare": 0, "halation": 0, "motion_blur": 0, "contrast": 1.0, "saturation": 1.0, "compression": 1.0}
RED_BGR = (0, 0, 220)


def world(tmp, n=6):
    """A red performer whose matte touches the bottom of his frame (a waist-up take), a blue far plate with a green
    NEAR block across its lower half, and the depth that says so (bigger = nearer)."""
    md = os.path.join(tmp, "matte"); os.makedirs(md)
    al = np.zeros((H, W), np.uint8); al[H // 4:, W // 4:3 * W // 4] = 255
    fg = np.zeros((H, W, 3), np.uint8); fg[:] = RED_BGR
    for i in range(n):
        cv2.imwrite(os.path.join(md, f"alpha_{i:05d}.png"), al); cv2.imwrite(os.path.join(md, f"fg_{i:05d}.png"), fg)
    plate = np.zeros((H * 2, W * 2, 3), np.uint8); plate[:] = (200, 60, 20)            # far: blue
    depth = np.full((H * 2, W * 2), 0.10, np.float32)
    y_block = int(H * 2 * 0.55)
    plate[y_block:] = (40, 180, 40); depth[y_block:] = 0.90                              # near: a green block below 55 %
    cv2.imwrite(os.path.join(tmp, "plate.png"), plate); cv2.imwrite(os.path.join(tmp, "depth.png"), (depth * 65535).astype(np.uint16))
    return md


def render(tmp, md, spec, name):
    out = os.path.join(tmp, name + ".mp4")
    spec = dict({"lens": FLAT_LENS, "handheld": 0.0, "grade": {"cool": 0.0, "contrast": 1.0}}, **spec)
    subprocess.run([sys.executable, ENGINE, "--matte-dir", md, "--plate", os.path.join(tmp, "plate.png"), "--plate-depth", os.path.join(tmp, "depth.png"),
                    "--spec", json.dumps(spec), "--out", out, "--size", f"{W}x{H}", "--crf", "4", "--overscan", "1.0"], check=True, capture_output=True)
    cap = cv2.VideoCapture(out); frames = []
    while True:
        ok, f = cap.read()
        if not ok: break
        frames.append(f)
    return frames, json.load(open(os.path.join(tmp, name + "_camera.json")))


def red(frame):
    b, g, r = (frame[..., k].astype(np.int32) for k in range(3))
    return (r > 150) & (g < 90) & (b < 90)


def test_place_puts_the_take_on_a_plate_point(tmp_path):
    md = world(str(tmp_path))
    frames, cam = render(str(tmp_path), md, {"move": {"type": "static"}, "place": {"scale": 0.4, "at": [0.5, 0.5], "plane": 0.3}}, "placed")
    m = red(frames[0]); ys, xs = np.where(m)
    # the take's bottom-centre sits on (0.5, 0.5); at scale 0.4 the matte (3/4 of the take's height, half its width) is 96 x 36 px
    assert abs(ys.max() - H * 0.5) <= 3 and abs(xs.mean() - W * 0.5) <= 2
    assert abs((ys.max() - ys.min()) - 0.4 * H * 0.75) <= 4 and abs((xs.max() - xs.min()) - 0.4 * W * 0.5) <= 4
    assert cam["place"]["scale"] == 0.4 and abs(cam["performer_plane_depth"] - 0.3) < 1e-6
    assert cam["edge_reveal_frames"], "a waist-up take standing in the open shows its cut edge — the engine must say so"


def test_the_near_plate_hides_his_cut_edge(tmp_path):
    md = world(str(tmp_path))
    spec = {"move": {"type": "static"}, "place": {"scale": 0.4, "at": [0.5, 0.65], "plane": 0.3}}
    open_frames, open_cam = render(str(tmp_path), md, spec, "open")
    occ_frames, occ_cam = render(str(tmp_path), md, dict(spec, occlude={"margin": 0.05, "soft": 0.02}), "occluded")
    block_top = int(H * 0.55)
    assert red(open_frames[0])[block_top + 4:].any(), "without occlusion he is drawn over the near block"
    assert not red(occ_frames[0])[block_top + 4:].any(), "the near block is in front of him"
    assert red(occ_frames[0])[:block_top - 4].any(), "the part of him above the block is still there"
    assert open_cam["edge_reveal_frames"] and occ_cam["edge_reveal_frames"] == [], "a hidden cut edge is not a reveal"


def test_zoom_about_his_point_keeps_him_put_and_the_occluder_on_him(tmp_path):
    md = world(str(tmp_path))
    spec = {"move": {"type": "pull", "amount": 1.0, "ease": "linear", "about": [0.3, 0.65], "parallax": 0},
            "place": {"scale": 0.3, "at": [0.3, 0.65], "plane": 0.3}, "occlude": {"margin": 0.05, "soft": 0.02}}
    frames, cam = render(str(tmp_path), md, spec, "pull")
    first, last = red(frames[0]), red(frames[-1])
    x0, x1 = np.where(first)[1].mean(), np.where(last)[1].mean()
    assert abs(x0 - W * 0.3) <= 3 and abs(x1 - W * 0.3) <= 3, "the point he stands on does not move while the lens zooms"
    w0 = np.where(first)[1].max() - np.where(first)[1].min(); w1 = np.where(last)[1].max() - np.where(last)[1].min()
    assert 1.8 <= w0 / w1 <= 2.2, "the pull starts twice as tight"
    assert cam["edge_reveal_frames"] == [], "a zoom scales the occluder with him: the cut edge stays hidden at every focal length"
    assert cam["overscan"] <= 1.0 + 1e-6 and cam["path"][0]["zoom"] == 2.0

