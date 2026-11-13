# VFX worker library

Python effects the edit-render worker runs. No After Effects and no paid provider.

| Module | Role |
|---|---|
| `library.py` | Transitions and looks. Parameters are frames. Zoom stays between 0.92 and 1.08, the pivot stays off the mouth, and a ceiling hold cannot exceed 4 frames. |
| `chain.py` | 2D catenary plus a Blender 5.2 curve script. Hyenas is the first use (rope to chain). |
| `qc.py` | Pass/fail report: 1080×1920 SAR 1:1, audio md5, black frames outside allowed windows, face diff 0, mouth timing, untouched frames, cut register. |
| `beat_to_cut.py` | Shot list + beat grid → an `edit_sequences` document. Not a new EDL. |
| `blender_job.py` | Headless Cycles CPU argv. `AVT_BLENDER` defaults to `/workspace/tools/blender/current/blender`. Frames are chunked. The skill dependency is `blender>=5.2`. |
| `limits.py` | The creative limits those modules enforce. |

The worker feeds one chunk of frames at a time. These modules do not load a whole clip.

`python3 scripts/vfx/test_vfx.py` runs the synthetic checks. It does not launch Blender and it does not upload.

Effect names and default params are `EFFECTS` in `library.py`. The catalog rows in AVT point `code_ref` at those names. Storing the row does not run the effect. A job pins the skill version and names the worker.
