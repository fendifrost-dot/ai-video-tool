"""A photograph cut out so only its people remain, with the provider matte used as delivered. $0 (the matte is the paid step).

  clip <photo> <out.mp4>               the photo held for 2 s at 24 fps: the input matte-video-proxy needs
                                       (Partnership figure v2a, job 25829df9). Short side scaled up to 1080 with
                                       Lanczos when smaller, so small phone pictures give the model enough to read.
  cut  <photo> <alpha.mp4> <out.png>   the photo's OWN pixels + the matte's middle frame as alpha, at the photo's size,
                                       trimmed to the people. Writes <out>_alpha.png (full frame) beside it.

The matte is not choked, filled, held, keyed or cleaned (docs/PROBLEM_INDEX.md, "Him + a creature/prop"). The colour
under a soft edge is still the photo's background: the compositor removes that (edge decontamination), not this script.
Run with python -I."""
import subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageOps

FPS, SECONDS, SHORT = 24, 2, 1080


def load(p):
    return np.asarray(ImageOps.exif_transpose(Image.open(p)).convert("RGB"))


def clip(photo, out):
    im = load(photo)
    h, w = im.shape[:2]
    s = max(1.0, SHORT / min(w, h))
    W, H = int(round(w * s / 2)) * 2, int(round(h * s / 2)) * 2
    big = cv2.resize(im, (W, H), interpolation=cv2.INTER_LANCZOS4 if s > 1 else cv2.INTER_AREA)
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", out],
                         stdin=subprocess.PIPE)
    for _ in range(FPS * SECONDS):
        p.stdin.write(big.tobytes())
    p.stdin.close()
    if p.wait():
        sys.exit("ffmpeg failed")
    print(f"{photo}: {w}x{h} -> {W}x{H}, {FPS * SECONDS} frames")


def cut(photo, alpha_mp4, out):
    im = load(photo)
    h, w = im.shape[:2]
    cap = cv2.VideoCapture(alpha_mp4)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.set(cv2.CAP_PROP_POS_FRAMES, n // 2)
    ok, fr = cap.read()
    if not ok:
        sys.exit(f"no frame in {alpha_mp4}")
    a = cv2.resize(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), (w, h), interpolation=cv2.INTER_AREA)
    ys, xs = np.where(a > 20)
    if not len(ys):
        sys.exit(f"{photo}: the matte is empty")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    Image.fromarray(np.dstack([im, a])[y0:y1, x0:x1]).save(out)
    Image.fromarray(a).save(out[:-4] + "_alpha.png")
    print(f"{photo}: people cover {100 * (a > 127).mean():.1f} % of the picture, box {x0},{y0} {x1 - x0}x{y1 - y0}, "
          f"matte frame {n // 2} of {n}")


if __name__ == "__main__":
    {"clip": clip, "cut": cut}[sys.argv[1]](*sys.argv[2:])
