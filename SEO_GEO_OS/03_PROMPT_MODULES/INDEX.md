# Prompt Module Index

**38 modules across 6 families.** Every module is read-only, returns findings in the shape defined by
`../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, and appends to the decision queue.

## How to invoke

Name the module, the brand, and the input. The module carries its own procedure and guards, so a run
request is short:

```
Run GEO_02 + WEB_02 for Boltz and update the decision queue.
Run ECOM_03 on Modest against the latest crawl.
Run ARTIST_01 for Fendi Frost — baseline run.
```

Each run: load the system rules and the brand context lock, check the experiment registry, execute,
return findings in the contract shape, append queue rows.

## Dependency order

Some modules are instruments others depend on. Running them out of order produces uninterpretable output:

| Run first | Because |
|---|---|
| `ARTIST_01` (Fendi Frost) | Entity resolution gates every other artist and GEO metric for this brand |
| `GEO_01` | Builds the frozen prompt panel that `GEO_02`–`GEO_06` all read from |
| `WEB_01` | Produces the crawl that `WEB_03`–`WEB_07`, `ECOM_01` and `ECOM_05` consume |
| `AUTH_02` | Produces the ancestry data `AUTH_05` requires — without it the corroboration score is meaningless |
| `GEO_02` | Feeds the retrieval-source view used by `AUTH_01`, `AUTH_03`, `AUTH_04`, `ARTIST_06` |

---

## Local SEO — `local_seo/`

*Boltz primary. Applies to any brand with a Google Business Profile.*

| Module | Purpose | Applies to |
|---|---|---|
| [`LSEO_01`](local_seo/LSEO_01_GBP_Category_Audit.md) | Establish what the business's Google Business Profile primary and secondary categories actually are, what categories the competitor set uses, and w... | Boltz (primary) |
| [`LSEO_02`](local_seo/LSEO_02_GBP_Attributes_Audit.md) | Inventory which GBP attributes are available for the business's categories, which are set, which are unset, and which unset ones are both true and ... | Boltz (primary) |
| [`LSEO_03`](local_seo/LSEO_03_Review_Velocity_Language.md) | Measure review count, rating, velocity, and recency against the competitor set, and analyze what customers actually say — specifically whether the ... | Boltz (primary) |
| [`LSEO_04`](local_seo/LSEO_04_Review_Response_Audit.md) | Measure response rate, response latency, and response quality — with response quality defined as *usefulness to a prospective customer reading it*,... | Boltz (primary) |
| [`LSEO_05`](local_seo/LSEO_05_GBP_Services_Audit.md) | Audit the GBP services list against the business's actual service list and against the way customers phrase demand — with explicit attention to whe... | Boltz (primary) |
| [`LSEO_06`](local_seo/LSEO_06_GBP_Posting_Audit.md) | Record current and competitor posting behavior as an observational baseline, and — critically — hold the line that posting frequency is an unproven... | Boltz (primary) |
| [`LSEO_07`](local_seo/LSEO_07_GBP_Photo_Audit.md) | Audit photo inventory, coverage, recency, and quality against what a prospect needs to see — and resolve, mechanically, whether EXIF geotagging sur... | Boltz (primary) |
| [`LSEO_08`](local_seo/LSEO_08_Citation_Consistency.md) | Find every place the business's name, address, and phone appear across the web, and identify inconsistencies | Boltz (primary) |

## Website SEO — `website_seo/`

*All brands with an owned website.*

| Module | Purpose | Applies to |
|---|---|---|
| [`WEB_01`](website_seo/WEB_01_Technical_Crawl_Audit.md) | Establish the site's actual technical state from a full crawl: what exists, what is reachable, what is indexable, and what is broken | All brands with an owned website (Boltz, Modest; Fendi Frost only if an owned site exists — see its open question 5) |
| [`WEB_02`](website_seo/WEB_02_GSC_Opportunity_Mining.md) | Mine Search Console for queries and pages where a small movement produces disproportionate return: striking-distance positions, high-impression low... | All brands with GSC access |
| [`WEB_03`](website_seo/WEB_03_Money_Page_Audit.md) | Deep-audit the small set of pages that actually carry revenue intent, against both search relevance and conversion clarity | All brands with an owned website |
| [`WEB_04`](website_seo/WEB_04_Query_Gap_Audit.md) | Find demand the site is not eligible for at all — queries with real commercial intent where no page exists or no page is appropriate | All brands |
| [`WEB_05`](website_seo/WEB_05_Internal_Link_Audit.md) | Map how internal linking distributes crawl access and topical signal, and whether the money pages are actually well-connected | All brands with an owned website |
| [`WEB_06`](website_seo/WEB_06_CTR_Snippet_Audit.md) | Find pages earning impressions but not clicks, and diagnose whether the cause is the snippet, the SERP environment, or an intent mismatch | All brands with GSC access |
| [`WEB_07`](website_seo/WEB_07_Content_Gap_Audit.md) | Identify topical coverage gaps relative to what buyers need to know and what competitors cover — with a hard filter for commercial relevance and a ... | All brands |

## GEO / AI — `geo_ai/`

*All brands. `GEO_01` is the instrument the rest depend on.*

| Module | Purpose | Applies to |
|---|---|---|
| [`GEO_01`](geo_ai/GEO_01_AI_Visibility_Panel.md) | Establish and run a fixed, versioned panel of prompts across AI platforms to measure whether, how, and how accurately each brand appears | All brands |
| [`GEO_02`](geo_ai/GEO_02_Retrieval_Source_Map.md) | Map which sources AI platforms actually cite when answering the panel prompts — for the brand and for competitors | All brands |
| [`GEO_03`](geo_ai/GEO_03_Source_to_Mention_Conversion.md) | Measure whether being present on a source actually converts into being mentioned in AI answers | All brands |
| [`GEO_04`](geo_ai/GEO_04_Entity_Accuracy_Audit.md) | Measure whether AI platforms resolve the correct entity and state correct facts about it | All brands |
| [`GEO_05`](geo_ai/GEO_05_Platform_Share_of_Voice.md) | Measure the brand's share of AI mentions relative to a defined competitor set, per platform and per prompt category — so that visibility is tracked... | All brands |
| [`GEO_06`](geo_ai/GEO_06_Association_Tracking.md) | Track which attributes AI systems associate with the entity — role, genre, geography, category, specialty — against the associations the brand intends | All brands |

## Authority — `authority/`

*All brands.*

| Module | Purpose | Applies to |
|---|---|---|
| [`AUTH_01`](authority/AUTH_01_Backlink_Competitor_Gap.md) | Identify domains linking to competitors but not to the brand, filtered to those that are legitimate, achievable, and worth pursuing | All brands |
| [`AUTH_02`](authority/AUTH_02_Source_Ancestry_Audit.md) | Trace every source mentioning the brand back to its original informational origin, so that apparent breadth is not mistaken for independent corrobo... | All brands |
| [`AUTH_03`](authority/AUTH_03_Editorial_Node_Map.md) | Map the genuine editorial outlets, writers, and curators covering the brand's category — the nodes whose coverage is both independently produced an... | All brands |
| [`AUTH_04`](authority/AUTH_04_Directory_Citation_Map.md) | Map the structured directories, databases, and platforms relevant to each brand, recording presence, accuracy, and — critically — whether each is a... | All brands |
| [`AUTH_05`](authority/AUTH_05_Independent_Corroboration_Score.md) | Produce a single defensible measure of how well the brand's key facts are independently corroborated across the web — the durable basis for both AI... | All brands |

## Ecommerce — `ecommerce/`

*Modest primary.*

| Module | Purpose | Applies to |
|---|---|---|
| [`ECOM_01`](ecommerce/ECOM_01_Product_Schema_Audit.md) | Audit structured data across product, category, and organization surfaces for presence, validity, and — most importantly — factual accuracy against... | Modest (primary) |
| [`ECOM_02`](ecommerce/ECOM_02_Product_Query_Map.md) | Map each product and category to the queries real buyers use, and find products with genuine demand that no page currently serves well | Modest (primary) |
| [`ECOM_03`](ecommerce/ECOM_03_Category_Architecture_Audit.md) | Audit how the catalog is organized — categories, collections, facets, and their URLs — against how buyers actually navigate and search | Modest (primary) |
| [`ECOM_04`](ecommerce/ECOM_04_Product_Copy_Fact_Audit.md) | Audit product copy for factual completeness and accuracy — the attributes a buyer needs and a retrieval system can extract | Modest (primary) |
| [`ECOM_05`](ecommerce/ECOM_05_Image_Retrieval_Audit.md) | Audit product imagery for discoverability and machine-readability: whether images are indexable, described, fast, and whether the facts they carry ... | Modest (primary) |
| [`ECOM_06`](ecommerce/ECOM_06_Shopping_Visibility_Audit.md) | Audit product feed health and shopping-surface visibility, including free listings | Modest (primary) |

## Artist / Entity — `artist_entity/`

*Fendi Frost primary.*

| Module | Purpose | Applies to |
|---|---|---|
| [`ARTIST_01`](artist_entity/ARTIST_01_Entity_Resolution.md) | Determine whether search engines, knowledge graphs, and AI systems resolve the artist name to the correct entity at all | Fendi Frost (primary) |
| [`ARTIST_02`](artist_entity/ARTIST_02_Catalog_Retrieval.md) | Verify the catalog as it exists across platforms and databases, and measure whether search and AI systems retrieve it correctly and completely | Fendi Frost |
| [`ARTIST_03`](artist_entity/ARTIST_03_Genre_Association.md) | Measure which genres, scenes, and sonic descriptors are associated with the artist across platforms and AI systems, against the intended associatio... | Fendi Frost |
| [`ARTIST_04`](artist_entity/ARTIST_04_Profile_Consistency.md) | Audit every artist profile for consistency of name, biography, imagery, links, and role presentation | Fendi Frost |
| [`ARTIST_05`](artist_entity/ARTIST_05_Release_Authority.md) | Audit how releases are attributed, credited, and rights-registered — including how Runway Music is represented | Fendi Frost |
| [`ARTIST_06`](artist_entity/ARTIST_06_Cultural_Retrieval_Nodes.md) | Identify the cultural sources — scene publications, curators, playlists, event listings, community archives — that AI systems and search actually r... | Fendi Frost |

---

## Blocked modules (2026-08-22)

| Module | Blocked by |
|---|---|
| `ECOM_01` | Canonical Modest brand string undecided (`DQ-001`) — schema hard-codes the entity name |
| `ECOM_06` | Platform and feed status unknown (`DQ-014`) |
| `WEB_02`, `WEB_04`, `WEB_06` (Boltz) | GSC access unconfirmed (`DQ-008`) |
| `AUTH_01`, `GEO_05` | No competitor set defined (`DQ-012`) |
| `AUTH_05` | Requires `AUTH_02` ancestry data first |
| `LSEO_01`–`LSEO_08` (Modest) | Physical presence unconfirmed (`DQ-015`) — may be out of scope entirely |
| All Boltz and Fendi Frost modules | Experiment definitions missing (`DQ-004`, `DQ-005`) — contamination checks answer `yes-by-default` until imported |
