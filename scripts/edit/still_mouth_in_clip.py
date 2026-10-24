"""Close the generated performer's mouth in a Seedance clip, $0, nothing else changes (Fendi, 24 Oct 2026, c044:
"recreate this scene the exact same way it was originally without the mouth movement ... movement and camera cuts
weren't preserved" by re-renders).

usage: still_mouth_in_clip.py <clip.mp4> <out.mp4> --segments '[{"from":33,"to":62,"ref":50,"box":[240,300,520,560],"zoom":3}, ...]'
       [--model face_landmarker.task] [--stills DIR] [--report out.json]

Per segment (clip frames, inclusive): the lower face of the reference frame "ref" (a frame whose mouth is shut:
pick it by the lip gap the --measure mode prints) is warped onto every other frame by a similarity transform fitted
on the landmarks that do not move with the jaw (eye corners, nose, cheeks, brow) and blended in under a feathered
mask from under the nose to below the chin (the jaw's own drop is covered). The patch keeps the reference's detail
and takes the current frame's low-frequency light, so a train's light sliding across his face still slides.
"box" [x0, y0, x1, y1] is where the landmarker looks (clip px), enlarged "zoom" times (the generated face is small).
Frames where no face is found (the model crossing in front) are left as they are. Everything outside the mask is the
clip's own pixels: cuts, camera, models, train untouched.

--measure prints the lip gap per frame for the given segments and writes nothing.
"""
import argparse, json, os, subprocess
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

ap = argparse.ArgumentParser()
ap.add_argument("clip"); ap.add_argument("out", nargs="?")
ap.add_argument("--segments", required=True)
ap.add_argument("--model", default=os.path.join(os.environ.get("AVT_MODELS", "models"), "face_landmarker.task"))
ap.add_argument("--stills", default=""); ap.add_argument("--report", default="")
ap.add_argument("--measure", action="store_true")
ap.add_argument("--lf-sigma", type=float, default=8.0, help="sigma (clip px) of the low-frequency light taken from the current frame")
ap.add_argument("--feather", type=float, default=3.0)
A = ap.parse_args()
SEGS = json.loads(A.segments)

def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                        "-of", "json", p], capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]; return int(s["width"]), int(s["height"]), s["r_frame_rate"]
W, H, RATE = probe(A.clip)
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", A.clip, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
clip = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
n = len(clip)

lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=A.model),
                                                                              running_mode=vision.RunningMode.IMAGE, num_faces=1))
def detect(img, box, zoom):
    x0, y0, x1, y1 = box; crop = img[y0:y1, x0:x1]
    big = cv2.resize(crop, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
    r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if not r.face_landmarks: return None
    return np.array([[x0 + p.x * (x1 - x0), y0 + p.y * (y1 - y0)] for p in r.face_landmarks[0]], np.float32)

# landmarks that do not move with the jaw: eye corners, nose bridge and tip, cheeks, brow centre
STABLE = [33, 133, 362, 263, 6, 168, 197, 1, 4, 234, 454, 9, 10, 127, 356, 116, 345]
# the lower face: the lip/chin outline of the face oval from one cheek round the chin to the other, closed under the nose
LOWER = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]
NOSE_UNDER = [454, 352, 429, 2, 209, 123, 234]   # a line just under the nose, from cheek to cheek (through the subnasale 2)

def mouth_gap(P): return float(np.linalg.norm(P[13] - P[14])), float(np.linalg.norm(P[234] - P[454]))

if A.measure:
    for s in SEGS:
        for i in range(s["from"], s["to"] + 1):
            P = detect(clip[i], s["box"], s["zoom"])
            print(i, "no face" if P is None else "lip gap %.1f / face width %.1f = %.3f" % (*mouth_gap(P), mouth_gap(P)[0] / mouth_gap(P)[1]))
    raise SystemExit

def lower_mask(P, drop):
    """Feathered mask of the lower face: the oval from under the nose round the chin, pushed down by `drop` px so the
    open jaw of the current frame is covered too."""
    pts = np.concatenate([P[NOSE_UNDER][::-1], P[LOWER][1:-1] + np.float32([0, drop])])
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [pts.astype(np.int32)], 1)
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(m.astype(np.float32), (0, 0), A.feather)

vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", RATE, "-i", "-",
                       "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
report = []
segs = {i: s for s in SEGS for i in range(s["from"], s["to"] + 1)}
refs = {}
for i in range(n):
    out = clip[i]; s = segs.get(i)
    if s is not None:
        key = (s["from"], s["to"])
        if key not in refs:
            Pr = detect(clip[s["ref"]], s["box"], s["zoom"])
            if Pr is None: raise SystemExit(f"no face on the reference frame {s['ref']}")
            refs[key] = (clip[s["ref"]].astype(np.float32), Pr)
        rf, Pr = refs[key]
        P = detect(clip[i], s["box"], s["zoom"])
        if P is None or i == s["ref"]:
            report.append(dict(frame=i, note="reference" if i == s["ref"] else "no face: left as is")); vw.stdin.write(out.tobytes()); continue
        M, _ = cv2.estimateAffinePartial2D(Pr[STABLE], P[STABLE], method=cv2.LMEDS)
        if M is None:
            report.append(dict(frame=i, note="no transform: left as is")); vw.stdin.write(out.tobytes()); continue
        warped = cv2.warpAffine(rf, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        Pw = (Pr @ M[:, :2].T) + M[:, 2]
        gap_cur, fw = mouth_gap(P)
        drop = max(0.0, float(P[152, 1] - Pw[152, 1])) + 0.06 * fw        # how far the current chin hangs below the closed one
        mask = lower_mask(Pw, drop)[..., None]
        cur = clip[i].astype(np.float32)
        # the reference's detail with the current frame's light: high-pass of the warped reference + low-pass of the
        # current frame, but the current low-pass is taken from a version whose mouth cavity is painted over (the
        # warped reference's own low-pass) so the dark open mouth does not shade the closed one
        lf_cur = cv2.GaussianBlur(cur, (0, 0), A.lf_sigma); lf_ref = cv2.GaussianBlur(warped, (0, 0), A.lf_sigma)
        hf_ref = warped - lf_ref
        inner = lower_mask(Pw, 0)[..., None]                                  # the closed lower face itself
        light = lf_cur * (1 - inner) + lf_ref * inner + (lf_cur - lf_ref) * inner * 0.5   # half the current light inside
        patch = np.clip(hf_ref + light, 0, 255)
        out = (cur * (1 - mask) + patch * mask).round().clip(0, 255).astype(np.uint8)
        report.append(dict(frame=i, lip_gap=round(gap_cur, 1), drop=round(drop, 1), mask_px=int((mask > 0.5).sum())))
    if A.stills and s is not None:
        os.makedirs(A.stills, exist_ok=True); cv2.imwrite(f"{A.stills}/m_{i:03d}.png", cv2.cvtColor(out, cv2.COLOR_RGB2BGR))
    vw.stdin.write(np.ascontiguousarray(out).tobytes())
vw.stdin.close()
if vw.wait() != 0: raise SystemExit("encode failed")
if A.report: json.dump(report, open(A.report, "w"), indent=1)
done = [r for r in report if "lip_gap" in r]
print("wrote", A.out, "frames", n, "mouths closed", len(done), "left as is", len(report) - len(done))
