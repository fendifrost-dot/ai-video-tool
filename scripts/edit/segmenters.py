"""Person mattes for the put-back scripts: MediaPipe (the default, unchanged) or SAM 3 behind a flag.

Why (PRs #362-#378, c044): MediaPipe `selfie_multiclass_256x256` missed his black patent shoe on the dark floor
("the shoes have black space resembling a bad crop"), its edge left a dark halo / double outline, and the face
landmarker found nothing on small or profile faces (`first face detection at frame None`). SAM 3 (Meta, "Segment
Anything with Concepts") segments and tracks a person from a TEXT prompt through the whole clip, at video resolution.

Backends
  mediapipe  the existing path. Nothing in this module runs; the scripts behave byte-for-byte as before.
  sam3       `facebook/sam3` through transformers (`Sam3VideoModel` + `Sam3VideoProcessor`: promptable concept
             segmentation on the whole clip; `Sam3TrackerVideoModel` when a point/box seed is given). The weights
             are a GATED repo: the token comes from the environment (HF_TOKEN, else HUGGINGFACE_HUB_TOKEN, else the
             hub's cached login) and is never printed. No access → `Sam3AccessError` with the request URL.

Selection: `--segmenter {mediapipe,sam3}` on the scripts, else env AVT_SEGMENTER, else mediapipe.

The matte contract (`Matte`): alpha float32 (N, H, W) in [0, 1], one frame per source frame, the source fps; saved
as an 8-bit grey H.264 video with a JSON sidecar (model, revision, prompt, device, seed, frames, fps) so a GPU run
(`sam3_matte_runner.py`) and a local run exchange the same file.

Evidence labels: the transformers calls below follow the published model card and docs (VERIFIED against the docs on
23 Oct 2026, https://huggingface.co/docs/transformers/main/en/model_doc/sam3_video); they have NOT been executed on
this machine (no weights access yet) — see docs/handoffs/HANDOFF_SAM3_PERSON_MASKS_2026-10-23.md."""
import json, os, subprocess
from dataclasses import dataclass, field

import numpy as np

SEGMENTERS = ("mediapipe", "sam3")
DEFAULT_SEGMENTER = "mediapipe"
DEFAULT_PROMPT = "man in cap"
DEFAULT_FACE_PROMPT = "face"
SAM3_MODEL_ID = "facebook/sam3"
SAM3_ACCESS_URL = "https://huggingface.co/facebook/sam3"
TOKEN_ENV_VARS = ("HF_TOKEN", "HUGGINGFACE_HUB_TOKEN")
FFMPEG = os.environ.get("AVT_FFMPEG", "ffmpeg")       # the HF Jobs image has no ffmpeg; sam3_matte.py points this at imageio-ffmpeg's
FFPROBE = os.environ.get("AVT_FFPROBE", "ffprobe")


class Sam3AccessError(RuntimeError):
    """The SAM 3 weights are gated and this token (or no token) cannot read them."""


class SegmenterError(RuntimeError):
    """A flag or input that does not fit the chosen backend."""


def gated_message(model_id=SAM3_MODEL_ID):
    return (f"SAM 3 weights not accessible: request access at https://huggingface.co/{model_id} and set HF_TOKEN "
            f"(or run with --segmenter mediapipe)")


def choose_segmenter(flag=None, env=None):
    """The backend: the flag wins, then AVT_SEGMENTER, then mediapipe. Unknown names raise."""
    env = os.environ if env is None else env
    name = flag or env.get("AVT_SEGMENTER") or DEFAULT_SEGMENTER
    name = str(name).strip().lower()
    if name not in SEGMENTERS:
        raise SegmenterError(f"unknown segmenter {name!r}; choose one of {', '.join(SEGMENTERS)}")
    return name


def hf_token(env=None):
    """The Hugging Face token from the environment (HF_TOKEN, HUGGINGFACE_HUB_TOKEN) or the hub's cached login; None if
    there is none. Callers must never print or log the value."""
    env = os.environ if env is None else env
    for k in TOKEN_ENV_VARS:
        v = env.get(k)
        if v: return v.strip()
    try:
        from huggingface_hub import get_token
        return get_token() or None
    except Exception:
        return None


def is_access_error(exc):
    """True for the hub's gated / not-found / 401 / 403 failures, whichever class or version raised them."""
    names = {c.__name__ for c in type(exc).__mro__}
    if names & {"GatedRepoError", "RepositoryNotFoundError", "GatedRepoAccessError"}: return True
    code = getattr(getattr(exc, "response", None), "status_code", None)
    if code in (401, 403): return True
    s = str(exc).lower()
    return any(t in s for t in ("gated", "401 client error", "403 client error", "access to model", "is restricted"))


def pick_device(requested=None):
    """cuda, then mps, then cpu — or the requested one."""
    if requested and requested != "auto": return requested
    try:
        import torch
        if torch.cuda.is_available(): return "cuda"
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available(): return "mps"
    except Exception:
        pass
    return "cpu"


def add_segmenter_args(ap):
    """The shared flags. --segmenter overrides env AVT_SEGMENTER; default mediapipe (nothing changes)."""
    g = ap.add_argument_group("segmenter", "person matte backend (default mediapipe: the existing path, byte-identical)")
    g.add_argument("--segmenter", choices=SEGMENTERS, default=None,
                   help="mediapipe (default) or sam3; env AVT_SEGMENTER sets the default")
    g.add_argument("--sam3-prompt", default=DEFAULT_PROMPT, help="text prompt for the person (default: 'man in cap')")
    g.add_argument("--sam3-face-prompt", default=DEFAULT_FACE_PROMPT,
                   help="text prompt for the face, used only when the landmarker finds no face (default: 'face')")
    g.add_argument("--sam3-model", default=SAM3_MODEL_ID, help="hub model id (default facebook/sam3; a gated repo)")
    g.add_argument("--sam3-device", default="auto", help="cuda, mps, cpu or auto (default)")
    g.add_argument("--sam3-point", default=None, help="optional seed point 'x,y' on the first frame (source px): tracks that one person with the SAM 3 tracker instead of the text prompt")
    g.add_argument("--sam3-box", default=None, help="optional seed box 'x0,y0,x1,y1' on the first frame (source px)")
    g.add_argument("--sam3-union", action="store_true", help="merge every instance the prompt matches (default: the one with the largest area over the clip)")
    g.add_argument("--sam3-matte-dir", default=None,
                   help="folder of precomputed mattes (<input basename>.matte.mp4 + .json, e.g. from sam3_matte_runner.py); a missing matte is computed here and saved there")
    return ap


def parse_point(s):
    if s is None: return None
    x, y = (float(v) for v in str(s).split(","))
    return (x, y)


def parse_box(s):
    if s is None: return None
    vals = [float(v) for v in str(s).split(",")]
    if len(vals) != 4: raise SegmenterError("--sam3-box wants x0,y0,x1,y1")
    return tuple(vals)


# ----------------------------------------------------------------------------------------------------------------------
# the matte contract
# ----------------------------------------------------------------------------------------------------------------------
@dataclass
class Matte:
    alpha: np.ndarray                     # (N, H, W) float32 in [0, 1]
    fps: float
    prompt: str = ""
    provenance: dict = field(default_factory=dict)

    def validate(self):
        a = self.alpha
        if not isinstance(a, np.ndarray) or a.ndim != 3: raise SegmenterError(f"matte must be (N, H, W), got {getattr(a, 'shape', None)}")
        if a.dtype != np.float32: raise SegmenterError(f"matte must be float32, got {a.dtype}")
        if a.size and (float(a.min()) < 0.0 or float(a.max()) > 1.0): raise SegmenterError("matte values must lie in [0, 1]")
        if not (self.fps > 0): raise SegmenterError("matte fps must be positive")
        return self

    @property
    def frames(self): return int(self.alpha.shape[0])

    def sidecar(self):
        n, h, w = self.alpha.shape
        return dict(frames=n, height=h, width=w, fps=self.fps, prompt=self.prompt, **self.provenance)

    def save(self, path, fps_rate=None):
        """8-bit grey H.264 (yuv420p, crf 4: the scripts threshold it) + <path>.json."""
        self.validate()
        n, h, w = self.alpha.shape
        rate = fps_rate or f"{self.fps:.6f}"
        p = subprocess.Popen([FFMPEG, "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", str(rate),
                              "-i", "-", "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path],
                             stdin=subprocess.PIPE)
        p.stdin.write(np.ascontiguousarray((self.alpha * 255).round().clip(0, 255).astype(np.uint8)).tobytes())
        p.stdin.close()
        if p.wait() != 0: raise SegmenterError(f"ffmpeg could not write the matte {path}")
        with open(sidecar_path(path), "w") as f: json.dump(self.sidecar(), f, indent=1)
        return path

    @staticmethod
    def load(path, width=None, height=None, frames=None):
        """The saved matte back as float32 (N, H, W); scaled to width x height when asked; the frame count checked when
        given (a matte of another clip is refused)."""
        meta = {}
        sp = sidecar_path(path)
        if os.path.exists(sp):
            with open(sp) as f: meta = json.load(f)
        probe = json.loads(subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                                           "-of", "json", path], capture_output=True, text=True).stdout)["streams"][0]
        w, h = int(probe["width"]), int(probe["height"])
        num, den = probe["r_frame_rate"].split("/"); fps = float(meta.get("fps") or float(num) / float(den))
        tw, th = width or w, height or h
        vf = ["-vf", f"scale={tw}:{th}:flags=bilinear"] if (tw, th) != (w, h) else []
        raw = subprocess.run([FFMPEG, "-loglevel", "error", "-i", path, *vf, "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
        a = np.frombuffer(raw, np.uint8).reshape(-1, th, tw).astype(np.float32) / 255.0
        if frames is not None and a.shape[0] != frames:
            raise SegmenterError(f"matte {path} has {a.shape[0]} frames, the clip has {frames}")
        prov = {k: v for k, v in meta.items() if k not in ("frames", "height", "width", "fps", "prompt")}
        return Matte(a, fps, meta.get("prompt", ""), prov).validate()


def sidecar_path(path): return path + ".json"


def matte_path_for(matte_dir, source_path):
    return os.path.join(matte_dir, os.path.basename(source_path) + ".matte.mp4")


# ----------------------------------------------------------------------------------------------------------------------
# SAM 3
# ----------------------------------------------------------------------------------------------------------------------
class Sam3Backend:
    """The transformers calls, and nothing else: loads the gated weights, returns per-frame instance masks.
    Kept apart from the selection logic so the tests can swap in a fake."""

    def __init__(self, model_id=SAM3_MODEL_ID, device="auto", token=None, revision=None):
        self.model_id, self.device, self.token, self.revision = model_id, pick_device(device), token, revision
        self._video = self._image = self._tracker = None

    # -- loading -------------------------------------------------------------------------------------------------------
    def _from_pretrained(self, cls, **kw):
        try:
            return cls.from_pretrained(self.model_id, token=self.token, revision=self.revision, **kw)
        except Exception as e:   # the hub raises several classes for "gated / no access"; name them all one way
            if is_access_error(e): raise Sam3AccessError(gated_message(self.model_id)) from None
            raise

    def _dtype(self):
        import torch
        return torch.bfloat16 if self.device == "cuda" else torch.float32

    def _load_video(self):
        if self._video is None:
            import torch
            from transformers import Sam3VideoModel, Sam3VideoProcessor
            model = self._from_pretrained(Sam3VideoModel).to(self.device, dtype=self._dtype()).eval()
            proc = self._from_pretrained(Sam3VideoProcessor)
            self._video = (model, proc)
        return self._video

    def _load_image(self):
        if self._image is None:
            from transformers import Sam3Model, Sam3Processor
            model = self._from_pretrained(Sam3Model).to(self.device).eval()
            proc = self._from_pretrained(Sam3Processor)
            self._image = (model, proc)
        return self._image

    def _load_tracker(self):
        if self._tracker is None:
            from transformers import Sam3TrackerVideoModel, Sam3TrackerVideoProcessor
            model = self._from_pretrained(Sam3TrackerVideoModel).to(self.device).eval()
            proc = self._from_pretrained(Sam3TrackerVideoProcessor)
            self._tracker = (model, proc)
        return self._tracker

    def describe(self):
        return dict(model=self.model_id, revision=self.revision or "main", device=self.device)

    # -- inference -----------------------------------------------------------------------------------------------------
    def video_instances(self, frames, prompt):
        """Text prompt on the whole clip. Yields (frame_idx, [(object_id, score, mask_bool_HxW), ...]) per frame."""
        import torch
        model, proc = self._load_video()
        session = proc.init_video_session(video=list(frames), inference_device=self.device, processing_device="cpu",
                                          video_storage_device="cpu", dtype=self._dtype())
        session = proc.add_text_prompt(inference_session=session, text=prompt)
        with torch.inference_mode():
            for out in model.propagate_in_video_iterator(inference_session=session):
                post = proc.postprocess_outputs(session, out)
                ids = [int(i) for i in post["object_ids"].tolist()]
                scores = [float(s) for s in post["scores"].tolist()]
                masks = post["masks"].to("cpu").numpy().astype(bool) if len(ids) else np.zeros((0,) + frames[0].shape[:2], bool)
                yield int(out.frame_idx), list(zip(ids, scores, masks))

    def video_tracked(self, frames, point=None, box=None):
        """One object seeded by a point or a box on frame 0, tracked with the SAM 3 tracker. Yields (frame_idx, mask_bool)."""
        import torch
        model, proc = self._load_tracker()
        session = proc.init_video_session(video=list(frames), inference_device=self.device)
        kw = dict(inference_session=session, frame_idx=0, obj_ids=1)
        if box is not None: kw["input_boxes"] = [[[list(box)]]]
        else: kw.update(input_points=[[[[float(point[0]), float(point[1])]]]], input_labels=[[[1]]])
        proc.add_inputs_to_inference_session(**kw)
        h, w = frames[0].shape[:2]
        with torch.inference_mode():
            model(inference_session=session, frame_idx=0)
            for out in model.propagate_in_video_iterator(session):
                m = proc.post_process_masks([out.pred_masks], original_sizes=[[h, w]], binarize=True)[0]
                yield int(out.frame_idx), m[0, 0].to("cpu").numpy().astype(bool)

    def image_instances(self, image, prompt, threshold=0.5):
        """Text prompt on one frame: [(score, mask_bool_HxW), ...] sorted by score, best first."""
        import torch
        from PIL import Image
        model, proc = self._load_image()
        inputs = proc(images=Image.fromarray(np.ascontiguousarray(image)), text=prompt, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            out = model(**inputs)
        res = proc.post_process_instance_segmentation(out, threshold=threshold, mask_threshold=0.5,
                                                      target_sizes=inputs.get("original_sizes").tolist())[0]
        pairs = [(float(s), m.to("cpu").numpy().astype(bool)) for s, m in zip(res["scores"], res["masks"])]
        return sorted(pairs, key=lambda p: -p[0])


class Sam3Segmenter:
    """Person mattes and the face fallback over a backend (the real one, or a fake in the tests)."""

    def __init__(self, backend=None, prompt=DEFAULT_PROMPT, face_prompt=DEFAULT_FACE_PROMPT, union=False, point=None, box=None):
        self.backend = backend
        self.prompt, self.face_prompt, self.union, self.point, self.box = prompt, face_prompt, union, point, box

    @classmethod
    def from_args(cls, A, env=None):
        tok = hf_token(env)
        return cls(Sam3Backend(A.sam3_model, A.sam3_device, tok), A.sam3_prompt, A.sam3_face_prompt, A.sam3_union,
                   parse_point(A.sam3_point), parse_box(A.sam3_box))

    def person_matte(self, frames, fps):
        """A tracked matte of the one person (or the union of all matches) for every frame. frames: (N, H, W, 3) uint8."""
        n, h, w = frames.shape[:3]
        alpha = np.zeros((n, h, w), np.float32)
        prov = dict(self.backend.describe(), seed=None)
        if self.point is not None or self.box is not None:
            prov.update(mode="tracker", seed=dict(point=self.point, box=self.box))
            for k, m in self.backend.video_tracked(frames, self.point, self.box):
                alpha[k] = m
        else:
            prov.update(mode="text", union=bool(self.union))
            per_frame = {}
            for k, inst in self.backend.video_instances(frames, self.prompt):
                per_frame[k] = inst
            if self.union:
                for k, inst in per_frame.items():
                    for _, _, m in inst: alpha[k] = np.maximum(alpha[k], m.astype(np.float32))
            else:
                area = {}
                for inst in per_frame.values():
                    for oid, _, m in inst: area[oid] = area.get(oid, 0) + int(m.sum())
                keep = max(area, key=area.get) if area else None
                prov["object_id"] = keep
                for k, inst in per_frame.items():
                    for oid, _, m in inst:
                        if oid == keep: alpha[k] = m.astype(np.float32)
        return Matte(alpha, fps, self.prompt, prov).validate()

    def face_mask(self, image, inside=None):
        """The best face instance on one frame as a bool mask, restricted to `inside` (a person matte) when given;
        None when the prompt matches nothing. The fallback for a landmarker that finds no face."""
        pairs = self.backend.image_instances(image, self.face_prompt)
        for _, m in pairs:
            mm = m & inside if inside is not None else m
            if mm.sum() >= 50: return mm
        return None


def face_geometry_from_mask(mask):
    """What body_only_swap's landmarker provides, estimated from a face mask: (oval points (K, 2) float32, brow row,
    face height, eye row). A face mask runs from the hairline or cap brim to the chin; the brows sit about a quarter
    down it and the upper eyelids about four tenths (OBSERVED proportions, used only when the landmarker fails)."""
    import cv2
    m = mask.astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: return None
    c = max(cs, key=cv2.contourArea)
    hull = cv2.convexHull(c).reshape(-1, 2).astype(np.float32)
    y0, y1 = float(hull[:, 1].min()), float(hull[:, 1].max())
    fh = y1 - y0
    if fh < 8: return None
    return hull, y0 + 0.25 * fh, fh, y0 + 0.40 * fh


def refine_categories(cat, person, grow=2):
    """MediaPipe's class map with the person region taken from the SAM 3 matte: a pixel SAM 3 calls him that MediaPipe
    called background becomes clothes (the black shoe on the dark floor); a pixel MediaPipe called him that lies
    outside the matte grown `grow` px becomes background (the halo). Skin / hair / face classes keep their labels."""
    import cv2
    out = cat.copy()
    p = person > 0.5
    out[p & (out == 0)] = 4
    if grow > 0:
        pg = cv2.dilate(p.astype(np.uint8), np.ones((2 * grow + 1, 2 * grow + 1), np.uint8)).astype(bool)
    else:
        pg = p
    out[~pg & (out != 0)] = 0
    return out


def matte_for_clip(seg, frames, fps, source_path, matte_dir=None, fps_rate=None):
    """The clip's matte: loaded from matte_dir when it is there (and the frame count matches), else computed with
    the segmenter and saved there when a folder is given."""
    n, h, w = frames.shape[:3]
    if matte_dir:
        p = matte_path_for(matte_dir, source_path)
        if os.path.exists(p):
            m = Matte.load(p, w, h, n)
            print(f"matte loaded {p} ({m.frames} frames, {m.prompt!r})")
            return m
    m = seg.person_matte(frames, fps)
    if matte_dir:
        os.makedirs(matte_dir, exist_ok=True)
        p = matte_path_for(matte_dir, source_path)
        m.save(p, fps_rate); print(f"matte saved {p}")
    return m


def resolve_alpha_source(value, segmenter):
    """replace_him_in_clip's alpha arguments: a file path, or 'sam3' / 'sam3:<cache.mp4>' to matte the clip with SAM 3.
    Returns (kind, path): ('file', path) or ('sam3', cache_path_or_None). 'sam3' with the mediapipe backend is refused."""
    v = str(value)
    if v == "sam3" or v.startswith("sam3:"):
        if segmenter != "sam3":
            raise SegmenterError(f"alpha {v!r} needs --segmenter sam3 (or AVT_SEGMENTER=sam3); the default backend reads a matte file")
        return "sam3", (v[5:] or None)
    return "file", v
