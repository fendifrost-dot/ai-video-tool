"""Put his REAL take in place of the generated him in a Seedance clip, $0 (Fendi, 23 Oct 2026, c044: "the same exact
scene if possible, just use my leg on wall performance shot in place of seedance generated performance shot").
usage: replace_him_in_clip.py <clip.mp4> <clip_alpha.mp4> <take.mp4> <take_alpha.mp4> <segments.json> <out.mp4>
       [--size WxH] [--stills DIR] [--report out.json] [--model face_landmarker.task]

The clip (24 fps, 720x1280, the montage) keeps every cutaway exactly. In the segments listed, the generated him is
covered by the real him from the take (his own pixels, never redrawn): the take frame at the same time, matted, scaled
and placed by the segment's anchor; the clip's handheld shake is tracked (phase correlation on the clip's background
against the segment's first frame) and the real him moves with it; his light is the clip's (a per-channel linear gain
that matches the generated him's mean colour under his matte); whatever the generated him's matte still shows outside
the real him's matte is inpainted from its surroundings (cv2.inpaint, Telea) and its area reported per frame.

segments.json: {"song_start_clip": s, "song_start_take": s, "segments": [
  {"from": f0, "to": f1, "head_y": y, "height": h, "head_x": cx | "left_x": x}  — clip frames (inclusive), the real him's
  matte box: its top at head_y, its height, and either its centre (head_x) or its left edge (left_x: his back on a
  pillar), all in clip px; "track": true to follow the shake (default); "track_rect": [x0, y0, x1, y1] (clip px) a fixed
  window the generated him never enters, for the shake (else the whole background under a per-frame mask);
  "clip_face": [x0, y0, x1, y1] (clip px) the generated face when the landmarker misses it (profile, cap);
  "gain": [r, g, b] a fixed light gain instead
]}
His light: a per-channel linear gain from the generated him's FACE to the real him's face (the clothes differ, the skin
does not), once per segment on its first frame; the face is the landmarker's oval, found on an enlarged crop of the top
of each matte's box. Clip people outside the generated him's box (a model crossing the frame) are not inpainted and stay
in front of the real him.
A segment may instead stand him in the scene's PLATE ("plate": still path, 9:16): when the generated him fills the frame
(c009: seated, half the picture) there is nothing to inpaint from, so the background becomes the plate the montage was
made from, moved by the clip's tracked shake, and the real him stands in it; "plate_front": [[[x, y], ...], ...] are
polygons (output px) of the plate that stay in front of him (a table, the couch back). The gain is still the generated
him's face over his."""
import argparse, json, os, subprocess
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

ap = argparse.ArgumentParser()
for a in ("clip", "clip_alpha", "take", "take_alpha", "segments", "out"): ap.add_argument(a)
ap.add_argument("--size", default="1080x1920"); ap.add_argument("--stills", default=""); ap.add_argument("--report", default="")
ap.add_argument("--model", default=os.path.join(os.environ.get("AVT_MODELS", "models"), "face_landmarker.task"))
A = ap.parse_args()
OW, OH = map(int, A.size.split("x"))
LM = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=A.model), num_faces=1))
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
def face_mean(img, alpha):
    """Mean linear colour of the face oval (under the matte) of the person in `alpha`; None if no face. The head is the top
    of the matte's box: that part is cut out and enlarged 2x for the landmarker (a small face is missed at 1x)."""
    ys, xs = np.nonzero(alpha > 0.5)
    if len(ys) == 0: return None
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    hh = int((y1 - y0) * 0.35) + 1; cx0, cx1 = max(0, x0 - 20), min(img.shape[1], x1 + 20); cy0, cy1 = max(0, y0 - 10), min(img.shape[0], y0 + hh)
    crop = img[cy0:cy1, cx0:cx1]
    for up in (2.0, 1.0, 3.0):
        big = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
        r = LM.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
        if r.face_landmarks:
            L = r.face_landmarks[0]; pts = np.array([[cx0 + L[k].x * big.shape[1] / up, cy0 + L[k].y * big.shape[0] / up] for k in OVAL], np.float32)
            m = np.zeros(img.shape[:2], np.uint8); cv2.fillPoly(m, [pts.round().astype(np.int32)], 1)
            m = cv2.erode(m, np.ones((5, 5), np.uint8)).astype(bool) & (alpha > 0.5)
            if m.sum() < 50: return None
            return lin(img[m].astype(np.float32) / 255).mean(0)
    return None
SEG = json.load(open(A.segments))

def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                                   "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    n, d = s["r_frame_rate"].split("/"); return int(s["width"]), int(s["height"]), float(n) / float(d)
def frames(p, w, h, pix="rgb24"):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", pix, "-"],
                         capture_output=True).stdout
    c = 3 if pix == "rgb24" else 1
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, c) if c == 3 else np.frombuffer(raw, np.uint8).reshape(-1, h, w)

CW, CH, CFPS = probe(A.clip); TW, TH, TFPS = probe(A.take)
clip = frames(A.clip, CW, CH); calpha = frames(A.clip_alpha, CW, CH, "gray")
take = frames(A.take, TW, TH); talpha = frames(A.take_alpha, TW, TH, "gray")
n = min(len(clip), len(calpha))
lin = lambda v: np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.clip(v, 0, None), 1 / 2.4) - 0.055)
sx, sy = OW / CW, OH / CH
# the take's frame at the clip's time: both on the song clock
def take_index(i):
    t = SEG["song_start_clip"] + i / CFPS
    return int(np.clip(round((t - SEG["song_start_take"]) * TFPS), 0, len(take) - 1))

vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", f"{CFPS}",
                       "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
report = []
segs = {i: s for s in SEG["segments"] for i in range(s["from"], s["to"] + 1)}
ref = {}   # per segment: the first frame's background (for the shake) and his gain
PLATES = {}
for i in range(n):
    out = cv2.resize(clip[i], (OW, OH), interpolation=cv2.INTER_LANCZOS4)
    s = segs.get(i)
    if s is not None:
        j = take_index(i); ta = talpha[j].astype(np.float32) / 255; tf = take[j]
        ys, xs = np.nonzero(ta > 0.5)
        if len(ys) == 0:
            report.append(dict(frame=i, take_frame=j, note="no one in the take frame")); vw.stdin.write(out.tobytes()); continue
        bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
        scale = (s["height"] * sy) / max(1, by1 - by0)                        # his bounding-box height in output px
        key = (s["from"], s["to"])
        ca_all = calpha[i].astype(np.float32) / 255
        if key not in ref:
            # the generated him's box on the segment's first frame: what is covered and inpainted; the rest of the clip's
            # people (a model crossing) stay in front
            cys, cxs = np.nonzero(ca_all > 0.5)
            gx0, gx1, gy0, gy1 = (cxs.min(), cxs.max(), cys.min(), cys.max()) if len(cys) else (0, CW - 1, 0, CH - 1)
            box = np.zeros((CH, CW), np.float32); box[max(0, gy0 - 20):gy1 + 21, max(0, gx0 - 20):gx1 + 21] = 1
            ref[key] = dict(box=box)
        box = ref[key]["box"]
        ca = ca_all * box; others = ca_all * (1 - box)
        # the clip's shake: the background (clip pixels outside the generated him) against the segment's first frame
        g = cv2.cvtColor(clip[i], cv2.COLOR_RGB2GRAY).astype(np.float32)
        mask = (cv2.dilate((ca > 0.1).astype(np.uint8), np.ones((15, 15), np.uint8)) == 0).astype(np.float32)
        if "gain" not in ref[key]:
            # his light: the generated him's face over the real him's face, in linear light (the clothes differ, skin does not)
            fc = face_mean(clip[i], ca); ft = face_mean(tf, ta)
            if fc is None and "clip_face" in s:
                # the landmarker misses a face in profile under a cap: the generated face is then the given rect (clip px)
                # under his matte
                x0, y0, x1, y1 = s["clip_face"]; fm = np.zeros((CH, CW), bool); fm[y0:y1, x0:x1] = True; fm &= ca > 0.5
                fc = lin(clip[i][fm].astype(np.float32) / 255).mean(0) if fm.sum() >= 50 else None
            gain = np.clip(fc / np.maximum(ft, 1e-4), 0.25, 4.0) if fc is not None and ft is not None else np.ones(3)
            if "gain" in s: gain = np.float32(s["gain"])
            tr = s.get("track_rect")
            ref[key].update(g=g * mask, mask=mask, gain=gain, faces=(fc is not None, ft is not None),
                            win=(g[tr[1]:tr[3], tr[0]:tr[2]] * cv2.createHanningWindow((tr[2] - tr[0], tr[3] - tr[1]), cv2.CV_32F)) if tr else None, last=(0.0, 0.0))
        dx = dy = 0.0
        if s.get("track", True):
            tr = s.get("track_rect")
            if tr:
                # a fixed window of the clip the generated him never enters (its posters, its crew): a clean shake estimate
                win = g[tr[1]:tr[3], tr[0]:tr[2]] * cv2.createHanningWindow((tr[2] - tr[0], tr[3] - tr[1]), cv2.CV_32F)
                (dx, dy), resp = cv2.phaseCorrelate(ref[key]["win"], win)
                lx, ly = ref[key]["last"]
                if resp < 0.05 or max(abs(dx), abs(dy)) > 40 or max(abs(dx - lx), abs(dy - ly)) > 12:
                    dx, dy = lx, ly                                                       # no lock, or a jump: hold the last estimate
                ref[key]["last"] = (dx, dy)
            else:
                (dx, dy), _ = cv2.phaseCorrelate(ref[key]["g"], g * mask)
        gain = ref[key]["gain"]
        # the real him: graded, scaled, his head top at the anchor (plus the shake), in output px
        him = srgb(np.clip(lin(tf.astype(np.float32) / 255) * gain, 0, 1)).astype(np.float32)
        # anchor: head_y is the top of his box; head_x its centre, or left_x its left edge
        tx = (s["left_x"] + dx) * sx - bx0 * scale if "left_x" in s else (s["head_x"] + dx) * sx - (bx0 + bx1) / 2 * scale
        M = np.float32([[scale, 0, tx], [0, scale, (s["head_y"] + dy) * sy - by0 * scale]])
        hw = cv2.warpAffine(him, M, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        aw = cv2.warpAffine(ta, M, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        aw = cv2.GaussianBlur(aw, (0, 0), 0.8)
        # what the generated him still shows: his matte (shifted with the shake is where it already is) minus the real him's
        cao = cv2.resize(ca, (OW, OH), interpolation=cv2.INTER_LINEAR)
        left = np.clip(cao - aw, 0, 1); left_m = (left > 0.3).astype(np.uint8)
        left_m = cv2.dilate(left_m, np.ones((5, 5), np.uint8))
        if "plate" in s:
            # the scene's plate as the background, moved by the clip's shake; the generated him and the clip's people are gone
            if s["plate"] not in PLATES:
                PLATES[s["plate"]] = cv2.resize(cv2.cvtColor(cv2.imread(s["plate"]), cv2.COLOR_BGR2RGB), (OW, OH), interpolation=cv2.INTER_AREA)
            base = cv2.warpAffine(PLATES[s["plate"]], np.float32([[1, 0, dx * sx], [0, 1, dy * sy]]), (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            left = np.zeros((OH, OW), np.float32)
            v = base.astype(np.float32) / 255 * (1 - aw[..., None]) + hw * aw[..., None]
            if s.get("plate_front"):
                fm = np.zeros((OH, OW), np.uint8)
                for poly in s["plate_front"]: cv2.fillPoly(fm, [np.array(poly, np.int32)], 1)
                fm = cv2.GaussianBlur(fm.astype(np.float32), (0, 0), 1.0)[..., None]
                v = v * (1 - fm) + base.astype(np.float32) / 255 * fm
        else:
            base = out
            if left_m.any():
                base = cv2.inpaint(out, left_m, 7, cv2.INPAINT_TELEA)
            v = base.astype(np.float32) / 255 * (1 - aw[..., None]) + hw * aw[..., None]
            oth = cv2.resize(others, (OW, OH), interpolation=cv2.INTER_LINEAR)[..., None]     # the clip's other people, in front
            v = v * (1 - oth) + out.astype(np.float32) / 255 * oth
        out = (np.clip(v, 0, 1) * 255).round().astype(np.uint8)
        report.append(dict(frame=i, take_frame=j, scale=round(float(scale), 4), shake=[round(float(dx), 2), round(float(dy), 2)],
                           uncovered_px=int((left > 0.3).sum()), gain=[round(float(x), 4) for x in gain], faces=ref[key]["faces"]))
    if A.stills and (i % 8 == 0 or s is not None and i in (s["from"], s["to"])):
        import os; os.makedirs(A.stills, exist_ok=True); cv2.imwrite(f"{A.stills}/c_{i:03d}.jpg", cv2.cvtColor(out, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 90])
    vw.stdin.write(out.tobytes())
vw.stdin.close(); vw.wait()
if A.report: json.dump(report, open(A.report, "w"), indent=1)
done = [r for r in report if "scale" in r]
print("wrote", A.out, "frames", n, "replaced", len(done), "uncovered px max", max([r["uncovered_px"] for r in done], default=0),
      "shake max", max([max(abs(r["shake"][0]), abs(r["shake"][1])) for r in done], default=0))
