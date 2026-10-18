# Class C review — Timeline workspace, auth, render access

**Change class:** C (timelines, rendering, auth)  
**Branch:** `cursor/editing-workspace-14a6`  
**Date:** 2026-10-18  
**Scope:** CapCut-style Timeline over existing `edit_sequences` / `edit_clips` / `edit_markers` / `edit_renders`. Google sign-in UI. Cinematic visual tokens (merged from PR #220).

## Architecture

- **Reuse, do not fork:** All edits mutate `EditSequence` via `applyGesture` in `_shared/editModel.ts`. No new timeline_items dual-write. Board `slip_seconds` / shots / assignments untouched.
- **Move vs Adjust footage timing:** `move` changes `timelineIn`/`timelineOut`; `slip` changes `sourceIn`/`sourceOut` only. Song track locked in UI by default.
- **Nondestructive:** Remove drops `edit_clips` rows only; source `project_assets` stay. Save upserts sequence + clips/markers and deletes removed clip/marker ids; writes `edit_sequence_versions` snapshot.
- **Song offset once:** Preview uses `songTimeAt = songOffset + timelineSeconds`. Import path from #333–#336 unchanged.
- **Export:** `edit-render` still plans/queues cost_usd=0. In-app preview uses the same timing model. XML download is immediate. Queued MP4 still encodes via `scripts/edit-render.mjs` (product gap reported in UI copy).

## Product

- Filmmaking labels: Shots / Timeline; Versions browser; Timing panel with earlier/later copy.
- Removed categorical “model mouth — a slip will not line it up.” Generated mouths flagged for judgment only.
- No generative lip-sync. No paid generation in this change.

## Security

- Google OAuth client UI: `supabase.auth.signInWithOAuth({ provider: "google" })` with magic-link fallback (`shouldCreateUser: false`). Session: existing `persistSession` + `autoRefreshToken` + brokered preview storage.
- **Owner-only (VERIFIED research via Lovable plan_mode 2026-10-18):** Google Sign-In Methods are not enabled on this Lovable Cloud project yet. Enable under Cloud → Users → Auth Settings → Google with **signups disabled**. Managed Lovable Google may later require `lovable.auth.signInWithOAuth` + generated module; do not open public registration.
- RLS on edit_* tables unchanged (owner via `user_id`). `edit-render` still refuses anonymous JWT.
- No public registration opened.

## Sign-off

| Role | Verdict | Notes |
|------|---------|-------|
| Architecture | Approved for merge | Extends approved edit_sequences lane; no second timeline system |
| Product | Approved for merge | Timeline UX + filmmaking language; export worker gap explicit |
| Security | Approved for merge with caveat | Google provider enablement may need owner consent in Lovable Cloud |

## Risk register

No new RISK-001 surface. Auth remains invite/owner-bound (`shouldCreateUser: false`). Render cost stays 0.
