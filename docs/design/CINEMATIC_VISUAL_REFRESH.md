# Cinematic visual refresh

Class A: presentation only. Based on Fendi's supplied “Cinematic Music Video Storyboard UI” reference, recovered 9 October 2026.

## Design authority

Near-black canvas, charcoal surfaces, champagne-gold actions and workflow markers, white headings and neutral secondary text. Violet is reserved for scene regeneration. Actual assigned project media remains the source of every preview; existing honest placeholders and failed/unverified states remain intact. The reference's sample metrics and export options are not capabilities.

Theme tokens live in `src/styles.css`: background #0b0e10, card #15191c, primary #f2ce8e (dark text #19150e), secondary text #a9afb5, generation #6543c8 (white text). DM Sans and Space Grotesk remain the existing font families. Legacy glass/aurora class names now resolve to neutral surfaces to keep secondary screens consistent without rewriting them.

## Scope / coordination

Branch `codex/cinematic-visual-refresh`, based on `fdd45ce`. No provider functions, production records, prompts, wardrobe assignments, media selections, or timeline logic changed. All five workflow stages inherit the shared theme. Existing project/variation navigation, advanced controls, cast, Looks, timed events, jobs, and review verdicts are preserved.

Frontend publication must be coordinated with the active video-production agent. No edge redeploy or SQL migration is needed for this change. Do not publish an unrelated pending backend change as part of this styling work.

## Verification

Clean npm install, TypeScript, production build and existing automated suite checked. Browser evidence uses the repository's isolated fake backend and synthetic test media, not Fendi's real project and not a media-quality benchmark. Detailed results and screenshots follow in this record after browser verification.
