#!/usr/bin/env python3
"""
YSL (Ice On) · bars 24–46 · B-roll / FX slot renders (deterministic, $0).

Every slot is rendered ON THE SONG CLOCK from real, already-synced material wherever
the treatment allows it, so the section never leaves the performance for filler:

  S02  fashion insert  — real macro: 2.2× push-in on the trucker jacket (S03 env render)
  S05  ice hit         — real performance across the look change: S04 tail (Look 2) → white
                         bloom → S06 handle (Look 1); the white-out hides the wardrobe cut
  S07  city insert     — Grok Imagine still (public CDN) animated with a fast lateral push
  S10  mirror strobe   — 1/8-note strobe: mirrored S09 tail ×3, ice flashes ×3 (the 0.73 s
                         with no wardrobe render), mirrored S11 head ×2

Inputs are the env composites (scripts/edit/composite_environment.py). Outputs are
720×1280 @ 24 fps, exactly the slot length, ready for assemble_section.py.
"""
import argparse, json, os, subprocess, sys

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:]); raise SystemExit("ffmpeg failed: " + " ".join(cmd[:8]))

ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "24"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shotspecs", required=True); ap.add_argument("--env-dir", required=True)
    ap.add_argument("--renders", required=True, help="renders.json (masterStart per env clip)")
    ap.add_argument("--city-plate", required=True); ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.shotspecs)); sync = spec["sync"]
    shots = {s["id"]: s for s in spec["shots"]}
    R = json.load(open(a.renders)); os.makedirs(a.out_dir, exist_ok=True); a.out_dir = os.path.abspath(a.out_dir)
    s2p = lambda t: (t - sync["offsetSeconds"]) / (1 + sync.get("driftPpm", 0) / 1e6)
    # renders are made ~0.1 s LONGER than the slot; assemble_section.py trims to the exact
    # frame budget (round(t1*fps) - round(t0*fps)), so no slot can come up a frame short.
    PAD = 0.1
    dur = lambda sid: shots[sid]["timeline"]["end"] - shots[sid]["timeline"]["start"] + PAD
    def env(sid): return R[sid]["file"], R[sid]["masterStart"]
    out = {}

    # S02 — real macro push-in on the trucker jacket, from S03 (steady chest, bars 27-30)
    f, ms = env("S03"); d = dur("S02")
    off = s2p(shots["S03"]["timeline"]["start"]) - ms + 1.2
    p = os.path.join(a.out_dir, "S02_macro.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.3f}", "-i", f, "-t", f"{d:.3f}",
         "-vf", "scale=1584:2816:flags=lanczos,zoompan=z='3.0+0.4*on/48':x='iw/2-iw/zoom/2':y='ih*0.66-ih/zoom/2':d=1:s=720x1280:fps=24,eq=contrast=1.08:saturation=0.9,unsharp=5:5:0.4",
         *ENC, p]); out["S02"] = {"file": p}

    # S05 — ice hit across the look change (S04 tail → white → S06 handle)
    d = dur("S05"); t0 = shots["S05"]["timeline"]["start"]; half = (d - PAD) / 2
    f4, ms4 = env("S04"); f6, ms6 = env("S06")
    off4 = s2p(t0) - ms4; off6 = s2p(t0 + half) - ms6
    if off6 < 0: raise SystemExit("S06 render does not reach the S05 midpoint")
    a4 = os.path.join(a.out_dir, "_s05a.mp4"); b6 = os.path.join(a.out_dir, "_s05b.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off4:.3f}", "-i", f4, "-t", f"{half+0.05:.3f}",
         "-vf", f"fade=t=out:st=0:d={half:.3f}:color=white,fps=24", *ENC, a4])
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off6:.3f}", "-i", f6, "-t", f"{half+0.1:.3f}",
         "-vf", f"fade=t=in:st=0:d={half*0.6:.3f}:color=white,fps=24", *ENC, b6])
    p = os.path.join(a.out_dir, "S05_icehit.mp4")
    lst = os.path.join(a.out_dir, "_s05.txt"); open(lst, "w").write(f"file '{a4}'\nfile '{b6}'\n")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", p]); out["S05"] = {"file": p}

    # S07 — city insert: fast lateral push on the still (already motion-blurred plate)
    d = dur("S07"); n = int(round(d * 24))
    p = os.path.join(a.out_dir, "S07_city.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", a.city_plate, "-t", f"{d:.3f}",
         "-vf", f"scale=1440:2560:flags=lanczos,zoompan=z='1.05+0.30*on/{n}':x='iw*0.15+iw*0.25*on/{n}-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=24,tmix=frames=3,eq=contrast=1.1:saturation=1.05",
         *ENC, p]); out["S07"] = {"file": p}

    # S10 — mirror strobe: 8 eighth-notes. Fendi stays whole; the frame flips left/right on
    # every eighth (mirror-multiplied energy), with an ice flash on each flip. The 3 eighths
    # that no wardrobe render covers (master 78.58–79.30) are a hard strobe built from the
    # last covered S09 frame (negative / cold / bloom, 12 Hz) — declared FX, not filler.
    d = dur("S10"); e = (d - PAD) / 8; t0 = shots["S10"]["timeline"]["start"]
    EF = ["-frames:v", "6"]  # 0.246 s eighths → 6 frames each = 48 ≥ 47 needed
    f9, ms9 = env("S09"); f11, ms11 = env("S11")
    parts = []
    grade = "eq=contrast=1.2:saturation=0.65,colorbalance=bs=0.18:bm=0.10:bh=0.05,fps=24"
    def seg(src, off, k, flip):
        pk = os.path.join(a.out_dir, f"_s10_{k}.mp4")
        vf = ("hflip," if flip else "") + grade + (",fade=t=in:st=0:d=0.06:color=white" if k else "")
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.3f}", "-i", src, "-t", f"{e+0.1:.3f}", "-vf", vf, *EF, *ENC, pk]); return pk
    for k in range(3):
        parts.append(seg(f9, s2p(t0 + k * e) - ms9, k, flip=bool(k % 2)))
    # strobe from the last covered S09 frame
    last = os.path.join(a.out_dir, "_s10_last.png")
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.05", "-i", f9, "-frames:v", "1", last])
    for k in range(3, 6):
        pk = os.path.join(a.out_dir, f"_s10_{k}.mp4")
        vf = ("hflip," if k % 2 else "") + "negate,eq=contrast=1.6:brightness=-0.1:saturation=0.3,colorbalance=bs=0.3:bm=0.2,gblur=sigma=1.5,fps=24,fade=t=in:st=0:d=0.001:color=white,fade=t=out:st=0.04:d=0.20:color=black"
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", last, "-t", f"{e+0.1:.3f}", "-vf", vf, *EF, *ENC, pk]); parts.append(pk)
    for k in range(6, 8):
        parts.append(seg(f11, s2p(t0 + k * e) - ms11, k, flip=bool(k % 2)))
    lst = os.path.join(a.out_dir, "_s10.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    p = os.path.join(a.out_dir, "S10_mirrorstrobe.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", p]); out["S10"] = {"file": p}

    json.dump(out, open(os.path.join(a.out_dir, "fx_renders.json"), "w"), indent=2)
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
