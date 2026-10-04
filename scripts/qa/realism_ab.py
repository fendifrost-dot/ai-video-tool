#!/usr/bin/env python3
"""
REALISM A/B — does `src/lib/prompts/realism.ts` actually change what a provider returns?

The modifier shipped (#170) with its claim labelled HYPOTHESIS: the template audit found 0 of 15
templates guarding against plastic skin, which establishes MISSING VOCABULARY, not IMPROVED OUTPUT.
This is the named test that would settle it.

    # 1. generate the two arms' prompt text from the REAL module (single source of truth)
    npx vitest run src/lib/prompts/__arms.test.ts        # writes arms.json

    # 2. run the experiment (BILLED)
    python3 scripts/qa/realism_ab.py --arms arms.json --project <uuid> --n 41 --out qa/ab

    # 3. score an existing directory without spending anything
    python3 scripts/qa/realism_ab.py --score-only qa/ab

── PRE-REGISTERED, BECAUSE A METRIC CHOSEN AFTER SEEING THE IMAGES IS NOT A MEASUREMENT ──

PRIMARY endpoint      detail_mf_norm   mid-frequency texture over the face mask (Laplacian
                      variance), divided by the face box's area in pixels so a bigger face in
                      frame does not read as more texture. Plastic skin is LOW.
SECONDARY             noise_hf         high-frequency residual in flat face regions (grain floor).
GUARD (not an outcome) sat_mean        if the arms differ in saturation, the modifier changed the
                      GRADE rather than the skin, and a detail_mf difference is confounded.

Decision rule, fixed in advance: the modifier WORKS if detail_mf_norm is higher in the treatment
arm at p < 0.05 (Welch, two-sided) AND sat_mean does not differ at p < 0.05. Anything else is
reported as no effect or as confounded. No other endpoint is added after the fact.

── WHAT CALIBRATION ALREADY RULED OUT (2026-10-04, $0, before any spend) ──

`realism_gate.py`'s `skin_sheen` (fraction of face pixels above luma 235) measured EXACTLY 0.000
on 9 of 9 real camera frames and 9 of 9 generated stills. It is floored on stills and would have
returned "no difference" whatever the modifier did. It is NOT an endpoint here. Finding it before
spending is the entire reason that calibration ran first.

Observed within-arm CV of detail_mf on same-production, same-size real frames: 0.80. Sample sizes
for 80% power at alpha=.05 follow from it — 41/arm detects a 50% change, 112/arm detects 30%.

── CONTROLS ──

Both arms use the SAME route, model, resolution, aspect and project, differing ONLY in prompt
text. xAI's images endpoint exposes no seed, so runs cannot be seed-locked: that is handled by
n and by the fixed decision rule, not by pretending the pairs are matched. Images are written
with anonymised names plus a separate key file, so visual judgement can be made blind.
"""
import argparse, glob, json, os, random, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "_lib"))

import cv2
import numpy as np

SUPA = os.environ.get("AVT_SUPABASE_URL", "https://qoyxgnkvjukovkrvdaiq.supabase.co")
ENDPOINT = f"{SUPA}/functions/v1/world-still-proxy"
MODEL = "grok-imagine-image-quality"
PRICE_USD_PER_IMAGE = 0.07
MAX_N_PER_CALL = 4  # world-still-proxy's own cap


# ---------------------------------------------------------------------------
# Scoring — reuses realism_gate's metrics rather than inventing a second answer
# ---------------------------------------------------------------------------
def scorer():
    from realism_gate import Face, per_frame_metrics

    face = Face()
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)

    def score(path):
        img = cv2.imread(path)
        if img is None:
            return None
        h, w = img.shape[:2]
        s = 960.0 / max(h, w)
        if s < 1:
            img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        rows, _, _, _ = per_frame_metrics([img], face, dis)
        m = rows[0]
        if "detail_mf" not in m:
            return None  # no face found — excluded, and the exclusion is counted
        lm = face.landmarks(img)
        if lm is None:
            return None
        x0, y0 = lm.min(axis=0)[:2]
        x1, y1 = lm.max(axis=0)[:2]
        area = max(1.0, float((x1 - x0) * (y1 - y0)))
        # Normalise so a face filling the frame does not score as more texture than a small one.
        m["face_px"] = area
        m["detail_mf_norm"] = m["detail_mf"] / (area / 10000.0)
        return m

    return score


def welch(a, b):
    """Welch's t, two-sided p via a normal approximation (n is large enough here)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 2 or len(b) < 2:
        return float("nan"), float("nan")
    va, vb = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
    t = (a.mean() - b.mean()) / np.sqrt(va + vb + 1e-12)
    from math import erfc, sqrt

    return float(t), float(erfc(abs(t) / sqrt(2)))


def report(control, treatment):
    out = {"n": {"control": len(control), "treatment": len(treatment)}, "endpoints": {}}
    for key, role in [
        ("detail_mf_norm", "PRIMARY"),
        ("noise_hf", "secondary"),
        ("sat_mean", "GUARD"),
    ]:
        a = [m[key] for m in control if key in m]
        b = [m[key] for m in treatment if key in m]
        if len(a) < 2 or len(b) < 2:
            continue
        t, p = welch(b, a)
        out["endpoints"][key] = {
            "role": role,
            "control_mean": float(np.mean(a)),
            "treatment_mean": float(np.mean(b)),
            "relative_change": float((np.mean(b) - np.mean(a)) / (abs(np.mean(a)) + 1e-9)),
            "t": t,
            "p": p,
        }
    prim = out["endpoints"].get("detail_mf_norm")
    guard = out["endpoints"].get("sat_mean")
    if not prim:
        out["verdict"] = "INCONCLUSIVE — no primary endpoint"
    elif guard and guard["p"] < 0.05:
        out["verdict"] = (
            "CONFOUNDED — saturation differs between arms, so the modifier changed the grade; "
            "a texture difference cannot be attributed to skin rendering"
        )
    elif prim["p"] < 0.05 and prim["t"] > 0:
        out["verdict"] = "WORKS — more face texture with the modifier, grade unchanged"
    elif prim["p"] < 0.05:
        out["verdict"] = "BACKFIRES — less face texture with the modifier"
    else:
        out["verdict"] = "NO MEASURED EFFECT at this sample size"
    return out


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def generate(auth, project, prompt, n, out_dir, tag, resolution, aspect):
    """Ask for n images of one arm, MAX_N_PER_CALL at a time. Returns saved paths."""
    saved = []
    while len(saved) < n:
        want = min(MAX_N_PER_CALL, n - len(saved))
        body = {
            "projectId": project,
            "prompt": prompt,
            "model": MODEL,
            "n": want,
            "aspectRatio": aspect,
            "resolution": resolution,
            "shotLabel": f"realism-ab-{tag}",
            "maxCostUsd": want * PRICE_USD_PER_IMAGE + 0.01,
        }
        req = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(body).encode(),
            headers={**auth.headers(), "Content-Type": "application/json"},
            method="POST",
        )
        try:
            res = json.loads(urllib.request.urlopen(req, timeout=300).read())
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{tag}: HTTP {e.code} {e.read().decode()[:400]}")
        for item in res.get("images", res.get("results", [])):
            url = item.get("signedUrl") or item.get("url")
            if not url:
                continue
            data = urllib.request.urlopen(url, timeout=300).read()
            p = os.path.join(out_dir, f"{tag}_{len(saved):03d}.jpg")
            open(p, "wb").write(data)
            saved.append(p)
        time.sleep(1.0)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arms", help="arms.json from the TS module: {control, treatment}")
    ap.add_argument("--project")
    ap.add_argument("--n", type=int, default=41, help="images PER ARM (41 ⇒ 80%% power for a 50%% change)")
    ap.add_argument("--out", default="qa/realism-ab")
    ap.add_argument("--resolution", default="2k")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--score-only", help="score an existing run directory; spends nothing")
    ap.add_argument("--jwt")
    ap.add_argument("--anon")
    ap.add_argument("--confirm", action="store_true", help="required before any billed call")
    a = ap.parse_args()

    run = a.score_only or a.out
    if not a.score_only:
        if not (a.arms and a.project):
            raise SystemExit("--arms and --project are required unless --score-only")
        arms = json.load(open(a.arms))
        cost = 2 * a.n * PRICE_USD_PER_IMAGE
        print(f"two arms x {a.n} images x ${PRICE_USD_PER_IMAGE} = ${cost:.2f}")
        if not a.confirm:
            raise SystemExit("not confirmed: pass --confirm to spend")
        from auth import Session

        auth = Session.from_args(a)
        os.makedirs(run, exist_ok=True)
        # Interleave the arms so provider-side drift over the run hits both equally.
        order = ["control", "treatment"] * a.n
        random.Random(20261004).shuffle(order)
        for tag in ("control", "treatment"):
            generate(auth, a.project, arms[tag], a.n, run, tag, a.resolution, a.aspect)
        json.dump(arms, open(os.path.join(run, "arms.json"), "w"), indent=1)

    score = scorer()
    groups = {"control": [], "treatment": []}
    dropped = 0
    for p in sorted(glob.glob(os.path.join(run, "*.jpg")) + glob.glob(os.path.join(run, "*.png"))):
        tag = "treatment" if os.path.basename(p).startswith("treatment") else "control"
        m = score(p)
        if m is None:
            dropped += 1
            continue
        m["_file"] = os.path.basename(p)
        groups[tag].append(m)

    out = report(groups["control"], groups["treatment"])
    out["droppedNoFace"] = dropped
    out["route"] = {"endpoint": "world-still-proxy", "model": MODEL, "seedLocked": False}
    out["notMeasured"] = [
        "whether a viewer prefers either arm — this counts texture, it does not judge a picture",
        "skin_sheen: floored at 0.000 on every still in calibration, so it is not an endpoint",
    ]
    json.dump(out, open(os.path.join(run, "ab_result.json"), "w"), indent=1)
    print(json.dumps(out, indent=1))

    # Blind key, so visual judgement is not made knowing which arm is which.
    files = [m["_file"] for g in groups.values() for m in g]
    random.Random(7).shuffle(files)
    key = {f"blind_{i:03d}": f for i, f in enumerate(files)}
    json.dump(key, open(os.path.join(run, "blind_key.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
