#!/usr/bin/env python3
"""
Tests for scripts/_lib/auth.py — the token resolution order.

The thing under test is not "does it return a string". It is that each lane is tried only
when the one before it cannot serve, and that a pinned --jwt wins outright. Get the order
wrong and the symptom is an overnight run that dies at minute 61 — exactly what this module
was written to stop, and exactly the failure that is invisible in review.

    python3 -m pytest scripts/_lib/tests/test_auth.py -q
"""
import json, os, sys, time, types
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import auth as A  # noqa: E402


@pytest.fixture
def paths(tmp_path, monkeypatch):
    monkeypatch.setattr(A, "SESSION_FILE", str(tmp_path / "session.json"))
    monkeypatch.setattr(A, "CRED_FILE", str(tmp_path / "cred"))
    monkeypatch.setattr(A, "ANON_FILE", str(tmp_path / "no-anon"))
    monkeypatch.delenv("AVT_ANON_KEY", raising=False)
    monkeypatch.delenv("AVT_BATCH_SECRET", raising=False)
    return tmp_path


def calls_recorder(monkeypatch, responses):
    """Replace the network with a scripted dict of url-substring -> response."""
    seen = []

    def fake_post(url, body, headers, timeout=60):
        seen.append({"url": url, "body": body, "headers": headers})
        for frag, resp in responses.items():
            if frag in url:
                return resp
        return {"httpError": 404}

    monkeypatch.setattr(A, "_post", fake_post)
    return seen


def write(p, text):
    p.write_text(text)
    return str(p)


def test_cache_serves_and_nothing_is_called(paths, monkeypatch):
    A_cache = {"access_token": "cached-tok", "refresh_token": "r", "expires_at": int(time.time()) + 3600}
    open(A.SESSION_FILE, "w").write(json.dumps(A_cache))
    seen = calls_recorder(monkeypatch, {})
    s = A.Session(anon="anon-key")
    assert s.jwt() == "cached-tok"
    assert s.source() == "cache"
    assert seen == [], "a live cached token must not cost a network round trip"


def test_cache_near_expiry_is_refreshed_before_it_dies(paths, monkeypatch):
    # 100s left: still technically valid, but a poll that starts now may finish after it
    # expires. The whole point of SKEW is that this counts as stale.
    stale = {"access_token": "old", "refresh_token": "r1", "expires_at": int(time.time()) + 100}
    open(A.SESSION_FILE, "w").write(json.dumps(stale))
    seen = calls_recorder(monkeypatch, {"grant_type=refresh_token": {"access_token": "fresh", "refresh_token": "r2", "expires_in": 3600}})
    s = A.Session(anon="anon-key")
    assert s.jwt() == "fresh"
    assert s.source() == "refresh"
    assert len(seen) == 1 and "refresh_token" in seen[0]["url"]
    # and the rotated refresh token is persisted, or the next run starts from scratch
    assert json.load(open(A.SESSION_FILE))["refresh_token"] == "r2"


def test_credential_mints_when_refresh_fails(paths, monkeypatch):
    open(A.SESSION_FILE, "w").write(json.dumps({"access_token": "old", "refresh_token": "dead", "expires_at": 0}))
    write(paths / "cred", "s" * 64)
    seen = calls_recorder(monkeypatch, {
        "grant_type=refresh_token": {"httpError": 400, "error": "invalid_grant"},
        "batch-token-proxy": {"ok": True, "accessToken": "minted", "refreshToken": "r9", "expiresIn": 3600},
    })
    s = A.Session(anon="anon-key")
    assert s.jwt() == "minted"
    assert s.source() == "credential"
    mint = [c for c in seen if "batch-token-proxy" in c["url"]][0]
    assert mint["body"] == {"action": "session"}, "the mint request names no user — the owner is bound server-side"
    assert mint["headers"][A.SECRET_HEADER] == "s" * 64


def test_mint_request_never_names_a_user(paths, monkeypatch):
    write(paths / "cred", "s" * 64)
    seen = calls_recorder(monkeypatch, {"batch-token-proxy": {"ok": True, "accessToken": "t", "expiresIn": 3600}})
    A.Session(anon="anon-key").jwt()
    body = seen[-1]["body"]
    for forbidden in ("email", "user_id", "userId", "owner", "owner_user_id", "sub"):
        assert forbidden not in body


def test_browser_file_is_the_last_resort_not_the_first(paths, monkeypatch):
    jwt_file = write(paths / "jwt.txt", "browser-token")
    write(paths / "cred", "s" * 64)
    seen = calls_recorder(monkeypatch, {"batch-token-proxy": {"ok": True, "accessToken": "minted", "expiresIn": 3600}})
    s = A.Session(anon="anon-key", jwt_file=jwt_file)
    assert s.jwt() == "minted", "a working credential must beat a stale file someone left in /tmp"

    # ...but with no credential and no cached session, the old path still works unchanged,
    # so a machine that has not been enrolled yet runs exactly as it did before.
    os.remove(A.CRED_FILE); os.remove(A.SESSION_FILE)
    s2 = A.Session(anon="anon-key", jwt_file=jwt_file)
    assert s2.jwt() == "browser-token"


def test_revoked_credential_says_so_instead_of_failing_quietly(paths, monkeypatch, capsys):
    jwt_file = write(paths / "jwt.txt", "browser-token")
    write(paths / "cred", "s" * 64)
    calls_recorder(monkeypatch, {"batch-token-proxy": {"httpError": 401, "error": "credential_rejected"}})
    s = A.Session(anon="anon-key", jwt_file=jwt_file)
    assert s.jwt() == "browser-token"
    assert "credential_rejected" in capsys.readouterr().err, (
        "falling back silently is how a revoked credential becomes 'it worked yesterday' weeks later"
    )


def test_no_lane_at_all_fails_with_the_fix_in_the_message(paths, monkeypatch):
    calls_recorder(monkeypatch, {})
    s = A.Session(anon="anon-key", jwt_file=str(paths / "absent.txt"))
    with pytest.raises(SystemExit) as e:
        s.jwt()
    assert "auth.py enroll" in str(e.value)


def test_pinned_jwt_short_circuits_everything(paths, monkeypatch):
    jwt_file = write(paths / "pinned.txt", "pinned-token")
    write(paths / "cred", "s" * 64)
    seen = calls_recorder(monkeypatch, {"batch-token-proxy": {"ok": True, "accessToken": "minted", "expiresIn": 3600}})
    s = A.Session(anon="anon-key", jwt_file=jwt_file, pinned=True)
    assert s.jwt() == "pinned-token"
    assert seen == [], "if an operator names a file, that file is the intent"
    assert s.pinned() is True


def test_from_args_only_pins_when_jwt_was_actually_typed(paths):
    a = types.SimpleNamespace(jwt="/tmp/jwt.txt", anon=None)
    os.environ["AVT_ANON_KEY"] = "anon-key"
    try:
        assert A.Session.from_args(a, argv=["run.py", "--out", "x"]).pinned() is False
        assert A.Session.from_args(a, argv=["run.py", "--jwt", "/tmp/jwt.txt"]).pinned() is True
        assert A.Session.from_args(a, argv=["run.py", "--jwt=/tmp/j"]).pinned() is True
    finally:
        del os.environ["AVT_ANON_KEY"]


def test_headers_are_rebuilt_per_call(paths, monkeypatch):
    """The regression that killed four runs: headers captured once at construction."""
    open(A.SESSION_FILE, "w").write(json.dumps({"access_token": "first", "refresh_token": "r", "expires_at": int(time.time()) + 3600}))
    calls_recorder(monkeypatch, {"grant_type=refresh_token": {"access_token": "second", "refresh_token": "r", "expires_in": 3600}})
    s = A.Session(anon="anon-key")
    assert s.headers()["Authorization"] == "Bearer first"
    # the session ages out mid-run
    s._cached["expires_at"] = int(time.time()) + 10
    assert s.headers()["Authorization"] == "Bearer second"


def test_missing_anon_key_is_a_clear_error(paths, monkeypatch):
    with pytest.raises(SystemExit) as e:
        A.Session()
    assert "anon" in str(e.value).lower()


def test_secret_file_is_written_private(paths):
    p = paths / "secret"
    A._write_private(str(p), "abc")
    assert oct(os.stat(p).st_mode)[-3:] == "600"
    assert p.read_text() == "abc"
