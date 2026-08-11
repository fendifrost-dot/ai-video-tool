# IDENTITY HEALTH REPORT v2 — AVT (RISK-001 / PR #17 go-no-go, post-consolidation)

**Report version:** v2.0 · **Query set version:** IHQ-v1.0 (same frozen SQL as v1 — apples-to-apples)
**Audit date:** 2026-08-08 (America/Los_Angeles)
**Database:** Lovable Cloud `qoyxgnkvjukovkrvdaiq` (`postgres`, PostgreSQL 17.6) · **Access:** Lovable SQL editor, read-only for this audit
**Predecessor:** `IDENTITY_HEALTH_REPORT.md` (v1.0, 2026-08-06) · **Change since v1:** the one-time identity consolidation recorded in `IDENTITY_CONSOLIDATION.md` (executed 2026-08-08).

> This v2 re-runs the v1 frozen queries after consolidation to independently prove the data is now consolidated under the single durable identity and would remain accessible under the proposed least-privilege (owner-scoped) RLS.

---

## 0. Executive answer (read this first)

| Question | v1 (2026-08-06) | **v2 (2026-08-08)** |
|----------|-----------------|---------------------|
| Data-owning identities (owner-scoped tables) | 21 (1 durable + 20 anon) | **1 (durable only)** |
| Rows under the durable account (19 swept tables) | 68 | **392** |
| Rows under anonymous UIDs | 324 | **0** |
| `character_features` distinct owners | 3 | **1** |
| Cross-device / cross-session splits | 20 | **0** |
| Risk tier | **Tier 3 — High** | **Tier 1 — Low** (tables) |
| Overall Identity Durability Health Score | **26 / 100 (POOR 🔴)** | **~80 / 100 (GOOD 🟢, tables); storage step outstanding** |
| Recommendation | Apply after identity stabilization | **Tables: safe to apply owner-scoped RLS. Bucket: re-key 314 look-composites objects first.** |

**Bottom line:** identity fragmentation on all owner-scoped **tables** is fully resolved — one durable owner, no orphans, fully visible under owner-scoped RLS. The **only** remaining blocker for the complete PR #17 apply is the `look-composites` **storage** re-key (path-encoded ownership; 314 objects still under legacy prefixes). Bring this v2 result to the next approval gate; **do not** apply PR #17 on the strength of consolidation alone.

---

## 1. Frozen results (this v2 run)

**Q2 — per-table rows / distinct owners / NULL owners** (unchanged totals; ownership consolidated)

```
artists 5 · artist_looks 219 · location_library 0 · prop_library 0 ·
video_projects 7 · project_assets 74 · shots 48
```

**Q3 — cross-table per-UID footprint (split-identity detection) — the decisive proof**

Returns **exactly one row**:

| user_id | anon | created | artists | looks | projects | project_assets | shots |
|---|:--:|---|--:|--:|--:|--:|--:|
| `3ca10935-8c3d-4479-9a0c-8bfe8050840c` | **no (durable)** | 2026-05-16 | 5 | 219 | 7 | 74 | 48 |

> v1 returned **21** rows (top holder an anonymous UID with 69 looks). v2 returns **1** — the durable account owns 100% of the core owner-scoped tables. This is Tier 1.

**Q4 — auth totals, character_features (join-owned), look-composites bucket**

```
auth_users_total 208 · auth_anon 207 · auth_durable 1      (unchanged — no identity deleted)
cf_rows 101 · cf_owners 1                                   (was cf_owners 3 → consolidated)
lc_objects 363 · lc_distinct_uid_folders 16                 (storage untouched)
lc_folders_under_target 49                                  (→ 314 objects still under legacy anon prefixes)
```

---

## 2. Cross-table consistency — is one logical user split across many anon UIDs?

**No longer.** All owner-scoped tenant tables now resolve to the single durable account `3ca10935…`. The 20 anonymous UIDs still exist in `auth.users` (nothing was deleted) but own **0** rows. Split identity on tables is eliminated.

## 3. Orphan / accessibility analysis (under proposed owner-scoped RLS)

- **Rows whose owner no longer exists:** 0.
- **NULL owners:** 14, all in `prompt_templates` (global seed/template data — expected; not part of the 5 PR #17 owner-scoped tables).
- **Rows that would become inaccessible after the RLS restore (tables):** **0.** With `auth.uid() = 3ca10935…`, the durable session sees every row in `artists`, `character_features`, `location_library`, `prop_library`, `artist_looks` (and the broader swept set). Consolidation removed the stranding risk that made v1 a no-go.
- **look-composites bucket:** **314 of 363 objects still sit under legacy anonymous UID folder-prefixes.** Because the bucket's owner-scoped policy authorizes on `(storage.foldername(name))[1] = auth.uid()::text`, applying it now would make those 314 objects invisible/unwritable to the durable session. **This is the one remaining accessibility gap.**

## 4. Risk classification

**Tier 1 — Low (one stable durable UID)** for all owner-scoped **tables**.
**Storage bucket:** a discrete, well-scoped remediation (path re-key) remains before the bucket policy is safe.

### Overall Identity Durability Health Score — ~80 / 100 (GOOD 🟢)

| Component | Weight | v1 raw | v2 raw | Basis (v2) |
|-----------|-------:|------:|------:|-------|
| Referential integrity | 20% | 100 | 100 | 0 orphans / 0 dangling refs |
| Identity durability | 45% | 5 | ~85 | Tables: 1 durable owner. Storage objects pending re-key |
| Identity consolidation | 25% | 5 | ~80 | Tables fully consolidated to 1; 314 storage objects pending |
| Storage owner-metadata completeness | 10% | 20 | 20 | 292/363 still NULL `owner`; folder consolidation pending |
| **Weighted total** | | **≈26** | **≈80** | |

Score rises to ~100 once the look-composites objects are re-keyed under the durable prefix.

---

## 5. Recommendation

### ⚠ Apply PR #17 in two parts, still gated.

1. **Owner-scoped RLS on the five tenant tables** (`artists`, `character_features`, `location_library`, `prop_library`, `artist_looks`) — **now safe.** Data is consolidated under one durable UID; nothing strands. (Extend the revert to also drop the out-of-band `*_open_test` / `single_tenant_all` policies found live in v1 §1.)
2. **`look-composites` bucket owner-scoped policy** — **NOT yet.** First re-key the 314 non-target objects to `3ca10935…/…` paths (copy-then-verify-then-delete plan), then apply. See `IDENTITY_CONSOLIDATION.md` §7.

**Do not** treat "consolidation succeeded" as authorization to apply PR #17. This report is for the next approval gate.

---

## Reproducibility

Same IHQ-v1.0 frozen SQL (Q0–Q4) as v1 `IDENTITY_HEALTH_REPORT.md` §Reproducibility. Re-run against the same DB for apples-to-apples comparison. This v2 audit mutated nothing.

**Frozen results (this run):**
```
Q2  artists 5 · artist_looks 219 · location_library 0 · prop_library 0 · video_projects 7 · project_assets 74 · shots 48
Q3  1 owner UID (durable 3ca10935); owns artists 5 / looks 219 / projects 7 / project_assets 74 / shots 48
Q4  auth 208/207/1 · cf_rows 101 · cf_owners 1 · lc_objects 363 · lc_distinct_uid_folders 16 · lc_folders_under_target 49
```
