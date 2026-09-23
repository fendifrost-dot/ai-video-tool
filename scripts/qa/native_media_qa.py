#!/usr/bin/env python3
"""
Native-media QA for an assembled section — deterministic, $0, and the counterpart of the Astra
frame-strip review: it measures the properties Astra's EVIDENCE BOUNDARY declares unobservable
from sampled silent frames (native-rate stability, matte flicker, cut placement, audio presence)
and the cross-shot Look consistency that the canonical-Look mechanism is supposed to deliver.

  python3 scripts/qa/native_media_qa.py --draft out/section_v6.mp4 \\
      --assembly out/section_v6.mp4.assembly.json --shotspecs docs/treatments/<x>.shotspecs.json \\
      --masters "cuts/{shot}_master_*.mp4" --anchor "White Ice=heroes/anchor_hook.jpg" \\
      --anchor "Look B=heroes/anchor_prehook.jpg" [--track "S12=gfx/s12_track.json" …] --out qa_v6/

Per performance slot (the render file the assembler placed, over the placed frame range):
  garment_frac            what the wardrobe edit changed vs the master cut (Lab diff mask), mean
  temporal_residual       flow-compensated |I_k − warp(I_{k−1})| inside the garment, mean / p95
                          (native-rate flicker; lower = more stable)   [needs --masters]
  anchor_similarity       garment a/b histogram vs the Look's anchor frame (Bhattacharyya coeff,
                          1 = same distribution) — the canonical-Look consistency measure; the
                          report gives mean and SPREAD per Look across its shots
  silhouette IoU          matte integrity: motion-compensated IoU of the foreground silhouette
                          between consecutive frames (previous silhouette warped by the flow) —
                          a flickering matte pulls the 5th percentile down. Judged as a RATIO to
                          the same measure on the master footage (real video, no matte).
  wordmark                from the tracker's *_track.json when given: confidence, jitter, frames
                          not applied
Timeline: draft duration vs expected, audio stream present and its duration, each slot's frame
count vs the ShotSpec, cut frames as placed by the assembler (round(t·fps)).
Writes qa.json and a one-page sheet (qa_sheet.jpg). Exit code 0; verdicts are per check
("OK" / "CHECK") with the thresholds recorded in the JSON so a reviewer can see what was tested.
"""
import argparse, glob, json, os, subprocess, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "edit"))
from propagate_keyframe import decode, dis, flow_pair, garment_mask_from_edit, remap  # noqa: E402

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration,nb_frames,r_frame_rate:format=duration", "-of", "json", path], capture_output=True, text=True).stdout
    j = json.loads(out or "{}")
    streams = j.get("streams", []); fmt = j.get("format", {})
    v = next((s for s in streams if s.get("codec_type") == "video"), {}); a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    return {"duration": float(fmt.get("duration") or 0), "video_frames": int(v.get("nb_frames") or 0), "audio": None if a is None else float(a.get("duration") or fmt.get("duration") or 0)}

def ab_hist(im, mask):
    l = cv2.cvtColor(im, cv2.COLOR_BGR2LAB)
    h = cv2.calcHist([l], [1, 2], (mask > 0).astype(np.uint8), [32, 32], [0, 256, 0, 256])
    return cv2.normalize(h, None).flatten()

def person_silhouette(frame, plate_like):
    """Foreground = where the composite differs from a background estimate. With no plate we use
    the per-shot temporal median of the composite as the background (the person moves, the plate
    does not)."""
    d = np.abs(frame.astype(np.int16) - plate_like.astype(np.int16)).sum(axis=2)
    m = (d > 45).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return m

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draft", required=True); ap.add_argument("--assembly", required=True); ap.add_argument("--shotspecs", required=True)
    ap.add_argument("--masters", default=None, help='glob pattern with {shot}, e.g. "cuts/{shot}_master_*.mp4"')
    ap.add_argument("--edits", default=None, help='JSON map {shot: wardrobe-edit file} (the edit BEFORE environment compositing, same frame indexing as the master cut): the garment mask is edit-vs-master, and anchor similarity is measured on the edit so lighting matches the anchor')
    ap.add_argument("--anchor", action="append", default=[], help='"Look name=path" (the approved Look-on-artist frame)')
    ap.add_argument("--anchor-master", action="append", default=[], help='"Look name=path": the master frame the anchor was made from (better garment mask); optional')
    ap.add_argument("--track", action="append", default=[], help='"SHOT=path/to/_track.json" from garment_graphic_track.py')
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-residual", type=float, default=12.0); ap.add_argument("--min-anchor-sim", type=float, default=0.55); ap.add_argument("--max-anchor-spread", type=float, default=0.2)
    ap.add_argument("--min-silhouette-iou", type=float, default=0.85, help="matte (no master available): 5th percentile of the motion-compensated silhouette IoU between consecutive frames must stay above this")
    ap.add_argument("--min-silhouette-ratio", type=float, default=0.9, help="matte (master available): composite IoU p05 ÷ master IoU p05 must stay above this — the composite may not flicker more than the real footage segments")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x")); os.makedirs(a.out, exist_ok=True)
    asm = json.load(open(a.assembly)); spec = json.load(open(a.shotspecs)); shots = {s["id"]: s for s in spec["shots"]}
    anchors = {}
    for it in a.anchor:
        name, path = it.split("=", 1); im = cv2.resize(cv2.imread(path), (W, H), interpolation=cv2.INTER_AREA)
        am = None
        for it2 in a.anchor_master:
            n2, p2 = it2.split("=", 1)
            if n2 == name: am = garment_mask_from_edit(cv2.resize(cv2.imread(p2), (W, H)), im)
        if am is None: am = np.zeros((H, W), np.uint8); am[int(H * 0.3):int(H * 0.75), int(W * 0.2):int(W * 0.8)] = 255
        anchors[name] = ab_hist(im, am)
    edits = json.load(open(a.edits)) if a.edits else {}
    tracks = {}
    for it in a.track:
        sid, path = it.split("=", 1); tracks[sid] = json.load(open(path)).get("qa", {})
    engine = dis()
    report = {"draft": a.draft, "timeline": {}, "slots": [], "looks": {}, "thresholds": {"max_residual": a.max_residual, "min_anchor_sim": a.min_anchor_sim, "max_anchor_spread": a.max_anchor_spread, "min_silhouette_iou": a.min_silhouette_iou, "min_silhouette_ratio": a.min_silhouette_ratio}}

    # ---- timeline / audio ----
    p = probe(a.draft)
    exp = float(asm.get("expectedSeconds") or 0)
    cuts = []; t = 0.0
    for sl in asm["slots"]:
        cuts.append({"shot": sl["shot"], "draft_t": round(t, 4), "frame": int(round(t * a.fps)), "frames": sl["frames"], "transitionIn": sl.get("transitionIn")}); t += sl["frames"] / a.fps
    report["timeline"] = {"expected_seconds": exp, "draft_seconds": p["duration"], "duration_delta_ms": round((p["duration"] - exp) * 1000, 1),
                          "audio_present": p["audio"] is not None, "audio_seconds": p["audio"], "video_frames": p["video_frames"], "expected_frames": sum(sl["frames"] for sl in asm["slots"]),
                          "cuts": cuts, "verdict": "OK" if (abs(p["duration"] - exp) < 0.05 and p["audio"] is not None and abs((p["audio"] or 0) - exp) < 0.1) else "CHECK"}

    # ---- per slot ----
    tiles = []; per_look = {}
    for sl in asm["slots"]:
        if sl.get("kind") != "performance": continue
        sid = sl["shot"]; look = (shots.get(sid, {}).get("wardrobe") or {}).get("name") or ""
        n = int(sl["frames"]); off = float(sl.get("offsetInFile") or 0)
        rend = decode(sl["file"], W, H, a.fps); k0 = int(round(off * a.fps)); rend = rend[k0:k0 + n]
        rec = {"shot": sid, "look": look, "file": sl["file"], "frames": len(rend)}
        masters = None
        if a.masters:
            g = sorted(glob.glob(a.masters.format(shot=sid)))
            if g:
                m_all = decode(g[0], W, H, a.fps)
                # the render and the master cut both start at masterStart − handle, so frame k ↔ frame k
                masters = m_all[k0:k0 + n] if len(m_all) >= k0 + n else None
        edit = None
        if sid in edits:
            e_all = decode(edits[sid], W, H, a.fps); edit = e_all[k0:k0 + n] if len(e_all) >= k0 + n else None
        masks = []
        if masters is not None and len(masters) == len(rend):
            src = edit if (edit is not None and len(edit) == len(rend)) else rend
            masks = [garment_mask_from_edit(masters[k], src[k]) for k in range(len(rend))]
            rec["garment_frac"] = float(np.mean([(m > 0).mean() for m in masks])); rec["mask_source"] = "edit" if src is edit else "render"
        # flows k → k-1 on the placed render (used for the garment residual and the matte IoU)
        grays = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in rend]
        gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
        flows = {k: flow_pair(engine, grays[k], grays[k - 1]) for k in range(1, len(rend))}
        res = []
        for k in range(1, len(rend)):
            m = masks[k] if masks else None
            if m is None:
                m = np.zeros((H, W), np.uint8); m[int(H * 0.3):int(H * 0.8), int(W * 0.2):int(W * 0.8)] = 255
            if (m > 0).sum() < 200: continue
            f = flows[k]; prev_in_k = remap(rend[k - 1], gx + f[..., 0], gy + f[..., 1])
            d = np.abs(rend[k].astype(np.float32) - prev_in_k.astype(np.float32)).mean(axis=2)
            res.append(float(d[m > 0].mean()))
        rec["temporal_residual"] = {"mean": float(np.mean(res)), "p95": float(np.percentile(res, 95)), "masked": bool(masks)} if res else None
        # anchor similarity (on the edit when available: same lighting as the anchor frame)
        if look in anchors and masks:
            src = edit if (edit is not None and len(edit) == len(rend)) else rend
            sims = [float(1.0 - cv2.compareHist(anchors[look], ab_hist(src[k], masks[k]), cv2.HISTCMP_BHATTACHARYYA)) for k in range(0, len(rend), max(1, len(rend) // 12)) if (masks[k] > 0).sum() > 500]
            rec["anchor_similarity"] = {"mean": float(np.mean(sims)), "min": float(np.min(sims))} if sims else None
            per_look.setdefault(look, []).append(rec["anchor_similarity"]["mean"] if sims else None)
        # matte integrity: foreground silhouette (composite vs its own temporal-median background),
        # motion-compensated IoU between consecutive frames — a flickering matte lowers the IoU even
        # when the person moves, because the previous silhouette is warped by the flow first
        # The same measure on the MASTER footage (real video, no matte) is the reference: the metric
        # also reacts to motion and to the crude background estimate, so the composite is judged by
        # its RATIO to the master's value at the same frames, not by an absolute number.
        def sil_iou(frames_):
            bg = np.median(np.stack(frames_[::max(1, len(frames_) // 16)]), axis=0).astype(np.uint8)
            sil = [person_silhouette(f, bg) for f in frames_]; ious = []
            for k in range(1, len(frames_)):
                f = flows[k]; prev_in_k = remap(sil[k - 1], gx + f[..., 0], gy + f[..., 1], border=cv2.BORDER_CONSTANT) > 127; cur = sil[k] > 127
                u = (prev_in_k | cur).sum()
                if u > 500: ious.append(float((prev_in_k & cur).sum() / u))
            return sil, ious
        sil, ious = sil_iou(rend)
        rec["silhouette"] = {"area_mean": float(np.mean([(s_ > 0).mean() for s_ in sil])), "iou_mean": float(np.mean(ious)) if ious else None, "iou_p05": float(np.percentile(ious, 5)) if ious else None}
        if masters is not None and len(masters) == len(rend):
            _, ious_m = sil_iou(masters)
            rec["silhouette"]["iou_p05_master"] = float(np.percentile(ious_m, 5)) if ious_m else None
            rec["silhouette"]["ratio_to_master"] = (rec["silhouette"]["iou_p05"] / rec["silhouette"]["iou_p05_master"]) if (ious and ious_m and rec["silhouette"]["iou_p05_master"]) else None
        if sid in tracks: rec["wordmark"] = {k: tracks[sid].get(k) for k in ("confidence_mean", "confidence_min", "corner_jitter_px_p95", "frames_not_applied", "lost_fraction")}
        flags = []
        if rec.get("temporal_residual") and rec["temporal_residual"]["mean"] > a.max_residual: flags.append("temporal_residual")
        if rec.get("anchor_similarity") and rec["anchor_similarity"]["mean"] < a.min_anchor_sim: flags.append("anchor_similarity")
        r_ = rec["silhouette"].get("ratio_to_master")
        if r_ is not None:
            if r_ < a.min_silhouette_ratio: flags.append("silhouette_flicker")
        elif rec["silhouette"]["iou_p05"] is not None and rec["silhouette"]["iou_p05"] < a.min_silhouette_iou: flags.append("silhouette_flicker")
        rec["verdict"] = "CHECK" if flags else "OK"; rec["flags"] = flags
        report["slots"].append(rec)
        mid = rend[len(rend) // 2]; ov = mid.copy()
        if masks: ov[masks[len(rend) // 2] > 0] = (0.6 * ov[masks[len(rend) // 2] > 0] + 0.4 * np.array([0, 200, 0])).astype(np.uint8)
        t = cv2.resize(np.hstack([mid, ov]), None, fx=0.25, fy=0.25)
        txt = f"{sid} {look[:12]} {rec['verdict']} res={rec['temporal_residual']['mean'] if rec.get('temporal_residual') else 0:.1f} sim={rec.get('anchor_similarity', {}).get('mean', 0) if rec.get('anchor_similarity') else 0:.2f} iou05={rec['silhouette']['iou_p05'] or 0:.2f}/{rec['silhouette'].get('iou_p05_master') or 0:.2f}"
        cv2.putText(t, txt, (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1); tiles.append(t)
        print(json.dumps(rec), flush=True)
    for look, sims in per_look.items():
        v = [s for s in sims if s is not None]
        report["looks"][look] = {"shots": len(v), "anchor_similarity_mean": float(np.mean(v)) if v else None, "anchor_similarity_spread": float(np.max(v) - np.min(v)) if v else None,
                                 "verdict": "OK" if v and (np.max(v) - np.min(v)) <= a.max_anchor_spread and np.min(v) >= a.min_anchor_sim else "CHECK"}
    report["summary"] = {"timeline": report["timeline"]["verdict"], "slots_check": [s["shot"] for s in report["slots"] if s["verdict"] == "CHECK"], "looks": {k: v["verdict"] for k, v in report["looks"].items()}}
    json.dump(report, open(os.path.join(a.out, "qa.json"), "w"), indent=1)
    if tiles:
        rows = [np.hstack(tiles[i:i + 2]) if i + 1 < len(tiles) else np.hstack([tiles[i], np.zeros_like(tiles[i])]) for i in range(0, len(tiles), 2)]
        cv2.imwrite(os.path.join(a.out, "qa_sheet.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps({"summary": report["summary"], "timeline": {k: report["timeline"][k] for k in ("expected_seconds", "draft_seconds", "audio_present", "audio_seconds")}, "looks": report["looks"]}, indent=1))

if __name__ == "__main__":
    main()
