# Class C review — Timeline editor precision (2026-10-18)

**Scope:** Frame-accurate paused seeking, Compare original via provenance + performance sync, phrase loop at playhead, unsaved-edit protection. No schema change. No paid generation. No generative lip-sync.

| Gate | Finding |
|------|---------|
| Architecture | Reuses `edit_sequences` / `performance_syncs` / existing monitor. Seek drift vs paused thresholds separated. Compare maps song→source via `songToPerformance`; does not invent sync. |
| Product | Filmmaking wording for save state; Compare explains when original cannot be resolved; Loop phrase uses marker at playhead/clip (timeline clock). |
| Security | No new auth surface. `beforeunload` + sequence-switch confirm only. Google OAuth remains Lovable-managed. |

**Test:** `npm run test` (3087 pass) including new mediaSeek / compareOriginal / phraseAt cases. Build green after installing `@lovable.dev/cloud-auth-js`.

**Deploy notes:** Migration `20261018100000_edit_render_worker` already live (columns + claim RPC verified). Catalog `--check` matches committed `catalog.generated.ts` (PR #341 corruption note is stale). Edge redeploy for this PR: none required (frontend-only). Publish frontend after merge.
