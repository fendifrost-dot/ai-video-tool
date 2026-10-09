"""Local stand-in for the app's backend: enough of PostgREST, auth and storage for a browser run on fixtures.

In memory only. It signs nothing and checks nothing: the session it hands out is a made-up token for a made-up
user, good for this process alone. Never point it at, or copy anything into it from, a real project."""
import json, os, re, sys, uuid, mimetypes, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qsl, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
FX = json.load(open(os.path.join(HERE, "fixtures.json")))
T = FX["tables"]
LOG = open(os.path.join(HERE, "backend.log"), "a")
RESERVED = {"select", "order", "limit", "offset", "on_conflict", "columns"}

def now(): return datetime.datetime.utcnow().isoformat() + "Z"

def match(row, col, expr):
    v = row.get(col)
    neg = False
    if expr.startswith("not."): neg, expr = True, expr[4:]
    op, _, arg = expr.partition(".")
    if op == "eq": r = str(v) == arg if v is not None else False
    elif op == "neq": r = str(v) != arg
    elif op == "is": r = (v is None) if arg == "null" else (str(v).lower() == arg)
    elif op == "in": r = str(v) in [a.strip('"') for a in arg.strip("()").split(",")]
    elif op in ("gt", "gte", "lt", "lte"):
        try: a, b = float(v), float(arg)
        except Exception: a, b = str(v), arg
        r = {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    elif op in ("like", "ilike"): r = True
    else: r = True
    return (not r) if neg else r

def select(table, q):
    rows = [r for r in T.get(table, []) if all(match(r, k, v) for k, v in q if k not in RESERVED and k not in ("or", "and"))]
    for k, v in q:
        if k == "order":
            for part in reversed(v.split(",")):
                col, *mods = part.split(".")
                rows.sort(key=lambda r: (r.get(col) is None, r.get(col) if r.get(col) is not None else 0), reverse=("desc" in mods))
    for k, v in q:
        if k == "limit": rows = rows[: int(v)]
    return rows

def keep_treatment_version(old, new):
    """What the database's own trigger does (supabase/migrations/20261003180000_treatment_versions.sql): when a
    project's treatment text or its notes / mood / visual direction change, the row that is being replaced is kept."""
    obj = lambda v: v if isinstance(v, dict) else {}
    st = lambda v: v if isinstance(v, str) else ""
    def text_of(j):
        t = obj(j.get("treatment"))
        if isinstance(t.get("text"), str): return t["text"]
        return "\n\n".join(x for x in [st(j.get("concept")).strip(), st(j.get("narrative")).strip()] if x) or st(j.get("text")).strip()
    oj, nj = obj(old.get("treatment_json")), obj(new.get("treatment_json")); ot, nt = obj(oj.get("treatment")), obj(nj.get("treatment"))
    old_text, new_text = text_of(oj), text_of(nj)
    old_dn, new_dn = st(ot.get("notes")).strip(), st(nt.get("notes")).strip(); old_notes = st(old.get("notes")).strip()
    text_changed = old_text != new_text
    context_changed = old_notes != st(new.get("notes")).strip() or old_dn != new_dn or st(old.get("mood")) != st(new.get("mood")) or st(old.get("visual_style")) != st(new.get("visual_style"))
    if not (text_changed or context_changed): return
    if not (old_text or old_notes or old_dn or st(old.get("mood")) or st(old.get("visual_style"))): return
    labelled = st(nt.get("change")) if st(nt.get("change")) and st(nt.get("change_at")) != st(ot.get("change_at")) else None
    T.setdefault("treatment_versions", []).append({
        # on a video variation (20261007120000) the kept row carries the variation and its project
        "id": str(uuid.uuid4()), "project_id": old.get("project_id") or old.get("id"), "variation_id": old.get("id") if "project_id" in old else None, "user_id": old.get("user_id"), "created_at": now(),
        "replaced_by": "context" if not text_changed else (labelled or ("delete" if new_text == "" else "edit")),
        "treatment_text": old_text, "treatment_mode": st(ot.get("mode")) or None, "treatment_model": st(ot.get("model")) or st(oj.get("model")) or None,
        "treatment_updated_at": st(ot.get("updated_at")) or st(oj.get("generated_at")) or None,
        "notes": (old_notes if (old_dn == "" or old_dn == old_notes) else "\n\n".join(x for x in [old_notes, old_dn] if x)) or None,
        "mood": old.get("mood"), "visual_style": old.get("visual_style"), "treatment_json": {k: v for k, v in oj.items() if k != "astra_review"}})

def hear(body):
    """The stand-in transcriber. The test song is a rising tone (200 Hz + 10 Hz per second), so the window says
    where it was cut from; what is "heard" is the fixture's lyric lines that fall inside it, word by word."""
    import base64, struct
    wav = base64.b64decode(body.get("audioBase64") or "")
    rate = struct.unpack_from("<I", wav, 24)[0]
    n = min(rate, (len(wav) - 44) // 2)
    pcm = struct.unpack_from(f"<{n}h", wav, 44)
    crossings = sum(1 for i in range(1, n) if (pcm[i - 1] < 0) != (pcm[i] < 0))
    seconds = n / rate
    cut = round(((crossings / (2 * seconds)) - 200 - 5 * seconds) / 10)   # mean frequency over the stretch = 200 + 10*(cut + seconds/2)
    length = (len(wav) - 44) / 2 / rate
    words = []
    for start, end, text in FX.get("sung", []):
        parts = text.split()
        step = (end - start) / len(parts)
        for i, w in enumerate(parts):
            a, b = start + i * step, start + (i + 1) * step
            if a >= cut and b <= cut + length: words.append({"w": w, "start": round(a - cut, 3), "end": round(b - cut, 3), "p": 0.9})
    LOG.write(f"  heard window at {cut} s ({length:.1f} s): {len(words)} words\n"); LOG.flush()
    return {"ok": True, "provider": "local", "model": "stand-in", "words": words, "seconds": length, "estimatedCostUsd": 0, "triedBefore": []}

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers") or "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        self.send_header("Access-Control-Allow-Credentials", "true")
    def out(self, code, body=None, headers=None):
        data = b"" if body is None else json.dumps(body).encode()
        self.send_response(code); self.cors()
        self.send_header("Content-Type", "application/json")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.send_header("Content-Length", str(len(data))); self.end_headers()
        if self.command != "HEAD": self.wfile.write(data)
    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try: return json.loads(raw) if raw else None
        except Exception: return None
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.send_header("Content-Length", "0"); self.end_headers()
    def do_HEAD(self): self.route()
    def do_GET(self): self.route()
    def do_POST(self): self.route()
    def do_PATCH(self): self.route()
    def do_PUT(self): self.route()
    def do_DELETE(self): self.route()

    def media(self, name):
        path = os.path.join(HERE, "media", os.path.basename(name))
        if not os.path.exists(path): return self.out(404, {"error": "no such file"})
        size = os.path.getsize(path); start, end = 0, size - 1; code = 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1): start = int(m.group(1))
                if m.group(2): end = min(size - 1, int(m.group(2)))
                code = 206
        self.send_response(code); self.cors()
        self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes"); self.send_header("Content-Length", str(end - start + 1))
        if code == 206: self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if self.command == "HEAD": return
        with open(path, "rb") as f:
            f.seek(start); left = end - start + 1
            try:
                while left > 0:
                    chunk = f.read(min(65536, left))
                    if not chunk: break
                    self.wfile.write(chunk); left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError): pass

    def route(self):
        u = urlparse(self.path); p = unquote(u.path); q = parse_qsl(u.query, keep_blank_values=True)
        body = self.body() if self.command in ("POST", "PATCH", "PUT", "DELETE") else None
        LOG.write(f"{self.command} {p} {u.query[:160]}\n"); LOG.flush()
        if p.startswith("/auth/v1/user"): return self.out(200, FX["user"])
        if p.startswith("/auth/v1/token"): return self.out(200, FX["session"])
        if p.startswith("/auth/v1/"): return self.out(200, {})
        if p.startswith("/storage/v1/object/sign/"):
            rest = p[len("/storage/v1/object/sign/"):]
            if self.command == "POST":
                bucket = rest.split("/")[0]
                if isinstance(body, dict) and "paths" in body:
                    return self.out(200, [{"path": x, "signedURL": f"/object/sign/{bucket}/{x}?token=local", "error": None} for x in body["paths"]])
                return self.out(200, {"signedURL": f"/object/sign/{rest}?token=local"})
            return self.media(rest)
        if p.startswith("/storage/v1/"): return self.out(200, {})
        if p.startswith("/functions/v1/lyric-align-proxy"): return self.out(200, hear(body or {}))
        # the server's job mover: here it finds nothing to move (generation is not exercised); what matters is that the page ASKS it and does no moving itself
        if p.startswith("/functions/v1/provider-jobs-tick"): return self.out(200, {"ok": True, "scope": "user", "claimed": 0, "reports": []})
        if p.startswith("/functions/v1/"): return self.out(200, {"ok": True, "jobs": [], "results": []})
        if p.startswith("/rest/v1/rpc/duplicate_variation"):
            # what the database's duplicate_variation() does (20261007120000): the direction, the shots (new ids), the
            # entities and the assignments copied under a new variation; files shared; history not copied
            src = next((v for v in T.get("video_variations", []) if v["id"] == (body or {}).get("p_source")), None)
            if not src: return self.out(400, {"message": "variation not found"})
            new_id = str(uuid.uuid4())
            T["video_variations"].append({**src, "id": new_id, "name": (body or {}).get("p_name") or "Copy", "duplicated_from": src["id"], "created_at": now(), "updated_at": now()})
            shot_map = {}
            for s in [s for s in T.get("shots", []) if s.get("variation_id") == src["id"]]:
                shot_map[s["id"]] = str(uuid.uuid4()); T["shots"].append({**s, "id": shot_map[s["id"]], "variation_id": new_id})
            for a in [a for a in T.get("shot_asset_assignments", []) if a.get("shot_id") in shot_map]:
                T["shot_asset_assignments"].append({**a, "id": str(uuid.uuid4()), "shot_id": shot_map[a["shot_id"]], "variation_id": new_id})
            for e in [e for e in T.get("continuity_entities", []) if e.get("variation_id") == src["id"]]:
                T["continuity_entities"].append({**e, "id": str(uuid.uuid4()), "variation_id": new_id})
            return self.out(200, new_id)
        if p.startswith("/rest/v1/rpc/"): return self.out(200, None)
        if p.startswith("/rest/v1/"):
            table = p[len("/rest/v1/"):].strip("/")
            accept = self.headers.get("Accept", ""); prefer = self.headers.get("Prefer", "")
            single = "vnd.pgrst.object" in accept
            if self.command in ("GET", "HEAD"):
                rows = select(table, q)
                hdr = {"Content-Range": f"0-{max(0, len(rows) - 1)}/{len(rows)}"}
                if single:
                    if len(rows) != 1: return self.out(406, {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned", "details": f"{len(rows)} rows", "hint": None})
                    return self.out(200, rows[0], hdr)
                return self.out(200, rows, hdr)
            T.setdefault(table, [])
            if self.command == "POST":
                items = body if isinstance(body, list) else [body or {}]
                conflict = dict(q).get("on_conflict"); outrows = []
                for it in items:
                    hit = None
                    if conflict and "merge-duplicates" in prefer:
                        cols = conflict.split(",")
                        hit = next((r for r in T[table] if all(str(r.get(c)) == str(it.get(c)) for c in cols)), None)
                    if hit: hit.update(it); hit["updated_at"] = now(); outrows.append(hit)
                    else:
                        row = {"id": str(uuid.uuid4()), "created_at": now(), "updated_at": now(), **it}
                        # the database's fill_variation triggers (20261007120000): a row that names no variation
                        # takes its shot's (an assignment) or the project's active one
                        if table in ("shots", "shot_asset_assignments", "continuity_entities", "provider_jobs", "timeline_manifests") and not row.get("variation_id"):
                            if table == "shot_asset_assignments":
                                shot = next((s for s in T.get("shots", []) if s["id"] == row.get("shot_id")), None)
                                row["variation_id"] = shot.get("variation_id") if shot else None
                            else:
                                proj = next((x for x in T.get("video_projects", []) if x["id"] == row.get("project_id")), None)
                                row["variation_id"] = proj.get("active_variation_id") if proj else None
                        T[table].append(row); outrows.append(row)
                if "return=representation" in prefer: return self.out(201, outrows[0] if single else outrows)
                return self.out(201)
            rows = select(table, q)
            if self.command == "PATCH":
                for r in rows:
                    if table == "video_variations": keep_treatment_version(r, {**r, **(body or {})})
                    r.update(body or {}); r["updated_at"] = now()
                if "return=representation" in prefer: return self.out(200, (rows[0] if rows else None) if single else rows)
                return self.out(204)
            if self.command == "DELETE":
                ids = {id(r) for r in rows}; T[table][:] = [r for r in T[table] if id(r) not in ids]
                if "return=representation" in prefer: return self.out(200, rows)
                return self.out(204)
        return self.out(404, {"error": "not handled", "path": p})

if __name__ == "__main__":
    import base64, time
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    exp = int(time.time()) + 86400
    token = f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64({'sub': FX['user']['id'], 'role': 'authenticated', 'aud': 'authenticated', 'exp': exp, 'email': FX['user']['email']})}.c2ln"
    FX["session"] = {"access_token": token, "refresh_token": "local-refresh", "token_type": "bearer", "expires_in": 86400, "expires_at": exp, "user": FX["user"]}
    json.dump(FX["session"], open(os.path.join(HERE, "session.json"), "w"))
    ThreadingHTTPServer(("127.0.0.1", 54399), H).serve_forever()
