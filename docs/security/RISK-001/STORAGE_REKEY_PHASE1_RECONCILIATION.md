# STORAGE RE-KEY — PHASE 1 RECONCILIATION (copy + checksum verification)

**RISK-001 Part B, Phase 1.** Executed 2026-08-08 (America/Los_Angeles) against `look-composites`, AVT Lovable Cloud project `qoyxgnkvjukovkrvdaiq`.
**Action performed:** server-side Storage copy of each legacy object to the durable target prefix, with per-object sha256 verification. **Copy only — no move, no delete, no bucket-policy change, no DB reference switch, no RLS change.** Originals fully preserved.
**Approval boundary honored:** stopped after copy+verification; the 285 `artist_looks` reference updates and the bucket-policy tightening remain separate, un-started gates.

---

## 1. Reconciliation table (in-scope objects)

Scope = the 314-object manifest **minus** the held 16th-prefix object `864088d5…` (see §3) = **313 objects**.

| Metric | Expected | Actual | Status |
|---|--:|--:|:--:|
| Objects in scope | 313 | **313** | ✅ |
| Objects copied (incl. idempotent already-exists) | 313 | **313** | ✅ |
| Checksum-matched (sha256 **and** byte-length, source vs destination) | 313 | **313** | ✅ |
| Destination objects readable | 313 | **313** | ✅ |
| Failures / mismatches / unreadable | 0 | **0** | ✅ |
| Bytes expected (Σ source sizes) | 448,126,040 | **448,126,040** copied | ✅ |
| Bytes source == bytes copied | — | **True** | ✅ |

**Copy-status breakdown:** 4 freshly copied, 309 confirmed already-present (idempotent re-run). Every destination was independently re-downloaded and hashed; every source was re-downloaded during verification and remained readable, proving **copy-not-move**.

**Verification method:** for each object, full `sha256` computed over the streamed bytes of the source (`{old-uid}/…`) and of the destination (`3ca10935-8c3d-4479-9a0c-8bfe8050840c/…`); match requires identical digest **and** identical `Content-Length`. This is stronger than an ETag/MD5 comparison and covers any multipart-uploaded object.

---

## 2. Per-source-prefix confirmation (all copied == expected)

| Old UID prefix | Objects | Checksum-matched | Bytes |
|---|--:|--:|--:|
| `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | 139 | 139 | 208,071,186 |
| `99c8af67-c6ce-4ed0-8440-eb0f72667589` | 69 | 69 | 90,041,237 |
| `9044c334-f5ea-41fa-b000-6d5407010343` | 26 | 26 | 46,643,527 |
| `c955dbe6-5b9d-42c1-87c4-2388bcc68369` | 21 | 21 | 25,702,429 |
| `2179ae5d-c9bc-47e4-acdb-6aa1ac841f1b` | 14 | 14 | 14,193,827 |
| `79516c91-c2ad-4b54-93f1-05023fbca28c` | 13 | 13 | 7,756,365 |
| `65cf99cb-fd18-4168-b9ab-dfbfd42112ca` | 9 | 9 | 8,696,108 |
| `a4144901-50f9-4499-9a74-3ce834ef7458` | 7 | 7 | 13,693,184 |
| `08ae347a-f13a-498c-a420-b0ef0bf706c7` | 6 | 6 | 9,192,713 |
| `7da90f41-c450-48e1-95da-0153f5a4d042` | 2 | 2 | 2,044,276 |
| `917cccac-6de0-4b56-ab1e-b4dffdc7ac5a` | 2 | 2 | 2,056,360 |
| `a073744a-03b9-4ad1-a0ef-1f147bdb0c95` | 2 | 2 | 1,729,128 |
| `f58a8449-2c57-4c9d-bd08-abeaa4972166` | 2 | 2 | 2,091,418 |
| `830373d2-4017-4d18-8ff0-7c2220304f62` | 1 | 1 | 16,214,282 |
| **TOTAL** | **313** | **313** | **448,126,040** |

Post-copy bucket state (live): `look-composites` now holds **676** objects — **362** under the target prefix (49 pre-existing + 313 new copies) and **314** legacy originals still present (313 in-scope + 1 held). Nothing was removed.

---

## 3. Held object — 16th prefix `864088d5…` (investigated, NOT copied)

**Object:** `864088d5-02ff-4155-a9c8-572ae2cf1c0c/8d4a4d22-41c0-43ab-ba99-92750f81e335/892d9003-7575-48e2-b1ad-694e0c45bbb9.png` · 1,944,659 bytes · image/png · created **2026-06-13 08:05:27 UTC** · storage id `530da315-6b25-42b7-b4de-1024a00b630d`.

| Question | Finding |
|---|---|
| Origin | An anonymous per-device/session `auth.uid()` (`864088d5…`) that is **not** among the 20 legacy anon UIDs swept by the identity consolidation — a 21st stray identity that produced exactly one composite under Fendi's artist folder. |
| Current ownership (path) | Path-prefix owner is `864088d5…` (a disposable anon UID). The **artist sub-folder** `8d4a4d22…` is **"Fendi Frost"**, which **is** target-owned (`artists.user_id = 3ca10935-8c3d-4479-9a0c-8bfe8050840c`). So the file sits inside a target-owned artist but under a non-target UID prefix. |
| Referenced anywhere? | **No.** Deep scan of all owner-scoped tables: `864088d5` appears in **zero** rows; the filename `892d9003` appears in **zero** rows; `864088d5` is **not** a `user_id` on any row in any table. Fully unreferenced. |
| Belongs to the consolidated dataset? | **Ambiguous / unconfirmed.** By artist association it is plausibly Fendi's; by identity it was outside the consolidation scope; by DB linkage there is **no** evidence tying it to any live `artist_looks` row. It is an orphaned storage object of unknown provenance. |
| Recommendation | Do **not** migrate or delete yet. Confirm whether any deleted/overwritten look once pointed here; if it is a genuine Fendi artifact, re-key it in a follow-up; if it is junk, delete under the later cleanup gate. Kept exactly as-is for now. |

---

## 4. Orphan-candidate labeling (copied, unreferenced)

Of the 313 copied objects, **28 are storage-only / unreferenced** — no `artist_looks` row (or any table) points at them. They were copied (to avoid stranding under folder-prefix RLS) **and are explicitly labeled orphan candidates**. They are **not** deleted. They are all interim pipeline artifacts (flux `pad_src`/`pad_mask`, `flux_src`/`flux_mask`, `mask`, `source1080`, `face_guard`) plus 11 apparently-final composites under `79516c91…` with no surviving DB reference.

Orphan-candidates by source prefix: `79516c91…` ×11, `99c8af67…` ×10, `832fa0bc…` ×7 (one `fa92e2c6…` artifact set), `65cf99cb…` ×1. Full list of their new (target-prefixed) paths: [`STORAGE_REKEY_PHASE1_ORPHANS.txt`](STORAGE_REKEY_PHASE1_ORPHANS.txt).

**Note:** the held `864088d5…` object (§3) is the 29th unreferenced object overall; it is tracked separately and was **not** copied.

---

## 5. What did NOT happen (approval boundary)

- ❌ No object moved, renamed, or deleted — originals intact.
- ❌ No `artist_looks` reference switched (285 referenced objects still point at legacy paths — **next gate, evidence-first**).
- ❌ No `look-composites` bucket policy tightened; no RLS altered; nothing re-opened.
- ❌ The 16th-prefix object not migrated.

---

## 6. Next gate (do not start without approval)

1. Switch the 285 referenced paths in `artist_looks` (`generated_storage_path`, `generated_image_url`, `composition_recipe_json`, `error_message`) via the deterministic `{old-uid}/` → `3ca10935-8c3d-4479-9a0c-8bfe8050840c/` prefix replace, pre-image captured, reconciled to 0 remaining legacy prefixes.
2. Prove durable-account readability of all 313 new paths under folder-prefix RLS.
3. Only then tighten the `look-composites` bucket policy (RISK-001 SEC scope).
4. Delete the 314 legacy originals as a **separate** cleanup gate after the above verifies clean and the retention window passes.
