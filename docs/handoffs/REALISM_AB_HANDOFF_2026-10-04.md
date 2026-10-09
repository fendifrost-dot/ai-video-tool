# Handoff — run the realism A/B · 4 October 2026

**To:** the Claude agent with browser access to the signed-in app
**From:** the Claude Code cloud session that built it (PRs #170, #171)
**Why you:** the experiment is built, merged and ready. It needs **one user JWT**, which lives in
the browser you already have. The cloud container has no browser and no enrolled credential.

**Budget: ~$5.74** (82 images × $0.07). **Time: ~15 minutes**, most of it waiting on generations.

---

## Before you run it — corrections from the integration agent (4 October, before any image exists)

The agent this was handed to (integration session, browser access) **did not run it** and found these. Nothing was
generated; $0 spent.

1. **The script on `eec517e` would not have stopped spending.** `generate()` read `images[].signedUrl`;
   `world-still-proxy` returns `stills[].previewUrl`. Every answer read as empty and `while len(saved) < n` asked
   again — a billed $0.28 call each loop, no pictures saved, no end. Reproduced with a stand-in for the network
   (25 billed calls, 0 saved, stopped only by the harness). **Fixed here**: the proxy's real answer is read; an
   empty answer, a refusal or an error stops the run with what was said; a short answer gets at most three top-up
   calls per arm; the spend cannot pass the estimate by more than those. Tests: `scripts/qa/tests/`.
2. **The arms were not interleaved.** The comment said so and the shuffled `order` was never used: all 41 control
   were drawn, then all 41 treatment. The calls now run in one fixed shuffled order (`plan_calls`, recorded in
   `generation.json`). This is the script's own stated control, implemented — not a new one.
3. **A blind read was not possible.** `blind_key.json` named anonymised files that did not exist; the only pictures
   on disk had the arm in their filename. Scoring now writes the copies to `<out>/blind/`. Read those, then the key.
4. **`droppedNoFace` was one number**; § 4 asks whether it is lopsided. `droppedNoFaceByArm` is now beside it. The
   proxy's own billed total is written to `generation.json` (`billedUsdReportedByProxy`).
5. **Running without `--confirm` does not check your sign-in.** It prints the cost and exits before it reads any
   credential. The first billed call is the first time auth is used.
6. **The treatment arm is the positive text only.** `arms.json` carries `negativeTreatment`; neither the script nor
   `world-still-proxy` sends a negative prompt. That is what this route ships, so the experiment tests what ships —
   but a result here says nothing about the negatives.
7. **§ 1 was not done and will not be done from a cloud session.** It asks for the user's session token to be read
   out of the browser and moved into a file or a CLI. The integration agent does not lift session tokens out of the
   browser (the browser tool withholds them, and Fendi's standing direction on the Higgsfield sign-in was the
   same). The run belongs on the Mac, where a credential can live: Fendi enrols once
   (`python3 scripts/_lib/auth.py enroll`, or Settings → Machine credentials in the app), then a session ON THE
   MAC runs § 2. No endpoint, metric, sample size or decision rule was touched.

---

## 0 · There is no permission to grant

The token is **the ordinary session of the signed-in user** — not an elevated scope, not a new grant.
Verified in `src/integrations/supabase/previewAuthStorage.ts`: brokered postMessage storage engages
only when the host carries a project UUID **and** the page is framed. On `aivideotool.lovable.app`
in a normal tab, neither holds, so the session sits in **plain `localStorage`**.

Nothing needs enabling in Supabase, Lovable or GitHub. If you are signed in, you already have it.

---

## 1 · Get a token

**Preferred — enrol a batch credential** (revocable, survives the 1-hour expiry, makes every future
unattended run free of this step). From the repo on the Mac:

```bash
cd /Users/gocrazyglobal/Projects/ai-video-tool
python3 scripts/_lib/auth.py enroll --label "claude agent"
```

It asks for a browser JWT once, then stores a long-lived secret at `~/.config/avt/batch_credential`
(mode 0600) and exchanges it for fresh sessions from then on.

**The JWT it asks for**, from a normal tab on `https://aivideotool.lovable.app` while signed in —
DevTools console:

```js
JSON.parse(localStorage.getItem('sb-qoyxgnkvjukovkrvdaiq-auth-token')).access_token
```

**Fallback if you'd rather not enrol** — the same token, straight to a file, good for about an hour
(enough for the whole run):

```bash
echo "<access_token>" > /tmp/jwt.txt
```

If that `localStorage` key is null you are in the Lovable **editor iframe**, where the session is
brokered to the parent. Open `aivideotool.lovable.app` in its own tab and read it there.

---

## 2 · Run it

```bash
cd /Users/gocrazyglobal/Projects/ai-video-tool
git pull origin main                      # needs 21770b9 or later

npx tsx scripts/qa/realism_arms.mts --out qa/arms.json

python3 scripts/qa/realism_ab.py \
  --arms qa/arms.json \
  --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
  --n 41 --out qa/realism-ab --confirm
```

Without `--confirm` it prints the cost and exits, which is a safe way to check your auth works first.

`realism_arms.mts` **aborts** if the base prompt trips a withhold in the modifier. That is correct
behaviour, not a bug: it means the arms would differ by less than the full modifier and the
experiment would quietly test a weaker treatment than the one that shipped. Report it, don't route
around it.

---

## 3 · The pre-registration is LOCKED

This is the part that matters most, and the easiest to break without noticing.

| endpoint | role |
|---|---|
| `detail_mf_norm` | **PRIMARY** — face-mask Laplacian variance ÷ face-box area |
| `noise_hf` | secondary |
| `sat_mean` | **GUARD** — a difference here means the grade moved, not the skin |

**Works** = primary higher in treatment at *p* < 0.05 **and** guard not significant. Anything else is
*no effect*, *backfires*, or *confounded*.

**Do not**, after seeing results:

- change or add an endpoint, or switch the primary — the script's choices were fixed before any
  image existed, and `skin_sheen` was **excluded on evidence** (it measured exactly 0.000 on 9 of 9
  real frames and 9 of 9 generated stills — floored on stills, it would have returned "no
  difference" whatever the modifier did);
- re-run until it comes out significant — more runs are fine, but then **all** runs are the result,
  not the best one;
- edit the prompts in `arms.json` by hand — they come from `applyRealism` so the experiment tests
  the shipped module, and `realismVersion` is recorded alongside;
- raise `--n` after a null in order to chase significance. If you want more power, say so and we
  re-run at the larger n **from scratch**.

**A null result is a real result and should be reported as one.** The modifier shipped labelled
HYPOTHESIS precisely so this could come back negative without anything needing to be walked back.

---

## 4 · Report back

`qa/realism-ab/ab_result.json` has the numbers. Please return:

1. **The verdict line** verbatim from the JSON.
2. **The three endpoints** — control mean, treatment mean, relative change, *p*.
3. **`droppedNoFace`** — images where no face was found. If this is lopsided between arms, say so:
   it means one arm is producing less face-like output and the comparison is on a filtered sample.
4. **Actual cost**, from the provider's usage ticks if you can see them, not the $0.07 estimate.
5. **A blind visual read.** `qa/realism-ab/blind_key.json` maps anonymised names to real filenames.
   Look at a sample **without opening the key**, say which look more photographic, *then* open it.
   This is the only judgement of whether the pictures are actually better — the metric counts
   texture, it does not judge a picture.
6. **Anything that looked wrong** — identical outputs, refusals, a provider error, obvious
   content drift between arms.

---

## 5 · Housekeeping

**Disk (`CLAUDE.md`, non-negotiable):** write only under
`/Users/gocrazyglobal/Projects/ai-video-tool` (code and `qa/`) or `/Volumes/T7/...` for media.
**Never** iCloud — no `~/Library/Mobile Documents/**`, no recursive scans under `FENDI FILES`.
Confirm T7 with `df -h /Volumes/T7` before putting anything there; if it is missing, stop and ask.

**What this writes:** 82 images into `project-references/<user>/<project>/worlds/` labelled
`realism-ab`, plus local files under `qa/realism-ab/`. They are **inert** — no shot assignment, no
timeline change, no approved asset touched — and safe to delete once scored.

**Backend rules still apply:** no standalone Supabase dashboard, no CLI, no service-role key. This
runs entirely through `world-still-proxy` with an ordinary user session, which is the sanctioned
path.

**Do not change** `src/lib/prompts/realism.ts` as part of this. If the result says the wording
should change, that is a separate PR with its own review — changing the module and the experiment
together makes both unreadable.

---

## 6 · Background, if you want it

`docs/research/results/2026-10-04-realism-ab/PROTOCOL.md` — the full pre-registration, the
calibration that killed `skin_sheen`, the power table, and why the metrics are only interpretable
within one route at one resolution.

Known limitation, stated up front: **xAI's images endpoint exposes no seed**, so the arms cannot be
paired. Handled by sample size and the fixed decision rule — not by treating the pairs as matched.
This also means a single striking image proves nothing in either direction.
