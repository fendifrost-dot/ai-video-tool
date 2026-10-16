# Handoff — the polar bear on the platform, the Montage press, the Beeble benchmark fix (16 Oct 2026)

**Why:** Fendi, 16 Oct 2026, in order: "Instead of the fake dinosaur a photo realistic polar bear and on every shot
we need to be utilizing multiple creative camera angles per performance shot" → "The polar bear looks like it's
ripping through the background and I was thinking a realistic size polar bear on the platform" → "Has to look real"
→ "Let's game plan this… go back to our reference of Thug Poppy's prompts… the tiger being rescued by the firemen…
me rapping into the camera, a quick shot to the side, a zoom in of the polar bear, all on the same platform… a child
walking up to the polar bear and petting it… Quick, very quick." He then sent the two Higgsfield posts.

Branch `claude/determined-faraday-4rzanq`, PR **#276** (draft → merge per Fendi's standing "always merge").

## State at hand-off — every line as it stands, with its evidence

| What | State | Evidence |
|---|---|---|
| Thuggpapi's prompts, verbatim, and the tool behind them | **VERIFIED, committed** `13d9b8b` | `docs/research/references/THUGGPAPI_SEEDANCE_MONTAGE_PROMPTS_2026-10.md` — the pages render client-side; read in headless Chrome. The "recreate it here" link opens Higgsfield Create Video → **Seedance 2.5 → References**, 5 s, 1080p. |
| Polar bear by text in the moving plate (two tries) | **FAILED, recorded** — ledger row 47 | bear 1 job `f13c692b` → asset `69e6f5fe`: building-sized (marked `usable:false`, reason on the record); bear 2 job `59657153` → asset `a4bee7d2`: no bear in any frame. |
| Polar bear put into the plate STILL first | **DONE, judged PASS as a picture** — ledger row 48 | `world-still-proxy` (Grok image edit, plate `b58cab47` as the `place` reference, prompt `plate-event-still-v1-2026-10-16`, $0.14 for two): stills `c39528f0` (the plate now) and `35fc0e3c` (`usable:false`, closer). Real-sized bear on the walkway by the 79th St kiosk, shadow on the concrete, photo otherwise untouched. Posted. |
| The bear still animated (the moving plate) | **DONE, judged PASS** — ledger row 49 | "Animate the plate" on c047 with the bear-held-in-place event: job `b32ba7e3` → asset `89c15864` (5.04 s, `plate_motion.still_asset_id c39528f0`). Bear holds scale and place, turns its head; traffic and a bus move; camera locked. Posted with crops at frames 0/60/119. |
| c047 composited over the bear plate | **PRESSED 06:30 UTC** — fill in below from real output | driver `composite` on c047; the plan's plate is `c39528f0` (newest usable still of the scene), its moving plate `89c15864`. |
| **Montage press** (code) | **CODED, pushed** `a1f4833` — **not LIVE** | `src/lib/storyboard/montage.ts` (+test 7), `restage.ts` variant + `preferDressed` (+2 tests), `worldBatch/dialect.ts` + `runner.ts` (`alternate`, `variant`), `_shared/jobProgress.ts` alternate → unselected (+1 test), controller `montageShot`, FocusView **Montage** button (`focus-montage`, `confirm-montage`, `confirm-montage-dryrun`, `confirm-montage-scenes`), driver press `montage`, README. `tsc` clean. |
| `switchx-background-proxy` enum fix (Beeble benchmark) | **CODED, pushed** `657cba0` + `6b4a536` — **not LIVE** | VERIFIED cause of `job_record_failed`: `provider_jobs.provider` is the `provider_name` enum; "beeble" is not in it. Row now `other` + `vendor: "beeble"`. Test pins the value to the enum. |
| PR #276 reviews | **Self-review posted** (security + architecture, both APPROVE) | The independent reviewer agent was stopped by a session interruption before it posted; the review comment on the PR says so. A later session may add an independent review; nothing in the code waits on it. |
| PR #276 merge | **NOT DONE at the time of writing** | CI `verify` was green on `6b4a536`; it runs again on `0836fdb`. Merge = un-draft, squash, then the deploy steps below. |

## Deploy — what makes it live (none of it done yet)

1. **Merge PR #276** (squash). Note the squash SHA.
2. **Lovable → Edge Functions → redeploy** on AVT (project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8`), **DEPLOY ONLY**, from the squash SHA:
   - `provider-jobs-tick` (bundles `_shared/jobProgress.ts` — the alternate filing). Verify: unsigned `POST {}` → `401` from the function's own code (not `404`); the agent's `source_sha256` of `_shared/jobProgress.ts` must match `sha256sum supabase/functions/_shared/jobProgress.ts` at the squash SHA.
   - `switchx-background-proxy` (the enum fix). Verify: `python3 -I <scratchpad>/tools/switchx_bg.py submit f540b6be-5e1d-40b5-861e-6c5c08e03a96 b58cab47-b055-4bdd-846a-d288870de312` → **`200 {"status":"queued", …}`** (was `500 job_record_failed`). A `409 switchx_in_flight` means a row already exists — read it, do not resubmit.
3. **Lovable Publish** for the frontend, only after `get_project.latest_commit_sha` equals the squash SHA. Verify in the live bundle (`curl --compressed`, follow `index-*.js` → `projects._id.storyboard-*.js` → its `./x.js` imports): the string `focus-montage` is present, and `montage-v1-2026-10-16`.

## The montage run (after deploy)

Dry run first, then the real press, c047 first:

```
node scripts/agent-browser/avt-press.mjs montage --dry-run --session <scratchpad>/agent-browser-session.json \
  --chrome <scratchpad>/cft/chrome-linux64/chrome --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
  --variation 358363e6-33ba-48e0-bd88-e80b57ac6b3c --shot c047
```

The dry run's console record must show `source.dressed: true`, `source.take: f540b6be…`, `place: …/worlds/plate_79th_lafayette_bear_mvakt7g9_1.png`, `seconds: 5`, five scenes covering 0–5 s, and an `angle` beginning "a fast-cut montage in the place of @Image1, shot like news footage: shaky handheld camerawork, quick optical zooms, 35mm film grain…" followed by "Show in order, in seconds from the first frame:" and five dashes. Then the real press (~$2.36 at 720p, 5 s). The result is filed as a performance take **unselected** on c047 (`provider_jobs.request_payload_json.settings.alternate = true`, batchShotId `c047_montage`). Judge: his face, the YSL jacket and the lip sync on the him-on-screen windows; the bear the same animal as the plate; the cutaways real. Fallback (no code): the same scenes as two presses with explicit windows, cut together in the edit.

Then the other four (c041, c044, c045, c046) the same way, each with its own plate (their scene is the same: the bear plate serves all five). Ledger rows for each; post every result.

## Beeble SwitchX benchmark (after the proxy redeploy)

`switchx_bg.py submit <c047 dressed f540b6be…> <plate b58cab47…>` → `status <jobId>` until `succeeded` → download the render → side by side with the v2 composite `93b9b968` (same take, same place) → post both → ledger row (Beeble 720p: 119 frames × $0.10/30 ≈ $0.40 list). Judge: identity, the jacket, the edge, the relighting, and the cost against the composite's $0.089 matte.

## Guardrails

- Never mark anything above verified from an agent's claim; `401` vs `404`, the bundle string, the `200 queued` are the proofs.
- Do not switch the plate back to the bear-less still unless Fendi says so: `35fc0e3c` and `b58cab47` stay usable stills of the scene but `c39528f0` is newest, so it is the one every composite and montage picks; to change that, set `usable:false` on it (metadata) rather than deleting anything.
- Never overwrite or unselect a selected clip; the montage lane files alternates only.
- Repo is public: no media of Fendi, no song, in the repo. Session file only in the scratchpad.

## What to report back

The squash SHA; the two `source_sha256` values from the Lovable agent and whether they match; the `401`/`200` proofs; the bundle string check; the montage dry-run record; the montage job id, asset id and the judged result with frames; the Beeble job id and side-by-side; ledger rows added.
