#!/usr/bin/env python3
"""
Align a continuous performance recording to the canonical song audio.

  python3 scripts/sync/align_song_performance.py SONG.wav PERFORMANCE_AUDIO.(wav|m4a|mp4|mov) [--out sync.json]

Method (deterministic, $0):
  1. Decode both to mono 16 kHz with ffmpeg.
  2. Slide 10 s windows over the performance audio every 6 s; for each window
     compute GCC-PHAT cross-correlation against the FULL song (FFT, phase
     transform → sharp peaks even when the room recording is coloured/noisy).
  3. offset_window = (peak index / sr) − window_start.
     A window is "consistent" when its 2nd-best peak (≥ 50 ms away) is < 0.6 of the best.
  4. offset = median over consistent windows; drift = least-squares slope (ppm).

Output JSON matches public.performance_syncs (offset_seconds, drift_ppm, method,
confidence_json). song_time = performance_time * (1 + drift_ppm/1e6) + offset_seconds.
"""
import argparse, json, subprocess, sys, tempfile, os
import numpy as np

SR = 16000

def decode_mono16k(path: str) -> np.ndarray:
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), tmp], check=True)
    import scipy.io.wavfile as w
    sr, x = w.read(tmp); os.unlink(tmp)
    x = x.astype(np.float64)
    if x.ndim > 1: x = x.mean(1)
    return x / (np.abs(x).max() + 1e-9)

def gcc_phat(seg: np.ndarray, ref: np.ndarray) -> np.ndarray:
    n = len(ref) + len(seg) - 1; N = 1 << (n - 1).bit_length()
    R = np.fft.rfft(ref, N) * np.conj(np.fft.rfft(seg, N))
    R /= np.abs(R) + 1e-12
    return np.fft.irfft(R, N)[: len(ref)]

def align(song: np.ndarray, perf: np.ndarray, win_s=10, hop_s=6, exclude_ms=50, ratio_max=0.6):
    rows = []
    t0 = 2
    while (t0 + win_s) * SR <= len(perf):
        seg = perf[t0 * SR:(t0 + win_s) * SR]
        C = gcc_phat(seg, song); i = int(np.argmax(C)); off = i / SR - t0
        C2 = C.copy(); lo = max(0, i - int(SR * exclude_ms / 1000)); C2[lo:i + int(SR * exclude_ms / 1000)] = 0
        j = int(np.argmax(C2)); ratio = float(C2[j] / C[i]) if C[i] > 0 else 1.0
        rows.append({"window_start_s": t0, "offset_s": round(off, 4), "peak": round(float(C[i]), 5), "second_over_first": round(ratio, 3), "consistent": ratio < ratio_max})
        t0 += hop_s
    good = [r for r in rows if r["consistent"]]
    if not good:
        return None, rows
    offs = np.array([r["offset_s"] for r in good]); ts = np.array([r["window_start_s"] for r in good], float)
    A = np.vstack([ts, np.ones_like(ts)]).T; k, b = np.linalg.lstsq(A, offs, rcond=None)[0]
    return {
        "offset_seconds": round(float(np.median(offs)), 4),
        "drift_ppm": round(float(k * 1e6), 2),
        "method": "gcc_phat_windowed_16k_10s",
        "confidence_json": {
            "windowsTotal": len(rows), "windowsConsistent": len(good),
            "medianOffsetSeconds": round(float(np.median(offs)), 4),
            "minOffsetSeconds": round(float(offs.min()), 4), "maxOffsetSeconds": round(float(offs.max()), 4),
            "peakSharpnessMedian": round(float(np.median([1 - r["second_over_first"] for r in good])), 3),
            "windows": rows,
        },
    }, rows

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("song"); ap.add_argument("performance"); ap.add_argument("--out", default=None)
    a = ap.parse_args()
    song = decode_mono16k(a.song); perf = decode_mono16k(a.performance)
    rec, rows = align(song, perf)
    if rec is None:
        print("NO CONSISTENT ALIGNMENT — provide a manual offset (status='manual')", file=sys.stderr); sys.exit(2)
    rec["song_duration_s"] = round(len(song) / SR, 3); rec["performance_duration_s"] = round(len(perf) / SR, 3)
    rec["status"] = "auto"
    out = json.dumps(rec, indent=2)
    if a.out: open(a.out, "w").write(out)
    print(out)

if __name__ == "__main__":
    main()
