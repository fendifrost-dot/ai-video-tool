#!/usr/bin/env python3
"""
REFERENCE FIDELITY — did a reference-to-video result keep the person and the performance? (deterministic, $0)

    python3 scripts/qa/reference_fidelity.py --source cuts/S11.mp4 --result seedance/T2.mp4 --out seedance/T2_fidelity.json [--fps 30]

Two numbers the realism gate cannot give, because the gate has no source:
  identity_src_vs_result   1 − cos(ArcFace mean embedding of the source, of the result); 0 = same person. Same
                           scale as the gate's identity_dist (REVIEW above 0.40; a clean outfit swap scored 0.18).
  camera_change            how far the camera actually moved (picture difference at the same moments + the face's size,
                           position and turn in frame). An "angle" that returns the source's own framing scores ≈ 0.
  lip                      the mouth-open series (MediaPipe lip gap / inter-ocular) of both clips, and the best fit of
                           result_t = retime · source_t + offset by correlation: `corr` is how well the mouth motion
                           matches (1 = identical), `retime` = 1 and `offset` = 0 mean the result sits on the source's
                           clock. Sample at ≥ 24 fps (`--fps`): at 8 fps a rap line aliases and the fit is meaningless.

Rule of thumb from the 2026-10-02 Seedance test: ask the provider for the SOURCE's duration — a 4 s source rendered
to 5 s came back stretched (retime ≈ 0.7, corr 0.56); the 4 s → 4 s render landed on the clock (retime 1.00, corr 0.66).
"""
import argparse, json, os, sys, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import realism_gate as rg


def scan(face, emb, path, fps):
    """→ (rows with a face, every sampled frame as a tiny luma picture). A row carries what the camera did to the face:
    how big it is in frame (inter-ocular / frame height), where it sits, and which way it is turned (nose offset from
    the eye midpoint, in inter-oculars — 0 = straight to camera)."""
    cap = cv2.VideoCapture(path); f0 = cap.get(cv2.CAP_PROP_FPS) or 30; step = max(1, round(f0 / fps)); i = 0; rows = []; thumbs = []
    while True:
        ok, fr = cap.read()
        if not ok: break
        if i % step == 0:
            h, w = fr.shape[:2]; s = 960 / h; fr = cv2.resize(fr, (int(w * s), 960)); H, W = fr.shape[:2]
            thumbs.append((i / f0, cv2.resize(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), (54, 96), interpolation=cv2.INTER_AREA).astype(np.float32)))
            lm = face.landmarks(fr)
            if lm is not None:
                e = emb.identity(fr, lm)
                if e is not None:
                    iod = float(np.linalg.norm(lm[33] - lm[263])) + 1e-6; mid = (lm[33] + lm[263]) / 2.0
                    rows.append({"t": i / f0, "emb": e, "mouth": float(np.linalg.norm(lm[13] - lm[14]) / iod),
                                 "size": iod / H, "cx": float(mid[0] / W), "cy": float(mid[1] / H), "turn": float((lm[1][0] - mid[0]) / iod)})
        i += 1
    return rows, thumbs


def _ssim(a, b):
    """global SSIM of two small luma pictures (no window: at 54 x 96 the picture IS the window)"""
    c1, c2 = 6.5025, 58.5225; ma, mb = a.mean(), b.mean(); va, vb = a.var(), b.var(); cov = ((a - ma) * (b - mb)).mean()
    return float(((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2)))


def camera_change(src, res, src_thumbs, res_thumbs):
    """How far the camera actually moved between the source and the returned angle. A generated "new angle" can come
    back as the source's own framing (2026-10-02: one of four did, at full price) — identity and lip sync then score
    perfectly and say nothing about whether the shot is worth cutting to.
      picture  1 − SSIM of the two clips' tiny luma pictures at the same moments (0 = the same picture)
      face     how the face changed in frame: size ratio, shift of its centre (frame fractions), turn (inter-oculars)
      score    the larger of the picture term and the face terms, each on a 0–1 scale where ≈ 0.5 is a clear new angle
    """
    tb = np.array([t for t, _ in res_thumbs]); pic = []
    for t, th in src_thumbs:
        if not len(tb): break
        j = int(np.argmin(np.abs(tb - t)))
        if abs(tb[j] - t) <= 0.1: pic.append(1.0 - _ssim(th, res_thumbs[j][1]))
    out = {"picture": round(float(np.mean(pic)), 3) if pic else None, "face_visible_share": round(len(res) / max(1, len(res_thumbs)), 3)}
    if src and res:
        med = lambda rows, k: float(np.median([r[k] for r in rows]))
        ratio = med(res, "size") / max(1e-6, med(src, "size")); shift = float(np.hypot(med(res, "cx") - med(src, "cx"), med(res, "cy") - med(src, "cy"))); turn = abs(med(res, "turn") - med(src, "turn"))
        out.update({"face_size_ratio": round(ratio, 3), "face_centre_shift": round(shift, 3), "face_turn_change": round(turn, 3)})
        face_term = max(abs(float(np.log(ratio))) / np.log(1.5) * 0.5, shift / 0.15 * 0.5, turn / 0.35 * 0.5)       # 1.5× tighter/wider, 15 % of the frame, a 3/4 turn each read as 0.5
    else:
        face_term = 1.0 if src and not res else 0.0                                                              # his face is gone from frame: the camera certainly moved
    out["score"] = round(float(min(1.0, max(out["picture"] or 0.0, face_term))), 3)
    return out


def fit(a, b):
    ta = np.array([r["t"] for r in a]); ma = np.array([r["mouth"] for r in a]); tb = np.array([r["t"] for r in b]); mb = np.array([r["mouth"] for r in b])
    best = None
    for k in np.linspace(0.7, 1.4, 71):
        for off in np.linspace(-0.8, 0.8, 33):
            mi = np.interp(ta * k + off, tb, mb, left=np.nan, right=np.nan); m = ~np.isnan(mi)
            if m.sum() < max(8, len(ta) // 3): continue
            c = np.corrcoef(ma[m] - ma[m].mean(), mi[m] - mi[m].mean())[0, 1]
            if best is None or c > best["corr"]: best = {"corr": round(float(c), 3), "retime": round(float(k), 3), "offset_s": round(float(off), 3), "n": int(m.sum())}
    mi = np.interp(ta, tb, mb, left=np.nan, right=np.nan); m = ~np.isnan(mi)
    on_clock = round(float(np.corrcoef(ma[m] - ma[m].mean(), mi[m] - mi[m].mean())[0, 1]), 3) if m.sum() > 8 else None
    return {"best_fit": best, "corr_on_source_clock": on_clock, "mouth_open_src_mean": round(float(ma.mean()), 4), "mouth_open_res_mean": round(float(mb.mean()), 4)}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--source", required=True); ap.add_argument("--result", required=True); ap.add_argument("--out", required=True); ap.add_argument("--fps", type=float, default=30.0)
    a = ap.parse_args()
    face, emb = rg.Face(), rg.Embedder()
    (src, src_thumbs), (res, res_thumbs) = scan(face, emb, a.source, a.fps), scan(face, emb, a.result, a.fps)
    if not src: raise SystemExit("no face found in the source")
    rep = {"source": a.source, "result": a.result, "fps_sampled": a.fps, "frames_src": len(src), "frames_res": len(res),
           "camera_change": camera_change(src, res, src_thumbs, res_thumbs)}
    if len(res) >= 8:
        ea = np.mean([r["emb"] for r in src], axis=0); ea /= np.linalg.norm(ea); eb = np.mean([r["emb"] for r in res], axis=0); eb /= np.linalg.norm(eb)
        per = [float(1.0 - np.dot(r["emb"], ea)) for r in res]
        rep.update({"identity_src_vs_result": round(float(1.0 - np.dot(ea, eb)), 3), "identity_per_frame_p95": round(float(np.percentile(per, 95)), 3), "lip": fit(src, res)})
    else:
        # an angle that does not show his face (over the shoulder, from behind): nothing to compare, and no mouth to be out of sync
        rep.update({"identity_src_vs_result": None, "identity_per_frame_p95": None, "lip": None})
    json.dump(rep, open(a.out, "w"), indent=1); print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
