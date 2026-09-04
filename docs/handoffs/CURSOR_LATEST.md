# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-04 · **Branch:** `cursor/architecture-c-still-1c-corrections-88eb` · **Commits:** (this tip)

## Landed

### A — Live stage-1c verification of deployed `8ebfe83` (Claude already scored; Cursor confirms)

- **Output asset:** `f7c7b524-2f87-4c87-9624-85368de26f2d`
- **Parent / clean still:** `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` (`parent_asset_id` + `source_still_asset_id`)
- **Project:** `764a63d2-93cd-44f3-905f-292f14ab2f51` · keyframe `v2-still-0.785` · `temporal_tracking_enabled: false`
- **Proxy:** `architecture-c-still-repair-proxy` post-redeploy (logo `target_quad` = sub-quad, not full band)
- **Verdict:** NOT A PASS — wordmark placement FIXED; band REGRESSED (see scorecard below / Claude 1c doc)
- **No new live re-run of the old code** — corrections below must redeploy before stage-1d

### B — Stage-1c corrections (code; **redeploy needed**)

Addresses Claude 1c §Proposed corrections 1–3 + surface `occlusion_source` (item 4 partial):

1. **Shading** — defect-masked navy luma → median fill → box blur → gain clamp **[0.85, 1.15]** (`applyBandLumaShading`)
2. **Cover expansion** — still-repair path sets `columnFollow: false`, `maxExpandFrac: 0.02`, `zipStripFrac: 0` (no sleeve drips)
3. **Zip** — `overlayZipFromSource` feathered restore of non-navy tape (no raw slit)
4. **Occlusion** — still `skin_heuristic` only; **`occlusion_source` persisted** in `logoCompositeMetaCore` / `LogoCompositeResult`. **SAM-3 escalation required** (hard stop) — not wired this land
5. Mask-derived quad — **not done** (still manual measured quad)
6. Golden leak/luma unit coverage added (synthetic); full golden on `2aa1a44c` pixels still Claude-side after redeploy

Touched: `src/lib/garment/logoComposite.ts` (+ tests), edge `_shared/logoComposite.ts` + `placementEngine.ts`, `src/lib/heroFrame/grokVideoEditPrompt.ts` (+ tests)

### C — Inactive V3 I/J maintenance (no spend gate)

`GROK_VIDEO_EDIT_PROMPT_V3` now includes approved factual clause:
- self-coloured mastic welt pockets
- mastic cuffs
- navy sleeve panels stop above the cuff

Collar/zip V3 corrections preserved. **Active lane remains V2.** Regression tests prove V3 inactive + I/J present + version `v2`.

## Deployed?

- edge fn redeployed: **NO — required** → Lovable **Edge Functions → redeploy `architecture-c-still-repair-proxy`**
- frontend published: **not required** for this land (server-side composite only; V3 text is inactive)

After redeploy, Claude: re-run stage 1 on clean `2aa1a44c` with the same measured quad → expect `occlusion_source: "skin_heuristic"` in metadata; score band drips/shading/zip. Sleeve still **hold**.

## Scorecard for ChatGPT (deployed `8ebfe83` / asset `f7c7b524`)

| Defect | Verdict |
|--------|---------|
| Wordmark position | **PASS** |
| Wordmark scale | **PASS** |
| Chest-band continuity | **FAIL** (navy drips / column-follow leak) |
| Zip continuity | **PARTIAL** (raw slit, not cloth zip) |
| Shading | **FAIL** (high-freq ghosts / sticker blotches) |
| Hand occlusion | **FAIL** (skin heuristic insufficient; cream sleeve unprotected) |

- **SAM-3 escalation required?** **YES** — `outfit − dilate(hands) − dilate(face)`
- **Chest strong enough for `sleeve_panel`?** **NO**
- **Confirm:** V2 active / V3 inactive (I/J installed) / spend **$0** / temporal **off**

## Blocked / needs decision

- Claude redeploy + stage-1d score on corrections
- ChatGPT review of `f7c7b524` before any sleeve / V3 paid run
- SAM-3 wire-up (Class C) before treating occlusion as solved
