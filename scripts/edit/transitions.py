#!/usr/bin/env python3
"""
TRANSITIONS — music-video transitions on the beat grid, deterministic, $0 (plan C1, 2026-10-02).

Every transition is a function of (outgoing frames, incoming frames, n_out, n_in, params) → (new outgoing tail,
new incoming head) with the SAME frame counts, so the song clock never moves: the cut point stays where the
storyboard put it and the frame budget of every slot is kept. Presets live in config/transition_presets.json
(durations in beats; `side` says which shot gives up frames).

Used by assemble_section.py (it renders each slot with handles, then calls `apply_all`), and standalone:

    python3 scripts/edit/transitions.py --out-clip a.mp4 --in-clip b.mp4 --preset whip_left --bpm 122 --fps 24 \\
        --audition audition.mp4            # the two seconds around the cut, for picking a transition (C3)
    python3 scripts/edit/transitions.py --list

Library: cut · crossfade · dip_black · dip_white · flash · whip_pan (directional motion blur ramp with a push) ·
zoom_punch (incoming lands at scale→1) · speed_ramp (the outgoing tail's last beat compressed from its handle) ·
strobe (sixteenth-note stutter) · luma_wipe (reveal by the incoming frame's luminance) · glitch (block displacement +
channel split) · light_leak (procedural warm wash) · film_burn (bright bloom with a dust pass). All numpy/cv2; ffmpeg
only decodes and encodes. Nothing here knows a project or a song.
"""
import argparse, json, os, subprocess, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PRESETS = json.load(open(os.path.join(ROOT, "config", "transition_presets.json")))["presets"]


# ---------------------------------------------------------------- frame io ------------------------------------------
def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", path], capture_output=True, text=True).stdout
    st = json.loads(out)["streams"][0]; num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den), int(st.get("nb_frames") or 0)


def read_frames(path, start=0, count=None, w=None, h=None):
    """Decode frames [start, start+count) as uint8 BGR arrays (cv2 order)."""
    W, H, fps, _ = probe(path); W, H = w or W, h or H
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"select='gte(n\\,{start})',scale={W}:{H}", "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "bgr24"]
    if count: cmd += ["-frames:v", str(count)]
    raw = subprocess.run(cmd + ["-"], capture_output=True).stdout
    n = len(raw) // (W * H * 3)
    return np.frombuffer(raw[: n * W * H * 3], np.uint8).reshape(n, H, W, 3)


def write_frames(frames, path, fps, crf=17):
    H, W = frames[0].shape[:2]
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close(); p.wait()
    if p.returncode: raise SystemExit(f"encode failed: {path}")


# ---------------------------------------------------------------- helpers -------------------------------------------
def ease(t):  # smoothstep
    return t * t * (3 - 2 * t)


def f32(x): return x.astype(np.float32)
def u8(x): return np.clip(x, 0, 255).astype(np.uint8)


def dir_blur(img, amount, direction):
    if amount < 1: return img
    k = int(amount) | 1
    if direction in ("left", "right"): kernel = np.zeros((1, k), np.float32); kernel[0, :] = 1.0 / k
    else: kernel = np.zeros((k, 1), np.float32); kernel[:, 0] = 1.0 / k
    return cv2.filter2D(img, -1, kernel, borderType=cv2.BORDER_REFLECT)


def shift(img, dx, dy):
    H, W = img.shape[:2]; M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(img, M, (W, H), borderMode=cv2.BORDER_REFLECT)


def zoom(img, s):
    H, W = img.shape[:2]; M = cv2.getRotationMatrix2D((W / 2, H * 0.45), 0, s)
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def luma(img): return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


# ---------------------------------------------------------------- the library ---------------------------------------
# each: (out_tail: ndarray[n_out], in_head: ndarray[n_in], out_handle: ndarray (frames AFTER the cut from the outgoing
# source, may be empty), in_handle: ndarray (frames BEFORE the slot from the incoming source, may be empty), params)
# → (new_out_tail[n_out], new_in_head[n_in])

def t_cut(o, i, oh, ih, p): return o, i


def t_crossfade(o, i, oh, ih, p):
    """Dissolve across the cut: the outgoing shot keeps running into its handle while the incoming fades up over the
    outgoing tail, and the incoming keeps fading in over its own head using the outgoing handle."""
    n_o, n_i = len(o), len(i); n = n_o + n_i; out_o, out_i = o.copy(), i.copy()
    for k in range(n):
        a = ease((k + 1) / (n + 1))
        if k < n_o:
            src_in = ih[len(ih) - (n_o - k)] if len(ih) >= n_o - k else i[0]
            out_o[k] = u8(f32(o[k]) * (1 - a) + f32(src_in) * a)
        else:
            j = k - n_o
            src_out = oh[j] if j < len(oh) else o[-1]
            out_i[j] = u8(f32(src_out) * (1 - a) + f32(i[j]) * a)
    return out_o, out_i


def _dip(o, i, oh, ih, p, color):
    n_o, n_i = len(o), len(i); out_o, out_i = o.copy(), i.copy(); c = np.full_like(o[0], color)
    for k in range(n_o): a = ease((k + 1) / (n_o + 1)); out_o[k] = u8(f32(o[k]) * (1 - a) + f32(c) * a)
    for k in range(n_i): a = ease(1 - (k + 1) / (n_i + 1)); out_i[k] = u8(f32(i[k]) * (1 - a) + f32(c) * a)
    return out_o, out_i


def t_dip_black(o, i, oh, ih, p): return _dip(o, i, oh, ih, p, 0)
def t_dip_white(o, i, oh, ih, p): return _dip(o, i, oh, ih, p, 255)


def t_flash(o, i, oh, ih, p):
    """A camera flash on the incoming head: `frames` near-white frames decaying, then the shot."""
    n = int(p.get("frames", 2)); out_i = i.copy()
    for k in range(min(len(i), n + 3)):
        a = 1.0 if k < n else max(0.0, 1 - (k - n + 1) / 3.0) * 0.6
        out_i[k] = u8(f32(i[k]) * (1 - a) + 255 * a)
    return o, out_i


def t_whip_pan(o, i, oh, ih, p):
    """Directional motion blur ramps up through the outgoing tail with a push in `direction`, and ramps down through the
    incoming head arriving from the same direction — the classic whip."""
    d = p.get("direction", "left"); B = float(p.get("blur", 48)); out_o, out_i = o.copy(), i.copy()
    H, W = o[0].shape[:2]; sx = {"left": -1, "right": 1}.get(d, 0); sy = {"up": -1, "down": 1}.get(d, 0)
    n_o, n_i = len(o), len(i)
    for k in range(n_o):
        a = ease((k + 1) / n_o); out_o[k] = dir_blur(shift(o[k], sx * a * a * W * 0.35, sy * a * a * H * 0.35), B * a, d)
    for k in range(n_i):
        a = ease(1 - (k + 1) / n_i); out_i[k] = dir_blur(shift(i[k], -sx * a * a * W * 0.35, -sy * a * a * H * 0.35), B * a, d)
    return out_o, out_i


def t_zoom_punch(o, i, oh, ih, p):
    s0 = float(p.get("scale", 1.18)); out_i = i.copy(); n = len(i)
    for k in range(n): a = ease((k + 1) / n); out_i[k] = zoom(i[k], s0 + (1 - s0) * a)
    return o, out_i


def t_speed_ramp(o, i, oh, ih, p):
    """The outgoing tail is re-timed: its n_out slots are filled from n_out × factor source frames (tail + handle),
    accelerating toward the cut — so the last beat rushes in. Falls back to what the handle provides."""
    f = float(p.get("factor", 2.5)); n = len(o); src = np.concatenate([o, oh], axis=0) if len(oh) else o
    avail = len(src); total = min(avail, int(round(n * f)))
    # positions: quadratic ramp from 0 to total-1 over n outputs (slow → fast)
    pos = [int(round((total - 1) * ((k / max(1, n - 1)) ** 1.6))) for k in range(n)]
    out_o = np.stack([src[min(avail - 1, q)] for q in pos]) if n else o
    return out_o, i


def t_strobe(o, i, oh, ih, p):
    period = max(1, int(round(float(p.get("period_frames", 3))))); duty = float(p.get("duty", 0.5)); out_i = i.copy()
    for k in range(len(i)):
        if (k % period) >= max(1, int(round(period * duty))): out_i[k] = (f32(i[k]) * 0.08).astype(np.uint8)
    return o, out_i


def t_luma_wipe(o, i, oh, ih, p):
    """The incoming shot appears first where it is brightest (headlights, a flash) and floods the frame."""
    soft = float(p.get("softness", 0.15)); n_o, n_i = len(o), len(i); n = n_o + n_i; out_o, out_i = o.copy(), i.copy()
    for k in range(n):
        th = (k + 1) / (n + 1); src_in = (ih[len(ih) - (n_o - k)] if (k < n_o and len(ih) >= n_o - k) else i[max(0, k - n_o)])
        src_out = o[k] if k < n_o else (oh[k - n_o] if k - n_o < len(oh) else o[-1])
        L = luma(src_in).astype(np.float32) / 255.0
        a = np.clip((L - (1 - th) + soft) / (2 * soft), 0, 1)[..., None]
        mix = u8(f32(src_out) * (1 - a) + f32(src_in) * a)
        if k < n_o: out_o[k] = mix
        else: out_i[k - n_o] = mix
    return out_o, out_i


def t_glitch(o, i, oh, ih, p):
    rng = np.random.RandomState(int(p.get("seed", 7))); blocks = int(p.get("blocks", 14)); sh = float(p.get("shift", 0.06)); split = int(p.get("split", 6))
    out_i = i.copy(); H, W = i[0].shape[:2]; n = len(i)
    for k in range(n):
        a = 1 - k / n; f = i[k].copy()
        for _ in range(int(blocks * a)):
            y0 = rng.randint(0, H - 8); h = rng.randint(4, max(5, H // 12)); dx = int(rng.uniform(-sh, sh) * W * a)
            f[y0:y0 + h] = np.roll(f[y0:y0 + h], dx, axis=1)
        s = int(split * a)
        if s: f[..., 2] = np.roll(f[..., 2], s, axis=1); f[..., 0] = np.roll(f[..., 0], -s, axis=1)
        out_i[k] = f
    return o, out_i


def _leak(H, W, t, warmth, rng):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); cx = W * (0.2 + 0.6 * t); cy = H * 0.3
    r = np.sqrt(((xx - cx) / (W * 0.45)) ** 2 + ((yy - cy) / (H * 0.6)) ** 2); g = np.clip(1 - r, 0, 1) ** 1.5
    col = np.array([40, 110, 255], np.float32) * warmth   # BGR: warm orange
    return g[..., None] * col[None, None, :]


def t_light_leak(o, i, oh, ih, p):
    warmth = float(p.get("warmth", 1.0)); rng = np.random.RandomState(3); n_o, n_i = len(o), len(i); n = n_o + n_i; out_o, out_i = o.copy(), i.copy()
    H, W = o[0].shape[:2]
    for k in range(n):
        t = (k + 1) / (n + 1); a = np.sin(np.pi * t)   # rises across the cut and falls
        leak = _leak(H, W, t, warmth, rng) * a
        if k < n_o: out_o[k] = u8(f32(o[k]) + leak)
        else: out_i[k - n_o] = u8(f32(i[k - n_o]) + leak)
    return out_o, out_i


def t_film_burn(o, i, oh, ih, p):
    inten = float(p.get("intensity", 1.0)); rng = np.random.RandomState(11); n_o, n_i = len(o), len(i); n = n_o + n_i; out_o, out_i = o.copy(), i.copy()
    H, W = o[0].shape[:2]
    for k in range(n):
        t = (k + 1) / (n + 1); a = np.sin(np.pi * t) ** 0.7
        leak = _leak(H, W, 1 - t, 1.4 * inten, rng) * a
        dust = (rng.rand(H, W) < 0.0008 * a)[..., None] * 255.0
        src = o[k] if k < n_o else i[k - n_o]
        f = f32(src) * (1 + 0.6 * a) + leak + dust
        if k < n_o: out_o[k] = u8(f)
        else: out_i[k - n_o] = u8(f)
    return out_o, out_i


LIB = {"cut": t_cut, "crossfade": t_crossfade, "dip_black": t_dip_black, "dip_white": t_dip_white, "flash": t_flash, "whip_pan": t_whip_pan, "zoom_punch": t_zoom_punch,
       "speed_ramp": t_speed_ramp, "strobe": t_strobe, "luma_wipe": t_luma_wipe, "glitch": t_glitch, "light_leak": t_light_leak, "film_burn": t_film_burn}


# ---------------------------------------------------------------- resolving a card's transition ---------------------
def resolve(tr, bpm, fps):
    """A card's transitionIn → {type, n_out, n_in, params}. Accepts a preset name, a type with beats or durationSeconds,
    and params; durations are quantised to whole frames; `side` splits the frames across the cut."""
    tr = tr or {}; name = tr.get("preset") or tr.get("type") or "cut"
    base = dict(PRESETS.get(name) or PRESETS.get(tr.get("type") or "", {}) or {"type": name, "beats": 0, "side": "both"})
    typ = base.get("type", name); params = {**(base.get("params") or {}), **(tr.get("params") or {})}
    beats = tr.get("beats", base.get("beats", 0))
    secs = float(tr.get("durationSeconds") or 0) or (float(beats) * 60.0 / float(bpm) if bpm else 0.0)
    nf = int(round(secs * fps)); side = tr.get("side", base.get("side", "both"))
    if typ == "cut" or nf <= 0: return {"type": "cut", "n_out": 0, "n_in": 0, "params": {}, "preset": name}
    if typ == "strobe": params["period_frames"] = max(1, round(float(params.get("period_beats", 0.25)) * 60.0 / float(bpm) * fps))
    n_out, n_in = (nf, 0) if side == "out" else (0, nf) if side == "in" else (nf // 2, nf - nf // 2)
    return {"type": typ, "n_out": n_out, "n_in": n_in, "params": params, "preset": name}


def apply_cut(out_frames, in_frames, out_handle, in_handle, spec):
    """Modify the end of out_frames and the start of in_frames in place (arrays), keeping their lengths."""
    n_o, n_i = min(spec["n_out"], len(out_frames)), min(spec["n_in"], len(in_frames))
    if spec["type"] == "cut" or (n_o == 0 and n_i == 0): return out_frames, in_frames
    o = out_frames[len(out_frames) - n_o:] if n_o else out_frames[:0]; i = in_frames[:n_i] if n_i else in_frames[:0]
    # library functions want at least one frame on each side to read shapes; feed a 0-length side as a copy of the edge
    o_in = o if len(o) else out_frames[-1:]; i_in = i if len(i) else in_frames[:1]
    new_o, new_i = LIB[spec["type"]](o_in.copy(), i_in.copy(), out_handle, in_handle, spec["params"])
    if n_o: out_frames[len(out_frames) - n_o:] = new_o[:n_o]
    if n_i: in_frames[:n_i] = new_i[:n_i]
    return out_frames, in_frames


# ---------------------------------------------------------------- CLI: audition one cut -----------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true"); ap.add_argument("--out-clip"); ap.add_argument("--in-clip"); ap.add_argument("--preset", default="cut")
    ap.add_argument("--bpm", type=float, default=120); ap.add_argument("--fps", type=float, default=24); ap.add_argument("--audition", help="output mp4: last 1 s of the outgoing + first 1 s of the incoming with the transition")
    ap.add_argument("--cut-out", type=int, default=None, help="frame index in --out-clip where the cut falls (default: last frame − 1 s handle)")
    ap.add_argument("--cut-in", type=int, default=0, help="frame index in --in-clip where the slot starts (frames before it are the pre-roll handle)")
    ap.add_argument("--size", default=None, help="WxH to normalise both clips to (default: the outgoing clip's)")
    a = ap.parse_args()
    if a.list:
        for k, v in PRESETS.items(): print(f"{k:<14} {v['type']:<11} {v.get('beats', 0):>4} beats  side={v.get('side', 'both'):<5} {v.get('suits', '')}")
        return
    W, H, fps_o, n_o_total = probe(a.out_clip)
    if a.size: W, H = (int(x) for x in a.size.lower().split("x"))
    fps = a.fps; sec = int(round(fps)); handle = sec
    cut_out = a.cut_out if a.cut_out is not None else max(0, n_o_total - handle)
    out_frames = read_frames(a.out_clip, max(0, cut_out - sec), sec, W, H); out_handle = read_frames(a.out_clip, cut_out, handle, W, H)
    in_handle = read_frames(a.in_clip, max(0, a.cut_in - handle), min(handle, a.cut_in), W, H) if a.cut_in else out_frames[:0]
    in_frames = read_frames(a.in_clip, a.cut_in, sec, W, H)
    spec = resolve({"preset": a.preset}, a.bpm, fps)
    o, i = apply_cut(out_frames.copy(), in_frames.copy(), out_handle, in_handle, spec)
    write_frames(np.concatenate([o, i]), a.audition, fps)
    print(json.dumps({"preset": a.preset, "resolved": {k: v for k, v in spec.items() if k != "params"}, "params": spec["params"], "audition": a.audition, "frames": len(o) + len(i)}))


if __name__ == "__main__":
    main()
