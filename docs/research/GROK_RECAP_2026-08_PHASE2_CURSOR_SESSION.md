# Grok recap Phase 2 — Cursor session (2026-08-28)

**Experiment:** `grok-recap-2026-08` v1.0.0  
**Base SHA:** `9e41003` (PR #32 merge) **[VERIFIED]**  
**Spend this session:** **$0.00**  
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

**[RECOMMENDATION]** Per runbook: P2 rejected → core Architecture C question is **not proven** but **not billable**; review with Fendi before Tests A/B/C or a corrected P2 follow-up.

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
| P2 | SCHEMA_REJECTED (422 missing `video`) | $0.00 |
| P3 | SCHEMA_REJECTED (422 missing `prompt`) | $0.00 |
| **Total** | | **$0.00** / $6.00 ceiling |

## Next (requires approval)

- **Do not** run Tests A/B/C until Fendi reviews P2 schema rejection and whether to issue a corrected probe (e.g. `video` vs `video_url`).
- **Do not** widen proxy auth.
- A0 dry-run and billed tests remain gated per frozen runbook.
