#!/usr/bin/env python3
"""
AUTH — a session that outlives the operator's attention.

    from auth import Session
    auth = Session.from_args(a)          # a has .jwt / .anon from the usual argparse pair
    api = Api(auth)                      # headers built per request, never frozen at construction

Why (2026-10-01 stall audit, root cause B): the batch runners authenticated with a user JWT
hand-copied out of the browser into /tmp/jwt.txt. Supabase access tokens last an hour; four
unattended overnight runs died mid-batch when theirs expired, each losing the work in flight
and needing a human to paste a new token at 3am. The runners were correct — the credential
was simply the wrong KIND of thing to leave a robot holding.

What this does: holds a long-lived, revocable BATCH CREDENTIAL and exchanges it, through the
`batch-token-proxy` edge function, for an ordinary user session whenever the current one is
near expiry. Downstream nothing changes: every proxy still sees a normal user JWT and has no
idea a script is on the other end.

Resolution order for a token, each step used only if the one before it cannot serve:
  1. the cached session, if it has more than SKEW seconds left
  2. refresh_token  → POST /auth/v1/token?grant_type=refresh_token   (cheap, no mint audited)
  3. batch credential → POST /functions/v1/batch-token-proxy {"action":"session"}
  4. the browser file (--jwt / /tmp/jwt.txt) — the old path, kept so a machine with no
     credential enrolled yet still runs exactly as it did before.
A pinned --jwt on the command line short-circuits all of it: if an operator names a file,
that file is the intent, not a thing to second-guess.

Enrolment is a one-off, from a machine where you can paste a browser JWT once:

    python3 scripts/_lib/auth.py enroll --label "studio mac"
    python3 scripts/_lib/auth.py status
    python3 scripts/_lib/auth.py list
    python3 scripts/_lib/auth.py revoke <credential-id>

The secret is printed once, written to ~/.config/avt/batch_credential with mode 0600, and
never recoverable afterwards — the server stores only its sha256. Lose it, enrol again.

Files (override with the env vars in brackets):
  ~/.config/avt/batch_credential   [AVT_BATCH_CREDENTIAL]  the secret, 0600
  ~/.config/avt/anon               [AVT_ANON_KEY is the key itself]  anon key, else --anon file
  ~/.cache/avt/session.json        [AVT_SESSION_FILE]      cached access+refresh token, 0600
"""
import argparse, json, os, sys, threading, time, urllib.error, urllib.request

SUPA = os.environ.get("AVT_SUPABASE_URL", "https://qoyxgnkvjukovkrvdaiq.supabase.co")
CRED_FILE = os.environ.get("AVT_BATCH_CREDENTIAL") or os.path.expanduser("~/.config/avt/batch_credential")
ANON_FILE = os.path.expanduser("~/.config/avt/anon")
SESSION_FILE = os.environ.get("AVT_SESSION_FILE") or os.path.expanduser("~/.cache/avt/session.json")
# Refresh this far before the token actually dies. A 5 s poll that starts valid and finishes
# expired is the exact failure this module exists to stop, so the margin is generous.
SKEW = 300
SECRET_HEADER = "x-batch-secret"


def _post(url, body, headers, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:1000]
        try: return {"httpError": e.code, **json.loads(detail)}
        except Exception: return {"httpError": e.code, "body": detail}


def _read(path):
    try:
        with open(os.path.expanduser(path)) as f: return f.read().strip()
    except OSError:
        return None


def _write_private(path, text):
    path = os.path.expanduser(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f: f.write(text)


class Session:
    """A token source. Thread-safe, because the runners poll several jobs at once."""

    def __init__(self, anon=None, anon_file=None, jwt_file=None, pinned=False, credential=None):
        self._anon = anon or os.environ.get("AVT_ANON_KEY") or _read(anon_file or "") or _read(ANON_FILE)
        if not self._anon:
            raise SystemExit(f"no anon key: pass --anon <file>, set AVT_ANON_KEY, or write {ANON_FILE}")
        self._jwt_file = jwt_file
        self._pinned = pinned
        self._credential = credential or os.environ.get("AVT_BATCH_SECRET") or _read(CRED_FILE)
        self._lock = threading.Lock()
        self._cached = self._load_cache()

    # -- construction from the runners' usual argparse pair -------------------
    @staticmethod
    def from_args(a, argv=None):
        """`--jwt` named on the command line pins that file; otherwise it is only the fallback."""
        argv = sys.argv if argv is None else argv
        pinned = any(x == "--jwt" or x.startswith("--jwt=") for x in argv)
        return Session(anon_file=getattr(a, "anon", None), jwt_file=getattr(a, "jwt", None), pinned=pinned)

    # -- what callers use -----------------------------------------------------
    def anon(self):
        return self._anon

    def pinned(self):
        """True when --jwt named a file explicitly. Child processes are handed that file;
        otherwise they resolve their own session, so a gate launched hours into a run does
        not inherit a token minted at startup."""
        return self._pinned

    def jwt(self):
        if self._pinned:
            tok = _read(self._jwt_file)
            if not tok: raise SystemExit(f"--jwt {self._jwt_file}: unreadable")
            return tok
        with self._lock:
            tok = self._from_cache() or self._from_refresh() or self._from_credential()
        if tok: return tok
        tok = _read(self._jwt_file) if self._jwt_file else None
        if tok: return tok
        raise SystemExit(
            "no usable session: enrol a batch credential with\n"
            "    python3 scripts/_lib/auth.py enroll --label \"<this machine>\"\n"
            f"or put a browser JWT in {self._jwt_file or '/tmp/jwt.txt'}"
        )

    def headers(self, content_type="application/json"):
        h = {"Authorization": "Bearer " + self.jwt(), "apikey": self._anon}
        if content_type: h["Content-Type"] = content_type
        return h

    def source(self):
        """Which lane the last token came from — for a runner to print once at startup."""
        return self._source

    # -- the lanes ------------------------------------------------------------
    _source = "none"

    def _load_cache(self):
        try:
            with open(SESSION_FILE) as f: return json.load(f)
        except (OSError, ValueError):
            return None

    def _store(self, access, refresh, expires_at):
        self._cached = {"access_token": access, "refresh_token": refresh, "expires_at": int(expires_at)}
        try: _write_private(SESSION_FILE, json.dumps(self._cached))
        except OSError: pass          # a read-only cache dir is not a reason to fail a run
        return access

    def _from_cache(self):
        c = self._cached
        if c and c.get("access_token") and int(c.get("expires_at", 0)) - SKEW > time.time():
            self._source = "cache"
            return c["access_token"]
        return None

    def _from_refresh(self):
        c = self._cached
        if not (c and c.get("refresh_token")): return None
        r = _post(f"{SUPA}/auth/v1/token?grant_type=refresh_token",
                  {"refresh_token": c["refresh_token"]}, {"apikey": self._anon})
        if r.get("access_token"):
            self._source = "refresh"
            return self._store(r["access_token"], r.get("refresh_token", c["refresh_token"]),
                               r.get("expires_at") or time.time() + int(r.get("expires_in", 3600)))
        return None

    def _from_credential(self):
        if not self._credential: return None
        r = _post(f"{SUPA}/functions/v1/batch-token-proxy", {"action": "session"},
                  {"apikey": self._anon, SECRET_HEADER: self._credential})
        if r.get("ok") and r.get("accessToken"):
            self._source = "credential"
            return self._store(r["accessToken"], r.get("refreshToken"),
                               r.get("expiresAt") or time.time() + int(r.get("expiresIn", 3600)))
        # Say why. A silent fall-through to the browser file is how a revoked credential
        # turns into "it worked yesterday" three weeks later.
        print(f"[auth] batch credential did not mint a session: {r.get('error') or r}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------- CLI
def _cli_headers(a):
    """The enrol/list/revoke actions need a REAL user JWT — they are what creates the
    machine credential, so they cannot be authenticated by one."""
    anon = os.environ.get("AVT_ANON_KEY") or _read(a.anon) or _read(ANON_FILE)
    jwt = _read(a.jwt)
    if not anon: raise SystemExit(f"no anon key: --anon <file>, AVT_ANON_KEY, or {ANON_FILE}")
    if not jwt: raise SystemExit(f"no browser JWT at {a.jwt} — paste one there for this one-off step")
    return {"Authorization": "Bearer " + jwt, "apikey": anon}


def main():
    ap = argparse.ArgumentParser(description="batch credential / session helper")
    ap.add_argument("action", choices=["enroll", "list", "revoke", "status", "token"])
    ap.add_argument("credential_id", nargs="?", default=None, help="for revoke")
    ap.add_argument("--label", default=None, help="for enroll, e.g. \"studio mac\"")
    ap.add_argument("--expires-in-days", type=int, default=None)
    ap.add_argument("--jwt", default="/tmp/jwt.txt")
    ap.add_argument("--anon", default="/tmp/anon.txt")
    a = ap.parse_args()
    url = f"{SUPA}/functions/v1/batch-token-proxy"

    if a.action == "enroll":
        label = a.label or os.uname().nodename
        body = {"action": "enroll", "label": label}
        if a.expires_in_days: body["expiresInDays"] = a.expires_in_days
        r = _post(url, body, _cli_headers(a))
        if not r.get("ok"): raise SystemExit(f"enroll failed: {r}")
        _write_private(CRED_FILE, r["secret"])
        print(f"enrolled '{label}' as {r['credential']['id']}")
        print(f"secret written to {CRED_FILE} (0600) — it is not recoverable from the server")
        return

    if a.action == "list":
        r = _post(url, {"action": "list"}, _cli_headers(a))
        if not r.get("ok"): raise SystemExit(f"list failed: {r}")
        for c in r["credentials"]:
            state = "revoked" if c["revoked_at"] else "active"
            print(f"{c['id']}  {state:<8} {c['label'][:30]:<30} last used {c['last_used_at'] or 'never'}")
        return

    if a.action == "revoke":
        if not a.credential_id: raise SystemExit("revoke needs a credential id (see: auth.py list)")
        r = _post(url, {"action": "revoke", "credentialId": a.credential_id}, _cli_headers(a))
        if not r.get("ok"): raise SystemExit(f"revoke failed: {r}")
        print(f"revoked {r['credential']['id']} ({r['credential']['label']})")
        return

    s = Session(anon_file=a.anon, jwt_file=a.jwt)
    if a.action == "token":
        print(s.jwt()); return

    # status — say exactly which lane would serve the next call, without spending a mint
    print(f"credential: {'present ' + CRED_FILE if s._credential else 'NONE — run: auth.py enroll'}")
    c = s._cached
    if c: print(f"cached session: expires {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(c['expires_at']))}"
                f" ({int(c['expires_at'] - time.time())}s left)")
    else: print("cached session: none")
    tok = s.jwt()
    print(f"token source: {s.source()}  ({len(tok)} chars)")


if __name__ == "__main__":
    main()
