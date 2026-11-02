"""Tighten a protected-region mask to the person's real silhouette (pure numpy + cv2 filters).

The face polygon (dilated 9 px) and the segmenter's labels (3-5 px blocks at 256x256) overshoot the silhouette by
1-3 px onto the scene. A composite that keeps those pixels keeps a thread of scene between the head and whatever is
painted beside it — the pale contour between Fendi's head and the bucket-hat brim on c041 v2 (2 Nov 2026), present
in every version because every version kept the same boundary. In a band just inside the mask's edge a pixel stays
his only when its colour is nearer the local inside (his skin and hair) than the local outside (the scene)."""
import numpy as np
import cv2


def masked_mean(img, mask, k):
    """Local mean colour of img over mask within a k x k window (zero where the window holds no mask pixel)."""
    m = mask.astype(np.float32)
    num = cv2.boxFilter(img.astype(np.float32) * m[..., None], -1, (k, k), normalize=False)
    den = cv2.boxFilter(m, -1, (k, k), normalize=False)
    return num / np.maximum(den, 1e-6)[..., None], den > 0


def refine_silhouette(protect, img, band=4, window=15, bias=0.7, smooth=5):
    """protect (H, W) bool, img (H, W, 3): the mask with its outer `band` px kept only where the pixel's colour is
    clearly nearer the inside reference than the outside reference (distance to the inside at most `bias` times
    the distance to the outside: a half-mixed edge pixel goes to the outside, where what is painted beside him
    covers it, instead of staying as a pale thread). Inside reference: the local mean of the mask eroded by `band`
    px; outside: the local mean of the scene beyond the mask grown by `band` px. The decision is median-filtered
    over `smooth` px so the edge is a line, not a saw."""
    p = protect.astype(np.uint8)
    k = 2 * band + 1
    core = cv2.erode(p, np.ones((k, k), np.uint8)) > 0
    outside = cv2.dilate(p, np.ones((k, k), np.uint8)) == 0
    rim = protect & ~core
    if not rim.any(): return protect
    mi, oki = masked_mean(img, core, window)
    mo, oko = masked_mean(img, outside, window)
    x = img.astype(np.float32)
    di = np.abs(x - mi).sum(2); do = np.abs(x - mo).sum(2)
    keep = (di <= bias * do) | ~oki | ~oko   # no reference on one side: nothing to judge against, keep
    out = protect.copy(); out[rim] = keep[rim]
    if smooth and smooth > 1:
        sm = cv2.medianBlur(out.astype(np.uint8) * 255, smooth) > 127
        out[rim] = sm[rim]
        out |= core                           # the median never eats into the core
    return out
