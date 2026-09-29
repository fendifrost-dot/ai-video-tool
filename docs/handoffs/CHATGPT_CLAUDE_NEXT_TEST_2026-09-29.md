# CHATGPT → CLAUDE — YSL REAL VIDEO #1 NEXT TEST

**Prepared:** 2026-09-29
**Repo:** `fendifrost-dot/ai-video-tool`
**Baseline inspected:** `main` @ `b1a3c43a75f58e26b74ccf745784c8540fcbfc68`
**Claude handoff baseline:** rev 38 / section v20
**Project:** YSL / Ice On · `764a63d2-93cd-44f3-905f-292f14ab2f51`

## EXECUTION MODE — AUTONOMOUS, NO BABYSITTING

This is an execution directive, not a request for another plan.

**Do not stop to ask Fendi questions on GREEN or YELLOW issues. Do not ask for permission to make ordinary engineering, QA, provider, repair, reroll, merge, deploy, or implementation decisions. Investigate, choose the best bounded option, execute it, measure it, document it, and continue.**

You may stop only for a genuine **CODE RED** that requires Fendi's direct hands or an irreversible owner decision:

1. credential/account/MFA/access is required and cannot be obtained through the already-authorized environment;
2. an irreversible/destructive production action is required;
3. a material security/trust-boundary change is required;
4. continuing would exceed the authorized **$50 YSL testing budget**;
5. the canonical treatment contains a genuinely unresolved material creative contradiction that cannot be resolved from existing project evidence; or
6. a demonstrated architectural dead end prevents completion of this test after the bounded fallback ladder below is exhausted.

Routine provider failures, 4xx/5xx responses, expired JWTs, build failures, redeploys, bad generations, QA failures, retries, deterministic repairs, branch/merge work, stale docs, missing local derivatives, or implementation choices are **not CODE RED**. Fix them and continue.

When you encounter a defect, do not return it to Fendi as a question. Classify its owner, run the smallest discriminating test, fix the general mechanism when justified, reassemble, QA, and continue.

---

## 1. VERIFIED STARTING STATE

Read these before touching production:

- `docs/handoffs/CLAUDE_LATEST.md` — rev 38 is authoritative.
- `docs/LEDGER_YSL_TESTING_BUDGET.md` — authoritative spend ledger.
- `docs/SYNC_SONG_PERFORMANCE.md`
- `docs/sync/ysl-ice-on.performance-sync.json`
- `src/lib/sync/performanceSync.ts`
- `docs/treatments/ysl-ice-on.treatment.json`
- `docs/treatments/ysl-ice-on.looks.json`
- `docs/treatments/ysl-ice-on.shotspecs.json`
- `docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json`
- latest YSL results doc under `docs/research/results/2026-09-20-ysl-real-video-1/`.

Current production proof is **v20, bars 24–46**, 43.279 s. Sync is measured: **122.00 BPM**, `song = performance/master + 0.8538 s`. Current YSL budget state is **$21.57 used / $28.43 remaining**.

v20 already proved a lot. Do **not** reopen solved work for its own sake. In particular:

- S09 cuff colour is repaired.
- S08 construction is a known provider/mechanism ceiling with the current set: E1 ×5, Aleph, Omni, pose-locked stills, propagation, source conditioning, and masked+anchor have been measured. Do not burn money repeating those same S08 experiments.
- S06 collar interior is generator-side absent a reliable fold-line model.
- S06 shoulder matte belongs to the parallel matte workstream; do not duplicate that lane unless its completed artifact has landed and must be integrated.

The point of this round is no longer to micro-polish the same 43 seconds indefinitely.

---

## 2. NEXT TEST — GENERALIZATION / SCALE PILOT

Build the **next contiguous 16 musical bars after the proven section: bars 46–62**.

At the measured 122 BPM this is approximately:

- song clock: **90.492 s → 121.967 s**
- duration: **31.475 s**
- performance/master source clock: approximately **89.638 s → 121.113 s**, subject to the canonical sync helpers rather than hand-entered offsets.

Treat those numbers as a cross-check. **Use the repo's sync/grid functions as authority.**

### Test question

Can the hardened AVT pipeline take a *new, untouched contiguous section* from canonical treatment + real performance + album master to a coherent release-intent music-video section **without bespoke babysitting and without falling back into AI-animation/slideshow behavior?**

This is the durability test we actually need now.

### Why bars 46–62

It is long enough to expose cross-shot consistency, source-range cutting, wardrobe continuity, environment transformation, B-roll placement, edit rhythm, and treatment conformance, but short enough to diagnose and repair inside the remaining budget. It also forces the system to move beyond the exact bars 24–46 material that has accumulated many one-off repairs.

---

## 3. PRE-FLIGHT — FIX THE PLAN, NOT THE ARTIST

Before any paid call:

1. Derive a new section ShotSpec for bars 46–62 from the **canonical full treatment** and the measured 122 BPM grid. Do not copy the stale 140 BPM seed assumptions.
2. Resolve which canonical treatment section(s), Look(s), environment(s), transitions, performance/B-roll slots, and energy curve actually occupy bars 46–62. Preserve treatment intent; do not invent a new concept because it is easier to render.
3. Map every performance slot to the real master by the measured sync helper.
4. Confirm album-master audio is the assembly source of truth.
5. Build a cost estimate and ledger reservation before paid calls.
6. Reuse general mechanisms from v20. Do not cargo-cult shot-specific coordinates from bars 24–46 into new geometry.

If the old full-treatment timing disagrees with the measured musical grid, **the measured sync/grid wins for timing; the treatment wins for creative intent.** Record the reconciliation rather than asking Fendi.

---

## 4. PRODUCTION LAW

### Performance is the spine

Fendi's real performance remains the primary visual source. The test fails if it becomes a montage of generated inserts.

Every performance shot must remain recognizably the real performance: identity, pose, timing, lip performance and body motion preserved.

### Wardrobe must be ON Fendi

Use the current approved Look data, anchors, product references, reference ordering, construction constraints, material grading, wordmark/brand layer, zone repair and other general mechanisms where applicable.

Do not use still overlays as wardrobe. Do not substitute an independently generated performer. Do not promote Grok Imagine T2V to the hero lane.

### Environment transformation

The closet must stop reading as a closet according to the canonical treatment for this section. Preserve the real performer and transform the world around him using the established matte/composite path where it wins.

### B-roll

B-roll is tertiary seasoning and must serve the treatment/edit. Use existing real material first. Grok Imagine through Fendi's already-authorized browser account is available when it materially improves an insert or plate and saves paid API spend. Internally reject plastic/cartoon generations. B-roll must never become a workaround for a failed performance/wardrobe shot.

---

## 5. MECHANISM / FAILURE LADDER

For each new performance slot:

1. **Start with the current production mechanism that won on v20**, not an experimental provider simply because it is new.
2. Run deterministic QA against the correct Look/anchor/product truth.
3. If the generation fails, classify the failure: identity/anatomy, construction, material, branding, matte/composite, environment, temporal, edit/timing.
4. Try the cheapest mechanism that directly attacks that class.
5. Prefer a general deterministic repair when the underlying garment realisation is otherwise valid.
6. Use a bounded reroll only when the defect is generator-side and prior evidence says rerolls can vary that property.
7. Do not repeat a mechanism already proven incapable of changing the same defect class.
8. Provider timeout/error: preserve provenance, retry once when justified, then move to the next valid mechanism. Do not stop and ask Fendi.

If a new defect exposes a reusable AVT weakness, fix the general tool and add a regression test before continuing.

---

## 6. QA / REVIEW GATES

Do not send intermediate creative choices to Fendi.

Run the existing deterministic suite appropriate to the produced shots, including as applicable:

- sync/timeline/audio exactness;
- `native_media_qa.py`;
- `look_consistency.py`;
- `construction_score.py`;
- identity/anatomy/silhouette checks;
- wordmark/brand continuity;
- matte/background leakage;
- treatment slot coverage and B-roll ratio;
- provenance + paid-call ledger completeness.

Then assemble a **complete bars 46–62 candidate**.

Only after the complete candidate passes deterministic gates, run **one project-level Astra review** of the finished section against the canonical treatment. Astra is the director/continuity critic, not the generator. Give it the treatment, Look references, source/performance references, and enough sampled frames to judge wardrobe, identity, environment, transitions, edit rhythm and treatment conformance.

If Astra returns REPAIR_REQUIRED, do not report immediately. Parse the defects, repair all bounded GREEN/YELLOW items, reassemble, rerun deterministic QA, and use a targeted Astra re-review only where it can discriminate whether a material defect was actually fixed.

---

## 7. SPEND AUTHORITY

Project hard ceiling remains **$50 total**. Baseline is **$21.57 used / $28.43 remaining**.

For this bars 46–62 scale pilot:

- **soft target:** ≤ $7 new spend;
- **hard tranche ceiling:** **$10 new spend**;
- preserve at least $18.43 of total project headroom after this test unless a cheaper actual cost naturally leaves more.

You are authorized to make paid calls inside that tranche without asking Fendi each time. Ledger every paid call and failed billed call. Free browser-plan Grok Imagine usage should still be recorded as `$0` provenance where used.

Do not confuse OpenAI organization spend limit with project budget or API availability. An actual API/provider response is the authority on availability.

If the test cannot be completed inside the $10 tranche, stop buying calls, preserve all work, and return the evidence. Do not silently exceed it.

---

## 8. DEFINITION OF DONE

Do not return merely because a PR merged, a provider responded, a single shot passed, or a new tool was written.

Return when **one** of these conditions is true:

### A — SUCCESS
A complete bars 46–62 section exists with:
- album-master audio and exact song clock;
- real Fendi performance as the spine;
- wardrobe visibly on Fendi;
- identity/pose/lip performance preserved;
- treatment-correct environment transformation;
- B-roll in a subordinate role;
- deterministic QA passed or every exception explicitly measured and justified;
- Astra review completed;
- bounded Astra defects repaired and re-reviewed as needed;
- evidence/provenance/ledger committed;
- `CLAUDE_LATEST.md` updated with the new production state and exact next scaling decision.

### B — MEASURED LIMIT
A complete section exists but one or more material defects survive every bounded valid mechanism. Return the completed video plus a defect table showing mechanism attempted, measured result, cost and why the surviving issue is a true current ceiling.

### C — CODE RED
A genuine CODE RED as defined above prevents completion. Report only the specific owner action required, the exact blocked step, and the preserved recoverable state.

A yellow failure is not a return condition.

---

## 9. REPO HYGIENE

Work from current `main`; re-check it before edits in case another agent landed work after this handoff.

Commit general code, tests, ShotSpec/treatment derivative, evidence, results, ledger and handoff. Keep generated heavy media in the established output/storage path rather than bloating git. Merge normal non-destructive work according to the repo's current workflow; do not stop for routine merge approval.

Do not overwrite another active agent's ownership lane. If the S06 matte agent lands work while this test is running, inspect it and integrate only if relevant to the new section or to the canonical pipeline.

---

## 10. FINAL REPORT FORMAT

When the test is actually complete, report only:

1. **OUTPUT** — exact section, duration, output path/asset, resolution/fps.
2. **VERDICT** — SUCCESS / MEASURED LIMIT / CODE RED.
3. **WHAT GENERALIZED** — mechanisms that worked without shot-specific babysitting.
4. **WHAT BROKE** — new defects and their owners.
5. **WHAT YOU FIXED** — general AVT changes, not a play-by-play.
6. **ASTRA** — treatment/conformance/readiness verdict and repaired defects.
7. **SPEND** — tranche spend and total `$used / $50`.
8. **REPO** — final main SHA, tests, deploys if any, handoff revision.
9. **NEXT SCALING DECISION** — your evidence-based recommendation: another 16 bars, a larger contiguous block, or stop scaling because a specific mechanism ceiling makes more footage wasteful.

No filler. No permission questions after this directive unless CODE RED.

**Execute the test now and continue until A, B, or C.**
