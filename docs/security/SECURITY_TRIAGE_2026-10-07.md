# Security triage · 7 October 2026 — the look-composite finding and the "50 critical" scan

Asked by the director: "Triage the reported look-composite access issue and the security scan findings. Distinguish
verified vulnerabilities from scanner findings, and identify which affect this generation path. Do not describe the
release as security-cleared based only on test counts."

Labels: VERIFIED (proven, cited) / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION. Nothing here is a clearance.

## 1. What is VERIFIED (by reading live policies and code today)

| id | finding | how verified | affects the storyboard still path? |
|---|---|---|---|
| **SEC-4** | `*_open_test` policies — `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)` — on 30+ tables incl. `video_projects`, `shots`, `project_assets`, `provider_jobs`; `<bucket>_open_test` on **every** bucket incl. the private ones | live `pg_policies` query, 7 Oct 15:2x UTC | **Yes.** Any JWT holder can re-own a project or an artist, read any file, and call paid proxies. It undermines every id/owner check in every edge function. |
| anonymous sign-in live | `supabase.auth.signInAnonymously()` in `src/routes/__root.tsx:140`; `auth.users`: 1 durable (the director), **1,376 anonymous**, latest created 7 Oct 14:49 UTC | live query + code | **Yes.** An anonymous JWT is a JWT: the proxies' `auth.getUser()` accepts it. |
| **STOR-5** | `grok-image-look-composite` signs caller-supplied storage paths with the service role across four buckets, no folder check, `http(s)` passed through | code read `index.ts:98-110, 148-186` | **No** — Hero Frame Studio lane, not the storyboard. Same class as REF-1's original defect. |
| REF-1 (closed in code) | #185's first version held the *row* to the caller but a client-written `file_url` could point at another user's file | independent security review of the PR | Fixed: folder check, sign-as-caller, anonymous refusal (`docs/reviews/PR185_CLASS_C_REVIEWS_2026-10-07.md`). |

## 2. What is a SCANNER finding (not independently verified here)

Lovable's publish gate reports **"50 unresolved critical security findings"** on every publish (the deploy reports of
7 Oct 14:40 and 16:3x UTC both say so). This session has no tool that returns the scanner's list, so the number is
OBSERVED, not reproduced. HYPOTHESIS, strongly supported by §1: the 50 are the `_open_test` policies (≈32 table
policies + ≈12 bucket policies) plus the anon policies on `look-composites`, `style-references` and `training-zips` —
i.e. SEC-4 / RISK-001, counted per policy. If so, one Class C migration closes all 50; a different list would mean
something not yet known. RECOMMENDATION: export the scanner's list from Lovable's Security view into
`docs/security/` so the next triage starts from the list, not from a count.

## 3. Which of this affects the generation path, and what holds today

The storyboard still path (`world-still-proxy`, and `treatment-writer-proxy` for text) is reachable by any JWT
including anonymous ones, and every ownership check in it can be made to pass by re-owning a row (SEC-4). Spend on
the director's xAI key is therefore open to any visitor on the no-reference path **today, on main** — that is not new
and not #185's.

What #185 adds on top is the signing of private files; what it adds to hold that: **anonymous JWTs refused** and
**files signed as the caller**. With the director as the only durable account, the first closes the route to every
anonymous visitor now; the second makes storage RLS the judge once SEC-4 is closed. Neither is a clearance of SEC-4.

RECOMMENDATION (separate Class C PRs, in this order):
1. Refuse anonymous JWTs on every paid proxy (`treatment-writer-proxy`, `grok-video-edit-proxy`,
   `video-providers-*`, `grok-image-look-composite`, `grok-voice-director-proxy`, `lyric-visualizer-proxy`) —
   one-line each, the pattern `lyric-align-proxy` already uses. Closes anonymous spend immediately.
2. STOR-5: look-composite resolves pictures by record id through `_shared/stillReferences.ts`, signs as the caller,
   drops the URL pass-through.
3. SEC-4 / RISK-001: remove the `_open_test` and anon policies, after the STOR-1…4 re-key so the director's legacy
   files stay readable. With the RLS integration test.

## 4. What this is not

- Not a statement that the release is secure. 2,335 passing tests and three reviews prove the code does what its
  tests say under the assumptions written in them; the live database does not meet those assumptions (SEC-4).
- No live attack was attempted; no data was read as another user; nothing was spent.
