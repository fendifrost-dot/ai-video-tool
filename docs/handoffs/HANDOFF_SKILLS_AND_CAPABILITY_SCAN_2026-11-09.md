# HANDOFF — the build skill, the capability loop, and two tool changes still to make (9 Nov 2026)

**From:** Claude · **For:** the next agent on AVT (Claude, Cursor, Grokbot's AVT agent) and Fendi.
**What Fendi asked (9 Nov):** a skill sheet for any agent inside AVT and Grokbot; something that scans the AI tools for
new capabilities and improves the workflow from them; performance shots intentional with scenery and limited motion;
a more helpful storyboard; Grok image demoted, Gemini for photorealism.

## Done in this PR (docs and scripts, Class A)

| | Where | State |
|--|--|--|
| Build skill with the YSL lessons, the motion budget, the still policy, the handoff format, the cut verification | `.claude/skills/avt-music-video-build/SKILL.md` | CODED (on `main` after merge) |
| Storyboard intent row | `docs/STORYBOARD_INTENT.md` | CODED; agents fill it in shot notes until the fields exist |
| Gap registry | `docs/capability/GAPS.md` (G1–G6) | CODED |
| Scan skill + report script + first snapshot and report | `.claude/skills/avt-capability-scan/SKILL.md`, `scripts/capability_scan/scan_report.py` (`--selftest` passes), `docs/capability/scans/2026-11-09*` | CODED; first scan RUN ($0) |
| Weekly scan | a Claude scheduled task, Mondays 13:40 America/Chicago, fresh session, docs-only PR | see §"Scheduled task" |
| v1.14 A accepted | AVT asset `ef30ff7e` approved with Fendi's words | DONE |

## NOT done: two tool changes (Class B/C, need review before merge)

### 1. Gemini as the default still model for photoreal requests (Class C: providers)

Today `supabase/functions/world-still-proxy/index.ts` has `DEFAULT_MODEL = "grok-imagine-image-quality"` and an
explicit Gemini route (`model: "gemini-nano-banana-2.1"`, `n: 1`, `jobRowId` required for a real run, up to 14
references, Google billing through Control Center). Flipping the default is not one line: the Gemini route refuses
`n > 1` and needs a queued job, so every caller that sends `n: 2` without a job would break.

Proposed change: a `purpose` field on the request (`"plate" | "scene" | "draft"`); `plate`/`scene` default to the
Gemini model and `n: 1` and create the job the way the app's Gemini path does; `draft` keeps Grok. The storyboard's
"Make plate" press sends `purpose: "plate"`. Tests: a dry run with `purpose: "plate"` answers the Gemini estimate;
with `purpose: "draft"` the Grok one; an explicit `model` still wins. Redeploy `world-still-proxy` after merge
(Lovable → Edge Functions). Verify: `avt_call world-still-proxy {dryRun:true, purpose:"plate", …}` → `model:
"gemini-nano-banana-2.1"`.

Until then: agents name the Gemini model on every photoreal request (build skill §4).

### 2. Storyboard intent fields (Class B: feature)

Additive zod fields in `src/lib/treatment/shotSpec.ts`, all with defaults so existing `spec_json` parses unchanged:

```
intent: {
  lane: "performance_real_take" | "broll_with_him_mouth_at_rest" | "broll_no_him" | "cutaway_cast" | "",
  beat: string,                       // which beat of the render the slot shows
  scenery: { in: string, out: string[] },   // what is in frame; what must not be
  motionBudget: "locked" | "calm" | "alive" | "busy" | "",
  motionSources: string,
  lightOnHim: "constant" | "changing" | "",
  staging: { distance: string, side: string, action: string, lens: string },
  stillRoute: "gemini" | "grok" | ""
}
```

Plus a card section on the storyboard to fill it, and one lint: `lane = performance_real_take` with
`motionBudget` in (`alive`, `busy`) or `lightOnHim = changing` is flagged before a paid call. Tests on parse defaults
and the lint. Publish after merge (frontend only).

## Scheduled task

A Claude scheduled task named "AVT capability scan" fires Mondays 13:40 America/Chicago in a fresh session on this
repository with the prompt to run `.claude/skills/avt-capability-scan/SKILL.md` and open a docs-only PR. Expected
output each week: `docs/capability/scans/<date>.md` + `<date>_higgsfield.json`, a PR, and a one-paragraph summary.
If a week's PR is missing, the task failed; check the task's last run. Disable it from the Claude app if unwanted.

## What to report back

- After the Gemini default lands: the dry-run outputs for `plate` and `draft`, and the redeploy named.
- After the storyboard fields land: a shot saved with the intent row and the lint firing on a `busy` performance shot.
- After any benchmark: the scan report updated, the ledger row, and Fendi's words on the result.

Nothing in this handoff is verified by me beyond the self-test and the first scan's $0 run.
