# Managed Google sign-in — Class C follow-up

## Scope

Replace the existing Google button's legacy OAuth call with the generated Lovable managed-auth helper. Keep the public same-origin `/auth` callback, anonymous-session cleanup, and existing-account-only magic-link fallback. No profiles, SQL, data writes, provider jobs, or publishing.

## Review

Read-only reviewer `sub_jrcxj3jq` returned separate architecture, product, and security approvals for this scoped migration. No blocker identified. Existing anonymous bootstrap and broader RLS risks are outside scope and unchanged.

## Evidence

- VERIFIED: Hosted public auth settings before and after configuration report `disable_signup=true` and `external.google=true`. Configuration tool reports Google was already enabled.
- VERIFIED: Six mocked-integration tests pass: managed callback, anonymous sign-out ordering, error retry, preview completion, redirect handoff, existing-account-only email fallback.
- VERIFIED: Preview diagnostics report `build OK` after edits.
- OBSERVED: Browser renders Continue with Google; clicking produced no visible application error but did not expose Google account selection in the standalone localhost check.
- Unverified: Completed Google sign-in and same owner account/project read-back. Requires an interactive Google session in the supported preview or published environment.

## Test taxonomy (focused tests only)

Unit: 0; mocked integration: 6; provider-live: 0; real-media-benchmark: 0; deployment-smoke: 0. Full repository suite not run.