#!/usr/bin/env python3
"""
REVIEW REEL — one labelled slot per shot, on the song, from a manifest of the clip chosen for each shot.

    python3 scripts/edit/review_reel.py --manifest reel/manifest.json --clips reel/dl --song song.wav --out reel/REVIEW.mp4

The manifest lists shots in board order: {key, section, start, end, asset, status, offset}. `start`/`end` are song
seconds (the shot's slot), `offset` is the clip's sync (song time of its frame 0, or null for a cutaway that is
not on the song clock). Each slot plays the clip from `start - offset` for `end - start` seconds; a clip shorter
than its slot holds its last frame. Clip files are `<clips>/<key>_<asset[:8]>.mp4`.

The label is two lines on a dark band: the slot, and the status text; status colour green for FINAL/APPROVED/PICK,
red for GAP, yellow otherwise. A contact sheet (one mid-slot frame per shot) is written next to the reel.
"""
import argparse, json, os, subprocess, sys


def source_in(start: float, offset):
    """Where the clip starts for a slot that begins at song `start`: never before the clip's first frame."""
    return 0.0 if offset is None else max(0.0, round(start - offset, 3))


def status_colour(status: str) -> str:
    if status.startswith(("FINAL", "APPROVED", "PICK")):
        return "0x2ecc71"
    if status.startswith("GAP"):
        return "0xe74c3c"
    return "0xf1c40f"


def find_font() -> str:
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(p):
            return p
    raise SystemExit("no TTF font found for the labels")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True); ap.add_argument("--clips", required=True)
    ap.add_argument("--song", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--size", default="720x1280"); ap.add_argument("--fps", type=int, default=24)
    a = ap.parse_args()
    w, h = (int(x) for x in a.size.split("x"))
    m = json.load(open(a.manifest)); font = find_font()
    work = os.path.splitext(a.out)[0] + "_work"; os.makedirs(f"{work}/seg", exist_ok=True); os.makedirs(f"{work}/lbl", exist_ok=True)
    segs = []
    for i, sh in enumerate(m["shots"]):
        src = os.path.join(a.clips, f"{sh['key']}_{sh['asset'][:8]}.mp4"); dur = round(sh["end"] - sh["start"], 3)
        sin = source_in(sh["start"], sh.get("offset"))
        l1, l2 = f"{work}/lbl/{sh['key']}_1.txt", f"{work}/lbl/{sh['key']}_2.txt"
        open(l1, "w").write(f"{sh['key']}  {sh['section']}  {sh['start']:.2f}-{sh['end']:.2f}s  asset {sh['asset'][:8]}")
        open(l2, "w").write(sh["status"])
        vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,fps={a.fps},"
              f"tpad=stop_mode=clone:stop_duration=10,drawbox=x=0:y=0:w={w}:h=92:color=black@0.55:t=fill,"
              f"drawtext=fontfile='{font}':textfile='{l1}':x=12:y=12:fontsize=24:fontcolor=white,"
              f"drawtext=fontfile='{font}':textfile='{l2}':x=12:y=48:fontsize=20:fontcolor={status_colour(sh['status'])}")
        out = f"{work}/seg/{i:02d}_{sh['key']}.mp4"
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{sin:.3f}", "-i", src, "-t", f"{dur:.3f}", "-vf", vf, "-an",
                            "-r", str(a.fps), "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", out],
                           capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"{sh['key']}: {r.stderr[:400]}")
        segs.append(out)
    open(f"{work}/concat.txt", "w").write("".join(f"file '{s}'\n" for s in segs))
    total = round(m["shots"][-1]["end"] - m["shots"][0]["start"], 3)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{work}/concat.txt", "-c", "copy", f"{work}/video.mp4"], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{work}/video.mp4", "-ss", f"{m['shots'][0]['start']:.3f}", "-i", a.song,
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", a.out], check=True)
    try:
        import cv2, numpy as np
        tiles = []
        for i, sh in enumerate(m["shots"]):
            cap = cv2.VideoCapture(segs[i]); n = int(cap.get(7)); cap.set(1, max(0, n // 2)); ok, f = cap.read()
            tiles.append(cv2.resize(f if ok else np.zeros((h, w, 3), np.uint8), (300, 533), interpolation=cv2.INTER_AREA))
        cols = 8; rows = (len(tiles) + cols - 1) // cols
        tiles += [np.zeros((533, 300, 3), np.uint8)] * (rows * cols - len(tiles))
        sheet = np.vstack([np.hstack(tiles[r * cols:(r + 1) * cols]) for r in range(rows)])
        cv2.imwrite(os.path.splitext(a.out)[0] + "_contact_sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    except ImportError:
        print("no cv2: contact sheet skipped", file=sys.stderr)
    print(f"reel {a.out}: {len(segs)} slots, {total} s")


if __name__ == "__main__":
    main()
