"""The coverage planner: the slot's clock survives an angle request, and a returned angle is cut in only through its
fidelity report. Run: python3 -m pytest scripts/edit/tests"""
import json, os, subprocess, sys

HERE = os.path.dirname(__file__)
PLANNER = os.path.join(HERE, "..", "camera_coverage.py")
PRESETS = os.path.abspath(os.path.join(HERE, "..", "..", "..", "config", "coverage_presets.json"))
sys.path.insert(0, os.path.join(HERE, ".."))
BPM = 120.0; BAR = 240.0 / BPM          # 2 s


def plan(tmp, fidelity=None, sung=True, with_file=True):
    """one 6-bar hook slot starting 10 s into its take, so every 4 s trim fits without probing a file"""
    out = os.path.join(tmp, "cov"); os.makedirs(os.path.join(out, "angles"), exist_ok=True)
    t0, t1 = 20.0, 20.0 + 6 * BAR
    spec = {"sync": {"offsetSeconds": 0.0, "driftPpm": 0.0}, "shots": [{"id": "S01", "kind": "performance", "timeline": {"start": t0, "end": t1}, "cameraMotion": {"type": "static", "description": ""}}]}
    renders = {"S01": {"file": os.path.join(tmp, "take.mp4"), "masterStart": t0 - 10.0, "keep": ["navy cap"]}}
    lines = {"lines": [{"start": t0, "end": t1 if sung else t0 + 0.2, "section": "hook", "text": "la"}]}
    for name, obj in (("spec.json", spec), ("renders.json", renders), ("lines.json", lines)): json.dump(obj, open(os.path.join(tmp, name), "w"))
    def run():
        subprocess.run([sys.executable, PLANNER, "plan", "--shotspecs", os.path.join(tmp, "spec.json"), "--renders", os.path.join(tmp, "renders.json"), "--out", out,
                        "--bpm", str(BPM), "--lyric-lines", os.path.join(tmp, "lines.json"), "--presets", PRESETS], check=True, capture_output=True)
        return json.load(open(os.path.join(out, "coverage_plan.json"))), json.load(open(os.path.join(out, "renders_coverage.json")))
    cov, rend = run()
    angles = [u for u in cov["slots"][0]["subs"] if u["source"] == "angle"]
    assert angles, "the hook preset asks for generated angles"
    if with_file:
        for u in angles:
            open(u["angle_file"], "w").write("x")
            if fidelity is not None: json.dump(fidelity, open(os.path.splitext(u["angle_file"])[0] + "_fidelity.json", "w"))
        cov, rend = run()
    return cov, rend, t0, t1


def test_an_angle_request_does_not_clobber_the_slots_clock(tmp_path):
    cov, _, t0, t1 = plan(str(tmp_path), with_file=False)
    slot = cov["slots"][0]
    assert slot["song"] == [t0, t1]
    for u in slot["subs"]:
        assert 0.0 <= u["move"]["start"] < u["move"]["end"] <= 1.0, u["id"]
    reqs = json.load(open(os.path.join(str(tmp_path), "cov", "angle_requests.json")))
    for r in reqs:
        assert abs((r["source_trim"][1] - r["source_trim"][0]) - 4.0) < 1e-6 and r["source_trim"][0] > 0


def test_a_passing_angle_is_cut_in_on_the_takes_clock(tmp_path):
    fid = {"identity_src_vs_result": 0.05, "lip": {"best_fit": {"corr": 0.7, "retime": 1.0, "offset_s": -0.08}, "corr_on_source_clock": 0.5}}
    cov, rend, _, _ = plan(str(tmp_path), fidelity=fid)
    for u in (u for u in cov["slots"][0]["subs"] if u["source"] == "angle"):
        g = u["angle_gate"]; assert g["use"] and g["reason"] == "passed" and abs(g["clock_shift_s"] + 0.08) < 1e-6
        assert rend[u["id"]]["file"] == u["angle_file"]
        # his lips arrive 0.08 s early in the angle → the angle starts 0.08 s later on the master clock
        assert abs(rend[u["id"]]["masterStart"] - (u["angle_masterStart"] + 0.08)) < 1e-3


def test_a_face_or_a_mouth_that_drifted_is_not_cut_onto_a_sung_line(tmp_path):
    for fid, why in (({"identity_src_vs_result": 0.4, "lip": {"best_fit": {"corr": 0.9, "retime": 1.0, "offset_s": 0.0}}}, "identity"),
                     ({"identity_src_vs_result": 0.05, "lip": {"best_fit": {"corr": 0.49, "retime": 1.0, "offset_s": 0.0}}}, "lip")):
        d = os.path.join(str(tmp_path), why); os.makedirs(d)
        cov, rend, _, _ = plan(d, fidelity=fid)
        for u in (u for u in cov["slots"][0]["subs"] if u["source"] == "angle"):
            assert not u["angle_gate"]["use"] and why in u["angle_gate"]["reason"]
            assert rend[u["id"]]["file"] == u["variant"]


def test_an_angle_nobody_measured_is_not_cut_onto_a_sung_line(tmp_path):
    cov, rend, _, _ = plan(str(tmp_path), fidelity=None)
    for u in (u for u in cov["slots"][0]["subs"] if u["source"] == "angle"):
        assert not u["angle_gate"]["use"] and "no fidelity report" in u["angle_gate"]["reason"]
        assert rend[u["id"]]["file"] == u["variant"]


def test_an_angle_that_did_not_move_the_camera_is_not_cut_in(tmp_path):
    fid = {"identity_src_vs_result": 0.02, "camera_change": {"score": 0.09}, "lip": {"best_fit": {"corr": 0.72, "retime": 1.0, "offset_s": 0.0}}}
    cov, rend, _, _ = plan(str(tmp_path), fidelity=fid)
    for u in (u for u in cov["slots"][0]["subs"] if u["source"] == "angle"):
        assert not u["angle_gate"]["use"] and "camera change" in u["angle_gate"]["reason"]
        assert rend[u["id"]]["file"] == u["variant"]


def test_an_angle_without_his_face_has_nothing_to_sync(tmp_path):
    fid = {"identity_src_vs_result": None, "camera_change": {"score": 1.0, "face_visible_share": 0.0}, "lip": None}
    cov, rend, _, _ = plan(str(tmp_path), fidelity=fid)
    for u in (u for u in cov["slots"][0]["subs"] if u["source"] == "angle"):
        assert u["angle_gate"]["use"] and "face not in frame" in u["angle_gate"]["reason"] and u["angle_gate"]["clock_shift_s"] == 0.0
        assert rend[u["id"]]["file"] == u["angle_file"]
