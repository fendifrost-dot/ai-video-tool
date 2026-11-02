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

MODELS = os.environ.get("AVT_MODELS", "models")  # selfie_multiclass_256x256.tflite + face_landmarker.task
ap = argparse.ArgumentParser(description="Body-only clothing swap: clothes from the Genjutsu output, everything else from the ORIGINAL pixels.")
ap.add_argument("original"); ap.add_argument("swap"); ap.add_argument("out_dir")
add_segmenter_args(ap)
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
def jof(i): return min(len(swap) - 1, int(round(i / FPS * SFPS)))
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
diffs = [0.0] + [float(np.abs(gray_small(orig[k]) - gray_small(orig[k - 1])).mean()) for k in range(1, len(orig))]
starts = scene_starts(diffs); ends = starts[1:] + [len(orig)]
faces = [None] * len(orig)
def smooth(v):
    v = np.array(v, np.float32)
    return np.array([np.median(v[max(0, k - 4):k + 5]) for k in range(len(v))], np.float32)
for s0, s1 in zip(starts, ends):
    det = [pick_subject(detect_candidates(orig[k], oc_all[k]), changed_at(k)) for k in range(s0, s1)]
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
for i, o in enumerate(orig):
    j = jof(i); oc = oc_all[i]
    sw, sc = warp[j], swap_cat[j]
    # always original: face skin and hair (beard) of the ORIGINAL; other skin only where the swap shows skin too
    # (hands, neck). Where the swap puts a sleeve over the original bare arm, the sleeve wins.
    fc = faces[i]
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
    changed = changed_at(i)
    if fc is not None:
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
        g = 2 * int(0.06 * fh) + 1
        oval_protect = cv2.dilate(oval_full.astype(np.uint8), np.ones((g, g), np.uint8)).astype(bool)
        hat_zone = head & (~below_brow | band | ~oval_protect)
        take_hat = np.isin(sc, (1, 4, 5)) & changed & hat_zone
        # the swap's redrawn head pokes out past his real face (its cheek, ear or neck a few px wider or elsewhere):
        # between the new brim and his cheek the original shows the SCENE and the swap shows ITS skin, and neither
        # belongs there — the gap read as a light outline around his face that jumped with the train (c041 v2,
        # 1 Nov 2026, Fendi). The hat continues: those swap pixels are refilled from the hat around them (every
        # non-hat pixel of the head box is unknown to the fill, so the fill comes from the hat, not from the swap's
        # face) and taken with the hat. His own ear or hair there stays his (the original is not scene).
        poke = np.isin(sc, (2, 3)) & below_brow & ~oval_protect & head & (oc == 0)
        if poke.any():
            unknown = (~np.isin(sc, (1, 4, 5)) & head).astype(np.uint8)
            filled = cv2.inpaint(sw, unknown, 3, cv2.INPAINT_TELEA)
            sw = sw.copy(); sw[poke] = filled[poke]
            take_hat |= poke
        # the hat by its colour too: the segmenter's labels are blocky at a small face (256x256 → 3-px blocks on an
        # 86-px face) and the brim's inner edge came out ragged; a swap pixel in the hat zone within a Lab distance
        # of 18 of the hat's own median colour is hat (the beard is outside the zone, the collar is clothes anyway)
        hat_px = np.isin(sc, (1, 5)) & head
        if hat_px.sum() > 50:
            lab_sw = cv2.cvtColor(sw, cv2.COLOR_RGB2LAB).astype(np.int16)
            hc = np.median(lab_sw[hat_px], axis=0)
            take_hat |= (np.abs(lab_sw - hc).sum(2) < 18) & hat_zone & changed
        # the brim's inner edge is closed over 5 px, then gated again
        take_hat = cv2.morphologyEx(take_hat.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool) & hat_zone
    else:
        take_band = take_hat = np.zeros((H, W), bool)
    protect = (((oc == 3) & below_brow) | ((oc == 1) & below_brow)) & ~take_band & ~take_hat | ((oc == 2) & (sc == 2) & ~take_hat)
    if face is not None: protect |= face & ~take_band & ~take_hat
    clothes = np.isin(oc, (4, 5)) | np.isin(sc, (4, 5)) | take_hat
    # the cap: anything labelled hair/accessory above the brow line, in either frame, comes from the swap
    above_brow = ~below_brow
    clothes |= (np.isin(oc, (1, 5)) | np.isin(sc, (1, 5))) & above_brow
    if fc is not None:   # cap box: above the brows, over the head; any non-background pixel comes from the swap
        x_lo, x_hi = int(pts[:, 0].min() - 0.35 * fh), int(pts[:, 0].max() + 0.35 * fh)
        y_lo = int(brow - 0.9 * fh)
        box = np.zeros((H, W), bool); box[max(0, y_lo):int(brow), max(0, x_lo):min(W, x_hi)] = True
        clothes |= box & ((oc != 0) | (sc != 0))
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
    m = (clothes & ~protect).astype(np.float32)
    m = cv2.GaussianBlur(m, (0, 0), 2.0)
    m[protect] = 0.0                                       # no feather leaks onto the face or hands
    out = (o.astype(np.float32) * (1 - m[..., None]) + sw.astype(np.float32) * m[..., None]).round().clip(0, 255).astype(np.uint8)
    face_err = max(face_err, int(np.abs(out[protect].astype(int) - o[protect].astype(int)).max()) if protect.any() else 0)
    vw.stdin.write(np.ascontiguousarray(out).tobytes())
    if i in (0, 60, 120, 180, 239):
        cv2.imwrite(os.path.join(out_dir, f"mask_{i:03d}.png"), (m * 255).astype(np.uint8))
        if M_ORIG is not None: cv2.imwrite(os.path.join(out_dir, f"person_{i:03d}.png"), (M_ORIG.alpha[i] * 255).astype(np.uint8))
vw.stdin.close()
if vw.wait() != 0: raise SystemExit("ffmpeg encode failed")
print("frames", len(orig), "swap frames aligned", len(warp), "max |out-original| on face/hair/skin:", face_err)
print("scene re-rendered by the generator (overshoot band limited to him) on", len(redrawn_frames), "frames")
if SAM is not None: print("segmenter sam3: face geometry from the SAM 3 face mask on", len(sam_face_frames), "lookups")
