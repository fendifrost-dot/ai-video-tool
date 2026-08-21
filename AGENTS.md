# AI Video Tool (AVT) — Agent Instructions

Film production workflow app for artists, looks, wardrobe VTON, timelines, and provider jobs.
Deployed via Lovable Cloud; local repo path: `/Users/gocrazyglobal/Projects/ai-video-tool`.

## Stack

| Layer | Technology |
|-------|------------|
| App framework | TanStack Start + TanStack Router |
| UI | React 19, Tailwind CSS 4, Radix UI |
| Build | Vite 7, `@lovable.dev/vite-tanstack-config` |
| Runtime | Cloudflare Workers (`wrangler.jsonc`, `src/server.ts`) |
| Backend | Supabase (Postgres, Storage, Edge Functions) |
| Tests | Vitest + Testing Library (jsdom) |
| Package manager | npm (also has `bun.lock`) |

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build (Vite + Cloudflare)
npm run build:dev    # Development-mode build
npm run preview      # Preview production build
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint
npm run format       # Prettier
```

**Always run `npm run build` and `npm run test` after non-trivial changes.**

## Repo layout

```
src/
  routes/           # TanStack file-based routes
  pages/            # Page components
  components/       # UI and feature components
  lib/              # Business logic (providers, queries, export, timeline, garment, prompts)
  integrations/     # Supabase client, types, auth
  server.ts         # Cloudflare SSR entry (error wrapper around TanStack server-entry)
  start.ts          # TanStack Start middleware (Supabase auth, error handling)
supabase/
  functions/        # Edge functions (VTON, compose-look, faceswap, provider proxies)
  migrations/       # SQL migrations
wrangler.jsonc      # Cloudflare Workers config (main: src/server.ts)
vite.config.ts      # Minimal — most plugins come from Lovable config
```

## Build constraints (do not break)

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config`. **Do not manually add** these plugins or the app will break with duplicates:

- tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only)
- componentTagger (dev-only), VITE_* env injection, `@` path alias
- React/TanStack dedupe, error logger plugins, sandbox detection

TanStack Start server entry is redirected to `src/server.ts` via `tanstackStart.server.entry: "server"`.
`wrangler.jsonc` `main` alone is insufficient — the Cloudflare plugin builds from `src/server.ts`.

## Hard rules (wardrobe / asset pipeline)

Read `AVT_MEMORY_HANDOFF.md` for full context. Summary:

1. **All asset processing runs through AVT** or Supabase edge functions it calls — never ad-hoc local image processing in the agent sandbox.
2. **No AI-regeneration of garment imagery.** VTON uses real product photos; pixel preservation is mandatory.
3. **Fix the tool, not workarounds.** If output is wrong, improve AVT code or wired prompts.
4. **Audit outputs** against references before calling something a win.
5. **Minimize scope** — focused diffs, match existing conventions, no over-engineering.

### Wardrobe pipeline (locked architecture)

```
Hero still: SAM-3 mask (SwitchX segment) → Grok outfit swap → lock onto hero → face restore → (pose restore TBD)
Video:      approved hero → SwitchX / i2v propagation (Phase 2) → FFmpeg reassembly
```

- SAM-3 owns masking only — never wardrobe generation.
- Grok owns outfit appearance (the only engine that won live swap tests).
- Restore tools own face / pose after Grok.
- SwitchX Beeble wardrobe mode is not the outfit engine.

### Key edge functions

- `wardrobe-vton-proxy` — IDM-VTON / CatVTON garment transfer
- `grok-image-garment-proxy` — Grok Image-Edit full-outfit hero frames (`XAI_API_KEY`)
- `compose-look-proxy` — compose references, segment, remove-bg (no generative garment truth)
- `fal-queue-poll-proxy` — poll Fal async jobs
- `proxy-provider-call` — generic provider proxy
- `ingest-provider-job` — provider job ingestion

## Provider integrations

Provider clients live in `src/lib/providers/` (fal, grok, higgsfield, pika, runway, veo, manual).
Registry: `src/lib/providers/registry.ts`. Job API: `src/lib/providerJobs/`.

## Coding conventions

- TypeScript strict; use `@/` path alias for `src/`.
- Queries in `src/lib/queries/`, co-locate `*.test.ts` next to modules.
- UI primitives in `src/components/ui/` (shadcn-style).
- Prefer extending existing functions over new abstractions.
- Comments only for non-obvious business logic.

## Environment

- `.env` exists locally (do not commit secrets).
- Supabase project: Lovable Cloud managed (`aivideotool.lovable.app`) — id `qoyxgnkvjukovkrvdaiq`.
- Do not confuse with Fendi Control Center / compose-look Supabase project (`wkzwcfmvnwolgrdpnygc`).
- **No standalone Supabase / no `supabase` CLI for migrations.** SQL → Lovable SQL editor; frontend → Publish; edge → Lovable redeploy. See root `CLAUDE.md` chain of command.

## Grok lanes (do not mix)

Grok is three products in this project. Do not route one onto another's bill or job.

| Lane | Surface | What it is for | Billing |
|------|---------|----------------|---------|
| **Production media** | `grok-image-garment-proxy` → `/v1/images/edits`; CC `video-providers-grok-generate` → `/v1/videos/generations` | Repeatable user jobs, persisted outputs | `XAI_API_KEY` / `Frost_Grok` per call |
| **Engineering / research** | Grok Build CLI (`grok`, `grok -p`, ACP) as **GROK_PROVIDER_SPECIALIST** | Inspect xAI paths, critique prompts, schema drift, go/no-go on a paid call | SuperGrok / X Premium+ via `grok login` |
| **Human creative** | Manual TUI / Imagine experiments | One-off prompt and visual critique | Subscription quota. **Never** automate grok.com |

The CLI does **not** replace Imagine endpoints. It saves spend by **preventing bad paid calls**. Local Grok Build images are not garment-truth — that still goes through AVT's proxy.

**Auth:** engineering sessions use `grok login`. If `XAI_API_KEY` is exported, Grok Build bills the production meter — unset it for specialist work.

**GROK_PROVIDER_SPECIALIST** (Grok Build skill + subagent):

- Track xAI model/API changes against wired AVT code
- Validate payloads; draft/critique garment prompts
- Analyze Grok benchmark failures
- Recommend `skip` / `wait-for-prompt-fix` / `worth-one-approved-call`
- Never change production architecture without Class C review
- Charter: `.grok/skills/grok-provider-specialist/SKILL.md`

```bash
grok inspect   # confirm this file + the specialist skill loaded
grok --permission-mode plan -p "GROK_PROVIDER_SPECIALIST: <task>"
# in the TUI: /grok-provider-specialist
```

`dispatchScrubProxy` in this repo is a **video scrub-proxy** helper, not an agent orchestrator. Do not invent a Company OS inside AVT.

When debugging the Vite/Cloudflare **build** (not xAI):

1. `grok inspect`
2. Plan mode for multi-file audits
3. `npm run build && npm run test && npm run lint`
4. Trace: `vite.config.ts` → Lovable config → Nitro → Cloudflare plugin → `wrangler.jsonc`

Useful file references:

- `@src/server.ts` — SSR / Cloudflare entry
- `@src/start.ts` — middleware chain
- `@supabase/functions/wardrobe-vton-proxy/index.ts` — VTON proxy
- `@supabase/functions/grok-image-garment-proxy/index.ts` — Grok Image-Edit hero lane
- `@vite.config.ts` — build config constraints
- `@docs/grok_api_status.md` — wired vs documented xAI capability
