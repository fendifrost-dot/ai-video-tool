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
5. If Google sign-in errors with “provider not enabled”: owner enables Google in Lovable Cloud auth and adds `https://aivideotool.lovable.app/auth` (+ preview origin) to OAuth redirect URIs

## Next concrete task

1. Confirm Google provider is enabled on Lovable Cloud for project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` and complete any Google Cloud OAuth consent (owner-only).
2. Run `scripts/edit-render.mjs` against a queued `edit_renders` row (or wire a durable worker) so **Export preview** yields a playable MP4 in `project-exports` without a local agent laptop.
3. Disposable smoke on sequence `2976b498-…` (or a copy): move, slip, split, save, reload, compare preview timing to XML/plan.

## Do not

- Write `shots` / `slip_seconds` / live board variation `c067efb9-…` from the Timeline.
- Call paid generation or generative lip-sync.
- Open standalone Supabase.
