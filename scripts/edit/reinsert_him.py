"""His REAL pixels back into a creature/prop swap, $0: the take everywhere, the swap only for the creature, the new
leash/chain and the strip of his clothes the old leash crossed. usage:
  reinsert_him.py <take.mp4> <putback.mp4> <putback_alpha.mp4> <out.mp4> [--work 720] [--sheet frames.jpg] [--models DIR]
  take            the take window at the size to deliver (the 4K original, or any copy of the SAME frames)
  putback         body_only_swap.py --base swap output for those frames (Genjutsu's 720p picture, his face put back)
  putback_alpha   matte-video-proxy alpha of the put-back (him + creature + chain)
Fendi, 14 Nov 2026: "we have a 4k version of me and my movements don't change so we probably should ... re insert my
actual pixels and just upscale the hyena"; on the old leash: "That seems like a fairly easy thing to fix."
Why: the swap redraws all of him at 720p and holds 5-11 frames per shot, so he is soft and his body freezes. The take has
him sharp and moving on every frame. What the take still holds is the OLD prop (the dog, its leash): PROBLEM_INDEX
"two ropes". The fix is in the masks, per frame, at --work size (all masks are then enlarged to the take's size):
  HIM       MediaPipe person classes on the take (hair, skin, clothes), largest region
  CREATURE  put-back alpha minus the put-back's own person region (the animal, the chain where it leaves his body)
  LEASH     inside HIM below his hands, where take and swap disagree and one of them is his dark clothes: the old
            leash crossing his legs (light in the take, dark in the swap) and the new chain (the reverse)
  out = take; then the swap (aligned to the take by an ECC affine fit, enlarged with Lanczos) wherever
        CREATURE or LEASH, or outside HIM where the swap changed the room (the dog and its leash on the floor)
His face, hands, clothes and outline are the take's own pixels wherever those three masks are not; the script prints
the share of HIM that stayed his own. The result is a full frame: matte it (matte-video-proxy) as any put-back.
Status: CANDIDATE, first run verse 26.1 at 720p."""
import argparse, json, os, subprocess, sys
import numpy as np, cv2

def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                                   "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    return int(s["width"]), int(s["height"]), s["r_frame_rate"]

def reader(p, w, h, gray=False):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo",
                           "-pix_fmt", "gray" if gray else "rgb24", "-"], stdout=subprocess.PIPE)
    n = w * h * (1 if gray else 3)
    while len(b := pr.stdout.read(n)) == n:
        yield np.frombuffer(b, np.uint8).reshape((h, w) if gray else (h, w, 3))

def ecc(src, dst):
    g1 = cv2.cvtColor(dst, cv2.COLOR_RGB2GRAY).astype(np.float32); g2 = cv2.cvtColor(src, cv2.COLOR_RGB2GRAY).astype(np.float32)
    M = np.eye(2, 3, dtype=np.float32)
    try: _, M = cv2.findTransformECC(g1, g2, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5)
    except cv2.error: pass
    return M

def masks(T, P, A, cats_t, cats_p):
    """All at work size, P and A already aligned to T. cats: MediaPipe classes (1 hair, 2 body skin, 3 face skin, 4 clothes)."""
    def person(c):
        m = ((c >= 1) & (c <= 4)).astype(np.uint8); n, l, st, _ = cv2.connectedComponentsWithStats(m)
        m = (l == 1 + np.argmax(st[1:, 4])).astype(np.uint8) if n > 1 else m
        return cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))          # small holes (a stripe) are him
    him, him_p = person(cats_t), person(cats_p)
    creature = ((A > 128) & (him_p == 0)).astype(np.uint8)
    creature = cv2.morphologyEx(creature, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # the animal is the largest piece; a chain link between his hand and it is kept (below his hands, over the animal's
    # columns); anything else the segmenter missed on him in the swap (his cap, a shoe, his waistband) stays HIS pixels
    n, l, st, _ = cv2.connectedComponentsWithStats(creature)
    if n > 2:
        big = 1 + int(np.argmax(st[1:, 4])); x0, y0, bw = st[big, 0], st[big, 1], st[big, 2]
        hr = np.nonzero(((cats_t == 2) & (him > 0)).any(1))[0]; hand_row = int(np.median(hr)) if len(hr) else 0
        keep = np.zeros(n, bool); keep[big] = True
        for j in range(1, n):
            cx, cy = st[j, 0] + st[j, 2] / 2, st[j, 1] + st[j, 3] / 2
            if j != big and hand_row < cy < y0 + 10 and x0 - 20 < cx < x0 + bw + 20: keep[j] = True
        creature = keep[l].astype(np.uint8)
    d = np.abs(T.astype(np.int16) - P.astype(np.int16)).max(2)
    yt, yp = T.max(2).astype(np.int16), P.max(2).astype(np.int16)
    hands = (cats_t == 2) & (him > 0); rows = np.nonzero(hands.any(1))[0]
    lower = np.zeros_like(him); lower[(int(np.median(rows)) if len(rows) else him.shape[0] // 2):] = 1
    leash = ((him > 0) & (lower > 0) & (cats_t != 2) & (d > 45) & (np.minimum(yt, yp) < 70) & (np.abs(yt - yp) > 45)).astype(np.uint8)
    leash = cv2.dilate(cv2.morphologyEx(leash, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)), np.ones((5, 5), np.uint8))
    room = ((him == 0) & (d > 24)).astype(np.uint8)
    room = cv2.dilate(cv2.morphologyEx(room, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((7, 7), np.uint8)) & (1 - him)
    from_swap = np.clip(creature + leash + room, 0, 1)
    kept = float(((him > 0) & (from_swap == 0)).sum() / max(him.sum(), 1))
    return him, creature, leash, from_swap, kept

def self_test():
    """A dark-legged figure holding an old light leash; the swap repaints the legs without it, adds a creature and a cap blob."""
    h, w = 400, 240; T = np.full((h, w, 3), 200, np.uint8); ct = np.zeros((h, w), np.uint8)
    T[40:330, 90:150] = 20; ct[40:330, 90:150] = 4; T[150:165, 100:140] = (150, 100, 80); ct[150:165, 100:140] = 2      # body, hands
    P = T.copy(); cp = ct.copy(); T[165:330, 118:122] = 210                                                              # old leash, take only
    A = np.zeros((h, w), np.uint8); A[40:330, 90:150] = 255
    P[250:380, 60:140] = (120, 90, 60); A[250:380, 60:140] = 255; cp[250:380, 60:140] = 0                                # the creature
    A[30:40, 100:140] = 255                                                                                              # a cap piece the segmenter missed
    him, creature, leash, fs, kept = masks(T, P, A, ct, cp)
    assert leash[200, 120] == 1, "the old leash on his leg must come from the swap"
    assert creature[300, 70] == 1 and creature[34, 120] == 0, "the animal is kept, a stray piece on him is not"
    assert fs[100, 120] == 0 and kept > 0.6, kept
    print(f"self-test ok: old leash replaced, creature kept, stray piece dropped, his own pixels {100 * kept:.0f} %")

if __name__ == "__main__":
    if "--self-test" in sys.argv: self_test(); raise SystemExit
    ap = argparse.ArgumentParser()
    for a in ("take", "putback", "alpha", "out"): ap.add_argument(a)
    ap.add_argument("--work", type=int, default=720); ap.add_argument("--sheet"); ap.add_argument("--models", default=os.environ.get("AVT_MODELS", "models"))
    A_ = ap.parse_args()
    import mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(A_.models, "selfie_multiclass_256x256.tflite")),
        running_mode=vision.RunningMode.IMAGE, output_category_mask=True))
    cats = lambda im: np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(im))).category_mask.numpy_view()).copy()
    W, H, R = probe(A_.take); w = A_.work; h = int(round(H * w / W / 2)) * 2; k = W / w
    full = reader(A_.take, W, H); small = reader(A_.take, w, h); pb = reader(A_.putback, w, h); al = reader(A_.alpha, w, h, gray=True)
    vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", R, "-i", "-",
                           "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", A_.out], stdin=subprocess.PIPE)
    kept, leash_px, sheet, i = [], [], [], 0
    for F, T, P, A in zip(full, small, pb, al):
        M = ecc(P, T); warp = lambda x, size=(w, h), m=M: cv2.warpAffine(x, m, size, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        Pa, Aa = warp(P), warp(A)
        him, creature, leash, fs, kp = masks(T, Pa, Aa, cats(T), cats(Pa)); kept.append(kp); leash_px.append(int(leash.sum()))
        m = cv2.GaussianBlur(cv2.resize(fs.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), max(0.8, 0.8 * k))[..., None]
        up = cv2.resize(Pa, (W, H), interpolation=cv2.INTER_LANCZOS4) if k != 1 else Pa
        out = (F.astype(np.float32) * (1 - m) + up.astype(np.float32) * m).round().clip(0, 255).astype(np.uint8)
        vw.stdin.write(out.tobytes())
        if A_.sheet and i % 16 == 8:
            vis = T.copy(); vis[leash > 0] = (255, 0, 255); vis[creature > 0] = (vis[creature > 0] * 0.4 + np.array([0, 160, 0])).astype(np.uint8)
            c = lambda x: cv2.resize(x, (w, h))[int(h * .1):int(h * .92), int(w * .15):int(w * .85)]
            sheet.append(np.hstack([c(T), c(Pa), c(vis), c(out)]))
        i += 1
    vw.stdin.close(); vw.wait()
    if sheet: cv2.imwrite(A_.sheet, cv2.resize(np.vstack(sheet), None, fx=0.5, fy=0.5)[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"frames {i}  {w}x{h} masks -> {W}x{H}  his own pixels: {100 * np.mean(kept):.1f} % of him (min {100 * np.min(kept):.1f})  "
          f"leash strip px mean {np.mean(leash_px):.0f} max {np.max(leash_px)}")
