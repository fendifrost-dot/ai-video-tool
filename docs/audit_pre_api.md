# Pre-API Foundation Audit

Date: 2026-05-16. Scope: everything in the MVP that should be solid before
provider API integrations land.

Format: each item is tagged **fix now**, **defer**, or **kill**. Anything
marked **fix now** is executed in this session (linked commit hash if done).

## Performance

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| P1 | Lazy-loading routes | **defer** | TanStack Start file-based routing already code-splits per route. No action needed. |
| P2 | Bundle size | **defer** | shadcn/ui + radix is the bulk; tree-shaken at build time. Revisit after first user-facing perf complaint. |
| P3 | `<img>` / `<video>` lazy loading | **fix now** | AssetCard, Reference360Uploader, ReviewBoardPage all render media without `loading="lazy"`. With dozens of assets per project the asset library page balloons. One-line fix per call site. |
| P4 | Query caching keys | **fix now** | Already consistent (artistsKeys, projectsKeys, etc.). One callout: clipReviews.ts has an ad-hoc `["clip_reviews", "by_asset", stableKey]` that bypasses the central key factory. Align it. |
| P5 | Long-list virtualization (shots, assets) | **defer** | Single-user MVP — first user with 200+ shots/assets in one project is the trigger. Revisit then. |
| P6 | Signed URL cache | **defer** | 1-hour TTL is fine for typical workflows; the cost is one extra REST round-trip per page navigation. If asset-library page perf becomes an issue, memoise a (path → url) cache in TanStack Query keyed by hourly bucket. |

## Data integrity

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| D1 | FK cascade behavior | **defer** | Reviewed all 20+ FKs. user_id is `on delete cascade` everywhere (correct — full account wipe). Parent `video_projects → shots/prompts/project_assets` cascades. `shot_id` and `prompt_id` on assets are `on delete set null` (correct — preserves orphaned assets that can be re-linked). No bugs. |
| D2 | Storage orphans on cascade delete | **defer** | When a parent project is deleted, child `project_assets` rows go via DB cascade — but the underlying Storage files are NOT removed (no trigger). All buckets are private with RLS, so leakage risk is zero; only cost is $$. Best handled by a scheduled "GC orphans" function once we're running real workloads. Document in `docs/storage_gc_plan.md` (deferred). |
| D3 | Missing indexes on FK columns | **defer** | Verified every FK has either a single-column or composite-leading index. No N+1 risk from missing indexes. |
| D4 | Generated `duration_seconds` column | **defer** | Read-only computed column on `shots`. Already correctly defined as `generated always as (...) stored`. |
| D5 | Domain type aliases missing | **fix now** | 18 named types (`Artist`, `VideoProject`, `ShotStatus`, etc.) imported throughout the app but not exported from generated types.ts. `tsc --noEmit` fails. Aliases added. (Commit `9172226`.) |

## UX

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| U1 | Loading states | **defer** | 37 `isLoading`/`isPending` references across pages and components; spot-checked, the main flows show spinners. Comprehensive sweep would be a separate UX pass. |
| U2 | Empty states | **defer** | Dashboard, Artists, AssetLibrary, ShotList all have dedicated `<EmptyState>` components. |
| U3 | Error boundaries | **defer** | Root route has `errorComponent: ErrorComponent` — covers per-route render errors. Per-component boundaries would be over-engineered at this stage. |
| U4 | Destructive-action confirms | **defer** | All delete actions go through `confirm()` with a specific message. Native dialog is fine for single-user MVP. |
| U5 | Mobile responsiveness | **defer** | Tailwind responsive classes used throughout. Not a current target audience for production tool. |
| U6 | Keyboard navigation | **defer** | Radix primitives ship correct ARIA + keyboard out of the box. |
| U7 | Optimistic updates | **defer** | All mutations invalidate then refetch; latency is negligible against Supabase. Optimistic only worth it for high-frequency interactions (review-slider drags, for example), which is a Phase 2 concern. |

## DX

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| X1 | Typed query helpers | **defer** | The `*Keys` factories + TanStack Query generics give type-safe access. Good enough. |
| X2 | dev-vs-prod env handling | **defer** | `.env` ships only `VITE_*` (public) and the anon key (PUBLISHABLE — public). No leaked secrets. Service role lives in Supabase function env only. |
| X3 | Test script in package.json | **fix now** | `vitest` exists in deps but no `"test"` script. CI / contributors can't `npm test`. One-line add. |

## Security

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| S1 | RLS on all owner tables | **defer** | Verified — 10 tables, 40 policies, all `user_id = auth.uid()`. |
| S2 | Storage RLS edge cases | **defer** | Bucket policies use `auth.uid()::text = (storage.foldername(name))[1]`. Sound — first-segment-is-owner-id is enforced. |
| S3 | Signed URL expiry | **defer** | 3600 s consistent everywhere. Reasonable. |
| S4 | Public bucket exposure | **defer** | All 5 buckets are `public: false`. No exposed assets. |
| S5 | Secrets in client bundle | **defer** | Only the anon publishable key + URL get bundled. No leakage. |
| S6 | CSP headers | **defer** | Lovable Cloudflare deployment doesn't ship CSP today. Add a Workers response-header rule once we're on a custom domain — out of scope for MVP. |
| S7 | Edge function user_id prefix check | **defer** | New `upload-asset` function manually re-enforces the RLS invariant (commit `[prior]`). Good. |

## Observability

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| O1 | Client-side error capture | **defer** | `error-capture.ts` listens for `error` + `unhandledrejection` and surfaces the most recent one through `consumeLastCapturedError` for SSR. No remote logging — appropriate for single-user MVP. Add Sentry/Plausible after we have users. |
| O2 | Supabase query failure logging | **defer** | Mutations toast errors. Query failures bubble to error component. No silent failures observed in spot-checks. |
| O3 | Slow-query visibility | **defer** | Supabase dashboard has pg_stat_statements when needed. Not a current pain point. |

## Tests

| # | Item | Verdict | Notes |
|---|------|---------|-------|
| T1 | Unit coverage (pure logic) | **defer** | 62 passing across compiler, registry, csv, manifest, smoke, storage. Covers all pure-logic surface area. |
| T2 | E2E happy paths (Playwright) | **defer** | Single-user MVP, manual smoke testing post-deploy is faster. Revisit when we add team-account multi-user logic. |
| T3 | RLS policy tests | **defer** | Would require a pgtap/pgTAP harness or seeded JWT fixtures. Cost > benefit for current scope. |

## Summary

**Fix-now items executed this session:**
- D5: domain type aliases — commit `9172226`
- P3: `<img>` / `<video>` `loading="lazy"`
- P4: clipReviews query-key consolidation
- X3: `"test"` script in package.json

**Notable deferreds with a clear future trigger:**
- D2 (Storage GC for orphans): trigger = first paying user or multi-month-old projects
- P5 (virtualization): trigger = >200 items in any one list
- O1 (remote error capture): trigger = >1 user
- S6 (CSP): trigger = custom domain
