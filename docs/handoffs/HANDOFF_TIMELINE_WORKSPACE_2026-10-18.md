# Handoff — Timeline workspace + cinematic workflow (2026-10-18)

## Done

- CapCut-style Timeline at `/projects/$id/editor` over `edit_sequences` (PR #337 → `c02288d`).
- Preview with song, waveform, ruler/playhead/zoom, Versions browser, Move vs Adjust footage timing, split/trim/extend/remove, undo/redo, save + version snapshot.
- Cinematic charcoal/cream theme from PR #220 carried through Setup → Treatment → Shots → Timeline → Review → Export.
- Follow-up visuals: dominant monitor, thumbnail clip strips, grouped transport, filmmaking Export copy, softer production-path labels, “Specialist tools” instead of Engineering mode, friendlier version names.
- Google Continue button + magic-link fallback; session persistence already wired.

## Live / deploy checklist

1. Merge visual PR → `main`
2. Lovable **Publish** (frontend)
3. Edge **`edit-render`**, **`avt-mcp`** already redeployed from #337 (no new edge change in visual follow-up)
4. No new SQL migration
5. **Google sign-in (owner-only):** Lovable → **Cloud → Users → Auth Settings → Sign In Methods → Google → enable**, keep **signups disabled**. Confirm user id `3ca10935-8c3d-4479-9a0c-8bfe8050840c` unchanged after first Google sign-in.

## Working editor

https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/editor

## Move vs Adjust footage timing

- **Move clip** — where the take sits on the song (timeline placement). Song stays locked.
- **Adjust footage timing** — which source frames play inside that same song slot (slip / source in–out). Does not move the clip on the song.

## Next concrete task

1. **Owner:** Enable Google in Lovable Auth Settings (signups stay disabled); sign in once; confirm same user id.
2. Wire durable **edit-render** worker so Export preview yields a playable MP4 in `project-exports` (today queues $0 + XML download works).
3. Re-smoke disposable sequence after Publish: move, slip, split, save, reload, song audible, XML download; capture Timeline with loaded thumbnails on live Chrome.

## Do not

- Write `shots` / `slip_seconds` / live board variation `c067efb9-…` from the Timeline.
- Call paid generation or generative lip-sync.
- Open standalone Supabase.
