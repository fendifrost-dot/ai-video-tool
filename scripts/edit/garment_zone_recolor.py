#!/usr/bin/env python3
"""
GARMENT ZONE RECOLOUR — inside a pose-defined zone of the garment, recolour an intruding
material toward the anchor's own garment class while keeping the material's texture.

  python3 scripts/edit/garment_zone_recolor.py --edit s09.mp4 --master cuts/S09_master.mp4 \\
      --anchor heroes/anchor.jpg --anchor-master heroes/anchor_master.jpg --zone wrists \\
      --out s09_cuffs.mp4 [--qa-dir qa/]

Why (S09, 2026-09-26): the generator rendered the track jacket's cuffs as WHITE rib knit; the
product and the approved anchor have mastic cuffs. A cuff is a rib knit either way — the
structure is right, the colour is wrong — so the repair is a recolour, not a repaint: the
intruding pixels' Lab distribution is mapped onto the anchor body class (median shift on a/b,
L shifted and contrast-scaled to the target's spread), which keeps the ribs.

Mechanism (nothing here is shot-specific):
  1. The anchor's colour classes are learned exactly as hem_repair/construction_score do; the
     BODY class (dominant around the stripe landmark) is the recolour target.
  2. The ZONE is placed from the frame's own pose: `wrists` = a disc of --zone-radius torso
     scales around each seen wrist (sleeve ends); `neck` = the box between chin and shoulders
     (collar). Only the changed-region (garment) pixels inside the zone are candidates.
  3. The INTRUDER inside the zone is hem_repair's intruder model (light, colour-neutral, textured
     or bright) — the same CLI thresholds — never skin (hand discs excluded).
  4. Recolour: Lab of intruder pixels → target: a/b shifted by the medians' difference; L mapped
     with gain = (target p90−p10)/(intruder p90−p10) (clipped) around the medians, so a white rib
     becomes a mastic rib with the same relief; a temporal median on the mask and a feathered edge.

QA: per-frame intruder pixel counts, before/after Lab medians, a before | mask | after sheet.
"""
import argparse, glob, json, os, sys
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "qa"))
import construction_score as C  # noqa: E402
from propagate_keyframe import decode  # noqa: E402
from hem_repair import intruder_map, encode  # noqa: E402
from hero_gate import PoseModel, hand_patches, face_box, torso_scale  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edit", required=True); ap.add_argument("--master", required=True); ap.add_argument("--anchor", required=True); ap.add_argument("--anchor-master", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--qa-dir", default=None); ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--zone", choices=["wrists", "neck"], default="wrists"); ap.add_argument("--zone-radius", type=float, default=0.22, help="wrists: disc radius in torso scales")
    ap.add_argument("--hand-radius", type=float, default=0.10, help="skin disc excluded around each hand (torso scales)")
    ap.add_argument("--classes", type=int, default=6); ap.add_argument("--class-radius", type=float, default=28.0)
    ap.add_argument("--intruder-l-min", type=float, default=110.0); ap.add_argument("--intruder-b-max", type=float, default=137.0); ap.add_argument("--intruder-a-max", type=float, default=134.0)
    ap.add_argument("--intruder-texture-min", type=float, default=12.0); ap.add_argument("--intruder-l-bright", type=float, default=170.0); ap.add_argument("--intruder-grow", type=int, default=25); ap.add_argument("--intruder-texture-hi", type=float, default=40.0)
    ap.add_argument("--min-blob", type=int, default=60); ap.add_argument("--temporal", type=int, default=5); ap.add_argument("--feather", type=float, default=2.0)
    ap.add_argument("--min-gain", type=float, default=0.5); ap.add_argument("--max-gain", type=float, default=1.5)
    a = ap.parse_args()
    W, H = (int(v) for v in a.size.split("x"))
    masters = glob.glob(a.master); assert masters, f"no master matches {a.master}"
    master = decode(masters[0], W, H, a.fps); edit = decode(a.edit, W, H, a.fps); n = min(len(master), len(edit)); master, edit = master[:n], edit[:n]
    anchor = cv2.resize(cv2.imread(a.anchor), (W, H)); amaster = cv2.resize(cv2.imread(a.anchor_master), (W, H))
    amask = C.garment_mask(amaster, anchor); centres, _ = C.learn_classes(anchor, amask, a.classes); acls = C.classify(anchor, centres, a.class_radius)
    alm = C.landmark(acls, amask, list(range(len(centres))), 0.12, 0.25, (0.12, 0.7))
    if alm is None: raise SystemExit("anchor: no stripe landmark")
    r, h = alm["row"], alm["height"]; win = np.zeros_like(amask); win[max(0, r - 3 * h):r + 5 * h] = 255; win &= amask
    counts = np.bincount(acls[win > 0], minlength=len(centres) + 1)[: len(centres)]; counts[alm["class"]] = 0; body = int(counts.argmax())
    alab = cv2.cvtColor(anchor, cv2.COLOR_BGR2LAB).astype(np.float32); tpx = alab[(acls == body) & (amask > 0)]
    target = {"L_med": float(np.median(tpx[:, 0])), "L_p10": float(np.percentile(tpx[:, 0], 10)), "L_p90": float(np.percentile(tpx[:, 0], 90)), "a_med": float(np.median(tpx[:, 1])), "b_med": float(np.median(tpx[:, 2]))}
    print("target (anchor body class):", {k: round(v, 1) for k, v in target.items()}, flush=True)
    pose = PoseModel(); masks = []; zones = []
    for k in range(n):
        lm = pose.detect(edit[k]); z = np.zeros((H, W), bool)
        if lm is not None:
            ts = torso_scale(lm)
            if a.zone == "wrists":
                for wi in (15, 16):
                    if lm[wi, 3] >= 0.5 and lm[wi, 2] >= 0.3: cv2.circle(zm := np.zeros((H, W), np.uint8), (int(lm[wi, 0]), int(lm[wi, 1])), int(a.zone_radius * ts), 255, -1); z |= zm > 0
            else:
                x0, y0, x1, y1 = face_box(lm, W, H, 1.0); chin = int(min(H, lm[0, 1] + 1.0 * np.linalg.norm(lm[7, :2] - lm[8, :2])))
                sh = int((lm[11, 1] + lm[12, 1]) / 2 + 0.12 * ts); xl, xr = int(min(lm[11, 0], lm[12, 0]) - 0.1 * ts), int(max(lm[11, 0], lm[12, 0]) + 0.1 * ts)
                z[max(0, chin - int(0.05 * ts)):sh, max(0, xl):min(W, xr)] = True
            for _, disc in hand_patches(lm, W, H, a.hand_radius): z &= ~disc
        gm = C.garment_mask(master[k], edit[k]) > 0
        m = (intruder_map(edit[k], a) & z & gm).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        nc, cl, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        for c in range(1, nc):
            if st[c, cv2.CC_STAT_AREA] < a.min_blob: m[cl == c] = 0
        masks.append(m); zones.append(z)
    if a.temporal > 1:
        t = a.temporal // 2; masks = [(np.median(np.stack(masks[max(0, k - t):k + t + 1]), axis=0) > 127).astype(np.uint8) * 255 for k in range(n)]
    outs = []; px_series = []; befores = []; afters = []
    for k in range(n):
        m = masks[k] > 0; f = edit[k]; px_series.append(int(m.sum()))
        if m.sum() < a.min_blob: outs.append(f); continue
        lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32); src = lab[m]
        L_med, L_p10, L_p90 = float(np.median(src[:, 0])), float(np.percentile(src[:, 0], 10)), float(np.percentile(src[:, 0], 90))
        gain = float(np.clip((target["L_p90"] - target["L_p10"]) / max(1.0, L_p90 - L_p10), a.min_gain, a.max_gain))
        lab2 = lab.copy()
        lab2[..., 0] = np.clip((lab[..., 0] - L_med) * gain + target["L_med"], 0, 255)
        lab2[..., 1] = np.clip(lab[..., 1] + (target["a_med"] - float(np.median(src[:, 1]))), 0, 255)
        lab2[..., 2] = np.clip(lab[..., 2] + (target["b_med"] - float(np.median(src[:, 2]))), 0, 255)
        rec = cv2.cvtColor(lab2.astype(np.uint8), cv2.COLOR_LAB2BGR)
        w = cv2.GaussianBlur(m.astype(np.float32), (0, 0), a.feather)[..., None]
        out = np.clip(f.astype(np.float32) * (1 - w) + rec.astype(np.float32) * w, 0, 255).astype(np.uint8); outs.append(out)
        befores.append([L_med, float(np.median(src[:, 1])), float(np.median(src[:, 2]))]); o = cv2.cvtColor(out, cv2.COLOR_BGR2LAB).astype(np.float32)[m]; afters.append([float(np.median(o[:, 0])), float(np.median(o[:, 1])), float(np.median(o[:, 2]))])
    encode(outs, a.fps, a.edit, a.out)
    qa = {"edit": a.edit, "out": a.out, "frames": n, "zone": a.zone, "target": target, "frames_recoloured": int(sum(1 for p in px_series if p >= a.min_blob)), "intruder_px_median": float(np.median(px_series)), "intruder_px_max": int(max(px_series)),
          "before_med": np.median(np.array(befores), axis=0).tolist() if befores else None, "after_med": np.median(np.array(afters), axis=0).tolist() if afters else None}
    if a.qa_dir:
        os.makedirs(a.qa_dir, exist_ok=True); json.dump(qa, open(os.path.join(a.qa_dir, "recolor_qa.json"), "w"), indent=1)
        idx = [int(n * f) for f in (0.1, 0.4, 0.7, 0.95)]; rows = []
        for i in idx:
            mv = cv2.cvtColor(masks[i], cv2.COLOR_GRAY2BGR); mv[zones[i] & ~(masks[i] > 0)] = (60, 60, 60)
            rows.append(np.hstack([edit[i], mv, outs[i]]))
        sheet = np.vstack(rows); cv2.imwrite(os.path.join(a.qa_dir, "recolor_sheet.jpg"), cv2.resize(sheet, (sheet.shape[1] // 3, sheet.shape[0] // 3)), [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(json.dumps(qa))


if __name__ == "__main__":
    main()
