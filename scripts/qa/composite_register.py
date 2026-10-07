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

WITH `--take-offset` it files the composite as what it is — a version of one moment of a synced take:
  * `footage_role: performance`, and on `metadata_json` the bucket, the length, and `derived_from`
    (`asset_id` = the take, `source_window` = the stretch of the take it was cut from, `song_start` = where its first
    frame sits on the song, `method: "composite"`). That is the record the app's own restaging writes, plus the method,
    so the storyboard offers it under "Your takes", never as the base layer of other shots, and names it for what it
    is. `song_start` is the take's own sync applied to the first frame's time, the way the app does it.
  * it still writes no assignment and no sync. The sync row (`performance_syncs`: method `derived`, status
    `confirmed`, offset = `song_start`) and the shot it goes on are the owner's to write; the script prints both.

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
    ap.add_argument("--take-offset", type=float, default=None, help="the take's sync offset in seconds (song time = take time × (1 + drift) + offset). Given, the composite is filed as a derived take of --parent")
    ap.add_argument("--take-drift-ppm", type=float, default=0.0)
    ap.add_argument("--confirm", action="store_true")
    a = ap.parse_args()
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
    key = anon_key(root)
    record = json.load(open(a.record))
    checks = json.load(open(a.verification)) if a.verification else None
    name = a.name or os.path.basename(a.video)
    path = f"{a.user}/{a.project}/composites/{name}"

    derived = None
    if a.take_offset is not None:
        cut = record.get("cut")
        if not cut:
            raise SystemExit("this record has no exact cut (it was made before the harness cut by frame): it cannot be put on the song clock")
        window = [round(cut["firstFrameAt"], 3), round(cut["firstFrameAt"] + cut["seconds"], 3)]
        derived = {
            "asset_id": a.parent,
            "source_window": window,
            "song_start": round(cut["firstFrameAt"] * (1 + a.take_drift_ppm / 1e6) + a.take_offset, 3),
            "method": "composite",
        }

    if not a.confirm:
        print(f"would upload {a.video} -> project-clips/{path}")
        print(f"would insert one project_assets row (edited_clip, parent {a.parent}), no assignment")
        if derived:
            print(f"  as a derived take: {json.dumps(derived)}")
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
        **({"bucket": "project-clips", "mime_type": mime, "original_filename": name, "file_size_bytes": os.path.getsize(a.video),
            "duration_seconds": round(record["cut"]["seconds"], 3), "derived_from": derived} if derived else {}),
        "composite": {
            **record,
            "diagnosticRender": extra_path,
            "verification": checks,
            "candidate": "assigned to no shot by this script, overwrites nothing, changes no timeline",
        }
    }
    row = post_json(f"{BASE}/rest/v1/project_assets", {
        "project_id": a.project, "user_id": a.user, "asset_type": "edited_clip",
        "file_url": path, "parent_asset_id": a.parent,
        **({"footage_role": "performance"} if derived else {}),
        "notes": f"composite candidate · {record['source']['file']} {record['source']['range'][0]}–{record['source']['range'][1]} s · made by scripts/qa/composite_take.py on a build box, not by AVT",
        "metadata_json": meta,
    }, key)
    print(f"inserted project_assets {row[0]['id']} (version {row[0]['version_number']}, {row[0]['approval_status']}, no assignment)")
    if derived:
        print(f"derived take of {a.parent}: take {derived['source_window'][0]}–{derived['source_window'][1]} s, first frame at song {derived['song_start']} s")
        print("it plays in a shot once the owner (a) gives it a sync row and (b) puts it on the shot in Storyboard:")
        print(f"  insert into performance_syncs (user_id, project_id, performance_asset_id, offset_seconds, drift_ppm, method, status, notes) "
              f"values ('{a.user}', '{a.project}', '{row[0]['id']}', {derived['song_start']}, {a.take_drift_ppm}, 'derived', 'confirmed', "
              f"'composited from the take: its first frame sits where the cut began on the song');")


if __name__ == "__main__":
    main()
