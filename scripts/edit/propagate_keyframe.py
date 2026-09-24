#!/usr/bin/env python3
"""
Keyframe propagation — carry ONE approved garment realisation (a hero frame) across the real
performance with dense optical flow, instead of letting a generator re-sample the garment on
every cut. This is the locked Architecture C lane (docs/VIDEO_SWAP_ARCHITECTURE.md §3:
approve hero keyframes → PROPAGATE → re-anchor on flow break → composite onto the original →
deterministic brand layer) run as a $0 CPU worker outside the edge runtime.

  python3 scripts/edit/propagate_keyframe.py --master cuts/S06_master.mp4 --edit s06_edit.mp4 \\
      --hero-frame 40 --out-dir prop/S06 [--size 720x1280 --fps 24] [--conf 0.6] [--span 80]

Inputs
  --master      the real footage for the shot (any raster/fps; resampled to --size/--fps)
  --edit        where the hero garment comes from: a wardrobe edit of the SAME footage, frame-
                aligned from t=0 (the xAI /videos/edits output is). The garment region is found
                automatically as "what the edit changed" (Lab difference vs the master), so no
                hand mask is needed. Alternatively --hero-image + --hero-mask for a still hero.
  --hero-frame  index of the approved frame in the edit (the canonical garment realisation)
Method
  1. DIS dense flow between consecutive master frames, both directions.
  2. Chained backward mapping from every frame to the hero frame (bilinear-resampled maps), with
     the forward–backward error ACCUMULATED along the chain as a drift estimate and gated into a
     confidence map. Occluders (an arm crossing the chest), fast motion and flow breaks show up
     as low confidence; the distance one hero can cover is the re-anchor cadence.
  3. The hero garment is remapped into each frame; its shading is re-lit from the master's own
     low-frequency luminance change (folds/self-shadow follow the real footage).
  4. Composite onto the master where confidence ≥ --conf; where the garment mask is present but
     confidence is low the EDIT frame is used (honest fallback, counted in the QA) — never an
     invented pixel.
  5. QA per frame: confidence in the garment, fallback fraction, flow-compensated temporal
     residual for BOTH the propagated result and the edit (lower = more stable), and generator
     drift = how far the edit's garment is from the propagated hero garment in the same frame.
Outputs
  <out>/propagated.mp4, <out>/compare.mp4 (master | edit | propagated), <out>/qa.json,
  <out>/qa_sheet.jpg, <out>/hero_mask.png
Garment-BODY propagation (2026-09-24, the Architecture C smoke on S08; results doc section
"Architecture C garment propagation on S08"):
  --anchor/--anchor-master   heroes are SELECTED by construction truth (construction_score
                             against the approved Look-on-artist frame): the canonical hero is
                             the best-scoring edit frame, re-anchors every --hero-cadence frames
                             prefer frames that score well AND agree with the canonical zone map.
  --blend                    between two heroes both garments are carried, registered to each
                             other by a smooth field (composed into the chain maps: ONE resample),
                             glided from A's geometry to B's and cross-faded — no ownership pop at
                             the midpoint. --disagree-thresh: where the registered warps still
                             disagree the edit shows. --speed-ok/--speed-w: fast motion counts as
                             drift (hands flicking across the chest are not painted over).
  --relight-source edit      shading comes from the accepted edit's own garment at that frame
                             (mask-normalised σ21 luminance ratio), not from the camo master.
  --protect-skin             anatomy owns the foreground: garment-colour gate on the edit frame
                             (--garment-gate), "untouched by the edit" pixels, YCrCb skin minus
                             garment colours, occluder residual on the master (--occl-thresh).
  --harmonise                carry the CANONICAL hero's texture to every re-anchor hero hop by
                             hop (maps composed, one resample, registered, photometrically
                             VERIFIED against the hero's own garment, relit) so the whole shot
                             would propagate one realisation. Measured limit: canonical coverage
                             0.5 after one hop, ≈0 after three (S08 and S11) — dense-flow chains
                             cannot transport one texture across a 7 s performance with crossing
                             arms; see the results doc for the ruling.
  QA additions               per-frame sharpness_ratio (Laplacian energy vs the edit inside the
                             painted garment), per-frame temporal_residual(_edit), owners,
                             hero_selection, harmonisation coverage per hero.
Kill criterion (VIDEO_SWAP_ARCHITECTURE.md §7): identity, exact construction, stripe/logo
placement, natural occlusion, no flicker/morphing on a 2–4 s test. Identity and construction
are inherited by construction here (real face pixels, one garment sample); occlusion and
flicker are what the QA numbers measure.
"""
import argparse, json, os, subprocess, sys, tempfile
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "qa"))

def decode(path, W, H, fps):
    tmp = tempfile.mkdtemp(prefix="avt_prop_")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", f"scale={W}:{H}:flags=lanczos,fps={fps}", os.path.join(tmp, "f_%05d.png")], check=True)
    files = sorted(f for f in os.listdir(tmp) if f.startswith("f_"))
    frames = [cv2.imread(os.path.join(tmp, f)) for f in files]
    for f in files: os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    return frames

def garment_mask_from_edit(master, edit, thr=18.0, min_frac=0.004):
    """What the edit changed: Lab distance (blurred) between edit and master, cleaned."""
    a = cv2.GaussianBlur(cv2.cvtColor(master, cv2.COLOR_BGR2LAB), (0, 0), 2).astype(np.float32)
    b = cv2.GaussianBlur(cv2.cvtColor(edit, cv2.COLOR_BGR2LAB), (0, 0), 2).astype(np.float32)
    d = np.sqrt(((a - b) ** 2).sum(axis=2))
    m = (d > thr).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m); area = m.shape[0] * m.shape[1]
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_frac * area: keep[lab == i] = 255
    # fill holes (lettering, zip pull) so the garment is one surface
    ff = keep.copy(); h, w = ff.shape; mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 255); keep = keep | cv2.bitwise_not(ff)
    return keep

def person_alpha(frames_bgr, model_path=os.path.expanduser("~/.cache/avt/rvm_mobilenetv3_fp32.onnx")):
    """RobustVideoMatting alphas for a few single frames (recurrent state reset per frame).
    Used to keep a minted still's garment INSIDE the real silhouette of its master frame: if the
    generator moved an arm, that sleeve must never be painted onto the background."""
    import onnxruntime as ort, tempfile as tf
    if not os.path.exists(model_path):
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        subprocess.run(["curl", "-sSL", "-o", model_path, "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"], check=True)
    sess = ort.InferenceSession(model_path); out = []
    for f in frames_bgr:
        rec = [np.zeros([1, 1, 1, 1], np.float32)] * 4
        src = (cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
        _, pha, *_ = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": np.array([0.4], np.float32)})
        out.append(pha[0, 0].astype(np.float32))
    return out

def head_exclusion(person_alpha_map, head_frac=0.17):
    """Rows from the top of the real silhouette down by head_frac of the frame height, as a mask
    to keep OUT of any hero garment mask: a generator's re-rendered head must never be carried
    onto the footage, whatever the diff says. (Face detectors were tried and are not reliable on
    this footage — cap + glasses + motion blur — so the rule is geometric and person-agnostic.)"""
    m = np.zeros(person_alpha_map.shape, np.uint8)
    rows = np.where((person_alpha_map > 0.5).any(axis=1))[0]
    if len(rows) == 0: return m
    top = int(rows.min()); m[top:top + int(head_frac * m.shape[0]), :] = 255
    return m

def dis():
    d = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    d.setUseSpatialPropagation(True); d.setFinestScale(1)
    return d

def flow_pair(engine, g0, g1):
    """flow such that g0(p) ≈ g1(p + flow(p))  (i.e. maps frame0 coords → frame1 coords)."""
    return engine.calc(g0, g1, None)

def remap(img, mapx, mapy, border=cv2.BORDER_REFLECT):
    return cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR, borderMode=border)

def chain(grays, hero, direction, drift_ok=2.0, drift_bad=8.0, median_px=9, speed_ok=10.0, speed_w=0.5):
    """For frames hero+direction, hero+2*direction, … build the map (mapx, mapy) that sends each
    pixel of frame k to its position in the HERO frame, and a confidence in [0,1].
    Confidence is derived from the ACCUMULATED forward–backward error along the chain (a drift
    estimate in px), gated softly between drift_ok and drift_bad, and spatially median-filtered
    so a noisy pixel does not punch a hole in an otherwise consistent surface. A genuine break
    (occluder, blur) adds several px in one step and zeroes the pixel; sub-pixel fabric noise
    accumulates slowly, so a good chain survives tens of frames."""
    engine = dis(); h, w = grays[0].shape
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    mapx, mapy = gx.copy(), gy.copy(); drift = np.zeros((h, w), np.float32)
    out = {}
    k = hero
    while True:
        j = k + direction
        if j < 0 or j >= len(grays): break
        f_jk = flow_pair(engine, grays[j], grays[k])          # frame j coords → frame k coords
        f_kj = flow_pair(engine, grays[k], grays[j])          # for the consistency check
        px, py = gx + f_jk[..., 0], gy + f_jk[..., 1]         # where j's pixels sit in k
        back = remap(f_kj, px, py)                            # k→j flow sampled there
        fb_err = np.sqrt((f_jk[..., 0] + back[..., 0]) ** 2 + (f_jk[..., 1] + back[..., 1]) ** 2)
        # compose: j → k → … → hero
        mapx, mapy = remap(mapx, px, py), remap(mapy, px, py)
        # fast motion (a hand flicking across the chest) is where flow fails silently and where the
        # real footage is motion-blurred anyway: every px/frame above speed_ok counts as drift
        speed = np.sqrt(f_jk[..., 0] ** 2 + f_jk[..., 1] ** 2)
        drift = remap(drift, px, py) + fb_err + speed_w * np.maximum(0.0, speed - speed_ok)
        inside = (mapx >= 0) & (mapx < w - 1) & (mapy >= 0) & (mapy < h - 1)
        drift = np.where(inside, drift, drift_bad * 2).astype(np.float32)
        conf = np.clip((drift_bad - drift) / (drift_bad - drift_ok), 0.0, 1.0).astype(np.float32)
        if median_px and median_px > 1: conf = cv2.medianBlur((conf * 255).astype(np.uint8), median_px | 1).astype(np.float32) / 255.0
        out[j] = (mapx.copy(), mapy.copy(), conf)
        k = j
    return out

def relight(garment_hero_in_k, master_k, master_hero_in_k, mask_k, sigma=9.0):
    """Multiply the propagated garment by the master's own low-frequency luminance change
    (master_k / warped master_hero) so folds and self-shadowing follow the real footage."""
    Lk = cv2.GaussianBlur(cv2.cvtColor(master_k, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32), (0, 0), sigma)
    Lh = cv2.GaussianBlur(cv2.cvtColor(master_hero_in_k, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32), (0, 0), sigma)
    ratio = np.clip((Lk + 2.0) / (Lh + 2.0), 0.6, 1.5)
    lab = cv2.cvtColor(garment_hero_in_k, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] = np.clip(lab[..., 0] * ratio, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

def relight_to_edit(garment_hero_in_k, edit_k, mask_k, sigma=21.0):
    """Give the propagated garment the accepted edit's OWN low-frequency shading at this frame
    (the edit's garment is the same Look on the same body, so its lighting follows the real
    performance without the master garment's pattern printing through). Construction, texture,
    graphics stay the hero's; only the mask-normalised blurred luminance ratio changes."""
    m = (mask_k > 0.5).astype(np.float32)
    def lowpass(img):
        L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
        num = cv2.GaussianBlur(L * m, (0, 0), sigma); den = cv2.GaussianBlur(m, (0, 0), sigma)
        return np.where(den > 1e-3, num / np.maximum(den, 1e-3), L)
    ratio = np.clip((lowpass(edit_k) + 2.0) / (lowpass(garment_hero_in_k) + 2.0), 0.6, 1.5)
    lab = cv2.cvtColor(garment_hero_in_k, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] = np.clip(lab[..., 0] * ratio, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)

def temporal_residual(frames, flows_fwd, masks):
    """Flow-compensated residual between consecutive frames inside the garment: |I_k − warp(I_{k-1})|."""
    res = []
    h, w = frames[0].shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    for k in range(1, len(frames)):
        f = flows_fwd.get(k)  # k → k-1
        if f is None or masks[k] is None: res.append(None); continue
        prev_in_k = remap(frames[k - 1], gx + f[..., 0], gy + f[..., 1])
        d = np.abs(frames[k].astype(np.float32) - prev_in_k.astype(np.float32)).mean(axis=2)
        m = masks[k] > 0
        res.append(float(d[m].mean()) if m.sum() > 100 else None)
    return res

def garment_colour_centres(img, mask, k=4):
    """k-means Lab centres of the hero garment — what "garment-coloured" means for this Look."""
    px = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)[mask > 0].reshape(-1, 3)
    if len(px) < 200: return None
    if len(px) > 40000: px = px[np.random.default_rng(0).choice(len(px), 40000, replace=False)]
    _, _, centres = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    return centres


def not_garment_coloured(im, garment_centres, radius=20.0, k=6):
    """Pixels of the ACCEPTED EDIT frame that are not any of the Look's garment colours (Lab
    distance to every k-means centre > radius, k centres so band, body, shadow and highlight are
    all covered): hands, face, neck, the shirt and tie, props, background. Anatomy owns the
    foreground, so the propagated garment is never painted there — a performer-independent test
    (no skin chroma box) that also leaves the edit's non-garment pixels alone."""
    L = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3)
    d = np.min(np.stack([np.sqrt(0.5 * (L[:, 0] - c[0]) ** 2 + (L[:, 1] - c[1]) ** 2 + (L[:, 2] - c[2]) ** 2) for c in garment_centres], axis=1), axis=1).reshape(im.shape[:2])
    m = cv2.morphologyEx((d > radius).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0

def skin_mask(im, garment_centres=None, radius=26.0):
    """Foreground anatomy owns its pixels: a YCrCb skin box, minus anything garment-coloured
    (a sand/mastic jacket sits inside the generic skin chroma box — on S08 it covered 77 % of
    the garment), opened and dilated. Hands crossing the chest, the neck and the face are never
    painted over by the propagated garment."""
    ycc = cv2.cvtColor(im, cv2.COLOR_BGR2YCrCb)
    m = cv2.inRange(ycc, (0, 133, 77), (255, 173, 127)) > 0
    if garment_centres is not None:
        L = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32).reshape(-1, 3)
        d = np.min(np.stack([np.sqrt(0.5 * (L[:, 0] - c[0]) ** 2 + (L[:, 1] - c[1]) ** 2 + (L[:, 2] - c[2]) ** 2) for c in garment_centres], axis=1), axis=1).reshape(im.shape[:2])
        m = m & (d > radius)
    m = cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0


def select_heroes(master, edit, anchor_path, anchor_master_path, cadence, min_score, consistency_w=1.0, step=1):
    """Choose the canonical hero and the re-anchor heroes from the EDIT by garment truth, not by
    hand: every frame is scored against the approved anchor with construction_score (stripe
    landmark, garment-relative zones, foreign-class intrusion); the canonical hero is the best
    frame; then, walking outward in windows of `cadence`, each window's hero is the frame that
    maximises  score − consistency_w · (zone-histogram distance to the canonical hero)  — i.e.
    the frame that is both true to the anchor AND the same realisation as the canonical hero —
    provided it clears `min_score`. Returns (heroes, per-frame table)."""
    import construction_score as C
    W, H = master[0].shape[1], master[0].shape[0]
    anchor = cv2.resize(cv2.imread(anchor_path), (W, H), interpolation=cv2.INTER_AREA); amaster = cv2.resize(cv2.imread(anchor_master_path), (W, H), interpolation=cv2.INTER_AREA)
    amask = C.garment_mask(amaster, anchor); centres, _ = C.learn_classes(anchor, amask, 6); acls = C.classify(anchor, centres, 28.0)
    alm = C.landmark(acls, amask, list(range(len(centres))), 0.12, 0.25, (0.12, 0.7))
    if alm is None: raise SystemExit("anchor: no stripe landmark")
    azs = C.zones_for(amask, alm); ahists = {z: C.zone_hist(acls, azs[z], len(centres)) for z in C.ZONES}
    table = {}
    for k in range(0, len(edit), step):
        m = C.garment_mask(master[k], edit[k])
        if (m > 0).sum() < 2000: continue
        r, cls, zs = C.score_frame(edit[k], m, centres, 28.0, [alm["class"]], ahists, 0.12, 0.25, (0.12, 0.7))
        if r["landmark"] is None: continue
        hists = {z: C.zone_hist(cls, zs[z], len(centres)) for z in C.ZONES}
        table[k] = {"score": float(r["score"]), "zones": r["zones"], "hists": hists}
    if not table: raise SystemExit("no frame of the edit could be scored")
    canon = max(table, key=lambda k: table[k]["score"])
    def dist(k):
        d = []
        for z in C.ZONES:
            a_, b_ = table[canon]["hists"][z], table[k]["hists"][z]
            if a_ is not None and b_ is not None: d.append(0.5 * float(np.abs(a_ - b_).sum()))
        return float(np.mean(d)) if d else 1.0
    n = len(edit); heroes = {canon}
    for direction in (+1, -1):
        edge = canon
        while True:
            lo, hi = (edge + 1, min(n, edge + cadence + 1)) if direction > 0 else (max(0, edge - cadence), edge)
            if lo >= hi: break
            far = (range(lo + cadence // 2, hi) if direction > 0 else range(lo, hi - cadence // 2))
            cands = [k for k in far if k in table and table[k]["score"] >= min_score]
            if not cands: cands = [k for k in range(lo, hi) if k in table and table[k]["score"] >= min_score]
            if not cands:
                edge = hi - 1 if direction > 0 else lo
                if (direction > 0 and edge >= n - 1) or (direction < 0 and edge <= 0): break
                continue
            best = max(cands, key=lambda k: table[k]["score"] - consistency_w * dist(k))
            if min(abs(best - h_) for h_ in heroes) >= max(3, cadence // 3): heroes.add(best)
            edge = best if best != edge else (hi - 1 if direction > 0 else lo)
            if (direction > 0 and best >= n - 1) or (direction < 0 and best <= 0): break
    per = {k: {"score": v["score"], "dist_to_canonical": dist(k)} for k, v in table.items()}
    return canon, sorted(heroes), per


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True); ap.add_argument("--edit", default=None)
    ap.add_argument("--hero-image", default=None); ap.add_argument("--hero-mask", default=None)
    ap.add_argument("--hero-stills", default=None, help="comma list of frame:path — minted stills (one garment realisation) aligned to those master frames; the garment mask is what each still changed vs its master frame")
    ap.add_argument("--hero-frame", type=int, default=None); ap.add_argument("--hero-frames", default=None, help="comma list of hero frame indices (re-anchor cadence); each frame is carried from its NEAREST hero")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--conf", type=float, default=0.6, help="min propagation confidence to use the hero garment")
    ap.add_argument("--span", type=int, default=10 ** 6, help="max frames to propagate each side of the hero")
    ap.add_argument("--feather", type=float, default=2.0); ap.add_argument("--no-relight", action="store_true")
    ap.add_argument("--head-frac", type=float, default=0.17, help="still heroes: fraction of frame height below the silhouette top that is never taken from a still (the head)")
    ap.add_argument("--anchor", default=None, help="approved Look-on-artist frame: with --anchor-master, heroes are SELECTED by construction truth (see select_heroes)")
    ap.add_argument("--anchor-master", default=None); ap.add_argument("--hero-cadence", type=int, default=16, help="max frames between re-anchor heroes when selecting by truth")
    ap.add_argument("--hero-min-score", type=float, default=0.6); ap.add_argument("--consistency-w", type=float, default=1.0)
    ap.add_argument("--overlap", action="store_true", help="every hero's chain reaches its neighbour heroes; each pixel takes the hero with the higher chain confidence (one persistent garment, no owner seams)")
    ap.add_argument("--blend", action="store_true", help="between two heroes, carry BOTH neighbouring heroes' garments, register the far one onto the near one and cross-fade by temporal distance (no owner pop at the midpoint; generator drift between heroes becomes a gradual morph)")
    ap.add_argument("--interp", choices=["linear", "cubic", "lanczos"], default="cubic", help="resampling of the hero garment image (masks and maps stay linear)")
    ap.add_argument("--harmonise", action="store_true", help="carry the CANONICAL hero's garment texture to every re-anchor hero (maps composed hero-to-hero, one resample, registered, relit) so the whole shot propagates ONE realisation; heroes keep their own geometry")
    ap.add_argument("--harmonise-min-conf", type=float, default=0.5, help="--harmonise: chain confidence floor for one hop (verification, not the chain, decides)")
    ap.add_argument("--verify-thresh", type=float, default=30.0, help="--harmonise: mean RGB residual (σ3) between the carried, relit canonical texture and the hero's own garment above which the carry is rejected there")
    ap.add_argument("--blend-relight-sigma", type=float, default=9.0, help="--blend: blur of the per-hero relight applied BEFORE mixing (equalises the two heroes' shading at patch scale)")
    ap.add_argument("--disagree-thresh", type=float, default=25.0, help="--blend: mean RGB difference between the two registered warps above which neither is painted (the edit shows); 0 disables")
    ap.add_argument("--speed-ok", type=float, default=10.0, help="chain: px/frame of motion tolerated before it counts as drift (fast hands: flow fails silently, footage is blurred)")
    ap.add_argument("--speed-w", type=float, default=0.5, help="chain: drift added per px/frame above --speed-ok (0 disables the motion gate)")
    ap.add_argument("--blend-sigma", type=float, default=6.0, help="--blend: spatial smoothing of the two heroes' ownership weights")
    ap.add_argument("--register-sigma", type=float, default=12.0, help="--blend: smoothing radius of the registration field (it corrects accumulated chain drift, which is low-frequency)")
    ap.add_argument("--relight-source", choices=["edit", "master"], default="edit", help="whose low-frequency shading the propagated garment takes: the accepted edit's own garment at this frame (default; same Look, no pattern print-through) or the master's luminance change since the hero")
    ap.add_argument("--relight-sigma", type=float, default=21.0, help="blur of the master luminance ratio used to relight; must exceed the master garment's own pattern scale (a camo blob) or the pattern prints through as blotches")
    ap.add_argument("--register-max-px", type=float, default=16.0, help="--blend: largest local shift allowed when registering the far hero's warp onto the near one (bigger = a real difference, left unregistered)")
    ap.add_argument("--protect-skin", action="store_true", help="never paint the propagated garment over skin (hands, neck, face) in the current frame")
    ap.add_argument("--garment-gate", type=float, default=20.0, help="--protect-skin: Lab radius around the Look's garment colours; an edit pixel further than this from all of them (skin, tie, shirt, props) is never painted (0 disables)")
    ap.add_argument("--untouched-thresh", type=float, default=14.0, help="Lab distance edit-vs-master below which a pixel is anatomy/scene the edit left alone (never painted)")
    ap.add_argument("--occl-thresh", type=float, default=26.0, help="Lab residual (master now vs master at the hero, warped) above which the garment is occluded there")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    a.interp = {"linear": cv2.INTER_LINEAR, "cubic": cv2.INTER_CUBIC, "lanczos": cv2.INTER_LANCZOS4}[a.interp]
    os.makedirs(a.out_dir, exist_ok=True)
    master = decode(a.master, W, H, a.fps)
    edit = decode(a.edit, W, H, a.fps) if a.edit else None
    n = min(len(master), len(edit)) if edit else len(master)
    master = master[:n]; edit = edit[:n] if edit else None
    stills = {}
    if a.hero_stills:
        for item in a.hero_stills.split(","):
            fr, path = item.split(":", 1); stills[int(fr)] = path
    selection = None
    if a.anchor and a.anchor_master and edit is not None:
        canon, heroes, selection = select_heroes(master, edit, a.anchor, a.anchor_master, a.hero_cadence, a.hero_min_score, a.consistency_w)
        print(f"heroes selected by construction truth: canonical {canon} (score {selection[canon]['score']:.3f}), re-anchors {heroes}", flush=True)
    else:
        heroes = sorted(stills.keys()) if stills else sorted({int(x) for x in a.hero_frames.split(",")} if a.hero_frames else {a.hero_frame})
    dropped = [h for h in heroes if h is None or not (0 <= h < n)]
    heroes = [h for h in heroes if h is not None and 0 <= h < n]
    if dropped: print(f"warning: hero frames {dropped} are outside the {n}-frame clip and are ignored", flush=True)
    if not heroes: raise SystemExit("no usable hero frame")
    hero = heroes[0]
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in master]
    gx0, gy0 = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    global chain
    _chain = chain
    chain = lambda g, h_, d, **kw: _chain(g, h_, d, speed_ok=a.speed_ok, speed_w=a.speed_w, **kw)
    # per-hero garment image + mask, and the chain maps from every frame to that hero
    hero_data = {}
    # with several heroes each one only needs to reach the midpoint to its neighbours
    spans = {}
    for i, hidx in enumerate(heroes):
        if a.overlap:   # reach the neighbouring hero itself (+2) so every frame has two candidate chains
            left = (hidx - heroes[i - 1]) + 2 if i > 0 else hidx
            right = (heroes[i + 1] - hidx) + 2 if i + 1 < len(heroes) else n - 1 - hidx
        else:
            left = (hidx - heroes[i - 1]) // 2 + 2 if i > 0 else hidx
            right = (heroes[i + 1] - hidx) // 2 + 2 if i + 1 < len(heroes) else n - 1 - hidx
        spans[hidx] = min(a.span, max(left, right))
    # per-frame accumulators: the best warped garment so far (per pixel, by chain confidence).
    # Chains are built hero by hero and freed, so memory is O(frames), not O(frames × heroes).
    acc_g = [None] * n; acc_m = [None] * n; acc_c = [None] * n; acc_mh = [None] * n; acc_owner = [None] * n
    owner = {k: min(heroes, key=lambda hh: abs(hh - k)) for k in range(n)}
    # ONE realisation: every re-anchor hero takes its garment TEXTURE (construction, seams, pockets,
    # band, wordmark, collar, hem) from the canonical hero, carried hero-to-hero along the chain with
    # the maps composed (a single resample of the canonical image), registered onto the hero's own
    # garment and relit to the hero's shading; the hero keeps its own GEOMETRY (mask, pose) and its
    # own pixels wherever the canonical texture cannot be carried confidently.
    harmonised = {}
    gcent6_early = None
    if a.harmonise and edit is not None and selection is not None and a.protect_skin:
        _c = min(heroes, key=lambda h_: -selection[h_]["score"]); gcent6_early = garment_colour_centres(edit[_c], garment_mask_from_edit(master[_c], edit[_c]), k=6)
    if a.harmonise and edit is not None and selection is not None:
        canon_h0 = min(heroes, key=lambda h_: -selection[h_]["score"])
        engine_h = dis(); gray_canon = cv2.cvtColor(edit[canon_h0], cv2.COLOR_BGR2GRAY)
        comp = {canon_h0: (gx0.copy(), gy0.copy(), np.ones((H, W), np.float32))}
        order = sorted(heroes, key=lambda h_: abs(h_ - canon_h0)); harm_qa = {}; hops_n = {canon_h0: 0}
        for h_ in order:
            if h_ == canon_h0: continue
            src_h = max([x for x in heroes if x < h_], default=None) if h_ > canon_h0 else min([x for x in heroes if x > h_], default=None)
            lo, hi = min(src_h, h_), max(src_h, h_)
            hop = chain(grays[lo:hi + 1], src_h - lo, +1 if h_ > src_h else -1)[h_ - lo]
            mx, my, cf = hop
            cx, cy, cc = comp[src_h]
            mxc, myc = remap(cx, mx, my), remap(cy, mx, my); cfc = np.minimum(cf, remap(cc, mx, my, border=cv2.BORDER_CONSTANT))
            tex = cv2.remap(edit[canon_h0], mxc, myc, a.interp, borderMode=cv2.BORDER_REFLECT)
            hm_own = garment_mask_from_edit(master[h_], edit[h_]).astype(np.float32) / 255.0
            hm_can = remap(garment_mask_from_edit(master[canon_h0], edit[canon_h0]).astype(np.float32) / 255.0, mxc, myc, border=cv2.BORDER_CONSTANT)
            # register the carried texture onto the hero's own garment (chain drift is a smooth field)
            tg, hg = cv2.cvtColor(tex, cv2.COLOR_BGR2GRAY), cv2.cvtColor(edit[h_], cv2.COLOR_BGR2GRAY)
            fl = flow_pair(engine_h, hg, tg); mag = np.sqrt(fl[..., 0] ** 2 + fl[..., 1] ** 2)
            texw = cv2.GaussianBlur(np.abs(cv2.Laplacian(hg, cv2.CV_32F)), (0, 0), 3.0)
            wt = (texw * (mag <= a.register_max_px) * (hm_own > 0.5) * (hm_can > 0.5)).astype(np.float32)
            num = cv2.GaussianBlur(fl * wt[..., None], (0, 0), a.register_sigma); den = cv2.GaussianBlur(wt, (0, 0), a.register_sigma)[..., None]
            fl = np.where(den > 1e-3, num / np.maximum(den, 1e-3), 0.0).astype(np.float32)
            rx, ry = gx0 + fl[..., 0], gy0 + fl[..., 1]
            mxc, myc, cfc = remap(mxc, rx, ry), remap(myc, rx, ry), remap(cfc, rx, ry, border=cv2.BORDER_CONSTANT)
            tex = cv2.remap(edit[canon_h0], mxc, myc, a.interp, borderMode=cv2.BORDER_REFLECT); hm_can = remap(hm_can, rx, ry, border=cv2.BORDER_CONSTANT)
            tex = relight_to_edit(tex, edit[h_], hm_own, sigma=a.blend_relight_sigma)
            # the chain's own confidence is pessimistic over a whole hop (it accumulates sub-pixel
            # fabric noise); after registration the carried texture is VERIFIED against the hero's
            # real garment photometrically, and verified pixels restart at full confidence for the
            # next hop — that is what re-anchoring means
            vres = np.abs(cv2.GaussianBlur(tex, (0, 0), 3.0).astype(np.float32) - cv2.GaussianBlur(edit[h_], (0, 0), 3.0).astype(np.float32)).mean(axis=2)
            usable = (cfc >= a.harmonise_min_conf) & (vres < a.verify_thresh) & (hm_own > 0.5) & (hm_can > 0.5)
            if a.protect_skin and gcent6_early is not None: usable &= ~not_garment_coloured(edit[h_], gcent6_early, a.garment_gate)
            usable = cv2.morphologyEx(usable.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
            comp[h_] = (mxc, myc, usable.astype(np.float32))
            use = cv2.GaussianBlur(cv2.erode(usable.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), a.feather)[..., None]
            himg = np.clip(edit[h_].astype(np.float32) * (1 - use) + tex.astype(np.float32) * use, 0, 255).astype(np.uint8)
            harmonised[h_] = himg
            own = hm_own > 0.5
            changed = float(np.abs(edit[h_].astype(np.float32) - himg.astype(np.float32)).mean(axis=2)[own].mean()) if own.sum() else None
            hops_n[h_] = hops_n[src_h] + 1
            harm_qa[int(h_)] = {"source_hero": int(src_h), "hops": hops_n[h_], "canonical_coverage": float(usable[own].mean()) if own.sum() else None, "texture_changed_mean": changed}
            cv2.imwrite(os.path.join(a.out_dir, f"hero_harmonised_{h_:05d}.jpg"), np.hstack([edit[h_], himg]), [cv2.IMWRITE_JPEG_QUALITY, 88])
            print(f"harmonised hero {h_} from {src_h}: canonical coverage {harm_qa[int(h_)]['canonical_coverage']:.2f}, texture changed {changed:.1f}", flush=True)
        del comp
    else:
        harm_qa = None
    def hero_source(hidx):
        if hidx in harmonised:
            himg = harmonised[hidx]; hmask = garment_mask_from_edit(master[hidx], edit[hidx])
            am = person_alpha([master[hidx]])[0]
            hmask = hmask & (cv2.dilate((am > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8)) * 255)
            cv2.imwrite(os.path.join(a.out_dir, f"hero_mask_{hidx:05d}.png"), hmask)
            return himg, hmask.astype(np.float32) / 255.0
        if hidx in stills:
            himg = cv2.resize(cv2.imread(stills[hidx]), (W, H), interpolation=cv2.INTER_AREA); hmask = garment_mask_from_edit(master[hidx], himg)
            am, ah = person_alpha([master[hidx], himg])
            agree = (am > 0.5) & (ah > 0.5)
            hmask = (hmask & (agree.astype(np.uint8) * 255))
            hmask = hmask & cv2.bitwise_not(head_exclusion(am, a.head_frac))
            hmask = cv2.morphologyEx(hmask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        elif edit is not None:
            himg = edit[hidx]; hmask = garment_mask_from_edit(master[hidx], edit[hidx])
            am = person_alpha([master[hidx]])[0]   # what the edit changed OUTSIDE the performer is not garment
            hmask = hmask & (cv2.dilate((am > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8)) * 255)
        else:
            himg = cv2.resize(cv2.imread(a.hero_image), (W, H)); hmask = cv2.resize(cv2.imread(a.hero_mask, 0), (W, H))
        cv2.imwrite(os.path.join(a.out_dir, f"hero_mask_{hidx:05d}.png"), hmask)
        return himg, hmask.astype(np.float32) / 255.0
    def warped(hsrc, hidx, v):
        himg, hmask_f = hsrc
        if v is None: return himg, hmask_f, np.ones((H, W), np.float32), master[hidx]
        mapx, mapy, conf = v
        return cv2.remap(himg, mapx, mapy, a.interp, borderMode=cv2.BORDER_REFLECT), remap(hmask_f, mapx, mapy, border=cv2.BORDER_CONSTANT), conf, remap(master[hidx], mapx, mapy)
    def store(k, g, m, conf, mh, own):
        acc_g[k], acc_m[k], acc_c[k], acc_mh[k], acc_owner[k] = g, (m * 255).astype(np.uint8), conf.astype(np.float16), mh, np.full((H, W), own, np.int16)
    if a.blend:
        # interval by interval: every frame between heroes A < k < B carries BOTH garments; the far
        # hero's warp is registered onto the near one (a small local flow — the two chains drift by
        # a few px in different directions) and the pair is cross-faded by temporal distance. The
        # generator's frame-to-frame redesign between two heroes thus becomes a slow morph instead
        # of a cut at the ownership midpoint (the run-2 defect: temporal residual 15–24 at every
        # midpoint+1 against 6–10 for the edit itself).
        engine_r = dis()
        srcs = {h_: hero_source(h_) for h_ in heroes}
        for h_ in heroes: store(h_, *warped(srcs[h_], h_, None), h_)
        # single-chain ends
        first, last = heroes[0], heroes[-1]
        for h_, d in ((first, -1), (last, +1)):
            lo = 0 if d < 0 else h_; hi = h_ + 1 if d < 0 else n
            for j, v in chain(grays[lo:hi], h_ - lo, d).items(): store(j + lo, *warped(srcs[h_], h_, v), h_)
        for A, B in zip(heroes[:-1], heroes[1:]):
            cA = chain(grays[A:B + 1], 0, +1); cB = chain(grays[A:B + 1], B - A, -1)
            grA, grB = (cv2.cvtColor(srcs[h_][0], cv2.COLOR_BGR2GRAY) for h_ in (A, B))
            for k in range(A + 1, B):
                (mxA, myA, fA), (mxB, myB, fB) = cA[k - A], cB[k - A]
                w = (k - A) / float(B - A); w = w * w * (3 - 2 * w)   # smoothstep
                near_is_B = w >= 0.5
                gA_g, gB_g = remap(grA, mxA, myA), remap(grB, mxB, myB)
                mA, mB = remap(srcs[A][1], mxA, myA, border=cv2.BORDER_CONSTANT), remap(srcs[B][1], mxB, myB, border=cv2.BORDER_CONSTANT)
                # the two chains disagree by a SMOOTH field (accumulated drift, ~5 px per chain at the
                # midpoint of a 16-frame interval): fit a low-frequency correction from the textured
                # pixels only (flat knit gives DIS nothing to lock on), never trust a large local jump,
                # and move BOTH warps to the geometry in between (A by w, B by 1−w) so the painted
                # garment glides from A's geometry to B's instead of jumping at the midpoint
                fl = flow_pair(engine_r, gA_g, gB_g)            # gA(p) ≈ gB(p + fl)
                mag = np.sqrt(fl[..., 0] ** 2 + fl[..., 1] ** 2)
                tex = cv2.GaussianBlur(np.abs(cv2.Laplacian(gA_g, cv2.CV_32F)), (0, 0), 3.0)
                wt = (tex * (mag <= a.register_max_px) * (mA > 0.5) * (mB > 0.5)).astype(np.float32)
                num = cv2.GaussianBlur(fl * wt[..., None], (0, 0), a.register_sigma); den = cv2.GaussianBlur(wt, (0, 0), a.register_sigma)[..., None]
                fl = np.where(den > 1e-3, num / np.maximum(den, 1e-3), 0.0).astype(np.float32)
                ax, ay = gx0 - w * fl[..., 0], gy0 - w * fl[..., 1]; bx, by = gx0 + (1 - w) * fl[..., 0], gy0 + (1 - w) * fl[..., 1]
                # compose the shift into the chain maps: the hero image is resampled ONCE (no double softening)
                mxA, myA, fA = remap(mxA, ax, ay), remap(myA, ax, ay), remap(fA, ax, ay, border=cv2.BORDER_CONSTANT)
                mxB, myB, fB = remap(mxB, bx, by), remap(myB, bx, by), remap(fB, bx, by, border=cv2.BORDER_CONSTANT)
                gA, mA, mhA = cv2.remap(srcs[A][0], mxA, myA, a.interp, borderMode=cv2.BORDER_REFLECT), remap(srcs[A][1], mxA, myA, border=cv2.BORDER_CONSTANT), remap(master[A], mxA, myA)
                gB, mB, mhB = cv2.remap(srcs[B][0], mxB, myB, a.interp, borderMode=cv2.BORDER_REFLECT), remap(srcs[B][1], mxB, myB, border=cv2.BORDER_CONSTANT), remap(master[B], mxB, myB)
                okA = (fA >= a.conf) & (mA > 0.5); okB = (fB >= a.conf) & (mB > 0.5)
                # the two heroes carry the generator's drift between them (~13 Lab units of shading):
                # give each the edit's own low-frequency shading at this frame BEFORE mixing, and let
                # ownership vary smoothly (σ = blend-sigma) so confidence holes do not become a
                # patchwork of A-only / B-only / mixed pixels
                if not a.no_relight and a.relight_source == "edit" and edit is not None:
                    gA = relight_to_edit(gA, edit[k], mA, sigma=a.blend_relight_sigma); gB = relight_to_edit(gB, edit[k], mB, sigma=a.blend_relight_sigma)
                # where the two registered warps still disagree (a sleeve the chains place differently,
                # a cuff at two positions) there is no single garment to paint: fall back to the edit
                dis_ = cv2.GaussianBlur(np.abs(gA.astype(np.float32) - gB.astype(np.float32)).mean(axis=2), (0, 0), 3.0)
                both = (mA > 0.5) & (mB > 0.5)
                if a.disagree_thresh > 0:
                    bad = cv2.dilate(cv2.morphologyEx(((dis_ > a.disagree_thresh) & both).astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)), np.ones((9, 9), np.uint8)) > 0
                    okA &= ~bad; okB &= ~bad
                wA = (1 - w) * okA; wB = w * okB; tot = wA + wB
                wA = np.where(tot > 0, wA / np.maximum(tot, 1e-6), 0.0).astype(np.float32); wB = np.where(tot > 0, wB / np.maximum(tot, 1e-6), 0.0).astype(np.float32)
                wA = cv2.GaussianBlur(wA, (0, 0), a.blend_sigma); wB = cv2.GaussianBlur(wB, (0, 0), a.blend_sigma); tot = wA + wB
                wA = np.where(tot > 0, wA / np.maximum(tot, 1e-6), 0.0).astype(np.float32); wB = np.where(tot > 0, wB / np.maximum(tot, 1e-6), 0.0).astype(np.float32)
                g = np.clip(gA.astype(np.float32) * wA[..., None] + gB.astype(np.float32) * wB[..., None], 0, 255).astype(np.uint8)
                m = np.maximum(mA * (okA | (tot <= 0)), mB * (okB | (tot <= 0))).astype(np.float32)
                conf = np.where(tot > 0, wA * fA + wB * fB, np.maximum(fA, fB)).astype(np.float32)
                mh = np.clip(mhA.astype(np.float32) * wA[..., None] + mhB.astype(np.float32) * wB[..., None] + np.where((tot > 0)[..., None], 0, mhA if not near_is_B else mhB), 0, 255).astype(np.uint8)
                store(k, g, m, conf, mh, B if near_is_B else A)
            del cA, cB
            print(f"interval {A}-{B}: blended", flush=True)
        heroes_iter = []
    else:
        heroes_iter = heroes
    for hidx in heroes_iter:
        himg, hmask_f = hero_source(hidx); hmask = (hmask_f * 255).astype(np.uint8)
        maps = {}
        for d in (+1, -1):
            lo = max(0, hidx - spans[hidx]); hi = min(n, hidx + spans[hidx] + 1)
            m_ = chain(grays[lo:hi], hidx - lo, d)
            for j, v in m_.items(): maps[j + lo] = v
        maps[hidx] = None
        for k, v in maps.items():
            if v is None: m, g, conf, mh = hmask_f, himg, np.ones((H, W), np.float32), master[hidx]
            else:
                mapx, mapy, conf = v
                m = remap(hmask_f, mapx, mapy, border=cv2.BORDER_CONSTANT); g = remap(himg, mapx, mapy); mh = remap(master[hidx], mapx, mapy)
            if acc_g[k] is None:
                acc_g[k], acc_m[k], acc_c[k], acc_mh[k] = g, (m * 255).astype(np.uint8), conf.astype(np.float16), mh; acc_owner[k] = np.full((H, W), hidx, np.int16)
            elif a.overlap or (owner[k] == hidx):
                am_ = acc_m[k].astype(np.float32) / 255.0; ac_ = acc_c[k].astype(np.float32)
                if a.overlap:
                    # one persistent garment: a pixel changes owner only where the new chain is clearly more confident
                    take = ((conf > ac_ + 0.05) & (m > 0.5)) | ((am_ <= 0.5) & (m > 0.5))
                    take = cv2.GaussianBlur(cv2.morphologyEx(take.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)).astype(np.float32), (0, 0), 3.0)
                else:
                    take = np.ones((H, W), np.float32)
                t3 = take[..., None]
                acc_g[k] = np.clip(acc_g[k].astype(np.float32) * (1 - t3) + g.astype(np.float32) * t3, 0, 255).astype(np.uint8)
                acc_mh[k] = np.where(t3 > 0.5, mh, acc_mh[k])
                mm = np.maximum(am_ * (1 - take), m * take) if a.overlap else m
                acc_m[k] = (mm * 255).astype(np.uint8)
                acc_c[k] = np.where(take > 0.5, conf, ac_).astype(np.float16); acc_owner[k] = np.where(take > 0.5, hidx, acc_owner[k]).astype(np.int16)
        del maps
        print(f"hero {hidx}: garment mask {int((hmask > 0).sum())} px, chains merged", flush=True)
    print(f"{n} frames; heroes {heroes}", flush=True)
    engine = dis()
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    canon_h = (min(heroes, key=lambda h_: -selection[h_]["score"]) if selection else hero)
    gcent = garment_colour_centres(edit[canon_h] if edit is not None else master[canon_h], cv2.imread(os.path.join(a.out_dir, f"hero_mask_{canon_h:05d}.png"), 0)) if a.protect_skin else None
    gcent6 = garment_colour_centres(edit[canon_h], cv2.imread(os.path.join(a.out_dir, f"hero_mask_{canon_h:05d}.png"), 0), k=6) if (a.protect_skin and edit is not None) else None
    outs, masks_k, per = [], [], []
    for k in range(n):
        hidx = owner[k]
        if acc_g[k] is None:
            outs.append(edit[k] if edit is not None else master[k]); masks_k.append(None); per.append({"frame": k, "propagated": False, "hero": hidx}); continue
        g, m, conf, master_hero_in_k = acc_g[k], acc_m[k].astype(np.float32) / 255.0, acc_c[k].astype(np.float32), acc_mh[k]
        if not a.no_relight and k not in heroes:
            g = relight_to_edit(g, edit[k], m, sigma=a.relight_sigma) if (a.relight_source == "edit" and edit is not None) else relight(g, master[k], master_hero_in_k, m, sigma=a.relight_sigma)
        # Occluder test on the REAL footage: where the master pixel now looks nothing like the
        # master pixel the map points at in the hero frame, something else (an arm, a hand, a
        # prop) is in front of the garment there — the hero garment must not be painted over it.
        ma = cv2.GaussianBlur(cv2.cvtColor(master[k], cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
        mb = cv2.GaussianBlur(cv2.cvtColor(master_hero_in_k, cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
        resid = np.sqrt(0.35 * (ma[..., 0] - mb[..., 0]) ** 2 + (ma[..., 1] - mb[..., 1]) ** 2 + (ma[..., 2] - mb[..., 2]) ** 2)
        occl = cv2.dilate(((resid > a.occl_thresh) & (m > 0.5)).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        gm = m > 0.5
        if a.protect_skin:
            # anatomy guard, two independent tests: (1) skin chroma minus garment colours; (2) "the edit
            # left it alone" — where the edit frame still equals the master (hands, face, cap, props)
            # nothing may be painted, whatever the warped hero mask says. (2) is what protects a dark-
            # skinned performer whose skin sits outside the generic chroma box.
            occl = occl | skin_mask(edit[k] if edit is not None else master[k], gcent)
            if edit is not None and gcent6 is not None and a.garment_gate > 0: occl = occl | not_garment_coloured(edit[k], gcent6, a.garment_gate)
            if edit is not None:
                de = np.sqrt(((cv2.GaussianBlur(cv2.cvtColor(edit[k], cv2.COLOR_BGR2LAB), (0, 0), 1.5).astype(np.float32) - cv2.GaussianBlur(cv2.cvtColor(master[k], cv2.COLOR_BGR2LAB), (0, 0), 1.5).astype(np.float32)) ** 2).sum(axis=2))
                untouched = cv2.morphologyEx((de < a.untouched_thresh).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
                occl = occl | (untouched & gm)
        usable = gm & ~occl & (conf >= a.conf)
        use = cv2.GaussianBlur(cv2.erode(usable.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), a.feather)[..., None]
        base = edit[k] if edit is not None else master[k]
        comp = base.astype(np.float32) * (1 - use) + g.astype(np.float32) * use
        outs.append(np.clip(comp, 0, 255).astype(np.uint8))
        mk = (gm * 255).astype(np.uint8); masks_k.append(mk)
        drift = None
        if edit is not None and usable.sum() > 100:
            drift = float(np.abs(edit[k].astype(np.float32) - g.astype(np.float32)).mean(axis=2)[usable].mean())
        own = acc_owner[k][gm]; owners_used = sorted({int(x) for x in np.unique(own)}) if gm.sum() else []
        # texture fidelity: a chain that has drifted or a blend of two misaligned warps SMEARS the
        # fabric — colour classes still score well, so measure sharpness explicitly (Laplacian
        # variance inside the painted garment, propagated vs the edit; < 1 = softer than the edit)
        sharp = None
        if edit is not None and usable.sum() > 100:
            lo_, le_ = (cv2.Laplacian(cv2.cvtColor(x, cv2.COLOR_BGR2GRAY), cv2.CV_32F) for x in (outs[-1], edit[k]))
            ve = float((le_[usable] ** 2).mean()); sharp = float((lo_[usable] ** 2).mean() / ve) if ve > 1e-6 else None
        per.append({"frame": k, "propagated": True, "hero": hidx, "owners": owners_used, "sharpness_ratio": sharp, "conf_mean": float(conf[gm].mean()) if gm.sum() else None,
                    "coverage": float(usable[gm].mean()) if gm.sum() else None,
                    "occluded_frac": float(occl[gm].mean()) if gm.sum() else None,
                    "fallback_frac": float((gm & ~usable & ~occl)[gm].mean()) if gm.sum() else None,
                    "generator_drift": drift})
    # QA: temporal stability (flow-compensated) for the propagated result and for the edit — flows
    # computed one pair at a time (storing all of them costs ~1.2 GB at 720×1280)
    res_prop, res_edit = [], []
    for k in range(1, n):
        if masks_k[k] is None: res_prop.append(None); res_edit.append(None); continue
        f = flow_pair(engine, grays[k], grays[k - 1]); mm_ = masks_k[k] > 0
        for src, dst in ((outs, res_prop), (edit, res_edit)):
            if src is None: dst.append(None); continue
            prev_in_k = remap(src[k - 1], gx + f[..., 0], gy + f[..., 1])
            d = np.abs(src[k].astype(np.float32) - prev_in_k.astype(np.float32)).mean(axis=2)
            dst.append(float(d[mm_].mean()) if mm_.sum() > 100 else None)
    for k in range(1, n):   # per-frame stability next to the per-frame coverage, so a pop is locatable
        per[k]["temporal_residual"] = res_prop[k - 1]; per[k]["temporal_residual_edit"] = res_edit[k - 1] if edit is not None else None
    if edit is None: res_edit = None
    def agg(v): v = [x for x in v if x is not None]; return {"mean": float(np.mean(v)), "p95": float(np.percentile(v, 95))} if v else None
    cov = [p["coverage"] for p in per if p.get("coverage") is not None]
    # re-anchor cadence: how far from the hero coverage stays ≥ 0.8
    def reach(direction):
        r = 0
        for k in range(hero + direction, -1 if direction < 0 else n, direction):
            c = next((p["coverage"] for p in per if p["frame"] == k), None)
            if c is None or c < 0.8: break
            r += 1
        return r
    qa = {"frames": n, "heroes": heroes, "hero": hero, "conf_threshold": a.conf, "overlap": a.overlap, "blend": a.blend, "speed_ok": a.speed_ok, "speed_w": a.speed_w, "disagree_thresh": a.disagree_thresh, "harmonise": a.harmonise, "harmonisation": harm_qa, "interp": {cv2.INTER_LINEAR: "linear", cv2.INTER_CUBIC: "cubic", cv2.INTER_LANCZOS4: "lanczos"}[a.interp], "relight_source": (None if a.no_relight else a.relight_source), "protect_skin": a.protect_skin,
          "hero_selection": ({"canonical": min(heroes, key=lambda h_: -selection[h_]["score"]) if selection else None, "hero_scores": {int(h_): selection[h_] for h_ in heroes if h_ in selection}} if selection else None),
          "conf_mean": float(np.mean([p["conf_mean"] for p in per if p.get("conf_mean") is not None])),
          "coverage_mean": float(np.mean(cov)) if cov else None,
          "coverage_reach_frames": {"backward": reach(-1), "forward": reach(+1)},
          "occluded_frac_mean": float(np.mean([p["occluded_frac"] for p in per if p.get("occluded_frac") is not None])),
          "fallback_frac_mean": float(np.mean([p["fallback_frac"] for p in per if p.get("fallback_frac") is not None])),
          "frames_coverage_under_80pct": [p["frame"] for p in per if (p.get("coverage") or 0) < 0.8],
          "generator_drift_mean": float(np.mean([p["generator_drift"] for p in per if p.get("generator_drift") is not None])) if any(p.get("generator_drift") is not None for p in per) else None,
          "sharpness_ratio": agg([p.get("sharpness_ratio") for p in per]) and {"mean": float(np.mean([p["sharpness_ratio"] for p in per if p.get("sharpness_ratio") is not None])), "p10": float(np.percentile([p["sharpness_ratio"] for p in per if p.get("sharpness_ratio") is not None], 10))},
          "frames_sharpness_under_0.85": [p["frame"] for p in per if p.get("sharpness_ratio") is not None and p["sharpness_ratio"] < 0.85],
          "temporal_residual_propagated": agg(res_prop), "temporal_residual_edit": agg(res_edit) if res_edit else None}
    json.dump({"qa": qa, "frames": per}, open(os.path.join(a.out_dir, "qa.json"), "w"), indent=1)
    # videos
    def write(path, frames):
        tmp = path + ".raw.mp4"; vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), a.fps, (frames[0].shape[1], frames[0].shape[0]))
        for f in frames: vw.write(f)
        vw.release(); subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", path], check=True); os.remove(tmp)
    write(os.path.join(a.out_dir, "propagated.mp4"), outs)
    if edit is not None:
        cmp_frames = []
        for k in range(n):
            tag = lambda im, t: cv2.putText(im.copy(), t, (12, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
            cmp_frames.append(np.hstack([tag(master[k], "master"), tag(edit[k], "edit"), tag(outs[k], f"propagated f{k}" + (" HERO" if k in heroes else f" (hero {owner[k]})"))]))
        write(os.path.join(a.out_dir, "compare.mp4"), cmp_frames)
    idx = np.linspace(0, n - 1, 8).round().astype(int); tiles = []
    for k in idx:
        e = edit[k] if edit is not None else master[k]
        t = np.hstack([e, outs[k]]); t = cv2.resize(t, None, fx=0.35, fy=0.35)
        p = per[k]; cv2.putText(t, f"f{k} h{per[k].get('hero')} cov={p.get('coverage', 0) or 0:.2f} occ={p.get('occluded_frac', 0) or 0:.2f}", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        tiles.append(t)
    cv2.imwrite(os.path.join(a.out_dir, "qa_sheet.jpg"), np.vstack([np.hstack(tiles[:4]), np.hstack(tiles[4:])]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(qa, indent=1))

if __name__ == "__main__":
    main()
