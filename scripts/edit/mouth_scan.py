"""Lip gap per sample over a whole take, to find the stretches where he is not rapping (Fendi, 24 Oct 2026: "non
rapping footage should have been used for all b roll shots"). $0, offline.
usage: mouth_scan.py <take> <out.csv> [fps=6]      models: $AVT_MODELS/selfie_multiclass_256x256.tflite + face_landmarker.task
Decodes portrait 1080 wide; per sample the selfie segmenter finds his face skin, a box 2.2x the face is cut and
enlarged 3x for the landmarker (the face is ~60-100 px wide on a full-body frame, as in body_only_swap AVT_HEAD_ZOOM).
rows: t_take, lip_gap/face_width (nan when no face), face_w (px at 1080), nose_x, nose_y (px at 1080)"""
import sys, subprocess, numpy as np, cv2, os
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision
M = os.environ.get("AVT_MODELS", "models")
src, out = sys.argv[1], sys.argv[2]; fps = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
VF = f"fps={fps},scale='if(gt(iw,ih),1920,1080)':-2"
p2 = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-vf", "scale='if(gt(iw,ih),1920,1080)':-2", "-vframes", "1",
                     "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
n = len(p2); W = 1080; H = n // (W * 3)          # every take is portrait (the scale filter makes it 1080 wide)
if n != W * H * 3 or H < W: raise SystemExit(f"not a portrait frame: {n} bytes")
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(M, "selfie_multiclass_256x256.tflite")),
    running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(M, "face_landmarker.task")),
    running_mode=vision.RunningMode.IMAGE, num_faces=1))
proc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-threads", "2", "-i", src, "-vf", VF, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                        stdout=subprocess.PIPE)
i = 0
with open(out, "w") as f:
    f.write("t,gap,face_w,nose_x,nose_y\n")
    while True:
        b = proc.stdout.read(W * H * 3)
        if len(b) < W * H * 3: break
        img = np.frombuffer(b, np.uint8).reshape(H, W, 3); t = i / fps; i += 1
        small = cv2.resize(img, (270, 480), interpolation=cv2.INTER_AREA)
        cat = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small))).category_mask.numpy_view())
        fs = (cat == 3).astype(np.uint8); k, lab, st, _ = cv2.connectedComponentsWithStats(fs)
        if k <= 1:
            f.write(f"{t:.3f},nan,nan,nan,nan\n"); continue
        bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])]
        bx, by, bw, bh = bx * 4, by * 4, bw * 4, bh * 4
        side = int(max(bw, bh) * 2.2); x0 = max(0, bx + bw // 2 - side // 2); y0 = max(0, by + bh // 2 - side // 2)
        crop = img[y0:y0 + side, x0:x0 + side]; ch, cw = crop.shape[:2]
        if ch < 20 or cw < 20:
            f.write(f"{t:.3f},nan,nan,nan,nan\n"); continue
        big = cv2.resize(crop, (cw * 3, ch * 3), interpolation=cv2.INTER_CUBIC)
        r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
        if not r.face_landmarks:
            f.write(f"{t:.3f},nan,nan,nan,nan\n"); continue
        L = r.face_landmarks[0]; P = np.array([[x0 + q.x * cw, y0 + q.y * ch] for q in L], np.float32)
        fw = float(np.linalg.norm(P[234] - P[454])); gap = float(np.linalg.norm(P[13] - P[14]) / max(fw, 1e-3))
        f.write(f"{t:.3f},{gap:.4f},{fw:.1f},{P[1][0]:.1f},{P[1][1]:.1f}\n")
        if i % 120 == 0: f.flush()
print("done", out, "samples", i)
