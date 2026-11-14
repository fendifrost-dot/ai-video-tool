"""Body-only clothing swap, $0: clothes from the Genjutsu output, everything else from the ORIGINAL pixels.
usage: body_only_swap.py <original.mp4> <swap.mp4> <out_dir>
- Both cover the same 4.000 s; the original frame at t takes the swap frame at t (swap is time-conformed already).
- Swap frames are aligned to the original by an ECC affine fit on the background (Genjutsu shifts and rescales).
- Taken from the swap: clothes/accessories in either frame, plus the cap (above the brow line, over the head), plus
  any strongly changed pixel next to him that is not protected (an original shoe or hem reaching past the new one).
- Always original: the face from the eyebrows down (landmark face shape: eyes, glasses, nose, mouth, beard), face skin
  and hair below the brows, and skin wherever the swap also shows skin (hands, neck). A swap sleeve over the original
  bare arm wins. The script proves it: max |out - original| inside the protected region is printed (must be 0;
  measured before the final video encode).
- Models (env AVT_MODELS, default ./models): MediaPipe selfie_multiclass_256x256.tflite and face_landmarker.task.
- A small face (env AVT_HEAD_ZOOM=4): see HEAD_ZOOM below. The run prints, per scene, on how many frames HIS face was
  found (face_track.py: the subject is the face whose clothes the swap changed); a scene with none has no face shape
  and no brow line, and the glasses would come from the swap there.
- Verified on c033 (18 Oct 2026): docs/research/results/2026-10-18-body-only-swap/BODY_ONLY_SWAP_TEST_2026-10-18.md
- --segmenter sam3 (or env AVT_SEGMENTER=sam3; default mediapipe, byte-identical to before): the person region of both
  clips comes from a SAM 3 text-prompt matte (scripts/edit/segmenters.py) — a pixel MediaPipe called background inside
  the matte is taken as clothes (the black shoe on the dark floor), a pixel it called him outside the matte is dropped
  (the halo) — and when the landmarker finds no face at all, the face oval and brow line come from a SAM 3 "face"
  mask. MediaPipe still labels skin/hair/face, so the protection proof holds either way.
- The swap is motion-interpolated to the original's frame rate first whenever the rates differ (swap_rate.py says why:
  a ~22 fps swap inside a 59.94 fps window made the clothes stutter and the re-shoot robotic, c044 24 Oct 2026). The
  interpolated file is written to <out_dir>/swap_at_source_rate.mp4; AVT_SWAP_INTERPOLATE=0 skips it (diagnostic only)."""
import argparse, subprocess, sys, os, json
import numpy as np, cv2, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segmenters import add_segmenter_args, choose_segmenter, Sam3Segmenter, refine_categories, matte_for_clip, face_geometry_from_mask
from swap_rate import needs_interpolation, interpolate_swap, enabled as interpolation_enabled
from face_track import scene_starts, pick_subject, track_scene, centre
from head_fit import fit_edges, x_map
from silhouette import refine_silhouette, masked_mean

MODELS = os.environ.get("AVT_MODELS", "models")  # selfie_multiclass_256x256.tflite + face_landmarker.task
ap = argparse.ArgumentParser(description="Body-only clothing swap: clothes from the Genjutsu output, everything else from the ORIGINAL pixels.")
ap.add_argument("original"); ap.add_argument("swap"); ap.add_argument("out_dir")
add_segmenter_args(ap)
ap.add_argument("--base", choices=("original", "swap"), default="original",
                help="original (default): the scene stays the take, only the clothes come from the swap. swap: the whole swap frame is kept "
                     "(a creature or prop swapped in beside him) and only his protected face, beard and skin go back from the take.")
ap.add_argument("--retime", choices=("auto", "on", "off"), default="auto",
                help="pair each original frame with the swap frame that shows the same instant (searched two frames either side of the "
                     "clock's frame, never stepping back). auto: on with --base swap, where a head drawn a frame early or late "
                     "leaves a seam round his real face; off otherwise.")
ap.add_argument("--hat-gap-fill", choices=("on", "off"), default="on",
                help="on (default): the strip between the swap's new hat and his face is filled from the hat. off: for a swap that "
                     "changes no headwear (a creature or prop beside him): that fill drew dark marks across his forehead on the "
                     "first frames of Hyenas verse 11.1 and on his cap's edge on verse 5.2 (13 Nov 2026); without it they are gone.")
A = ap.parse_args()
orig_p, swap_p, out_dir = A.original, A.swap, A.out_dir
SEGMENTER = choose_segmenter(A.segmenter)
os.makedirs(out_dir, exist_ok=True)

def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,duration", "-of", "json", p], capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]; n, d = s["r_frame_rate"].split("/")
    probe.rate = s["r_frame_rate"]      # the last probed rate as a fraction, for the encoder
    return int(s["width"]), int(s["height"]), float(n) / float(d), float(s["duration"])

def read(p, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)

W, H, FPS, DUR = probe(orig_p); FPS_RATE = probe.rate
_, _, SFPS, SDUR = probe(swap_p)
if needs_interpolation(FPS, SFPS):
    if interpolation_enabled():
        # the rule, not a one-off: a swap at another rate would hold its frames inside the original's clock
        swap_p = interpolate_swap(swap_p, FPS_RATE, os.path.join(out_dir, "swap_at_source_rate.mp4"), W, H)
        _, _, SFPS, SDUR = probe(swap_p)
        print(f"swap interpolated to the original's rate: {FPS_RATE} ({SFPS:.3f} fps), minterpolate mci")
    else:
        print(f"WARNING: swap at {SFPS:.3f} fps inside a {FPS:.3f} fps original, AVT_SWAP_INTERPOLATE=0: the clothes will stutter")
SFPS_RATE = probe.rate
orig = read(orig_p, W, H)
swap = read(swap_p, W, H)            # upscaled to the original's size; only the clothes are used
print("original", orig.shape, FPS, "swap", swap.shape, SFPS)

# --segmenter sam3: a tracked person matte of each clip (computed here, or loaded from --sam3-matte-dir when a GPU run
# made it); None under mediapipe, and then nothing below changes
SAM, M_ORIG, M_SWAP = None, None, None
if SEGMENTER == "sam3":
    SAM = Sam3Segmenter.from_args(A)
    M_ORIG = matte_for_clip(SAM, orig, FPS, orig_p, A.sam3_matte_dir, FPS_RATE)
    M_SWAP = matte_for_clip(SAM, swap, SFPS, swap_p, A.sam3_matte_dir, SFPS_RATE)
    print("segmenter sam3", M_ORIG.provenance, "person px/frame", int(M_ORIG.alpha.sum(axis=(1, 2)).mean()))
else:
    print("segmenter mediapipe")
def PO(k): return M_ORIG.alpha[k] if M_ORIG is not None else None

seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "selfie_multiclass_256x256.tflite")),
    running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
def cats(img, person=None):
    r = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    c = np.squeeze(r.category_mask.numpy_view()).copy()   # 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others
    return refine_categories(c, person) if person is not None else c

OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
BROWS = [70,63,105,66,107,336,296,334,293,300]
EYES = [159,160,158,386,387,385]     # upper eyelids: the face is his own from here down, whatever the cap did above
lmk = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")), running_mode=vision.RunningMode.IMAGE, num_faces=1))
DET = (0.1, 0.05, 0.85, 0.6)  # x, y, w, h of the frame searched for the face (full-body framing: the face is small)
# env AVT_HEAD_ZOOM (default 0, off): when the search box finds no face, enlarge a crop around his face skin this many
# times and look again. The 23 Oct reshoot needs it (his face ~100 px wide at 1080); c033 (18 Oct) runs without it.
HEAD_ZOOM = int(os.environ.get("AVT_HEAD_ZOOM", "0"))
DUMP = {int(x) for x in os.environ.get("AVT_DUMP", "").split(",") if x.strip()}
# env AVT_ABLATE="headfit,vote,gap": switch a stage OFF for a controlled comparison (diagnosis only; default all on)
ABLATE = {x.strip() for x in os.environ.get("AVT_ABLATE", "").split(",") if x.strip()}
if A.hat_gap_fill == "off": ABLATE.add("gap")
# env AVT_HEAD_FIT=1 turns the row-wise head re-fit (head_fit.py) ON. Default OFF since 2 Nov 2026: measured on c041 v2,
# the per-row shift it applied to the hat (up to 24 px on the close-up, 30 px on the wide shot) moved 2-6 px between
# consecutive frames with spikes of 8-11 px — a time-varying warp that morphed the hat. Its driving edges were not the
# face outline either: the swap's face skin is occluded by its own brim at the temples. The hat is taken rigidly from
# the scene-aligned swap; the head-size mismatch is handled at the composite boundary only (silhouette.py, feather).
HEAD_FIT = os.environ.get("AVT_HEAD_FIT", "0") == "1" and "headfit" not in ABLATE
sam_face_frames = []   # scene starts whose face geometry came from the SAM 3 face mask, not the landmarker
def landmarks_to_face(L, x0, y0, cw, ch):
    pts = np.array([[x0 + L[k].x * cw, y0 + L[k].y * ch] for k in OVAL], np.float32)
    face_h = pts[:, 1].max() - pts[:, 1].min()
    brow = min(y0 + L[k].y * ch for k in BROWS) - 0.04 * face_h
    eye = min(y0 + L[k].y * ch for k in EYES) - 0.02 * face_h
    return (pts, brow, face_h, eye)
def detect_candidates(img, oc):
    """Every face the landmarker finds in a frame: in the search box and, with HEAD_ZOOM, on an enlarged crop around
    each of the three largest face-skin regions. A frame can hold several people (c041 v2, 1 Nov 2026: the man in
    the foreground has the bigger face); which one is him is decided by the swap (face_track.pick_subject: the
    face whose clothes the swap changed), never by size or by whichever the landmarker returned first."""
    h0, w0, _ = img.shape; found = []
    x0, y0 = int(w0 * DET[0]), int(h0 * DET[1]); cw, ch = int(w0 * DET[2]), int(h0 * DET[3])
    r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[y0:y0 + ch, x0:x0 + cw])))
    if r.face_landmarks: found.append(landmarks_to_face(r.face_landmarks[0], x0, y0, cw, ch))
    if HEAD_ZOOM:
        n, _, st, _ = cv2.connectedComponentsWithStats((oc == 3).astype(np.uint8))
        for q in sorted(range(1, n), key=lambda q: -st[q, cv2.CC_STAT_AREA])[:3]:
            bx, by, bw, bh, area = st[q]
            if area < 64: continue
            side = int(max(bw, bh) * 2.2); cx0 = max(0, bx + bw // 2 - side // 2); cy0 = max(0, by + bh // 2 - side // 2)
            crop = img[cy0:cy0 + side, cx0:cx0 + side]; ch2, cw2 = crop.shape[:2]
            if ch2 < 8 or cw2 < 8: continue
            big = cv2.resize(crop, (cw2 * HEAD_ZOOM, ch2 * HEAD_ZOOM), interpolation=cv2.INTER_CUBIC)
            r = lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
            if r.face_landmarks: found.append(landmarks_to_face(r.face_landmarks[0], cx0, cy0, cw2, ch2))
    uniq = []   # the box and a zoom crop can return the same face: keep one
    for f in found:
        c = centre(f)
        if all(abs(c[0] - centre(g)[0]) > 0.3 * g[2] or abs(c[1] - centre(g)[1]) > 0.3 * g[2] for g in uniq): uniq.append(f)
    return uniq
def face_mask(face, brow):
    """(the face from the brows down, the whole dilated oval) as boolean masks."""
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [face[0].astype(np.int32)], 1)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    full = m.astype(bool); m = m.copy(); m[: int(brow)] = 0   # above the brows (cap, forehead under the brim) may take the swap
    return m.astype(bool), full

# per swap frame: categories and an affine aligning it to the original frame at the same time
SC = 0.25
def plausible_affine(M, w, h):
    """True when M (2x3, at the small scale) is a small correction: singular values within 0.8..1.25 and a shift
    under 15 % of the frame; anything else is a diverged estimate."""
    sv = np.linalg.svd(np.asarray(M, np.float64)[:, :2], compute_uv=False)
    return bool(0.8 < sv.min() and sv.max() < 1.25 and abs(M[0, 2]) < 0.15 * w and abs(M[1, 2]) < 0.15 * h)
def gray_small(img): return cv2.resize(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), None, fx=SC, fy=SC).astype(np.float32)
# the swap frame for each original frame. The swap is time-conformed, but its SCENE CUTS can sit a frame off the
# original's (c041 v2, 2 Nov 2026: cuts at 40/53 against 39/54 — the first and last frame of the wide shot took
# another scene's hat and coat, a flash at every cut). When both clips show the same number of cuts, each scene
# maps onto its counterpart; otherwise the clock mapping stands and the mismatch is printed.
diffs = [0.0] + [float(np.abs(gray_small(orig[k]) - gray_small(orig[k - 1])).mean()) for k in range(1, len(orig))]
sdiffs = [0.0] + [float(np.abs(gray_small(swap[k]) - gray_small(swap[k - 1])).mean()) for k in range(1, len(swap))]
starts = scene_starts(diffs); ends = starts[1:] + [len(orig)]
s_starts = scene_starts(sdiffs); s_ends = s_starts[1:] + [len(swap)]
J = [min(len(swap) - 1, int(round(i / FPS * SFPS))) for i in range(len(orig))]
if len(starts) == len(s_starts) and len(starts) > 1:
    for (o0, o1), (q0, q1) in zip(zip(starts, ends), zip(s_starts, s_ends)):
        if abs((o1 - o0) - (q1 - q0)) <= 3:
            # the same footage redrawn at the same rate: frame for frame from the cut, the last frame held when
            # the swap's scene is a frame or two shorter (stretching it instead repeated frames mid-scene and the
            # hat jumped two frames' worth at once)
            for i in range(o0, o1): J[i] = min(q1 - 1, q0 + (i - o0))
        else:
            for i in range(o0, o1): J[i] = min(q1 - 1, q0 + int(round((i - o0) * (q1 - q0) / (o1 - o0))))
            print(f"scene {o0}-{o1 - 1}: the swap's scene has {q1 - q0} frames for the original's {o1 - o0}: stretched")
    print("scenes aligned by their cuts: original", starts, "swap", s_starts)
elif len(starts) != len(s_starts):
    print("WARNING: the original has", len(starts) - 1, "cuts and the swap", len(s_starts) - 1, "- frames mapped by the clock only")
if A.retime == "on" or (A.retime == "auto" and A.base == "swap"):
    # the generator's clock drifts against the take's (Hyenas, 12 Nov 2026: 97 frames back for 98 sent, the head up to a
    # frame off; his real face then sat on a head drawn a moment earlier: a doubled cap edge and a white line by the ear).
    # Within each scene the swap frame is the one whose picture is nearest the original's, held monotonic.
    g_o = [gray_small(f) for f in orig]; g_s = [gray_small(f) for f in swap]; moved = 0
    for o0, o1 in zip(starts, ends):
        lo, hi = max(0, min(J[o0:o1]) - 2), min(len(swap) - 1, max(J[o0:o1]) + 2); last = lo
        for i in range(o0, o1):
            c = [k for k in range(max(lo, last, J[i] - 2), min(hi, J[i] + 2) + 1)] or [min(hi, max(last, J[i]))]
            k = min(c, key=lambda k: float(np.abs(g_s[k] - g_o[i]).mean()))
            moved += k != J[i]; J[i] = last = k
    print("retimed to the take:", moved, "of", len(orig), "frames paired with a neighbouring swap frame;",
          len(orig) - len(set(J)), "swap frames used twice")
    del g_o, g_s
def jof(i): return J[i]
def scene_of(i): return next(n for n, (a, b) in enumerate(zip(starts, ends)) if a <= i < b)
swap_cat, warp = {}, {}
# raw frames straight into libx264: an intermediate cv2.VideoWriter("mp4v") encode has a 12-frame GOP whose I-frames
# re-quantise the picture differently from the P-frames between them, which read as a pulse every 12 frames at the
# cap (c044, 23 Oct: hat flicker, frame-to-frame diff spikes at frames 12, 24, 36 ... that no input had)
out_p = os.path.join(out_dir, "c033_body_only_swap.mp4")
vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                       "-r", FPS_RATE, "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
                       "-movflags", "+faststart", out_p], stdin=subprocess.PIPE)
face_err = 0; seam_frames = []; redrawn_frames = []
# pass 1: the original's categories and the swap's alignment, frame by frame (the ECC seed carries within a scene)
oc_all = [cats(o, PO(i)) for i, o in enumerate(orig)]
prev_M = np.eye(2, 3, dtype=np.float32)
for i, o in enumerate(orig):
    j = jof(i); oc = oc_all[i]
    if j in warp: continue
    bgmask = cv2.resize(((oc == 0) * 255).astype(np.uint8), None, fx=SC, fy=SC, interpolation=cv2.INTER_NEAREST)
    # a scene cut (a montage has several): the alignment of the previous scene is no seed for this one
    if i > 0 and float(np.abs(gray_small(o) - gray_small(orig[i - 1])).mean()) > 25: prev_M = np.eye(2, 3, dtype=np.float32)
    M = prev_M.copy()
    try:
        _, M = cv2.findTransformECC(gray_small(o), gray_small(swap[j]), M, cv2.MOTION_AFFINE,
                                    (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), bgmask, 5)
    except cv2.error:
        pass
    # the swap is the same picture re-drawn: its alignment is a small correction, never a re-framing. An
    # affine that scales, shears or shifts beyond that has diverged (c041 v2, 29 Oct: the close-up came
    # out as a smeared train) and the frame is used as it is
    if not plausible_affine(M, W * SC, H * SC): M = np.eye(2, 3, dtype=np.float32)
    prev_M = M
    Mf = M.copy(); Mf[:, 2] /= SC
    sw = cv2.warpAffine(swap[j], Mf, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    ps = None
    if M_SWAP is not None:   # the swap's matte travels with the swap frame
        ps = cv2.warpAffine(M_SWAP.alpha[j], Mf, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    warp[j] = sw; swap_cat[j] = cats(sw, ps)
def changed_at(i): return np.abs(orig[i].astype(np.int16) - warp[jof(i)].astype(np.int16)).max(2) > 40
# pass 2: his face per scene. Scenes never borrow from each other; within a scene the subject is the face whose
# clothes the swap changed, strangers and misfits are dropped, gaps are filled from the nearest kept detection and
# the brow / eye rows are median-smoothed over time (a line that jumps a few px between frames flickers the cap's
# underside; c044, 23 Oct)
faces = [None] * len(orig)
def smooth(v):
    v = np.array(v, np.float32)
    return np.array([np.median(v[max(0, k - 4):k + 5]) for k in range(len(v))], np.float32)
for s0, s1 in zip(starts, ends):
    cands = [detect_candidates(orig[k], oc_all[k]) for k in range(s0, s1)]
    det = [pick_subject(c, changed_at(s0 + j)) for j, c in enumerate(cands)]
    if A.base == "swap":
        # a creature or prop swap changes no clothes, so the swap cannot say which face is his: take the largest face
        # in the frame (the performer; a second person in such a shot needs a rule of their own)
        det = [d if d is not None else (max(c, key=lambda f: f[2]) if c else None) for d, c in zip(det, cands)]
    if all(f is None for f in det) and SAM is not None:
        # the landmarker found nobody in this scene (a small or profile face): the face oval, brow and eye rows
        # from a SAM 3 "face" mask inside his matte on the scene's first frame
        fm = SAM.face_mask(orig[s0], (PO(s0) > 0.5) if PO(s0) is not None else None)
        geo = face_geometry_from_mask(fm) if fm is not None else None
        if geo is not None:
            det[0] = geo; sam_face_frames.append(s0)
            print("face from the SAM 3 face mask (landmarker found none): rows brow", round(geo[1]), "eye", round(geo[3]), "height", round(geo[2]))
    tr = track_scene(det)
    if tr[0] is not None:
        sb, se = smooth([f[1] for f in tr]), smooth([f[3] for f in tr])
        tr = [(f[0], float(sb[k]), f[2], float(se[k])) for k, f in enumerate(tr)]
    faces[s0:s1] = tr
    print(f"scene {s0}-{s1 - 1}: his face on {sum(f is not None for f in det)} of {s1 - s0} frames" + ("" if tr[0] is None else f", brow row {round(tr[0][1])}..{round(tr[-1][1])}, face height {round(tr[0][2])}"))
def head_rules(i):
    """Per frame: take_band, take_hat, hat_zone, sw, face, oval_full, below_brow, pts, fh, brow — sw is the swap frame,
    or its copy with the swap's poking head refilled from the hat."""
    j = jof(i); o = orig[i]; oc = oc_all[i]
    sw, sc = warp[j], swap_cat[j]
    fc = faces[i]
    if HEAD_FIT and fc is not None and edge_fit[i] is not None:   # the swap's head rows re-fitted to his face outline (opt-in)
        eo, es = edge_fit[i]; fh = fc[2]
        r0, r1 = max(0, int(fc[1] - 0.9 * fh)), min(H, int(fc[3] + 0.8 * fh))
        mx = x_map(W, H, r0, r1, eo, es, fh); my = np.tile(np.arange(H, dtype=np.float32)[:, None], (1, W))
        sw = cv2.remap(sw, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        sc = cv2.remap(sc, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
    # always original: face skin and hair (beard) of the ORIGINAL; other skin only where the swap shows skin too
    # (hands, neck). Where the swap puts a sleeve over the original bare arm, the sleeve wins.
    face, oval_full, brow, eye_line = (None, None, None, None) if fc is None else (*face_mask(fc, fc[1]), fc[1], fc[3])
    rows = np.arange(H)[:, None]
    below_brow = (rows > brow) if brow is not None else np.ones((H, 1), bool)
    # the band between the brow cut and his upper eyelids: his own pixels, except where the old cap sat. He wears the
    # cap low, so the ORIGINAL black brim reaches the top of his glasses, below the brow cut and inside the face oval,
    # and a horizontal cut cannot separate it from his brows (c044, 24 Oct: Fendi, "there's still some of the old
    # hat ... black space where the hat should be"). In the band, a strongly changed pixel that is dark in the
    # original (the black cap: luminance < 80, grown 3 px) comes from the swap; so does any strongly changed pixel in
    # the top 8 % of the face height (a new brim that sits lower than the old one). Eyes, glasses, nose, mouth, beard
    # stay his.
    changed = np.abs(o.astype(np.int16) - sw.astype(np.int16)).max(2) > 40
    if fc is None: return np.zeros((H, W), bool), np.zeros((H, W), bool), np.zeros((H, W), bool), sw, sc, face, oval_full, below_brow, None, None, None
    pts, fh = fc[0], fc[2]
    band = below_brow & (rows < max(eye_line, brow + 1))
    dark_o = cv2.dilate((cv2.cvtColor(o, cv2.COLOR_RGB2GRAY) < 80).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    top = rows < brow + 0.08 * fh
    take_band = band & changed & (dark_o | top)
    # the NEW hat: a swap pixel the segmenter calls hair / accessory / clothes inside the head box — above the
    # brows, in the brow-to-eyelid band (a brim over his forehead and temples) and below the eyelids OUTSIDE the
    # face oval (a bucket brim hanging beside his ears) — comes from the swap whatever the original shows there:
    # background, forehead, ear, side hair (c041 v2, 1 Nov 2026, Fendi: "you can see through the inner edges
    # around my head"). Eyes, glasses, nose, mouth and beard inside the oval stay his.
    x_lo, x_hi = int(pts[:, 0].min() - 0.5 * fh), int(pts[:, 0].max() + 0.5 * fh)
    head = np.zeros((H, W), bool); head[max(0, int(brow - 0.9 * fh)):min(H, int(eye_line + 0.8 * fh)), max(0, x_lo):min(W, x_hi)] = True
    # the hat zone ends exactly where his protected face begins: the face polygon and his own skin and hair below
    # the brows. A margin grown around the oval here (6 % of the face height, until 2 Nov 2026) left a strip that
    # was neither hat nor protected — 10-15 px of original scene between the brim and his cheek, "the white space
    # where the hat should be" (Fendi, c041 v2 close-up, rows 440-500 at x 226-237)
    oval_protect = oval_full | (np.isin(oc, (1, 3)) & below_brow)
    hat_zone = head & (~below_brow | band | ~oval_protect)
    # the hat by label (accessory 4/5) or by colour: the swap's median hat colour (Lab), a pixel within 12 of it in
    # a+b and not brighter than its L + 50 (the brim's lit underside is the same cloth, lighter). Hair-labelled
    # pixels count only when hat-coloured (a bucket hat is often labelled hair; his beard beside the oval is not).
    # NOT gated on `changed` (2 Nov 2026, eighth): over the forehead the old cap and the new brim are both dark,
    # and a per-pixel "changed" gate mixed the two blacks into a patchwork with a stepped edge that moved every
    # frame — the hat must come from one source wherever the swap shows hat.
    hat_px = (sc == 5) & head
    lab_sw = cv2.cvtColor(sw, cv2.COLOR_RGB2LAB).astype(np.int16)
    if hat_px.sum() > 50:
        hc = np.median(lab_sw[hat_px], axis=0)
        hat_chroma = (np.abs(lab_sw[..., 1] - hc[1]) + np.abs(lab_sw[..., 2] - hc[2]) < 12) & (lab_sw[..., 0] < hc[0] + 50)
    else:
        hat_chroma = np.zeros((H, W), bool)
    take_hat = (np.isin(sc, (4, 5)) | ((sc == 1) & hat_chroma) | (hat_chroma & (lab_sw[..., 0] < 60))) & hat_zone
    # the swap's redrawn head pokes out past his real face (its cheek, ear or neck a few px wider or elsewhere):
    # between the new brim and his cheek the original shows the SCENE and the swap shows ITS skin, and neither
    # belongs there — the gap read as a light outline around his face that jumped with the train (c041 v2,
    # 1 Nov 2026, Fendi). The hat continues: those swap pixels are refilled from the hat around them (every
    # non-hat pixel of the head box is unknown to the fill, so the fill comes from the hat, not from the swap's
    # face) and taken with the hat. His own ear or hair there stays his (the original is not scene).
    poke = np.isin(sc, (2, 3)) & below_brow & ~oval_protect & head & (oc == 0)
    if poke.any() and "gap" not in ABLATE:
        unknown = (np.isin(sc, (2, 3)) & head).astype(np.uint8)
        filled = cv2.inpaint(sw, unknown, 3, cv2.INPAINT_TELEA)
        sw = sw.copy(); sw[poke] = filled[poke]
        take_hat |= poke
    # the hat by its colour too: the segmenter's labels are blocky at a small face (256x256 → 3-px blocks on an
    # 86-px face) and the brim's inner edge came out ragged; a swap pixel in the hat zone within a Lab distance
    # of 18 of the hat's own median colour is hat (the beard is outside the zone, the collar is clothes anyway)
    # the brim's inner edge is closed over 5 px, then gated again
    take_hat = cv2.morphologyEx(take_hat.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool) & hat_zone
    # no gap between the brim and his face: a pixel of the hat zone that lies within 12 % of the face height of
    # BOTH the hat and his face (the oval, his beard and skin) is the gap between them, whatever either frame shows there (a 1-2 px strip of
    # the train stayed between the brim's end and his beard on some frames); it is filled from the hat and taken
    dist_hat = cv2.distanceTransform((~take_hat).astype(np.uint8), cv2.DIST_L2, 3)
    his = oval_protect | (np.isin(oc, (1, 3)) & below_brow)   # his face oval and his own beard and skin below the brows
    dist_face = cv2.distanceTransform((~his).astype(np.uint8), cv2.DIST_L2, 3)
    gap = ~take_hat & hat_zone & (dist_hat + dist_face <= 0.12 * fh) & (dist_hat > 0) & (dist_face > 0)
    if gap.any() and "gap" not in ABLATE:
        unknown = (np.isin(sc, (2, 3)) & head).astype(np.uint8)
        filled = cv2.inpaint(sw, unknown, 3, cv2.INPAINT_TELEA)
        sw = sw.copy(); sw[gap] = filled[gap]
        take_hat |= gap
    return take_band, take_hat, hat_zone, sw, sc, face, oval_full, below_brow, pts, fh, brow

# pass 2b: the swap's head surroundings re-fitted to HIS face outline (head_fit.py). Per frame the face-skin edges
# of both faces between the eye and mouth rows, median-smoothed over +-2 frames of the scene; head_rules remaps
# the swap's head rows with them, so the brim and collar meet his real cheek and jaw (c041 v2 close-up, 2 Nov 2026:
# the generator's face was 9 % wider, its brim flared off his cheek and its jaw showed beside his beard).
edge_fit = [None] * len(orig)
for s0, s1 in zip(starts, ends):
    if not HEAD_FIT: break
    per = {}
    for k in range(s0, s1):
        fc = faces[k]
        if fc is None: continue
        j = jof(k); fh = fc[2]; r_eye = int(fc[3] + 0.15 * fh); r_mouth = int(fc[3] + 0.5 * fh)   # nose to mouth: below the glasses
        got = fit_edges(oc_all[k] == 3, swap_cat[j] == 3, r_eye, r_mouth, fh)
        if got is not None: per[k] = got
    for k in range(s0, s1):
        if faces[k] is None or not per: continue
        near = [q for q in per if abs(q - k) <= 3] or [min(per, key=lambda q: abs(q - k))]
        eo = np.median(np.stack([per[q][0] for q in near]), axis=0); es = np.median(np.stack([per[q][1] for q in near]), axis=0)
        edge_fit[k] = (eo, es)
    if per:
        k0 = min(per); eo, es = per[k0]; r = int(faces[k0][3] + 0.2 * faces[k0][2])
        print(f"scene {s0}-{s1 - 1}: swap face edges fitted to his on {len(per)} of {s1 - s0} frames (row {r}: his {eo[r, 0]:.0f}..{eo[r, 1]:.0f}, the swap's {es[r, 0]:.0f}..{es[r, 1]:.0f})")
# pass 3: every frame's hat decision first, so each frame's can be steadied against its neighbours' in the same
# scene (majority of frame-1, frame, frame+1): the swap's redrawn head outline differs a little every frame and
# the brim's shape beside his cheek wobbled with it (c041 v2, 2 Nov 2026, Fendi: "flickers as the train moves")
hat_bits = [np.packbits(head_rules(i)[1]) for i in range(len(orig))]
def hat_of(k): return np.unpackbits(hat_bits[k])[:H * W].reshape(H, W).astype(np.uint8)
for i, o in enumerate(orig):
    j = jof(i); oc = oc_all[i]; sc = swap_cat[j]; sw = warp[j]
    take_band, take_hat, hat_zone, swh, sch, face, oval_full, below_brow, pts, fh, brow = head_rules(i)
    take_hat_pre = take_hat
    changed = changed_at(i); fc = faces[i]
    if fc is not None:
        nb = [k for k in (i - 1, i, i + 1) if 0 <= k < len(orig) and scene_of(k) == scene_of(i)]
        votes = sum(hat_of(k) for k in nb)
        if "vote" not in ABLATE: take_hat = (votes * 2 >= len(nb)) & hat_zone
    protect = (((oc == 3) & below_brow) | ((oc == 1) & below_brow)) & ~take_band & ~take_hat | ((oc == 2) & (sc == 2) & ~take_hat)
    if face is not None: protect |= face & ~take_band & ~take_hat
    # on his head everything comes from the re-fitted swap: the new hat, the old cap's band, and above the brows
    # anything labelled hair/accessory in either frame or any non-background pixel of the box over the head
    above_brow = ~below_brow
    on_head = take_hat | take_band | ((np.isin(oc, (1, 5)) | np.isin(sch, (1, 5))) & above_brow)
    if fc is not None:
        x_lo, x_hi = int(pts[:, 0].min() - 0.35 * fh), int(pts[:, 0].max() + 0.35 * fh)
        y_lo = int(brow - 0.9 * fh)
        box = np.zeros((H, W), bool); box[max(0, y_lo):int(brow), max(0, x_lo):min(W, x_hi)] = True
        # + anything that differs from the swap beyond video noise: the old cap's rim the segmenter missed, a faint
        # strand outside the new crown against the dark ceiling (eighth, 2 Nov 2026: 30-40 luminance, under the
        # 40 'changed' gate and labelled scene by both)
        # ... only where one side is dark (the old cap's rim, or the new hat's edge): a bright-on-bright difference
        # is the generator's re-rendered scene and must not be imported (ninth, 2 Nov 2026: this rule alone took
        # ~1,500 px/frame on the close-up, ~210 of them bright on both sides = the swap's own window glow; the tenth
        # takes 1 such px/frame, hat shape and ring flicker unchanged)
        dark_either = (cv2.cvtColor(o, cv2.COLOR_RGB2GRAY) < 90) | (cv2.cvtColor(swh, cv2.COLOR_RGB2GRAY) < 90)
        on_head |= box & ((oc != 0) | (sch != 0) | ((np.abs(o.astype(np.int16) - swh.astype(np.int16)).max(2) > 20) & dark_either))
        # and the swap's clothes within the head rows (the collar against his jaw) are read re-fitted too
        on_head |= np.isin(sch, (4, 5)) & hat_zone
    clothes = np.isin(oc, (4, 5)) | np.isin(sc, (4, 5)) | on_head
    # where the original garment reaches past the new one (a bigger shoe, a longer hem) the swap shows floor or
    # wall there; the segmenter can miss a dark shoe on a dark floor, so any strong change next to him that is not
    # protected is taken from the swap too (c044, 23 Oct: the original black toe showed under the cream sneaker)
    near = cv2.dilate(((oc != 0) | (sc != 0)).astype(np.uint8), np.ones((31, 31), np.uint8)).astype(bool)
    overshoot = changed & near
    # ... but never the SCENE around his face, and never the scene at all when the generator re-rendered it: with a
    # moving train behind him every pixel next to his silhouette is "changed", and the band took the swap's train
    # beside his original face — an outline that flickers as the train moves (c041 v2, 1 Nov 2026, Fendi). A
    # frame whose far background (both segmenters: scene, outside the band) changed on more than 10 % of its pixels
    # is a re-rendered scene: there the band keeps only pixels one of the segmenters calls him. Around the face
    # (the oval grown 30 % of the face height) the band never applies: no garment overshoots there, the hat has
    # its own rules, and the scene is the original's.
    both_bg = (oc == 0) & (sc == 0)
    far = both_bg & ~near
    if far.any() and float(changed[far].mean()) > 0.10:
        overshoot &= ~both_bg; redrawn_frames.append(i)
    if fc is not None:
        g2 = 2 * int(0.3 * fh) + 1
        overshoot &= ~cv2.dilate(oval_full.astype(np.uint8), np.ones((g2, g2), np.uint8)).astype(bool)
    clothes |= overshoot
    # the protected region stops at his real silhouette (silhouette.py): its outer 4 px are kept only where the
    # pixel is nearer his skin and hair than the scene. What that drops next to the hat or the coat is theirs.
    # Then the feather: the hat's alpha is blurred with the face counted as covered, so it is not diluted against
    # the protected zeros — a 2-3 px blend of hat and scene ran along the whole head (c041 v2, 2 Nov 2026: the
    # pale contour between head and brim; traced on frame 84, rows 470 and 500, present in every version).
    protect_wide = protect
    protect = refine_silhouette(protect, o, band=4)
    dropped = protect_wide & ~protect
    clothes |= dropped & (cv2.dilate(clothes.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
    if A.base == "swap": clothes = ~protect            # everything but his protected pixels is the swap's
    m = (clothes & ~protect).astype(np.float32)
    m = cv2.GaussianBlur(np.maximum(m, protect.astype(np.float32)), (0, 0), 2.0)
    m[protect] = 0.0                                       # no feather leaks onto the face or hands
    src = np.where(on_head[..., None], swh, sw)
    out = (o.astype(np.float32) * (1 - m[..., None]) + src.astype(np.float32) * m[..., None]).round().clip(0, 255).astype(np.uint8)
    # the painted edge touching his face is mixed half with the face pixels beside it: the matte's anti-alias
    # against the layer beneath, which is his face, not the scene (the hat-to-skin step was one pixel and 86
    # luminance where the take's own edges span two; eighth, 2 Nov 2026). His pixels are untouched.
    edge = (m > 0.5) & (cv2.dilate(protect.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~protect
    if edge.any():
        face_nb, ok = masked_mean(o, protect, 3)
        sel = edge & ok
        out[sel] = (0.5 * out[sel].astype(np.float32) + 0.5 * face_nb[sel]).round().clip(0, 255).astype(np.uint8)
    face_err = max(face_err, int(np.abs(out[protect].astype(int) - o[protect].astype(int)).max()) if protect.any() else 0)
    vw.stdin.write(np.ascontiguousarray(out).tobytes())
    if i in (0, 60, 120, 180, 239) or i in DUMP:
        if i in DUMP:   # env AVT_DUMP="82,90": the masks behind a frame, for a diagnosis
            pal = np.array([[0, 0, 0], [255, 0, 255], [150, 200, 255], [60, 120, 255], [255, 180, 0], [0, 255, 0]], np.uint8)
            np.savez_compressed(os.path.join(out_dir, f"dump_{i:03d}.npz"), oc=oc, sc=sc, take_hat=take_hat, take_band=take_band, protect=protect, clothes=clothes, m=m, hat_zone=hat_zone if fc is not None else np.zeros((H, W), bool), on_head=on_head, swh=swh, sw=sw, take_hat_pre=take_hat_pre, oval_full=oval_full if oval_full is not None else np.zeros((H, W), bool), eo=edge_fit[i][0] if edge_fit[i] is not None else np.zeros((0, 2), np.float32), es=edge_fit[i][1] if edge_fit[i] is not None else np.zeros((0, 2), np.float32))
        cv2.imwrite(os.path.join(out_dir, f"mask_{i:03d}.png"), (m * 255).astype(np.uint8))
        if M_ORIG is not None: cv2.imwrite(os.path.join(out_dir, f"person_{i:03d}.png"), (M_ORIG.alpha[i] * 255).astype(np.uint8))
vw.stdin.close()
if vw.wait() != 0: raise SystemExit("ffmpeg encode failed")
print("frames", len(orig), "swap frames aligned", len(warp), "max |out-original| on face/hair/skin:", face_err)
print("scene re-rendered by the generator (overshoot band limited to him) on", len(redrawn_frames), "frames")
if SAM is not None: print("segmenter sam3: face geometry from the SAM 3 face mask on", len(sam_face_frames), "lookups")
