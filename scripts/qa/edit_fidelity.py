#!/usr/bin/env python3
"""
Edit fidelity — did a provider EDIT the real performance or quietly regenerate it?

  python3 scripts/qa/edit_fidelity.py --source cuts/S08_master.mp4 \\
      --candidate "E1=s08_e1.mp4" --candidate "aleph=s08_aleph.mp4" … --out qa/fidelity_S08/

Per candidate, frame-aligned to the source at --fps (both decoded and resized to --size):
  duration / frames / native resolution   what came back vs what went in
  garment_frac        share of the frame the edit changed (Lab diff mask vs the source)
  outside_change      mean Lab distance on the PERFORMER outside the garment (face, hands, legs);
                      an edit leaves this near the codec floor, a regeneration does not
  head_change         the same in the head band above the garment (identity)
  pose_displacement   dense flow from the source frame to the candidate frame at the same instant,
                      on the performer outside the garment: an edit ≈ 0 px, a re-acted / re-timed
                      performance moves (the garment itself changed texture by design, so it is excluded)
  motion_corr         correlation of per-frame motion energy (mean |I_k − I_{k−1}|) between
                      candidate and source — a re-timed or re-acted performance decorrelates
  motion_ratio        candidate motion energy ÷ source motion energy (added/removed movement)
Verdict per candidate: EDIT if outside_change and head_change stay within --edit-tolerance × the
reference candidate's values (the known xAI edit), pose displacement stays within tolerance of the
reference (median also ≤ --max-pose-px) and motion_corr ≥ --min-motion-corr; else REGENERATED. Thresholds and reference values are recorded in the JSON.
Writes fidelity.json and a sheet (source | candidate | |diff| at three instants per candidate).
"""
import argparse, json, os, subprocess, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "edit"))
from propagate_keyframe import decode, dis, flow_pair, garment_mask_from_edit  # noqa: E402

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames,r_frame_rate:format=duration", "-of", "json", path], capture_output=True, text=True).stdout
    j = json.loads(out or "{}"); s = (j.get("streams") or [{}])[0]; f = j.get("format", {})
    return {"width": s.get("width"), "height": s.get("height"), "fps": s.get("r_frame_rate"), "frames": int(s.get("nb_frames") or 0), "duration": float(f.get("duration") or 0)}

def lab(im): return cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32)

def silhouettes(frames):
    bg = np.median(np.stack(frames[::max(1, len(frames) // 16)]), axis=0).astype(np.uint8); out = []
    for f in frames:
        d = np.abs(f.astype(np.int16) - bg.astype(np.int16)).sum(axis=2); m = (d > 45).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)); out.append(m > 0)
    return out

def motion_energy(frames):
    return np.array([np.abs(frames[k].astype(np.float32) - frames[k - 1].astype(np.float32)).mean() for k in range(1, len(frames))])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True); ap.add_argument("--candidate", action="append", default=[], help='"name=video.mp4"')
    ap.add_argument("--reference", default=None, help="name of the candidate whose behaviour defines 'edit' (default: the first candidate)")
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24); ap.add_argument("--step", type=int, default=2)
    ap.add_argument("--edit-tolerance", type=float, default=1.6); ap.add_argument("--max-pose-px", type=float, default=8.0, help="absolute ceiling on the median source→candidate displacement of the performer outside the garment, at --size (the reference's value × tolerance applies when larger)"); ap.add_argument("--min-motion-corr", type=float, default=0.85); ap.add_argument("--pose-tolerance", type=float, default=2.0, help="pose displacement may be this many times the reference edit's (flow at hands/edges is noisy)"); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out, exist_ok=True)
    src = decode(a.source, W, H, a.fps); src_sil = silhouettes(src); src_me = motion_energy(src); engine = dis()
    report = {"source": {"file": a.source, **probe(a.source), "decoded_frames": len(src)}, "candidates": {}, "thresholds": {"edit_tolerance": a.edit_tolerance, "max_pose_px": a.max_pose_px, "pose_tolerance": a.pose_tolerance, "min_motion_corr": a.min_motion_corr}}
    tiles = []
    for spec in a.candidate:
        name, path = spec.split("=", 1); cand = decode(path, W, H, a.fps); n = min(len(cand), len(src))
        sil = silhouettes(cand[:n]); me = motion_energy(cand[:n])
        outside, head, disp_med, disp_p90, gfrac = [], [], [], [], []
        for k in range(0, n, a.step):
            gm = garment_mask_from_edit(src[k], cand[k]); dil = cv2.dilate(gm, np.ones((25, 25), np.uint8)) > 0
            person = cv2.dilate(src_sil[k].astype(np.uint8) * 255, np.ones((15, 15), np.uint8)) > 0
            d = np.sqrt(((lab(src[k]) - lab(cand[k])) ** 2).sum(axis=2))
            ys, xs = np.where(gm > 0)
            reg = person & ~dil                                  # the performer outside the garment: face, hands, legs
            outside.append(float(d[reg].mean()) if reg.sum() > 200 else float("nan")); gfrac.append(float((gm > 0).mean()))
            if len(ys):
                top = ys.min(); hb = np.zeros_like(dil); hb[max(0, top - int(0.25 * (ys.max() - top))):top, max(0, xs.min()):xs.max()] = True; hb &= ~dil
                head.append(float(d[hb].mean()) if hb.any() else float("nan"))
            # pose: dense flow from the source frame to the candidate frame at the SAME instant; an edit
            # leaves the performer where he is (≈ 0 px), a re-acted or re-timed performance moves him
            fl = flow_pair(engine, cv2.cvtColor(src[k], cv2.COLOR_BGR2GRAY), cv2.cvtColor(cand[k], cv2.COLOR_BGR2GRAY))
            mag = np.hypot(fl[..., 0], fl[..., 1])[reg]                 # outside the garment: its texture changed by design
            if mag.size > 200: disp_med.append(float(np.median(mag))); disp_p90.append(float(np.percentile(mag, 90)))
        L = min(len(me), len(src_me)); corr = float(np.corrcoef(me[:L], src_me[:L])[0, 1]) if L > 3 else None
        rec = {"file": path, **probe(path), "decoded_frames": len(cand), "frames_compared": n,
               "garment_frac": float(np.nanmean(gfrac)), "outside_change": float(np.nanmean(outside)), "outside_change_p90": float(np.nanpercentile(outside, 90)),
               "head_change": float(np.nanmean(head)) if head else None, "pose_displacement_px_median": float(np.median(disp_med)) if disp_med else None, "pose_displacement_px_p90": float(np.percentile(disp_p90, 90)) if disp_p90 else None,
               "motion_corr": corr, "motion_ratio": float(me[:L].mean() / max(1e-6, src_me[:L].mean())) if L else None}
        report["candidates"][name] = rec
        for frac in (0.2, 0.5, 0.8):
            k = int(frac * (n - 1)); d = np.abs(src[k].astype(np.int16) - cand[k].astype(np.int16)).sum(axis=2).clip(0, 255).astype(np.uint8)
            t = cv2.resize(np.hstack([src[k], cand[k], cv2.cvtColor(d, cv2.COLOR_GRAY2BGR)]), None, fx=0.25, fy=0.25)
            cv2.putText(t, f"{name} f{k}", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1); tiles.append(t)
        print(json.dumps({name: rec}), flush=True)
    ref = a.reference or (a.candidate[0].split("=", 1)[0] if a.candidate else None)
    rref = report["candidates"].get(ref)
    for name, rec in report["candidates"].items():
        if not rref: rec["verdict"] = None; continue
        ok_out = rec["outside_change"] <= a.edit_tolerance * rref["outside_change"]
        ok_head = (rec["head_change"] or 0) <= a.edit_tolerance * (rref["head_change"] or 1e9)
        ok_pose = ((rec["pose_displacement_px_median"] or 1e9) <= max(a.max_pose_px, a.pose_tolerance * (rref["pose_displacement_px_median"] or 0))
                   and (rec["pose_displacement_px_p90"] or 1e9) <= a.pose_tolerance * (rref["pose_displacement_px_p90"] or 1e9))
        ok_motion = (rec["motion_corr"] or 0) >= a.min_motion_corr
        rec["verdict"] = "EDIT" if (ok_out and ok_head and ok_pose and ok_motion) else "REGENERATED"
        rec["verdict_reasons"] = {"outside_within_tolerance": ok_out, "head_within_tolerance": ok_head, "pose_displacement_ok": ok_pose, "motion_correlated": ok_motion}
    report["reference"] = ref
    json.dump(report, open(os.path.join(a.out, "fidelity.json"), "w"), indent=1)
    if tiles:
        rows = [np.hstack(tiles[i:i + 3]) if i + 2 < len(tiles) else np.hstack(tiles[i:] + [np.zeros_like(tiles[0])] * (3 - len(tiles[i:]))) for i in range(0, len(tiles), 3)]
        cv2.imwrite(os.path.join(a.out, "fidelity_sheet.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(json.dumps({n: {k: r.get(k) for k in ("verdict", "outside_change", "head_change", "pose_displacement_px_median", "pose_displacement_px_p90", "motion_corr", "motion_ratio", "width", "height", "duration")} for n, r in report["candidates"].items()}, indent=1))

if __name__ == "__main__":
    main()
