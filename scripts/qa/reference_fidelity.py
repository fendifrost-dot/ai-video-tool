#!/usr/bin/env python3
"""
REFERENCE FIDELITY — did a reference-to-video result keep the person and the performance? (deterministic, $0)

    python3 scripts/qa/reference_fidelity.py --source cuts/S11.mp4 --result seedance/T2.mp4 --out seedance/T2_fidelity.json [--fps 30]

Two numbers the realism gate cannot give, because the gate has no source:
  identity_src_vs_result   1 − cos(ArcFace mean embedding of the source, of the result); 0 = same person. Same
                           scale as the gate's identity_dist (REVIEW above 0.40; a clean outfit swap scored 0.18).
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
    cap = cv2.VideoCapture(path); f0 = cap.get(cv2.CAP_PROP_FPS) or 30; step = max(1, round(f0 / fps)); i = 0; rows = []
    while True:
        ok, fr = cap.read()
        if not ok: break
        if i % step == 0:
            h, w = fr.shape[:2]; s = 960 / h; fr = cv2.resize(fr, (int(w * s), 960))
            lm = face.landmarks(fr)
            if lm is not None:
                e = emb.identity(fr, lm)
                if e is not None:
                    rows.append({"t": i / f0, "emb": e, "mouth": float(np.linalg.norm(lm[13] - lm[14]) / (np.linalg.norm(lm[33] - lm[263]) + 1e-6))})
        i += 1
    return rows


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
    src, res = scan(face, emb, a.source, a.fps), scan(face, emb, a.result, a.fps)
    if not src or not res: raise SystemExit(f"no face found: source {len(src)} frames, result {len(res)} frames")
    ea = np.mean([r["emb"] for r in src], axis=0); ea /= np.linalg.norm(ea); eb = np.mean([r["emb"] for r in res], axis=0); eb /= np.linalg.norm(eb)
    per = [float(1.0 - np.dot(r["emb"], ea)) for r in res]
    rep = {"source": a.source, "result": a.result, "fps_sampled": a.fps, "frames_src": len(src), "frames_res": len(res),
           "identity_src_vs_result": round(float(1.0 - np.dot(ea, eb)), 3), "identity_per_frame_p95": round(float(np.percentile(per, 95)), 3), "lip": fit(src, res)}
    json.dump(rep, open(a.out, "w"), indent=1); print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
