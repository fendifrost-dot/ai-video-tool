# Handoff — Timeline workspace (2026-10-18)

## Done

- CapCut-style Timeline at `/projects/$id/editor` over `edit_sequences`.
- Preview with song, waveform, ruler/playhead/zoom, Versions browser, Move vs Adjust footage timing, split/trim/extend/remove, undo/redo, save + version snapshot.
- Cinematic charcoal/cream theme merged from PR #220; nav labels Shots + Timeline.
- Google Continue button + magic-link fallback; session persistence already wired.

## Live / deploy checklist

1. Merge PR → `main`
2. Lovable **Publish** (frontend)
3. Lovable Edge Functions → redeploy **`edit-render`**, **`avt-mcp`** (shared `editModel` gestures)
4. No new SQL migration (tables already live from `20261018020000`)
5. **Google sign-in (owner-only):** Lovable research (2026-10-18) — Google is **not** enabled yet. In Lovable: **Cloud → Users → Auth Settings → Sign In Methods → Google → enable**, and keep **signups disabled** so registration stays closed. Existing verified Gmail should link to the same user id (not a new empty account). Managed Lovable Google may use `lovable.auth.signInWithOAuth("google")` after that toggle generates the managed module; today’s UI calls `supabase.auth.signInWithOAuth({ provider: "google" })` and will show a clear fallback message until the provider is on. Preview origins: managed path handles them; BYO Google client needs redirect allow-list for live + preview `/auth`.

## Next concrete task

1. **Owner:** Enable Google in Lovable Cloud Auth Settings (signups stay disabled). Sign in once and confirm user id `3ca10935-8c3d-4479-9a0c-8bfe8050840c` is unchanged.
2. If managed Google requires the Lovable-generated `cloud-auth` module, wire SignInForm to that API without opening registration.
3. Run `scripts/edit-render.mjs` against a queued `edit_renders` row (or wire a durable worker) so **Export preview** yields a playable MP4 in `project-exports`.
4. Re-smoke disposable sequence `0e2d077c-…` after Publish: move, slip, split, save, reload, song audible, XML download.

## Do not

- Write `shots` / `slip_seconds` / live board variation `c067efb9-…` from the Timeline.
- Call paid generation or generative lip-sync.
- Open standalone Supabase.
