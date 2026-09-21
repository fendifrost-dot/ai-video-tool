#!/usr/bin/env python3
"""
YSL (Ice On) · bars 24–46 · B-roll / FX slot renders (deterministic, $0).

Every slot is rendered ON THE SONG CLOCK from real, already-synced material wherever
the treatment allows it, so the section never leaves the performance for filler:

  S02  fashion insert  — real macro: 2.2× push-in on the trucker jacket (S03 env render)
  S05  diamond flash   — performer-free insert (Astra review #1, S05 was a performance
                         cross-fade): Grok Imagine diamond still, push-in + prismatic bloom,
                         whiting out on the last beat before bar 32 (S06 has flash-in)
  S07  city insert     — Grok Imagine still (public CDN) animated with a fast lateral push
  S10  mirror strobe   — performer-free insert (Astra review #1): infinity-mirror corridor
                         still, slow push, hard 1/8-note strobe (flip / negative / ice flash)

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
    ap.add_argument("--diamond-plate", required=True, help="S05 still (Grok Imagine, public CDN)")
    ap.add_argument("--corridor-plate", required=True, help="S10 still (Grok Imagine, public CDN)")
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

    # S02 — controlled product macro (Astra review #1: the v1 macro drifted into a hand swing;
    # every 2 s window of the trucker shots has hands crossing the chest, so this is a locked
    # still-life): one clean frame of S03, locked on his left chest pocket + button placket,
    # slow 3.2→3.5× push, cold grade, vignette, light sharpen, fine grain so it is not a freeze.
    f, ms = env("S03"); d = dur("S02"); n = int(round(d * 24))
    off = s2p(shots["S03"]["timeline"]["start"]) - ms + 1.55
    still = os.path.join(a.out_dir, "_s02_still.png")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{off:.3f}", "-i", f, "-frames:v", "1", still])
    p = os.path.join(a.out_dir, "S02_macro.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", still, "-t", f"{d:.3f}",
         "-vf", f"scale=1584:2816:flags=lanczos,zoompan=z='3.2+0.3*on/{n}':x='iw*0.56-iw/zoom/2':y='ih*0.60-ih/zoom/2':d=1:s=720x1280:fps=24,"
                "eq=contrast=1.1:saturation=0.85,colorbalance=bs=0.08:bm=0.04,unsharp=5:5:0.5,noise=alls=6:allf=t,vignette=PI/4",
         *ENC, p]); out["S02"] = {"file": p}

    # S05 — diamond refraction flash (performer-free): push-in on the still, prismatic bloom
    # rising through the half bar, hard white-out over the last 6 frames into S06's flash-in.
    d = dur("S05"); n = int(round(d * 24))
    p = os.path.join(a.out_dir, "S05_diamond.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", a.diamond_plate, "-t", f"{d:.3f}",
         "-vf", f"scale=1440:2560:flags=lanczos,zoompan=z='1.0+0.18*on/{n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=24,"
                f"eq=contrast=1.15:saturation=1.1,gblur=sigma=0.6,curves=preset=increase_contrast,"
                f"fade=t=out:st={max(0.0, d - PAD - 0.25):.3f}:d=0.25:color=white",
         *ENC, p]); out["S05"] = {"file": p}

    # S07 — city insert: fast lateral push on the still (already motion-blurred plate)
    d = dur("S07"); n = int(round(d * 24))
    p = os.path.join(a.out_dir, "S07_city.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", a.city_plate, "-t", f"{d:.3f}",
         "-vf", f"scale=1440:2560:flags=lanczos,zoompan=z='1.05+0.30*on/{n}':x='iw*0.15+iw*0.25*on/{n}-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=24,tmix=frames=3,eq=contrast=1.1:saturation=1.05",
         *ENC, p]); out["S07"] = {"file": p}

    # S10 — mirror corridor strobe (performer-free): 8 eighth-notes on the corridor still.
    # Even eighths: slow push, cold grade; odd eighths: mirrored + negative ice flash decaying
    # to black over the eighth — a hard 1/8-note strobe the whole bar, then S11 glitches in.
    d = dur("S10"); e = (d - PAD) / 8
    EF = ["-frames:v", "6"]  # 0.246 s eighths → 6 frames each = 48 ≥ 47 needed
    grade = "eq=contrast=1.2:saturation=0.7,colorbalance=bs=0.18:bm=0.10:bh=0.05"
    parts = []
    for k in range(8):
        pk = os.path.join(a.out_dir, f"_s10_{k}.mp4")
        z0 = 1.0 + 0.04 * k
        base = f"scale=1440:2560:flags=lanczos,zoompan=z='{z0}+0.04*on/6':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=24"
        if k % 2 == 0:
            vf = base + "," + grade + (",fade=t=in:st=0:d=0.05:color=white" if k else "")
        else:
            vf = base + ",hflip,negate,eq=contrast=1.5:brightness=-0.05:saturation=0.35,colorbalance=bs=0.3:bm=0.2,gblur=sigma=1.2,fade=t=in:st=0:d=0.001:color=white,fade=t=out:st=0.04:d=0.20:color=black"
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", a.corridor_plate, "-t", f"{e+0.1:.3f}", "-vf", vf, *EF, *ENC, pk]); parts.append(pk)
    lst = os.path.join(a.out_dir, "_s10.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    p = os.path.join(a.out_dir, "S10_mirrorstrobe.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", p]); out["S10"] = {"file": p}

    json.dump(out, open(os.path.join(a.out_dir, "fx_renders.json"), "w"), indent=2)
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
