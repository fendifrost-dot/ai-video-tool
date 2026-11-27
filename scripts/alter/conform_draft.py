"""Bring a Seedance edit draft back onto its take's clock. Local, $0.

    python -I scripts/alter/conform_draft.py take.mp4 raw.mp4 draft.mp4

VERIFIED 26 Nov 2026 (docs/alter/TEST_2026-11-26.md): the Seedance 2.5 video edit returns 89 frames at 24 fps for a
96-frame, 4.000 s source: the whole performance, played about 7% fast (Genjutsu does the same, scripts/edit/
swap_rate.py). Scored as delivered, a good draft reads 0.15 on the mouth gate and looks re-timed; stretched to the
take's length and interpolated to the take's rate, the same draft reads 0.86 at 0 frames. So a draft is ALWAYS
conformed before it is scored, shown or cut in.

The output has exactly the take's frame count and rate, no B-frames and clean timestamps (without those the tracker
read 98 frames for 96). It carries no audio: the take's audio goes back on afterwards.
"""
import argparse, json, os, subprocess, sys
from fractions import Fraction

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "edit"))
from swap_rate import MINTERPOLATE  # noqa: E402  (the one interpolation setting, shared with the put-back)

# The drift seen so far is 96/89 = 1.079. Outside this band the file is not "the same clip, a little fast":
# it was trimmed, extended or is another clip, and stretching it would hide that.
STRETCH_MIN, STRETCH_MAX = 0.90, 1.20


def probe(path):
    """(frames, rate as a Fraction, width, height), counted from the stream, not trusted from the header."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                        "stream=nb_read_frames,r_frame_rate,avg_frame_rate,width,height", "-of", "json", path],
                       capture_output=True, text=True)
    if r.returncode != 0: raise RuntimeError(f"ffprobe {path}: {r.stderr.strip()[-300:]}")
    s = json.loads(r.stdout)["streams"][0]
    rate = Fraction(s["r_frame_rate"])
    check_constant_rate(path, rate, s.get("avg_frame_rate"))
    return int(s["nb_read_frames"]), rate, int(s["width"]), int(s["height"])


def check_constant_rate(path, rate, avg_text, tolerance=0.005):
    """A variable-frame-rate file has no single clock to conform to: its length is not frames / rate."""
    try: avg = Fraction(avg_text)
    except (TypeError, ValueError, ZeroDivisionError): return
    if avg > 0 and abs(float(avg / rate) - 1) > tolerance:
        raise ValueError(f"{os.path.basename(path)} has a variable frame rate (nominal {float(rate):.3f}, average "
                         f"{float(avg):.3f} fps). Re-cut it at a constant rate first (ffmpeg -r 24 …).")


def stretch(take_frames, take_rate, raw_frames, raw_rate):
    """How much longer the take is than the raw draft (1.079 for 96 frames against 89 at the same rate)."""
    return (Fraction(take_frames) / take_rate) / (Fraction(raw_frames) / raw_rate)


def rate_text(rate):
    return f"{rate.numerator}/{rate.denominator}"


def conform_filter(take_frames, take_rate, raw_frames, raw_rate):
    """The ffmpeg -vf string: stretch to the take's length, interpolate to its rate, pad, cut to its frame count."""
    k = stretch(take_frames, take_rate, raw_frames, raw_rate)
    return ",".join([
        f"setpts=PTS*{k.numerator}/{k.denominator}",
        MINTERPOLATE.format(rate=rate_text(take_rate)),
        "tpad=stop_mode=clone:stop=12",
        f"trim=end_frame={take_frames}",
        f"setpts=N/(({rate_text(take_rate)})*TB)",
    ])


def conform_command(raw, out, take_frames, take_rate, raw_frames, raw_rate):
    timescale = take_rate.numerator * (1000 if take_rate.denominator == 1 else 1)
    return ["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-vf",
            conform_filter(take_frames, take_rate, raw_frames, raw_rate),
            "-r", rate_text(take_rate), "-bf", "0", "-an", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p",
            "-video_track_timescale", str(timescale), out]


def conform(take, raw, out, force=False):
    """Writes `out` and returns the facts. Raises ValueError when the raw file is not this take a little fast."""
    tf, tr, _, _ = probe(take)          # raises ValueError on a variable frame rate
    rf, rr, w, h = probe(raw)
    k = float(stretch(tf, tr, rf, rr))
    if not (STRETCH_MIN <= k <= STRETCH_MAX) and not force:
        raise ValueError(f"the draft is {rf} frames at {float(rr):.3f} fps for a take of {tf} at {float(tr):.3f}: a "
                         f"stretch of {k:.3f}, outside {STRETCH_MIN} to {STRETCH_MAX}. This is not the take played a "
                         f"little fast. Check that it is the right clip (use --force only if you know why).")
    r = subprocess.run(conform_command(raw, out, tf, tr, rf, rr), capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out): raise RuntimeError(f"conform failed: {r.stderr.strip()[-400:]}")
    of, orate, _, _ = probe(out)
    if of != tf or orate != tr:
        raise RuntimeError(f"conformed file is {of} frames at {orate}, the take is {tf} at {tr}")
    return {"take_frames": tf, "take_rate": rate_text(tr), "raw_frames": rf, "raw_rate": rate_text(rr),
            "stretch": round(k, 4), "out_frames": of, "width": w, "height": h, "out": out}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("take"); ap.add_argument("raw"); ap.add_argument("out")
    ap.add_argument("--force", action="store_true", help="conform even when the stretch is outside the known band")
    a = ap.parse_args()
    try:
        print(json.dumps(conform(a.take, a.raw, a.out, a.force), indent=1))
    except ValueError as e:
        print(f"REFUSED: {e}", file=sys.stderr); sys.exit(2)


if __name__ == "__main__":
    main()
