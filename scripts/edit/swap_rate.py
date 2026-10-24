"""The swap's frame rate must be the original's before a put-back (Fendi, 24 Oct 2026: the dressed c044 b-roll moved
"like a robot" while the undressed one was smooth).

VERIFIED cause: Genjutsu returns its swap at ~22 fps (c044: 89 frames for 4.004 s) and the put-back pairs the original
frame at t with the swap frame at t, so inside a 59.94 fps window the clothes held still for two frames and jumped on
the third (torso frame-to-frame diff 0.3 / 0.4 / 13.4 ...) while the face and hands moved every frame; a model that
copies the clip's motion copies that stutter. Motion-interpolating the swap to the original's rate first removed it
(near-zero-motion torso frames 67 -> 0 of 239) and kept the face proof at 0.

This module is the rule, importable without the ML stack: body_only_swap.py applies it to every swap it is given.
Set AVT_SWAP_INTERPOLATE=0 to run without it (a diagnostic, never production)."""
import os, subprocess

RATE_TOLERANCE_FPS = 0.5
# mci = motion-compensated interpolation; aobmc + bidir give the cleanest sleeves at 22 -> 60 (c044, 24 Oct 2026)
MINTERPOLATE = "minterpolate=fps={rate}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"


def needs_interpolation(fps_original, fps_swap, tolerance=RATE_TOLERANCE_FPS):
    """True when the swap would otherwise hold frames inside the original's clock."""
    return abs(float(fps_original) - float(fps_swap)) > tolerance


def minterpolate_command(src, rate, dst, width=None, height=None):
    """The ffmpeg call: `rate` is the original's r_frame_rate as a fraction string (e.g. 60000/1001)."""
    vf = MINTERPOLATE.format(rate=rate)
    if width and height: vf += f",scale={width}:{height}:flags=lanczos"
    return ["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", dst]


def interpolate_swap(src, rate, dst, width=None, height=None):
    """Writes `dst` at `rate` and returns its path; raises on an ffmpeg failure."""
    r = subprocess.run(minterpolate_command(src, rate, dst, width, height), capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst): raise RuntimeError(f"minterpolate failed: {r.stderr.strip()[-400:]}")
    return dst


def enabled():
    return os.environ.get("AVT_SWAP_INTERPOLATE", "1") != "0"
