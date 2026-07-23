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

## Grok workflow (this repo)

When asked to debug or optimize the build:

1. Run `grok inspect` to confirm this file loaded.
2. Use **plan mode** first for multi-file audits: `grok --permission-mode plan -p "..."`.
3. Run `npm run build && npm run test && npm run lint` and fix failures with minimal diffs.
4. For bundle/build profiling, trace: `vite.config.ts` → Lovable config → Nitro → Cloudflare plugin → `wrangler.jsonc`.

Useful file references:

- `@src/server.ts` — SSR / Cloudflare entry
- `@src/start.ts` — middleware chain
- `@supabase/functions/wardrobe-vton-proxy/index.ts` — VTON proxy
- `@vite.config.ts` — build config constraints
