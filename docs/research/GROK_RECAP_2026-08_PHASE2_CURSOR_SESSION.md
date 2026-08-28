# Grok recap Phase 2 — Cursor session (2026-08-28)

**Experiment:** `grok-recap-2026-08` v1.0.0  
**Base SHA:** `9e41003` (PR #32 merge) **[VERIFIED]**  
**Spend this session:** **$0.32**  
**Operator:** Cursor cloud agent (takeover from Claude)

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Bootstrap

| Check | Result | Label |
|-------|--------|-------|
| `origin/main` | `9e41003` | **VERIFIED** |
| Worktree | clean, on `main` then branch `cursor/grok-recap-phase2-p1-7e56` | **VERIFIED** |
| Repo | `github.com/fendifrost-dot/ai-video-tool` | **VERIFIED** |
| Cloud `.env` keys | `SUPABASE_PUBLISHABLE_KEY` only (no edge anon, no user JWT) | **VERIFIED** |
| Publishable-only P1 | HTTP 401 `anon_service_role_or_user_jwt_required` | **VERIFIED** — reproduces Phase 2 session |

---

## P1 — AUTH_CROSSED / PROVIDER_REACHED

**Execution path [DECISION]:** Authenticated AVT browser at `https://aivideotool.lovable.app/` → DevTools console `fetch` with `Authorization: Bearer <user access_token>` read from `localStorage` key `sb-qoyxgnkvjukovkrvdaiq-auth-token`. Token stays in-browser only; not written to shell history, docs, or committed files.

**No code or auth changes required** — proxy already accepts valid user JWT via `auth.getUser(bearer)` **[VERIFIED]** in `grok-video-research-proxy/index.ts`.

| Field | Value |
|-------|-------|
| Proxy HTTP | 200 |
| xAI `submit.httpStatus` | 422 |
| xAI error | missing field `prompt` (expected for minimal probe body) |
| Billed | false |
| Classification | **AUTH_CROSSED / PROVIDER_REACHED** |
| Artifact | `docs/research/results/P1_auth_and_schema.json` |

**[RECOMMENDATION]** Continue P2/P3 with the same browser-session `fetch` pattern (or Desktop `run_grok_recap.sh` only if publishable key still equals edge anon — not true in this cloud box).

---

## P2 — SCHEMA_REJECTED ($0)

| Field | Value |
|-------|-------|
| Proxy HTTP | 200 |
| xAI `submit.httpStatus` | 422 |
| xAI error | missing field `video` (sent `video_url` + `reference_images`) |
| Accepted | false |
| Billed | false |
| Classification | **SCHEMA_REJECTED** |
| Artifact | `docs/research/results/P2_edits_with_reference_images.json` |

**[OBSERVED]** Proxy resolved frozen `videoAssetId` and `wardrobeFeatureId` and forwarded signed URLs. xAI rejected at deserialization before generation.

**[HYPOTHESIS]** xAI `/v1/videos/edits` may expect a `video` field (not `video_url`) when combining with `reference_images`. The frozen runbook probe body may need a corrected field name to answer the crux — that would be a **new probe design decision**, not a proxy auth change. **STOP before any such change without approval.**

**[OBSERVED]** Original P2 was a **probe-schema rejection** (`video_url` vs required `video` object), not a negative Architecture C result.

---

## P2_corrected — ACCEPTED ($0.32)

**Approved correction:** `video: { url: "{{VIDEO_URL}}" }` instead of `video_url`.

| Field | Value |
|-------|-------|
| Proxy HTTP | 200 |
| xAI `submit.httpStatus` | 200 |
| `submit.accepted` | **true** |
| `requestId` | `ed27462b-39c6-9fe6-9d6b-e3a6475809c0` |
| `finalStatus` | `done` |
| Output | `project-exports/research/grok-recap-2026-08/probe-ed27462b-39c6-9fe6-9d6b-e3a6475809c0.mp4` (1,653,727 bytes) |
| Classification | **ACCEPTED** |
| Artifact | `docs/research/results/P2_corrected_edits_video_plus_reference_images.json` |

**[VERIFIED]** xAI accepted `/v1/videos/edits` with **both** `video` (signed source clip) and `reference_images` (two garment refs). Generation completed; proxy polled to `done`.

**[VERIFIED]** Actual xAI charge: `cost_in_usd_ticks` = 3,200,000,000 → **$0.32** (4 s output). Proxy `estimatedCostUsd` was 0 for probe mode — use usage ticks for tally.

**[DECISION]** Stopped after acceptance per operator instructions. **Do not** run Tests A/B/C without new approval.

---

## P3 — SCHEMA_REJECTED ($0)

| Field | Value |
|-------|-------|
| Proxy HTTP | 200 |
| xAI `submit.httpStatus` | 422 |
| xAI error | missing field `prompt` |
| Classification | **SCHEMA_REJECTED** (minimal probe; same gate as P1) |
| Artifact | `docs/research/results/P3_edits_model_1_5.json` |

**[OBSERVED]** `grok-imagine-video-1.5` on edits was not exercised with a valid payload; availability remains unknown.

---

## Step 0 summary

| Step | Result | Spend |
|------|--------|-------|
| P1 | AUTH_CROSSED / PROVIDER_REACHED (422 missing `prompt`) | $0.00 |
| P2 (original) | SCHEMA_REJECTED (422 — `video_url` not `video`) | $0.00 |
| P2_corrected | **ACCEPTED** (200 + `request_id`, gen `done`) | **$0.32** |
| P3 | SCHEMA_REJECTED (422 missing `prompt`) | $0.00 |
| **Total** | | **$0.32** / $6.00 ceiling |

## P2_corrected — visual / garment scorecard ($0 review cost)

Read-only review of stored output (anon storage sign + frame extraction). **No new provider calls.**

| Field | Value |
|-------|-------|
| Sum (axes 1–10) | 20 / 30 |
| MAJOR FAILURE (edit vs regen) | **No** — scene/person preserved; garment changed |
| Garment swap | 2/3 — navy track + white sleeve stripes present; logo illegible |
| Background | 3/3 — closet/door/boots preserved vs source |
| Classification | **Partial visual pass** — research-viable, not production-certified |
| Artifacts | `docs/research/results/P2_corrected_visual_scorecard.json`, `.md` |

**[OBSERVED]** Output is 720×1280 / 3.71 s vs 1080×1920 / 4.02 s source — expected edits downscale/truncation per recap spec.

---

## Next (requires approval)

- **STOP** — Step 0 + corrected P2 API + visual scorecard complete.
- **Do not** run Tests A/B/C without explicit new approval.
- **Do not** widen proxy auth.
