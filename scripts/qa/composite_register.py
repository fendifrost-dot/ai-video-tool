#!/usr/bin/env python3
"""
COMPOSITE REGISTER — put a composite made by the harness into AVT as a CANDIDATE, and nothing more.

    python3 scripts/qa/composite_register.py --record run/record.json --video run/composite.mp4 \
        --project <uuid> --user <uuid> --parent <take asset uuid> [--extra run/diagnostic.mp4] --confirm

What it does, and deliberately all it does:
  * uploads the file under `<user>/<project>/composites/`
  * inserts ONE `project_assets` row: asset_type `edited_clip`, `parent_asset_id` = the take it was cut from,
    `approval_status` left at its default, and the harness's whole record on `metadata_json.composite`
  * writes NOTHING else

What it does NOT do, on purpose:
  * no assignment row. The accepted timeline is not touched, and no shot silently starts playing this instead of
    what is on it. A person assigns it in Storyboard if they want it.
  * no update of any existing asset. An approved take or clip is never written to.
  * it is not a production path. It runs from a build box with a key read out of `.env`, by an agent, by hand, and
    `metadata_json.composite.environment` says exactly that on the record it leaves behind.

`--confirm` is required because this writes to the live project.
"""
import argparse, json, mimetypes, os, sys, urllib.error, urllib.request

BASE = os.environ.get("AVT_SUPABASE_URL", "https://qoyxgnkvjukovkrvdaiq.supabase.co")


def anon_key(repo_root: str) -> str:
    key = os.environ.get("AVT_ANON_KEY")
    if key:
        return key
    env = os.path.join(repo_root, ".env")
    for line in open(env):
        if line.startswith("VITE_SUPABASE_PUBLISHABLE_KEY"):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("no anon key: set AVT_ANON_KEY or keep VITE_SUPABASE_PUBLISHABLE_KEY in .env")


def put(url: str, data: bytes, key: str, content_type: str) -> dict:
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}",
                                          "Content-Type": content_type, "x-upsert": "true"})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())


def post_json(url: str, body: dict, key: str) -> list:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json", "Prefer": "return=representation"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--record", required=True, help="record.json from composite_take.py")
    ap.add_argument("--video", required=True)
    ap.add_argument("--extra", default=None, help="a second file to upload beside it (the diagnostic render)")
    ap.add_argument("--project", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--parent", required=True, help="the project_assets id of the TAKE this was cut from")
    ap.add_argument("--name", default=None)
    ap.add_argument("--verification", default=None, help="a JSON file of the checks run on the output")
    ap.add_argument("--confirm", action="store_true")
    a = ap.parse_args()
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    key = anon_key(root)
    record = json.load(open(a.record))
    checks = json.load(open(a.verification)) if a.verification else None
    name = a.name or os.path.basename(a.video)
    path = f"{a.user}/{a.project}/composites/{name}"

    if not a.confirm:
        print(f"would upload {a.video} -> project-clips/{path}")
        print(f"would insert one project_assets row (edited_clip, parent {a.parent}), no assignment")
        raise SystemExit("not confirmed: pass --confirm to write to the live project")

    mime = mimetypes.guess_type(name)[0] or "video/mp4"
    put(f"{BASE}/storage/v1/object/project-clips/{path}", open(a.video, "rb").read(), key, mime)
    print(f"uploaded project-clips/{path}")
    extra_path = None
    if a.extra:
        extra_path = f"{a.user}/{a.project}/composites/{os.path.basename(a.extra)}"
        put(f"{BASE}/storage/v1/object/project-clips/{extra_path}", open(a.extra, "rb").read(), key,
            mimetypes.guess_type(a.extra)[0] or "video/mp4")
        print(f"uploaded project-clips/{extra_path}")

    meta = {
        "composite": {
            **record,
            "diagnosticRender": extra_path,
            "verification": checks,
            "candidate": "advisory: assigned to no shot, overwrites nothing, changes no timeline",
        }
    }
    row = post_json(f"{BASE}/rest/v1/project_assets", {
        "project_id": a.project, "user_id": a.user, "asset_type": "edited_clip",
        "file_url": path, "parent_asset_id": a.parent,
        "notes": f"composite candidate · {record['source']['file']} {record['source']['range'][0]}–{record['source']['range'][1]} s · made by scripts/qa/composite_take.py on a build box, not by AVT",
        "metadata_json": meta,
    }, key)
    print(f"inserted project_assets {row[0]['id']} (version {row[0]['version_number']}, {row[0]['approval_status']}, no assignment)")


if __name__ == "__main__":
    main()
