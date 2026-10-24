"""Silent, moving stretches of a take scanned by mouth_scan.py (the lip-gap CSV). $0.
A sample is 'shut' when lip gap < GAP (nan = face lost: breaks a run after TOL samples). A run of >= MIN_S seconds
is listed with its take time, song time (offsets.py), length, how much he moves (nose travel px/s at 1080 wide,
and face width change) and the mean/max gap inside it. usage: silent_runs.py <csv> <offset_song_minus_take> [gap=0.05]   (the offset: song t = take t + offset, e.g. scripts/edit/offsets by onset cross-correlation)"""
import sys, csv, numpy as np
p, off = sys.argv[1], float(sys.argv[2]); GAP = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
MIN_S, TOL = 3.5, 2
rows = list(csv.DictReader(open(p)))
t = np.array([float(r["t"]) for r in rows]); g = np.array([float(r["gap"]) for r in rows])
nx = np.array([float(r["nose_x"]) for r in rows]); ny = np.array([float(r["nose_y"]) for r in rows]); fw = np.array([float(r["face_w"]) for r in rows])
# the gap, median-smoothed over 5 samples (0.8 s): one blink of the landmarker or a breath does not break a run
gs = g.copy(); ok0 = ~np.isnan(g)
for k in range(len(g)):
    w = g[max(0, k - 2):k + 3]; w = w[~np.isnan(w)]
    gs[k] = np.median(w) if len(w) >= 2 else g[k]
g = gs
ok = ~np.isnan(g); print(f"{p.split('/')[-1]}: {len(t)} samples, face found {ok.mean()*100:.0f}%, gap p50 {np.nanpercentile(g,50):.3f} p90 {np.nanpercentile(g,90):.3f}; shut = gap < {GAP}")
shut = np.where(ok, g < GAP, False); open_ = np.where(ok, g >= GAP, False)
runs = []; i = 0; n = len(t)
while i < n:
    if not shut[i]: i += 1; continue
    j = i; bad = 0; last_good = i
    while j < n:
        if shut[j]: bad = 0; last_good = j
        else:
            bad += 1
            if bad > TOL or open_[j] and g[j] > GAP * 1.6: break
        j += 1
    if t[last_good] - t[i] >= MIN_S: runs.append((i, last_good))
    i = max(j, i + 1)
print(f"{'take s':>14} {'song s':>14} {'len':>5} {'nose px/s':>9} {'face w':>9} {'gap mean/max':>12}")
for a, b in runs:
    sl = slice(a, b + 1); m = ok0[sl]
    dx = np.abs(np.diff(nx[sl][m])).sum() + np.abs(np.diff(ny[sl][m])).sum(); secs = t[b] - t[a]
    print(f"{t[a]:6.1f}-{t[b]:6.1f} {t[a]+off:6.1f}-{t[b]+off:6.1f} {secs:5.1f} {dx/secs:9.0f} {np.nanmin(fw[sl]):4.0f}-{np.nanmax(fw[sl]):4.0f} {np.nanmean(g[sl]):.3f}/{np.nanmax(g[sl]):.3f}")
