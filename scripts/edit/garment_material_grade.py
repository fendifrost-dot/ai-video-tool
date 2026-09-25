#!/usr/bin/env python3
"""
GARMENT MATERIAL GRADE — deterministic colour/contrast grade of a wardrobe edit's garment
towards the PRODUCT photo, plus suppression of the generator's contrast-outlined seams.

  python3 scripts/edit/garment_material_grade.py --edit s01_roll.mp4 --master cuts/S01_master.mp4 \\
      --product refs/trucker_flat.jpg --out s01_roll_graded.mp4 [--qa-dir qa/]

Why (YSL Look 2, 2026-09-25): every generator roll of the black denim jacket came back as a
washed grey-black with chalk-bright topstitching, and re-rolling reproduces it because the
approved anchor frame carries the same material. The product photo is the truth for MATERIAL:
its garment pixels say how dark, how blue and how contrasty the fabric is, and how visible the
stitching is (tonal, not white). Nothing here knows the Look's name: the product photo defines
the target, the edit-vs-master change defines where the garment is, the performer's skin chroma
and bright metal hardware are left alone.

Mechanism, per frame:
  1. region = pixels the edit changed vs the master, enclosed holes filled, temporal median;
     within it the FABRIC = pixels that are not skin (Lab chroma near the master's face/hand
     samples) and not hardware (small very bright blobs, kept as they are).
  2. TARGET from the product photo: its garment = everything darker than the photo background
     (Otsu on L); the target's L median and spread (p10–p90) and its a/b medians.
  3. GRADE: the fabric's L is contrast-matched (median → target median, spread → target spread,
     limited by --max-gain/--max-shift), its a/b medians shifted to the target's — one global
     mapping per clip (measured on the clip's median frame statistics) so the grade never
     flickers; blended in with a feathered region mask.
  4. SEAMS: thin bright ridges inside the fabric (white top-hat, --seam-kernel px, above
     --seam-thresh) are pulled --seam-strength of the way to their local background (the opening),
     so topstitching becomes tonal like the product's rather than erased.
QA: per-clip Lab medians before/after vs the target, per-frame seam pixel counts, a sheet.
"""
import argparse, json, os, subprocess, sys
import cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "qa"))
from propagate_keyframe import decode  # noqa: E402
from construction_score import garment_mask  # noqa: E402
from hero_gate import PoseModel, hand_patches, face_box  # noqa: E402


def write(path, frames, fps):
    H, W = frames[0].shape[:2]
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()


def product_target(product):
    lab = cv2.cvtColor(product, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0].astype(np.uint8)
    thr, _ = cv2.threshold(L, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    garment = lab[..., 0] < thr
    garment = cv2.morphologyEx(garment.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0
    px = lab[garment]
    return {"L_med": float(np.median(px[:, 0])), "L_p10": float(np.percentile(px[:, 0], 10)), "L_p90": float(np.percentile(px[:, 0], 90)),
            "a_med": float(np.median(px[:, 1])), "b_med": float(np.median(px[:, 2])), "otsu": float(thr), "garment_frac": float(garment.mean())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--edit", required=True); ap.add_argument("--master", required=True); ap.add_argument("--product", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--qa-dir", default=None)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--hole-max", type=float, default=0.03); ap.add_argument("--temporal", type=int, default=3)
    ap.add_argument("--max-gain", type=float, default=1.6, help="upper bound on the L contrast gain"); ap.add_argument("--min-gain", type=float, default=0.6)
    ap.add_argument("--max-shift", type=float, default=45.0, help="upper bound on the L median shift (Lab units)"); ap.add_argument("--max-ab-shift", type=float, default=12.0)
    ap.add_argument("--clusters", type=int, default=4); ap.add_argument("--material-l-gap", type=float, default=15.0, help="the graded material is the largest cluster at least this much lighter than the darkest cluster")
    ap.add_argument("--fabric-l-max", type=float, default=150.0, help="fabric statistics are taken on region pixels darker than this (hardware and skin highlights excluded)")
    ap.add_argument("--hardware-l-min", type=float, default=175.0); ap.add_argument("--hardware-max-px", type=int, default=600)
    ap.add_argument("--skin-de", type=float, default=22.0); ap.add_argument("--skin-lw", type=float, default=0.5)
    ap.add_argument("--skin-face-scale", type=float, default=1.6); ap.add_argument("--skin-hand-radius", type=float, default=0.16, help="skin is excluded only inside the face box and hand discs (torso-scale units)")
    ap.add_argument("--seam-kernel", type=int, default=7); ap.add_argument("--seam-thresh", type=float, default=22.0); ap.add_argument("--seam-strength", type=float, default=0.75)
    ap.add_argument("--feather", type=float, default=3.0)
    ap.add_argument("--still", action="append", default=[], help="master.jpg=edit.jpg=out.jpg — also apply the clip's mapping to a still (the Look's anchor frame) so downstream colour references carry the graded material")
    a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split("x"))
    master = decode(a.master, W, H, a.fps); edit = decode(a.edit, W, H, a.fps); n = min(len(master), len(edit)); master, edit = master[:n], edit[:n]
    product = cv2.imread(a.product); target = product_target(product)
    print("target (product photo, Lab OpenCV scale):", {k: round(v, 1) for k, v in target.items()}, flush=True)
    # skin model from the master's own face and hands (as garment_island_eraser does)
    pose = PoseModel(); skin_px = []
    for i in range(0, n, max(1, n // 12)):
        lm = pose.detect(master[i])
        if lm is None: continue
        Lm = cv2.cvtColor(master[i], cv2.COLOR_BGR2LAB).astype(np.float32)
        x0, y0, x1, y1 = face_box(lm, W, H, 1.0); fb = Lm[y0:y1, x0:x1].reshape(-1, 3)
        if len(fb) > 100: skin_px.append(fb[:: max(1, len(fb) // 400)])
        for _, disc in hand_patches(lm, W, H, 0.06):
            if disc.sum() > 50: skin_px.append(Lm[disc][:: max(1, int(disc.sum()) // 200)])
    skin = None
    if skin_px:
        px = np.concatenate(skin_px).astype(np.float32); med = np.median(px, axis=0)
        dm = np.sqrt(a.skin_lw * (px[:, 0] - med[0]) ** 2 + ((px[:, 1:] - med[1:]) ** 2).sum(axis=1)); px = px[dm <= 60]
        _, _, skin = cv2.kmeans(px, 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    # pass 1: regions + fabric statistics per frame
    regions = []; stats = []
    for i in range(n):
        gm = garment_mask(master[i], edit[i]); gm = cv2.morphologyEx(gm, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        nh, hl, hs, _ = cv2.connectedComponentsWithStats((gm == 0).astype(np.uint8), connectivity=4)
        for hj in range(1, nh):
            x, y, w, h, ar = hs[hj]
            if ar <= a.hole_max * H * W and x > 0 and y > 0 and x + w < W and y + h < H: gm[hl == hj] = 255
        regions.append(gm)
    if a.temporal > 1:
        t = a.temporal // 2
        regions = [(np.median(np.stack(regions[max(0, i - t):i + t + 1]), axis=0) > 127).astype(np.uint8) * 255 for i in range(n)]
    # skin is excluded only where skin can be — the face box and hand discs of the frame's own
    # pose — because a dark complexion and a shaded grey-black garment overlap in Lab and a
    # colour-only test would hand the jacket's shadows to the skin model
    skin_zones = {}
    for i in range(n):
        z = np.zeros((H, W), bool); lm = pose.detect(edit[i])
        if lm is None: lm = pose.detect(master[i])
        if lm is not None:
            x0, y0, x1, y1 = face_box(lm, W, H, a.skin_face_scale); z[y0:y1, x0:x1] = True
            for _, disc in hand_patches(lm, W, H, a.skin_hand_radius): z |= disc
        skin_zones[i] = z
    def fabric_mask(i):
        Le = cv2.cvtColor(edit[i], cv2.COLOR_BGR2LAB).astype(np.float32); reg = regions[i] > 0
        fab = reg.copy()
        if skin is not None and skin_zones[i].any():
            v = Le.reshape(-1, 3); d = np.sqrt(a.skin_lw * (v[:, None, 0] - skin[None, :, 0]) ** 2 + ((v[:, None, 1:] - skin[None, :, 1:]) ** 2).sum(axis=2)).min(axis=1).reshape(H, W)
            fab &= ~((d <= a.skin_de) & skin_zones[i])
        hw = ((Le[..., 0] > a.hardware_l_min) & reg).astype(np.uint8)
        nc, cl, cs, _ = cv2.connectedComponentsWithStats(hw, connectivity=8)
        for c in range(1, nc):
            if cs[c, cv2.CC_STAT_AREA] <= a.hardware_max_px: fab[cl == c] = False
        return fab, Le
    # the MATERIAL being graded is the region's dominant colour cluster that is not the darkest one
    # (a black tee and black trousers under a grey-black jacket are the darkest cluster; a mastic
    # jacket over black trousers is the dominant lighter one): k-means on the fabric pixels of
    # sampled frames, then every frame's pixels are assigned to a cluster by nearest centre
    samples = []
    for i in range(0, n, max(1, n // 16)):
        fab, Le = fabric_mask(i); px = Le[fab & (Le[..., 0] < a.fabric_l_max)]
        if len(px) > 500: samples.append(px[:: max(1, len(px) // 3000)])
    px = np.concatenate(samples).astype(np.float32)
    _, labels, centres = cv2.kmeans(px, a.clusters, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=a.clusters); darkest = int(np.argmin(centres[:, 0]))
    eligible = [c for c in range(a.clusters) if c != darkest and centres[c, 0] > centres[darkest, 0] + a.material_l_gap]
    material = eligible if eligible else [int(np.argmax(counts))]           # every lighter cluster: one fabric lit and shaded
    print("clusters (L,a,b · share):", [([round(float(x)) for x in centres[c]], round(float(counts[c] / counts.sum()), 2)) for c in range(a.clusters)], "material =", material, flush=True)
    # membership is a lightness threshold, not nearest-centre: the shaded half of a mid-grey jacket
    # sits between the black tee centre and the lit-jacket centre and would otherwise be handed to
    # the tee; everything lighter than the darkest cluster by the gap is the material
    l_floor = float(centres[darkest, 0] + a.material_l_gap) if eligible else -1.0
    print(f"material lightness floor: L > {l_floor:.1f}", flush=True)
    def material_mask(i):
        fab, Le = fabric_mask(i)
        return fab & (Le[..., 0] > l_floor), Le
    for i in range(0, n, max(1, n // 16)):
        mat, Le = material_mask(i); px = Le[mat]
        if len(px) > 500: stats.append([np.median(px[:, 0]), np.percentile(px[:, 0], 10), np.percentile(px[:, 0], 90), np.median(px[:, 1]), np.median(px[:, 2])])
    st = np.median(np.array(stats), axis=0); L_med, L_p10, L_p90, a_med, b_med = (float(x) for x in st)
    gain = float(np.clip((target["L_p90"] - target["L_p10"]) / max(1.0, L_p90 - L_p10), a.min_gain, a.max_gain))
    shift = float(np.clip(target["L_med"] - L_med, -a.max_shift, a.max_shift))
    da = float(np.clip(target["a_med"] - a_med, -a.max_ab_shift, a.max_ab_shift)); db = float(np.clip(target["b_med"] - b_med, -a.max_ab_shift, a.max_ab_shift))
    print(f"fabric before: L {L_med:.1f} (p10 {L_p10:.1f}, p90 {L_p90:.1f}) a {a_med:.1f} b {b_med:.1f} → gain {gain:.2f}, L shift {shift:+.1f}, a {da:+.1f}, b {db:+.1f}", flush=True)
    outs = []; seam_px = []
    k = np.ones((a.seam_kernel, a.seam_kernel), np.uint8)
    for i in range(n):
        fab, Le = material_mask(i)
        L = Le[..., 0]
        # seams: bright thin ridges inside the fabric → pulled towards their local background
        opened = cv2.morphologyEx(L, cv2.MORPH_OPEN, k); tophat = L - opened
        seam = (tophat > a.seam_thresh) & fab
        L2 = L.copy(); L2[seam] = L[seam] - a.seam_strength * tophat[seam]
        # grade (global, contrast-matched)
        L3 = (L2 - L_med) * gain + L_med + shift
        Lab2 = Le.copy(); Lab2[..., 0] = np.clip(L3, 0, 255); Lab2[..., 1] = np.clip(Le[..., 1] + da, 0, 255); Lab2[..., 2] = np.clip(Le[..., 2] + db, 0, 255)
        graded = cv2.cvtColor(Lab2.astype(np.uint8), cv2.COLOR_LAB2BGR)
        w = cv2.GaussianBlur(fab.astype(np.float32), (0, 0), a.feather)[..., None]
        outs.append(np.clip(edit[i] * (1 - w) + graded * w, 0, 255).astype(np.uint8)); seam_px.append(int(seam.sum()))
    write(a.out, outs, a.fps)
    for spec in a.still:
        mp, ep, op = spec.split("=")
        ms, es = cv2.resize(cv2.imread(mp), (W, H)), cv2.resize(cv2.imread(ep), (W, H))
        gm = garment_mask(ms, es); gm = cv2.morphologyEx(gm, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
        Ls = cv2.cvtColor(es, cv2.COLOR_BGR2LAB).astype(np.float32); fab = (gm > 0) & (Ls[..., 0] > l_floor)
        lm = pose.detect(es)
        if lm is not None and skin is not None:
            z = np.zeros((H, W), bool); x0, y0, x1, y1 = face_box(lm, W, H, a.skin_face_scale); z[y0:y1, x0:x1] = True
            for _, disc in hand_patches(lm, W, H, a.skin_hand_radius): z |= disc
            v = Ls.reshape(-1, 3); d = np.sqrt(a.skin_lw * (v[:, None, 0] - skin[None, :, 0]) ** 2 + ((v[:, None, 1:] - skin[None, :, 1:]) ** 2).sum(axis=2)).min(axis=1).reshape(H, W)
            fab &= ~((d <= a.skin_de) & z)
        hw = ((Ls[..., 0] > a.hardware_l_min) & (gm > 0)).astype(np.uint8); nc, cl, cs, _ = cv2.connectedComponentsWithStats(hw, connectivity=8)
        for c in range(1, nc):
            if cs[c, cv2.CC_STAT_AREA] <= a.hardware_max_px: fab[cl == c] = False
        L = Ls[..., 0]; opened = cv2.morphologyEx(L, cv2.MORPH_OPEN, k); tophat = L - opened; seam = (tophat > a.seam_thresh) & fab
        L2 = L.copy(); L2[seam] = L[seam] - a.seam_strength * tophat[seam]
        Lab2 = Ls.copy(); Lab2[..., 0] = np.clip((L2 - L_med) * gain + L_med + shift, 0, 255); Lab2[..., 1] = np.clip(Ls[..., 1] + da, 0, 255); Lab2[..., 2] = np.clip(Ls[..., 2] + db, 0, 255)
        graded = cv2.cvtColor(Lab2.astype(np.uint8), cv2.COLOR_LAB2BGR); w = cv2.GaussianBlur(fab.astype(np.float32), (0, 0), a.feather)[..., None]
        cv2.imwrite(op, np.clip(es * (1 - w) + graded * w, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95]); print("graded still →", op, "fabric px", int(fab.sum()), flush=True)
    # after statistics
    after = []
    for i in range(0, n, max(1, n // 16)):
        fab, _ = material_mask(i); Lo = cv2.cvtColor(outs[i], cv2.COLOR_BGR2LAB).astype(np.float32); px = Lo[fab]
        if len(px) > 500: after.append([np.median(px[:, 0]), np.median(px[:, 1]), np.median(px[:, 2])])
    af = np.median(np.array(after), axis=0) if after else [None] * 3
    qa = {"frames": n, "target": target, "before": {"L_med": L_med, "L_p10": L_p10, "L_p90": L_p90, "a_med": a_med, "b_med": b_med}, "mapping": {"gain": gain, "L_shift": shift, "da": da, "db": db},
          "after": {"L_med": float(af[0]), "a_med": float(af[1]), "b_med": float(af[2])} if after else None, "seam_px_median": float(np.median(seam_px)), "seam_px_max": int(max(seam_px))}
    if a.qa_dir:
        os.makedirs(a.qa_dir, exist_ok=True); json.dump(qa, open(os.path.join(a.qa_dir, "grade_qa.json"), "w"), indent=1)
        idx = [int(n * f) for f in (0.1, 0.4, 0.7, 0.95)]
        rows = [np.hstack([edit[i], outs[i]]) for i in idx]
        sheet = np.vstack(rows); cv2.imwrite(os.path.join(a.qa_dir, "grade_sheet.jpg"), cv2.resize(sheet, (sheet.shape[1] // 2, sheet.shape[0] // 2)), [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(json.dumps({k: v for k, v in qa.items()}, default=float))


if __name__ == "__main__":
    main()
