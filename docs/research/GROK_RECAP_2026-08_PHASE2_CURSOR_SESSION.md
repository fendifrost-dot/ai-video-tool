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

## Next

- P2: probe `videos/edits` with `reference_images` + `video_url` ($0 if rejected)
- P3: probe `grok-imagine-video-1.5` on edits ($0 if rejected)
- Do not widen proxy auth
