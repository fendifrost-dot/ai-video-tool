# 01 — Evidence Taxonomy

**Status:** ACTIVE · **Last updated:** 2026-08-22

Every claim produced by this OS carries exactly one classification. This extends the repo-wide evidence
taxonomy in `CLAUDE.md` with two labels specific to SEO/GEO work (`owner-confirmed`, `unknown`).

| Label | Means | Requires | Example |
|---|---|---|---|
| `confirmed` | Directly verified by inspecting the artifact itself, with a citable source | URL, screenshot, export, API response, or file path + date observed | "The `/engine-replacement` page returns 200 and has no `LocalBusiness` schema — crawled 2026-08-22" |
| `observed` | Seen, but not proven to be stable, causal, or complete | What was seen, when, and the sampling limits | "Competitor A appeared in 3 of 5 AI answers for 'engine replacement near me' on 2026-08-22" |
| `owner-confirmed` | Asserted by the business owner; authoritative for business facts, not for market facts | Who said it and when | "No public phone number for Modest — owner-stated, 2026-08-22" |
| `hypothesis` | Plausible, unproven, and **has a named test that would settle it** | The specific test + what result would falsify it | "Adding service-level pages lifts non-branded map impressions — test: I2, checkpoint +28d" |
| `decision` | An intentional choice, with rationale | Rationale + who decided + when | "Holding all Fendi↔Modest cross-linking until I1a reads out" |
| `recommendation` | A proposed action not yet approved | Effort, reversibility, expected signal | "Propose adding `Product` schema to 6 SKUs — 2h, reversible" |
| `unknown` | Not yet checked, or checked and indeterminate | What would resolve it | "GBP primary category — not yet retrieved" |

## Rules

1. **A hypothesis without a named test is not a hypothesis — it is noise.** Delete it or write the test.
2. **Never let a `hypothesis` read as `confirmed`.** No hedged prose that implies proof ("this likely
   confirms…"). Label it and move on.
3. **`owner-confirmed` is authoritative for business facts only** — hours, service list, entity
   relationships, intent. It is *not* authoritative for "what ranks" or "what AI systems say."
4. **Downgrade on doubt.** If a claim sits between two labels, take the weaker one.
5. **Date every `confirmed` and `observed` claim.** Retrieval results and SERPs decay fast; an undated
   observation is `unknown` within weeks.
6. **Absence of evidence is `unknown`, not `confirmed` negative** — unless the check itself was
   exhaustive and you say so.
