# The combined test round — paid half (runbook, rev 2 · 2026-10-02)

Rev 1 of this file could not be run: it asked for a browser JWT in `/tmp/jwt.txt` (no agent session has one) and for
inputs that only existed in a chat attachment and in the Cowork sandbox's scratch disk. Both are fixed here:

* **Identity** — the owner creates a machine credential in the app (**Settings → Machine credentials**), sees its secret
  once, and gives it to the runner as `AVT_BATCH_SECRET`. No browser token is copied anywhere, and `auth.py enroll` is
  not needed. Revocation is a button on the same page.
* **Inputs** — everything this round reads is in the repo: `docs/handoffs/round_2026-10-02/`.
* **Outputs** — come back through the repo (`docs/handoffs/round_2026-10-02/results/`), because neither agent session can
  read the other's disk and the Cowork session cannot read storage.

## Ledger

Environment / B-roll ledger: **$40.90 of $50 used → $9.10 left** (`docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md`). Seedance 2.5
reference-to-video at 720p bills $0.4622 per second for input and output: a 4 s source → 4 s result = **$3.70 per angle**.
Two angles = **$7.40** (the runner prints exactly this estimate before it submits anything and refuses to start above
`--max-usd`). The empty-stoop plate ≈ $0.14. Judge ≈ $0.08 per clip. The round ≈ $7.70. All four angles = $14.75 — past
the ceiling; the other two wait for a top-up.

## Inputs — `docs/handoffs/round_2026-10-02/`

| File | What |
|---|---|
| `shots_two.json` | the two requests to run now: `S06c_low_hero` (first hook line) and `S11c_low_hero` ("this ice on") |
| `angle_requests.json` | all four, for when the ledger is topped up |
| `S06c_low_hero_src.mp4`, `S08a_side_tight_src.mp4`, `S11c_low_hero_src.mp4`, `S12b_side_tight_src.mp4` | the 4 s source trims (720×1280, 24 fps, with audio), each ending on its sub-slot's last frame (S08a runs forward from the head of its take) |

Each request carries `source_local` (repo-relative), `source_trim: [0, 4]`, `source_window` (song clock), `masterStart`
(of the trim), `angle`, and `keep[]` (the wardrobe constants). The runner cuts `source_trim` out of `source_local`,
uploads it to `project-clips/…/seedance/` once, and uses it as `@Video1`.

## Step 0 — identity (the owner, once per machine, about a minute)

1. Open `https://aivideotool.lovable.app/settings` signed in. Under **Machine credentials** type a label for the runner
   and press **Create credential**.
2. Copy the line it shows (`AVT_BATCH_SECRET=…`). It is shown once.
3. Give that line to the runner's environment (an environment variable for the Claude Code session).

The stray credential `cowork-sandbox-2026-10-02` (enrolled on 2026-10-02, secret never stored) was revoked from this page
at 17:15 UTC the same day — the page's list and revoke paths are verified live; the list shows it as revoked.

## Step 1 — the runner (Claude Code)

```bash
# identity: the secret from step 0 is in AVT_BATCH_SECRET; the anon key is the public key already in the repo's .env
export AVT_ANON_KEY="$(grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2- | tr -d '"')"
python3 scripts/_lib/auth.py status          # must say: credential present

R=docs/handoffs/round_2026-10-02
COMMON="--project 764a63d2-93cd-44f3-905f-292f14ab2f51 --user 3ca10935-8c3d-4479-9a0c-8bfe8050840c"

# free check first: prints "estimate $7.40 for 2 shots" and exits
python3 scripts/broll/run_world_batch.py --shots $R/shots_two.json --out round_out/angles $COMMON --look-preset film_bar_v1 --max-usd 8 --dry-run

# the two angles (≈ $7.40). --judge adds ≈ $0.16; drop it if the gate's models cannot be downloaded in this container
python3 scripts/broll/run_world_batch.py --shots $R/shots_two.json --out round_out/angles $COMMON --look-preset film_bar_v1 \
    --look-bank docs/research/references/realism_bar/look_bank.json --judge --max-usd 8

# the empty stoop plate (≈ $0.14): the staging Fendi picked, with the performer's spot empty, for the occluder composite
python3 scripts/broll/world_around.py --still docs/research/results/2026-10-02-world-around-performer/source_S11_f18.jpg \
    --extra-ref docs/research/results/2026-10-02-world-around-performer/FENDI_PICK_kids_car_from_behind.jpg \
    --prompt "Overcast afternoon on a brick row-house street. He stands on the stoop in front of the door, head and shoulders. Five to ten feet in front, at the curb, Black boys aged 9 to 12 lift a wheel-less beige sedan onto their shoulders and walk it away down the street, backs to the camera, two on the near side. A low iron fence runs along the sidewalk in front of the stoop. No night, no symmetry, nobody posed." \
    --empty --out round_out/stoop $COMMON

# hand the results back through the repo
mkdir -p $R/results
cp round_out/angles/S06c_low_hero.mp4 round_out/angles/S11c_low_hero.mp4 round_out/angles/manifest.json $R/results/
cp round_out/stoop/grok-image-2.png $R/results/stoop_empty.png && cp round_out/stoop/grok-image-2.json $R/results/stoop_empty.json
git add $R/results && git commit -m "paid round results: two Seedance angles + the empty-stoop plate" && git push
```

If a run dies after a submit, rerun the same command with `--resume`: the manifest is write-ahead, a job that was
accepted is polled, never resubmitted. A shot left in `submitting` is reported, not resubmitted — check Control Center's
`tool_execution_logs` before `--resubmit-unknown`.

Record the actual cost (each job's `estimate_usd` in the manifest) in `docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md`.

## Step 2 — the $0 half (the Cowork session, on the returned files)

The living takes, mattes, plates and the song live in the Cowork sandbox, so the rest runs there:

1. `scripts/qa/reference_fidelity.py` on each angle against its source trim. Rule: an angle is cut on a sung line only if
   identity ≤ 0.25 and lip best-fit ≥ 0.6; otherwise it goes between lines.
2. The occluder composite of the real S11 take on `stoop_empty.png` (`composite_environment.py --occluder-auto
   0,0.33,1,1 --occluder-below 0.47 --fg-place 0.30,0.25,0.48 --fg-anchor bottom --match-plate 0.7`).
3. bar5: the angle files go to `bar5/angles/`, `camera_coverage.py plan` picks them up with the trim's `masterStart`,
   `render --workers 2`, `assemble_section.py`, `insert_broll.py`, `coverage_qa.py`.
4. Results into `docs/research/results/2026-10-02-adjustments/ADJUSTMENTS_2026-10-02.md` § 9.
