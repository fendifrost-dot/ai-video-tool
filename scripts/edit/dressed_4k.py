"""dressed_4k.py <original_4k.mp4> <original_work.mp4> <dressed_work.mp4> <out_4k.mp4> [--thresh 8] [--self-test]
The dressed (or swapped) take at the take's native 4K, $0: the original 4K frame everywhere, the dressed working-size
frame (enlarged, Lanczos, no AI) only where the dress or swap changed the picture (|dressed - original| at working
size > --thresh, opened, dilated, feathered). His face, skin, unchanged clothes and the room keep the 4K pixels.
- original_4k    the take window from the 4K original (any size; 2160x3840 on the YSL and Hyenas phones)
- original_work  the SAME frames at the working size the swap was put back on (1080x1920 on YSL c044, 720x1280 on Hyenas)
- dressed_work   body_only_swap.py's output for original_work (same size, same frame count and timing)
Sizes and frame rate are read from the files (the output keeps original_4k's size and rate); the mask's dilation and
feather scale with the enlargement so a 720p working size gets the same edge as YSL's 1080 one.
First used on c044 (23 Oct 2026, dressed real-him v3 `21b9b341`, changed area 4.3 % of the frame). Lane B of
docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md; the creature swap's lift to 4K in
docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md (Hyenas shots, 14 Nov 2026: the 720p put-backs were never lifted)."""
import argparse, json, subprocess, sys
import numpy as np, cv2


def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,r_frame_rate", "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    return int(s["width"]), int(s["height"]), s["r_frame_rate"]


def lift(f4, f1, fd, thresh=8):
    """One frame: f4 the 4K original, f1 the original at working size, fd the dressed frame at working size (uint8 RGB)."""
    H4, W4 = f4.shape[:2]; k = W4 / f1.shape[1]                  # enlargement (2 on YSL, 3 on Hyenas)
    d = np.abs(f1.astype(np.int16) - fd.astype(np.int16)).max(2)
    m = (d > thresh).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    dil = max(3, int(round(9 * 2 / k)) | 1)                      # 9 px at 2x (YSL), the same 4K width at any scale
    m = cv2.dilate(m, np.ones((dil, dil), np.uint8))
    m4 = cv2.resize(m.astype(np.float32), (W4, H4), interpolation=cv2.INTER_LINEAR)
    m4 = cv2.GaussianBlur(m4, (0, 0), 3 * k / 2)[..., None]
    up = cv2.resize(fd, (W4, H4), interpolation=cv2.INTER_LANCZOS4)
    o = (f4.astype(np.float32) * (1 - m4) + up.astype(np.float32) * m4).round().clip(0, 255).astype(np.uint8)
    return o, float(m.mean()), m4[..., 0]


def self_test():
    rs = np.random.default_rng(5)
    f4 = (rs.random((384, 216, 3)) * 255).astype(np.uint8)                     # a "4K" frame (scaled down for speed)
    f1 = cv2.resize(f4, (72, 128), interpolation=cv2.INTER_AREA)              # the 720p-like working copy (3x)
    fd = f1.copy(); fd[80:110, 20:50] = (200, 30, 30)                           # the swap changed one box (the creature)
    o, area, m4 = lift(f4, f1, fd)
    far = np.ones(o.shape[:2], bool); far[180:390, 0:210] = False               # well away from the changed box
    assert np.array_equal(o[far], f4[far]), "pixels away from the change must be the 4K original, untouched"
    assert abs(float(o[285, 105].astype(int)[0]) - 200) < 3, "the changed box must come from the swap"
    assert 0.05 < area < 0.3, area
    print(f"self-test ok: unchanged pixels exactly 4K original, change taken from the swap, changed area {area:.3f}")


if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test(); raise SystemExit
    ap = argparse.ArgumentParser()
    for a in ("orig4k", "orig_work", "dressed_work", "out"): ap.add_argument(a)
    ap.add_argument("--thresh", type=int, default=8)
    A = ap.parse_args()
    W4, H4, R4 = probe(A.orig4k); W1, H1, _ = probe(A.orig_work); Wd, Hd, _ = probe(A.dressed_work)
    assert (W1, H1) == (Wd, Hd), ("working copies differ in size", (W1, H1), (Wd, Hd))
    def reader(p, w, h):
        return subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE), w * h * 3
    r4, n4 = reader(A.orig4k, W4, H4); r1, n1 = reader(A.orig_work, W1, H1); rd, nd = reader(A.dressed_work, Wd, Hd)
    vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W4}x{H4}", "-r", R4, "-i", "-",
                           "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709",
                           "-colorspace", "bt709", "-movflags", "+faststart", A.out], stdin=subprocess.PIPE)
    i = 0; changed = []
    while True:
        a = r4.stdout.read(n4); b = r1.stdout.read(n1); c = rd.stdout.read(nd)
        if len(a) < n4 or len(b) < n1 or len(c) < nd: break
        o, area, _ = lift(np.frombuffer(a, np.uint8).reshape(H4, W4, 3), np.frombuffer(b, np.uint8).reshape(H1, W1, 3),
                          np.frombuffer(c, np.uint8).reshape(Hd, Wd, 3), A.thresh)
        vw.stdin.write(o.tobytes()); changed.append(area); i += 1
    vw.stdin.close(); vw.wait()
    print("frames", i, f"{W1}x{H1} -> {W4}x{H4} at {R4}", "changed area mean %.3f max %.3f" % (np.mean(changed), np.max(changed)))
