"""Everything that happens to an ALTER draft after it is downloaded, in one command. Local, $0, no provider call.

    python -I scripts/alter/run_draft.py --take take.mp4 --raw raw.mp4 --out work/ --mode action \
        --face neutral.jpg --face three_quarter_left.jpg --face three_quarter_right.jpg

  1. conform   the raw draft to the take's length and rate (conform_draft.py; it comes back about 7% fast)
  2. track     his face and mouth in the take and in the conformed draft (track_mouth.py)
  3. score     mouth timing on the take's clock, lag, mouth shape, face coverage  -> score.json
  4. check     the frame checker with the mouth score, judged by gates.ts          -> report.json
  5. sheet     his face in the draft beside his face in the take and his photographs (face_check.py) -> face_sheet.jpg
  6. compare   take on the left, draft on the right, the take's audio, playable on a phone -> compare.mp4

After Fendi has judged the draft's face, record his verdict with its numbers (face_evidence.py add --run <out>): that
ledger is the test group a face line is later derived from.

It prints one JSON summary. `report.json` is what avt_alter_check (report) and avt_alter_plan (draft_check) take.
Exit 0 = cleared, or everything measured passed and the face is Fendi's to judge; 1 = not cleared; 2 = refused. Run with the
put-back's Python (~/.avt-venv/bin/python -I) and AVT_MODELS set. Nothing here decides that the face is his: with no
identity number the checker says so, and Fendi judges the sheet.
"""
import argparse, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from conform_draft import conform  # noqa: E402
from face_evidence import measure as face_measure  # noqa: E402

MODES = ("swap", "recast", "motion", "restyle", "action")


def run(cmd, ok=(0,), cwd=None, label=None):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if r.returncode not in ok:
        raise RuntimeError(f"{label or os.path.basename(cmd[0])} failed ({r.returncode}): "
                           f"{(r.stderr or r.stdout).strip()[-500:]}")
    return r.stdout


def need(*programs):
    """Everything is checked before any work starts, so a missing tool is not found after two minutes of tracking."""
    missing = [p for p in programs if not shutil.which(p)]
    if missing: sys.exit(f"REFUSED: not installed or not on PATH: {', '.join(missing)}")


def sheet_seconds(frames, rate):
    """Seven sample times spread over the clip, away from the first and last frames."""
    length = frames / rate
    return ",".join(f"{length * (i + 1) / 8:.2f}" for i in range(7))


def sheet_size(width, height, longest=960):
    """The take's shape, at most `longest` on its long side, even numbers."""
    k = min(1.0, longest / max(width, height))
    return f"{int(width * k) // 2 * 2}x{int(height * k) // 2 * 2}"


def compare_command(take, draft, out, height, rate):
    """Take | draft, the take's audio, an H.264 level and frame rate a phone will play."""
    vf = (f"[0:v]scale=-2:{height},setsar=1[a];[1:v]scale=-2:{height},setsar=1[b];"
          f"[a][b]hstack=inputs=2,fps={rate},format=yuv420p[v]")
    return ["ffmpeg", "-loglevel", "error", "-y", "-i", take, "-i", draft, "-filter_complex", vf, "-map", "[v]",
            "-map", "0:a:0?", "-c:v", "libx264", "-crf", "18", "-profile:v", "high", "-level", "4.0", "-r", str(rate),
            "-video_track_timescale", "24000", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--take", required=True, help="the stretch of his take that was sent (the same file)")
    ap.add_argument("--raw", required=True, help="the draft exactly as the provider returned it")
    ap.add_argument("--out", required=True, help="a folder for everything this writes")
    ap.add_argument("--mode", required=True, choices=MODES,
                    help="the preset's check mode (avt_alter_plan prints it). Required: action is the only mode with the "
                         "motion gate off, so it is never a default")
    ap.add_argument("--face", action="append", default=[], help="his face photograph from the tool (repeatable)")
    ap.add_argument("--not-performance", action="store_true", help="he is not rapping or singing in this stretch")
    ap.add_argument("--force", action="store_true", help="passed to the conform step")
    a = ap.parse_args()
    need("ffmpeg", "ffprobe", "node")
    os.makedirs(a.out, exist_ok=True)
    p = lambda name: os.path.join(a.out, name)
    py = [sys.executable, "-I"]
    tracker = os.path.join(HERE, "track_mouth.py")

    try:
        facts = conform(a.take, a.raw, p("draft.mp4"), a.force)
    except ValueError as e:
        print(f"REFUSED: {e}", file=sys.stderr); sys.exit(2)

    run(py + [tracker, "track", a.take, p("take.json")], label="track the take")
    run(py + [tracker, "track", p("draft.mp4"), p("draft.json")], label="track the draft")
    score = json.loads(run(py + [tracker, "score", p("take.json"), p("draft.json"), "--out", p("score.json")],
                           label="score"))

    check = ["node", "--experimental-strip-types", os.path.join(HERE, "check_clip.ts"), os.path.abspath(a.take),
             os.path.abspath(p("draft.mp4")), "--mode", a.mode, "--track-source", os.path.abspath(p("take.json")),
             "--track-output", os.path.abspath(p("draft.json")), "--score", os.path.abspath(p("score.json"))]
    if a.not_performance: check.append("--not-performance")
    report = json.loads(run(check, ok=(0, 1), cwd=ROOT, label="check_clip.ts"))   # exit 1 = CHECK, still a report
    json.dump(report, open(p("report.json"), "w"), indent=1)

    num, den = facts["take_rate"].split("/"); rate = int(num) / int(den)        # "24/1" -> 24.0
    written = ["draft.mp4", "take.json", "draft.json", "score.json", "report.json"]
    if a.face:
        cmd = py + [os.path.join(ROOT, "scripts", "edit", "face_check.py"), "--generated", p("draft.mp4"),
                    "--reference", a.take, "--out", p("face_sheet.jpg"),
                    "--size", sheet_size(facts["width"], facts["height"]),
                    "--seconds", sheet_seconds(facts["take_frames"], rate)]
        for f in a.face: cmd += ["--face", f]
        run(cmd, label="face sheet"); written.append("face_sheet.jpg")
    run(compare_command(a.take, p("draft.mp4"), p("compare.mp4"), min(720, facts["height"] // 2 * 2), round(rate)),
        label="side-by-side")
    written.append("compare.mp4")

    mouth = report.get("mouth") or {}
    steadiness = face_measure(json.load(open(p("take.json"))), json.load(open(p("draft.json"))))
    print(json.dumps({
        "verdict": report["verdict"], "mode": report["mode"],
        "redrawCleared": report.get("redrawCleared"), "faceNeedsHisEye": report.get("faceNeedsHisEye"),
        "conform": {k: facts[k] for k in ("take_frames", "raw_frames", "stretch", "out_frames")},
        "mouth": {"timing": score.get("timing"), "lag_frames": score.get("lag_frames"),
                  "shape": score.get("mouth_shape_distance"), "coverage": score.get("coverage"),
                  "timingFails": mouth.get("timingFails"), "shapeFails": mouth.get("shapeFails")},
        "identity_distance": score.get("identity_distance"),
        # against the take: above 1 = less steady than his real face. Recorded, not gated (face_evidence.py).
        "face_steadiness": {k: steadiness[k] for k in ("embedding_jitter", "shape_wobble")},
        "issues": report.get("issues", []),
        "folder": os.path.abspath(a.out), "written": written,
        "next": report.get("next", "") + ("" if a.face else " No face sheet was written: pass --face."),
    }, indent=1))
    # 0 = cleared, or everything measured passed and the face is Fendi's to judge; 1 = not cleared
    sys.exit(0 if report.get("redrawCleared") or report.get("faceNeedsHisEye") else 1)


if __name__ == "__main__":
    main()
