#!/usr/bin/env python3
"""
REALISM GATE — rejects content that reads as "AI video" and passes only what a viewer would take for
photographed footage. Two tiers, both general (nothing knows a shot, a project or a provider):

  TIER 1 (deterministic, $0): sensor-and-motion statistics of the clip, each expressed as a z-score
  against REAL FOOTAGE of the same production (the camera masters are the truth for "what real looks
  like" — grain floor, texture, colour, how a face and a background move). Metrics:
    noise_hf      high-frequency residual in flat regions (sensor grain floor; AI video is too clean or
                  carries structured noise)
    detail_mf     mid-frequency texture (Laplacian variance at half-res; plastic skin/fabric is low)
    sat_mean      mean HSV saturation (generators oversaturate)
    highlight_frac / black_frac  clipped highlights / crushed blacks
    warp_err      optical-flow warp error t→t+1 normalised by local gradient (local inconsistency,
                  "swimming" texture; real footage has a sensor-noise floor here)
    drift_1s      1 − SSIM between frames one second apart after median-flow alignment (the scene
                  morphing into something else — environments that re-draw themselves)
    face_jitter   frame-to-frame relative change of the face's normalised landmark-distance vector
                  (a real face deforms smoothly; a re-drawn face jumps)
    face_ratio_std  spread of a few identity ratios across the clip (the person turning into someone else)
    skin_sheen    fraction of face pixels at near-clipping luma (plastic specular "AI sheen")
  Verdict: REJECT when the scene or the face is re-drawing itself (drift_1s / face_jitter far outside the
  real footage), REVIEW when ≥ 2 statistics sit outside ±2.5 σ, PASS otherwise; `ai_smooth` is flagged
  when the clip is cleaner than any real frame could be.

  TIER 2 (VLM judge, paid, optional `--judge`): gpt-6-astra through astra-visual-review-proxy with a
  strict "would a general viewer clock this as AI?" rubric on a timestamped frame strip — AI tells
  (skin, hands, text, physics, morphing, lighting inconsistency, uncanny motion) with severity and
  time, an `ai_likelihood` in [0,1] and a verdict. The final gate is the stricter of the two tiers.

  python3 scripts/qa/realism_gate.py --clip broll/x.mp4 --ref cuts/S11_master.mp4 --ref cuts/S06_master.mp4 \
      --out qa/x_realism.json [--ref-stats qa/real_stats.json] [--judge --jwt /tmp/jwt.txt --anon /tmp/anon.txt]

Reference statistics are computed once from the real cuts and cached (`--ref-stats`); any clip of any
provider is then judged against the same truth.
"""
import argparse, base64, json, os, sys, time, urllib.request
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "edit"))

FACE_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
CLIP_URL = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx"      # scene embedding (what the frame IS)
ARC_URL = "https://huggingface.co/globalnebula/insightface-buffalo-l-onnx/resolve/main/arcface_w600k_r50.onnx"       # face identity embedding (WHO the person is)
ARC_TEMPLATE = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]], np.float32)
# Absolute thresholds for the two "it became something else" metrics (cosine distances; calibrated 2026-10-01 on real cuts,
# three Grok B-roll clips and two camera renders — see docs/research/results/2026-10-01-environment-camera-broll/realism/):
SCENE_DRIFT_REJECT = 0.28      # the world re-drew itself (closet→city measured 0.306; real locked footage 0.125; a whip pan 0.246)
SCENE_DRIFT_REVIEW = 0.22
# Identity is a REVIEW signal, not a REJECT, until it is calibrated against the artist's own verdicts: on 2026-10-01 the
# artist judged the Higgsfield DoP clip (distance 0.635) as "character lock superb" while ArcFace called it another person —
# tinted eyewear, a face that is small at 540p sampling and a reference centroid built from motion-blurred dance frames all
# inflate the distance. Labels accumulate in --labels (clip name → artist verdict) and the thresholds move with them.
IDENTITY_REJECT = None         # set from --labels once ≥ 10 artist-labelled clips exist
IDENTITY_REVIEW = 0.40
# Realism metrics are measured on the PERFORMER (the face region the landmarker finds) so a dark stage plate and a
# bright closet compare like for like; whole-frame exposure/colour stats are reported but never judged (they measure
# the grade and the environment, not realism).
METRICS = ["noise_hf", "detail_mf", "sat_mean", "skin_sheen", "warp_err", "drift_1s", "face_jitter", "face_ratio_std", "scene_drift", "identity_dist", "frame_sat", "highlight_frac", "black_frac"]
JUDGED = ["noise_hf", "detail_mf", "sat_mean", "skin_sheen", "warp_err", "drift_1s", "face_jitter", "face_ratio_std"]
# direction in which a deviation means "less real": +1 above the real footage, -1 below, 0 either way
DIRECTION = {"noise_hf": 0, "detail_mf": -1, "sat_mean": 1, "skin_sheen": 1, "warp_err": 0, "drift_1s": 1, "face_jitter": 1, "face_ratio_std": 1, "scene_drift": 1, "identity_dist": 1, "frame_sat": 0, "highlight_frac": 0, "black_frac": 0}
MORPH = ("drift_1s", "face_jitter")       # single-event metrics: the clip is summarised by its p95, not its median
P95 = ("drift_1s", "face_jitter", "warp_err", "scene_drift", "identity_dist")


def fit_frame(f, size):
    """Scale a frame into the sampling box without changing its aspect: the box is (w, h); a frame of another
    aspect (a 16:9 world clip from a text-to-video model, say) is scaled by whichever side hits the box first and
    returned at that size rather than squashed or padded, so texture/noise statistics stay comparable with the
    9:16 references and no letterbox bars leak into black_frac or the judge's frames."""
    w, h = size; fh, fw = f.shape[:2]; s = min(w / fw, h / fh); nw, nh = max(1, int(round(fw * s))), max(1, int(round(fh * s)))
    return cv2.resize(f, (nw, nh), interpolation=cv2.INTER_AREA)


def read_frames(path, size, max_frames, fps_target):
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 24.0; n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(round(fps / fps_target))); out = []; i = 0
    while True:
        ok, f = cap.read()
        if not ok: break
        if i % step == 0:
            out.append(fit_frame(f, size))
            if len(out) >= max_frames: break
        i += 1
    return out, fps / step


class Face:
    def __init__(self, path=os.path.expanduser("~/.cache/avt/face_landmarker.task")):
        import mediapipe as mp
        from mediapipe.tasks import python as mpp
        from mediapipe.tasks.python import vision
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True); urllib.request.urlretrieve(FACE_URL, path)
        self.mp = mp
        self.fl = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path=path), num_faces=1,
                                                                                            min_face_detection_confidence=0.3, min_face_presence_confidence=0.3, running_mode=vision.RunningMode.IMAGE))
        self.pose = None

    def head_box(self, frame):
        """Face region from the pose model (face_box), so the landmarker sees a face that fills its crop."""
        try:
            from hero_gate import PoseModel, face_box
            if self.pose is None: self.pose = PoseModel()
            lm = self.pose.detect(frame)
            if lm is not None:
                H, W = frame.shape[:2]; x0, y0, x1, y1 = face_box(lm, W, H, 1.6)
                if x1 - x0 > 40 and y1 - y0 > 40: return int(x0), int(y0), int(x1), int(y1)
        except Exception:
            pass
        H, W = frame.shape[:2]; return int(W * 0.15), 0, int(W * 0.85), int(H * 0.45)

    def person_box(self, frame):
        """Bounding box of the whole performer from the pose landmarks (margin 12 % of the box), None when no pose."""
        try:
            from hero_gate import PoseModel
            if self.pose is None: self.pose = PoseModel()
            lm = self.pose.detect(frame)
            if lm is None: return None
            H, W = frame.shape[:2]; ok = lm[:, 3] >= 0.3 if lm.shape[1] > 3 else np.ones(len(lm), bool)
            xs, ys = lm[ok, 0], lm[ok, 1]
            if len(xs) < 5: return None
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); mx, my = 0.12 * (x1 - x0) + 10, 0.12 * (y1 - y0) + 10
            return int(max(0, x0 - mx)), int(max(0, y0 - my - 0.15 * (y1 - y0))), int(min(W, x1 + mx)), int(min(H, y1 + my))
        except Exception:
            return None

    def landmarks(self, frame):
        x0, y0, x1, y1 = self.head_box(frame); crop = frame[y0:y1, x0:x1]
        if crop.size == 0: return None
        r = self.fl.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)))
        if not r.face_landmarks: return None
        h, w = crop.shape[:2]
        return np.array([[p.x * w + x0, p.y * h + y0] for p in r.face_landmarks[0]], np.float32)


class Embedder:
    """CLIP ViT-B/32 scene embedding of the whole frame and ArcFace (w600k r50) identity embedding of the aligned face."""
    def __init__(self, cache=os.path.expanduser("~/.cache/avt")):
        import onnxruntime as ort
        os.makedirs(cache, exist_ok=True)
        cp, ap_ = os.path.join(cache, "clip_vision_b32_q8.onnx"), os.path.join(cache, "arcface_w600k_r50.onnx")
        if not os.path.exists(cp): urllib.request.urlretrieve(CLIP_URL, cp)
        if not os.path.exists(ap_): urllib.request.urlretrieve(ARC_URL, ap_)
        self.clip = ort.InferenceSession(cp); self.arc = ort.InferenceSession(ap_)
        self.cin = self.clip.get_inputs()[0].name; self.ain = self.arc.get_inputs()[0].name

    def scene(self, frame, person_box=None):
        """Embedding of the ENVIRONMENT: the performer's box is painted mid-grey so the measure asks "is this still the
        same place?" rather than "is the same man still filling the frame?" (a closet becoming a city behind him)."""
        f = frame.copy()
        if person_box is not None:
            x0, y0, x1, y1 = person_box; f[max(0, y0):y1, max(0, x0):x1] = 118
        x = cv2.cvtColor(cv2.resize(f, (224, 224), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        x = (x - np.array([0.4815, 0.4578, 0.4082], np.float32)) / np.array([0.2686, 0.2613, 0.2758], np.float32)
        e = self.clip.run(None, {self.cin: x.transpose(2, 0, 1)[None]})[0][0]; return e / (np.linalg.norm(e) + 1e-6)

    def identity(self, frame, lm):
        kp = np.array([(lm[33] + lm[133]) / 2, (lm[362] + lm[263]) / 2, lm[1], lm[61], lm[291]], np.float32)
        M, _ = cv2.estimateAffinePartial2D(kp, ARC_TEMPLATE, method=cv2.LMEDS)
        if M is None: return None
        crop = cv2.warpAffine(frame, M, (112, 112), borderValue=0)
        x = (cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) - 127.5) / 127.5
        e = self.arc.run(None, {self.ain: x.transpose(2, 0, 1)[None]})[0][0]; return e / (np.linalg.norm(e) + 1e-6)


KEY = [33, 263, 1, 61, 291, 199, 10, 152, 234, 454, 168, 4, 13, 14, 70, 300]   # eyes, nose, mouth, chin, forehead, cheeks


def face_vec(lm):
    pts = lm[KEY]; io = np.linalg.norm(lm[33] - lm[263]) + 1e-6
    d = np.linalg.norm(pts[:, None] - pts[None], axis=-1)[np.triu_indices(len(KEY), 1)] / io
    ratios = [np.linalg.norm(lm[10] - lm[152]) / io, np.linalg.norm(lm[61] - lm[291]) / io, np.linalg.norm(lm[234] - lm[454]) / io, np.linalg.norm(lm[1] - lm[168]) / io]
    return d, np.array(ratios, np.float32)


def per_frame_metrics(frames, face, dis, emb=None, ref_identity=None):
    g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in frames]; H, W = g[0].shape
    rows = []; prev_vec = None; prev_io = None; prev_k = -9; ratios = []; scene0 = None; ids = []
    for k, f in enumerate(frames):
        L = g[k]; m = {}
        blur = cv2.GaussianBlur(L, (0, 0), 1.2); hf = L - blur
        gx = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(blur, cv2.CV_32F, 0, 1, ksize=3); grad = np.sqrt(gx * gx + gy * gy)
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV); m["frame_sat"] = float(hsv[..., 1].mean())
        m["highlight_frac"] = float((L > 250).mean()); m["black_frac"] = float((L < 5).mean())
        if k > 0:
            flow = dis.calc(g[k - 1].astype(np.uint8), L.astype(np.uint8), None)
            ys, xs = np.mgrid[0:H, 0:W].astype(np.float32); warped = cv2.remap(L, xs + flow[..., 0], ys + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            err = np.abs(warped - g[k - 1]); m["warp_err"] = float(np.median(err) / (np.median(grad) + 2.0))
        if emb is not None:
            e = emb.scene(f, face.person_box(f) if face else None); scene0 = e if scene0 is None else scene0; m["scene_drift"] = float(1.0 - np.dot(e, scene0))
        lm = face.landmarks(f) if face else None
        if lm is not None:
            if emb is not None:
                ie = emb.identity(f, lm)
                if ie is not None:
                    ids.append(ie)
                    if ref_identity is not None: m["identity_dist"] = float(1.0 - np.dot(ie, ref_identity))
            vec, rat = face_vec(lm); ratios.append(rat); io = float(np.linalg.norm(lm[33] - lm[263]))
            # jitter is only meaningful between two frames of the same head pose: a turn (inter-ocular distance changing
            # by more than a quarter) or a gap in detection resets the comparison instead of scoring as a re-draw
            if prev_vec is not None and prev_io is not None and abs(io - prev_io) <= 0.25 * max(io, prev_io) and k == prev_k + 1:
                m["face_jitter"] = float(np.mean(np.abs(vec - prev_vec) / (np.abs(prev_vec) + 0.05)))
            prev_vec, prev_io, prev_k = vec, io, k
            hull = cv2.convexHull(lm.astype(np.int32)); mask = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(mask, hull, 255)
            mask = cv2.dilate(mask, np.ones((9, 9), np.uint8)); fm = mask > 0
            if fm.sum() > 400:
                flat = fm & (grad < np.percentile(grad[fm], 50)) & (L > 20) & (L < 235)
                m["noise_hf"] = float(hf[flat].std()) if flat.sum() > 200 else float(hf[fm].std())
                m["detail_mf"] = float(cv2.Laplacian(L, cv2.CV_32F)[fm].var())
                m["sat_mean"] = float(hsv[..., 1][fm].mean()); m["skin_sheen"] = float((L[fm] > 235).mean())
        rows.append(m)
    return rows, ratios, g, ids


def drift_metric(g, step, dis):
    """Appearance change that MOTION cannot explain: dense flow over `step` frames warps the later frame back onto the
    earlier one; what remains (normalised by local gradient) is content re-drawing itself — a background becoming another
    place, a face becoming another face. Camera moves and performer motion are absorbed by the flow; morphing is not."""
    out = []
    for k in range(0, len(g) - step, max(1, step // 2)):
        a, b = g[k], g[k + step]; H, W = a.shape
        flow = dis.calc(a.astype(np.uint8), b.astype(np.uint8), None)
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32); warped = cv2.remap(b, xs + flow[..., 0], ys + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        gx = cv2.Sobel(a, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(a, cv2.CV_32F, 0, 1, ksize=3); grad = np.sqrt(gx * gx + gy * gy)
        mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2); ok = mag < np.percentile(mag, 90)       # drop the fastest 10 % (occlusion edges)
        res = np.abs(warped - a); out.append(float(np.mean(res[ok]) / (np.mean(grad[ok]) + 2.0)))
    return out


def clip_stats(path, face, emb=None, ref_identity=None, size=(540, 960), fps_target=8.0, max_frames=120):
    frames, fps = read_frames(path, size, max_frames, fps_target)
    if len(frames) < 3: raise SystemExit(f"{path}: too few frames")
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    rows, ratios, g, ids = per_frame_metrics(frames, face, dis, emb, ref_identity)
    per = {m: [r[m] for r in rows if m in r] for m in METRICS if m not in ("drift_1s", "face_ratio_std")}
    per["_ids"] = ids
    per["drift_1s"] = drift_metric(g, max(2, int(round(fps / 2))), dis)   # half-second gap: enough to expose re-drawing, short enough for dense flow to follow real motion
    per["face_ratio_std"] = [float(np.std(np.array(ratios), axis=0).mean())] if len(ratios) >= 3 else []
    summary = {m: ((float(np.percentile(v, 95)) if m in P95 else float(np.median(v))) if v else None) for m, v in per.items() if not m.startswith("_")}
    if per.get("identity_dist"): summary["identity_dist_median"] = float(np.median(per["identity_dist"]))
    summary["frames"] = len(frames); summary["fps_sampled"] = fps; summary["face_frames"] = len(ratios)
    return summary, per


def reference_stats(paths, face, emb=None, cache=None):
    if cache and os.path.exists(cache): return json.load(open(cache))
    pools = {m: [] for m in METRICS}; ids = []
    for p in paths:
        _, per = clip_stats(p, face, emb)
        for m in METRICS: pools[m] += per.get(m, [])
        ids += per.get("_ids", [])
    if ids:
        c = np.mean(np.array(ids), axis=0); c = c / (np.linalg.norm(c) + 1e-6); pools["identity_dist"] = [float(1.0 - np.dot(e, c)) for e in ids]
    stats = {m: {"mean": float(np.mean(v)), "std": float(np.std(v) + 1e-6), "n": len(v)} for m, v in pools.items() if v}
    for m in P95:                      # where a real clip's own p95 sits, so the morph threshold is calibrated, not guessed
        if pools[m]: stats[m]["real_p95_z"] = float((np.percentile(pools[m], 95) - stats[m]["mean"]) / stats[m]["std"])
    stats["_refs"] = paths
    if ids: stats["_identity"] = c.tolist()
    if cache: json.dump(stats, open(cache, "w"), indent=1)
    return stats


def tier1_verdict(summary, ref, z_warn=2.5, z_morph=3.0):
    z = {}; flags = []
    for m in METRICS:
        if summary.get(m) is None or m not in ref: continue
        zz = (summary[m] - ref[m]["mean"]) / ref[m]["std"]; z[m] = round(float(zz), 2)
        if m not in JUDGED: continue
        d = DIRECTION[m]; bad = (zz > z_warn) if d > 0 else (zz < -z_warn) if d < 0 else (abs(zz) > z_warn)
        if bad: flags.append(m)
    if summary.get("noise_hf") is not None and "noise_hf" in ref and z.get("noise_hf", 0) < -z_warn: flags.append("ai_smooth")
    morph = [m for m in MORPH if m in ref and z.get(m, 0) > max(z_morph, ref[m].get("real_p95_z", 0) + 1.0)]
    sd = summary.get("scene_drift") or 0
    if sd > SCENE_DRIFT_REJECT: morph.append("scene_drift")
    elif sd > SCENE_DRIFT_REVIEW: flags.append("scene_drift")
    idd = summary.get("identity_dist_median")
    if idd is not None and IDENTITY_REJECT is not None and idd > IDENTITY_REJECT: morph.append("identity")
    elif idd is not None and idd > IDENTITY_REVIEW: flags.append("identity")
    verdict = "REJECT" if morph else ("REVIEW" if len(flags) >= 2 else "PASS")
    return verdict, z, sorted(set(flags)), morph


# ---------------------------------------------------------------- tier 2: VLM judge through the Astra proxy
JUDGE_SCHEMA = {"name": "realism_judgement", "strict": True, "schema": {
    "type": "object", "additionalProperties": False, "required": ["ai_likelihood", "verdict", "tells", "strengths", "summary"],
    "properties": {
        "ai_likelihood": {"type": "number", "description": "0 = indistinguishable from photographed footage, 1 = obviously AI to a casual viewer"},
        "verdict": {"type": "string", "enum": ["PASS", "FAIL", "UNCERTAIN"]},
        "tells": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["tell", "severity", "frame_label", "category"],
                                              "properties": {"tell": {"type": "string"}, "severity": {"type": "string", "enum": ["blocker", "major", "minor"]}, "frame_label": {"type": "string"},
                                                             "category": {"type": "string", "enum": ["skin", "hands", "face_identity", "text_logo", "physics", "morphing", "lighting", "motion", "garment", "background", "edges_compositing", "other"]}}}},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"}}}}

JUDGE_BRIEF = """You are the realism gate for a music-video production. The frames are a timestamped strip from ONE clip that must read as PHOTOGRAPHED footage of a real person to a general viewer scrolling on a phone — the standard is that nobody can tell it was built with AI. Judge ONLY realism, not creative quality.
Look for AI tells: waxy or over-smooth skin, plastic specular sheen, impossible or melting hands/fingers, gibberish or shifting text and logos, physics that would not happen (fabric, hair, liquids, fog behaving wrongly), the scene or the person re-drawing themselves between frames (morphing), lighting on the person that does not match the environment, uncanny or floaty motion, garment construction changing between frames, backgrounds that drift, cut-out edges or halo from compositing. Treat consecutive frames as motion.
Return ai_likelihood (0 = indistinguishable from a camera, 1 = obviously AI), a verdict (PASS only when a casual viewer would NOT clock it; FAIL when a tell would be noticed at normal speed; UNCERTAIN only when the strip cannot show it), the concrete tells with the frame label where each is visible, and the strengths that make it read real."""


def judge(clip, jwt, anon, n_frames=10, max_tokens=6000, project_id=None, base="https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/astra-visual-review-proxy"):
    cap = cv2.VideoCapture(clip); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS) or 24.0; frames = []
    for i in np.linspace(0, n - 1, n_frames).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i)); ok, f = cap.read()
        if not ok: continue
        f = fit_frame(f, (540, 960)); ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 82])
        frames.append({"label": f"t={i / fps:.2f}s", "dataUrl": "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()})
    hdr = {"Authorization": "Bearer " + jwt, "apikey": anon, "Content-Type": "application/json"}
    def call(body):
        req = urllib.request.Request(base, data=json.dumps(body).encode(), headers=hdr); return json.loads(urllib.request.urlopen(req, timeout=180).read().decode())
    sub = call({"mode": "submit", "projectId": project_id, "draftId": "realism-gate", "partId": os.path.basename(clip), "instructions": JUDGE_BRIEF, "frames": frames, "references": [], "jsonSchema": JUDGE_SCHEMA, "maxOutputTokens": max_tokens, "reasoningEffort": "medium"})
    rid = sub.get("responseId")
    if not rid: return {"error": "submit_failed", "payload": sub}
    for _ in range(60):
        time.sleep(10); r = call({"mode": "poll", "projectId": project_id, "responseId": rid, "draftId": "realism-gate", "partId": os.path.basename(clip)})
        if r.get("status") in ("completed", "failed", "incomplete", "cancelled", "error"): return r
    return {"error": "timeout", "responseId": rid}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True, nargs="+"); ap.add_argument("--ref", action="append", default=[], help="real footage clip(s); repeatable"); ap.add_argument("--ref-stats", default=None, help="cache of the reference statistics")
    ap.add_argument("--out", required=True, help="JSON report (one object per clip)"); ap.add_argument("--judge", action="store_true"); ap.add_argument("--jwt", default="/tmp/jwt.txt"); ap.add_argument("--anon", default="/tmp/anon.txt")
    ap.add_argument("--judge-frames", type=int, default=10); ap.add_argument("--project-id", default=os.environ.get("AVT_PROJECT_ID")); ap.add_argument("--no-face", action="store_true"); ap.add_argument("--z-warn", type=float, default=2.5); ap.add_argument("--z-morph", type=float, default=3.0)
    a = ap.parse_args()
    face = None if a.no_face else Face(); emb = Embedder()
    if not a.ref and not (a.ref_stats and os.path.exists(a.ref_stats)): raise SystemExit("need --ref real footage or a cached --ref-stats")
    ref = reference_stats(a.ref, face, emb, a.ref_stats); ref_id = np.array(ref["_identity"], np.float32) if ref.get("_identity") else None
    reports = []
    for clip in a.clip:
        summary, _ = clip_stats(clip, face, emb, ref_id); verdict, z, flags, morph = tier1_verdict(summary, ref, a.z_warn, a.z_morph)
        rep = {"clip": clip, "tier1": {"verdict": verdict, "z": z, "flags": flags, "morphing": morph, "metrics": summary}}
        if a.judge:
            jwt = open(a.jwt).read().strip(); anon = open(a.anon).read().strip(); r = judge(clip, jwt, anon, a.judge_frames, project_id=a.project_id)
            rv = r.get("review") or {}; rep["tier2"] = {"status": r.get("status"), "actualCostUsd": r.get("actualCostUsd"), "review": rv, "error": r.get("error")}
            t2 = rv.get("verdict"); like = rv.get("ai_likelihood")
            final = "REJECT" if verdict == "REJECT" or t2 == "FAIL" or (like is not None and like >= 0.5) else ("REVIEW" if verdict == "REVIEW" or t2 == "UNCERTAIN" or (like is not None and like >= 0.3) else "PASS")
        else:
            final = verdict
        rep["verdict"] = final; reports.append(rep)
        print(json.dumps({"clip": os.path.basename(clip), "verdict": final, "tier1": verdict, "scene_drift_p95": summary.get("scene_drift"), "identity_dist_median": summary.get("identity_dist_median"), "z": z, "flags": flags, "morph": morph, "tier2": rep.get("tier2", {}).get("review", {}).get("ai_likelihood") if a.judge else None}), flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True); json.dump({"reference": ref, "reports": reports}, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
