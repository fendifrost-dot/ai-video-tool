# Results of the combined test round (2026-10-02)

The round ran from the signed-in app's **Runs** page (run `run-20261002-1320`), not from a runner with a credential, so
the clips themselves are in the project's library, not here:

| Shot | Library asset | Provider job |
|---|---|---|
| `S06c_low_hero` | `3516666a-03a8-4d86-a0a1-fa7f71584bf6` | Higgsfield `71167480-58d5-43ed-8995-22855d61a4e0` |
| `S08a_side_tight` | `f60f9abf-da8d-4819-be46-7769654b75eb` | Higgsfield `ecda36b3-4c22-4bb8-8005-27a07114447b` |
| `S11c_low_hero` | `c872a01f-5bcc-47d1-a03e-06ad086191f3` | Higgsfield `ab4048f5-87ff-4125-abbb-76e13ebae9b6` |
| `S12b_side_tight` | `0f7d7c71-e05a-4256-9bad-152f432cae1f` | Higgsfield `1b54b141-3cac-4550-9ebf-06989c6d3085` |
| `P_stoop_empty` (living plate) | `70e99140-61f1-4fc0-a68b-806cc63309a3` | Runway `0392413e-527c-44e6-8b29-185b41d8000e` |

What is here is the measurement:

* `<shot>_fidelity.json` — `scripts/qa/reference_fidelity.py` against the 4 s source one folder up; beside an angle file
  under `<out>/angles/`, this is what `camera_coverage.py plan` gates the angle on.
* `<shot>_compare.jpg` — source frames above, the returned angle below.
* `stoop_plate_still.jpg` — the still the stoop shot was built on; `stoop_spec_still.json` / `stoop_spec_bar5.json` — the
  camera specs (`place`, `occlude`, `move.about`, `move.parallax`); the two strips — the 5 s pull-back on the still plate
  and the composite on the living plate.
* `bar5_cut_checks.jpg`, `bar5_coverage_qa.json` — the cut with the gated angles and the stoop shot in it (QA PASS).

Read with `docs/research/results/2026-10-02-adjustments/ADJUSTMENTS_2026-10-02.md` § 10.
