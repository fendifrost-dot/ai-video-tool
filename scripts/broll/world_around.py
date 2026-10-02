#!/usr/bin/env python3
"""
WORLD AROUND — build the environment around a real performance frame, through the app's provider lane.

    python3 scripts/broll/world_around.py --still frame.png --prompt "…" --out run/ --project <uuid> --user <uuid> \\
        [--model grok-image-2|qwen-image-3-edit] [--resolution 2k] [--aspect 9:16] [--extra-ref img.jpg …] [--jwt /tmp/jwt.txt]

Why (Fendi, 2026-10-02): a plate generated WITHOUT the performer and composited behind him reads as detached; a plate
generated AROUND him (the real frame is the first reference, the model keeps him and rebuilds the scene) carries his light
and perspective. The downstream is then: matte him out of the result → animate the empty plate (image-to-video) → composite
the real take back on the song clock (composite_environment.py). This script does the first step through
proxy-provider-call → video-providers-higgsfield-model `image_edit` (Grok Image 2.0 ≤ 10 refs, Qwen Image 3 ≤ 3 refs).

Writes <out>/<model>.png (the result), <out>/<model>.json (the envelope + final status), persists the still and the result to
project-references/<user>/<project>/worlds/around/. Costs: ≈ $0.14 (grok 2k) / $0.08 (qwen 2k) list per image.
"""
import argparse, json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
from run_broll_batch import Api, SUPA  # noqa: E402
from auth import Session  # noqa: E402
PROXY = f"{SUPA}/functions/v1/proxy-provider-call"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"

KEEP = ("Keep the person exactly as they are: same face, beard, glasses, hat, clothing, same pose and hands, same position "
        "and size in the frame, same camera height and lens. Rebuild only the environment around them, and light them with "
        "that environment's light so they belong to it. ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", required=True); ap.add_argument("--prompt", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--project", required=True); ap.add_argument("--user", required=True)
    ap.add_argument("--model", default="grok-image-2", choices=["grok-image-2", "qwen-image-3-edit"]); ap.add_argument("--resolution", default="2k")
    ap.add_argument("--aspect", default="9:16"); ap.add_argument("--extra-ref", action="append", default=[], help="more reference images (a world still, a wardrobe reference)")
    ap.add_argument("--no-keep-preamble", action="store_true"); ap.add_argument("--jwt", default="/tmp/jwt.txt"); ap.add_argument("--anon", default="/tmp/anon.txt")
    ap.add_argument("--poll-s", type=int, default=10); ap.add_argument("--max-wait-s", type=int, default=900)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    api = Api(Session.from_args(a))
    base = f"{a.user}/{a.project}/worlds/around"; stamp = time.strftime("%Y%m%d-%H%M%S")
    refs = []
    for i, p in enumerate([a.still] + a.extra_ref):
        ext = os.path.splitext(p)[1].lower() or ".png"; mime = "image/png" if ext == ".png" else "image/jpeg"
        sp = f"{base}/{stamp}_ref{i}{ext}"; api.upload("project-references", sp, open(p, "rb").read(), mime); refs.append(api.sign("project-references", sp, 86400))
    prompt = ("" if a.no_keep_preamble else KEEP) + a.prompt
    body = {"endpoint": "video-providers-higgsfield-model", "method": "POST", "body": {"promptText": prompt, "mode": "image_edit", "modelVariant": a.model, "referenceImageUrls": refs, "resolution": a.resolution, "aspectRatio": a.aspect, "avt_user_id": a.user, "avt_project_id": a.project}}
    rec = {"submitting": body["body"], "t": time.time()}; json.dump(rec, open(os.path.join(a.out, a.model + ".json"), "w"), indent=1)   # write-ahead
    r = api.post(PROXY, body, timeout=170); rec["envelope"] = r; json.dump(rec, open(os.path.join(a.out, a.model + ".json"), "w"), indent=1)
    if not r.get("ok"): raise SystemExit(f"submit failed: {json.dumps(r)[:600]}")
    jid = r.get("providerJobId") or r.get("jobId"); print("submitted", a.model, jid, f"~${(r.get('costEstimateCents') or 0) / 100:.2f}")
    t0 = time.time(); url = r.get("resultUrl")
    while not url and time.time() - t0 < a.max_wait_s:
        time.sleep(a.poll_s); st = api.post(PROXY, {"endpoint": "video-providers-job-status", "method": "GET", "query": {"provider": "higgsfield", "id": jid}}, timeout=60)
        rec["status"] = st; url = st.get("resultUrl")
        if st.get("status") in ("failed", "canceled", "nsfw", "error"): json.dump(rec, open(os.path.join(a.out, a.model + ".json"), "w"), indent=1); raise SystemExit(f"job failed: {json.dumps(st)[:600]}")
    if not url: raise SystemExit("timed out waiting for the result")
    out = os.path.join(a.out, a.model + ".png"); data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=300).read(); open(out, "wb").write(data)
    sp = f"{base}/{stamp}_{a.model}.png"; api.upload("project-references", sp, data, "image/png"); rec["result"] = {"file": out, "storage_path": sp, "bytes": len(data)}
    json.dump(rec, open(os.path.join(a.out, a.model + ".json"), "w"), indent=1); print("result", out, len(data) // 1000, "KB →", sp)


if __name__ == "__main__":
    main()
