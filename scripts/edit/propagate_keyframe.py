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
Kill criterion (VIDEO_SWAP_ARCHITECTURE.md §7): identity, exact construction, stripe/logo
placement, natural occlusion, no flicker/morphing on a 2–4 s test. Identity and construction
are inherited by construction here (real face pixels, one garment sample); occlusion and
flicker are what the QA numbers measure.
"""
import argparse, json, os, subprocess, tempfile
import cv2, numpy as np

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

def chain(grays, hero, direction, drift_ok=2.0, drift_bad=8.0, median_px=9):
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
        drift = remap(drift, px, py) + fb_err
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
    ratio = np.clip((Lk + 2.0) / (Lh + 2.0), 0.5, 1.8)
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
    ap.add_argument("--occl-thresh", type=float, default=26.0, help="Lab residual (master now vs master at the hero, warped) above which the garment is occluded there")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    os.makedirs(a.out_dir, exist_ok=True)
    master = decode(a.master, W, H, a.fps)
    edit = decode(a.edit, W, H, a.fps) if a.edit else None
    n = min(len(master), len(edit)) if edit else len(master)
    master = master[:n]; edit = edit[:n] if edit else None
    stills = {}
    if a.hero_stills:
        for item in a.hero_stills.split(","):
            fr, path = item.split(":", 1); stills[int(fr)] = path
    heroes = sorted(stills.keys()) if stills else sorted({int(x) for x in a.hero_frames.split(",")} if a.hero_frames else {a.hero_frame})
    dropped = [h for h in heroes if h is None or not (0 <= h < n)]
    heroes = [h for h in heroes if h is not None and 0 <= h < n]
    if dropped: print(f"warning: hero frames {dropped} are outside the {n}-frame clip and are ignored", flush=True)
    if not heroes: raise SystemExit("no usable hero frame")
    hero = heroes[0]
    grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in master]
    # per-hero garment image + mask, and the chain maps from every frame to that hero
    hero_data = {}
    # with several heroes each one only needs to reach the midpoint to its neighbours
    spans = {}
    for i, hidx in enumerate(heroes):
        left = (hidx - heroes[i - 1]) // 2 + 2 if i > 0 else hidx
        right = (heroes[i + 1] - hidx) // 2 + 2 if i + 1 < len(heroes) else n - 1 - hidx
        spans[hidx] = min(a.span, max(left, right))
    for hidx in heroes:
        if hidx in stills:
            himg = cv2.resize(cv2.imread(stills[hidx]), (W, H), interpolation=cv2.INTER_AREA); hmask = garment_mask_from_edit(master[hidx], himg)
            # the still's garment is trusted only where BOTH silhouettes agree it is the person
            am, ah = person_alpha([master[hidx], himg])
            agree = (am > 0.5) & (ah > 0.5)
            hmask = (hmask & (agree.astype(np.uint8) * 255))
            hmask = hmask & cv2.bitwise_not(head_exclusion(am, a.head_frac))
            hmask = cv2.morphologyEx(hmask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        elif edit is not None:
            himg = edit[hidx]; hmask = garment_mask_from_edit(master[hidx], edit[hidx])
        else:
            himg = cv2.resize(cv2.imread(a.hero_image), (W, H)); hmask = cv2.resize(cv2.imread(a.hero_mask, 0), (W, H))
        cv2.imwrite(os.path.join(a.out_dir, f"hero_mask_{hidx:05d}.png"), hmask)
        maps = {}
        for d in (+1, -1):
            lo = max(0, hidx - spans[hidx]); hi = min(n, hidx + spans[hidx] + 1)
            m = chain(grays[lo:hi], hidx - lo, d)
            for j, v in m.items(): maps[j + lo] = v
        hero_data[hidx] = (himg, hmask, maps)
        print(f"hero {hidx}: garment mask {int((hmask > 0).sum())} px, chains done", flush=True)
    # assignment: nearest hero by frame distance (the re-anchor rule)
    owner = {k: min(heroes, key=lambda hh: abs(hh - k)) for k in range(n)}
    print(f"{n} frames; heroes {heroes}", flush=True)
    # forward flows k→k-1 for the temporal residual QA (independent of the chains)
    engine = dis(); flows_fwd = {k: flow_pair(engine, grays[k], grays[k - 1]) for k in range(1, n)}
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    outs, masks_k, per = [], [], []
    for k in range(n):
        hidx = owner[k]; hero_img, hero_mask, maps = hero_data[hidx]; hero_mask_f = hero_mask.astype(np.float32) / 255.0
        if k == hidx:
            m = hero_mask_f; g = hero_img; conf = np.ones((H, W), np.float32); master_hero_in_k = master[hidx]
        elif k in maps:
            mapx, mapy, conf = maps[k]
            m = remap(hero_mask_f, mapx, mapy, border=cv2.BORDER_CONSTANT)
            g = remap(hero_img, mapx, mapy)
            master_hero_in_k = remap(master[hidx], mapx, mapy)
        else:
            outs.append(edit[k] if edit is not None else master[k]); masks_k.append(None); per.append({"frame": k, "propagated": False, "hero": hidx}); continue
        if not a.no_relight and k != hidx: g = relight(g, master[k], master_hero_in_k, m)
        # Occluder test on the REAL footage: where the master pixel now looks nothing like the
        # master pixel the map points at in the hero frame, something else (an arm, a hand, a
        # prop) is in front of the garment there — the hero garment must not be painted over it.
        ma = cv2.GaussianBlur(cv2.cvtColor(master[k], cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
        mb = cv2.GaussianBlur(cv2.cvtColor(master_hero_in_k, cv2.COLOR_BGR2LAB), (0, 0), 3).astype(np.float32)
        resid = np.sqrt(0.35 * (ma[..., 0] - mb[..., 0]) ** 2 + (ma[..., 1] - mb[..., 1]) ** 2 + (ma[..., 2] - mb[..., 2]) ** 2)
        occl = cv2.dilate(((resid > a.occl_thresh) & (m > 0.5)).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        gm = m > 0.5
        usable = gm & ~occl & (conf >= a.conf)
        use = cv2.GaussianBlur(cv2.erode(usable.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), a.feather)[..., None]
        # base = the edit frame (it already carries A garment realisation and the real scene);
        # the canonical hero garment replaces it wherever propagation is trustworthy. Nothing is
        # ever composited from an invented pixel.
        base = edit[k] if edit is not None else master[k]
        comp = base.astype(np.float32) * (1 - use) + g.astype(np.float32) * use
        outs.append(np.clip(comp, 0, 255).astype(np.uint8))
        mk = (gm * 255).astype(np.uint8); masks_k.append(mk)
        drift = None
        if edit is not None and usable.sum() > 100:
            drift = float(np.abs(edit[k].astype(np.float32) - g.astype(np.float32)).mean(axis=2)[usable].mean())
        per.append({"frame": k, "propagated": True, "hero": hidx, "conf_mean": float(conf[gm].mean()) if gm.sum() else None,
                    "coverage": float(usable[gm].mean()) if gm.sum() else None,          # fraction of the garment carried from the hero
                    "occluded_frac": float(occl[gm].mean()) if gm.sum() else None,
                    "fallback_frac": float((gm & ~usable & ~occl)[gm].mean()) if gm.sum() else None,  # garment not occluded but not propagatable → edit
                    "generator_drift": drift})
    # QA: temporal stability (flow-compensated) for the propagated result and for the edit
    res_prop = temporal_residual(outs, flows_fwd, masks_k)
    res_edit = temporal_residual(edit, flows_fwd, masks_k) if edit is not None else None
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
    qa = {"frames": n, "heroes": heroes, "hero": hero, "conf_threshold": a.conf,
          "conf_mean": float(np.mean([p["conf_mean"] for p in per if p.get("conf_mean") is not None])),
          "coverage_mean": float(np.mean(cov)) if cov else None,
          "coverage_reach_frames": {"backward": reach(-1), "forward": reach(+1)},
          "occluded_frac_mean": float(np.mean([p["occluded_frac"] for p in per if p.get("occluded_frac") is not None])),
          "fallback_frac_mean": float(np.mean([p["fallback_frac"] for p in per if p.get("fallback_frac") is not None])),
          "frames_coverage_under_80pct": [p["frame"] for p in per if (p.get("coverage") or 0) < 0.8],
          "generator_drift_mean": float(np.mean([p["generator_drift"] for p in per if p.get("generator_drift") is not None])) if any(p.get("generator_drift") is not None for p in per) else None,
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
