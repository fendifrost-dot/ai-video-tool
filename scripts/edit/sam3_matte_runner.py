"""Run sam3_matte.py on a GPU through Hugging Face Jobs and bring the matte back. $0 unless credentials already exist.
usage: sam3_matte_runner.py <clip.mp4> <out_dir> [--prompt "man in cap"] [--face-frames 0,60,120] [--flavor a10g-small]
                            [--timeout 30m] [--dry-run] [-- extra sam3_matte.py args]

Why HF Jobs and not Modal: the weights are gated on the Hub, so the one credential this needs (HF_TOKEN) is the one
that unlocks them; a Modal account would be a second sign-up and a second secret for the same GPU minutes. Jobs are
pay-as-you-go by the second (a10g-small $1.00/h, l4x1 $0.80/h, t4-small $0.40/h; `hf jobs hardware`), the clip goes
up as a mounted volume and the matte comes back the same way (sync_job_volume / sync_bucket, huggingface_hub docs).

Spend guard: with no HF token in HF_TOKEN / HUGGINGFACE_HUB_TOKEN / the hub's cached login this prints how to run and
exits 2 without contacting anything. The token is passed to the job as a secret and is never printed. Expect a few
minutes of GPU per 4 s clip (model download included): about $0.05-0.20 on a10g-small. Add a ledger row
(docs/LEDGER_YSL_TESTING_BUDGET.md) for every run, from the job's duration.

Output: <out_dir>/<clip basename>.matte.mp4 (+ .json, face_<k>.png) — the name the scripts' --sam3-matte-dir expects."""
import argparse, os, shutil, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from segmenters import hf_token, matte_path_for, DEFAULT_PROMPT

HOWTO = """No Hugging Face token found, so nothing was launched (and nothing was spent).
To run the SAM 3 matte on a GPU:
  1. request access to the gated weights at https://huggingface.co/facebook/sam3 (wait for the grant);
  2. make sure the account has a positive Jobs credit balance (https://huggingface.co/settings/billing);
  3. export HF_TOKEN=<a token with read access> (or `hf auth login`); never paste it into chat, code or commits;
  4. python3 scripts/edit/sam3_matte_runner.py <clip.mp4> <out_dir> --prompt "man in cap" --face-frames 0,60,120
Or locally, on this machine's CUDA / Apple MPS / CPU:
  python3 scripts/edit/sam3_matte.py <clip.mp4> <out_dir>/<clip>.matte.mp4 --prompt "man in cap"
Or keep the existing path: --segmenter mediapipe (the default) on body_only_swap.py / replace_him_in_clip.py."""


def plan(A, token_present):
    name = os.path.basename(A.clip)
    args = ["/input/" + name, "/output/" + name + ".matte.mp4", "--prompt", A.prompt, "--device", "cuda"]
    if A.face_frames: args += ["--face-frames", A.face_frames, "--stills", "/output/stills"]
    args += A.extra
    return dict(script=os.path.join(HERE, "sam3_matte.py"), script_args=args, flavor=A.flavor, timeout=A.timeout,
                env={"PYTHONPATH": "/input", "HF_HUB_ENABLE_HF_TRANSFER": "0"}, secrets=["HF_TOKEN"] if token_present else [],
                volumes=[dict(local=os.path.dirname(os.path.abspath(A.clip)) + " (clip + segmenters.py)", mount="/input", read_only=True),
                         dict(local=A.out_dir, mount="/output", read_only=False)],
                output=matte_path_for(A.out_dir, A.clip))


def main(argv=None):
    ap = argparse.ArgumentParser(description="SAM 3 person matte on a Hugging Face GPU Job")
    ap.add_argument("clip"); ap.add_argument("out_dir")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT, help="text prompt (default: 'man in cap')")
    ap.add_argument("--face-frames", default="", help="frames whose SAM 3 face mask and person matte PNGs come back too, e.g. 0,60,120")
    ap.add_argument("--flavor", default="a10g-small", help="HF Jobs hardware (default a10g-small, $1.00/h)")
    ap.add_argument("--timeout", default="30m", help="job timeout (default 30m: the hard cap on spend)")
    ap.add_argument("--dry-run", action="store_true", help="print the job plan and exit 0 without launching")
    ap.add_argument("extra", nargs="*", help="extra arguments for sam3_matte.py after --")
    A = ap.parse_args(argv)
    token = hf_token()
    p = plan(A, token is not None)
    if A.dry_run:
        print("DRY RUN — would launch:")
        for k, v in p.items(): print(f"  {k}: {v}")
        print("  hf token:", "present" if token else "absent")
        return 0
    if token is None:
        print(HOWTO); return 2
    try:
        from huggingface_hub import run_uv_job, sync_job_volume, sync_bucket, wait_for_job, fetch_job_logs
    except ImportError:
        print("huggingface_hub is not installed: pip install 'huggingface_hub>=1.0' (then rerun)"); return 2
    stage = tempfile.mkdtemp(prefix="avt_sam3_in_")
    shutil.copy2(A.clip, os.path.join(stage, os.path.basename(A.clip)))
    shutil.copy2(os.path.join(HERE, "segmenters.py"), os.path.join(stage, "segmenters.py"))
    os.makedirs(A.out_dir, exist_ok=True)
    vin = sync_job_volume(stage, "/input")
    vout = sync_job_volume(A.out_dir, "/output", read_only=False)
    t0 = time.time()
    job = run_uv_job(p["script"], script_args=p["script_args"], flavor=A.flavor, timeout=A.timeout, env=p["env"],
                     secrets={"HF_TOKEN": token}, volumes=[vin, vout])
    print("job", job.id, job.url, "flavor", A.flavor, "timeout", A.timeout)
    info = wait_for_job(job_id=job.id)
    mins = (time.time() - t0) / 60
    for line in fetch_job_logs(job_id=job.id): print("  |", line)
    print("job", info.status.stage, f"{mins:.1f} min wall;", "ledger: HF Jobs", A.flavor, f"~{mins:.1f} min")
    if info.status.stage != "COMPLETED":
        print("job failed:", info.status.message); return 1
    sync_bucket(f"hf://buckets/{vout.source}/{vout.path}", A.out_dir)
    out = p["output"]
    print("matte", out, "present" if os.path.exists(out) else "MISSING")
    return 0 if os.path.exists(out) else 1


if __name__ == "__main__":
    sys.exit(main())
