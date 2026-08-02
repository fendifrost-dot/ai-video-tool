# AVT compute workers (off-Fal, off-edge)

Heavy compute that **cannot** run on Fal video ops or a Deno edge function lives
here. Today that is one thing:

## `warp_worker/` — gated garment-detail propagation prototype

A **tightly-scoped prototype** (ONE approved 2–4 s shot) of the LOCKED video
garment-swap architecture ([`docs/VIDEO_SWAP_ARCHITECTURE.md`](../docs/VIDEO_SWAP_ARCHITECTURE.md)),
implemented as the custom, off-Fal propagation worker that fills the deliberately
**"disabled"** hole in the edge function `wardrobe-video-propagate-proxy`
(`supabase/functions/_shared/propagation.ts`: Fal hosts no dense optical-flow /
warp / EbSynth endpoint, so this step must run elsewhere).

It is **not** a full-video production service and does not scale to one until the
one-shot evidence says the geometry/fidelity gap is bridged.

### What it is (and isn't)

- **It is** a *gated* propagation/compositing system: dense optical flow +
  occlusion/confidence maps + bidirectional anchor propagation + a hard
  **re-anchor gate** + region compositing onto the ORIGINAL footage + a
  deterministic tracked brand layer + persisted status + a QA report.
- **It is not** a claim that Grok pixels can be optical-flow-warped onto Kolors.
  The design treats **Kolors = geometry/identity authority** and **Grok =
  garment-detail reference / correction anchors** (not a literal full-frame
  donor). The warp propagates *localized garment detail* along the SOURCE motion;
  where geometry/flow breaks, the gate **re-anchors instead of forcing a warp**.

### Honest compute path

| Piece | Prototype (here) | Production |
|---|---|---|
| Dense optical flow | OpenCV **DIS** (real, CPU) | RAFT / GMFlow on a **GPU worker** (same interface) |
| Region masks | coarse heuristic + **real YCrCb skin** for hands/arms | **SAM-3 video** masks via `--mask-dir-json` |
| Resolution | downscaled working width (default 480–540) | full-res 2160×3840 |
| Base garment / anchors | source frames (identity stand-in) | frozen **Kolors** base frames + **Grok** correction anchors |

Nothing fakes a flow field or a warp it did not compute. Where a real frozen
baseline artifact is missing, the QA side-by-side marks that column **PENDING** —
it is never fabricated.

### Setup

```bash
python3 -m venv workers/.venv
workers/.venv/bin/python -m pip install -r workers/requirements.txt
```

### Run the one-shot (from repo root)

```bash
SRC="/Volumes/T7/AVT VIDEO CLIPS/benchmark/wardrobe-swap-v1/frames"
HEAVY="/Volumes/T7/AVT VIDEO CLIPS/benchmark/wardrobe-swap-v1/warp_worker_out/oneshot"
PYTHONPATH=. workers/.venv/bin/python -m workers.warp_worker.run \
  --source "$SRC" --shot-id oneshot \
  --start 48 --count 120 --stride 1 --work-width 480 --cadence 18 \
  --out-heavy "$HEAVY" \
  --out-artifacts workers/warp_worker/artifacts/oneshot
```

Plug real baselines in without touching code:

```bash
  --base   <dir of Kolors per-frame VTON frames>          # geometry authority
  --anchors '{"48":"grok_48.png","168":"grok_168.png"}'   # Grok correction anchors
  --mask-dir-json '{"torso":"…","hands_arms":"…", …}'     # SAM-3 masks
  --brand-asset  navy_stripe_logo.png                      # tracked brand layer
```

### Tests

```bash
PYTHONPATH=. workers/.venv/bin/python -m pytest workers/tests/ -q
```

Pure logic (gate, keyframe plan, status, brand geometry) + an end-to-end smoke
test on a synthetic translating clip.

### Outputs

- Heavy per-frame composites → `--out-heavy` (T7; too large for git).
- Committed artifacts → `--out-artifacts`: `status.json`, `flow_metrics.json`,
  `qa_metrics.json`, `qa_report.md`, `sidebyside.png`, `samples/`.

See [`warp_worker/ARCHITECTURE.md`](warp_worker/ARCHITECTURE.md) for the module
map, the 12-capability matrix, and the model-agnostic interfaces.
