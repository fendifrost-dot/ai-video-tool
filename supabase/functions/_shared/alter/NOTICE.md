# ALTER — third-party notice

The three modes, the 36 presets, and the draft checker's numeric gates are from
the scenario-alter skill published at https://www.scenario.com/explorations/alter/

That skill's frontmatter says `license: MIT`. AVT does not call the Scenario MCP
and does not vendor the skill's Python. The preset sentences and the published
gates (measured by that skill on 13 and 21 Oct 2026) are included under that MIT
grant. The skill's frontmatter is the only licence statement published with it; no
copyright line was published, so none is reproduced here.

The mouth gates (timing 0.65 on the take's clock, re-timed at two or more frames,
shape 0.06 of face width with a watch at 0.04, face read on 80% of frames) are this
repo's own, measured on Fendi's footage on 26 Nov 2026
(`docs/alter/CALIBRATION_2026-11-26.md`). The identity-distance maximum 0.25 is the
existing sung-line gate in `scripts/edit/camera_coverage.py` (`identity_max`). It is
not certified (`docs/alter/IDENTITY_2026-11-27.md`): a number above it fails a draft,
a number under it clears nothing.

The identity model the tracker can read (`scripts/alter/track_mouth.py`, pinned by
sha256) is InsightFace's `buffalo_l` `w600k_r50.onnx`. It is not in this repo and is
never fetched by it. InsightFace licenses its trained models for non-commercial
research only and asks to be contacted for other use
(https://github.com/deepinsight/insightface, README "License", read 27 Nov 2026). It
was used once to evaluate the gate and is kept outside `$AVT_MODELS`; using it on
shots is Fendi's decision. The `action` preset, its wording and its check mode are AVT's own
(`catalog.ts`), not part of the skill.

`catalog.data.ts` is generated from `catalog.json` by `scripts/alter/extract_presets.py`
so that no JSON module sits in the edge function's load path.
