# 06 — Source Provenance

Tracks where information about each brand actually comes from, so that apparent breadth is never mistaken
for independent corroboration.

## Contents

| File | Purpose |
|---|---|
| `SOURCE_TYPE_TAXONOMY.md` | The classification every source receives, and the information-origin rule |
| `SOURCE_PROVENANCE_LEDGER.csv` | Append-only ledger of every source observed |

## Ledger schema

`source_id` · `date_observed` · `source URL` · `domain` · `source type` · `original source?` ·
`information_origin_id` · `derivative of` · `independent?` · `entity mentioned` · `query surfaced for` ·
`AI platform surfaced in` · `trust/authority notes`

The ledger currently contains **four example rows only** (`SP-EXAMPLE-*`), included to demonstrate the
schema and the origin-collapsing rule. They are not real data and should be deleted once real sources are
recorded.

## Rules

1. **Append-only.** Corrections are new rows referencing the superseded `source_id`.
2. **Every row gets an `information_origin_id`.** If ancestry is unknown, say so — do not guess, and do
   not count it as independent.
3. **Fed by:** `GEO_02` (retrieval sources), `AUTH_01` (link sources), `AUTH_02` (ancestry),
   `AUTH_04` (directories). **Consumed by:** `AUTH_05` (corroboration score), all reporting.
4. **Never report a raw source count** without the collapsed origin count beside it.
