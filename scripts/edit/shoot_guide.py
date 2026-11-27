#!/usr/bin/env python3
"""
SHOOT GUIDE: where the phone goes so a take can carry a chosen lens look. Pure arithmetic, $0.

  python3 scripts/edit/shoot_guide.py --lens 85 --framing waist_up --f-stop 1.8
  python3 scripts/edit/shoot_guide.py --lens anamorphic_35 --framing thighs_up --orientation horizontal --background-m 4
  python3 scripts/edit/shoot_guide.py --lens 50 --framing chest_up --json card.json

Why (Fendi, 25 Nov 2026: "a camera lens emulator for my iPhone ... to instantly replicate a lens/distance/camera"):
a lens look has one part that cannot be added after the shoot, the perspective. The shape of a face and how close the
background feels are set by how far the camera stood from him, and by nothing else. Everything else (the tighter view,
the background blur, the lens character) is added afterwards by lens_look.py. So the guide answers one question
exactly, "how far back, and how high?", and reports honestly what the phone can and cannot carry at that distance.

Model (nothing here knows a shot or a project):
  * A lens is its full-frame-equivalent focal length f (mm), measured on the picture diagonal (43.27 mm). The frame
    is 16:9, upright or on its side.
  * Framing is how much of him the frame holds, top of head (plus headroom) down to a cut line on his body.
    visible height V = (his height above the cut line) / (1 - headroom - footroom).
  * Distance d = f * V / (frame height in mm). This is the whole of the perspective: it does not depend on the phone.
  * The phone lens is the longest one that still sees the whole target view. The crop is target f / phone f, and the
    sharpness verdict is how many of the phone's own pixels are left across the delivered frame.
  * Camera height: a level camera sits at the middle of the framed region; a tilt of t degrees moves it by d * tan(t).
  * Background blur: thin-lens blur disc c = f^2 / (N (d - f)) * B / (d + B) for a background B behind him, reported
    as a share of the picture width. The phone's own blur is reported the same way (its f-stop scaled to full frame).

Evidence: the formulas are textbook thin-lens optics, checked in scripts/edit/tests/test_shoot_guide.py against
hand-worked numbers. The phone's lens values are in phone_cameras.json with their own labels. Body proportions are
standard anthropometric ratios (ESTIMATE for him: a couple of centimetres either way moves the distance by about 2 %).
"""
import argparse, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FT = 0.3048
HIS_HEIGHT_M = 1.905                     # Fendi: 6 ft 3 in (his correction, on record in docs and memory)
HEADROOM = 0.08                          # DECISION: 8 % of the frame above the top of his head
FOOTROOM = 0.05                          # DECISION: 5 % below his feet on a full-body frame
# Where the bottom of the frame cuts him, as a share of his height from the floor (standard body proportions).
FRAMINGS = {
    "face":       {"cut": 0.80, "say": "face and neck"},
    "chest_up":   {"cut": 0.70, "say": "chest up"},
    "waist_up":   {"cut": 0.58, "say": "waist up"},
    "thighs_up":  {"cut": 0.38, "say": "mid-thigh up"},
    "knees_up":   {"cut": 0.27, "say": "knees up"},
    "full_body":  {"cut": 0.00, "say": "full body"},
}
SOFT_OK = 1.0                            # DECISION: up to here every delivered pixel has a phone pixel behind it
SOFT_SLIGHT = 1.34                       # DECISION: a 720p-to-1080 upscale; reads slightly soft, usable in a montage


def frame_mm(orientation, diag=43.27):
    """(width_mm, height_mm) of the 16:9 full-frame-equivalent picture, upright or on its side."""
    long_mm = diag * 16 / math.hypot(16, 9); short_mm = diag * 9 / math.hypot(16, 9)
    return (short_mm, long_mm) if orientation == "vertical" else (long_mm, short_mm)


def visible_height(framing, height_m=HIS_HEIGHT_M):
    """(V, y_bottom, y_top): metres of height the frame holds and where it starts and ends above the floor."""
    cut = FRAMINGS[framing]["cut"]; foot = FOOTROOM if framing == "full_body" else 0.0
    V = height_m * (1 - cut) / (1 - HEADROOM - foot)
    y_bottom = height_m * cut - foot * V
    return V, y_bottom, y_bottom + V


def blur_disc_mm(f_mm, n, focus_m, object_m):
    """Diameter (mm on the full-frame-equivalent picture) of the blur disc of a point at object_m when a lens of
    focal length f_mm at f-stop n is focused at focus_m. Thin lens; 0 at the focus distance."""
    s = focus_m * 1000.0; z = max(object_m * 1000.0, f_mm * 1.001)
    if s <= f_mm: raise ValueError("focus distance must be longer than the focal length")
    return f_mm * f_mm / (n * (s - f_mm)) * abs(z - s) / z


def blur_word(share):
    """Plain words for a blur disc as a share of the picture width (DECISION: the thresholds are a viewing judgement;
    on a 1080-pixel-wide frame they are discs of about 2, 9, 27 and 65 pixels)."""
    if share < 0.002: return "sharp"
    if share < 0.008: return "slightly soft"
    if share < 0.025: return "soft"
    if share < 0.060: return "blurred"
    return "shapes and colour only"


def load_phone(name):
    data = json.load(open(os.path.join(HERE, "phone_cameras.json")))
    if name not in data["phones"]: raise SystemExit(f"unknown phone '{name}'; known: {', '.join(data['phones'])}")
    return data["phones"][name], float(data["reference_diagonal_mm"])


def resolve_lens(value):
    """--lens takes millimetres or a preset name from lens_presets.json. Returns (focal_mm, preset_name or None)."""
    try: return float(value), None
    except ValueError: pass
    presets = json.load(open(os.path.join(HERE, "lens_presets.json")))["presets"]
    if value not in presets: raise SystemExit(f"--lens is millimetres or one of: {', '.join(presets)}")
    return float(presets[value]["focal_mm"]), value


def pick_phone_lens(phone, focal_mm):
    """The longest phone lens that still sees the whole target view; None when the target is wider than the phone."""
    ok = [(v["focal_eq_mm"], k) for k, v in phone["lenses"].items() if v["focal_eq_mm"] <= focal_mm + 1e-6]
    return max(ok)[1] if ok else None


def guide(focal_mm, framing="waist_up", orientation="vertical", f_stop=2.0, phone_name="iphone_14", height_m=HIS_HEIGHT_M,
          tilt_deg=0.0, background_m=None, deliver_short_px=1080):
    phone, diag = load_phone(phone_name)
    w_mm, h_mm = frame_mm(orientation, diag)
    V, y_bot, y_top = visible_height(framing, height_m)
    d = focal_mm * V / h_mm
    centre = (y_bot + y_top) / 2.0
    cam_h = centre - d * math.tan(math.radians(tilt_deg))
    notes = []
    if cam_h < 0.15: notes.append(f"A {tilt_deg:g} degree up-tilt from {d:.1f} m puts the lens under the floor; use a smaller tilt.")
    key = pick_phone_lens(phone, focal_mm)
    if key is None:
        key = min(phone["lenses"], key=lambda k: phone["lenses"][k]["focal_eq_mm"])
        notes.append(f"{focal_mm:g} mm is wider than this phone sees ({phone['lenses'][key]['focal_eq_mm']:g} mm at {key}). A wider view cannot be added afterwards.")
    pl = phone["lenses"][key]; crop = max(1.0, focal_mm / pl["focal_eq_mm"])
    px_left = phone["video"]["short_px"] / crop                      # phone pixels across the delivered frame's short side
    upscale = deliver_short_px / px_left
    verdict = "full sharpness" if upscale <= SOFT_OK else ("slightly soft" if upscale <= SOFT_SLIGHT else "soft")
    longest_clean = pl["focal_eq_mm"] * phone["video"]["short_px"] / deliver_short_px
    if upscale > SOFT_OK:
        notes.append(f"At {focal_mm:g} mm the crop leaves {px_left:.0f} of this phone's pixels across a {deliver_short_px}-pixel frame "
                     f"({verdict}). The longest lens it carries at full sharpness is about {longest_clean:.0f} mm.")
    # blur: the target lens focused on him, and the phone's own lens from the same spot
    n_phone_eq = pl["f_stop"] * pl["focal_eq_mm"] / pl["real_focal_mm"]
    def share(f, n, b): return blur_disc_mm(f, n, d, d + b) / w_mm
    distances = [background_m] if background_m else [1.0, 3.0, 10.0]
    blur = [{"background_m": b, "target_share_of_width": round(share(focal_mm, f_stop, b), 4), "target": blur_word(share(focal_mm, f_stop, b)),
             "phone_share_of_width": round(share(pl["focal_eq_mm"], n_phone_eq, b) * crop, 4),
             "phone": blur_word(share(pl["focal_eq_mm"], n_phone_eq, b) * crop)} for b in distances]
    k = focal_mm * focal_mm / (f_stop * (d * 1000 - focal_mm)) / w_mm   # blur share for a background at infinity
    need = 0.025                                                         # "blurred" starts here
    min_bg = d * need / (k - need) if k > need else None
    return {
        "target": {"focal_mm": focal_mm, "f_stop": f_stop, "framing": framing, "orientation": orientation},
        "phone": {"name": phone["label"], "lens": key, "lens_focal_eq_mm": pl["focal_eq_mm"], "mode": "4K at 24 fps"},
        "distance_m": round(d, 3), "distance_ft": round(d / FT, 2),
        "camera_height_m": round(cam_h, 3), "camera_height_ft": round(cam_h / FT, 2), "tilt_deg": tilt_deg,
        "frame_holds_m": [round(y_bot, 3), round(y_top, 3)],
        "crop": round(crop, 3), "he_fills_share_of_phone_frame": round(1 / crop, 3),
        "phone_sees_height_m": round(V * crop, 3),
        "phone_pixels_across_delivered_frame": round(px_left), "upscale": round(upscale, 3), "sharpness": verdict,
        "longest_clean_lens_mm": round(longest_clean, 1),
        "blur": blur, "background_for_clear_blur_m": None if min_bg is None else round(min_bg, 2),
        "room_needed_m": round(d + (min_bg or 0.3) + 0.3, 2),
        "notes": notes,
    }


def _ft(m):
    total_in = int(round(m / 0.0254)); ft, inch = divmod(total_in, 12)
    return f"{inch} in" if not ft else (f"{ft} ft {inch} in" if inch else f"{ft} ft")


def card(g):
    """The guide as a plain sheet for the person holding the phone."""
    t, p = g["target"], g["phone"]; say = FRAMINGS[t["framing"]]["say"]
    hold = "upright" if t["orientation"] == "vertical" else "on its side"
    L = [f"# Shoot card: {t['focal_mm']:g} mm at f/{t['f_stop']:g}, {say}", "",
         "| | Set it like this |", "|---|---|",
         f"| Phone | {p['name']}, on a tripod, {hold}, **{p['lens']}** lens, **{p['mode']}** |",
         f"| Distance | lens **{_ft(g['distance_m'])} ({g['distance_m']:.2f} m)** from him. Measure it: this is the part that cannot be fixed later |",
         f"| Height | lens **{_ft(g['camera_height_m'])} ({g['camera_height_m']:.2f} m)** off the floor" + (", level (no tilt)" if not g["tilt_deg"] else f", tilted up {g['tilt_deg']:g} degrees") + " |"]
    if g["crop"] > 1.01:
        L.append(f"| What the phone shows | he looks small: about **{g['he_fills_share_of_phone_frame'] * 100:.0f} %** of the picture height is the shot, "
                 f"the phone sees about {_ft(g['phone_sees_height_m'])} top to bottom. That is right; the tool crops to the {say} frame |")
    else:
        L.append(f"| What the phone shows | the {say} frame as it will be delivered, no crop |")
    L.append(f"| Sharpness | **{g['sharpness']}** ({g['phone_pixels_across_delivered_frame']} phone pixels across the delivered frame) |")
    if g["background_for_clear_blur_m"] is not None:
        L.append(f"| Background | at least **{_ft(g['background_for_clear_blur_m'])}** behind him for a blurred background; farther is softer |")
    else:
        L.append("| Background | this lens and f-stop keep the background close to sharp at any distance |")
    L.append("| Lock it | tap and hold on his face for AE/AF lock; Action mode off; Cinematic mode off; never zoom during a take |")
    L += ["", "| Background behind him | The lens look (added in AVT) | The phone on its own |", "|---|---|---|"]
    for b in g["blur"]:
        L.append(f"| {_ft(b['background_m'])} | {b['target']} ({b['target_share_of_width'] * 100:.1f} % of the width) | {b['phone']} ({b['phone_share_of_width'] * 100:.1f} %) |")
    if g["notes"]: L += [""] + [f"- {n}" for n in g["notes"]]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Where the phone goes so a take can carry a chosen lens look.")
    ap.add_argument("--lens", required=True, help="target lens: millimetres (full-frame equivalent) or a preset name from lens_presets.json")
    ap.add_argument("--framing", default="waist_up", choices=list(FRAMINGS))
    ap.add_argument("--orientation", default="vertical", choices=["vertical", "horizontal"])
    ap.add_argument("--f-stop", type=float, default=2.0, help="the target lens's f-stop, for the blur table")
    ap.add_argument("--phone", default="iphone_14")
    ap.add_argument("--height-m", type=float, default=HIS_HEIGHT_M, help="the performer's height in metres")
    ap.add_argument("--tilt-deg", type=float, default=0.0, help="camera tilted up by this many degrees (a low hero angle); 0 is level")
    ap.add_argument("--background-m", type=float, default=None, help="distance from him to the background, metres; omit for a 1 / 3 / 10 m table")
    ap.add_argument("--deliver-short-px", type=int, default=1080, help="short side of the delivered frame in pixels")
    ap.add_argument("--json", default=None, help="also write the numbers here")
    a = ap.parse_args()
    focal, preset = resolve_lens(a.lens)
    g = guide(focal, a.framing, a.orientation, a.f_stop, a.phone, a.height_m, a.tilt_deg, a.background_m, a.deliver_short_px)
    if preset: g["target"]["preset"] = preset
    if a.json: json.dump(g, open(a.json, "w"), indent=1)
    sys.stdout.write(card(g))


if __name__ == "__main__":
    main()
