# RISK-001 — Immutable Evidence

**Do not edit the files in this folder.** They are the frozen forensic record for
security incident **RISK-001** (anonymous `USING(true)` RLS / bucket exposure). They
are copied verbatim from the read-only audit at the moment remediation began and are
integrity-pinned by `SHA256SUMS.txt`.

| File | What it is | Origin |
|------|-----------|--------|
| `RLS_FORENSIC_P0_2026-08-05.md` | P0 forensic on the anon-open RLS (provenance, affected objects, restore spec §6) | audit artifact, 2026-08-05 |
| `REMEDIATION_PLANS_2026-08-05.md` | Remediation plans R1–R8 (R1 = this RLS restore) | audit artifact, 2026-08-05 |
| `AUDIT_video_swap_pipeline_2026-08-02.md` | Full read-only pipeline audit (RISK-001 = SEC-1 therein) | audit artifact, 2026-08-02 |
| `CULPRIT_MIGRATION_20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql` | Verbatim copy of the dev-only migration that opened access | `supabase/migrations/…` @ `origin/main` |

## Verifying integrity

```sh
cd docs/security/RISK-001/evidence
shasum -a 256 -c SHA256SUMS.txt   # every line must print "OK"
```

`SHA256SUMS.txt` was generated at freeze time over the four evidence files above
(this README is metadata and is intentionally excluded from the manifest). Any
mismatch means an evidence file was altered — treat that as a chain-of-custody break.

The **live** copy of the culprit migration remains in `supabase/migrations/` and is
neutralised by the paired revert migration
`20260806120000_risk_001_revert_anon_rls.sql`; the copy here is the immutable
snapshot as it stood when RISK-001 was opened.
