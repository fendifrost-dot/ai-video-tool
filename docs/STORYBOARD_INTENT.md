# Storyboard intent: what every shot says before it is built (9 Nov 2026)

Fendi, 9 Nov 2026: "I feel like the storyboard can be more helpful in our build." It is, when each shot states its
intent before a plate, a dress or a montage is paid for. VFX after the cut could not fix sameness (eight b-rolls that
read as one) or a performance shot fighting a passing train; the storyboard can, for $0.

## The intent row (fill it for every shot, in `spec_json` notes until the fields exist)

| Field | Values | Why |
|---|---|---|
| `lane` | `performance_real_take` / `broll_with_him_mouth_at_rest` / `broll_no_him` / `cutaway_cast` | decides the method and the cost (`docs/recipes/README.md`) |
| `beat` | which beat of the 4 s render the slot shows, and what the other beats are for | a slot holds one beat; the dice-game lesson |
| `scenery` | one sentence: the place, what is in frame, what is NOT (the excluded things by name) | plates carry what is in them |
| `motion_budget` | `locked` / `calm` / `alive` / `busy` | performance shots are `locked` or `calm` only (skill §3) |
| `motion_sources` | what moves and where (behind, beside, far, in front) | nothing crosses behind his outline on a performance shot |
| `light_on_him` | `constant` / `changing` | `changing` is not allowed on a performance shot today |
| `staging` | distance, side (profile left/right/three-quarter), action, lens | vary these across shots in the same outfit so they do not read as one |
| `outfit_key` | the look | continuity |
| `still_route` | `gemini` for anything photoreal, `grok` for a draft | skill §4 |
| `him_in_frame` | yes/no; if yes, which SHOT_RULES lines are at risk | rule check before the call |

## How the fields are used

- `lane` + `motion_budget` gate the montage call: a `performance_real_take` with `busy` is refused by the agent (split it
  into a busy cutaway and a calm frame with him).
- `scenery` is the plate prompt's first line, and its "NOT" list is checked on the plate before anything is rendered on it.
- `staging` across a run of shots in one outfit must differ in at least two of distance / side / action / lens.
- `beat` goes into the slot table row of the handoff (`.claude/skills/avt-music-video-build/SKILL.md` §5).

## In the tool (follow-up, not built yet)

`src/lib/treatment/shotSpec.ts` has `CameraMotionSchema` (`type`, `description`) and `EnvironmentSchema`
(`description`, `location`, `timeOfDay`). The fields above are specified in
`docs/handoffs/HANDOFF_SKILLS_AND_CAPABILITY_SCAN_2026-11-09.md` as an additive schema change with a storyboard card
section; until it lands, the intent row lives in the shot's notes and the agent fills it.
