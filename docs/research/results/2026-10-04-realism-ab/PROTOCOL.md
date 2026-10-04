# Realism modifier A/B — pre-registration and calibration · 4 October 2026

The modifier shipped in #170 labelled **HYPOTHESIS**: the template audit found 0 of 15 templates
guarding against plastic skin, which establishes *missing vocabulary*, not *improved output*. This
is the named test that settles it.

**Spent so far: $0.** The experiment is built, pre-registered and its scoring half is proven to run.
It has **not been executed** — see §5.

---

## 1 · Calibration first, and it changed the design

Before any spend, `realism_gate.py`'s face-region metrics were run on **9 real camera hero frames**
and **9 generated stills** from this project. Two findings came out of it, and both would have
wrecked the experiment if it had run blind.

### `skin_sheen` is dead on stills

```
skin_sheen (fraction of face pixels above luma 235)
  real camera frames   0.000  on 9 of 9
  generated stills     0.000  on 9 of 9
```

It is **floored at zero on every still in both classes.** Had it been the endpoint — and it is the
obvious one, since `realism_gate` documents it as "plastic specular AI sheen" — the A/B would have
returned "no difference" whatever the modifier did, and that null would have looked like a real
answer. It is **excluded as an endpoint**, in the script, with the reason written next to it.

### A cross-class comparison is confounded, so the design must be within-route

| metric | real frames | generated stills | Cohen's d |
|---|---|---|---|
| `detail_mf` | 228.2 | 514.7 | −0.71 |
| `noise_hf` | 2.23 | 4.20 | −1.05 |
| `sat_mean` | 42.5 | 91.7 | **−3.81** |

The generated stills measure as having **more** texture and **more** grain than real camera frames —
the opposite of the naive "AI is too smooth" expectation. This is **not** evidence that AI images are
more realistic. The sets differ in resolution (518k px vs 262k–737k), codec, framing and content, and
`corr(pixels, detail_mf) = +0.31`. The comparison cannot separate the model from the pipeline.

**What it does establish:** these metrics are only interpretable **within one route at one
resolution**, which is how the experiment is built — both arms identical in model, resolution,
aspect and project, differing only in prompt text.

It also establishes that **saturation is the loudest difference between real and generated**, which
is why `sat_mean` is a **guard** in the decision rule rather than an outcome.

---

## 2 · The pre-registered rule

Fixed before any image is bought, so no endpoint can be chosen after seeing results.

| endpoint | role | meaning |
|---|---|---|
| `detail_mf_norm` | **PRIMARY** | Laplacian variance over the face mask, **divided by face-box area** so a bigger face in frame is not mistaken for more texture. Plastic skin is low. |
| `noise_hf` | secondary | high-frequency residual in flat face regions — the grain floor |
| `sat_mean` | **GUARD** | if the arms differ here, the modifier moved the **grade**, and a texture difference cannot be attributed to skin |

**Decision:** the modifier **works** if `detail_mf_norm` is higher in the treatment arm at *p* < 0.05
(Welch, two-sided) **and** `sat_mean` does not differ at *p* < 0.05. Otherwise: *no measured effect*,
*backfires*, or *confounded*. No endpoint is added afterwards.

**The guard is not decorative.** Run against the calibration sets as a mock experiment, the script
returned:

> `CONFOUNDED — saturation differs between arms, so the modifier changed the grade; a texture
> difference cannot be attributed to skin rendering`

It refused to report a texture result it could not attribute. That is the rule working on real data
before a cent was spent.

---

## 3 · Power and cost

Within-arm CV of `detail_mf` on same-production, same-size real frames: **0.80**. For 80% power at
α = 0.05:

| detectable change | n per arm | images | cost |
|---|---|---|---|
| 100% | 11 | 22 | $1.54 |
| 75% | 18 | 36 | $2.52 |
| **50%** | **41** | **82** | **$5.74** |
| 30% | 112 | 224 | $15.68 |
| 20% | 252 | 504 | $35.28 |

**Cost is not the constraint.** The default is 41/arm — $5.74 for a 50% effect.

## 4 · Controls, and one that is not available

Both arms: same route (`world-still-proxy`), model (`grok-imagine-image-quality`), resolution,
aspect, project. Only the prompt differs, and the treatment arm is produced by **`applyRealism`
itself** (`scripts/qa/realism_arms.mts`), not retyped — with a guard that aborts if the base prompt
triggers a withhold, since that would test a weaker modifier than the one that shipped.

**No seed lock.** xAI's images endpoint exposes no seed parameter, so runs cannot be paired. This is
handled by sample size and the fixed rule, **not** by treating the pairs as matched. Images are
written with a separate `blind_key.json` so visual judgement can be made without knowing the arm.

## 5 · Why it has not run: no credential on this machine

Every paid image route needs a **user JWT**:

| route | auth | reachable here |
|---|---|---|
| `world-still-proxy` | user JWT | no |
| `grok-image-garment-proxy`, `grok-image-look-composite` | user JWT (`verify_jwt = true`) | no |
| `grok-resolution-test` | anon **or** service-role bearer | **no** — it reads `SUPABASE_ANON_KEY`, which is not among its declared secrets, so the anon branch compares against `""` and 401s. Its own comment says to delete it once the resolution question is answered. |
| `provider-jobs-tick` | cron key or user JWT | advances already-submitted jobs only; cannot start one |

The project already has the right mechanism — `scripts/_lib/auth.py`, a long-lived revocable **batch
credential** exchanged through `batch-token-proxy` for a fresh session, built precisely so a script
can run unattended. **It is simply not enrolled on this machine:** `~/.config/avt/batch_credential`
does not exist and there is no cached session. This container was cloned fresh.

Enrolment is a one-off and needs a browser JWT pasted once — `batch-token-proxy`'s `enroll` action
requires a user JWT, and `session` requires a secret that is stored only as a sha256. There is no
way to bootstrap it from here, and **forging a `batch_credentials` row was not attempted**: that
function's own documentation calls a caller-supplied owner "the whole vulnerability", and writing
one would mint an agent a session as the account owner.

**The unblock, either one:**

```bash
# preferred — survives token expiry, revocable, runs unattended afterwards
python3 scripts/_lib/auth.py enroll --label "cloud session"

# or the old path — a browser access token, good for about an hour
#   DevTools → Application → Local Storage → sb-…-auth-token → access_token
echo "<token>" > /tmp/jwt.txt
```

Then:

```bash
npx tsx scripts/qa/realism_arms.mts --out qa/arms.json
python3 scripts/qa/realism_ab.py --arms qa/arms.json \
  --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --n 41 --out qa/realism-ab --confirm
```

## 6 · What this will not answer

* **Whether a viewer prefers either arm.** It counts texture; it does not judge a picture. The blind
  key exists so a human can answer that separately.
* **Whether it helps on the garment-edit lane**, which is image-to-image and where the source frame
  dominates skin rendering. This measures text-to-image.
* **Anything about video.** The temporal clause is untested by this and remains `unverified`.

The images land in `project-references/<user>/<project>/worlds/` under the `realism-ab` label and are
inert — safe to delete once scored.
