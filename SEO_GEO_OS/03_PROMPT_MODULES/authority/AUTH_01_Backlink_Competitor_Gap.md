# AUTH_01 — Backlink Competitor Gap

**Category:** Authority · **Applies to:** All brands. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Identify domains linking to competitors but not to the brand, filtered to those that are legitimate, achievable, and worth pursuing. The output is a qualified target list with a reason for each, not a raw gap export.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Backlink profiles for the brand and each competitor (name the tool — tools disagree substantially)
- Competitor set with inclusion basis
- Provenance taxonomy from `../../06_SOURCE_PROVENANCE/`

## Procedure

1. Export referring domains for the brand and each competitor from the same tool on the same date. Cross-tool comparison is not valid.
2. Build the gap set: domains linking to one or more competitors but not to the brand.
3. **Classify each by provenance type and collapse derivatives.** Syndicated network copies of one placement are one origin, not many, and this is where most backlink gap reports inflate.
4. Filter out: link networks, paid-link marketplaces, scraped or auto-generated directories, and any domain whose links are clearly transactional. These are not targets; they are risks.
5. For surviving domains, classify the link's origin: editorial coverage, directory listing, supplier/partner relationship, sponsorship, resource page, or user-generated. The acquisition path differs entirely by type and this is the useful part of the analysis.
6. Mark achievability honestly: is there a real, legitimate route (a genuine relationship, a real story, a legitimate listing)? Mark `no` freely — most gap domains are not achievable.
7. Rank by: number of competitors linked (a domain linking to several is likely category-relevant), independence, and achievability.
8. Cross-reference against `GEO_02`: domains that are both link sources and AI-retrieval sources are the highest-value targets available.

## Guards — known traps

- Backlink tools have partial, differing indexes. Never present tool data as a complete picture; name the tool and date.
- **Never propose buying links, PBNs, link exchanges at scale, or paid placements presented as editorial.** Hard stop.
- Domain-level authority metrics are vendor inventions, not search-engine signals. Use them for coarse sorting only and say so.
- A competitor's link may come from a relationship that cannot be replicated. Achievability is a real filter, not a formality.
- Collapse syndication before counting. Otherwise one press release looks like thirty opportunities.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `DOMAIN`
- `LINKS TO WHICH COMPETITORS (n)`
- `PROVENANCE TYPE`
- `INFORMATION ORIGIN ID`
- `LINK ORIGIN (editorial/directory/partner/sponsorship/resource/UGC)`
- `ACHIEVABLE LEGITIMATELY? (yes/no/unknown)`
- `ALSO AN AI-RETRIEVAL SOURCE? (from GEO_02)`
- `TOOL + DATE`

## Default next measurement

Referring-domain count from distinct information origins (not raw domains), quarterly — link acquisition is slow and a monthly read is noise.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `AUTH_01`.
