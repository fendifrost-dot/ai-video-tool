#!/usr/bin/env python3
"""
RUN WORLD BATCH — shot list → stills → motion → gate (realism + look) → manifest, resumable.

  python3 scripts/broll/run_world_batch.py --shots shots.json --out worlds_run/ --project <uuid> \\
      [--look-preset film_bar_v1] [--look-bank qa/look_bank.json] [--ref-stats qa/real_stats.json] [--judge] [--max-usd 12] [--resume] [--dry-run]

shots.json — a list of shots; every creative choice is data here, nothing in the code knows a song:
  {"id": "H1_bear", "kind": "world" | "plate", "aspect": "9:16" | "16:9" | "4:3", "seconds": 5,
   "prompt": "the scene, one subject, in the register of the reference reels",
   "motion": "what moves and how the camera moves (used by image-to-video)",
   "route": "still_runway" | "still_runway45" | "still_kling" | "still_dop" | "runway_t2v" | "kling_t2v",
   "stills": 2, "still_path": "<existing project-references path, to reuse a still instead of generating>"}

Routes (all through AVT edge functions; keys live in Control Center):
  still_*     xAI image (world-still-proxy, 2k, n = stills) → pick the still nearest the look bank → image-to-video
              on Runway gen4_turbo (5 ¢/s), Runway gen4.5 (15 ¢/s), Kling 2.5 turbo pro via the Higgsfield catalogue
              (≈ 7 ¢/s) or Higgsfield DoP (camera-move model, ≈ $0.42 per 5 s turbo)
  runway_t2v  Runway gen4.5 text-to-video (15 ¢/s), ratio from aspect
  kling_t2v   Kling 2.5 turbo pro text-to-video (≈ 7 ¢/s; renders 16:9; queue has run to hours)
The look preset's preamble leads every prompt and its shot suffix closes it (config/look_presets.json).
Each shot's clip is persisted to project-clips/<user>/<project>/worlds/<run>/<id>.mp4 and gated by
scripts/qa/realism_gate.py with the look axis; the manifest records cost estimates, verdicts and distances.
"""
import argparse, json, os, subprocess, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, "scripts", "qa"))
from run_broll_batch import Api, SUPA, load_look  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
PROXY = f"{SUPA}/functions/v1/proxy-provider-call"
RUNWAY_RATE = {"gen4_turbo": 0.05, "gen4.5": 0.15}; KLING_RATE = 0.07; STILL_RATE = 0.07


def wrap(prompt, look, motion=None, max_chars=1000, preamble=True):
    """Preamble + scene (+ motion) + suffix. Providers cap the prompt (Runway: 1000 chars): the preamble is dropped
    first, then the suffix, never the scene. For image-to-video the still already carries the look, so the caller
    passes preamble=False and the prompt is the motion sentence plus the suffix."""
    pre = (look or {}).get("preamble", "").strip() if preamble else ""; suf = (look or {}).get("shot_suffix", "").strip()
    core = prompt.strip() + (f" {motion.strip()}" if motion else "")
    for parts in ((pre, core, suf), (core, suf), (core,)):
        out = " ".join(x for x in parts if x)
        if len(out) <= max_chars: return out
    return core[:max_chars]


def still(api, project, prompt, aspect, n, label, dry):
    body = {"projectId": project, "prompt": prompt, "n": n, "aspectRatio": aspect, "resolution": "2k", "shotLabel": label, "promptVersion": "world_bar_v1", "dryRun": dry}
    return api.post(f"{SUPA}/functions/v1/world-still-proxy", body, timeout=170)


def motion_submit(api, user, project, shot, prompt, still_url=None):
    route = shot["route"]; sec = int(shot.get("seconds", 5)); aspect = shot.get("aspect", "9:16")
    audit = {"avt_user_id": user, "avt_project_id": project}
    if route == "still_dop":
        b = {"promptText": prompt, "mode": "image_to_video", "referenceImageUrl": still_url, "modelVariant": shot.get("model", "dop-turbo"), **audit}
        r = api.post(PROXY, {"endpoint": "video-providers-higgsfield-generate", "method": "POST", "body": b}, timeout=170); r["_provider"] = "higgsfield"; r["_rate"] = 0.083
        return r
    if route in ("still_runway", "still_runway45", "runway_t2v"):
        model = "gen4_turbo" if route == "still_runway" else "gen4.5"
        b = {"promptText": prompt, "mode": "image_to_video" if still_url else "text_to_video", "modelVariant": model, "duration": 10 if sec > 5 else 5, "aspectRatio": aspect, **audit}
        if still_url: b["referenceImageUrl"] = still_url
        r = api.post(PROXY, {"endpoint": "video-providers-runway-generate", "method": "POST", "body": b}, timeout=170); r["_provider"] = "runway"; r["_rate"] = RUNWAY_RATE[model]
    else:
        model = "kling-2.5-turbo-pro-i2v" if still_url else "kling-2.5-turbo-pro-t2v"
        b = {"promptText": prompt, "mode": "image_to_video" if still_url else "text_to_video", "modelVariant": model, "duration": 10 if sec > 5 else 5, **audit}
        if still_url: b["referenceImageUrl"] = still_url
        r = api.post(PROXY, {"endpoint": "video-providers-higgsfield-model", "method": "POST", "body": b}, timeout=170); r["_provider"] = "higgsfield"; r["_rate"] = KLING_RATE
    return r


def status(api, provider, job):
    return api.post(PROXY, {"endpoint": "video-providers-job-status", "method": "GET", "query": {"provider": provider, "id": job}}, timeout=60)


def fetch(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA}); data = urllib.request.urlopen(req, timeout=300).read(); open(path, "wb").write(data); return len(data)


def look_of(path, bank):
    from look_fingerprint import score
    return score(path, bank)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", required=True); ap.add_argument("--out", required=True); ap.add_argument("--project", required=True); ap.add_argument("--user", required=True)
    ap.add_argument("--jwt", default="/tmp/jwt.txt"); ap.add_argument("--anon", default="/tmp/anon.txt"); ap.add_argument("--look-preset", default=None); ap.add_argument("--look-bank", default=None)
    ap.add_argument("--ref-stats", default=None); ap.add_argument("--judge", action="store_true"); ap.add_argument("--max-usd", type=float, default=12.0); ap.add_argument("--resume", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--poll-minutes", type=float, default=90); ap.add_argument("--run", default=None, help="run name (defaults to the out folder's basename)")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); run = a.run or os.path.basename(os.path.normpath(a.out))
    api = Api(open(a.jwt).read(), open(a.anon).read()); look = load_look(a.look_preset); bank = json.load(open(a.look_bank)) if a.look_bank else None
    shots = json.load(open(a.shots)); mpath = os.path.join(a.out, "manifest.json")
    man = json.load(open(mpath)) if a.resume and os.path.exists(mpath) else {"run": run, "look_preset": a.look_preset, "shots": {}}
    est = 0.0
    for s in shots:
        sec = 10 if int(s.get("seconds", 5)) > 5 else 5; r = s["route"]
        est += (STILL_RATE * int(s.get("stills", 2)) if r.startswith("still") and not s.get("still_path") else 0) + sec * (RUNWAY_RATE["gen4_turbo"] if r == "still_runway" else RUNWAY_RATE["gen4.5"] if r in ("runway_t2v", "still_runway45") else 0.083 if r == "still_dop" else KLING_RATE)
    print(f"estimate ${est:.2f} for {len(shots)} shots (gate judge extra ≈ ${0.08 * len(shots):.2f})")
    if est > a.max_usd: raise SystemExit(f"estimate exceeds --max-usd {a.max_usd}")
    if a.dry_run: return
    # 1. stills + motion submits
    for s in shots:
        st = man["shots"].setdefault(s["id"], {"shot": s})
        if st.get("job"): continue
        prompt = wrap(s["prompt"], look); still_url = None
        if s["route"].startswith("still"):
            if s.get("still_path") and not st.get("still"): st["still"] = {"candidates": [], "picked": s["still_path"], "cost_usd": 0.0}
            if not st.get("still"):
                r = still(api, a.project, prompt, s.get("aspect", "9:16"), int(s.get("stills", 2)), f"{run}_{s['id']}", False)
                if not r.get("ok"): st["still_error"] = r; print(s["id"], "still failed", json.dumps(r)[:300]); json.dump(man, open(mpath, "w"), indent=1); continue
                cands = []
                for i, im in enumerate(r["stills"]):
                    p = os.path.join(a.out, f"{s['id']}_still{i + 1}.png"); fetch(im["previewUrl"], p); d = look_of(p, bank)["look_distance"] if bank else 0.0; cands.append({"path": im["path"], "local": p, "look_distance": d})
                best = min(cands, key=lambda c: c["look_distance"]); st["still"] = {"candidates": cands, "picked": best["path"], "cost_usd": r.get("actualCostUsd")}
                print(s["id"], "stills", [round(c["look_distance"], 2) for c in cands], "→", os.path.basename(best["local"]))
            still_url = api.sign("project-references", st["still"]["picked"], ttl=86400)
        mprompt = wrap(s.get("motion") or s["prompt"], look, preamble=False) if still_url else prompt
        r = motion_submit(api, a.user, a.project, s, mprompt, still_url)
        if not r.get("ok"): st["submit_error"] = r; print(s["id"], "submit failed", json.dumps(r)[:400]); json.dump(man, open(mpath, "w"), indent=1); continue
        st["job"] = {"provider": r["_provider"], "id": r["providerJobId"], "estimate_usd": round((r.get("costEstimateCents") or 0) / 100, 3), "prompt": mprompt, "submitted": time.time()}
        print(s["id"], "submitted", r["_provider"], r["providerJobId"][:8], f"~${st['job']['estimate_usd']}"); json.dump(man, open(mpath, "w"), indent=1)
    # 2. poll
    t0 = time.time()
    while time.time() - t0 < a.poll_minutes * 60:
        pending = [k for k, st in man["shots"].items() if st.get("job") and not st.get("file") and not st.get("failed")]
        if not pending: break
        api = Api(open(a.jwt).read(), open(a.anon).read())   # the JWT file may be refreshed while a long poll runs
        for k in pending:
            st = man["shots"][k]; r = status(api, st["job"]["provider"], st["job"]["id"]); s_ = r.get("status")
            if r.get("resultUrl"):
                p = os.path.join(a.out, f"{k}.mp4"); n = fetch(r["resultUrl"], p); st["file"] = p; st["bytes"] = n
                sp = f"{a.user}/{a.project}/worlds/{run}/{k}.mp4"; api.upload("project-clips", sp, open(p, "rb").read(), "video/mp4"); st["storage_path"] = sp
                print(k, "done", n // 1000, "KB")
            elif s_ in ("failed", "canceled", "nsfw", "error"): st["failed"] = r; print(k, "FAILED", json.dumps(r)[:300])
        json.dump(man, open(mpath, "w"), indent=1)
        if [k for k, st in man["shots"].items() if st.get("job") and not st.get("file") and not st.get("failed")]: time.sleep(30)
    # 3. gate
    done = [k for k, st in man["shots"].items() if st.get("file")]
    if done and a.ref_stats:
        cmd = [sys.executable, os.path.join(ROOT, "scripts", "qa", "realism_gate.py"), "--clip", *[man["shots"][k]["file"] for k in done], "--ref-stats", a.ref_stats, "--out", os.path.join(a.out, "gate.json"), "--no-face"]
        if a.judge: cmd += ["--judge", "--jwt", a.jwt, "--anon", a.anon, "--project-id", a.project]
        if a.look_bank: cmd += ["--look-bank", a.look_bank]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(os.path.join(a.out, "gate.json")):
            for rep in json.load(open(os.path.join(a.out, "gate.json")))["reports"]:
                k = os.path.splitext(os.path.basename(rep["clip"]))[0]; rv = (rep.get("tier2") or {}).get("review") or {}
                man["shots"][k]["gate"] = {"verdict": rep["verdict"], "tier1": rep["tier1"]["verdict"], "judge": rv.get("ai_likelihood"), "judge_summary": rv.get("summary"), "look": rep.get("look")}
                print(k, rep["verdict"], "judge", rv.get("ai_likelihood"), "look", (rep.get("look") or {}).get("verdict"), (rep.get("look") or {}).get("look_distance"))
    json.dump(man, open(mpath, "w"), indent=1)
    # 4. contact sheet
    if done:
        tiles = []
        for k in done:
            t = os.path.join(a.out, f"{k}_strip.jpg"); subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", man["shots"][k]["file"], "-vf", "select='not(mod(n,24))',scale=-2:360,tile=5x1", "-frames:v", "1", "-q:v", "5", t]); tiles.append(t)
        print("strips:", len(tiles))


if __name__ == "__main__":
    main()
