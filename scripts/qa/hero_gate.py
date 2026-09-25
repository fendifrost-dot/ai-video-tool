#!/usr/bin/env python3
"""
POSE-LOCKED HERO GATE — deterministic QA for a hero candidate (one still that is meant to be the
canonical garment realisation at ONE frame of the real performance) before any carrier touches it.

The contract it enforces (handoff rev 31 → 32, "pose-locked hero contract"):
  A hero MUST preserve the source frame's identity, head, face, torso, shoulders, arms, hands,
  legs, silhouette, framing and perspective. It MAY change the garment (construction, material,
  details, garment-local shading). A beautiful image in the wrong pose is a FAILURE.
  POSE LOCK IS FAIL-CLOSED: no wardrobe score can compensate for a moved arm.

  python3 scripts/qa/hero_gate.py --anchor heroes/anchor_hook_s11_f0080.jpg --anchor-master heroes/anchor_hook_master_s11_f0080.jpg \\
      --source "cuts/S08_master_69.466-76.368.mp4#86" \\
      --candidate "E1_f86=gfx/s08_e1_graphic_hem3.mp4#86" --candidate "still=heroes/S06/stills/S06_f0006.jpg@cuts/S06_master_61.597-68.499.mp4#6" \\
      --out qa/hero_gate_S08/ [--expect calibration.json]

  A path may be an image, or "video.mp4#frame" (frame index at --fps after resampling to --size).
  A candidate may carry its own source after "@" (calibration sets mix shots).

Six independent scores, each with its own PASS, then one verdict:
  1. POSE FIDELITY      MediaPipe pose landmarks (33) on source and candidate; displacement of
                        every landmark the source sees, in TORSO units (shoulder–hip length, so the
                        test is raster- and framing-independent); strict set = head, shoulders,
                        elbows, wrists, index fingers; moderate = hips (a jacket hem moves the
                        hip estimate); legs only where the source sees them; plus the change of
                        the upper-arm and forearm ANGLES in degrees (a moved arm is an angle
                        change even when the hand lands in a similar place). No landmarks on the
                        candidate = pose lost = FAIL.
  2. IDENTITY FIDELITY  the source's face box (from its own landmarks): SSIM and Lab residual
                        between source and candidate. A generator that re-renders the face
                        (Aleph 2.0 on S08, the old E2 stills) drops SSIM well below the JPEG floor.
  3. SILHOUETTE         RVM person alphas of both; IoU over the ANATOMY region only (head, hands,
                        below the hips) — the garment's own outline may legitimately change (a
                        jacket is bulkier than the shirt it replaces); p90 boundary displacement
                        in torso units inside that region.
  4. GARMENT CONSTRUCTION  `construction_score.py`'s anchor model (classes, stripe landmark, zones,
                        intrusion) on the candidate's garment region (what it changed vs the
                        source) — the same measurement the best-of-N selection uses.
  5. MATERIAL / PRODUCT TRUTH  body-class and stripe-class colour distance (ΔE, Lab) to the anchor,
                        knit texture energy ratio, stripe height relative to garment width.
  6. ANATOMY INTEGRITY  hands untouched (Lab residual in a patch around each visible hand; the
                        garment mask must not cover a hand), strict landmarks still present, one
                        connected person silhouette (no floating limbs).
Verdict: FAIL if POSE fails (fail-closed); otherwise PASS only if all six pass. Every number is
written to gate.json (per candidate: metrics, per-check pass, verdict, thresholds); a contact
sheet shows source | candidate with both skeletons | garment mask + anatomy region.

Thresholds are data (--thresholds json overrides any key); the defaults were calibrated on the
YSL assets — see docs/research/results/2026-09-20-ysl-real-video-1/hero_gate_calibration/ —
where the gate must accept the source frame and the accepted E1 frames on pose, reject every
old E2 still (arms re-posed, face turned) and any wrong-shot/wrong-frame candidate, and rank
the approved anchor at the top on garment truth.
--expect: a json {candidate_name: {"pose": "PASS"|"FAIL", "verdict": ...}} — the gate reports
agreement per candidate and exits 1 on any disagreement, so calibration is a test.
"""
import argparse, json, os, sys
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "edit"))
from construction_score import build_anchor_model, score_with_model, garment_mask, classify, ZONES  # noqa: E402
from propagate_keyframe import person_alpha  # noqa: E402

STRICT = {0: "nose", 2: "eye_l", 5: "eye_r", 7: "ear_l", 8: "ear_r", 11: "shoulder_l", 12: "shoulder_r", 13: "elbow_l", 14: "elbow_r", 15: "wrist_l", 16: "wrist_r", 19: "index_l", 20: "index_r"}
MODERATE = {23: "hip_l", 24: "hip_r"}
LEGS = {25: "knee_l", 26: "knee_r", 27: "ankle_l", 28: "ankle_r"}
ARMS = {"upper_l": (11, 13), "fore_l": (13, 15), "upper_r": (12, 14), "fore_r": (14, 16)}
SKELETON = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28), (0, 2), (0, 5), (2, 7), (5, 8), (15, 19), (16, 20)]

DEFAULT_THRESHOLDS = {
    # pose: displacements in torso units. strict_max is loose because a joint under a NEW garment (an
    # elbow inside a jacket sleeve where the source had a bare arm) is re-estimated by the landmarker
    # by up to ~0.16 without any real motion (E1 S08 f146); the MEAN over the strict set and the arm
    # angles are what a re-posed arm cannot hide from (old E2 stills: mean 0.08–0.47, angles 12–122°).
    "pose_strict_max": 0.20, "pose_strict_mean": 0.06, "pose_head_max": 0.06, "pose_arm_angle_max_deg": 20.0, "pose_moderate_max": 0.35, "pose_legs_max": 0.30, "pose_min_presence": 0.5,
    # face: the xAI edit lane re-encodes the whole frame (accepted E1 frames: SSIM 0.80–0.89, Lab 8–19
    # in the face box); a redrawn or re-posed face (E2 stills) sits at SSIM 0.30–0.48, Lab 40–100
    "identity_ssim_min": 0.75, "identity_lab_max": 22.0,
    "silhouette_iou_anatomy_min": 0.75, "silhouette_boundary_p90_max": 0.10,
    "construction_score_min": 0.65, "construction_zone_min": 0.35, "construction_min_garment_frac": 0.03,
    "material_body_de_max": 10.0, "material_stripe_de_max": 16.0, "material_texture_ratio": [0.4, 2.5], "material_stripe_height_ratio": [0.5, 1.8],
    "anatomy_hand_skin_dab": 10.0, "anatomy_hand_skin_dL": 60.0, "anatomy_hand_skin_ratio_min": 0.4, "anatomy_component_min_share": 0.95,
}

# ----------------------------------------------------------------------------- inputs
def load_image(spec, W, H, fps):
    """image path, or 'video#frame' → BGR at W×H."""
    if "#" in spec and not os.path.exists(spec):
        path, fr = spec.rsplit("#", 1); fr = int(fr)
        from propagate_keyframe import decode
        frames = decode(path, W, H, fps)
        if fr >= len(frames): raise SystemExit(f"{spec}: frame {fr} beyond {len(frames)}")
        return frames[fr]
    im = cv2.imread(spec)
    if im is None: raise SystemExit(f"unreadable image {spec}")
    return cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)

_VIDEO_CACHE = {}
_VIDEO_CACHE_MAX = 3   # decoded clips at 720×1280 are ~2.7 MB/frame; a calibration set spans many clips
def load_image_cached(spec, W, H, fps):
    if "#" in spec and not os.path.exists(spec):
        path, fr = spec.rsplit("#", 1); fr = int(fr)
        if path not in _VIDEO_CACHE:
            from propagate_keyframe import decode
            while len(_VIDEO_CACHE) >= _VIDEO_CACHE_MAX: _VIDEO_CACHE.pop(next(iter(_VIDEO_CACHE)))
            _VIDEO_CACHE[path] = decode(path, W, H, fps)
        frames = _VIDEO_CACHE[path]
        if fr >= len(frames): raise SystemExit(f"{spec}: frame {fr} beyond {len(frames)}")
        return frames[fr]
    return load_image(spec, W, H, fps)

# ----------------------------------------------------------------------------- pose
class PoseModel:
    """MediaPipe pose landmarker (heavy). The model file is fetched once into ~/.cache/avt."""
    URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
    def __init__(self, path=os.path.expanduser("~/.cache/avt/pose_landmarker_heavy.task")):
        import mediapipe as mp
        from mediapipe.tasks import python as mpp
        from mediapipe.tasks.python import vision
        if not os.path.exists(path):
            import subprocess
            os.makedirs(os.path.dirname(path), exist_ok=True); subprocess.run(["curl", "-sSL", "-o", path, self.URL], check=True)
        self.mp = mp
        self.lm = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=path), running_mode=vision.RunningMode.IMAGE, num_poses=1, min_pose_detection_confidence=0.5))
    def detect(self, im):
        H, W = im.shape[:2]
        r = self.lm.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=cv2.cvtColor(im, cv2.COLOR_BGR2RGB)))
        if not r.pose_landmarks: return None
        return np.array([[p.x * W, p.y * H, p.visibility, p.presence] for p in r.pose_landmarks[0]], np.float32)

def torso_scale(lm):
    """shoulder–hip length (mean of the two diagonals), the unit for every displacement."""
    d = [np.linalg.norm(lm[11, :2] - lm[24, :2]), np.linalg.norm(lm[12, :2] - lm[23, :2])]
    if lm[23, 3] < 0.5 or lm[24, 3] < 0.5: return float(np.linalg.norm(lm[11, :2] - lm[12, :2]) * 1.7)  # hips unseen: shoulder width scaled
    return float(np.mean(d))

def angle(lm, i, j):
    v = lm[j, :2] - lm[i, :2]; return float(np.degrees(np.arctan2(v[1], v[0])))

HAND_LANDMARKS = {"hand_l": (15, 19, "fore_l"), "hand_r": (16, 20, "fore_r")}

def pose_fidelity(src, cand, th, hands_verified_in_place=()):
    """`hands_verified_in_place`: hands the anatomy check found STILL PRESENT (this performer's skin)
    at their SOURCE location. A hand that is verifiably where it was cannot have moved, so a large
    wrist/index displacement there is the landmarker re-localising on repainted surroundings (a
    sleeve painted across the forearm), not a re-posed arm: those landmarks and that forearm angle
    are excluded from the pose statistics and reported under `relocalised`. A hand that is NOT
    at its source location keeps its full displacement — whether it moved or was painted over,
    the pose-lock law is broken there and the anatomy check names the cause."""
    if src is None: return {"pass": None, "note": "no pose on the source frame"}
    if cand is None: return {"pass": False, "note": "pose lost on the candidate"}
    excluded = {i for h in hands_verified_in_place for i in HAND_LANDMARKS[h][:2]}; excluded_arms = {HAND_LANDMARKS[h][2] for h in hands_verified_in_place}
    ts = torso_scale(src); seen = lambda i: src[i, 3] >= th["pose_min_presence"] and src[i, 2] >= 0.3 and i not in excluded
    disp = {n: float(np.linalg.norm(src[i, :2] - cand[i, :2]) / ts) for i, n in STRICT.items() if seen(i)}
    excluded_disp = {STRICT[i]: float(np.linalg.norm(src[i, :2] - cand[i, :2]) / ts) for i in excluded if i in STRICT and src[i, 3] >= th["pose_min_presence"]}
    mod = {n: float(np.linalg.norm(src[i, :2] - cand[i, :2]) / ts) for i, n in MODERATE.items() if seen(i)}
    legs = {n: float(np.linalg.norm(src[i, :2] - cand[i, :2]) / ts) for i, n in LEGS.items() if seen(i)}
    ang = {}
    for n, (i, j) in ARMS.items():
        if n in excluded_arms: continue
        if seen(i) and seen(j):
            d = abs(angle(src, i, j) - angle(cand, i, j)); ang[n] = float(min(d, 360 - d))
    strict_max = max(disp.values()) if disp else None; strict_mean = float(np.mean(list(disp.values()))) if disp else None
    head = {n: disp[n] for n in ("nose", "eye_l", "eye_r", "ear_l", "ear_r") if n in disp}; head_max = max(head.values()) if head else None
    arm_max = max(ang.values()) if ang else 0.0
    ok = (strict_max is not None and strict_max <= th["pose_strict_max"] and strict_mean <= th["pose_strict_mean"] and arm_max <= th["pose_arm_angle_max_deg"]
          and (head_max is None or head_max <= th["pose_head_max"])
          and (max(mod.values()) if mod else 0.0) <= th["pose_moderate_max"] and (max(legs.values()) if legs else 0.0) <= th["pose_legs_max"])
    worst = max(disp, key=disp.get) if disp else None
    return {"pass": bool(ok), "torso_px": ts, "strict_max": strict_max, "strict_mean": strict_mean, "head_max": head_max, "worst_landmark": worst, "arm_angle_max_deg": arm_max, "arm_angles_deg": ang,
            "relocalised": {"hands_verified_in_place": list(hands_verified_in_place), "landmark_displacements_excluded": excluded_disp},
            "moderate_max": max(mod.values()) if mod else None, "legs_max": max(legs.values()) if legs else None, "displacements": disp}

# ----------------------------------------------------------------------------- identity / silhouette / anatomy
def face_box(lm, W, H, scale=2.2):
    pts = lm[[0, 2, 5, 7, 8], :2]; c = pts.mean(axis=0)
    size = max(np.linalg.norm(lm[7, :2] - lm[8, :2]), 3.0 * np.linalg.norm(lm[0, :2] - (lm[2, :2] + lm[5, :2]) / 2)) * scale
    x0, y0 = int(max(0, c[0] - size / 2)), int(max(0, c[1] - size / 2)); x1, y1 = int(min(W, c[0] + size / 2)), int(min(H, c[1] + size / 2))
    return x0, y0, x1, y1

def identity_fidelity(src, cand, lm, th):
    from skimage.metrics import structural_similarity
    H, W = src.shape[:2]; x0, y0, x1, y1 = face_box(lm, W, H)
    if x1 - x0 < 16 or y1 - y0 < 16: return {"pass": None, "note": "face box too small"}
    a, b = src[y0:y1, x0:x1], cand[y0:y1, x0:x1]
    ga, gb = (cv2.resize(cv2.cvtColor(x, cv2.COLOR_BGR2GRAY), (160, 160)) for x in (a, b))
    ssim = float(structural_similarity(ga, gb, data_range=255))
    la, lb = (cv2.GaussianBlur(cv2.cvtColor(x, cv2.COLOR_BGR2LAB), (0, 0), 1.5).astype(np.float32) for x in (a, b))
    lab = float(np.sqrt(((la - lb) ** 2).sum(axis=2)).mean())
    return {"pass": bool(ssim >= th["identity_ssim_min"] and lab <= th["identity_lab_max"]), "ssim": ssim, "lab_residual": lab, "face_box": [x0, y0, x1, y1]}

def anatomy_region(lm, W, H):
    """head box and a disc around each seen hand — where the silhouette must not move. The torso
    and the legs are the garment's (a jacket is bulkier than a shirt, pleated trousers wider than
    jeans) and may change outline; they are reported through iou_total only."""
    reg = np.zeros((H, W), np.uint8); ts = torso_scale(lm)
    # head: the face box widened, cut at the chin — a stand collar or a hood below the chin is garment
    x0, y0, x1, y1 = face_box(lm, W, H, scale=2.6)
    chin = int(min(H, lm[0, 1] + 1.0 * np.linalg.norm(lm[7, :2] - lm[8, :2])))
    reg[y0:min(y1, chin), x0:x1] = 255
    # hands: a disc the size of the hand itself (a cuff sits at its edge, not inside it)
    for w, ix in ((15, 19), (16, 20)):
        if lm[w, 3] >= 0.5:
            c = ((lm[w, :2] + lm[ix, :2]) / 2) if lm[ix, 3] >= 0.5 else lm[w, :2]
            cv2.circle(reg, (int(c[0]), int(c[1])), int(0.10 * ts), 255, -1)
    return reg

def hand_patches(lm, W, H, radius=0.09):
    """a small disc on the back of each seen hand (index–wrist midpoint) — small enough to stay on
    the hand when a long sleeve now covers the wrist that was bare in the source."""
    out = []; ts = torso_scale(lm)
    for w, ix, name in ((15, 19, "hand_l"), (16, 20, "hand_r")):
        if lm[w, 3] >= 0.5 and lm[w, 2] >= 0.3 and lm[ix, 3] >= 0.5 and lm[ix, 2] >= 0.3:   # wrist AND index seen: the back of the hand is locatable
            c = (lm[w, :2] + lm[ix, :2]) / 2
            m = np.zeros((H, W), np.uint8); cv2.circle(m, (int(c[0]), int(c[1])), int(radius * ts), 255, -1); out.append((name, m > 0))
    return out

def silhouette_fidelity(alpha_s, alpha_c, lm, th):
    H, W = alpha_s.shape; reg = anatomy_region(lm, W, H) > 0
    s, c = alpha_s > 0.5, alpha_c > 0.5
    inter, union = (s & c & reg).sum(), ((s | c) & reg).sum()
    iou_an = float(inter / union) if union else None
    iou_all = float((s & c).sum() / max(1, (s | c).sum()))
    # boundary displacement: distance from each candidate boundary pixel (in the region) to the source boundary
    sb = cv2.morphologyEx(s.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    cb = (cv2.morphologyEx(c.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0) & reg
    dt = cv2.distanceTransform((~sb).astype(np.uint8), cv2.DIST_L2, 5)
    ts = torso_scale(lm); p90 = float(np.percentile(dt[cb], 90) / ts) if cb.any() else None
    ok = iou_an is not None and iou_an >= th["silhouette_iou_anatomy_min"] and (p90 is None or p90 <= th["silhouette_boundary_p90_max"])
    return {"pass": bool(ok), "iou_anatomy": iou_an, "iou_total": iou_all, "boundary_p90_torso": p90}

def anatomy_integrity(src, cand, lm_s, lm_c, gm, cls, alpha_c, model, th):
    """Hands stay hands: at the CANDIDATE's own hand landmarks (which pose fidelity has already
    tied to the source's) the pixels must not be the Look's garment colours — a sleeve or a body
    panel painted over a hand is the failure this catches (pixel-identity is NOT required: the xAI
    lane re-encodes the whole frame and long sleeves legitimately replace bare forearms)."""
    H, W = src.shape[:2]
    hands = {}
    Ls, Lc = (cv2.cvtColor(x, cv2.COLOR_BGR2LAB).astype(np.float32) for x in (src, cand))
    # OWNERSHIP: each hand owns the disc at its SOURCE location. Whatever the candidate's own
    # landmarks say, those pixels must still be this performer's skin — a garment mask may not
    # consume a hand because it fell inside a coarse clothing region. (Forearms are not owned:
    # a long-sleeved Look legitimately covers a bare forearm; the Look's data decides that.)
    src_patches = dict(hand_patches(lm_s, W, H, 0.07)); cand_patches = dict(hand_patches(lm_c, W, H, 0.07)) if lm_c is not None else {}
    ts = torso_scale(lm_s)
    for name, ms in src_patches.items():
        if ms.sum() < 20: continue
        ys, xs = np.where(ms)
        if ys.min() < 2 or xs.min() < 2 or ys.max() > H - 3 or xs.max() > W - 3: hands[name] = {"skipped": "hand at the frame edge"}; continue
        skin = np.median(Ls[ms], axis=0)                         # the performer's OWN skin at this hand, from the source
        # skin-like = the source hand's CHROMA (a generator relights a hand by tens of L units — the
        # anchor's hands are 30–40 L darker than the master's — but a beige sleeve, a white cuff or a
        # navy band over the hand changes a/b and/or L by far more)
        like = lambda L_: ((np.sqrt(((L_[:, 1:] - skin[1:]) ** 2).sum(axis=1)) <= th["anatomy_hand_skin_dab"]) & (np.abs(L_[:, 0] - skin[0]) <= th["anatomy_hand_skin_dL"]))
        fs = float(like(Ls[ms]).mean()); fc_src_loc = float(like(Lc[ms]).mean())
        rec = {"skin_fraction_source": fs, "skin_fraction_at_source_location": fc_src_loc, "skin_ratio": float(fc_src_loc / max(fs, 0.2)), "in_garment_mask": float((gm[ms] > 0).mean())}
        mc = cand_patches.get(name)
        if mc is not None and mc.sum() >= 20: rec["skin_fraction_at_candidate_landmark"] = float(like(Lc[mc]).mean())
        rec["repainted"] = bool(rec["skin_ratio"] < th["anatomy_hand_skin_ratio_min"])
        hands[name] = rec
    hands_ok = not any(v.get("repainted") for v in hands.values())
    present_ok = lm_c is not None and all(lm_c[i, 3] >= th["pose_min_presence"] for i in STRICT if lm_s[i, 3] >= th["pose_min_presence"] and lm_s[i, 2] >= 0.3)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx((alpha_c > 0.5).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)))
    areas = sorted(stats[1:, cv2.CC_STAT_AREA], reverse=True) if n > 1 else [0]
    share = float(areas[0] / max(1, sum(areas)))
    return {"pass": bool(hands_ok and present_ok and share >= th["anatomy_component_min_share"]), "hands": hands, "repainted_hands": [k for k, v in hands.items() if v.get("repainted")],
            "strict_landmarks_present": bool(present_ok), "largest_component_share": share, "components": int(n - 1)}

# ----------------------------------------------------------------------------- garment truth
def class_stats(im, cls, mask, cid):
    sel = (cls == cid) & (mask > 0)
    if sel.sum() < 200: return None
    L = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)
    med = np.median(L[sel], axis=0)
    lap = cv2.Laplacian(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.CV_32F)
    tex = float((lap[sel] ** 2).mean() / max(1.0, float(L[sel][:, 0].mean())) ** 2 * 1e4)
    return {"lab": [float(x) for x in med], "texture": tex, "px": int(sel.sum())}

def garment_width_at(mask, row, h):
    band = mask[max(0, row - h):row + h + 1]
    cols = np.where(band.max(axis=0) > 0)[0]
    return float(cols.max() - cols.min()) if len(cols) else None

def garment_truth(model, src, cand, th):
    gm = garment_mask(src, cand); frac = float((gm > 0).mean())
    if frac < th["construction_min_garment_frac"]:
        return {"construction": {"pass": False, "note": "the candidate did not change a garment-sized region of the source", "garment_frac": frac}, "material": {"pass": False, "note": "no garment region"}}, gm, None, None
    r, cls, zs = score_with_model(model, cand, gm)
    zones_ok = all(r["zones"][z] >= th["construction_zone_min"] for z in ZONES) if r["landmark"] else False
    con = {"pass": bool(r["landmark"] is not None and r["score"] >= th["construction_score_min"] and zones_ok), "score": r["score"], "zones": r["zones"], "intrusion": r.get("intrusion"), "worst_zone": r.get("worst_zone"),
           "landmark_found": r["landmark"] is not None, "garment_frac": frac}
    # material: body / stripe colour and texture against the anchor's own classes
    a_body = class_stats(model["anchor"], model["cls"], model["mask"], model["body_class"]); a_str = class_stats(model["anchor"], model["cls"], model["mask"], model["stripe_ids"][0])
    c_body = class_stats(cand, cls, gm, model["body_class"]); c_str = class_stats(cand, cls, gm, model["stripe_ids"][0])
    de = lambda a, b: float(np.sqrt(sum((x - y) ** 2 for x, y in zip(a["lab"], b["lab"])))) if a and b else None
    tex_ratio = (c_body["texture"] / max(1e-6, a_body["texture"])) if (a_body and c_body) else None
    sh = None
    if r["landmark"] is not None and model["landmark"] is not None:
        wa = garment_width_at(model["mask"], model["landmark"]["row"], model["landmark"]["height"]); wc = garment_width_at(gm, r["landmark"]["row"], r["landmark"]["height"])
        if wa and wc: sh = float((r["landmark"]["height"] / wc) / (model["landmark"]["height"] / wa))
    lo, hi = th["material_texture_ratio"]; slo, shi = th["material_stripe_height_ratio"]
    mat_ok = (de(a_body, c_body) is not None and de(a_body, c_body) <= th["material_body_de_max"] and (de(a_str, c_str) is None or de(a_str, c_str) <= th["material_stripe_de_max"])
              and tex_ratio is not None and lo <= tex_ratio <= hi and (sh is None or slo <= sh <= shi))
    mat = {"pass": bool(mat_ok), "body_de": de(a_body, c_body), "stripe_de": de(a_str, c_str), "texture_ratio": tex_ratio, "stripe_height_ratio": sh,
           "candidate_body": c_body, "candidate_stripe": c_str, "anchor_body": a_body, "anchor_stripe": a_str}
    return {"construction": con, "material": mat}, gm, cls, zs

# ----------------------------------------------------------------------------- sheet
def draw_skeleton(im, lm, colour):
    if lm is None: return im
    for i, j in SKELETON:
        if lm[i, 3] >= 0.5 and lm[j, 3] >= 0.5: cv2.line(im, tuple(lm[i, :2].astype(int)), tuple(lm[j, :2].astype(int)), colour, 2)
    for i in list(STRICT) + list(MODERATE):
        if lm[i, 3] >= 0.5: cv2.circle(im, tuple(lm[i, :2].astype(int)), 4, colour, -1)
    return im

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--source", default=None, help="default source frame for every candidate (image or video#frame)")
    ap.add_argument("--candidate", action="append", default=[], help='"name=path[@source]" (path/source: image or video#frame)')
    ap.add_argument("--out", required=True); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--thresholds", default=None, help="json file overriding any default threshold")
    ap.add_argument("--expect", default=None, help="json {name: {check: 'PASS'|'FAIL', 'verdict': ...}} — calibration expectations; exit 1 on disagreement")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out, exist_ok=True)
    th = dict(DEFAULT_THRESHOLDS)
    if a.thresholds: th.update(json.load(open(a.thresholds)))
    anchor = load_image(a.anchor, W, H, a.fps); amaster = load_image(a.anchor_master, W, H, a.fps)
    model = build_anchor_model(anchor, amaster)
    pose = PoseModel(); lm_cache = {}
    def landmarks(key, im):
        if key not in lm_cache: lm_cache[key] = pose.detect(im)
        return lm_cache[key]
    report = {"anchor": a.anchor, "anchor_master": a.anchor_master, "thresholds": th, "candidates": {}}
    tiles = []
    for spec in a.candidate:
        name, rest = spec.split("=", 1)
        cpath, spath = (rest.split("@", 1) + [a.source])[:2] if "@" in rest else (rest, a.source)
        if spath is None: raise SystemExit(f"{name}: no source frame (use --source or name=path@source)")
        src = load_image_cached(spath, W, H, a.fps); cand = load_image_cached(cpath, W, H, a.fps)
        lm_s, lm_c = landmarks(spath, src), landmarks(cpath, cand)
        alpha_s, alpha_c = person_alpha([src, cand])
        checks = {}
        gt, gm, cls, zs = garment_truth(model, src, cand, th)
        if cls is None: cls = classify(cand, model["centres"], model["class_radius"])
        anatomy = anatomy_integrity(src, cand, lm_s, lm_c, gm, cls, alpha_c, model, th) if lm_s is not None else {"pass": None, "note": "no source pose"}
        in_place = tuple(k for k, v in anatomy.get("hands", {}).items() if "skin_ratio" in v and not v.get("repainted"))
        checks["pose"] = pose_fidelity(lm_s, lm_c, th, hands_verified_in_place=in_place)
        if lm_s is not None:
            checks["identity"] = identity_fidelity(src, cand, lm_s, th)
            checks["silhouette"] = silhouette_fidelity(alpha_s, alpha_c, lm_s, th)
        else:
            checks["identity"] = {"pass": None, "note": "no source pose"}; checks["silhouette"] = {"pass": None, "note": "no source pose"}
        checks.update(gt)
        # diagnostic (no pass/fail): how much of the frame OUTSIDE the garment the candidate touched —
        # a local edit sits at the JPEG floor, a whole-frame re-render (Runway, the old E2) does not
        outside = cv2.dilate(gm, np.ones((25, 25), np.uint8)) == 0
        dl = np.sqrt(((cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32) - cv2.cvtColor(cand, cv2.COLOR_BGR2LAB).astype(np.float32)) ** 2).sum(axis=2))
        checks["edit_locality"] = {"pass": None, "outside_garment_lab_mean": float(dl[outside].mean()) if outside.any() else None, "garment_frac": float((gm > 0).mean())}
        checks["anatomy"] = anatomy
        # POSE LOCK = landmarks in place AND the face unchanged (the law names head position and face
        # geometry; a frontal re-render of a turned, singing face passes the coarse landmarks — E2 f114)
        pose_ok = bool(checks["pose"]["pass"] and checks["identity"].get("pass"))
        judged = {k: c for k, c in checks.items() if c.get("pass") is not None or k in ("pose", "identity", "silhouette", "construction", "material", "anatomy")}
        verdict = "FAIL" if not pose_ok else ("PASS" if all(c.get("pass") for c in judged.values()) else "FAIL")
        failing = [k for k, c in judged.items() if not c.get("pass")]
        rec = {"candidate": cpath, "source": spath, "checks": checks, "failing": failing, "pose_lock": "PASS" if pose_ok else "FAIL", "verdict": verdict}
        report["candidates"][name] = rec
        print(json.dumps({name: {"verdict": verdict, "pose_lock": rec["pose_lock"], "failing": failing, "pose": {k: checks["pose"].get(k) for k in ("strict_max", "strict_mean", "arm_angle_max_deg", "worst_landmark")},
                                 "identity": {k: checks["identity"].get(k) for k in ("ssim", "lab_residual")}, "silhouette": {k: checks["silhouette"].get(k) for k in ("iou_anatomy", "boundary_p90_torso")},
                                 "construction": checks["construction"].get("score"), "material": {k: checks["material"].get(k) for k in ("body_de", "stripe_de", "texture_ratio", "stripe_height_ratio")},
                                 "anatomy": {k: checks["anatomy"].get(k) for k in ("hands", "repainted_hands", "largest_component_share")}, "head_max": checks["pose"].get("head_max")}}, default=float), flush=True)
        # sheet: source with its skeleton | candidate with both skeletons | garment mask + anatomy region
        t1 = draw_skeleton(src.copy(), lm_s, (0, 255, 0)); t2 = draw_skeleton(draw_skeleton(cand.copy(), lm_s, (0, 255, 0)), lm_c, (0, 0, 255))
        ov = cand.copy(); ov[gm > 0] = (0.55 * ov[gm > 0] + 0.45 * np.array([0, 200, 0])).astype(np.uint8)
        if lm_s is not None:
            reg = anatomy_region(lm_s, W, H) > 0; ov[reg] = (0.7 * ov[reg] + 0.3 * np.array([200, 0, 200])).astype(np.uint8)
            x0, y0, x1, y1 = checks["identity"].get("face_box", (0, 0, 0, 0)); cv2.rectangle(t2, (x0, y0), (x1, y1), (255, 255, 0), 2)
        t = cv2.resize(np.hstack([t1, t2, ov]), None, fx=0.4, fy=0.4)
        p = checks["pose"]; label = f"{name}: {verdict} pose={rec['pose_lock']} smax={p.get('strict_max') or 0:.2f} arm={p.get('arm_angle_max_deg') or 0:.0f}deg ssim={checks['identity'].get('ssim') or 0:.2f} con={checks['construction'].get('score') or 0:.2f} fail={','.join(failing)}"
        cv2.putText(t, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3); cv2.putText(t, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        tiles.append(t)
    if tiles: cv2.imwrite(os.path.join(a.out, "gate_sheet.jpg"), np.vstack(tiles), [cv2.IMWRITE_JPEG_QUALITY, 86])
    disagreements = []
    if a.expect:
        exp = json.load(open(a.expect))
        for name, e in exp.items():
            rec = report["candidates"].get(name)
            if rec is None: disagreements.append(f"{name}: not evaluated"); continue
            for check, want in e.items():
                got = rec["verdict"] if check == "verdict" else (rec["pose_lock"] if check == "pose" else ("PASS" if rec["checks"][check].get("pass") else "FAIL"))
                if got != want: disagreements.append(f"{name}.{check}: expected {want}, got {got}")
        report["calibration"] = {"expectations": exp, "disagreements": disagreements, "agreed": not disagreements}
    json.dump(report, open(os.path.join(a.out, "gate.json"), "w"), indent=1, default=float)
    if disagreements:
        print("CALIBRATION DISAGREEMENTS:\n  " + "\n  ".join(disagreements)); sys.exit(1)
    print("gate written:", os.path.join(a.out, "gate.json"))

if __name__ == "__main__":
    main()
