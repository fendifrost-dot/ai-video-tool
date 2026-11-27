#!/usr/bin/env python3
"""
ALTER face and mouth tracker. Local, $0, no provider call, no download.

  track    one clip -> a JSON track: per frame his mouth opening, his lip points in face coordinates, his face outline,
           his head turn and (only when the ArcFace file is already on disk) an identity embedding.
  score    two tracks (the take, the redraw) -> mouth timing, mouth shape, pose difference, identity distance, coverage.
  putback  the take + the redraw + both tracks -> the redraw with his ORIGINAL face pixels moved onto the redraw's face
           (similarity fit on his eyes and nose), feathered, graded to the redraw's surround, original audio put back.
           FAILED BY FENDI on 27 Nov 2026 ("The face was warping on clip 3"): the laid-on face slides in motion on a
           small face. Kept for study only; it is not a step of any shot. A draft whose mouth or face fails is re-rolled.

    python -I scripts/alter/track_mouth.py track take.mp4 take.json [--start 12 --duration 4]
    python -I scripts/alter/track_mouth.py score take.json draft.json
    python -I scripts/alter/track_mouth.py putback take.mp4 draft.mp4 take.json draft.json out.mp4

Models: $AVT_MODELS/face_landmarker.task and selfie_multiclass_256x256.tflite (the put-back's own files). Identity is
measured only if $AVT_MODELS/arcface_w600k_r50.onnx exists; this script never fetches it.

Face coordinates: origin at the middle of the face (between landmarks 234 and 454), x along 234 -> 454, one unit = the
face width. Lip points in that frame do not change when he moves, turns in the picture plane or changes size, so the
distance between the take's lips and the redraw's lips is a mouth-shape error in face widths.
"""
import argparse, json, math, os, subprocess, sys
import numpy as np

INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
             149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
ANCHORS = [33, 133, 362, 263, 168, 6]          # eye corners and nose bridge: rigid on the skull, they do not move when he raps
ARC_TEMPLATE = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]], np.float32)
MAX_LAG = 6                                    # frames searched either side for a re-timed mouth (gates.ts MOUTH_MAX_LAG)
POSE_TURN_MAX = 0.12                           # head-turn difference (nose offset in face widths) above which a 2D put-back reads as pasted


# ----------------------------------------------------------------------------- pure numpy (tested without the models)
def face_frame(P):
    """Origin, x axis, y axis and width of the face from the full landmark array (pixels)."""
    a, b = P[234], P[454]
    w = float(np.linalg.norm(b - a)) + 1e-6
    ex = (b - a) / w
    return (a + b) / 2.0, ex, np.array([-ex[1], ex[0]], np.float32), w


def to_face(P, idx):
    o, ex, ey, w = face_frame(P)
    d = P[idx] - o
    return np.stack([d @ ex, d @ ey], axis=1) / w


def openness(P):
    """Lip gap over face width: the same number scripts/edit/mouth_scan.py writes."""
    return float(np.linalg.norm(P[13] - P[14]) / (np.linalg.norm(P[234] - P[454]) + 1e-6))


def turn(P):
    """Which way the head is turned: the nose tip's offset from the middle of the face, in face widths (0 = at the camera)."""
    o, ex, _, w = face_frame(P)
    return float(((P[1] - o) @ ex) / w)


def corr(a, b):
    a = np.asarray(a, float); b = np.asarray(b, float)
    if len(a) < 8 or a.std() < 1e-6 or b.std() < 1e-6: return None
    return float(np.corrcoef(a, b)[0, 1])


def lagged(a, b, max_lag=MAX_LAG):
    """Correlation on the take's clock, and the best one within max_lag frames (lag > 0: the redraw's mouth is late)."""
    on_clock = corr(a, b); best = (on_clock, 0)
    for k in range(-max_lag, max_lag + 1):
        if k == 0: continue
        x, y = (a[:-k], b[k:]) if k > 0 else (a[-k:], b[:k])
        c = corr(x, y)
        if c is not None and (best[0] is None or c > best[0]): best = (c, k)
    return on_clock, best[0], best[1]


def score_tracks(src, out):
    """Compare two tracks frame by frame. Frames are paired by index; a clip of another length is paired by time."""
    fs, fo = src["frames"], out["frames"]
    if len(fo) != len(fs):
        ts = [f["t"] for f in fs]; to = np.array([f["t"] for f in fo])
        fo = [fo[int(np.argmin(np.abs(to - t)))] for t in ts]
    both = [(a, b) for a, b in zip(fs, fo) if a.get("found") and b.get("found")]
    n = len(fs); cov = len(both) / max(n, 1)
    rep = {"frames": n, "paired": len(both), "coverage": round(cov, 3), "source_found": round(sum(1 for f in fs if f.get("found")) / max(n, 1), 3),
           "output_found": round(sum(1 for f in fo if f.get("found")) / max(n, 1), 3)}
    if len(both) < 8:
        rep.update({"measured": False, "why": "his face was found on fewer than 8 frames of both clips"}); return rep
    a = np.array([p[0]["openness"] for p in both]); b = np.array([p[1]["openness"] for p in both])
    on_clock, best, lag = lagged(a, b)
    shape = float(np.mean([np.linalg.norm(np.array(p[0]["lips"]) - np.array(p[1]["lips"]), axis=1).mean() for p in both]))
    pose = float(np.mean([abs(p[0]["turn"] - p[1]["turn"]) for p in both]))
    rep.update({"measured": True, "timing": None if on_clock is None else round(on_clock, 3), "timing_best": None if best is None else round(best, 3),
                "lag_frames": lag, "mouth_shape_distance": round(shape, 4), "open_mean_source": round(float(a.mean()), 4),
                "open_mean_output": round(float(b.mean()), 4), "open_range_source": round(float(a.max() - a.min()), 4),
                "pose_turn_difference": round(pose, 4), "pose_ok_for_putback": pose <= POSE_TURN_MAX})
    ea = [p[0]["emb"] for p in both if p[0].get("emb") and p[1].get("emb")]; eb = [p[1]["emb"] for p in both if p[0].get("emb") and p[1].get("emb")]
    if len(ea) >= 8:
        ma = np.mean(ea, axis=0); ma /= np.linalg.norm(ma) + 1e-9; mb = np.mean(eb, axis=0); mb /= np.linalg.norm(mb) + 1e-9
        per = [1.0 - float(np.dot(np.array(e) / (np.linalg.norm(e) + 1e-9), ma)) for e in eb]
        rep.update({"identity_distance": round(float(1.0 - np.dot(ma, mb)), 3), "identity_p95": round(float(np.percentile(per, 95)), 3)})
    else:
        rep.update({"identity_distance": None, "identity_p95": None})
    return rep


def similarity(src_pts, dst_pts):
    """Least-squares similarity (rotation, uniform scale, shift) taking src points to dst points. 2x3 matrix."""
    s = np.asarray(src_pts, np.float64); d = np.asarray(dst_pts, np.float64)
    ms, md = s.mean(0), d.mean(0); sc, dc = s - ms, d - md
    den = (sc ** 2).sum() + 1e-12
    a = (sc * dc).sum() / den; b = (sc[:, 0] * dc[:, 1] - sc[:, 1] * dc[:, 0]).sum() / den
    R = np.array([[a, -b], [b, a]]); t = md - R @ ms
    return np.hstack([R, t[:, None]]).astype(np.float32)


# ----------------------------------------------------------------------------- video I/O and the models
def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation",
                          "-of", "json", path], capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]; w, h = int(s["width"]), int(s["height"])
    rot = 0
    for sd in s.get("side_data_list", []):
        if "rotation" in sd: rot = abs(int(float(sd["rotation"])))
    if rot in (90, 270): w, h = h, w
    num, den = s["r_frame_rate"].split("/")
    return w, h, float(num) / float(den)


def reader(path, width, start=None, duration=None):
    w, h, fps = probe(path); H = int(round(h * width / w / 2) * 2)
    cmd = ["ffmpeg", "-loglevel", "error", "-threads", "2"]
    if start is not None: cmd += ["-ss", str(start)]
    cmd += ["-i", path]
    if duration is not None: cmd += ["-t", str(duration)]
    cmd += ["-vf", f"scale={width}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE), width, H, fps


class Finder:
    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        M = os.environ.get("AVT_MODELS", "models"); self.mp = mp
        for f in ("face_landmarker.task", "selfie_multiclass_256x256.tflite"):
            if not os.path.exists(os.path.join(M, f)): raise SystemExit(f"missing {f} in AVT_MODELS={M}")
        self.seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(M, "selfie_multiclass_256x256.tflite")), running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
        self.lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(M, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
        arc = os.path.join(M, "arcface_w600k_r50.onnx"); self.arc = None
        if os.path.exists(arc):
            import onnxruntime as ort
            self.arc = ort.InferenceSession(arc); self.ain = self.arc.get_inputs()[0].name

    def _detect(self, img):
        r = self.lmk.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
        return r.face_landmarks[0] if r.face_landmarks else None

    def landmarks(self, img):
        """His face is small on a full-body frame: find his face skin, cut round it, enlarge 3x, then read landmarks
        (the same steps as mouth_scan.py and the put-back's AVT_HEAD_ZOOM). Falls back to the whole frame."""
        import cv2
        H, W = img.shape[:2]
        small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        cat = np.squeeze(self.seg.segment(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(small))).category_mask.numpy_view())
        k, _, st, _ = cv2.connectedComponentsWithStats((cat == 3).astype(np.uint8))
        if k > 1:
            bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])] * np.array([4, 4, 4, 4, 1])
            side = int(max(bw, bh) * 2.2); x0 = max(0, bx + bw // 2 - side // 2); y0 = max(0, by + bh // 2 - side // 2)
            crop = img[y0:y0 + side, x0:x0 + side]; ch, cw = crop.shape[:2]
            if ch >= 20 and cw >= 20:
                z = 3 if max(ch, cw) * 3 <= 2400 else 1
                L = self._detect(cv2.resize(crop, (cw * z, ch * z), interpolation=cv2.INTER_CUBIC) if z > 1 else crop)
                if L is not None: return np.array([[x0 + q.x * cw, y0 + q.y * ch] for q in L], np.float32)
        L = self._detect(img)
        return None if L is None else np.array([[q.x * W, q.y * H] for q in L], np.float32)

    def identity(self, img, P):
        if self.arc is None: return None
        import cv2
        kp = np.array([(P[33] + P[133]) / 2, (P[362] + P[263]) / 2, P[1], P[61], P[291]], np.float32)
        M, _ = cv2.estimateAffinePartial2D(kp, ARC_TEMPLATE, method=cv2.LMEDS)
        if M is None: return None
        x = (cv2.warpAffine(img, M, (112, 112), borderValue=0).astype(np.float32) - 127.5) / 127.5
        e = self.arc.run(None, {self.ain: x.transpose(2, 0, 1)[None]})[0][0]
        return [round(float(v), 5) for v in e / (np.linalg.norm(e) + 1e-6)]


def track(path, width=1080, start=None, duration=None, finder=None):
    finder = finder or Finder(); proc, W, H, fps = reader(path, width, start, duration); frames = []; i = 0
    while True:
        b = proc.stdout.read(W * H * 3)
        if len(b) < W * H * 3: break
        img = np.frombuffer(b, np.uint8).reshape(H, W, 3); P = finder.landmarks(img); t = round(i / fps, 4); i += 1
        if P is None: frames.append({"t": t, "found": False}); continue
        frames.append({"t": t, "found": True, "openness": round(openness(P), 5), "turn": round(turn(P), 4),
                       "face_width": round(float(np.linalg.norm(P[234] - P[454]) / W), 5),
                       "lips": np.round(to_face(P, INNER_LIPS), 4).tolist(), "oval": np.round(P[FACE_OVAL] / [W, H], 4).tolist(),
                       "anchors": np.round(P[ANCHORS] / [W, H], 5).tolist(), "emb": finder.identity(img, P)})
    return {"clip": os.path.basename(path), "start": start, "duration": duration, "fps": fps, "width": W, "height": H,
            "identity_model": finder.arc is not None, "frames": frames}


def putback(take, draft, tsrc, tout, out_path, feather=0.06, grade=True):
    """His original face pixels moved onto the redraw's face. Refuses when the head is turned differently: a flat paste
    onto a turned head is the paste-up Fendi rejected."""
    import cv2
    rep = score_tracks(tsrc, tout)
    if rep.get("measured") and not rep["pose_ok_for_putback"]:
        raise SystemExit(f"refused: head turn differs by {rep['pose_turn_difference']} face widths (limit {POSE_TURN_MAX}); a flat put-back would read as pasted")
    if len(tsrc["frames"]) != len(tout["frames"]) or abs(tsrc.get("fps", 0) - tout.get("fps", 0)) > 0.01:
        raise SystemExit(f"refused: the take has {len(tsrc['frames'])} frames at {tsrc.get('fps')} fps and the redraw {len(tout['frames'])} at {tout.get('fps')}; "
                         "bring the take to the redraw's rate first (ffmpeg -vf fps=...) and track that copy, so each face goes on its own frame")
    W, H, fps = probe(draft); H -= H % 2; W -= W % 2
    ps, _, _, _ = reader(take, W, tsrc.get("start"), tsrc.get("duration")); po, _, Ho, _ = reader(draft, W, tout.get("start"), tout.get("duration"))
    hs = probe(take); Hs = int(round(hs[1] * W / hs[0] / 2) * 2)
    enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{Ho}", "-r", str(fps), "-i", "-",
                            "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", out_path + ".video.mp4"], stdin=subprocess.PIPE)
    kept = pasted = 0
    for fs, fo in zip(tsrc["frames"], tout["frames"]):
        a = ps.stdout.read(W * Hs * 3); b = po.stdout.read(W * Ho * 3)
        if len(a) < W * Hs * 3 or len(b) < W * Ho * 3: break
        src = np.frombuffer(a, np.uint8).reshape(Hs, W, 3); dst = np.frombuffer(b, np.uint8).reshape(Ho, W, 3).copy()
        if fs.get("found") and fo.get("found"):
            M = similarity(np.array(fs["anchors"]) * [W, Hs], np.array(fo["anchors"]) * [W, Ho])
            warped = cv2.warpAffine(src, M, (W, Ho), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
            poly = (np.array(fo["oval"]) * [W, Ho]).astype(np.int32); mask = np.zeros((Ho, W), np.float32); cv2.fillPoly(mask, [poly], 1.0)
            k = max(3, int(fo["face_width"] * W * feather) | 1)
            core = cv2.erode(mask, np.ones((k, k), np.uint8)); soft = cv2.GaussianBlur(core, (0, 0), k / 2.0)[..., None]
            face = warped.astype(np.float32)
            if grade:
                ring = (cv2.dilate(mask, np.ones((k * 2 + 1, k * 2 + 1), np.uint8)) - core) > 0.5
                if ring.sum() > 50:
                    g = dst[ring].astype(np.float32).mean(0) / (face[ring].mean(0) + 1e-3); face = np.clip(face * np.clip(g, 0.8, 1.25), 0, 255)
            dst = (face * soft + dst.astype(np.float32) * (1 - soft)).astype(np.uint8); pasted += 1
        else: kept += 1
        enc.stdin.write(dst.tobytes())
    enc.stdin.close(); enc.wait(); ps.kill(); po.kill()
    ss = ["-ss", str(tsrc["start"])] if tsrc.get("start") is not None else []
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", out_path + ".video.mp4", *ss, "-i", take, "-map", "0:v", "-map", "1:a?", "-c:v", "copy",
                    "-c:a", "aac", "-shortest", out_path], check=True)
    os.remove(out_path + ".video.mp4")
    return {"out": out_path, "frames_with_his_face_put_back": pasted, "frames_left_as_the_redraw": kept, "score_before": rep}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter); sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("track"); t.add_argument("clip"); t.add_argument("out"); t.add_argument("--start", type=float); t.add_argument("--duration", type=float); t.add_argument("--width", type=int, default=1080)
    s = sub.add_parser("score"); s.add_argument("source"); s.add_argument("output"); s.add_argument("--out")
    p = sub.add_parser("putback"); [p.add_argument(x) for x in ("take", "draft", "take_track", "draft_track", "out")]; p.add_argument("--no-grade", action="store_true")
    a = ap.parse_args()
    if a.cmd == "track":
        r = track(a.clip, a.width, a.start, a.duration); json.dump(r, open(a.out, "w"))
        n = len(r["frames"]); f = sum(1 for x in r["frames"] if x["found"]); print(json.dumps({"out": a.out, "frames": n, "face_found": f, "identity_model": r["identity_model"]}))
    elif a.cmd == "score":
        r = score_tracks(json.load(open(a.source)), json.load(open(a.output)))
        if a.out: json.dump(r, open(a.out, "w"), indent=1)
        print(json.dumps(r, indent=1))
    else:
        print("NOTE: Fendi failed this put-back on 27 Nov 2026 (the face warps in motion). Study only, never a deliverable.", file=sys.stderr)
        print(json.dumps(putback(a.take, a.draft, json.load(open(a.take_track)), json.load(open(a.draft_track)), a.out, grade=not a.no_grade), indent=1))


if __name__ == "__main__":
    main()
