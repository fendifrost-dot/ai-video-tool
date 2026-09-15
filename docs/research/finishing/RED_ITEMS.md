# RED items — Fendi approval required

**Lane F · 2026-09-15**  
Nothing in this list has been started. This research spent **$0**.

A RED item is a **stop**. Do not “just try it.” Do not ask another agent to do it. Comment on [#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57) (or have Fendi comment) with an explicit yes + spend ceiling.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Already forbidden (not even a RED — hard locks)

These stay **no** even if finishing looks blocked:

| Lock | Why |
|------|-----|
| `fendi-control-center` edits | Sister project; umbrella + CLAUDE.md |
| Proxy auth widening | Umbrella + SECURITY.md |
| PR #37 | Explicit lock |
| V3 / paid Grok generations | Explicit lock; wrong lane and wrong bill |
| Architecture C / chest-still code | Isolation rule |
| Standalone Supabase / CLI SQL | Project policy |
| iCloud / MODEST / FENDI FILES walks | Disk rules |

---

## RED — paid or external (approval required)

| ID | Action | Why it costs or leaves the repo | Suggested ceiling if approved |
|----|--------|----------------------------------|-------------------------------|
| **RED-F1** | Any billed GPT-6 Astra / OpenAI computer-use call | Access exists via Fendi's OpenAI API **[DECISION]** (research-only). A live/billed session is still paid; public unit price is not treated as known here **[HYPOTHESIS]**. Having the key ≠ approval to spend. | Name a USD cap **before** the first session; default remains $0 |
| **RED-F2** | Live Astra (or any computer-use agent) on Fendi's workstation | Touches real Premiere, real media, real Creative Cloud login | Time-boxed session + workspace on `/Volumes/T7/...` only |
| **RED-F3** | Install a Premiere UXP/CEP panel or developer-load a panel | Changes the Adobe install; needs CC license already on that machine | $0 if license exists; still needs machine + volume confirmation |
| **RED-F4** | Runway Premiere / AE plugin generations | Paid credits; generative restyle of footage **[OBSERVED]** 2026-09-08 Runway announcement | Do not use for garment/identity frames |
| **RED-F5** | Higgsfield (or similar) AE cleanup generations | Paid; public Astra+Higgsfield demos **[OBSERVED]** | AE is out of v1; approve as a **new** host, not a hidden Astra step |
| **RED-F6** | Adobe Firefly / Premiere generative extend / AI effects on finishing media | Paid + brand-pixel risk | Default no |
| **RED-F7** | Extra Adobe seat, AME cloud encode, or Frame.io upload of finishing media | License / egress / third-party store | Prefer local AME preset already on the machine |
| **RED-F8** | Copying production music-video masters off T7 onto a cloud agent VM | Media egress + disk risk | Keep media on T7; agents get recipes + docs only |
| **RED-F9** | Sharing Premiere project / sequence screenshots that include unreleased artist/wardrobe | Confidentiality | Crop or use synthetic fixtures |
| **RED-F10** | Enabling `astra.enabled` or `max_usd > 0` in harness config | Turns the disabled runner on | Requires RED-F1 + RED-F2 written yes |

**[DECISION]** If a proposed next step is not in this table and costs money or leaves the repo, treat it as **RED-F0 (unnamed)** and add it here before acting.

---

## Not RED — $0 work that does not need a new approval

| Work | Notes |
|------|-------|
| Reading / extending `docs/research/finishing/` | This lane. May mention that Fendi's OpenAI API can reach Astra. Must not call it. |
| `validateFinishingRecipe` unit tests | No I/O |
| Using the existing Export page ZIP / FCPXML handoff | Already shipping |
| Human-in-Premiere finishing on a machine Fendi already uses, **without** agents or new plugins | Normal editorial work; not this lane's spend |

**[RECOMMENDATION]** The first *implementation* increment after this design, if Fendi wants it, is RED-F3 on a T7 workspace with an empty UXP panel that reports version only. Still $0 API spend. Still no Astra.

---

## How to approve

Comment on [#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57) with:

```
APPROVE RED-Fn
ceiling: $X
machine/volume: …
expires: YYYY-MM-DD
```

Until that exists, harness config stays:

```
astra.enabled = false
spend.max_usd = 0
max_astra_steps = 0
```
