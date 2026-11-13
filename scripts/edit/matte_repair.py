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
    print("selftest ok: dropped leg restored, crack in the wall not added, nothing removed")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(selftest())
