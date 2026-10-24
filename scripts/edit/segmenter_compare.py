"""Before/after mask frames: MediaPipe's person region and face detection against a SAM 3 matte, on chosen frames.
usage: segmenter_compare.py <clip.mp4> <out_dir> --frames 0,50,90 [--sam3-matte <clip>.matte.mp4] [--sam3-face-dir DIR]
                            [--scale 0.5] [--crops shoe=x,y,w,h face=x,y,w,h ...]
For every frame a contact sheet <out_dir>/compare_<k>.jpg: the frame | MediaPipe categories (hair blue, body skin
yellow, face skin red, clothes green, accessory magenta) with the landmarker's face oval drawn (green when found,
"no face" when not) | the SAM 3 matte (white) with its face mask (red) when given | the disagreement (MediaPipe-only
in orange, SAM 3-only in cyan). Optional --crops cut named regions from the same frame at full resolution to
<out_dir>/crop_<name>_<k>.png (the shoe on the dark floor, the matte edge). A JSON summary records per frame the
MediaPipe person pixel count, the landmarker result, the SAM 3 pixel count and the IoU. Without --sam3-matte only the
MediaPipe half is written (the "before"); run again with the matte for the "after".
Models (env AVT_MODELS, default ./models): selfie_multiclass_256x256.tflite + face_landmarker.task."""
import argparse, json, os, subprocess, sys
import numpy as np, cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segmenters import Matte

PALETTE = {0: (0, 0, 0), 1: (255, 80, 40), 2: (40, 220, 220), 3: (40, 40, 230), 4: (40, 200, 40), 5: (200, 40, 200)}  # BGR
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
DET = (0.1, 0.05, 0.85, 0.6)   # body_only_swap's search box


def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                                   "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    n, d = s["r_frame_rate"].split("/"); return int(s["width"]), int(s["height"]), float(n) / float(d)


def read(p, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def main(argv=None):
    ap = argparse.ArgumentParser(description="MediaPipe vs SAM 3 mask frames")
    ap.add_argument("clip"); ap.add_argument("out_dir")
    ap.add_argument("--frames", default="0", help="comma-separated frame indexes")
    ap.add_argument("--sam3-matte", default=None, help="the SAM 3 matte video of this clip (sam3_matte.py / the runner)")
    ap.add_argument("--sam3-face-dir", default=None, help="folder holding <matte>.face_<k>.png masks (sam3_matte.py --face-frames)")
    ap.add_argument("--scale", type=float, default=0.5, help="contact sheet scale (default 0.5)")
    ap.add_argument("--crops", nargs="*", default=[], help="name=x,y,w,h regions cut at full resolution from each frame")
    ap.add_argument("--head-zoom", type=int, default=int(os.environ.get("AVT_HEAD_ZOOM", "4")), help="retry the landmarker on an enlarged crop around the face skin, as body_only_swap does (default 4; 0 off)")
    A = ap.parse_args(argv)
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    MODELS = os.environ.get("AVT_MODELS", "models")
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "selfie_multiclass_256x256.tflite")),
        running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
    lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
    W, H, FPS = probe(A.clip); frames = read(A.clip, W, H)
    idx = [int(x) for x in A.frames.split(",") if x.strip()]
    sam = Matte.load(A.sam3_matte, W, H, len(frames)) if A.sam3_matte else None
    os.makedirs(A.out_dir, exist_ok=True)
    summary = dict(clip=os.path.basename(A.clip), frames=len(frames), size=[W, H], fps=FPS, sam3_matte=A.sam3_matte and os.path.basename(A.sam3_matte), per_frame=[])

    def face(img):
        h0, w0 = img.shape[:2]
        x0, y0 = int(w0 * DET[0]), int(h0 * DET[1]); cw, ch = int(w0 * DET[2]), int(h0 * DET[3])
        r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y0 + ch, x0:x0 + cw])))
        how = "search box"
        if not r.face_landmarks and A.head_zoom:
            c = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img))).category_mask.numpy_view())
            n, lab, st, _ = cv2.connectedComponentsWithStats((c == 3).astype(np.uint8))
            if n > 1:
                bx, by, bw, bh, _ = st[1 + np.argmax(st[1:, cv2.CC_STAT_AREA])]
                side = int(max(bw, bh) * 2.2); x0 = max(0, bx + bw // 2 - side // 2); y0 = max(0, by + bh // 2 - side // 2)
                crop = img[y0:y0 + side, x0:x0 + side]; ch, cw = crop.shape[:2]
                big = cv2.resize(crop, (cw * A.head_zoom, ch * A.head_zoom), interpolation=cv2.INTER_CUBIC)
                r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big))); how = f"head zoom x{A.head_zoom}"
        if not r.face_landmarks: return None, None
        L = r.face_landmarks[0]
        return np.array([[x0 + L[k].x * cw, y0 + L[k].y * ch] for k in OVAL], np.float32), how

    for k in idx:
        img = frames[k]
        cat = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img))).category_mask.numpy_view()).copy()
        pts, how = face(img)
        bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        catv = np.zeros_like(bgr)
        for c, col in PALETTE.items(): catv[cat == c] = col
        if pts is not None: cv2.polylines(catv, [pts.astype(np.int32)], True, (0, 255, 0), 3)
        label = f"MediaPipe person {int((cat != 0).sum())} px; face: {how or 'NO FACE'}"
        cv2.putText(catv, label, (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
        panels = [bgr, catv]
        rec = dict(frame=k, mediapipe_person_px=int((cat != 0).sum()), face=how or None,
                   face_box=[float(v) for v in (pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max())] if pts is not None else None)
        if sam is not None:
            s = sam.alpha[k] > 0.5; mpp = cat != 0
            samv = np.repeat((s * 255).astype(np.uint8)[..., None], 3, 2)
            fp = A.sam3_face_dir and os.path.join(A.sam3_face_dir, f"{os.path.basename(A.sam3_matte)}.face_{k:03d}.png")
            if fp and os.path.exists(fp):
                fm = cv2.imread(fp, cv2.IMREAD_GRAYSCALE) > 127; samv[fm] = (40, 40, 230)
                rec["sam3_face_px"] = int(fm.sum())
            cv2.putText(samv, f"SAM 3 person {int(s.sum())} px", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 0), 3)
            diff = np.zeros_like(bgr); diff[mpp & ~s] = (0, 140, 255); diff[s & ~mpp] = (255, 255, 0)
            iou = float((mpp & s).sum() / max(1, (mpp | s).sum()))
            cv2.putText(diff, f"orange MediaPipe only {int((mpp & ~s).sum())}  cyan SAM3 only {int((s & ~mpp).sum())}  IoU {iou:.3f}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
            panels += [samv, diff]
            rec.update(sam3_person_px=int(s.sum()), iou=round(iou, 4), mediapipe_only_px=int((mpp & ~s).sum()), sam3_only_px=int((s & ~mpp).sum()))
        sheet = np.concatenate(panels, 1)
        if A.scale != 1.0: sheet = cv2.resize(sheet, None, fx=A.scale, fy=A.scale, interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(A.out_dir, f"compare_{k:03d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
        for spec in A.crops:
            name, box = spec.split("="); x, y, w, h = (int(v) for v in box.split(","))
            parts = [bgr[y:y + h, x:x + w], catv[y:y + h, x:x + w]]
            if sam is not None: parts += [panels[2][y:y + h, x:x + w], panels[3][y:y + h, x:x + w]]
            cv2.imwrite(os.path.join(A.out_dir, f"crop_{name}_{k:03d}.png"), np.concatenate(parts, 1))
        summary["per_frame"].append(rec); print(rec)
    with open(os.path.join(A.out_dir, "summary.json"), "w") as f: json.dump(summary, f, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
