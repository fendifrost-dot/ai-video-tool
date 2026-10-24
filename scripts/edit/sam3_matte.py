# /// script
# requires-python = ">=3.10"
# dependencies = ["torch", "transformers", "accelerate", "huggingface_hub", "numpy", "opencv-python-headless", "pillow", "imageio-ffmpeg"]
# ///
"""SAM 3 person matte of one clip, as a file the put-back scripts read: <out>.matte.mp4 (8-bit grey H.264, the clip's
frame count and rate) + <out>.matte.mp4.json (model, revision, prompt, device, mode, frames, fps).
usage: sam3_matte.py <clip.mp4> <out.matte.mp4> [--prompt "man in cap"] [--point x,y | --box x0,y0,x1,y1] [--union]
                     [--model facebook/sam3] [--device auto|cuda|mps|cpu] [--face-frames 0,60,120] [--stills DIR]
Runs on this machine (CUDA, Apple MPS or CPU: a 4 s 1080x1920 clip is minutes on a GPU, long on a CPU) or on a
Hugging Face Job through sam3_matte_runner.py (the PEP 723 header above is its dependency list). The token is read from
HF_TOKEN / HUGGINGFACE_HUB_TOKEN / the hub's cached login and never printed; a gated-access failure exits 3 with the
request URL. --face-frames also writes the SAM 3 "face" mask of those frames (the landmarker fallback) and --stills
writes the person matte of the same frames as PNGs, for a before/after against MediaPipe."""
import argparse, json, os, shutil, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if "PYTHONPATH" in os.environ: sys.path[:0] = os.environ["PYTHONPATH"].split(os.pathsep)


def ffmpeg_exe():
    """ffmpeg on PATH, else the one imageio-ffmpeg ships (the HF Jobs uv image has none)."""
    p = os.environ.get("AVT_FFMPEG") or shutil.which("ffmpeg")
    if p: return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path):
    """(width, height, fps, rate string, frame count): ffprobe when there is one, else OpenCV's reader."""
    if shutil.which("ffprobe"):
        s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
                                       "-of", "json", path], capture_output=True, text=True).stdout)["streams"][0]
        n, d = s["r_frame_rate"].split("/")
        return int(s["width"]), int(s["height"]), float(n) / float(d), s["r_frame_rate"], int(s.get("nb_frames") or 0)
    import cv2
    cap = cv2.VideoCapture(path)
    w, h, fps, n = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return w, h, fps, f"{fps:.6f}", n


def read_frames(path, w, h):
    raw = subprocess.run([ffmpeg_exe(), "-loglevel", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def main(argv=None):
    ap = argparse.ArgumentParser(description="SAM 3 person matte of one clip")
    ap.add_argument("clip"); ap.add_argument("out", help="output matte video path (.mp4); a .json sidecar goes next to it")
    ap.add_argument("--prompt", default=None, help="text prompt (default: 'man in cap')")
    ap.add_argument("--face-prompt", default=None, help="text prompt for the face masks of --face-frames (default: 'face')")
    ap.add_argument("--point", default=None, help="seed point 'x,y' on frame 0 (tracker mode)")
    ap.add_argument("--box", default=None, help="seed box 'x0,y0,x1,y1' on frame 0 (tracker mode)")
    ap.add_argument("--union", action="store_true", help="merge every matched instance (default: the largest over the clip)")
    ap.add_argument("--model", default=None, help="hub model id (default facebook/sam3)")
    ap.add_argument("--device", default="auto", help="cuda, mps, cpu or auto")
    ap.add_argument("--face-frames", default="", help="comma-separated frame indexes whose SAM 3 face mask is written as <out>.face_<k>.png")
    ap.add_argument("--stills", default="", help="folder for person_<k>.png of the --face-frames (and frame 0)")
    A = ap.parse_args(argv)
    os.environ.setdefault("AVT_FFMPEG", ffmpeg_exe())
    import segmenters as S
    w, h, fps, rate, n = probe(A.clip)
    frames = read_frames(A.clip, w, h)
    print("clip", A.clip, frames.shape, "fps", fps)
    tok = S.hf_token()
    print("hf token:", "present" if tok else "absent (set HF_TOKEN)")
    backend = S.Sam3Backend(A.model or S.SAM3_MODEL_ID, A.device, tok)
    seg = S.Sam3Segmenter(backend, A.prompt or S.DEFAULT_PROMPT, A.face_prompt or S.DEFAULT_FACE_PROMPT, A.union, S.parse_point(A.point), S.parse_box(A.box))
    try:
        matte = seg.person_matte(frames, fps)
        faces = {}
        for k in [int(x) for x in A.face_frames.split(",") if x.strip()]:
            faces[k] = seg.face_mask(frames[k], matte.alpha[k] > 0.5)
    except S.Sam3AccessError as e:
        print(str(e), file=sys.stderr); return 3
    matte.provenance.update(source=os.path.basename(A.clip), device=backend.device)
    os.makedirs(os.path.dirname(os.path.abspath(A.out)), exist_ok=True)
    matte.save(A.out, rate)
    print("matte", A.out, matte.alpha.shape, "person px/frame", int(matte.alpha.sum(axis=(1, 2)).mean()), matte.provenance)
    import cv2
    for k, fm in faces.items():
        p = f"{A.out}.face_{k:03d}.png"
        cv2.imwrite(p, (fm.astype(np.uint8) * 255) if fm is not None else np.zeros((h, w), np.uint8))
        print("face mask", k, "found" if fm is not None else "none", p)
    if A.stills:
        os.makedirs(A.stills, exist_ok=True)
        for k in sorted({0, *faces.keys()}):
            if k < len(frames): cv2.imwrite(os.path.join(A.stills, f"person_{k:03d}.png"), (matte.alpha[k] * 255).astype(np.uint8))
    return 0


if __name__ == "__main__":
    sys.exit(main())
