"""matte_repair.py: give back to the matte, frame by frame, a dark garment the provider matte dropped. $0, offline.

The case (Hyenas v6, 13 Nov 2026, VERIFIED on the delivered files): his black jeans stand in front of a white door and
wall in the put-back picture (jeans V 10-30, wall V 170-200), yet the veed matte holds his right leg at ~0.55 on every
frame and loses its lower half on frames 14 and 78-80. Fendi: "still a lot of flicker in the legs".

What it does, inside one box only (matte pixels), on each frame by itself (nothing is carried between frames):
  key   = 1 where the put-back picture is dark (V <= v_lo), 0 where it is light (V >= v_hi), a ramp between;
  keep  = only the dark regions that touch the provider matte's solid part (>0.5) by at least min_touch px, so a dark
          crack in the wall or a shadow on the door that does not touch him is never added;
  alpha = max(provider alpha, key * keep).
It only adds. It cannot erase the chain or anything else the provider matte holds, and outside the box the matte is the
provider's, byte for byte. It is right only where the background behind the garment is light: check that first.

Use: composite_over_plate.py --key-dark-box x0,y0,x1,y1 (writes the repaired matte for matte_stability.py --baseline).
"""
import numpy as np, cv2


def key_dark_union(frame_bgr, alpha, box, v_lo=50, v_hi=110, min_touch=200):
    """alpha: float32 0..1 (H, W). Returns the repaired alpha and the number of pixels raised."""
    x0, y0, x1, y1 = box
    v = frame_bgr[y0:y1, x0:x1].max(2).astype(np.float32)
    a = alpha[y0:y1, x0:x1]
    key = np.clip((v_hi - v) / float(v_hi - v_lo), 0, 1)
    dark = (v < v_hi).astype(np.uint8)
    n, lab = cv2.connectedComponents(dark, connectivity=8)
    touch = np.bincount(lab[(a > 0.5) & (dark > 0)].ravel(), minlength=n)
    keep = touch >= min_touch; keep[0] = False
    key = key * keep[lab]
    out = alpha.copy()
    new = np.maximum(a, key)
    raised = int((new > a + 1e-6).sum())
    out[y0:y1, x0:x1] = new
    return out, raised


def drop_floor_shadow(frame_bgr, alpha, box, v_lo=22, v_hi=40, min_out=30):
    """The opposite case, and only on Fendi's word for the shot (a per-frame colour rule that LOWERS the matte is in
    the problem index's Never column): the room's black contact shadow under a creature, which the provider matte
    takes in on some frames and leaves out on others (Hyenas verse 35.7, 13 Nov 2026: the tip of the floor shadow at
    the hyena's haunch, in the matte on 15 of 52 frames; Fendi: "the shadow appears and reappears very quickly";
    his answer to the three options: "Cut it from the matte").
    Inside one box, on each frame by itself: a dark region of the picture (V < v_hi) goes from the matte when at least
    min_out of its pixels already lie OUTSIDE the matte's solid part, which is what a shadow on the floor does and a
    dark spot in the fur does not. alpha = alpha * (1 - key), key 1 at V <= v_lo, 0 at V >= v_hi. It only lowers, and
    only inside the box. Returns the new alpha and the number of pixels lowered."""
    x0, y0, x1, y1 = box
    v = frame_bgr[y0:y1, x0:x1].max(2).astype(np.float32)
    a = alpha[y0:y1, x0:x1]
    key = np.clip((v_hi - v) / float(v_hi - v_lo), 0, 1)
    dark = (v < v_hi).astype(np.uint8)
    n, lab = cv2.connectedComponents(dark, connectivity=8)
    outside = np.bincount(lab[(a <= 0.5) & (dark > 0)].ravel(), minlength=n)
    drop = outside >= min_out; drop[0] = False
    gone = key * drop[lab]
    new = a * (1 - gone)
    # what the matte held around the shadow is its half-dark fringe (V just above v_hi): with the black middle gone it
    # stood as a hair-thin outline on exactly the frames that had the blob (verse 35.7: 10 of 52). Next to the dropped
    # region (within 4 px) the matte may reach no further than 3 px from the creature's body, fading to 0 at 6 px;
    # the body is the solid matte that is left, without anything thinner than 5 px (the outline itself)
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)); k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    body = cv2.morphologyEx((new > 0.5).astype(np.uint8), cv2.MORPH_OPEN, k5)
    reach = np.clip((6.0 - cv2.distanceTransform(1 - body, cv2.DIST_L2, 5)) / 3.0, 0, 1)
    near = cv2.dilate((gone > 0.05).astype(np.uint8), k9) > 0
    new = np.where(near, np.minimum(new, reach), new).astype(a.dtype)
    out = alpha.copy(); out[y0:y1, x0:x1] = new
    return out, int((new < a - 1e-6).sum())


def selftest():
    H, W = 200, 160
    f = np.full((H, W, 3), 190, np.uint8)                 # white wall
    f[40:190, 50:110] = 15                                # black jeans
    f[20:180, 140:143] = 60                               # a dark crack in the wall, not touching him
    a = np.zeros((H, W), np.float32); a[40:120, 50:110] = 1.0; a[120:190, 50:110] = 0.2   # leg bottom dropped
    a[100:110, 10:20] = 1.0                               # something else the provider holds (a chain link)
    out, raised = key_dark_union(f, a, (0, 0, W, H))
    assert out[150, 80] == 1.0 and raised > 0             # the leg is back
    assert out[100, 141] == 0.0                           # the crack is not added
    assert out[105, 15] == 1.0                            # nothing the provider held is lost
    assert np.all(out >= a)
    # drop_floor_shadow: a creature (grey fur) with a dark spot in it, on a wood floor with a black contact shadow
    # under it; the provider matte took the shadow's tip in with a half-dark fringe round it
    g = np.full((H, W, 3), 110, np.uint8)                 # the floor
    g[40:120, 30:100] = 90                                # fur
    g[70:80, 50:60] = 15                                  # a dark spot inside the fur
    g[120:132, 30:130] = 10                               # the floor shadow under it, running out past the body
    b = np.zeros((H, W), np.float32); b[40:120, 30:100] = 1.0
    b[120:132, 80:100] = 1.0; b[132:135, 78:102] = 0.8    # the tip of the shadow in the matte, and its fringe
    out2, lowered = drop_floor_shadow(g, b, (20, 30, 140, 150))
    assert lowered > 0 and out2[125, 90] == 0.0           # the shadow is out of the matte
    assert out2[133, 90] < 0.05                           # and so is the fringe that stood round it
    assert out2[75, 55] == 1.0 and out2[60, 60] == 1.0    # the dark spot in the fur and the fur stay
    assert np.all(out2 <= b + 1e-6)                       # it only lowers
    out3, _ = drop_floor_shadow(g, b, (0, 0, 20, 20)); assert np.array_equal(out3, b)   # nothing outside the box
    print("selftest ok: dropped leg restored, crack in the wall not added, nothing removed; floor shadow cut, fur kept")
    return 0


def repair_file(fg, alpha, out, box, v_lo=50, v_hi=110, drop=False):
    """The same repair on a whole clip, for a pipeline that does not go through composite_over_plate.py (the Blender
    set build): writes the repaired matte lossless (ffv1, as --key-dark-box does) and returns the pixels raised."""
    import subprocess
    cf, ca = cv2.VideoCapture(fg), cv2.VideoCapture(alpha); frames = []; raised = 0
    while True:
        okf, f = cf.read(); oka, a = ca.read()
        if not (okf and oka): break
        r, c = (drop_floor_shadow if drop else key_dark_union)(f, a[..., 0].astype(np.float32) / 255, box, v_lo, v_hi)
        frames.append(np.clip(np.round(r * 255), 0, 255).astype(np.uint8)); raised += c
    fps = cf.get(cv2.CAP_PROP_FPS) or 24.0; h, w = frames[0].shape
    wr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", f"{fps:.6f}",
                           "-i", "-", "-c:v", "ffv1", out], stdin=subprocess.PIPE)
    wr.stdin.write(np.ascontiguousarray(np.array(frames)).tobytes()); wr.stdin.close(); wr.wait()
    return len(frames), raised


if __name__ == "__main__":
    import sys
    if len(sys.argv) == 1: sys.exit(selftest())
    import argparse
    ap = argparse.ArgumentParser(description="usage: matte_repair.py <fg.mp4> <alpha.mp4> <out_alpha.mkv> --box x0,y0,x1,y1 [--key-v 50,110]")
    ap.add_argument("fg"); ap.add_argument("alpha"); ap.add_argument("out"); ap.add_argument("--box", required=True); ap.add_argument("--key-v", default="50,110")
    ap.add_argument("--drop-floor-shadow", action="store_true", help="LOWER the matte on the room's black floor shadow inside the box (drop_floor_shadow): only on Fendi's word for the shot")
    A = ap.parse_args(); vlo, vhi = (int(v) for v in A.key_v.split(","))
    n, raised = repair_file(A.fg, A.alpha, A.out, tuple(int(v) for v in A.box.split(",")), vlo, vhi, drop=A.drop_floor_shadow)
    print(f"{'drop-floor-shadow' if A.drop_floor_shadow else 'key-dark-box'} {A.box}: {n} frames, px {'lowered' if A.drop_floor_shadow else 'raised'}: {raised}; wrote {A.out}")
