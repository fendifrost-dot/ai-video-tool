# RISK_REGISTER.md — AI Video Tool (AVT)

> Standing register of known risks. **Updated by every audit** alongside
> [`SECURITY.md`](SECURITY.md). Each entry: id, title, severity, confidence, status,
> owner, and a pointer to where the detail/remediation lives. The forensic narrative
> for security items is the pre-API audit report, [`docs/audit_pre_api.md`](docs/audit_pre_api.md).
>
> **Severity:** Critical / High / Medium / Low · **Confidence:** Confirmed / Likely /
> Suspected · **Status:** Open / In-remediation / Mitigated / Closed.

Last reviewed: **2026-09-16** (Lane D2 reconstruct video QA PASS 15/15 on 720×1280 unique-RGB; Lane C2 full-clip temporal QA 241-frame stand-in / TEMPORAL-2; Lane C2 chunked ≤24-frame proxy QA / TEMPORAL-3; Lane R REL-2 notes-vs-flag YELLOW; real-media locks UNCLAIMED — issue #115; Lane H playable 720×1280 MP4 — issue #111; live Hero Frame export after PR #133 Publish 2026-09-16 ~2:05 AM CT: E2 **PASS 3/9** `fail=0` `frames=8` WebCodecs sample of the 72-frame gate; **code default now 72** with abort/OOM/timeout fallback — live click after Publish of that change not yet recorded; 241/1080 / 2nd-clip Export still not claimed; live camera pixels of `76fe7438` still not claimed).

| id | Title | Severity | Confidence | Status | Owner |
|----|-------|----------|-----------|--------|-------|
| [RISK-001](#risk-001--anonymous-rls--bucket-exposure) | Anonymous RLS / bucket exposure | Critical | Confirmed | **In-remediation** (Part A **tables applied** 2026-08-27; `look-composites` bucket still open until Part B policy) | Platform / Products (AVT) |
| [RISK-002](#risk-002--identity--storage-ownership-architecture) | Identity **+ storage-ownership** architecture (files coupled to disposable anon-UID paths) | High | Confirmed | Open | Platform (AVT) |
| [STOR-1](#stor-1--look-composites-uid-path-strand) | `look-composites` UID-path strand | Critical | Confirmed | **In-remediation** (Phase 1 copy+verify DONE; Phase B `artist_looks` ref-switch DONE; **bucket policy still open**) | Platform (AVT) |
| [STOR-2](#stor-2--project-references-uid-path-strand) | `project-references` UID-path strand | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [STOR-3](#stor-3--project-clips-uid-path-strand) | `project-clips` UID-path strand | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [STOR-4](#stor-4--other-uid-path-encoded-buckets) | Other UID-path buckets (`wardrobe-refs`, `style-references`, `project-exports`, `product-assets`, `artist-assets`) + named-unconfirmed (`hero-frames`, `face-reference`) | High | Confirmed | Open (inventory pending) | Platform (AVT) |
| [SEC-2](#sec-2--unauthenticated-training-endpoint) | Unauthenticated training endpoint | High | Likely | Open | Platform (AVT) |
| [SEC-3](#sec-3--lora--asset-poisoning) | LoRA / asset poisoning | High | Suspected | Open | Products (AVT) |
| [ARCH-1](#arch-1--lane-a-propagation-inert) | Lane A propagation inert (production hole) | Medium | Confirmed | Open | Products (AVT) |
| [OPS-1](#ops-1--no-ci-gate) | No CI gate on tests | Medium | Confirmed | Open | Platform (AVT) |
| [OPS-2](#ops-2--no-job-reaper) | No reaper for stuck/orphaned jobs | Medium | Likely | Open | Platform (AVT) |
| [REL-1](#rel-1--pr16-compat-gate) | PR #16 preflight compatibility gate unmerged | Low | Confirmed | **Closed** (superseded by PR #19, merged 2026-08-18) | Products (AVT) |
| [REL-2](#rel-2--lane-c-notes-copy-vs-product-temporal-tracking-flag) | Lane C deploy-notes `heroFrameOwnerFlip.current=false` vs product `temporalTrackingEnabled=true` | Low | Confirmed | Open (docs-only YELLOW; not an auth-path fail) | Products (AVT) / Lane C |
| [VOICE-1](#voice-1--grok-voice-director-spend-surface) | Voice Director STT/TTS/text spend + mic | Medium | Likely | Open | Products (AVT) |
| [PIPELINE-1](#pipeline-1--orchestration-scaffolding-is-not-a-durable-queue) | Pipeline OS scaffolding is in-process only (no durable queue / reaper) | Medium | Confirmed | Open | Products (AVT) / Lane G |
| [SLEEVE-1](#sleeve-1--visible-upper-arm-only-must-not-be-read-as-armholecuff) | Sleeve still repair is visible-upper-arm only; a pass must not be read as armhole→cuff | Medium | Confirmed | Open | Products (AVT) / Lane B |
| [TEMPORAL-1](#temporal-1--live-arm-without-hero-frame-tracking) | Temporal lib armed; Hero Frame tracking on (#90); §7 Run control (#94/#95); **click smoke SUCCESS** (`paidCalls=false`, 3 jobs) | Medium | Confirmed | **In-remediation** (click path proven; live footage not claimed) | Products (AVT) / Hero Frame + Lane C |
| [TEMPORAL-2](#temporal-2--full-clip-video-qa-without-raising-proxy-maxframes) | Full-clip temporal QA without raising proxy `maxFrames=24` (Lane C2 / #107) | Low | Confirmed | **Monitoring** (241-frame in-lib stand-in; live 1080×1920 not claimed) | Products (AVT) / Lane C2 |
| [TEMPORAL-3](#temporal-3--chunked-proxy-windows-without-raising-maxframes) | Chunked ≤24-frame proxy QA without raising `maxFrames` (Lane C2 / #124) | Low | Confirmed | **Monitoring** (stationary stitch GREEN; translating seams YELLOW) | Products (AVT) / Lane C2 |
| [RECONSTRUCT-1](#reconstruct-1--gate-4-wiring-without-live-sam-3--new-edge) | Gate 4 wiring without live SAM-3 / new edge; E2E $0 click PASS 9/9 (`frames=5`); **D2 unique-RGB 720×1280 PASS 15/15** | Medium | Confirmed | **In-remediation** (720×1280 unique-RGB claimed; live `76fe7438` camera / SAM-3 / MP4 not claimed) | Products (AVT) / Lane D |
| [PLAYABLE-1](#playable-1--7201280-reconstructed-mp4-without-paid-generation) | First playable Architecture C reconstructed MP4 at 720×1280 | Medium | Confirmed | **In-remediation** | Products (AVT) / Lane H |

---

## RISK-001 — Anonymous RLS / bucket exposure

- **Severity:** Critical · **Confidence:** Confirmed · **Status:** In-remediation
  (**Part A tables applied 2026-08-27** via Lovable SQL — owner-scoped RLS restored
  on `artists`, `character_features`, `location_library`, `prop_library`,
  `artist_looks`. Live inventory confirmed the drop list: `*_anon_all`,
  `*_open_test`, `single_tenant_all`. Go/no-go: 1 durable owner
  `3ca10935-…`, 0 table rows would strand. **`look-composites` bucket still
  open** until Part B policy — copy+checksum and `artist_looks` ref-switch
  already done.) ·
  **Owner:** Platform / Products (AVT)
- **Summary:** Any anonymous (`anon`) caller can read, write, and delete real user
  data across several core tables and the `look-composites` storage bucket.
- **Root cause:** Migration `supabase/migrations/20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql`
  (dated **2026-05-23**, header: *"DEV ONLY … Revert before production"*) dropped the
  owner-scoped policies and created `FOR ALL TO anon, authenticated USING (true)
  WITH CHECK (true)` on `public.artists`, `public.character_features`,
  `public.location_library`, `public.prop_library`, `public.artist_looks`, and opened
  the **`look-composites`** bucket to `anon` for `SELECT / INSERT / UPDATE / DELETE`.
  **No subsequent migration reverts it.** The 2026-08-06 live audit further found
  **out-of-band `*_open_test` and `single_tenant_all` policies** on all five tables
  (not present as committed migrations) — the live surface is *more* open than the
  culprit migration; the revert must drop these too.
- **Impact:** Full loss of per-user isolation on identity/wardrobe data + rendered
  composites: cross-tenant read, tamper, and delete by an unauthenticated client.
- **Definition of Done:** an `anon` client **cannot read or write any protected row
  or object** — the five tables and the `look-composites` bucket are back to
  owner-scoped RLS, and the dev-only migration is reverted by a paired migration.
- **Apply gate (added 2026-08-06):** the live identity audit classifies this **Tier 3
  — High (widespread UID drift)**: one logical operator's data is split across 21 owner
  identities (1 durable + 20 anonymous). Applying the revert *before* consolidating
  identity would strand ~90–95% of the operator's own data. **Decision: ⚠ Apply after
  identity stabilization.** Consolidate legacy anon UIDs into the durable account
  first; never re-open RLS to compensate.
- **Validation:** **RLS integration tests** that drive an `anon` Supabase client and
  assert denial on each affected table + the bucket (currently-empty test category —
  see [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md)).
- **Remediation ownership:** handled as a **forensic report + targeted revert
  migration**; this register tracks status only. **Do not "fix" it in docs.**

---

## RISK-002 — Identity + storage-ownership architecture

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open · **Owner:** Platform (AVT)
- **Redefinition (2026-08-08):** RISK-002 is **no longer just database identity
  durability** — it is an **identity + storage-ownership architecture** issue. Ownership
  is encoded in **two** coupled places: (a) `user_id` columns in Postgres, and (b) the
  **first path segment of storage object keys** (`{uid}/…`) across *every* user bucket,
  whose RLS authorizes on `(storage.foldername(name))[1] = auth.uid()::text`. Because
  files are keyed by a **disposable anonymous UID**, a DB-only identity fix (like the
  2026-08-08 consolidation) re-owns rows but **leaves the files stranded** under dead
  UID prefixes. **Any future identity fix must not leave storage permanently coupled to
  anonymous UIDs** — it must either preserve `auth.uid()` (anonymous→authenticated
  *upgrade*, so paths stay valid) or carry a storage re-key as a first-class part of the
  migration. Per-bucket strands are now tracked as STOR-1…STOR-4 below.
- **Not a blocker for PR #17.** RISK-002 is the *long-term* identity+storage architecture.
  The *short-term* gate on PR #17 is the one-time consolidation described in RISK-001's
  apply gate and in the Identity Health Report — that consolidation (DB) **plus** the
  per-bucket storage re-key (STOR-*), not this roadmap, is what unblocks the RLS restore.
- **Summary:** AVT identity is an **anonymous, per-device `auth.uid()`** persisted only
  in the browser's `localStorage` (`supabase.auth.signInAnonymously()`,
  `src/routes/__root.tsx`). There is no durable account binding for the operator's
  work: clearing cache, switching browsers/devices, or an expired anon session mints a
  **new** `auth.uid()` that no longer owns the rows **or the storage paths** created
  under the old one. Today the open RLS (RISK-001) masks this by showing every session
  all rows/objects; once RLS is restored, drifted identity surfaces as apparent data
  loss **and unreadable files**.
- **Evidence (2026-08-06 live audit,
  [`docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md`](docs/security/RISK-001/IDENTITY_HEALTH_REPORT.md)):**
  208 auth users, **207 anonymous / 1 durable**; one logical user's data fragmented
  across **21** owner identities; overall identity-durability health **26/100 (Poor)**;
  referential integrity clean (0 orphans / 0 NULL owners / 0 dangling refs).
- **Open questions to answer next milestone (the RISK-002 roadmap):**
  1. What happens when a user **clears browser cache / `localStorage`** — is their work
     recoverable, and how?
  2. What happens when a user **changes devices or browsers** — how does the same human
     reach the data they created elsewhere?
  3. What happens when the **anonymous session expires / is not refreshed**?
  4. How does a user **recover ownership** of projects created under a prior anon UID?
  5. How do we **migrate** the existing 20 legacy anon identities to durable ownership
     without data loss (the one-time consolidation), and prevent new drift?
- **Intended direction (to be ratified):** transition from anonymous per-device identity
  to **durable identity via an anonymous→authenticated *upgrade path*** — link each
  anonymous session to a permanent credential (email / OAuth) using Supabase identity
  linking, which **preserves `auth.uid()`** so existing rows stay owned, and adds
  cross-device account recovery without forcing sign-in friction on first touch.
  See the Identity Health Report §5 for the full rationale and the alternatives
  considered (continue-anonymous-for-beta / mandatory-sign-in / device-binding+recovery
  / hybrid).
- **DoD (target):** a durable identity model is in place; a user can recover their work
  after cache-clear / device-change; no new per-device UID drift is created; the legacy
  anon UIDs are consolidated; and RLS remains owner-scoped throughout (identity is fixed
  **with** the auth model, never by weakening RLS).

---

## Storage-ownership risks (path-prefix-encoded buckets)

> Discovered 2026-08-08 during RISK-001 Part B. Every user bucket keys objects as
> `{uid}/…` and authorizes via `(storage.foldername(name))[1] = auth.uid()::text`.
> Legacy anonymous UIDs therefore strand objects exactly as `look-composites` did.
> **Cross-cutting rule — no owner-scoped bucket policy is tightened until that bucket
> completes its own inventory + verified re-key** (copy → checksum → reference-update →
> readable-as-durable-account), mirroring the `look-composites` Part-B process. Object
> counts are the live read-only measurement; prefix keying scheme (`user_id` vs
> `artist_id` vs `project_id`) must be confirmed per bucket before its re-key.

### STOR-1 — `look-composites` UID-path strand

- **Severity:** Critical · **Confidence:** Confirmed · **Status:** In-remediation · **Owner:** Platform (AVT)
- **Summary:** 363 legacy-era objects, **314 under 15 legacy anon-UID prefixes** (49 already durable). This is the bucket in RISK-001's DoD.
- **Progress:** Part-B **Phase 1 (copy + checksum) COMPLETE** — 313/313 in-scope copied & sha256-verified. **Phase B `artist_looks` ref-switch COMPLETE** (156 rows, 0 legacy paths remaining in that table). **Bucket policy still open** (anon `look_composites_anon_*` + `look-composites_open_test` still live — Part B policy, not this apply). 1 held object (`864088d5…`). See [`STORAGE_REKEY_PHASE_B_RECONCILIATION.md`](docs/security/RISK-001/STORAGE_REKEY_PHASE_B_RECONCILIATION.md).
- **DoD:** 285 `artist_looks` references switched to target paths and reconciled to 0 legacy prefixes; all 313 readable as the durable account; **then** bucket policy tightened; legacy originals deleted only in a later gate.

### STOR-2 — `project-references` UID-path strand

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary:** 46 objects, **45 under 7 legacy anon-UID prefixes**, only 1 durable. Referenced by `provider_jobs.*_payload_json`, `project_assets.file_url`/`metadata_json` (signed URLs + bare paths). Includes `hero-frames/…` sub-paths (see STOR-4 note).
- **DoD:** inventory + manifest + collision + reference map, then copy→verify→ref-switch like STOR-1, before any `project-references` policy tightening.

### STOR-3 — `project-clips` UID-path strand

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary:** 46 objects, **39 under 9 legacy anon-UID prefixes**, 7 durable. Video clip artifacts — larger per-object; re-key must budget for size and any signed-URL caches held by in-flight render jobs.
- **DoD:** own inventory + verified re-key before policy tightening.

### STOR-4 — Other UID-path-encoded buckets (+ named-unconfirmed)

- **Severity:** High · **Confidence:** Confirmed · **Status:** Open (inventory pending) · **Owner:** Platform (AVT)
- **Summary (live counts, objects under legacy anon-UID prefixes / total):**
  `wardrobe-refs` 6/17 · `style-references` 47/47 *(keyed by `artist_id` `8d4a4d22`=Fendi Frost, which is target-owned — confirm keying scheme; may be mis-flagged)* · `project-exports` 9/9 · `product-assets` 7/7 · `artist-assets` 2/70.
- **Named in remediation scope but NOT confirmed populated:** `hero-frames` and `face-reference` returned empty on probe (the Storage `list` endpoint returns `[]` — not 404 — for non-existent buckets, so their existence is **unconfirmed**; `hero-frames` content actually appears as a folder *inside* `look-composites`/`project-references`). Confirm with a service-role bucket list before assuming coverage.
- **DoD:** per-bucket inventory confirming keying scheme + object counts; verified re-key for any bucket that is genuinely `user_id`-path-encoded; **no** owner-scoped policy tightening on any of these until each is individually cleared.

---

## SEC-2 — Unauthenticated training endpoint

- **Severity:** High · **Confidence:** Likely · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** A training/ingest edge path appears reachable without verifying caller
  identity, allowing unauthenticated invocation (data access and/or provider spend).
- **Pointer:** forensic detail to be recorded in [`docs/audit_pre_api.md`](docs/audit_pre_api.md);
  maps to threat **T2** in `SECURITY.md` §5.
- **DoD (target):** every training/ingest edge function verifies the caller's JWT and
  ownership before acting; no anonymous trigger of training or spend.

---

## SEC-3 — LoRA / asset poisoning

- **Severity:** High · **Confidence:** Suspected · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** Attacker-supplied training images or reference assets could corrupt
  identity LoRAs or inject unwanted content into the pipeline.
- **Pointer:** [`docs/audit_pre_api.md`](docs/audit_pre_api.md); threat **T3** in
  `SECURITY.md` §5.
- **DoD (target):** asset/LoRA ingestion is authenticated, provenance-checked, and
  validated before it can influence a model.

---

## ARCH-1 — Lane A propagation inert

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** The optical-flow propagation engine in `wardrobe-video-propagate-proxy`
  (`supabase/functions/_shared/propagation.ts`) is deliberately **disabled** — Fal
  hosts no dense-flow/warp endpoint, so the LOCKED architecture's propagation step
  has no production implementation. The gap is currently filled only by a **research
  prototype** (warp worker, PR #15), which is **not** invocable in prod.
- **Pointer:** [`docs/VIDEO_SWAP_ARCHITECTURE.md`](docs/VIDEO_SWAP_ARCHITECTURE.md);
  warp-worker reclassification (PR #15).
- **DoD (target):** a production propagation path exists (GPU worker w/ RAFT+SAM,
  wired into the app/CI) or the lane is explicitly descoped.

---

## OPS-1 — No CI gate

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** No CI workflow runs the test suite on push/PR; a red suite does not
  block merge, and empty test categories (provider-live, real-media, deploy-smoke,
  RLS integration) stay silently empty.
- **Pointer:** [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md) ("No CI gates these").
- **DoD (target):** CI runs the categorized suite (+ RLS integration tests once they
  exist) and blocks merge on failure.

---

## OPS-2 — No job reaper

- **Severity:** Medium · **Confidence:** Likely · **Status:** Open · **Owner:** Platform (AVT)
- **Summary:** No reaper/watchdog reliably reclaims stuck or orphaned async jobs
  (frame swaps, propagation chunks, provider polls), risking wedged state and wasted
  spend. Per-op watchdogs exist for specific flows but there is no general reaper.
- **Pointer:** to be detailed in the audit report / ops notes.
- **DoD (target):** a durable reaper transitions stale jobs to a terminal state with
  retry/resume, covering every long-running edge op.

---

## REL-1 — PR #16 compat gate

- **Severity:** Low · **Confidence:** Confirmed · **Status:** **Closed** · **Owner:** Products (AVT)
- **Summary:** The versioned video-preflight **compatibility** gate (media
  compatibility, asset-authoritative master metadata) landed via **PR #19**
  (`b964c67`, merged 2026-08-18), which superseded unmerged PR #16. The 10-bit
  factor in `assessProcessingCompatibility` was already correct; it was starved
  because `extractVideoMeta` did not read nested `media.format.pixel_format`.
  That feed is the remaining preflight parser fix (this landing queue / original
  PR #26).
- **Pointer:** PR #19 / `supabase/functions/_shared/videoPreflight.ts`; parser
  expansion in `_shared/frameExtract.ts`.
- **DoD:** met — gate merged; parser now maps Fal `media.format` into the
  existing 10-bit factor. HDR tags remain absent from this probe and are not
  inferred from `Main 10`.

---

## REL-2 — Lane C notes copy vs product temporal tracking flag

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Open (docs-only YELLOW) · **Owner:** Products (AVT) / **Lane C**
- **Summary:** Product Hero Frame `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` is **true** (PR #91 / #95). Lane C `TEMPORAL_LIVE_DEPLOY_NOTES.heroFrameOwnerFlip.current` remains **false**, and `src/lib/temporal/livePrep.test.ts` locks that notes field to false (collision policy: Lane C does not own the Hero Frame flag). Still-repair **edge mirror** of the flag is independently **false** (intentional — `architecture-c-still-repair-proxy` 500 guard). Auth/dispatch does **not** read the notes field; it uses `TEMPORAL_LIVE_ACTIVATION_ARMED` + product flag + `explicitArm`. This is copy/docs drift, not a click-smoke regression.
- **Pointer:** [`docs/regression/OWNERSHIP.md`](docs/regression/OWNERSHIP.md); [`docs/regression/SPRINT2_LANE_R_REPORT.md`](docs/regression/SPRINT2_LANE_R_REPORT.md); [`src/lib/temporal/livePrep.ts`](src/lib/temporal/livePrep.ts) (`heroFrameOwnerFlip.current`); [`src/lib/heroFrame/architectureCStillRepair.ts`](src/lib/heroFrame/architectureCStillRepair.ts).
- **DoD (target):** Lane C updates the notes copy (and Deno vendor) after ChatGPT YELLOW if they want docs parity — **or** explicitly documents that `current` means "Lane C did not flip the flag" rather than "product tracking is off." Lane R must **not** edit `livePrep.ts`.
- **Not this:** still-repair edge `temporalTrackingEnabled: false` stays; do not flip that mirror from this risk.

---

## VOICE-1 — Grok Voice Director spend surface

- **Severity:** Medium · **Confidence:** Likely · **Status:** Open · **Owner:** Products (AVT)
- **Summary:** Phase 1 Voice Director (`grok-voice-director-proxy`) adds a new
  xAI spend path (STT + Grok text + TTS) and a microphone surface. A stolen
  user JWT can burn voice budget. A leaked xAI hop must not be able to mutate
  AVT (Phase 1 is read-only). Transcripts must not be stored.
- **Pointer:** `docs/ux/brief_for_chatgpt_voice_director.md`;
  `supabase/functions/grok-voice-director-proxy/index.ts`.
- **Mitigations in prototype:** JWT + project ownership, origin allowlist,
  per-user turn budget, no writes, no transcript bucket, key stays on the edge.
- **Product authorization:** 2026-08-27 — landed as a kill-test (read-only tools
  only). Kill the feature if it is not used to ask “what happens after the second
  chorus?”
- **Open follow-ups (if the kill-test lives):** CSP tighten, Durable Objects
  for rate-limit consistency, session budget visible in the UI.
- **DoD (target):** kill the feature, or keep it with the mitigations above plus
  a visible session budget.

---

## PIPELINE-1 — Orchestration scaffolding is not a durable queue

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Products (AVT) / Lane G
- **Summary:** Lane G (#51 / G2 #109) adds an in-process pipeline state machine
  (`src/lib/pipeline`) with G2 lifecycle (`queued/running/passed/failed/blocked/retryable`),
  artifacts, provenance, stage version, consumed evaluator result, retry reason,
  kind-based handoff, and an unattended runner. It persists as a JSON document
  (`metadata_json.pipeline_run`, contract 1.1.0) only.
  There is still no durable worker, watchdog, or reaper. A browser tab close or
  edge isolate eviction can leave a run mid-stage. This does **not** close
  [OPS-2](#ops-2--no-job-reaper). G2 does not own MP4 encode (Lane H) or eval metrics (Lane E2).
- **Pointer:** [`docs/PIPELINE_PRODUCT_OS.md`](docs/PIPELINE_PRODUCT_OS.md);
  [`docs/PIPELINE_G2_UNATTENDED.md`](docs/PIPELINE_G2_UNATTENDED.md);
  `src/lib/pipeline/`.
- **Mitigations in scaffolding:** explicit statuses; import-from-lane resume;
  retry classification that refuses `needs_transcode` / missing inputs; generation
  is import-only (no paid Grok from this lane).
- **DoD (target):** a Lovable-managed durable `pipeline_runs` record + worker
  that resumes from last succeeded stage, plus a reaper that terminals stale
  `running`/`retrying` rows (joint with OPS-2). Class C sign-off required.

---

## SLEEVE-1 — Visible-upper-arm only must not be read as armhole→cuff

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** Open · **Owner:** Products (AVT) / Lane B
- **Summary:** Live `sleeve_panel` now paints through Lane B
  (`architecture_c_sleeve_still_1c`) on the Architecture C still path. Stage 1a
  (`fde270bf`) was NOT CLEARED 5/6 on FAIL #6 (cream/white fill). Stage 1b
  (`a4dc7f47`) was NOT CLEARED 5/6: left navy-ward PASS, right cream-majority
  warp over the already-dark V2 ring (luma 134→158). Live 1c (`fdb86b18`) is
  **CLEARED 6/6** — both visible quads drop luma navy-ward. The canonical pose is
  crossed arms for the entire clip. A geometry pass proves **visible upper-arm**
  repair only.
  `hiddenShoulderToCuffValidated` is always `false`. Treating a READY sleeve still
  as full armhole→cuff (or turning on temporal tracking) is a misread of the
  contract.
- **Pointer:** [`docs/sleeve-panel/SLEEVE_PANEL_MASK_GEOMETRY_CONTRACT.md`](docs/sleeve-panel/SLEEVE_PANEL_MASK_GEOMETRY_CONTRACT.md);
  [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md`](docs/sleeve-panel/LANE_B_SLEEVE_STILL_LIVE_WIRING.md);
  live score [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md`](docs/sleeve-panel/LANE_B_SLEEVE_STILL_1A_LIVE_RESULT_2026-09-15.md);
  live score [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_1B_LIVE_RESULT_2026-09-15.md`](docs/sleeve-panel/LANE_B_SLEEVE_STILL_1B_LIVE_RESULT_2026-09-15.md);
  live score [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md`](docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md).
- **Mitigations:** live mask rejects tall/hidden quads; chest band is a reserved
  do-not-paint slot; metadata always records `visible_geometry_only`.
- **DoD (target):** human review of one $0 sleeve still on `2aa1a44c` / `9ed83c01`
  before any temporal lane is enabled. Class C sign-off required to change the
  claim.
- **Live (2026-09-16):** 1c `fdb86b18` **CLEARED 6/6** — identity + geometry + C5/C11/chest reserved PASS; visible navy-ward PASS on **both** sides (left 202.24→39.93 navyLike 22730/22794; right 133.56→39.96 navyLike 11104/11139). 1a `fde270bf` and 1b `a4dc7f47` remain historical NOT CLEARED 5/6. Sleeve paint stays locked. Score: [`docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md`](docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md).
- **Live 1c (evidence PR #86):** asset `fdb86b18` **CLEARED 6/6** is the temporal prerequisite. See TEMPORAL-1 for the arm.

---

## TEMPORAL-1 — Live arm without Hero Frame tracking

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** In-remediation · **Owner:** Products (AVT) / Hero Frame + Lane C
- **Summary:** `TEMPORAL_LIVE_ACTIVATION_ARMED` is `true` after chest 1m CLEARED 11/11 and sleeve 1c CLEARED 6/6. Isolated `temporal-propagate-proxy` is JWT-gated (`verify_jwt` + `getUser`), calls `authorizeTemporalEdgeRequest` then `propagateRepair`, and never calls Grok / Fal / CC. Hero Frame `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` is now **true** (#90 / #91). Product dispatch sets `explicitArm: true`. Hero Frame §7 **Run temporal propagate** (#94 / PR #95) is gated on `canDispatch` / armed / tracking. **Live click smoke SUCCESS** 2026-09-15 ~19:51 America/Chicago after frontend Publish of PR #95: signed-in owner, one click, `Dispatched 3 job(s). paidCalls=false grokPerFrame=false.`, no 401, no paid generation, no asset IDs in the toast. Still-repair edge mirror stays **false** so `architecture-c-still-repair-proxy` does not 500; still-repair hard-stop copy is sanitized so it cannot claim `temporalTrackingEnabled=false` when the product flag is true.
- **Pointer:** [`docs/temporal/LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`](docs/temporal/LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md); [`docs/temporal/LIVE_SMOKE.md`](docs/temporal/LIVE_SMOKE.md); [`docs/temporal/LIVE_PREP.md`](docs/temporal/LIVE_PREP.md); [`src/lib/heroFrame/temporalDispatch.ts`](src/lib/heroFrame/temporalDispatch.ts); [`src/lib/heroFrame/temporalRunControl.ts`](src/lib/heroFrame/temporalRunControl.ts); [`src/lib/temporal/livePrep.ts`](src/lib/temporal/livePrep.ts); [`supabase/functions/temporal-propagate-proxy/README.md`](supabase/functions/temporal-propagate-proxy/README.md).
- **DoD (target):** parent Lovable-redeploys **only** `temporal-propagate-proxy` (from #88); Hero Frame flag flip + §7 Run control are frontend-only (Publish); no still-repair edge redeploy; no per-frame Grok; no proxy-auth widen. **Click path:** SUCCESS (issue #96). Script `./scripts/temporal-live-smoke.sh` remains JWT-blocked on cloud VMs without `AVT_USER_ACCESS_TOKEN` (OPTIONS 200 / anon 401). **Not claimed:** live footage ingest / CLEARED. Reconstruct E2E $0 is recorded separately (RECONSTRUCT-1 / issue #100). **Notes-copy drift:** [REL-2](#rel-2--lane-c-notes-copy-vs-product-temporal-tracking-flag) (`heroFrameOwnerFlip.current=false` vs product tracking true) — owner Lane C; not an auth-path fail.
- **Mitigations:** compile-time arm + explicitArm; luma-only body caps; no service-role / CC secret on this function; still-repair edge flag remains false.

---

## TEMPORAL-2 — Full-clip video QA without raising proxy maxFrames

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Monitoring · **Owner:** Products (AVT) / Lane C2
- **Summary:** Lane C2 (#107) scores the **full canonical clip duration** (master `76fe7438`, 241 frames @ 59.94 fps, keyframe index 47) in-lib via `propagateRepair`. Metrics: drift / flicker / coverage / occlusion continuity + SAM-3-shaped mask continuity (`sam3LiveFetch=false`). Authenticated `temporal-propagate-proxy` dispatch stays regression-locked (`paidCalls=false`, `grokPerFrame=false`, `explicitArm`, **`maxFrames=24`**). A 241-frame wire clip is rejected at parse. Click-smoke SUCCESS (#96) is unchanged. Does not reopen chest 1m / sleeve 1c paint. Does not ingest live 1080×1920 pixels.
- **Pointer:** [`docs/temporal/VIDEO_QA.md`](docs/temporal/VIDEO_QA.md); [`src/lib/temporal/qa/`](src/lib/temporal/qa/); [`src/lib/temporal/fullClipFixture.ts`](src/lib/temporal/fullClipFixture.ts).
- **DoD (target):** unit/fixture proofs on 241 frames; JSON evidence `temporal-video-qa-v1`; dispatch lock tests (5-frame smoke still works; 241-frame POST still refused). **YELLOW:** raising `maxFrames` or live native ingest is a shared-contract / Class C decision — not this lane.
- **Mitigations:** measurement-only modules; synthetic luma stand-in; yellow contracts named in the JSON; Lane E2 consumes the schema rather than this lane editing eval core.

---

## TEMPORAL-3 — Chunked proxy windows without raising maxFrames

- **Severity:** Low · **Confidence:** Confirmed · **Status:** Monitoring · **Owner:** Products (AVT) / Lane C2
- **Summary:** Follow-on #124. GREEN helper splits a clip into ≤24-frame overlap-1 windows, reindexes seed to local 0, dispatches via the existing in-lib `temporal-propagate-proxy` adapter (`explicitArm`, `paidCalls=false`), and stitches global metrics. `maxFrames` stays **24**. Stationary 241-frame stitch covers the canonical clip; a second synthetic spec (72 frames @ 24 fps) proves portability. **YELLOW:** each window re-paints CLEARED still quads (no carried mask on the wire), so translating overlap seams drop IoU — chunking is insufficient for translated-mask continuity. Escalation is a shared-contract wire field, not a cap raise. No Lovable edits.
- **Pointer:** [`docs/temporal/VIDEO_QA.md`](docs/temporal/VIDEO_QA.md); [`src/lib/temporal/qa/chunking.ts`](src/lib/temporal/qa/chunking.ts); [`src/lib/temporal/qa/chunkDispatch.ts`](src/lib/temporal/qa/chunkDispatch.ts).
- **DoD (target):** unit proofs that every window ≤24, 241-frame stitch covers the clip, second-clip spec runs, translating seam YELLOW is named, `maxFrames` unchanged.
- **Mitigations:** planner refuses `maxFrames > 24`; 241-frame single POST still rejected; yellow tokens in JSON.

---

## RECONSTRUCT-1 — Gate 4 wiring without live SAM-3 / new edge

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** In-remediation (E2E $0 click **PASS 9/9** after PR #99 Publish; Lane D2 unique-RGB **720×1280 PASS 15/15** — issue #108; live `76fe7438` camera pixels / SAM-3 still not claimed) · **Owner:** Products (AVT) / Lane D
- **Summary:** Original-master live wiring (`RECONSTRUCT_LIVE_WIRING_ARMED = true`) composites CLEARED chest/sleeve stills + caller-supplied SAM-3 α + trusted temporal masks onto original master `76fe7438` via `reconstructOriginalMaster`. Dispatch / Hero Frame E2E still requires `explicitArm`. Hero Frame §7 **Run reconstruct E2E $0** (#98 / PR #99) POSTs `temporal-propagate-proxy` (`paidCalls=false`) then runs in-lib reconstruct + Lane E reconstruct-video eval. **Live click PASS** 2026-09-15 ~21:13 America/Chicago after frontend Publish of PR #99: signed-in owner, one click, `RECONSTRUCT-1 PASS 9/9 frames=5 paidCalls=false grokPerFrame=false.`, JSON `verdict=PASS` / `escalate=null` / `stillGoldensReopened=false`, no 401, no paid Grok. Lane D2 (#108) adds in-lib video QA on unique-RGB **720×1280** frames (8-frame native, 24-frame full-clip @ 24 fps, live-shaped 80×128 × 5 temporal jobs nearest-neighbor upsampled onto 720×1280 originals): **PASS 15/15**, `unauthorizedLeakCount=0`, Lane H MP4 provenance handoff without encoding. This lane does **not** fetch SAM-3 (`sam3-segment-proxy` / CC), does **not** add a JWT edge, and does **not** edit `logoComposite`, sleevePanel paint, or temporal authorize constants. A full inverted generated still cannot become the master when α === 0. Still goldens are not rescored.
- **Pointer:** [`docs/reconstruct/VIDEO_QA.md`](docs/reconstruct/VIDEO_QA.md); [`docs/reconstruct/video-qa/preservation-720x1280.json`](docs/reconstruct/video-qa/preservation-720x1280.json); [`docs/reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md`](docs/reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md); [`docs/reconstruct/E2E_LIVE.md`](docs/reconstruct/E2E_LIVE.md); [`docs/reconstruct/LIVE_WIRING.md`](docs/reconstruct/LIVE_WIRING.md); [`docs/LANE_D_ORIGINAL_MASTER_RECONSTRUCTION.md`](docs/LANE_D_ORIGINAL_MASTER_RECONSTRUCTION.md); [`docs/regression/REAL_MEDIA_LOCKS.md`](docs/regression/REAL_MEDIA_LOCKS.md); `src/lib/reconstruct/`; `src/lib/eval/reconstructVideoEvaluator.ts`.
- **DoD (target):** parent merges + Lovable frontend **Publish**; signed-in owner clicks **Run reconstruct E2E $0** on Hero Frame §7; capture PASS JSON (`paidCalls=false`). **Click path:** PASS 9/9 (issue #100). **D2 unique-RGB 720×1280:** PASS 15/15 (issue #108). Live camera ingest of `76fe7438` and live SAM-3 remain **not claimed** (later Class C; Lane R real-media placeholders stay **UNCLAIMED** — [`docs/regression/REAL_MEDIA_LOCKS.md`](docs/regression/REAL_MEDIA_LOCKS.md)). Lane H owns MP4 encode; reconstruct emits frame-RGBA + provenance only. Lane G may later bind `dispatchOriginalMasterReconstruct` after a human `masterCompositeAuthorized` review. Playable MP4 is Lane H / issue [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111).
- **Mitigations:** isolated module; `$0` fixtures; untrusted temporal frames ignored; no edge redeploy; `sam3.liveFetch` is always `false`; video eval never calls chest 11/11 / sleeve 6/6.

---

## PLAYABLE-1 — 720×1280 reconstructed MP4 without paid generation

- **Severity:** Medium · **Confidence:** Confirmed · **Status:** In-remediation · **Owner:** Products (AVT) / Lane H
- **Summary:** Isolated `src/lib/reconstruct/playable/**` composes the Architecture C 3.0 s window (72 frames @ 24 fps) at **720×1280**. Intended SAM-3 is Stage 1h evidence (`liveFetch=false`; size mismatch fails closed). Full-clip temporal **chunks ≤ `temporal-propagate-proxy` maxFrames=24** and stitches reconstruct (does not raise the cap; YELLOW `edge_max_frames_24_vs_canonical_241` stays). ffmpeg writes a playable H.264 MP4. After E2 PR #116, H calls `evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4))` and persists `videoQaReportToJson`. Encode-first `frames:[]` is INCOMPLETE (`awaiting decoded_frames`); `blockingArtifactProducer` is always false. **H-owned decode:** `decodeMp4.ts` (node/ffmpeg, PR #132) and `decodeMp4Browser.ts` (WebCodecs, PR #133) feed `evaluatePlayableVideoQa({ decodedFrames })` so E2 can score `frames>0` off the committed gate MP4. Node/tests can score the full 72-frame file. **Live WebCodecs default is now 72** (`LIVE_PLAYABLE_DECODE_MAX_FRAMES = CANONICAL_CLIP_FRAME_COUNT`); abort/OOM/timeout keep a partial sample or step 24→8 — never the 8-frame UI compose, never a false FAIL. Missing WebCodecs/bytes stay encode-first INCOMPLETE. Hero Frame §7 **Export playable reconstruct $0** still **composes** an 8-frame window. **Live re-verify (PASS sample):** 2026-09-16 ~2:05 AM America/Chicago after PR #133 merge `7dc04ad` + Lovable frontend Publish: verbatim toast `… PASS 3/9 fail=0 skip=6 frames=8 mp4=produced … browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 …`. **Claimed after Publish of the 72-frame default:** `frames=72` `fullDecode frames=72 source=72` (or documented fallback / INCOMPLETE). Gate MP4 sha256 `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b` unchanged. No Grok, no new edge, no paint edits.
- **Pointer:** [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md); [`docs/reconstruct/PLAYABLE_BROWSER_DECODE.md`](docs/reconstruct/PLAYABLE_BROWSER_DECODE.md); [`docs/reconstruct/PLAYABLE_DECODE.md`](docs/reconstruct/PLAYABLE_DECODE.md); [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](docs/reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md); [`docs/reconstruct/PLAYABLE_ARTIFACT.md`](docs/reconstruct/PLAYABLE_ARTIFACT.md); [`docs/reconstruct/PLAYABLE_PORTABILITY.md`](docs/reconstruct/PLAYABLE_PORTABILITY.md); `src/lib/reconstruct/playable/`; issue [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111); related [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129); browser decode [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133); sprint stretch [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102).
- **DoD (target):** playable MP4 + claims + E2 hook + `video-qa.json` committed; `npm run reconstruct:playable`; parent Publishes frontend only. **Live 8-frame click after #133 Publish:** PASS 3/9 `fail=0` `frames=8` `mp4=produced` `browserDecode=webcodecs` liveSample of the 72-frame gate (2026-09-16 ~2:05 AM CT). **Code default now 72** with abort/OOM/timeout fallback; live click of `frames=72` needs Publish of that change (not claimed here). **In-lib decode:** E2 `frames>0` off committed MP4 bytes (node/ffmpeg or injected rasters). **Not claimed:** live 241-frame/1080 ingest of master `76fe7438` (row is 1080×1920 HDR); live SAM-3 fetch; 2nd-clip live Export; raising edge `maxFrames`; CLEARED real-media gate. **2nd-clip stretch:** in-lib catalog bind for `ysl-ice-on-v2-edited-clip` / `f31bd0f2` — live Hero Frame Export on that clip is **NOT CLEARED**.
- **Mitigations:** reusable `PlayableClipSpec` + `catalogBind.ts`; fail-closed SAM-3; `paidCalls=false`; no eval/temporal-QA/pipeline/paint edits; `maxFrames=24` unchanged.
