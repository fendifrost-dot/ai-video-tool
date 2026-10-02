# The combined test round — paid half (runbook for Claude Code, 2026-10-02)

Fendi: "Once everything looks good don't hesitate to run tests." The $0 half ran in the Cowork sandbox and PASSED (bar4:
`docs/research/results/2026-10-02-adjustments/`, § 7). The paid half needs authenticated provider calls, and the Cowork
session cannot hold the batch credential (its safety classifier blocks materialising one), so it runs from the machine that
has it — Claude Code, after one `auth.py enroll`. Everything below is data + one command per step; nothing to write.

## Ledger

Environment / B-roll ledger: **$40.90 of $50 used → $9.10 left** (`docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md`). Seedance 2.5
reference-to-video at 720p bills $0.4622 per second for INPUT and OUTPUT — a 4 s source → 4 s result ≈ **$3.70 per angle**.
Four angles ≈ $14.80 would cross the ceiling; **run two now** (S06c_low_hero on the hook's first line, S11c_low_hero on
"this ice on"), the other two when Fendi tops up. The empty-stoop still ≈ $0.14. Judge ≈ $0.10 per clip. Round ≈ $8.

## Inputs (delivered in the Cowork chat on 2026-10-02 — put them in one folder, `round/`)

* `angle_requests.json` — four seedance_ref requests in the `run_world_batch.py` dialect, each with `source_local` (the 4 s
  trim beside it), `source_trim: [0, 4]`, `source_window` on the song clock, `masterStart` of the trim, `angle`, and
  `keep[]` (wardrobe constants — S06 is the Genjutsu White-Ice take, the rest camo shirt + navy cap + clear-lens glasses).
  `camera_coverage.py plan` writes this file; the trims and masterStarts are the planner's (commit after `b457474`).
* `S06c_low_hero_src.mp4`, `S08a_side_tight_src.mp4`, `S11c_low_hero_src.mp4`, `S12b_side_tight_src.mp4` — 4 s each,
  ending on the sub-slot's last frame (S08a runs forward from the head of its take).
* `renders_bar4_with_keep.json` — the bar4 renders map with `keep[]` per slot, for the next plan.

## Steps

```bash
# 0. once per machine (needs a user JWT at enrol time only; the secret lands in ~/.config/avt/batch_credential, 0600)
python3 scripts/_lib/auth.py enroll --label "claude-code-$(hostname)"
python3 scripts/_lib/auth.py status

# 1. two angles now (edit the list to all four once the ledger is topped up)
python3 - <<'EOF'
import json; a=json.load(open("round/angle_requests.json")); keep={"S06c_low_hero","S11c_low_hero"}
json.dump([dict(r, source_local=f"round/{r['source_local']}") for r in a if r["id"] in keep], open("round/shots_two.json","w"), indent=1)
EOF
python3 scripts/broll/run_world_batch.py --shots round/shots_two.json --out round/angles --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
    --user 3ca10935-8c3d-4479-9a0c-8bfe8050840c --look-preset film_bar_v1 --look-bank docs/research/references/realism_bar/look_bank.json \
    --judge --max-usd 9
#    → round/angles/<id>.mp4 + manifest.json with "fidelity" (reference_fidelity.py: identity + lip fit) and the gate verdict.
#    Rules: an angle is cut on a sung line only if identity ≤ 0.25 and lip best_fit ≥ 0.6; otherwise it goes between lines.

# 2. the empty stoop plate (≈ $0.14): the same staging as pass6, with his spot empty, for the occluder composite
python3 scripts/broll/world_around.py --still docs/research/results/2026-10-02-world-around-performer/source_S11_f18.jpg \
    --extra-ref docs/research/results/2026-10-02-world-around-performer/FENDI_PICK_kids_car_from_behind.jpg \
    --prompt "Overcast afternoon on a brick row-house street. He stands on the stoop in front of the door, head and shoulders. Five to ten feet in front, at the curb, Black boys aged 9 to 12 lift a wheel-less beige sedan onto their shoulders and walk it away down the street, backs to the camera, two on the near side. A low iron fence runs along the sidewalk in front of the stoop. No night, no symmetry, nobody posed." \
    --empty --out round/stoop --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --user 3ca10935-8c3d-4479-9a0c-8bfe8050840c
#    → round/stoop/grok-image-2.png: the plate WITHOUT him (his light and perspective kept from the reference frame).

# 3. the occluder composite on that plate (measured flags from § 4 of the adjustments results)
python3 scripts/edit/composite_environment.py --in <S11 real cut> --plate round/stoop/grok-image-2.png --out round/S11_stoop.mp4 \
    --occluder-auto 0,0.33,1,1 --occluder-below 0.47 --fg-place 0.30,0.25,0.48 --fg-anchor bottom --match-plate 0.7

# 4. bar5: the plan sees the angle files and cuts them in (renders_coverage.json points at round/angles/<id>.mp4 with the trim's masterStart)
mkdir -p bar5/angles && cp round/angles/S06c_low_hero.mp4 bar5/angles/S06c_low_hero.mp4 && cp round/angles/S11c_low_hero.mp4 bar5/angles/S11c_low_hero.mp4
python3 scripts/edit/camera_coverage.py plan --shotspecs <shotspecs_audition.json> --renders round/renders_bar4_with_keep.json --out bar5 --bpm 122 --lyric-lines docs/treatments/ysl-ice-on.lyric_lines.json --seed 7
python3 scripts/edit/camera_coverage.py render --plan bar5/coverage_plan.json --size 1080x1920 --workers 2
python3 scripts/edit/assemble_section.py --shotspecs bar5/shotspecs_coverage.json --renders bar5/renders_coverage.json --song <song.wav> --out bar5/bar5_base.mp4 --size 1080x1920 --bpm 122
python3 scripts/edit/insert_broll.py --section bar5/bar5_base.mp4 --assembly bar5/bar5_base.mp4.assembly.json --manifest <bar2/manifest.json> --lyric-map <bar2/lyric_map_measured.json> --bpm 122 --out bar5/YSL_IceOn_bars24-46_bar5.mp4 --bars 1 --skip-head 0.75 --min-verdict PASS --replace-generated
python3 scripts/qa/coverage_qa.py --shotspecs bar5/shotspecs_coverage.json --bpm 122 --out bar5/coverage_qa.json
```

The sandbox-side inputs for step 4 (the living takes, mattes, plates, bar2 manifest, song) are in the Cowork sandbox
(`ysl/living2`, `ysl/mattes`, `ysl/worlds_bar2`, `ysl/bar2`, `ysl/audio`); if that container has been reclaimed, the
masters are in storage (`project-clips`, master-with-audio asset `55bdc383`) and the plates in `project-references`.
Alternatively hand the two gated angle files back to the Cowork session and it runs step 4 at $0.

## What to record

`docs/research/results/2026-10-02-adjustments/ADJUSTMENTS_2026-10-02.md` § 8: per angle — identity, lip best_fit, judge,
look distance, cut-on-line or between-lines; the empty-stoop plate beside the occluder composite; bar5 coverage QA. Update
`docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md` with the actual cost (the manifest's `estimate_usd` per job).

## Hygiene

A batch credential `cowork-sandbox-2026-10-02` (id `53f53b95-0f4e-40b0-af8f-3e380bad044f`) was enrolled from the app tab on
2026-10-02 and its secret was never stored anywhere — nobody holds it. Revoke it: `python3 scripts/_lib/auth.py revoke
53f53b95-0f4e-40b0-af8f-3e380bad044f` (or the Batch page).
