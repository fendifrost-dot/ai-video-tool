# ECOM_04 — Product Copy & Fact Audit

**Category:** Ecommerce · **Applies to:** Modest (primary). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit product copy for factual completeness and accuracy — the attributes a buyer needs and a retrieval system can extract. For AI retrieval, missing product facts are the binding constraint far more often than missing keywords.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- All product page copy
- Actual product attributes from the owner (materials, sizing, construction, care, origin)
- Buyer questions from reviews, email, and returns data
- Competitor product copy for attribute-coverage comparison

## Procedure

1. Build the attribute checklist a buyer needs: materials, fit and sizing, measurements, construction, care, origin, and the signature elements (for Modest, the rabbit-fur patch where applicable).
2. Audit each product page against the checklist and record which attributes are present, absent, or vague.
3. **Verify accuracy of stated attributes with the owner.** Wrong material or care information is a returns and trust problem before it is an SEO problem — and for fur or animal-derived materials, accurate and complete description is a legal and disclosure matter in several jurisdictions. Flag any such item for explicit owner verification.
4. Identify copy that is duplicated across products — common with variants, and it produces near-duplicate pages plus an unhelpful buyer experience.
5. Check whether copy answers the questions that actually appear in reviews, emails, and returns. Returns data is the strongest available signal of what the copy failed to communicate.
6. Assess machine-extractability: are attributes stated plainly in text, or only implied by images? A retrieval system cannot extract a fact that exists only in a photograph.
7. Check consistency between copy, schema (`ECOM_01`), and any product feed (`ECOM_06`). These three must agree.
8. Flag placeholder, templated, or unedited supplier copy.

## Guards — known traps

- **Never invent product attributes.** Every stated fact comes from the owner or the product itself. A fabricated material or measurement is a real-world harm, not an SEO error.
- Fur and animal-derived materials require accurate, explicit description — verify with the owner and never soften or omit.
- Copy, schema, and feed must agree. Fixing one and not the others creates a new inconsistency.
- Do not pad copy for length. Attribute completeness is the standard, not word count.
- Do not generate product copy at volume without owner fact verification — that is exactly how false attributes enter a catalog permanently.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PRODUCT / URL`
- `ATTRIBUTES PRESENT / MISSING / VAGUE`
- `ACCURACY VERIFIED BY OWNER? (yes/no)`
- `DUPLICATED COPY? (with which products)`
- `BUYER QUESTION UNANSWERED (source)`
- `MACHINE-EXTRACTABLE? (text vs image-only)`
- `MATERIAL-DISCLOSURE FLAG`

## Default next measurement

Attribute completeness rate across the catalog, plus per-product conversion rate and return rate at 56 days for products whose copy changed.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_04`.
