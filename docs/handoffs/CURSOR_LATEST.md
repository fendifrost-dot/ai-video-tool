# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-05 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`. Open draft PRs are **not** live and **not** testable unless listed below as MERGED.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1e** code (`architecture_c_still_repair_1e`) | **YES** — PR #43 merge `205141d` | **YES** — Claude/Fendi redeployed; scored | **Scored FAIL** — asset `57504fac` |
| Stage **1f** code | **NO** (directive only: `docs/ARCHITECTURE_C_CHATGPT_STAGE1F_DIRECTIVE_2026-09-05.md`) | n/a | **NOT ready** until 1f lands on `main` + edge redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

**Do not test open Cursor branches for chest repair.** If it is not on `main` + redeployed, it is not the live proxy.

## This cleanup land

- Brought missing **Grok Build anchor API research** doc onto `main` (was stranded on draft PR #41).
- Closed superseded still-repair drafts **#41** / **#42** (stale `CURSOR_LATEST` / superseded by Claude’s real 1d/1e docs).
- Did **not** merge unrelated open PRs (security Class-C, research prototypes, conflicts, Voice Director, etc.).

## Claude / ChatGPT

- ChatGPT **Stage 1f directive** is on `main` (`5757fef`). Cursor concurrence recorded there.
- User reports Claude is landing **1f on `main`** — Cursor is not double-implementing. After 1f merge: redeploy **only** `architecture-c-still-repair-proxy`, then score same still/quad.

## Confirm

V2 active · V3 inactive · temporal off · sleeve blocked · xAI spend $12.80 / $20 · `$0` still path
