# Claude Handoff — AVT catch-up session (2026-08-26 → 2026-08-27)

**Date:** 2026-08-27  
**Author:** Cursor (Grok 4.6 cloud agent)  
**Audience:** Claude Code — Fendi passed **Grok recap Phase 2** to you. Do **not** rebuild anything listed as landed.  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool (`main`)  
**Tip when this handoff was written:** `4b20d6b` (PR #31 merge). This file lands after that.  
**Live app:** https://aivideotool.lovable.app/  
**Lovable project:** `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` · backend ref `qoyxgnkvjukovkrvdaiq`  
**Durable account UID:** `3ca10935-8c3d-4479-9a0c-8bfe8050840c`  
**Artist root:** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Read first:**
- `docs/AGENT_BOOTSTRAP.md` + `.deployment/manifest.yml`
- `AVT_MEMORY_HANDOFF.md` (hard rules)
- This file (what Cursor just did)
- Grok recap only: `docs/research/GROK_RECAP_2026-08_PHASE0_PHASE1.md`, `docs/research/run_grok_recap.sh`, `docs/research/GROK_RECAP_2026-08_PHASE2_SESSION.md`

**Disk:** `claude_code_handoff_avt_workspace_disk_rules.md`. Repo + `/Volumes/T7` only. No iCloud MODEST / FENDI FILES.

---

## 0. Your assignment

Fendi asked Cursor to resume after several idle days, land the sitting jobs, then **handed Grok recap to you**.

1. **Do not rebuild** Cover Flight, the Fal `media.format` parser, Voice Director, RISK-001 Part A, GROK_PROVIDER_SPECIALIST, or the Aleph protocol. They are on `main`.
2. **Do run Grok recap Step 0** (`P1` `P2` `P3`) from an authenticated session. Cursor’s cloud box got `401` (see §5). Spend ceiling **$6.00**. Script: `docs/research/run_grok_recap.sh`.
3. **Do not widen** `grok-video-research-proxy` auth to accept a mismatched publishable key. That is a spend hole.
4. **Do not apply RISK-001 Part B** (look-composites bucket lock-down) unless Fendi explicitly asks. Tables are done; the bucket is still open on purpose.
5. **Do not execute Aleph 2.0 vs Grok C** until `RUNWAYML_API_SECRET` exists. Protocol is already on `main`.
6. **Do not start a second Voice Director.** Kill-test is live on `/projects/$id`. If Fendi never uses it to ask “what happens after the second chorus?”, delete it — do not add writes.
7. **Operational fact from Fendi (2026-08-26):** *any change to GitHub automatically merges in Lovable.* Treat GitHub `main` as the ingest. Do **not** add a separate Lovable Publish step. (Written `ENVIRONMENT.md` still says Publish ≠ edge redeploy; Fendi overrode the Publish hop for this project.)

Deliverables back to Fendi: P1/P2/P3 results (accept/reject + HTTP status, redacted), then a go/no-go on Tests A/B/C under $6. If P2 is rejected, stop and report before billed clips.

---

## 1. Evidence labels (do not flatten these)

| Claim | Label |
|-------|--------|
| Session started from idle `main` at `f9cd33f` (PR #25 Fal meta probe, 2026-08-22) | **VERIFIED** — `git log` |
| PRs **#28 #29 #30 #31** merged to `main` this session | **VERIFIED** — GitHub |
| Lovable project SHA matched `fa6e0f4` (PR #28) 8 seconds after GitHub merge | **VERIFIED** — Lovable `get_project` `latest_commit_sha` + `last_edited_at` |
| GitHub `main` auto-ingests into Lovable (no separate Publish) | **DECISION** — Fendi, 2026-08-26; corroborated on PR #28 |
| Fal `media.format.pixel_format = yuv420p10le` on fixture `059114c4-…` | **VERIFIED** — prior sessions 2026-08-22/23; parser now on `main` |
| Voice Director is read-only (SELECT only on `video_projects` / `shots` / `song_analyses`) | **VERIFIED** — `grok-voice-director-proxy/index.ts` |
| RISK-001 Part A applied live 2026-08-27; five tables owner-scoped; bucket untouched | **VERIFIED** — Lovable `query_database` post-apply `pg_policies` |
| Table go/no-go: 1 durable owner; `artist_looks` 219/1; `character_features` 101 rows join-owned by `3ca10935-…` | **VERIFIED** — live SQL this session |
| Grok recap P1 from Cursor cloud = HTTP 401 `anon_service_role_or_user_jwt_required` | **VERIFIED** — curl to live proxy |
| Research proxy is deployed (function JSON, not platform 404) | **VERIFIED** — same curl |
| Grok recap Tests A/B/C billed runs | **not started** — $0.00 |
| Aleph tranche 1 | **not started** — no Runway secret in env |
| `look-composites` anon storage policies still live | **VERIFIED** — `look_composites_anon_*` + `look-composites_open_test` still in `pg_policies` |
| Suite after Voice Director: 623 tests / 50 files: 586 unit, 37 mocked-integration, 0/0/0 live | **VERIFIED** — `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` |
| No CI gates the suite | **VERIFIED** — `docs/TEST_TAXONOMY.md` |

---

## 2. What the project looked like when Cursor sat down (2026-08-26)

Idle ~3–4 days after 2026-08-23. Canonical repo, `main` clean at `f9cd33f`. Lovable already on that SHA. No GitHub issues. Work was sitting in **draft PRs**, not in a lost chat.

Superseded this session (still open as drafts — do not rebuild; close if you want hygiene):

| Old draft | What it was | Fate |
|-----------|-------------|------|
| #26 | Fal `media.format` → 10-bit gate | Cherry-picked into **#28**, merged |
| #27 | `.cursor/mcp.json` Lovable MCP | Same |
| #21 | GROK_PROVIDER_SPECIALIST | Same |
| #24 | Aleph 2.0 vs Grok C protocol | Same |
| #22 | Voice Director Phase 1 | Re-landed as **#29** |
| #17 | RISK-001 Part A (conflicting) | Re-landed as **#30**; SQL applied live |

Left parked (not this session’s job):

| Item | Status |
|------|--------|
| #23 SEO/GEO OS | Draft docs; owner decisions still open |
| #15 warp-worker | Research artifact; keep open |
| #18 account-email repair | Stale — function already removed from `main` after use |
| #3 Apply My Face | June draft; stale |
| RISK-001 Part B bucket policy | **Do not apply** until Fendi says so |
| STOR-2 / STOR-3 / STOR-4 | Inventories still pending |

---

## 3. What Cursor executed (in order)

### 3.1 Ready-queue land — PR #28 — merged 2026-08-26 `fa6e0f4`

Cherry-picks of idle drafts + hygiene. GitHub merge; Lovable SHA matched in 8s.

| Piece | What |
|-------|------|
| From #26 | `extractVideoMeta` reads `media.format.pixel_format` / `profile` / `bitrate`; maps `pixelFormat` + `bitrateBps` into `falProbe` on **both** `wardrobe-video-frame-extract-proxy` and `make-scrub-proxy-proxy`. Removes `DEBUG_FAL_META_ASSET_IDS` raw dump. Does **not** infer HDR from `Main 10`. Does **not** bump `COMPATIBILITY_VERSION`. |
| From #27 | `.cursor/mcp.json` → `https://mcp.lovable.dev` (public CLIENT_ID). Desktop OAuth. |
| From #21 | `.grok/skills/grok-provider-specialist/` — Architecture C is a **research** candidate; lock file is baseline under evidence review. |
| From #24 | `docs/research/ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md` v1.0.2 + empty scorecard. **No paid runs.** |
| Hygiene | `RISK_REGISTER` **REL-1 closed** (PR #19 merged 2026-08-18). Taxonomy 615 / 47 files: 578 unit (+2 format tests), 37 mocked, 0/0/0 live. |

Tests: 615 passed. `npm run build` green.

### 3.2 Fendi correction — GitHub is the Lovable ingest

Cursor had listed “merge then Lovable Publish / edge redeploy.” Fendi: **any GitHub change automatically merges in Lovable.** Confirmed on #28. Subsequent lands (#29–#31) were GitHub merges only.

### 3.3 Voice Director kill-test — PR #29 — merged 2026-08-27 `4e219b8`

Product authorized Class C as a kill-test.

- UI: `src/components/voiceDirector/VoiceDirector.tsx` — hold-to-talk, mounted on `/projects/$id`
- Client: `src/lib/voiceDirector/{allowlist,whatsNext,origins,api}.ts`
- Edge: `supabase/functions/grok-voice-director-proxy` (`verify_jwt = true`, origin allowlist, per-user turn budget)
- Tools allowed: `read_project`, `read_shots`, `read_song_analysis`, `whats_next`, `compile_prompt`
- Forbidden: writes, `draft_treatment`, Imagine/video, S2S, transcript storage
- Key: existing `XAI_API_KEY` on AVT. STT + Grok **text** + TTS only.
- Register: **VOICE-1**
- Kill rule: unused → delete; do not add writes because plumbing works

Tests: **623 / 50 files: 586 unit, 37 mocked, 0/0/0 live.** Build green.

### 3.4 RISK-001 Part A — applied live, then PR #30 — merged 2026-08-27 `a1602cf`

Pre-apply inventory (Lovable `query_database`, not supabase CLI):

- Live policies on the five tables were exactly `*_anon_all` + `*_open_test` + `single_tenant_all` (all `USING (true)`).
- Owners: `artists` 5/1, `artist_looks` 219/1, `location_library` 0, `prop_library` 0, `character_features` 101 rows / 4 artists / **1 join-owner** `3ca10935-…`.
- Identity consolidation (tables) was already done 2026-08-08. v2 health report said tables were safe; storage was the remaining blocker for **bucket** policy. Part A is tables only.

Applied owner-scoped policies:

| Table | Predicate |
|-------|-----------|
| `artists` | `user_id = auth.uid()` (select/insert/update/delete) |
| `character_features` | `artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid())` — **no `user_id` column** |
| `location_library`, `prop_library`, `artist_looks` | `user_id = auth.uid()` FOR ALL |

Post-apply: those five tables have **only** owner-scoped policies. `look-composites` storage **unchanged** (anon + open_test still present). Migration file: `supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql`.

STOR-1: copy+checksum done (earlier); `artist_looks` ref-switch done (earlier); **bucket policy still open**.

### 3.5 Grok recap / Aleph — PR #31 — merged 2026-08-27 `4b20d6b`

Product authorized the $6 ceiling. Cursor attempted Step 0 against the **live** proxy:

```
POST https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/grok-video-research-proxy
mode=probe  probePath=videos/edits  probeBody={model: grok-imagine-video}
→ HTTP 401  {"error":"anon_service_role_or_user_jwt_required"}
```

Cloud `.env` has `SUPABASE_PUBLISHABLE_KEY` only. Proxy accepts edge `SUPABASE_ANON_KEY`, service-role, or a **user JWT**. Publishable ≠ edge anon (the proxy comments this). No service-role (forbidden). No user JWT in the cloud agent.

**Spend: $0.00.** Tests A/B/C not started. Aleph not started (`RUNWAYML_API_SECRET` absent). Detail: `docs/research/GROK_RECAP_2026-08_PHASE2_SESSION.md`.

---

## 4. How to run Grok recap (your job)

Frozen operator script: `docs/research/run_grok_recap.sh`

| Token | Value |
|-------|--------|
| Function | `{SUPABASE_URL}/functions/v1/grok-video-research-proxy` |
| Clip asset | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| SL jacket `character_features` | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Ceiling | **$6.00** hard stop |
| Auth | Bearer = edge anon key **or** logged-in user JWT. Cursor’s publishable key failed. |

```bash
bash docs/research/run_grok_recap.sh P1   # $0 — 400 vs 401: is XAI_API_KEY live for video?
bash docs/research/run_grok_recap.sh P2   # $0 if rejected — can edits take reference_images + video_url?
bash docs/research/run_grok_recap.sh P3   # $0 if rejected — grok-imagine-video-1.5 on edits?
# If P1 is 401: fix caller auth, do not patch the proxy open.
# If P2 rejected: STOP and report. Core question answered. Skip A3.
# Then A0 dry-run, A1/A2 under $6. B/C only after A is recorded.
```

Do **not** process T7 media in the sandbox. Do **not** call xAI except through this proxy. Do **not** touch CC `video-providers-grok-generate` (the silent `referenceImageUrls` drop is preserved on purpose). Do **not** merge PR #15. Do **not** rewrite `docs/VIDEO_SWAP_ARCHITECTURE.md` from a probe.

If P2 **accepts**, that probe may bill — record `accepted` / `requestId` / `estimatedCostUsd` and stop for Fendi before A3.

---

## 5. Chain of command (unchanged except ingest)

| Question | Answer |
|----------|--------|
| Repo | `github.com/fendifrost-dot/ai-video-tool` only |
| CC | `fendi-control-center` — **do not edit**. Fal key lives there |
| SQL | Lovable SQL / Lovable `query_database` — **never** supabase.com dashboard or `supabase` CLI |
| Ingest | GitHub `main` → Lovable (Fendi: automatic). No extra Publish |
| Secrets | Never ask; never commit. `XAI_API_KEY` on AVT. `FAL_KEY` on CC |

---

## 6. Paste-at-start prompt for Claude

```
You are on AVT (ai-video-tool), NOT fendi-control-center.

Read: claude_code_handoff_avt_2026-08-26_catchup.md
then docs/research/GROK_RECAP_2026-08_PHASE2_SESSION.md
and docs/research/run_grok_recap.sh

Do not rebuild Voice Director, RISK-001 Part A, Fal media.format parser, Cover Flight,
GROK_PROVIDER_SPECIALIST, or the Aleph protocol. They are on main.

Task: run grok-recap Step 0 (P1 P2 P3) from an authenticated session.
$6 ceiling. If P2 is schema-rejected, stop and report before billed Tests A/B/C.
Do not widen grok-video-research-proxy auth. Do not apply look-composites bucket RLS.
Do not run Aleph without RUNWAYML_API_SECRET.
GitHub main auto-ingests into Lovable — no Publish step.
```

---

## 7. What Claude should vs should not do

### Do
- Run P1/P2/P3; persist redacted JSON under `docs/research/results/` (or the script’s `docs/research/results/`)
- Label every claim VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION
- Report spend as a running tally even if $0
- Confirm you are on canonical `main` and up to date before editing

### Do not
- Re-implement #28/#29/#30
- Open a standalone Supabase dashboard or use the `supabase` CLI
- Apply Part B storage policies
- Generate garment imagery in the sandbox
- Treat a 401 as “proxy missing” — it answered; auth is the caller
- Close #15 as if it were a failed feature
- Mix SEO/GEO OS (#23) into this recap
