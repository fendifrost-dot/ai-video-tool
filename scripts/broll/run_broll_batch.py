#!/usr/bin/env python3
"""
B-ROLL BATCH — lyric concepts → provider renders → realism gate → manifest. Nothing here knows a song, a shot
or a project: the concepts come from lyric-visualizer-proxy JSON, the still and the project id are arguments,
the provider is a switch, and every clip is judged by scripts/qa/realism_gate.py before it can be cut.

  python3 scripts/broll/run_broll_batch.py --concepts treat/lyric_concepts_section.json [--concepts more.json] \\
      --still heroes/S06/anchor_hook_s11_f0080_onstage_v3.jpg --provider higgsfield --model dop-preview \\
      --project 764a63d2-… --out broll_batch/ --ref-stats realism/real_stats.json --judge [--max-risk medium] \\
      [--prefer literal,surreal,performance] [--seconds 5] [--seed 4242] [--max-usd 8]

Picking: for each lyric line, the first concept (in --prefer order) whose realism_risk ≤ --max-risk and which does
not need a new plate; --pick ref=kind overrides a line. Prompts are the concept's broll_prompt with the camera idea
lifted to the front as "Camera move: …" (the Higgsfield provider formatter convention; harmless for Grok).

Providers:
  higgsfield  AVT proxy-provider-call → Control Center video-providers-higgsfield-generate (DoP image-to-video,
              modelVariant dop-lite|dop-preview|dop-turbo), status via video-providers-job-status {provider, id};
              the finished clip is a public CDN URL → downloaded → uploaded to project-clips/<user>/<project>/broll/.
  grok        AVT grok-broll-proxy (submit/poll; persists its own asset row).

Output: <out>/manifest.json (per line: concept, prompt, provider job, file, gate verdict, costs), <out>/<ref>.mp4,
<out>/contact.jpg. Costs: Higgsfield is billed to the organisation balance (list rate carried per tier); Grok and the
judge report billed amounts.
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_lib")); from jobs import job  # resource governor + registry (scripts/_lib/jobs.py)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SUPA = "https://qoyxgnkvjukovkrvdaiq.supabase.co"
HF_LIST_USD_PER_CLIP = {"dop-lite": 0.135, "dop-preview": 0.573, "dop-turbo": 0.416}     # 5 s list prices (pixazo catalogue, 2026-10)
RISK = {"low": 0, "medium": 1, "high": 2}


class Api:
    def __init__(self, jwt, anon):
        self.h = {"Authorization": "Bearer " + jwt.strip(), "apikey": anon.strip(), "Content-Type": "application/json"}
    def post(self, url, body, timeout=120):
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=self.h)
        try: return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())
        except urllib.error.HTTPError as e: return {"httpError": e.code, "body": e.read().decode()[:1500]}
    def sign(self, bucket, path, ttl=7200):
        s = self.post(f"{SUPA}/storage/v1/object/sign/{bucket}/{path}", {"expiresIn": ttl})
        if "signedURL" not in s: raise SystemExit(f"sign failed for {bucket}/{path}: {s}")
        return SUPA + "/storage/v1" + s["signedURL"]
    def upload(self, bucket, path, data, mime):
        req = urllib.request.Request(f"{SUPA}/storage/v1/object/{bucket}/{path}", data=data, method="POST", headers={**{k: v for k, v in self.h.items() if k != "Content-Type"}, "Content-Type": mime, "x-upsert": "true"})
        return json.loads(urllib.request.urlopen(req, timeout=300).read().decode())


def pick(line, prefer, max_risk, override=None):
    cands = [c for c in line["concepts"] if RISK[c["realism_risk"]] <= RISK[max_risk] and not c["needs_plate_change"]]
    if override: cands = [c for c in line["concepts"] if c["kind"] == override] or cands
    for kind in prefer:
        for c in cands:
            if c["kind"] == kind: return c
    return cands[0] if cands else None


def prompt_for(c, look=None):
    """look = a preset from config/look_presets.json: its preamble leads, its shot_suffix closes; absent = bare prompt."""
    cam = c["camera"].strip().rstrip("."); body = c["broll_prompt"].strip()
    core = f"Camera move: {cam}. {body}"
    if not look: return core
    pre = (look.get("preamble") or "").strip(); suf = (look.get("shot_suffix") or "").strip()
    return " ".join(x for x in (pre, core, suf) if x)


def load_look(name, path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "config", "look_presets.json")):
    if not name: return None
    presets = json.load(open(path)); look = presets.get(name)
    if not look: raise SystemExit(f"unknown look preset {name!r}; known: {', '.join(k for k in presets if not k.startswith('_'))}")
    return look


def hf_submit(api, user_id, project, still_url, prompt, model, seed):
    b = {"promptText": prompt, "referenceImageUrl": still_url, "modelVariant": model, "avt_user_id": user_id, "avt_project_id": project}
    if seed is not None: b["seed"] = seed
    return api.post(f"{SUPA}/functions/v1/proxy-provider-call", {"endpoint": "video-providers-higgsfield-generate", "method": "POST", "body": b})


def hf_status(api, job):
    return api.post(f"{SUPA}/functions/v1/proxy-provider-call", {"endpoint": "video-providers-job-status", "method": "GET", "query": {"provider": "higgsfield", "id": job}})


def grok_submit(api, project, still_path, prompt, seconds, label, pv):
    return api.post(f"{SUPA}/functions/v1/grok-broll-proxy", {"mode": "submit", "projectId": project, "imagePath": still_path, "imageBucket": "project-references", "prompt": prompt, "duration": seconds, "aspectRatio": "9:16", "resolution": "720p", "maxCostUsd": 1.2, "shotLabel": label, "promptVersion": pv, "label": label})


def grok_poll(api, project, rid, label, pv):
    return api.post(f"{SUPA}/functions/v1/grok-broll-proxy", {"mode": "poll", "projectId": project, "requestId": rid, "shotLabel": label, "promptVersion": pv, "label": label})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--concepts", action="append", required=True); ap.add_argument("--still", required=True, help="path inside project-references (owner-foldered)")
    ap.add_argument("--provider", choices=["higgsfield", "grok"], default="higgsfield"); ap.add_argument("--model", default="dop-preview")
    ap.add_argument("--project", required=True); ap.add_argument("--user", default=None, help="user id (defaults to the first path segment of --still)")
    ap.add_argument("--out", required=True); ap.add_argument("--jwt", default="/tmp/jwt.txt"); ap.add_argument("--anon", default="/tmp/anon.txt")
    ap.add_argument("--prefer", default="literal,surreal,performance"); ap.add_argument("--max-risk", choices=["low", "medium", "high"], default="medium")
    ap.add_argument("--pick", action="append", default=[], help="ref=kind override"); ap.add_argument("--only", default=None, help="comma-separated refs")
    ap.add_argument("--seconds", type=int, default=5); ap.add_argument("--seed", type=int, default=None); ap.add_argument("--max-usd", type=float, default=8.0)
    ap.add_argument("--judge", action="store_true"); ap.add_argument("--ref-stats", default=None); ap.add_argument("--prompt-version", default="lyric_broll_v1")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--look-preset", default=None, help="name in config/look_presets.json; its preamble and shot suffix wrap every prompt")
    a = ap.parse_args(); look = load_look(a.look_preset)
    _job = job("batch", need_gb=0.3, out=a.out); _job.__enter__()
    api = Api(open(a.jwt).read(), open(a.anon).read()); os.makedirs(a.out, exist_ok=True)
    user_id = a.user or a.still.split("/")[0]; overrides = dict(p.split("=") for p in a.pick); prefer = a.prefer.split(",")
    lines = []
    for f in a.concepts:
        d = json.load(open(f)); lines += (d.get("result") or d).get("lines", [])
    if a.only: lines = [L for L in lines if L["ref"] in a.only.split(",")]
    plan = []
    for L in lines:
        c = pick(L, prefer, a.max_risk, overrides.get(L["ref"]))
        if c is None: print(f"{L['ref']}: no concept within risk {a.max_risk}", flush=True); continue
        plan.append({"ref": L["ref"], "text": L["text"], "kind": c["kind"], "title": c["title"], "risk": c["realism_risk"], "camera": c["camera"], "prompt": prompt_for(c, look), "look_preset": a.look_preset})
    est = len(plan) * (HF_LIST_USD_PER_CLIP.get(a.model, 0.6) if a.provider == "higgsfield" else 0.0703 * a.seconds)
    print(f"plan: {len(plan)} clips via {a.provider}/{a.model}, est ${est:.2f}" + (" + judge" if a.judge else ""), flush=True)
    for p in plan: print(f"  {p['ref']:<4} [{p['kind']}/{p['risk']}] {p['title']}", flush=True)
    if est > a.max_usd: raise SystemExit(f"estimate ${est:.2f} exceeds --max-usd {a.max_usd}")
    if a.dry_run: json.dump({"plan": plan}, open(os.path.join(a.out, "plan.json"), "w"), indent=1); return
    still_url = api.sign("project-references", a.still)
    # ---- submit
    for p in plan:
        if a.provider == "higgsfield":
            r = hf_submit(api, user_id, a.project, still_url, p["prompt"], a.model, a.seed); p["job"] = r.get("providerJobId"); p["submit"] = {k: r.get(k) for k in ("ok", "status", "errorCode", "errorMessage", "httpError", "body")}
        else:
            r = grok_submit(api, a.project, a.still, p["prompt"], a.seconds, p["ref"], a.prompt_version); p["job"] = r.get("requestId"); p["submit"] = {k: r.get(k) for k in ("submitted", "billed", "estimatedCostUsd", "error")}
        print(f"submitted {p['ref']} → {p['job']}", flush=True); time.sleep(1.0)
    # ---- poll
    pending = [p for p in plan if p.get("job")]; t0 = time.time()
    while pending and time.time() - t0 < 1800:
        time.sleep(20)
        for p in list(pending):
            if a.provider == "higgsfield":
                s = hf_status(api, p["job"]); st = s.get("status")
                if st == "succeeded": p["result_url"] = s.get("resultUrl"); p["cost_usd_est"] = HF_LIST_USD_PER_CLIP.get(a.model); pending.remove(p)
                elif st == "failed" or s.get("httpError"): p["error"] = s; pending.remove(p)
            else:
                s = grok_poll(api, a.project, p["job"], p["ref"], a.prompt_version); st = s.get("status")
                if st == "done" and s.get("output"):
                    p["stored_path"] = s["output"]["storedPath"]; p["cost_usd"] = s.get("actualCostUsd"); p["asset_id"] = s.get("assetId"); pending.remove(p)
                elif s.get("failed") or s.get("error") or s.get("httpError"): p["error"] = s; pending.remove(p)
        print(f"  waiting on {len(pending)}…", flush=True)
    # ---- download (+ persist Higgsfield clips into project-clips so the asset exists in the product)
    for p in plan:
        dst = os.path.join(a.out, f"{p['ref']}_{p['kind']}.mp4")
        if p.get("result_url"):
            urllib.request.urlretrieve(p["result_url"], dst); p["file"] = dst
            with open(dst, "rb") as fh: data = fh.read()
            path = f"{user_id}/{a.project}/broll/{a.provider}_{a.model}_{p['ref']}_{p['kind']}_{p['job'][:8]}.mp4"
            try: api.upload("project-clips", path, data, "video/mp4"); p["stored_path"] = path
            except Exception as e: p["store_error"] = str(e)[:200]
        elif p.get("stored_path"):
            urllib.request.urlretrieve(api.sign("project-clips", p["stored_path"]), dst); p["file"] = dst
    # ---- gate
    files = [p["file"] for p in plan if p.get("file")]
    if files and a.ref_stats:
        cmd = [sys.executable, os.path.join(ROOT, "scripts", "qa", "realism_gate.py"), "--ref-stats", a.ref_stats, "--clip", *files, "--out", os.path.join(a.out, "gate.json"), "--project-id", a.project, "--jwt", a.jwt, "--anon", a.anon]
        if a.judge: cmd.append("--judge")
        subprocess.run(cmd, check=False, env={**os.environ, "AVT_PROJECT_ID": a.project})
        if os.path.exists(os.path.join(a.out, "gate.json")):
            g = {r["clip"]: r for r in json.load(open(os.path.join(a.out, "gate.json")))["reports"]}
            for p in plan:
                r = g.get(p.get("file"))
                if r:
                    rv = (r.get("tier2") or {}).get("review") or {}
                    p["gate"] = {"verdict": r["verdict"], "tier1": r["tier1"]["verdict"], "identity": r["tier1"]["metrics"].get("identity_dist_median"), "scene_drift": r["tier1"]["metrics"].get("scene_drift"), "flags": r["tier1"]["flags"],
                                 "judge": rv.get("ai_likelihood"), "judge_verdict": rv.get("verdict"), "tells": [t["tell"][:120] for t in rv.get("tells", [])[:3]], "judge_cost": (r.get("tier2") or {}).get("actualCostUsd")}
    json.dump({"provider": a.provider, "model": a.model, "still": a.still, "seconds": a.seconds, "seed": a.seed, "plan": plan}, open(os.path.join(a.out, "manifest.json"), "w"), indent=1)
    # ---- contact sheet
    try:
        import cv2, numpy as np
        rows = []
        for p in plan:
            if not p.get("file"): continue
            cap = cv2.VideoCapture(p["file"]); n = int(cap.get(7)); fr = []
            for i in np.linspace(0, max(0, n - 2), 5).astype(int):
                cap.set(1, int(i)); ok, f = cap.read()
                if ok: fr.append(cv2.resize(f, (216, 384)))
            if fr:
                tile = np.hstack(fr); v = (p.get("gate") or {}).get("verdict", "-")
                cv2.putText(tile, f"{p['ref']} {p['kind']} {p['title'][:28]} - {v}", (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA); rows.append(tile)
        if rows: cv2.imwrite(os.path.join(a.out, "contact.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
    except Exception as e:
        print("contact sheet skipped:", e)
    for p in plan: print(json.dumps({k: p.get(k) for k in ("ref", "kind", "title", "job", "file", "cost_usd", "cost_usd_est", "gate", "error")}, default=str)[:400], flush=True)


if __name__ == "__main__":
    main()
