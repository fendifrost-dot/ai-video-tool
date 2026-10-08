# Handoff · Cast members can get a reference picture again · 8 Oct 2026

## What was wrong (VERIFIED in code)
Since #183 (`1a5783f`) characters are not in the Continuity panel, and the Cast rows had no "Draw reference
pictures" button. `referencePrompt` also threw for `kind: "character"`. So no one could give THE_RIDER a picture,
and IB §3 step 1 ($0.14) — and with it shot 8 and the rider → CRT test — could not run.

## What changed (CODED on `claude/avt-mcp-config-oefz18`, PR #202 — not LIVE)
- `referencePrompt` draws a character as one person, whole, face visible, plain background; `entityShot` asks 3:4.
- `entityPictureRefusal`: never draws the artist (linked `artistId`) or anyone set to **preserve** — a real
  person's likeness comes from photographs, not a generator. The controller refuses before any spend.
- Cast row (`Cast.tsx`): the picture strip + approve-by-looking (shared `EntityPictures`, moved out of
  `EntityCard` unchanged) and **Draw reference pictures** (`entity-generate-picture`) for recurring/invent members.
- Tests: 2,442 pass (`npx vitest run`); `tsc --noEmit` clean.

## To make it live
Frontend only: **merge to `main`, then Lovable Publish.** No SQL, no edge function redeploy.

## Verify (after Publish)
1. Storyboard of project `764a63d2-…`, candidate with THE_RIDER active → **Cast** → The rider. Expected: a
   "Draw reference pictures" button and "No reference picture yet — …". FENDI's row: **no** such button.
2. Pressing it shows a confirmation "Draw pictures · $0.14" (list). This is a paid press — a person presses it.
3. After it runs: two thumbnails in the rider's row; look at one large → **Approve this picture**. Then shot 8's
   confirmation should read "Sent as pictures: The rider (cast)".

If step 1 shows no button, the published bundle is older than this change — re-publish; do not edit code to "fix" it.

## Known, not changed here (OBSERVED)
`castReferencesOf` sends `approvedAssetId ?? referenceAssetIds[0]`, so a drawn-but-unapproved picture is still sent.
Approve one before generating shots (same as locations today).
