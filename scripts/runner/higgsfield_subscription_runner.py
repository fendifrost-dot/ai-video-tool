#!/usr/bin/env python3
"""
SUBSCRIPTION RUNNER — runs AVT jobs that are paid from Higgsfield PLAN CREDITS, through Higgsfield's own CLI.

Why this exists. AVT reaches Higgsfield's developer API through Control Center, and that API spends a dollar
balance. A Higgsfield plan's credits can only be spent by something signed in as the plan's owner: the website, the
hosted MCP, or the CLI (`@higgsfield/cli`, `higgsfield auth login`). So the plan-credit route needs a signed-in
computer. This script is that computer's side of it. THE SERVER DOES NOT DO THIS WORK: while no runner is running, a
job on this route waits, and its row says so.

What it does, per job (a `provider_jobs` row whose settings.billing.route is "subscription"):
    claim → quote (`generate cost`, spends nothing) → refuse if over the cap → write "submit started" on the row →
    `generate create` → write the job id → poll → download → store as a project asset → write the asset on the row.
The server (provider-jobs-tick) then puts the clip on its shot exactly as it does for an API job.

No second charge:
  * a row is claimed with a conditional update — two runners cannot both take it;
  * "submit started" is written BEFORE the CLI is called. A row that has it and no job id is never submitted again
    by anyone; `reconcile` lists those rows beside Higgsfield's own recent jobs so a person can match them;
  * the request is sent as recorded — same model, duration, size, references. An operation config marks unverified
    is refused, never sent as something else.

    python3 scripts/runner/higgsfield_subscription_runner.py check        # spends nothing: CLI, sign-in, plan, params
    python3 scripts/runner/higgsfield_subscription_runner.py quote <job-row-id>
    python3 scripts/runner/higgsfield_subscription_runner.py run --once   # or --loop
    python3 scripts/runner/higgsfield_subscription_runner.py reconcile

Needs: the Higgsfield CLI signed in (an active paid plan), and an AVT batch credential (scripts/_lib/auth.py enroll).
UNVERIFIED (2026-10-03): the CLI answers nothing without a signed-in paid plan, so the JSON shapes read by
job_id_of / state_of / result_url_of / credits_of below are written from its help text and are held by tests against
the shapes they accept — they must be confirmed by `check` on the plan before config enables anything.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))
CONFIG = os.path.join(HERE, "..", "..", "config", "higgsfield_subscription.json")
RUNNER_ID = os.environ.get("AVT_RUNNER_ID") or f"{os.uname().nodename}:{os.getpid()}"
UA = "avt-subscription-runner/1"


# ---- pure: reading the CLI's answers and deciding what to do ---------------------------------------------------
def _first(d, keys):
    for k in keys:
        if isinstance(d, dict) and d.get(k) not in (None, ""):
            return d[k]
    return None


def job_id_of(answer):
    """The job id in a `generate create --json` answer (an object, or a list of them)."""
    if isinstance(answer, list): answer = answer[0] if answer else {}
    for holder in (answer, (answer or {}).get("job"), (answer or {}).get("data")):
        v = _first(holder, ("id", "job_id", "jobId", "uuid"))
        if v: return str(v)
    return None


def state_of(answer):
    """running | succeeded | failed, from a `generate get --json` answer. A result URL is success whatever the word."""
    if result_url_of(answer): return "succeeded"
    word = str(_first(answer, ("status", "state")) or "").lower()
    if word in ("failed", "error", "canceled", "cancelled", "nsfw", "rejected"): return "failed"
    return "running"


def result_url_of(answer):
    if not isinstance(answer, dict): return None
    for holder in (answer, answer.get("result"), answer.get("results"), answer.get("output")):
        if isinstance(holder, list): holder = holder[0] if holder else None
        if isinstance(holder, dict):
            v = _first(holder, ("url", "result_url", "resultUrl", "video_url", "raw_url"))
            if isinstance(v, dict): v = v.get("url")
            if isinstance(v, str) and v.startswith("http"): return v
    return None


def credits_of(answer):
    v = _first(answer, ("credits", "cost", "credit_cost", "total_credits", "price"))
    if isinstance(v, dict): v = _first(v, ("credits", "amount", "total"))
    try: return float(v)
    except (TypeError, ValueError): return None


def billing_of(row):
    return (((row.get("request_payload_json") or {}).get("settings") or {}).get("billing") or {})


def next_step(row):
    """What this runner may do with a row. The whole no-second-charge rule is here."""
    b = billing_of(row)
    if b.get("route") != "subscription": return "not_ours"
    if row.get("result_asset_id"): return "done"
    if row.get("status") in ("failed", "succeeded") and not row.get("external_job_id"): return "done"
    if row.get("external_job_id"): return "poll"
    if (b.get("runner") or {}).get("submitStartedAt"): return "unreconciled"   # never submitted again
    return "submit"


def operation_for(row, config):
    """The verified CLI operation for a row, or (None, why). Nothing is substituted."""
    settings = (row.get("request_payload_json") or {}).get("settings") or {}
    op = (config.get("operations") or {}).get(settings.get("route"))
    if not op: return None, f"the subscription route has no operation for {settings.get('route')}"
    if not op.get("verified") or not op.get("job_type"): return None, f"{settings.get('route')} is not verified on the plan yet"
    if op.get("avt_model") != (row.get("request_payload_json") or {}).get("modelVariant"):
        return None, f"the job asks for {(row.get('request_payload_json') or {}).get('modelVariant')}, the verified operation is {op.get('avt_model')}"
    return op, None


def cli_args(op, row, files):
    """`generate create|cost` arguments for a row: its own prompt, duration, size and references, nothing else."""
    p = row["request_payload_json"]
    s = p.get("settings") or {}
    args = [op["job_type"]]
    values = {"prompt": p.get("promptText"), "duration": p.get("duration"), "resolution": s.get("resolution") or p.get("resolution"), "aspect_ratio": p.get("aspectRatio"), "generate_audio": False}
    for ours, theirs in (op.get("params") or {}).items():
        v = values.get(ours)
        if theirs is None or v is None: continue
        args += [f"--{theirs}", str(v).lower() if isinstance(v, bool) else str(v)]
    if files.get("video"): args += [op["video_reference_flag"], files["video"]]
    if files.get("image"): args += [op["image_reference_flag"], files["image"]]
    return args


# ---- effects --------------------------------------------------------------------------------------------------
def cli(binary, args, timeout=1800):
    r = subprocess.run([binary, *args, "--json", "--no-color"], capture_output=True, text=True, timeout=timeout)
    out = r.stdout.strip()
    try: return r.returncode, json.loads(out) if out else {}, r.stderr.strip()
    except json.JSONDecodeError: return r.returncode, {"_raw": out[:2000]}, r.stderr.strip()


class Avt:
    def __init__(self, session, supa):
        self.s, self.supa = session, supa

    def _req(self, method, path, body=None, headers=None, raw=False):
        h = self.s.headers(None if raw else "application/json"); h["User-Agent"] = UA; h.update(headers or {})
        data = body if raw else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.supa + path, data=data, headers=h, method=method)
        with urllib.request.urlopen(req, timeout=300) as r:
            b = r.read()
        return b if raw and method == "GET" else (json.loads(b.decode()) if b else None)

    def rows(self):
        q = "select=*&request_payload_json->settings->billing->>route=eq.subscription&finalized_at=is.null&order=created_at"
        return self._req("GET", "/rest/v1/provider_jobs?" + q)

    def row(self, row_id):
        r = self._req("GET", f"/rest/v1/provider_jobs?select=*&id=eq.{row_id}")
        return r[0] if r else None

    def patch_if(self, row, patch, guard):
        """Update a row only while `guard` still holds (PostgREST filters). Returns the row, or None when it no longer does."""
        r = self._req("PATCH", f"/rest/v1/provider_jobs?id=eq.{row['id']}&{guard}", patch, {"Prefer": "return=representation"})
        return r[0] if r else None

    def with_runner(self, row, **fields):
        p = json.loads(json.dumps(row["request_payload_json"]))
        b = p.setdefault("settings", {}).setdefault("billing", {})
        runner = b.setdefault("runner", {})
        for k, v in fields.items():
            if k in ("quoteCredits", "actualCredits"): b[k] = v
            else: runner[k] = v
        return p

    def download(self, bucket, path, dest):
        open(dest, "wb").write(self._req("GET", f"/storage/v1/object/authenticated/{bucket}/{urllib.parse.quote(path)}", raw=True))
        return dest

    def store_clip(self, row, local, external_id):
        path = f"{row['user_id']}/{row['project_id']}/{row['id']}/generated_higgsfield_{external_id[:12]}.mp4"
        self._req("POST", "/functions/v1/upload-asset", open(local, "rb").read(), {"Content-Type": "video/mp4", "X-Bucket": "project-clips", "X-Path": path, "X-Upsert": "true"}, raw=True)
        p = row["request_payload_json"]
        asset = self._req("POST", "/rest/v1/project_assets", {
            "user_id": row["user_id"], "project_id": row["project_id"], "shot_id": None, "prompt_id": row.get("prompt_id"),
            "asset_type": "generated_clip", "file_url": path, "source_tool": "higgsfield", "approval_status": "pending",
            "metadata_json": {"bucket": "project-clips", "file_size_bytes": os.path.getsize(local), "mime_type": "video/mp4", "provider_job_id": row["id"], "external_job_id": external_id, "billing_route": "subscription", "model": p.get("modelVariant")},
        }, {"Prefer": "return=representation"})
        return asset[0]["id"]


def now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def handle(row, avt, config, binary, say):
    step = next_step(row)
    if step in ("not_ours", "done"): return step
    if step == "unreconciled":
        say(f"{row['id']}: a submit was started and no job was recorded — NOT resubmitted; run `reconcile`")
        return step
    op, why = operation_for(row, config)
    if step == "submit":
        if not op:
            avt.patch_if(row, {"status": "failed", "error_text": f"plan-credit route: {why} — nothing was substituted"[:500]}, "external_job_id=is.null")
            say(f"{row['id']}: refused — {why}"); return "refused"
        claimed = avt.patch_if(row, {"request_payload_json": avt.with_runner(row, id=RUNNER_ID, claimedAt=now())},
                               "external_job_id=is.null&status=eq.queued&request_payload_json->settings->billing->runner->>claimedAt=is.null")
        if not claimed: say(f"{row['id']}: another runner has it"); return "taken"
        row = claimed
        tmp = tempfile.mkdtemp(prefix="avt_sub_")
        try:
            s = row["request_payload_json"].get("settings") or {}
            files = {}
            if s.get("sourcePath"): files["video"] = avt.download("project-clips", s["sourcePath"], os.path.join(tmp, "source.mp4"))
            if s.get("stillPath"): files["image"] = avt.download("project-references", s["stillPath"], os.path.join(tmp, "still.png"))
            args = cli_args(op, row, files)
            code, quote, err = cli(binary, ["generate", "cost", *args])
            credits = credits_of(quote)
            if code != 0 or credits is None:
                avt.patch_if(row, {"status": "failed", "error_text": f"plan-credit route: no quote ({err or quote})"[:500]}, "external_job_id=is.null"); return "refused"
            if credits > float(config.get("max_credits_per_job", 0)):
                avt.patch_if(row, {"status": "failed", "error_text": f"plan-credit route: quoted {credits:g} credits, above the cap of {config.get('max_credits_per_job')} per job — not sent"}, "external_job_id=is.null"); return "refused"
            # WRITE-AHEAD: from here the row says a submit began. If anything dies before the id is written, nobody resubmits.
            row = avt.patch_if(row, {"request_payload_json": avt.with_runner(row, submitStartedAt=now(), quoteCredits=credits)}, "external_job_id=is.null") or row
            code, made, err = cli(binary, ["generate", "create", *args])
            ext = job_id_of(made)
            if not ext:
                say(f"{row['id']}: the CLI did not return a job id ({err or made}) — left as started, NOT resubmitted"); return "unreconciled"
            avt.patch_if(row, {"external_job_id": ext, "status": "running", "response_payload_json": {"cli": made, "billingRoute": "subscription"}}, "external_job_id=is.null")
            say(f"{row['id']}: submitted on plan credits as {ext} (quoted {credits:g})")
            return "submitted"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    # poll
    ext = row["external_job_id"]
    code, got, err = cli(binary, ["generate", "get", ext])
    state = state_of(got) if code == 0 else "running"
    if state == "running": return "running"
    if state == "failed":
        avt.patch_if(row, {"status": "failed", "error_text": f"Higgsfield (plan credits): {_first(got, ('error', 'message', 'status')) or 'failed'}"[:500], "response_payload_json": {"cli": got, "billingRoute": "subscription"}}, f"external_job_id=eq.{ext}")
        return "failed"
    tmp = tempfile.mkdtemp(prefix="avt_sub_")
    try:
        local = os.path.join(tmp, "clip.mp4")
        req = urllib.request.Request(result_url_of(got), headers={"User-Agent": UA})   # their CDN refuses urllib's default UA
        with urllib.request.urlopen(req, timeout=600) as r, open(local, "wb") as f: shutil.copyfileobj(r, f)
        asset_id = avt.store_clip(row, local, ext)
        avt.patch_if(row, {"status": "succeeded", "result_asset_id": asset_id, "finalized_at": None, "progress_claimed_at": None,
                           "request_payload_json": avt.with_runner(row, actualCredits=credits_of(got) or billing_of(row).get("quoteCredits")),
                           "response_payload_json": {"cli": got, "resultUrl": result_url_of(got), "billingRoute": "subscription"}}, "result_asset_id=is.null")
        say(f"{row['id']}: saved as asset {asset_id}; the server will put it on its shot")
        return "saved"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("cmd", choices=["check", "quote", "run", "reconcile"])
    ap.add_argument("row", nargs="?")
    ap.add_argument("--once", action="store_true"); ap.add_argument("--loop", action="store_true")
    ap.add_argument("--interval", type=int, default=20)
    ap.add_argument("--anon"); ap.add_argument("--jwt", default="/tmp/jwt.txt")
    a = ap.parse_args()
    config = json.load(open(CONFIG))
    binary = shutil.which(config["cli"]["binary"])
    say = lambda m: print(f"[{now()}] {m}", flush=True)

    if a.cmd == "check":
        if not binary: raise SystemExit("the Higgsfield CLI is not installed: npm i -g @higgsfield/cli, then `higgsfield auth login`")
        print(subprocess.run([binary, "version"], capture_output=True, text=True).stdout.strip())
        for label, args in (("account", ["account", "status"]), ("video models", ["model", "list", "--video"])):
            code, out, err = cli(binary, args, timeout=60)
            print(f"--- {label} (exit {code})\n{json.dumps(out, indent=1)[:6000]}\n{err}")
        for name, op in config["operations"].items():
            if op.get("job_type"):
                code, out, err = cli(binary, ["model", "get", op["job_type"]], timeout=60)
                print(f"--- params of {name} = {op['job_type']} (exit {code})\n{json.dumps(out, indent=1)[:6000]}\n{err}")
            else:
                print(f"--- {name}: no job_type in config yet — pick it from the model list above. Open: {op.get('_open')}")
        print("nothing was generated and no credit was spent")
        return

    if a.cmd == "run" and not config.get("enabled"): raise SystemExit("the subscription route is switched off (config/higgsfield_subscription.json: enabled=false) — `check` and `quote` still work")
    import auth  # noqa: E402  (scripts/_lib/auth.py)
    avt = Avt(auth.Session.from_args(a), auth.SUPA)
    if a.cmd == "reconcile":
        stuck = [r for r in avt.rows() if next_step(r) == "unreconciled"]
        print(json.dumps([{"row": r["id"], "started": billing_of(r)["runner"].get("submitStartedAt"), "prompt": r["request_payload_json"].get("promptText", "")[:80]} for r in stuck], indent=1))
        if binary and stuck: print(json.dumps(cli(binary, ["generate", "list"], timeout=60)[1], indent=1)[:6000])
        return
    if a.cmd == "quote":
        row = avt.row(a.row) or sys.exit("no such job row")
        op, why = operation_for(row, config)
        if not op: raise SystemExit(why)
        print(json.dumps(cli(binary, ["generate", "cost", *cli_args(op, row, {})])[1], indent=1)); return
    if not binary: raise SystemExit("the Higgsfield CLI is not installed")
    while True:
        for row in avt.rows():
            try: handle(row, avt, config, binary, say)
            except (urllib.error.URLError, subprocess.TimeoutExpired, OSError) as e: say(f"{row['id']}: {e} — left as it is")
        if not a.loop: break
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
