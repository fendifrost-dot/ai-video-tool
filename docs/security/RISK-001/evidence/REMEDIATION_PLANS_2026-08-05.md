# Remediation Plans — AVT Video-Swap Pipeline Audit

All items are **`[RECOMMENDATION]`** — no fix code/migration is authored here. Effort is engineering-days for one competent contributor. "Owner" uses roles (assign to real people); this repo is solo-maintained (fendifrost), so all default to the maintainer unless delegated. Deploy path is the Lovable flow from `AVT_POST_DEPLOY_CHECKLIST.md` (SQL editor for migrations; redeploy each touched edge fn; Publish frontend).

Priority order: **P0** SEC-1 → **P0** SEC-2/SEC-3 → **P1** no-CI → **P1** Lane A → **P1** PR#16 FIX2 → **P2** durability → **P2** PR#15.

---

## R1 — SEC-1 · Anon-open RLS on identity/wardrobe tables + look-composites (P0)

- **Risk:** Any holder of the public anon key can read/write/delete every tenant's `artists`, `character_features`, `artist_looks`, `location_library`, `prop_library` and all `look-composites` objects — including `artists.identity_profile_json` (LoRA URL/training). Cross-tenant data theft + identity poisoning. Live exposure unconfirmed (dashboard-only).
- **Root cause:** DEV-ONLY migration `20260523171003_*.sql` (`USING(true) WITH CHECK(true)` for `anon`) committed to the production-track migration dir and never reverted; underlying driver is Lovable **anonymous-auth `user_id` churn** that made owner-scoped policies lock users out of their own rows.
- **Recommended fix:** (1) resolve the anon-auth identity model so a **stable `user_id`** exists; (2) restore owner-scoped `user_id = auth.uid()` policies on all 5 tables + owner-folder-prefix policies on `look-composites` (spec in `RLS_FORENSIC_P0_2026-08-05.md §6`). Do NOT re-open RLS as a shortcut.
- **Estimated effort:** 0.5 day for the RLS restore; **1–3 days if** the anon-auth model must be redesigned first (the real cost).
- **Migration path:** new forward migration in `supabase/migrations/` applied via Lovable SQL editor; verify with the `pg_policies` queries (§6.4) before/after. No edge redeploy needed (DB-only).
- **Rollback strategy:** keep the exact `USING(true)` policy text; a one-statement re-apply restores the open state if the lock-down breaks auth. Stage on a throwaway/anon session first.
- **Tests required:** RLS integration test per table (owner sees only own rows; a second user/anon sees none; anon cannot INSERT/DELETE); storage policy test for `look-composites`. None exist today — add them.
- **Owner:** DB/Lovable maintainer.
- **Definition of done:** `pg_policies` shows zero `qual='true'`/`roles={anon}` rows for the 6 objects on the **live** DB; RLS tests pass; app still functions for a real logged-in user; forensic verification queries re-run clean.

---

## R2 — SEC-2 · Unauthenticated `train-style-lora-proxy` (paid-job + artist write) (P0)

- **Risk:** Anyone can trigger unbounded **paid** Fal LoRA training (cost/DoS), overwrite any artist's training state, and feed an attacker `zip_url` into CC/Fal — all with no auth.
- **Root cause:** `verify_jwt=false` (config.toml:17-18) **and** no in-code `getUser`/proxy-secret check; goes straight to service-role `artists` UPDATE + CC call.
- **Recommended fix:** require an authenticated caller (`getUser`) **and** verify artist ownership (`artist.user_id === userId`) before any write/dispatch; OR, if it must stay callback-like, require a constant-time inbound proxy secret. Bound/queue paid dispatches per user.
- **Estimated effort:** 0.5 day.
- **Migration path:** edit `supabase/functions/train-style-lora-proxy/index.ts`; set `verify_jwt=true` in `config.toml`; **redeploy the function** in Lovable.
- **Rollback strategy:** revert the function + config change and redeploy; behavior returns to prior (open) state.
- **Tests required:** unit tests — unauth request → 401; wrong-owner `artist_id` → 403; happy path with a valid owner. Add a mocked-CC integration test.
- **Owner:** Edge-functions maintainer.
- **Definition of done:** function rejects unauth/cross-tenant callers on the live deploy; no anon path can start a paid job; tests pass.

---

## R3 — SEC-3 · `train-style-lora-callback` Fal branch requires no secret (identity poisoning) (P0)

- **Risk:** Anyone can POST `?artist_id=<id>` with a Fal-shaped body and write an attacker-controlled LoRA URL into `artists.identity_profile_json.lora.url` via service role → persistent identity poisoning of any artist.
- **Root cause:** X-Proxy-Secret enforced only in the legacy branch; the Fal branch is auto-selected by attacker-controllable body fields (`gateway_request_id`/`status`). Comment "we trust Fal because only Fal knows the artist_id" is false (artist_id is a non-secret id; SEC-1 leaks it).
- **Recommended fix:** enforce a shared secret / HMAC on **all** branches (Fal webhook signature if available, else a required `X-Proxy-Secret` on the CC→callback hop). Never branch auth off body content.
- **Estimated effort:** 0.5 day.
- **Migration path:** edit `train-style-lora-callback/index.ts`; add the secret to Lovable edge secrets if new; **redeploy**.
- **Rollback strategy:** revert + redeploy.
- **Tests required:** unit — Fal-branch body without secret → 401; with valid secret → writes; malformed → rejected.
- **Owner:** Edge-functions maintainer.
- **Definition of done:** no unauthenticated body can mutate `identity_profile_json` on the live deploy; tests pass. (Fix alongside R1 — SEC-1 is what makes artist_id guessable.)

---

## R4 — No CI gate on the 563-test suite (P1, enabling control)

- **Risk:** "563 passing" is a local claim; nothing prevents a regression (or a security/RLS mistake, or the HDR defect) from reaching `main`. Amplifies every other finding.
- **Root cause:** no `.github/workflows/` — tests/lint/`deno check` run only on developer machines.
- **Recommended fix:** add a CI workflow running `vitest run`, `deno check`/`deno lint` on `_shared`, the Python `workers/` tests, and (later) an RLS/policy assertion; block merge on failure.
- **Estimated effort:** 0.5–1 day.
- **Migration path:** add `.github/workflows/ci.yml`; enable branch protection on `main` (GitHub settings — maintainer action, cannot be done from repo).
- **Rollback strategy:** delete the workflow / disable required-check; zero runtime impact.
- **Tests required:** the workflow *is* the test harness; verify it fails on a deliberately broken test.
- **Owner:** Maintainer (repo admin).
- **Definition of done:** PRs #15/#16 and future PRs show a required green check before merge; a red test blocks merge.

---

## R5 — Lane A (LOCKED default) ships inert (P1, product integrity)

- **Risk:** The advertised primary path produces no video; users hit "Lane A did not complete." The whole warp-worker effort exists to fill this and is unproven (PR #15).
- **Root cause:** `WARDROBE_PROP_ENGINE` defaults `disabled`; Fal hosts no dense-flow/warp endpoint, so no server-side propagation engine exists. (Honest by DESIGN — it blocks rather than fakes.)
- **Recommended fix (sequenced):** (a) make the UI state explicit that Lane A is not yet production-capable (don't default users into a blocking lane silently); (b) land a real GPU propagation worker (productionized PR #15 with real Kolors/Grok/SAM inputs) behind the existing `FlowMetrics` interface; (c) gate on the CLAUDE.md KILL-CRITERION on a real 121-frame sequence before promoting.
- **Estimated effort:** (a) 0.5 day; (b)+(c) multi-week (new GPU worker + durable queue, see R6).
- **Migration path:** (a) frontend edit + Publish; (b) new off-Fal worker service + wiring, separate from this repo's edge fns.
- **Rollback strategy:** (a) trivial revert; (b) keep `disabled` default so a failed engine falls back to honest blocking.
- **Tests required:** real-media benchmark (currently 0) proving no flicker + identity/construction hold; the kill-criterion as an explicit gate.
- **Owner:** Video-pipeline maintainer.
- **Definition of done:** either Lane A is clearly labeled non-production in the UI, OR a real engine passes the kill-criterion on the `wardrobe-swap-v1` benchmark with recorded metrics.

---

## R6 — PR #16 FIX 2 · three-way compatibility conflation / HDR over-gate (P1, correctness)

- **Risk:** Clips Fal demonstrably accepts (HDR 720p; arguably standalone 10-bit) are gated `incompatible → non_fal_transcode`, blocking valid work and contradicting the module's own tonemap contract.
- **Root cause:** binary gate (`needsProcessing = !compat.compatible`) with only three transports, none meaning "processable but quality-risk"; HDR treated as transport-block from theory, not a confirmed failed test.
- **Recommended fix:** introduce a third verdict tier — e.g. `quality_risk` (process on Fal via `fal_scale`, set a `qualityFlags:['hdr']` + warning) distinct from `non_fal_transcode`. Reserve `incompatible` for (a) proven-untransportable and (c) test-confirmed cases. Move HDR (and Fal-convertible 10-bit) into the quality-risk tier; keep the 4K-HEVC-master bundle as hard-incompatible. Split `assessProcessingCompatibility` factors into "transport-blocking" vs "quality-risk" sets.
- **Estimated effort:** 1 day (pure module + tests; callers already read the fields).
- **Migration path:** edit `_shared/videoPreflight.ts` on the PR #16 branch **before merge**; bump `COMPATIBILITY_VERSION cg1→cg2`; redeploy `wardrobe-video-frame-extract-proxy` + `make-scrub-proxy-proxy`.
- **Rollback strategy:** the version bump makes persisted decisions attributable; revert the module + redeploy to return to `cg1`.
- **Tests required:** add the missing cases — HDR **720p H.264** → compatible/quality-risk (matches the controlled test); standalone 10-bit 1080p → correct tier; assert transport on the existing HDR test (currently unasserted); keep 4K-HEVC-master → incompatible.
- **Owner:** Video-preflight maintainer.
- **Definition of done:** the controlled-test clip (HDR 720p) is NOT gated to `non_fal_transcode`; no plan is simultaneously "incompatible" and "passed through"; new tests pass; FIX 1 merges unchanged.

---

## R7 — Durability: fire-and-forget + no reaper + no cancel + swap fail-fast (P2)

- **Risk:** A killed `EdgeRuntime.waitUntil` isolate leaves jobs `"processing"` forever (no reaper); swap dies on the first bad frame with orphaned outputs; nothing can be cancelled; a double-dispatch clobbers `metadata_json`.
- **Root cause:** all lanes use `EdgeRuntime.waitUntil` (interim, not the durable queue the LOCKED arch mandates); swap never adopted the per-frame resume pattern; no stale-state reaper on `project_assets`; no cancel flag; no server-side dedup/lock.
- **Recommended fix:** (a) copy the propagate per-frame durable pattern into `wardrobe-video-swap-proxy` (per-frame status, skip-done, bounded retry **with backoff**); (b) add a stale-state reaper (cron) that fails rows stuck `"processing"` past a deadline — mirror `reap_stale_jacket_inpaints` for `project_assets` video statuses; (c) add a cancel flag checked in worker loops; (d) add a server-side in-flight guard / advisory lock keyed by session; (e) longer-term, replace `waitUntil` with a durable chunk queue.
- **Estimated effort:** (a) 1 day, (b) 0.5 day, (c) 0.5 day, (d) 0.5 day, (e) multi-day (couples with R5b).
- **Migration path:** edit the relevant edge fns + one new cron migration; redeploy each touched fn.
- **Rollback strategy:** per-item; the reaper cron and swap changes are independently revertible.
- **Tests required:** resume-after-crash integration (currently 0); duplicate-dispatch guard; reaper marks stale rows failed; cancel honored mid-run.
- **Owner:** Edge-functions / video-pipeline maintainer.
- **Definition of done:** a crashed swap resumes and skips done frames; a stuck row is auto-failed within the deadline; a second dispatch is rejected; a cancel stops the loop.

---

## R8 — PR #15 warp-worker: keep isolated, prove transfer before wiring (P2)

- **Risk:** Low today (not invocable in prod). The risk is *premature promotion* — treating the temporal-machinery prototype as architecture proof.
- **Root cause:** prototype uses source-frame stand-ins + heuristic masks + CPU DIS; real Kolors/Grok/SAM baselines are the missing inputs; the KILL-CRITERION is untested.
- **Recommended fix:** keep it under `workers/` unwired; supply real frozen Kolors geometry frames + real Grok garment anchors + real SAM masks; run the one-shot on a real occlusion window; compare against the Kolors baseline (fill the PENDING columns); only then decide RAFT/GMFlow + SAM productionization.
- **Estimated effort:** research-bounded; 3–5 days to assemble real inputs and run, excluding GPU-worker productionization (R5b).
- **Migration path:** none to prod; work stays in the branch/`workers/`.
- **Rollback strategy:** N/A (isolated).
- **Tests required:** the real-media benchmark + kill-criterion metrics (identity, construction, stripe/logo, flicker) with real inputs.
- **Owner:** Video-pipeline / research maintainer.
- **Definition of done:** a QA report with **no PENDING columns** showing the real transfer holds identity + jacket construction + stripe/logo without flicker — or a documented decision to change approach. **Not merged as more than a prototype** until then.

---

### Cross-cutting note
R1+R2+R3 should ship together (SEC-1 is what makes the artist_id in R2/R3 guessable). R4 (CI) should land first so the security fixes can't silently regress. R6 must land **on the PR #16 branch before merge**, not after.
