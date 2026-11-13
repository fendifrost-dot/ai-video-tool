"""matte_stability.py: does a matte hold still where he holds still? $0, offline, no models.

usage:
  python -I scripts/edit/matte_stability.py <alpha.mp4> [--baseline <alpha.mp4>] [--fg <fg.mp4>]
         [--box name=x0,y0,x1,y1 ...] [--max-flagged N] [--json out.json]
  python -I scripts/edit/matte_stability.py --selftest

What it counts, per frame and per region (top / middle / bottom third of everything the matte ever covers, plus any
--box), in matte pixels:
  dropout  solid (>0.8) on the frames either side, gone (<0.5) on this one, for 1 to --max-dip frames (default 4):
           a leg that fades and comes back (Hyenas v6, 13 Nov 2026), a chain link that blinks out.
  pop-in   empty (<0.2) either side, solid (>0.5) on this one: a ghost patch.
  see-through  partly transparent (0.1 to 0.9) at least --inset px inside his solid outline and as far from any empty
           (<0.1) pixel, on any frame: the plate showing through him where two foreground things meet (Hyenas v6, 13
           Nov: the bottom of his right leg over the hyena's back, on every frame looked at). Steady, so dropout and
           pop-in miss it. A real gap (between arm and body, inside the chain) is empty, so it is not counted.
  With --baseline (the matte as the provider delivered it), what the candidate changed:
  added    candidate >0.5 where the baseline is <0.1: alpha the change invented. Each such pixel shows the fill
           picture where the provider said he is not (the ghost trail of a held or "dip-filled" matte).
  removed  candidate <0.1 where the baseline is >0.5: alpha the change erased (a choke that ate the chain).
  With --fg (the picture the matte cuts out): frame counts must match (c044 white edge, 16 Oct: matte one frame
  ahead), and repeated frames are reported (c033 room 2, 19 Oct: 24p content in a 59.94 file made the outline pop on
  every new picture; the fix there was compositing-only, docs/research/results/2026-10-19-blender-showroom/).

Pass mark for posting a changed matte (docs/PROBLEM_INDEX.md, "Matte flicker"):
  - every region's flagged frames are no higher than the baseline's (run this once on the baseline alone);
  - "added" is 0 outside the region the change was meant for, and the change was meant for one region only;
  - the bottom region (legs, feet, a creature on the floor) is reported, not just the box that was being fixed.
The exit code is 1 when any region has more than --max-flagged flagged frames (default: no limit, report only).
"""
import argparse, json, sys
import numpy as np, cv2

SOLID, GONE, EMPTY, SHOWN = 0.8, 0.5, 0.2, 0.5


def read_alpha(path):
    c = cv2.VideoCapture(path); out = []
    while True:
        ok, f = c.read()
        if not ok: break
        out.append((f[..., 0] if f.ndim == 3 else f).astype(np.float32) / 255.0)
    if not out: sys.exit(f"no frames in {path}")
    return out


def frame_info(path):
    c = cv2.VideoCapture(path); prev = None; n = 0; repeats = []
    while True:
        ok, f = c.read()
        if not ok: break
        g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None and float(np.abs(g - prev).mean()) < 0.5: repeats.append(n)
        prev = g; n += 1
    return n, c.get(cv2.CAP_PROP_FPS), repeats


def events(A, max_dip=4):
    """Per frame: boolean maps of dropout and pop-in pixels."""
    n = len(A); drop = [np.zeros(A[0].shape, bool) for _ in range(n)]; pop = [np.zeros(A[0].shape, bool) for _ in range(n)]
    for k in range(1, n - 1):
        drop[k] |= (A[k - 1] > SOLID) & (A[k + 1] > SOLID) & (A[k] < GONE)
        pop[k] |= (A[k - 1] < EMPTY) & (A[k + 1] < EMPTY) & (A[k] > SHOWN)
    for L in range(2, max_dip + 1):  # dips of 2..max_dip frames (Hyenas v6: his lower leg gone for 3-4 frames)
        for k in range(1, n - L):
            d = (A[k - 1] > SOLID) & (A[k + L] > SOLID)
            for j in range(L): d &= A[k + j] < GONE
            for j in range(L): drop[k + j] |= d
    return drop, pop


def see_through(A, inset):
    """Per frame: boolean map of partly transparent pixels deep inside him (not at an outline, not at a real gap)."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * inset + 1, 2 * inset + 1)); out = []
    for a in A:
        solid = (a > SHOWN).astype(np.uint8)
        h, w = solid.shape; flood = solid.copy(); mask = np.zeros((h + 2, w + 2), np.uint8)
        border = [(x, y) for x in range(0, w, 8) for y in (0, h - 1)] + [(x, y) for y in range(0, h, 8) for x in (0, w - 1)]
        for x, y in border:
            if flood[y, x] == 0: cv2.floodFill(flood, mask, (x, y), 2)
        filled = (flood != 2).astype(np.uint8)                      # his silhouette with its holes filled
        deep = cv2.erode(filled, k) > 0
        far = cv2.erode((a >= 0.1).astype(np.uint8), k) > 0       # at least inset px from any empty pixel
        out.append(deep & far & (a >= 0.1) & (a < 0.9))
    return out


def regions(A, boxes):
    cover = np.max(np.stack(A), 0) > SHOWN
    ys, xs = np.nonzero(cover)
    R = {}
    if len(ys):
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        t = (y1 - y0) / 3.0
        for i, name in enumerate(("top", "middle", "bottom")):
            R[name] = (x0, int(y0 + i * t), x1, int(y0 + (i + 1) * t) if i < 2 else y1)
    R.update(boxes)
    return R


def count(maps, box):
    x0, y0, x1, y1 = box
    return [int(m[y0:y1, x0:x1].sum()) for m in maps]


def analyse(A, boxes, flag_px, B=None, inset=6, max_dip=4):
    drop, pop = events(A, max_dip); seen = see_through(A, inset); R = regions(B if B is not None else A, boxes); rep = {}
    for name, box in R.items():
        d, p = count(drop, box), count(pop, box)
        r = {"box": [int(v) for v in box], "dropout_px": sum(d), "popin_px": sum(p),
             "flagged_frames": [k for k in range(len(A)) if d[k] + p[k] > flag_px]}
        st = count(seen, box)
        r["see_through_px"] = sum(st); r["see_through_frames"] = [k for k in range(len(A)) if st[k] > flag_px]
        if B is not None:
            added = [(a > SHOWN) & (b < 0.1) for a, b in zip(A, B)]
            removed = [(a < 0.1) & (b > SHOWN) for a, b in zip(A, B)]
            r["added_px"] = sum(count(added, box)); r["removed_px"] = sum(count(removed, box))
        rep[name] = r
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("alpha", nargs="?"); ap.add_argument("--baseline"); ap.add_argument("--fg")
    ap.add_argument("--box", action="append", default=[], help="name=x0,y0,x1,y1 in matte pixels")
    ap.add_argument("--flag-px", type=int, default=40, help="dropout+pop-in pixels that flag a frame (default 40)")
    ap.add_argument("--max-dip", type=int, default=4, help="longest dropout counted, in frames (default 4)")
    ap.add_argument("--inset", type=int, default=6, help="px inside his outline and away from gaps for see-through (default 6)")
    ap.add_argument("--max-flagged", type=int, default=-1); ap.add_argument("--json")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest: return selftest()
    if not a.alpha: ap.error("alpha is required")
    boxes = {}
    for b in a.box:
        name, v = b.split("="); boxes[name] = tuple(int(x) for x in v.split(","))
    A = read_alpha(a.alpha); B = read_alpha(a.baseline) if a.baseline else None
    out = {"alpha": a.alpha, "frames": len(A)}
    if B is not None:
        if len(B) != len(A) or B[0].shape != A[0].shape: sys.exit(f"baseline {len(B)} frames {B[0].shape} vs {len(A)} {A[0].shape}")
        out["baseline"] = analyse(B, boxes, a.flag_px, inset=a.inset, max_dip=a.max_dip)
    out["candidate"] = analyse(A, boxes, a.flag_px, B, a.inset, a.max_dip)
    if a.fg:
        n, fps, rep = frame_info(a.fg)
        out["fg"] = {"frames": n, "fps": round(fps, 3), "repeated_frames": len(rep), "first_repeats": rep[:12]}
        print(f"fg: {n} frames at {fps:.3f} fps; matte {len(A)} frames" + ("" if n == len(A) else "  <-- MISMATCH: pair frame by frame or the outline lags (c044)"))
        if rep: print(f"fg: {len(rep)} frames repeat the previous picture (first {rep[:12]}): cadence; see PROBLEM_INDEX 'outline pops on a new picture'")
    print(f"{len(A)} frames. Per region: dropout px / pop-in px / flagged frames / see-through frames" + (" / added px / removed px vs baseline" if B is not None else ""))
    worst = 0
    for name, r in out["candidate"].items():
        line = (f"  {name:8s} {r['dropout_px']:8d} {r['popin_px']:8d} {len(r['flagged_frames']):4d} {r['flagged_frames'][:10]}"
                f"  see-through {len(r['see_through_frames'])} ({r['see_through_px']} px)")
        if B is not None:
            b = out["baseline"][name]
            line += f"  | added {r['added_px']} removed {r['removed_px']}  (baseline flagged {len(b['flagged_frames'])})"
        print(line); worst = max(worst, len(r["flagged_frames"]), len(r["see_through_frames"]))
    if a.json: json.dump(out, open(a.json, "w"), indent=1)
    return 1 if (a.max_flagged >= 0 and worst > a.max_flagged) else 0


def selftest():
    """A standing figure with a leg that drops out for 2 frames, then a fixed-position 'dip fill' of a moving bar."""
    H, W, n = 120, 90, 20
    A = []
    for k in range(n):
        a = np.zeros((H, W), np.float32); a[10:100, 30:60] = 1.0           # body
        if k not in (8, 9): a[100:118, 35:45] = 1.0                        # leg, gone on frames 8-9
        A.append(a)
    r = analyse(A, {}, 10)
    assert r["bottom"]["flagged_frames"] == [8, 9], r["bottom"]
    assert r["top"]["flagged_frames"] == [] and r["middle"]["flagged_frames"] == [], r
    # a bar moving 6 px a frame and swinging back: a fixed-position fill "solid before and after -> solid now" invents
    # alpha where the bar is not (the Hyenas v7 failure); --baseline reports it as added.
    base, cand = [], []
    xs = [10, 16, 22, 16, 10, 16, 22, 16, 10, 16]
    for x in xs:
        a = np.zeros((40, 60), np.float32); a[5:35, x:x + 8] = 1.0; base.append(a)
    for k in range(len(base)):
        prev, nxt = base[max(0, k - 1)], base[min(len(base) - 1, k + 1)]
        cand.append(np.maximum(base[k], np.minimum(prev, nxt)))
    r = analyse(cand, {}, 10, base)
    added = sum(v["added_px"] for v in r.values())
    assert added > 0, r
    assert sum(v["removed_px"] for v in r.values()) == 0
    # a leg at alpha 0.6 on every frame where it crosses something: steady, so no dropout, but see-through on all frames;
    # a real gap (alpha 0) between arm and body is not see-through.
    S = []
    for k in range(6):
        a = np.zeros((120, 90), np.float32); a[10:110, 20:70] = 1.0
        a[80:100, 35:55] = 0.6                                              # the plate shows through his leg
        a[20:40, 25:35] = 0.0                                               # a real gap, enclosed
        S.append(a)
    r = analyse(S, {}, 10)
    assert sum(len(v["flagged_frames"]) for v in r.values()) == 0, r
    assert r["bottom"]["see_through_frames"] == list(range(6)) and r["top"]["see_through_frames"] == [], r
    print(f"selftest ok: leg dropout found on frames 8-9 only; fixed-position fill invented {added} px of alpha; a steady see-through leg found, a real gap not")
    return 0


if __name__ == "__main__":
    sys.exit(main())
