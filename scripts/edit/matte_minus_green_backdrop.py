"""$0. Take a green backdrop out of a delivered matte (his room takes: he stands in front of a green quilt).

matte-video-proxy (veed) keeps the quilt as foreground on and off (Partnership, 20 Nov 2026: 55 of 84 frames flagged by
matte_stability.py, a quilt-shaped blob beside his shoulder). The quilt is a green screen in all but name, so per
frame: matte = delivered matte x (not backdrop-green in the picture), then only the piece joined to him is kept.
Removes only; nothing is added to the matte and nothing is carried between frames (printed).
Not for a take where he wears green.

usage: matte_minus_green_backdrop.py <fg.mp4> <alpha.mp4> <out_alpha.mp4>
"""
import sys, subprocess, json, numpy as np, cv2
fg_p, al_p, out_p = sys.argv[1:4]
s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", fg_p], capture_output=True, text=True).stdout)["streams"][0]
W, H = int(s["width"]), int(s["height"]); n_, d_ = s["r_frame_rate"].split("/"); fps = float(n_) / float(d_)
rd = lambda p, g: np.frombuffer(subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "gray" if g else "bgr24", "-"], capture_output=True).stdout, np.uint8).reshape((-1, H, W) if g else (-1, H, W, 3))
fg, al = rd(fg_p, False), rd(al_p, True); n = min(len(fg), len(al))
enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv420p", out_p], stdin=subprocess.PIPE)
removed = []; added = 0
for k in range(n):
    hsv = cv2.cvtColor(fg[k], cv2.COLOR_BGR2HSV)
    green = ((hsv[..., 0] > 30) & (hsv[..., 0] < 88) & (hsv[..., 1] > 40) & (hsv[..., 2] > 20)).astype(np.uint8)   # the quilt's shadowed folds too
    green = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    keep = 1 - cv2.GaussianBlur(cv2.dilate(green, np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 1.2)
    a = al[k].astype(np.float32) * keep
    solid = (a > 127).astype(np.uint8)
    # green INSIDE him (a jacket patch, a cap logo) is his: holes closed off from the outside get the delivered matte back
    ff = solid.copy(); cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 2); hole = ff == 0
    hole = cv2.dilate(hole.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0          # and the feathered ring round each hole
    a[hole] = al[k][hole]; solid = (a > 127).astype(np.uint8)
    # thin streaks of quilt left along his side: keep only what is within reach of his solid body (opened by 9 px)
    body = cv2.morphologyEx(solid, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    c, lab, st, _ = cv2.connectedComponentsWithStats(body)
    if c > 1:
        big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        reach = cv2.GaussianBlur(cv2.dilate((lab == big).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(np.float32), (0, 0), 1.0)
        a = a * reach
    o = np.clip(a, 0, 255).astype(np.uint8)
    removed.append(int((al[k] > 127).sum()) - int((o > 127).sum())); added += int(((o > 127) & (al[k] <= 127)).sum())
    enc.stdin.write(o.tobytes())
enc.stdin.close(); enc.wait()
r = np.array(removed)
print("frames %d; solid matte pixels removed per frame: median %d, max %d; frames with more than 2000 removed: %d; pixels added: %d" % (n, np.median(r), r.max(), int((r > 2000).sum()), added))
