"""The shoot guide's arithmetic against hand-worked numbers (no model, no network, no media).
Run: python3 -m pytest scripts/edit/tests/test_shoot_guide.py"""
import math, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import shoot_guide as SG  # noqa: E402


def close(a, b, tol=0.01): return abs(a - b) <= tol * max(1.0, abs(b))


def test_frame_is_16_by_9_on_the_full_frame_diagonal():
    w, h = SG.frame_mm("vertical"); assert close(w, 21.21) and close(h, 37.71)
    w, h = SG.frame_mm("horizontal"); assert close(w, 37.71) and close(h, 21.21)
    assert close(math.hypot(w, h), 43.27)


def test_waist_up_holds_his_top_42_percent_plus_headroom():
    V, y0, y1 = SG.visible_height("waist_up", 1.905)
    assert close(V, 1.905 * 0.42 / 0.92) and close(y0, 1.905 * 0.58) and close(y1 - y0, V)
    Vf, f0, _ = SG.visible_height("full_body", 1.905)
    assert close(Vf, 1.905 / 0.87) and f0 < 0                       # a full-body frame starts a little below his feet


def test_distance_is_focal_times_height_over_frame_height():
    g = SG.guide(85, "waist_up", "vertical", 1.8)
    assert close(g["distance_m"], 85 * (1.905 * 0.42 / 0.92) / 37.71)      # 1.96 m
    assert close(SG.guide(50, "waist_up")["distance_m"] / g["distance_m"], 50 / 85)   # distance scales with the lens, nothing else


def test_distance_does_not_depend_on_the_phone_lens_value():
    """The perspective number must survive a wrong estimate of the phone's own lens."""
    real = SG.load_phone
    def other(name):
        phone, diag = real(name); phone = dict(phone, lenses={k: dict(v, focal_eq_mm=v["focal_eq_mm"] * 0.9) for k, v in phone["lenses"].items()})
        return phone, diag
    a = SG.guide(85)["distance_m"]; SG.load_phone = other
    try: b = SG.guide(85)["distance_m"]
    finally: SG.load_phone = real
    assert a == b


def test_blur_disc_by_hand():
    # 85 mm at f/1.8 focused at 2 m, a point at 3 m: 85^2 / (1.8 * 1915) * (1000 / 3000) = 0.6987 mm
    assert close(SG.blur_disc_mm(85, 1.8, 2.0, 3.0), 0.6987, 0.002)
    assert SG.blur_disc_mm(85, 1.8, 2.0, 2.0) == 0.0
    assert SG.blur_disc_mm(85, 1.8, 2.0, 1000.0) > SG.blur_disc_mm(85, 1.8, 2.0, 3.0)
    assert SG.blur_disc_mm(85, 4.0, 2.0, 3.0) < SG.blur_disc_mm(85, 1.8, 2.0, 3.0)


def test_phone_lens_and_sharpness():
    g = SG.guide(85)
    assert g["phone"]["lens"] == "1x" and close(g["crop"], 85 / 28) and g["sharpness"] == "soft"
    assert round(g["phone_pixels_across_delivered_frame"]) == round(2160 / (85 / 28))
    assert close(g["longest_clean_lens_mm"], 56.0)
    assert SG.guide(50)["sharpness"] == "full sharpness"
    assert SG.guide(20)["phone"]["lens"] == "0.5x"
    wide = SG.guide(10)
    assert wide["crop"] == 1.0 and any("wider than this phone sees" in n for n in wide["notes"])


def test_tilt_lowers_the_camera_by_distance_times_tan():
    level = SG.guide(50, "thighs_up"); low = SG.guide(50, "thighs_up", tilt_deg=10)
    assert close(level["camera_height_m"] - low["camera_height_m"], level["distance_m"] * math.tan(math.radians(10)))


def test_more_room_behind_him_blurs_more_and_the_card_reads_in_feet():
    g = SG.guide(85, f_stop=1.8)
    shares = [b["target_share_of_width"] for b in g["blur"]]
    assert shares == sorted(shares) and all(b["phone_share_of_width"] < b["target_share_of_width"] for b in g["blur"])
    text = SG.card(g)
    assert "6 ft 5 in" in text and "1x" in text and "Measure it" in text


def test_lens_takes_a_preset_name():
    assert SG.resolve_lens("portrait_85") == (85.0, "portrait_85") and SG.resolve_lens("50") == (50.0, None)
