#!/usr/bin/env python3
"""
JOBS — a resource governor and registry for local pipeline jobs (deterministic, $0).

    from jobs import job
    with job("composite", need_gb=2.0, out=a.out):
        ...                          # the work

Why (2026-10-01 stall audit): the sandbox has 8 GB, no swap and no scheduler; two memory-heavy stages started
together (a composite beside the realism gate) and the kernel killed one silently. This module makes every
stage declare what it needs, wait its turn when the box cannot hold it, and leave a record of what is running.

  * Registry: <state>/jobs/<pid>.json — class, need_gb, argv, out path, start time; written on entry, removed on
    exit (crash included, via atexit). `python3 scripts/_lib/jobs.py list` prints them; `… stop <pid>` sends
    SIGTERM to a registered job by id — never `pkill -f <pattern>`, which has matched the operator's own shell.
  * Governor: a job with need_gb waits (polling every 15 s, up to --max-wait) until
        MemAvailable − Σ need_gb of other live registered jobs ≥ need_gb + headroom
    then registers and proceeds. Dead registrations (pid gone) are swept on every check.
  * Classes are only labels for the record; the numbers are the caller's (measured, not guessed).

State dir: $AVT_JOBS_DIR or ~/.cache/avt/jobs. Nothing here knows a project or a shot.
"""
import atexit, json, os, signal, sys, time

STATE = os.environ.get("AVT_JOBS_DIR") or os.path.expanduser("~/.cache/avt/jobs")
HEADROOM_GB = 0.75


def _mem_available_gb():
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemAvailable:"): return int(line.split()[1]) / 1e6
    except OSError: pass
    return 1e9


def _alive(pid):
    try: os.kill(pid, 0); return True
    except OSError: return False


def _registry():
    os.makedirs(STATE, exist_ok=True); live = []
    for f in os.listdir(STATE):
        if not f.endswith(".json"): continue
        p = os.path.join(STATE, f)
        try: r = json.load(open(p))
        except Exception: continue
        if _alive(int(r.get("pid", 0))): live.append(r)
        else:
            try: os.remove(p)
            except OSError: pass
    return live


class job:
    def __init__(self, cls, need_gb=0.5, out=None, max_wait_s=3600, poll_s=15):
        self.cls, self.need, self.out, self.max_wait, self.poll = cls, float(need_gb), out, max_wait_s, poll_s
        self.path = os.path.join(STATE, f"{os.getpid()}.json")

    def __enter__(self):
        t0 = time.time(); waited = False
        while True:
            others = [r for r in _registry() if int(r["pid"]) != os.getpid()]
            reserved = sum(float(r.get("need_gb", 0)) for r in others)
            free = _mem_available_gb() - reserved
            if free >= self.need + HEADROOM_GB: break
            if time.time() - t0 > self.max_wait: raise SystemExit(f"jobs: waited {self.max_wait}s for {self.need:.1f} GB ({len(others)} jobs hold {reserved:.1f} GB, {free:.1f} GB free) — giving up")
            if not waited: print(f"jobs: {self.cls} needs {self.need:.1f} GB, {free:.1f} GB free after {len(others)} running job(s) — waiting", file=sys.stderr); waited = True
            time.sleep(self.poll)
        json.dump({"pid": os.getpid(), "class": self.cls, "need_gb": self.need, "out": self.out, "argv": sys.argv, "started": time.time()}, open(self.path, "w"))
        atexit.register(self._unregister); return self

    def _unregister(self):
        try: os.remove(self.path)
        except OSError: pass

    def __exit__(self, *exc):
        self._unregister(); return False


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        live = _registry()
        print(f"MemAvailable {_mem_available_gb():.2f} GB; {len(live)} registered job(s)")
        for r in live: print(f"  pid {r['pid']:>7}  {r['class']:<10} need {float(r['need_gb']):.1f} GB  {int(time.time() - r['started']):>5}s  {r.get('out') or ''}")
    elif cmd == "stop" and len(sys.argv) > 2:
        pid = int(sys.argv[2]); live = {int(r["pid"]): r for r in _registry()}
        if pid not in live: raise SystemExit(f"pid {pid} is not a registered job")
        os.kill(pid, signal.SIGTERM); print(f"sent SIGTERM to {pid} ({live[pid]['class']})")
    else:
        raise SystemExit("usage: jobs.py list | stop <pid>")


if __name__ == "__main__":
    main()
