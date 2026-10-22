# Metric Definitions

**Status:** ACTIVE · **Last updated:** 2026-08-22

One definition per metric, used identically across every report. Metric drift — a metric quietly changing
meaning between reports — makes a time series worthless while looking perfectly healthy.

## Cross-brand

| Metric | Definition | Source | Trap |
|---|---|---|---|
| Non-branded organic impressions | GSC impressions excluding queries containing brand terms | GSC | Branded traffic masks everything; the split must be defined once and reused |
| Non-branded organic clicks | As above, clicks | GSC | Same |
| Average position | GSC average position for a defined query set | GSC | An average across contexts, **not a rank**. Never report as "we rank #N" |
| Indexable page count | URLs returning 200 and not excluded by robots/meta/canonical | Crawl | Differs from "indexed"; do not conflate |
| AI mention rate | Panel prompts mentioning the brand / total prompts run, per platform | GEO_01 | Non-deterministic; always report sample count and variance |
| Entity resolution rate | Bare-name queries resolving to the correct entity / total tested | ARTIST_01, GEO_04 | For Fendi Frost this gates every other GEO metric |
| AI entity accuracy rate | Accurate claims / total **verifiable** claims | GEO_04 | Report `unverifiable` count separately, never folded in |
| Independent information origins | Distinct origins after collapsing derivatives, excluding first-party | AUTH_02, AUTH_05 | Never report raw source counts alone |
| Share of voice | Brand mentions / total brand mentions in panel responses | GEO_05 | Meaningless without the competitor set version and denominator |

## Boltz

| Metric | Definition | Source | Trap |
|---|---|---|---|
| Engine leads | Inbound enquiries specifically about engine replacement | CRM / phone / form — **instrumentation undefined, see DQ-009** | Cannot be reported until the funnel is defined |
| Booked diagnostics | Diagnostic appointments booked | Booking system | Distinguish booked from completed |
| Approved engine jobs | Quoted engine jobs the customer approved | Shop system | The real commercial conversion point |
| Completed engine jobs | Engine jobs completed | Shop system | The KPI chain terminates here, not at traffic |
| Revenue / gross profit | Per approved and completed engine work | Accounting | Owner-supplied; may be withheld — report the gap rather than substituting a proxy |
| Organic leads | Leads attributable to organic search | Analytics + CRM | Attribution is weak for phone-led local businesses. State the method |
| Map visibility | Map-pack presence for a fixed, versioned query and location set | Manual or tool | Location-dependent; freeze the grid or the series is noise |

## Modest

| Metric | Definition | Source | Trap |
|---|---|---|---|
| Organic sessions | Sessions from organic search | Analytics | Segment branded vs non-branded |
| Product impressions | Impressions for product and category URLs | GSC / Merchant Center | Keep the two sources separate; they count differently |
| Product share of voice | Brand product presence across shopping and AI surfaces for a fixed query set | GEO_05, ECOM_06 | Requires a frozen query set |
| Add-to-cart / checkout / purchases | Standard funnel events from organic | Analytics | Define the attribution window once and keep it |
| Organic revenue | Revenue attributable to organic sessions | Analytics | Attribution model must be stated and never silently changed |
| AI referrals | Sessions referred from AI platforms | Analytics referrer data | Undercounted — many platforms do not pass referrers. Report as a floor, not a count |
| Email acquisition | New email subscribers from organic sessions | ESP + analytics | |

## Fendi Frost

| Metric | Definition | Source | Trap |
|---|---|---|---|
| Exact entity accuracy | Correct claims / verifiable claims about the artist | GEO_04 | Excludes fashion-house results entirely |
| Site retrieval | Whether owned properties appear as cited sources | GEO_02 | Only applies if an owned site exists |
| Direct AI mentions | Panel prompts mentioning the artist, correctly resolved | GEO_01 + ARTIST_01 | **A mention under a resolution failure does not count** |
| Runway Music retrieval | Whether the imprint is retrieved and correctly represented | ARTIST_05 | Formal status undefined — see DQ-017 |
| Chicago association | Presence of the geographic association | GEO_06 | Track separately from genre |
| Role association | Artist / producer / engineer, **in approved order** | GEO_06, ARTIST_04 | Order matters; a correct set in the wrong order is a finding |
| House/electronic association | Presence of the genre association | ARTIST_03 | |
| Fashion association | Intended fashion adjacency **vs** fashion-house collision | GEO_06, ARTIST_01 | These are opposite outcomes and must never be pooled |
| Independent corroboration growth | Change in independent information origins | AUTH_05 | The durable authority metric |

## Rules

1. **A metric's definition never changes silently.** Changing one starts a new series; keep both and say so.
2. **Every reported metric names its source and date window.**
3. **Report the denominator** for every rate.
4. **Report sample count and variance** for every AI metric. A single run is an anecdote.
