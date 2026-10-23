"""Put a region swap back into the full frame, $0: the swap of an enlarged crop, shrunk into its box over the original.
usage: paste_region_swap.py <original.mp4> <crop_swap.mp4> <x> <y> <w> <h> <out.mp4>
  x y w h   the crop's box on the original, in pixels (the crop the swap was made from: crop=w:h:x:y, enlarged)
The output keeps the swap's own frames and frame rate: swap frame j is laid over the original frame at the same time,
so body_only_swap.py can take it as its <swap.mp4> and fit it to the original as usual. Outside the box it is the
original frame; inside, the swap shrunk back (area resampling) to the box. For a small figure in a wide frame: Genjutsu
re-stages a person who fills little of the picture (23 Oct, c033 LED reshoot: he came back ~2.5x larger), so the swap
is made on a crop where he fills the frame, then put back here."""
import json, subprocess, sys
import numpy as np, cv2

orig_p, swap_p = sys.argv[1:3]; x, y, w, h = map(int, sys.argv[3:7]); out = sys.argv[7]

def probe(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                        "-of", "json", p], capture_output=True, text=True).stdout
    s = json.loads(o)["streams"][0]; return int(s["width"]), int(s["height"]), s["r_frame_rate"]
def read(p, W, H):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)

W, H, rate = probe(orig_p); sw_w, sw_h, srate = probe(swap_p)
fps = eval(rate); sfps = eval(srate)
orig = read(orig_p, W, H); swap = read(swap_p, sw_w, sw_h)
vw = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", srate,
                       "-i", "-", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
                      stdin=subprocess.PIPE)
for j, s in enumerate(swap):
    i = min(len(orig) - 1, int(round(j / sfps * fps)))
    f = orig[i].copy()
    f[y:y + h, x:x + w] = cv2.resize(s, (w, h), interpolation=cv2.INTER_AREA)
    vw.stdin.write(f.tobytes())
vw.stdin.close(); vw.wait()
print("pasted", len(swap), "swap frames into", f"{W}x{H}", "box", (x, y, w, h), "at", srate)
