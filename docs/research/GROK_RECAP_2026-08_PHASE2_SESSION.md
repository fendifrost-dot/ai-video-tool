# Grok recap Phase 2 session — 2026-08-27

**Experiment:** `grok-recap-2026-08` v1.0.0  
**Spend this session:** **$0.00**  
**Operator:** Cursor cloud agent (product authorized the $6 ceiling)

Evidence classes: **[V]** Verified · **[O]** Observed · **[H]** Hypothesis · **[D]** Decision.

---

## What this session did

Product asked to knock out Voice Director, RISK-001, and Grok/Aleph spend.

| Track | Result |
|---|---|
| Voice Director Phase 1 | **Landed** — PR #29 merged to `main` (`4e219b8`) **[V]** |
| RISK-001 Part A (tables) | **Applied live** then PR #30 merged (`a1602cf`) **[V]** |
| Grok recap Step 0 / Tests A–C | **Not executed.** Proxy is live; caller auth failed. **[V]** |
| Aleph 2.0 vs Grok C tranche 1 | **Not executed.** No Runway secret in this environment. **[V]** |

---

## Grok recap — why Step 0 did not run

The research proxy `grok-video-research-proxy` **is deployed** (it returned a function-authored JSON body, not a platform 404). **[V]**

P1 (`POST …/grok-video-research-proxy`, `mode: probe`, `probePath: videos/edits`, body `{ model: grok-imagine-video }`) from this cloud workspace:

```
HTTP 401
{ "error": "anon_service_role_or_user_jwt_required" }
```

**Cause [V]:** the function accepts only (a) the edge `SUPABASE_SERVICE_ROLE_KEY`, (b) the edge `SUPABASE_ANON_KEY`, or (c) a valid user JWT. This environment has `SUPABASE_PUBLISHABLE_KEY` only. The proxy itself documents the mismatch (`index.ts`: “the live app's client key may no longer equal the env value”). We do **not** hold a service-role key (forbidden) and we do **not** have a logged-in user JWT.

`docs/research/run_grok_recap.sh` is the frozen operator path. It must be run from a session whose bearer matches (b) or (c) — typically a signed-in AVT browser tab or a Desktop `.env` whose publishable key still equals the edge anon key.

**[D]** Do not widen the proxy to accept any publishable key from this agent. That would punch a spend hole. Run the script from an authenticated session.

**[D]** Do not start Tests A/B/C until P1 returns 400-not-401 (key live) and P2’s accept/reject is recorded. P2 acceptance would be the only billed-risk probe; rejection is $0.

---

## Aleph vs Grok C — still gated

Protocol `aleph2-vs-grok-c-v1.0.2` is on `main`. This environment’s `.env` has no `RUNWAYML_API_SECRET` / `RUNWAY_API_KEY`. Identity/PR #17 Part A is no longer above this (tables restored), but the Runway secret is still the gating item. **[V]**

T7 benchmark media is not mounted in this cloud workspace. Fixture bytes were not re-hashed. **[O]**

---

## Next operator action (human / Desktop)

```bash
# from a checkout whose .env anon key matches the live edge, or with a user JWT
bash docs/research/run_grok_recap.sh P1
bash docs/research/run_grok_recap.sh P2
bash docs/research/run_grok_recap.sh P3
# then A0 dry-run, then A1/A2 under the $6 ceiling. Skip A3 unless P2 accepted.
```

If P2 is rejected, the core research question (garment refs + source video in one `/v1/videos/edits` call) is answered before any billed second. That is still the recommended stop to review with Fendi.
