#!/usr/bin/env python3
"""
FOOTAGE FRAMES — hand a local file's frames to the app's own footage analyzer.

    python3 scripts/qa/footage_frames.py --clip take.mp4 --out bundle/ [--from 0 --to 7]

Why this exists: the analyzer (src/lib/storyboard/footage.ts) runs in the browser, where frames come from WebCodecs
and faces from MediaPipe. There is no browser on a build box, and a design document is not a validated analyzer. So
this writes the SAME THREE RASTERS the browser draws, plus the SAME face landmarks, to a folder; the Node runner
beside it (scripts/qa/footage_report.mts) then feeds them to the REAL exported functions — `cellsOf`, `lumaOf`,
`sharpTiles`, `bestShift`, `faceOf`, `analyzeFootage`. Nothing is reimplemented here, so a report produced this way
is a report of the shipped arithmetic.

What differs from the browser, and it is written on every report:
  * the scaler. A canvas `drawImage` downscale and ffmpeg's swscale do not round the same way, so a sharpness number
    from here and from a tab will be close, not identical.
  * colour. These takes are HLG; a tab's canvas and ffmpeg tone-map a wide-gamut frame differently. Brightness and
    cast readings carry that difference.
  * the face pass. The browser retries a frame in closer windows when it finds no face in the whole of it; this does
    one pass over the whole frame, so it finds slightly fewer faces on a small figure. Fewer, never different ones.

Needs: imageio-ffmpeg (or ffmpeg on PATH), mediapipe, numpy. The face model is the same file the browser pins.
"""
import argparse, json, os, subprocess, sys, urllib.request

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
# the browser's own numbers (src/lib/media/detailSeries.ts, frameSeries.ts, faceSeries.ts)
DETAIL_SIDE = 256
MATCH_SIDE = 64
GRID = 12
PIXELS_PER_CELL = 4
FACE_SIDE = 960
WINDOW_SIDE = 512
WINDOW_SHARE = 0.6
CLOSE_ON = 2.2
SEEN_SIDE = 48


def ffmpeg() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def probe(path: str) -> dict:
    """What the container says. Read from ffmpeg's own report, which is what a player would act on."""
    out = subprocess.run([ffmpeg(), "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    info = {"width": None, "height": None, "fps": None, "durationSeconds": None, "rotation": 0,
            "hasAudio": "Audio:" in out, "codec": None, "transfer": None}
    for line in out.splitlines():
        s = line.strip()
        if s.startswith("Duration:"):
            hms = s.split("Duration:")[1].split(",")[0].strip()
            h, m, sec = hms.split(":")
            info["durationSeconds"] = int(h) * 3600 + int(m) * 60 + float(sec)
        if "Video:" in s:
            info["codec"] = s.split("Video:")[1].split(",")[0].strip().split(" ")[0]
            for part in s.split(","):
                p = part.strip()
                if "x" in p and p.split(" ")[0].replace("x", "").isdigit():
                    w, _, h2 = p.split(" ")[0].partition("x")
                    if w.isdigit() and h2.isdigit():
                        info["width"], info["height"] = int(w), int(h2)
                if p.endswith("fps"):
                    try: info["fps"] = float(p.split(" ")[0])
                    except ValueError: pass
                if "arib-std-b67" in p: info["transfer"] = "arib-std-b67"
                elif "smpte2084" in p: info["transfer"] = "smpte2084"
        if "rotation of" in s:
            try: info["rotation"] = int(round(abs(float(s.split("rotation of")[1].split("degrees")[0]))))
            except ValueError: pass
    return info


def raster(path: str, w: int, h: int, start: float, end: float) -> bytes:
    """Every frame of [start, end) as rgba at exactly w × h — the raster a canvas of that size would hold."""
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-ss", f"{start}", "-to", f"{end}", "-i", path,
           "-vf", f"scale={w}:{h}:flags=bilinear", "-pix_fmt", "rgba", "-f", "rawvideo", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg failed: {r.stderr.decode()[:400]}")
    return r.stdout


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--from", dest="start", type=float, default=0.0)
    ap.add_argument("--to", dest="end", type=float, default=None)
    ap.add_argument("--model", default=os.path.expanduser("~/.cache/avt/face_landmarker.task"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    info = probe(a.clip)
    end = a.end if a.end is not None else (info["durationSeconds"] or 0.0)
    if not (end > a.start):
        raise SystemExit("nothing to read: the end is not after the start")
    W, H = info["width"], info["height"]
    if not W or not H:
        raise SystemExit("the file does not say how large its picture is")

    # the three rasters, at the sizes the browser draws
    scale = DETAIL_SIDE / max(W, H)
    dw, dh = max(8, round(W * scale)), max(8, round(H * scale))
    gside = GRID * PIXELS_PER_CELL
    fscale = min(1.0, FACE_SIDE / max(W, H))
    fw, fh = max(2, round(W * fscale)), max(2, round(H * fscale))

    for name, (w, h) in {"detail": (dw, dh), "match": (MATCH_SIDE, MATCH_SIDE), "light": (gside, gside)}.items():
        data = raster(a.clip, w, h, a.start, end)
        with open(os.path.join(a.out, f"{name}.bin"), "wb") as f:
            f.write(data)
        print(f"  {name}: {len(data) // (w * h * 4)} frames at {w}×{h}")

    # faces: the same model the browser loads, and the same search the browser makes — the whole frame first, then
    # closer squares when it finds nothing there, then a close read on the face itself. A man standing full length is
    # a small face in a 1080 × 1920 frame and the whole-frame pass alone finds almost none of him (measured: 2 of 209
    # on S06). The windows below MIRROR media/faceSeries.ts; the Node runner checks them against the real
    # `closerWindows` and refuses to report if they have drifted apart.
    import numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision
    if not os.path.exists(a.model):
        os.makedirs(os.path.dirname(a.model), exist_ok=True)
        print("  fetching the face model…")
        urllib.request.urlretrieve(MODEL_URL, a.model)
    landmarker = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpp.BaseOptions(model_asset_path=a.model), running_mode=vision.RunningMode.IMAGE, num_faces=1))

    def closer_windows(w: int, h: int):
        """Mirror of closerWindows() in src/lib/media/faceSeries.ts. [x, y, side] in the frame's own pixels."""
        side = round(min(w, h) * WINDOW_SHARE)
        if not side > 8:
            return []
        def steps(length: int):
            n = max(1, -(-(length - side) // (side // 2)) + 1)
            return [0] if n == 1 else [round((length - side) * i / (n - 1)) for i in range(n)]
        return [(x, y, side) for y in steps(h) for x in steps(w)]

    def close_on(pts, w: int, h: int):
        """Mirror of closeOn(): the square to read the face again in, close. None when it already fills the frame."""
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        extent = max(max(xs) - min(xs), max(ys) - min(ys))
        side = round(min(w, h, extent * CLOSE_ON))
        if not extent > 4 or side >= min(w, h) * 0.9:
            return None
        x = round(max(0, min(w - side, (min(xs) + max(xs)) / 2 - side / 2)))
        y = round(max(0, min(h - side, (min(ys) + max(ys)) / 2 - side / 2)))
        return (x, y, side)

    def detect(rgb) -> list | None:
        res = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        return [[p.x, p.y] for p in res.face_landmarks[0]] if res.face_landmarks else None

    def resized(src, side: int):
        """Nearest-neighbour to `side` × `side` — the reader is given a square, as the browser's canvas gives it one."""
        hh, ww = src.shape[0], src.shape[1]
        yi = (np.arange(side) * hh // side).clip(0, hh - 1)
        xi = (np.arange(side) * ww // side).clip(0, ww - 1)
        return src[yi][:, xi]

    face_raw = raster(a.clip, fw, fh, a.start, end)
    per = fw * fh * 4
    n = len(face_raw) // per
    windows = closer_windows(W, H)          # on the coded size, as the browser lays them out
    kx, ky = fw / W, fh / H                 # …then mapped onto the raster actually held
    last_window = -1
    frames = []
    seen_boxes: list[bytes] = []
    for i in range(n):
        rgb = np.frombuffer(face_raw[i * per:(i + 1) * per], dtype=np.uint8).reshape(fh, fw, 4)[:, :, :3]
        pts = detect(rgb)                                            # the whole frame, as drawn
        if pts is not None:
            pts = [[p[0] * fw, p[1] * fh] for p in pts]
        if pts is None and windows:
            order = ([last_window] + [j for j in range(len(windows)) if j != last_window]) if last_window >= 0 else range(len(windows))
            for j in order:
                x, y, side = windows[j]
                x0, y0 = int(x * kx), int(y * ky)
                sw_, sh_ = int(side * kx), int(side * ky)
                crop = rgb[y0:y0 + sh_, x0:x0 + sw_]
                if crop.shape[0] < 8 or crop.shape[1] < 8:
                    continue
                got = detect(resized(crop, WINDOW_SIDE))
                if got is not None:
                    pts = [[x0 + p[0] * sw_, y0 + p[1] * sh_] for p in got]
                    last_window = j
                    break
        if pts is not None:                                          # …then closer on the face itself
            near = close_on(pts, fw, fh)
            if near:
                x, y, side = near
                crop = rgb[y:y + side, x:x + side]
                if crop.shape[0] >= 8 and crop.shape[1] >= 8:
                    again = detect(resized(crop, WINDOW_SIDE))
                    if again is not None:
                        pts = [[x + p[0] * side, y + p[1] * side] for p in again]
        # the face's own box, drawn at SEEN_SIDE — the raster media/faceSeries.ts measures `seen` on. The spread of
        # light across it is taken by the REAL lumaSpread in the Node runner, not here.
        box = np.zeros((SEEN_SIDE, SEEN_SIDE, 4), dtype=np.uint8)
        if pts is not None:
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            x0, y0 = max(0, int(min(xs))), max(0, int(min(ys)))
            x1, y1 = min(fw, int(max(xs))), min(fh, int(max(ys)))
            if x1 - x0 > 2 and y1 - y0 > 2:
                crop = np.frombuffer(face_raw[i * per:(i + 1) * per], dtype=np.uint8).reshape(fh, fw, 4)[y0:y1, x0:x1]
                box = resized(crop, SEEN_SIDE)
        seen_boxes.append(box.tobytes())
        frames.append([[round(p[0], 3), round(p[1], 3)] for p in pts] if pts is not None else None)
        if (i + 1) % 60 == 0:
            print(f"  faces: {i + 1}/{n}")
    with open(os.path.join(a.out, "seen.bin"), "wb") as f:
        for b in seen_boxes:
            f.write(b)
    found = sum(1 for f in frames if f)
    print(f"  faces: {found}/{n} frames")

    meta = {"clip": os.path.abspath(a.clip), "file": info, "range": [a.start, end],
            "detail": {"w": dw, "h": dh}, "match": {"w": MATCH_SIDE, "h": MATCH_SIDE},
            "light": {"w": gside, "h": gside, "grid": GRID}, "face": {"w": fw, "h": fh}, "seen": {"side": SEEN_SIDE},
            "fps": info["fps"], "landmarks": frames, "landmarksIn": "face raster pixels",
            "windows": [list(w) for w in windows],
            "source": "scripts/qa/footage_frames.py", "scaler": "ffmpeg swscale bilinear"}
    with open(os.path.join(a.out, "bundle.json"), "w") as f:
        json.dump(meta, f)
    print(f"  wrote {a.out}/bundle.json")


if __name__ == "__main__":
    main()
