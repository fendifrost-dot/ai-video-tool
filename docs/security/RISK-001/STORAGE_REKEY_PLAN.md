# STORAGE RE-KEY PLAN — `look-composites` legacy objects (RISK-001, Part B)

**Status:** PLAN / MANIFEST / COLLISION ANALYSIS ONLY — **nothing moved, copied, renamed, or deleted; no bucket policy or RLS touched.**
**Scope object:** `look-composites` storage bucket, AVT Lovable Cloud project `qoyxgnkvjukovkrvdaiq`.
**Durable target UID:** `3ca10935-8c3d-4479-9a0c-8bfe8050840c`.
**Prepared:** 2026-08-08 (America/Los_Angeles). **Access used:** read-only PostgREST + Storage `list` via the project's publishable key (Lovable-managed project; no standalone Supabase, no service role, no policy change).
**Companion machine file:** [`STORAGE_REKEY_MANIFEST.csv`](STORAGE_REKEY_MANIFEST.csv) (314 rows: old_path, new_path, bytes, mimetype, role, db_referenced, ref_columns).
**Prerequisite context:** [`IDENTITY_CONSOLIDATION.md`](IDENTITY_CONSOLIDATION.md) §7.

> **Why this exists.** `look-composites` RLS authorizes by **path prefix** — `(storage.foldername(name))[1] = auth.uid()::text` — **not** by the `storage.objects.owner` column. The identity consolidation re-owned DB rows to the durable account but did **not** move storage objects. 314 of 363 objects still sit under 15 legacy anonymous-UID prefixes. If the RISK-001 bucket policy is tightened **before** these are re-keyed, all 314 become invisible/unwritable to the durable session and strand. This plan re-keys them to `3ca10935…/…` first. **The bucket policy stays parked until this re-key independently verifies clean.**

---

## 0. Hard safeguards this plan honors

- **Copy, never move.** Server-side Storage copy preserves bytes exactly; originals remain until a **separate later cleanup gate**.
- **Verify before switching references.** Each copy is checksum/size-verified before any DB pointer changes.
- **Never weaken RLS.** No policy is opened to make legacy paths work. The re-key is done with the **service role** (via a Lovable edge function / Lovable SQL), which bypasses RLS legitimately — the anon path prefix rule is never relaxed.
- **Reversible.** Old objects retained; DB updates are a deterministic prefix swap with an exact inverse; a pre-image table captures every changed value.
- **Read-only until approved.** This document is the artifact; execution is a distinct approval gate.

---

## 1. Inventory (measured, read-only)

| Metric | Value |
|---|--:|
| Total objects in `look-composites` | **363** |
| Distinct top-level UID prefixes | **16** |
| Objects already under target `3ca10935…/` | **49** |
| **Objects to re-key (non-target)** | **314** |
| Legacy prefixes to re-key from | **15** |
| Total bytes to copy | **450,070,699** (~429 MiB) |
| MIME split | 249 `image/png`, 65 `image/jpeg` |
| Zero-byte / null-size objects | 0 |

**Re-key groups (old UID → count):**

| Old UID prefix | Objects | In 20-UID consolidation set? |
|---|--:|:--:|
| `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | 139 | yes |
| `99c8af67-c6ce-4ed0-8440-eb0f72667589` | 69 | yes |
| `9044c334-f5ea-41fa-b000-6d5407010343` | 26 | yes |
| `c955dbe6-5b9d-42c1-87c4-2388bcc68369` | 21 | yes |
| `2179ae5d-c9bc-47e4-acdb-6aa1ac841f1b` | 14 | yes |
| `79516c91-c2ad-4b54-93f1-05023fbca28c` | 13 | yes |
| `65cf99cb-fd18-4168-b9ab-dfbfd42112ca` | 9 | yes |
| `a4144901-50f9-4499-9a74-3ce834ef7458` | 7 | yes |
| `08ae347a-f13a-498c-a420-b0ef0bf706c7` | 6 | yes |
| `7da90f41-c450-48e1-95da-0153f5a4d042` | 2 | yes |
| `917cccac-6de0-4b56-ab1e-b4dffdc7ac5a` | 2 | yes |
| `a073744a-03b9-4ad1-a0ef-1f147bdb0c95` | 2 | yes |
| `f58a8449-2c57-4c9d-bd08-abeaa4972166` | 2 | yes |
| `830373d2-4017-4d18-8ff0-7c2220304f62` | 1 | yes |
| `864088d5-02ff-4155-a9c8-572ae2cf1c0c` | 1 | **NO — see §7 anomaly A1** |
| **TOTAL** | **314** | |

**Object roles within the 314** (so reviewers know these are not all final composites): 226 composite/other, 57 mask, 16 flux-interim, 8 sam3-mask, 3 imported-look, 3 face-guard, 1 hero-frame. Interim artifacts must be re-keyed too — under folder-prefix RLS they strand identically.

---

## 2. Manifest — old path → new path (all 314)

**Transform rule (deterministic, lossless):** replace **only the first path segment** (the UID) with the target UID; keep the entire remainder byte-for-byte.

```
{old-uid}/{rest...}   →   3ca10935-8c3d-4479-9a0c-8bfe8050840c/{rest...}
```

This is depth-agnostic and therefore also correct for the non-standard-depth objects (see §7): a depth-2 object `{uid}/file.png` and a depth-4 object `{uid}/{artist}/sam3/file.png` both re-key by swapping segment 0 only. Because `{rest...}` is preserved (and every `{rest}` is globally unique — see §3), the mapping is a bijection with an exact inverse.

The complete enumerated list (grouped by source prefix; `[storage-only]` = no DB row references it, see §4). Full old/new pairs with sizes are in the companion CSV.

### 832fa0bc-1f7e-4586-ab8b-2ac323698ede/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (139 objects)

  1. 8d4a4d22-41c0-43ab-ba99-92750f81e335/02b72411-8c4c-4206-a368-b31aa1cde677.jpg
  2. 8d4a4d22-41c0-43ab-ba99-92750f81e335/03373cde-03c2-4d50-8079-2ba1816ad2a8.png
  3. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_flux_mask.png
  4. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_flux_src.png
  5. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_mask.png
  6. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_pad_mask.png
  7. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_pad_src.png
  8. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0bb84161-7c2c-4968-b373-a8944c0a6771_source1080.png
  9. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1347d0fc-71cc-4b18-92b8-91b100c26b28.jpg
 10. 8d4a4d22-41c0-43ab-ba99-92750f81e335/136b960d-4e6b-4b2d-b0ab-bf19fd28af28.png
 11. 8d4a4d22-41c0-43ab-ba99-92750f81e335/136b960d-4e6b-4b2d-b0ab-bf19fd28af28_vton_raw.png
 12. 8d4a4d22-41c0-43ab-ba99-92750f81e335/196a21d6-cef4-479c-acb6-328e9c8f7756.png
 13. 8d4a4d22-41c0-43ab-ba99-92750f81e335/20f6c4a0-653b-466c-8abd-689802200ef0.png
 14. 8d4a4d22-41c0-43ab-ba99-92750f81e335/24863956-6253-47b1-97db-00da73402f2f.png
 15. 8d4a4d22-41c0-43ab-ba99-92750f81e335/265ec9b6-5dc9-4152-8238-64132c74ba50.png
 16. 8d4a4d22-41c0-43ab-ba99-92750f81e335/265ec9b6-5dc9-4152-8238-64132c74ba50_vton_raw.png
 17. 8d4a4d22-41c0-43ab-ba99-92750f81e335/26c9c706-2921-4d38-bc69-0afaa5d8cb82.png
 18. 8d4a4d22-41c0-43ab-ba99-92750f81e335/27f0a490-fed7-4748-8ecd-d58fc16d3908.jpg
 19. 8d4a4d22-41c0-43ab-ba99-92750f81e335/291614a8-b616-4a4a-bc2d-ca9413cae6be.jpg
 20. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2c7199ee-6a45-4942-ada5-a766a0614a93.png
 21. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2db02cac-bf62-42d1-a860-bf16f167152c.jpg
 22. 8d4a4d22-41c0-43ab-ba99-92750f81e335/349806db-2ab0-4831-a67c-1437c3701ab7.jpg
 23. 8d4a4d22-41c0-43ab-ba99-92750f81e335/39a70fad-8781-4593-bf5b-12f66939d19b.png
 24. 8d4a4d22-41c0-43ab-ba99-92750f81e335/47aa0098-590c-46f9-b3a1-004504781848.jpg
 25. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_flux_mask.png
 26. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_flux_src.png
 27. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_mask.png
 28. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_pad_mask.png
 29. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_pad_src.png
 30. 8d4a4d22-41c0-43ab-ba99-92750f81e335/486a124a-56cb-4fb2-bfe1-a5950e9ee440_source1080.png
 31. 8d4a4d22-41c0-43ab-ba99-92750f81e335/516654c3-86ef-4a22-97f5-a63fd4afcac7.png
 32. 8d4a4d22-41c0-43ab-ba99-92750f81e335/516654c3-86ef-4a22-97f5-a63fd4afcac7_vton_raw.png
 33. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5475a46d-40ac-433b-b245-9b4e583b7c2f.png
 34. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5475a46d-40ac-433b-b245-9b4e583b7c2f_vton_raw.png
 35. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_flux_mask.png
 36. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_flux_src.png
 37. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_mask.png
 38. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_pad_mask.png
 39. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_pad_src.png
 40. 8d4a4d22-41c0-43ab-ba99-92750f81e335/56710f10-3290-486e-b725-ca57c28bec11_source1080.png
 41. 8d4a4d22-41c0-43ab-ba99-92750f81e335/58c4c140-4ef1-4be3-a870-fd18d8c567cf.png
 42. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5bc38944-6235-409f-b43d-5c219e57bf34.jpg
 43. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54.png
 44. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_flux_mask.png
 45. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_flux_src.png
 46. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_mask.png
 47. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_pad_mask.png
 48. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_pad_src.png
 49. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69190143-b19b-4b37-8dbe-2aa7a102bf54_source1080.png
 50. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6bb75998-1ce3-47d1-8081-56a461e5259c.jpg
 51. 8d4a4d22-41c0-43ab-ba99-92750f81e335/7ac3f98b-745b-4d92-b7c8-ca80a03e2c5b.png
 52. 8d4a4d22-41c0-43ab-ba99-92750f81e335/7d73e592-2655-4f9b-8d23-23e9171df541.jpg
 53. 8d4a4d22-41c0-43ab-ba99-92750f81e335/7ef86895-9515-427d-ba06-938a7df44702.jpg
 54. 8d4a4d22-41c0-43ab-ba99-92750f81e335/80c34372-43a9-4a6a-94e2-30766d8d6526.jpg
 55. 8d4a4d22-41c0-43ab-ba99-92750f81e335/816d40b6-f236-48b3-825e-da836672767c.png
 56. 8d4a4d22-41c0-43ab-ba99-92750f81e335/86d67e67-bb03-4a56-a708-f4f82cec38e5.jpg
 57. 8d4a4d22-41c0-43ab-ba99-92750f81e335/86f1d4db-841c-4ec5-9151-088b2a3a6b04.jpg
 58. 8d4a4d22-41c0-43ab-ba99-92750f81e335/872a6f2e-e0fd-4403-abdc-bdc921e09656.png
 59. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8f1a1c11-9ffb-4a7e-95b5-20c0ced40687.png
 60. 8d4a4d22-41c0-43ab-ba99-92750f81e335/91069f13-4e77-4949-8764-5a213cd70e7f.png
 61. 8d4a4d22-41c0-43ab-ba99-92750f81e335/95406911-706b-420f-8214-16c03b2e53d4.jpg
 62. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_face_guard.png
 63. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_flux_mask.png
 64. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_flux_src.png
 65. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_mask.png
 66. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_pad_mask.png
 67. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_pad_src.png
 68. 8d4a4d22-41c0-43ab-ba99-92750f81e335/954a6ddf-3b58-451e-a8e8-c5e89b8fb58b_source1080.png
 69. 8d4a4d22-41c0-43ab-ba99-92750f81e335/965dc36a-0aca-4821-8472-96e736de984a.jpg
 70. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9aa9754d-d73e-4d10-8ff1-00d69364504a.jpg
 71. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_face_guard.png
 72. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_flux_mask.png
 73. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_flux_src.png
 74. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_mask.png
 75. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_pad_mask.png
 76. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_pad_src.png
 77. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9b055f52-44e6-4255-aa73-ea65806691b4_source1080.png
 78. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a0e66633-64fa-41e5-90a6-1fb914ae1959.jpg
 79. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a540b213-f3ee-491d-8f42-c892ea755e6f.png
 80. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a540b213-f3ee-491d-8f42-c892ea755e6f_vton_raw.png
 81. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b18f20a6-2bea-4813-873d-2a227846b5f2.png
 82. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b48616b9-f477-4073-97ee-b4e58ff7bcdb.jpg
 83. 8d4a4d22-41c0-43ab-ba99-92750f81e335/beb96dfc-e827-4f14-a4c9-e79b8703a8cc.jpg
 84. 8d4a4d22-41c0-43ab-ba99-92750f81e335/bf742ac5-e60a-4662-ad1f-5351e47b2b3e.jpg
 85. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c0879276-cd02-49b5-9d75-1ba77ea51f6b.jpg
 86. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_flux_mask.png
 87. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_flux_src.png
 88. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_mask.png
 89. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_pad_mask.png
 90. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_pad_src.png
 91. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c3e77795-3f32-4a9c-89ae-f4e512a758e6_source1080.png
 92. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c8705f75-d062-43fe-a411-3add18c258b0.jpg
 93. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ca8c1b64-9dde-489b-927b-f2448d0c6fa5.png
 94. 8d4a4d22-41c0-43ab-ba99-92750f81e335/cd9307c4-75ec-4bed-81bd-c45e96271121.png
 95. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d0daa642-4ca0-45ba-97b1-71e88a0c034d.png
 96. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d67c3f87-61f6-4320-a2dc-8601ae41b774.jpg
 97. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb.png
 98. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_flux_mask.png
 99. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_flux_src.png
100. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_mask.png
101. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_pad_mask.png
102. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_pad_src.png
103. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd13a32f-ce6a-42c6-b1e8-8629cc8f72eb_source1080.png
104. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_flux_mask.png
105. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_flux_src.png
106. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_mask.png
107. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_pad_mask.png
108. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_pad_src.png
109. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dd9ecfa8-f746-47aa-ab1f-ae59e2003e3f_source1080.png
110. 8d4a4d22-41c0-43ab-ba99-92750f81e335/de0786d4-3be9-41e3-ae94-0830bc11d791.png
111. 8d4a4d22-41c0-43ab-ba99-92750f81e335/de08422c-f5f4-4cd2-b215-34c195cc84e5.png
112. 8d4a4d22-41c0-43ab-ba99-92750f81e335/dfae982d-a7ed-4518-a233-ac0fe3f8e02f.jpg
113. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e92e846d-6bb7-4f83-9f10-0e19753f8dfe.png
114. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e92e846d-6bb7-4f83-9f10-0e19753f8dfe_vton_raw.png
115. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468.png
116. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_flux_mask.png
117. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_flux_src.png
118. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_mask.png
119. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_pad_mask.png
120. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_pad_src.png
121. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f248cdc2-6acc-4e18-a700-ab00de186468_source1080.png
122. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f448c387-de20-4bd2-a9c7-22f3f7178719.jpg
123. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_face_guard.png  [storage-only]
124. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_flux_mask.png  [storage-only]
125. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_flux_src.png  [storage-only]
126. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_mask.png  [storage-only]
127. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_pad_mask.png  [storage-only]
128. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_pad_src.png  [storage-only]
129. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa92e2c6-9f16-4a88-801c-e2a3b5da257c_source1080.png  [storage-only]
130. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fb128288-6f95-4fc2-bf50-feebec6ab892.png
131. 8d4a4d22-41c0-43ab-ba99-92750f81e335/feb3074e-fdb8-4c82-a6dc-42b4bd4d3e5b.png
132. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/1e2ed4cb-1aed-453c-beae-5d722ab875e3_clothing.png
133. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/53aa8d86-b541-4bc9-a25a-9b19ec06984a_clothing.png
134. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/6e5d2478-e0ce-4590-a6a8-5cec97555e08_clothing.png
135. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/8e7afa86-2766-4bd7-affa-fc0ade7984e0_clothing.png
136. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/b9c3e7e7-408c-4c40-b6a8-ab74ccad74e6_clothing.png
137. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/cf638875-1266-480e-a59f-1971532066fa_clothing.png
138. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/d279f13a-64a4-4745-9bff-44ca8769bb4d_clothing.png
139. 8d4a4d22-41c0-43ab-ba99-92750f81e335/sam3/f93af909-c5d0-4626-8599-552981ff8359_clothing.png

### 99c8af67-c6ce-4ed0-8440-eb0f72667589/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (69 objects)

140. 8d4a4d22-41c0-43ab-ba99-92750f81e335/00e97eeb-0ef9-4335-b8e1-e4ef69984e28_mask.png
141. 8d4a4d22-41c0-43ab-ba99-92750f81e335/00e97eeb-0ef9-4335-b8e1-e4ef69984e28_pad_mask.png
142. 8d4a4d22-41c0-43ab-ba99-92750f81e335/00e97eeb-0ef9-4335-b8e1-e4ef69984e28_pad_src.png
143. 8d4a4d22-41c0-43ab-ba99-92750f81e335/00e97eeb-0ef9-4335-b8e1-e4ef69984e28_source1080.png
144. 8d4a4d22-41c0-43ab-ba99-92750f81e335/02e52028-b110-4281-be2b-07e82fdfac50.jpg
145. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_flux_mask.png
146. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_flux_src.png
147. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_mask.png
148. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_pad_mask.png
149. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_pad_src.png
150. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0c1622fa-1858-4654-bf04-0b6eb6aadf5e_source1080.png
151. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2499db05-dc3c-4eea-8bf8-0e72f9e10a5f.png
152. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2499db05-dc3c-4eea-8bf8-0e72f9e10a5f_vton_raw.png
153. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2925abb5-2a21-40e6-a20b-2d84360a900b.jpg
154. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_flux_mask.png
155. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_flux_src.png
156. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_mask.png
157. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_pad_mask.png
158. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_pad_src.png
159. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3244adbd-dd3f-4da0-8442-c66fcde0988a_source1080.png
160. 8d4a4d22-41c0-43ab-ba99-92750f81e335/328c7aa4-4756-41ec-9260-93422741a93c.jpg
161. 8d4a4d22-41c0-43ab-ba99-92750f81e335/361b869c-859c-4e5b-a552-50e36d6cde08_pad_mask.png  [storage-only]
162. 8d4a4d22-41c0-43ab-ba99-92750f81e335/361b869c-859c-4e5b-a552-50e36d6cde08_pad_src.png  [storage-only]
163. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3b75927d-0095-40c4-b768-24391e923055.jpg
164. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3ef2c9be-eb98-4fec-9cba-696bc464ae27.png
165. 8d4a4d22-41c0-43ab-ba99-92750f81e335/46bbb239-a34b-4560-bb59-369a291c530d_mask.png
166. 8d4a4d22-41c0-43ab-ba99-92750f81e335/46bbb239-a34b-4560-bb59-369a291c530d_pad_mask.png
167. 8d4a4d22-41c0-43ab-ba99-92750f81e335/46bbb239-a34b-4560-bb59-369a291c530d_pad_src.png
168. 8d4a4d22-41c0-43ab-ba99-92750f81e335/46bbb239-a34b-4560-bb59-369a291c530d_source1080.png
169. 8d4a4d22-41c0-43ab-ba99-92750f81e335/4cb6a3ff-008e-4a20-9ee2-bb117cf756eb.jpg
170. 8d4a4d22-41c0-43ab-ba99-92750f81e335/518a4716-cf19-4ce7-b0a6-aa7ef33a8860.jpg
171. 8d4a4d22-41c0-43ab-ba99-92750f81e335/58b398f5-c228-4aec-8ff5-20ab25a3439e.png
172. 8d4a4d22-41c0-43ab-ba99-92750f81e335/58c60cb0-cba6-46a8-8659-b13a26b01b21.jpg
173. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_flux_mask.png
174. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_flux_src.png
175. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_mask.png
176. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_pad_mask.png
177. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_pad_src.png
178. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5d93c9f1-9cad-4d23-84d0-535459952688_source1080.png
179. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69bceb22-c829-44f0-96e4-1569ca95ad7e.png
180. 8d4a4d22-41c0-43ab-ba99-92750f81e335/69bceb22-c829-44f0-96e4-1569ca95ad7e_vton_raw.png
181. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_flux_mask.png
182. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_flux_src.png
183. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_mask.png
184. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_pad_mask.png
185. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_pad_src.png
186. 8d4a4d22-41c0-43ab-ba99-92750f81e335/77651521-d591-42f1-a774-29ef57a8cf42_source1080.png
187. 8d4a4d22-41c0-43ab-ba99-92750f81e335/7d0def87-bc93-4913-a5a8-f445a6c044bb_pad_mask.png  [storage-only]
188. 8d4a4d22-41c0-43ab-ba99-92750f81e335/7d0def87-bc93-4913-a5a8-f445a6c044bb_pad_src.png  [storage-only]
189. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8caf5eef-b7c0-4f0d-955b-50765ea07882.png
190. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8caf5eef-b7c0-4f0d-955b-50765ea07882_vton_raw.png
191. 8d4a4d22-41c0-43ab-ba99-92750f81e335/94b2f768-943e-4703-965c-e33dcd483d1f_pad_mask.png  [storage-only]
192. 8d4a4d22-41c0-43ab-ba99-92750f81e335/94b2f768-943e-4703-965c-e33dcd483d1f_pad_src.png  [storage-only]
193. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a20b886b-22ae-4f1e-a30d-c0cc9901f0f2.png
194. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a20b886b-22ae-4f1e-a30d-c0cc9901f0f2_vton_raw.png
195. 8d4a4d22-41c0-43ab-ba99-92750f81e335/aa6358eb-0e36-4efd-96ee-2009cb91bdfc.png
196. 8d4a4d22-41c0-43ab-ba99-92750f81e335/acb91da1-e3a1-43ed-8cf0-c38d05cf36c4_pad_mask.png  [storage-only]
197. 8d4a4d22-41c0-43ab-ba99-92750f81e335/acb91da1-e3a1-43ed-8cf0-c38d05cf36c4_pad_src.png  [storage-only]
198. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ad1f91c3-3450-465e-9533-1df400a4f94c.png
199. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ad1f91c3-3450-465e-9533-1df400a4f94c_vton_raw.png
200. 8d4a4d22-41c0-43ab-ba99-92750f81e335/aeb1a431-2418-4bf8-8029-4de8e555a9ee.png
201. 8d4a4d22-41c0-43ab-ba99-92750f81e335/aeb1a431-2418-4bf8-8029-4de8e555a9ee_vton_raw.png
202. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b62864a9-8a3e-434a-9f37-36c1e9478dc2.jpg
203. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d1cce95e-19fb-46e4-b83e-3d32a944f49b.jpg
204. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ddcfdb47-98f9-4087-aaef-7b4b9054a4aa.jpg
205. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f689af0b-7827-4fa8-a39b-c6051f0958ca.png
206. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f9d2aa04-4fe3-4893-9a64-673392e0b070_pad_depth.png
207. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f9d2aa04-4fe3-4893-9a64-673392e0b070_pad_mask.png  [storage-only]
208. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f9d2aa04-4fe3-4893-9a64-673392e0b070_pad_src.png  [storage-only]

### 9044c334-f5ea-41fa-b000-6d5407010343/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (26 objects)

209. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1639b147-05df-4f9e-bbc9-a79e5400d686_detail_debug.png
210. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1639b147-05df-4f9e-bbc9-a79e5400d686_logo_composite.png
211. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1639b147-05df-4f9e-bbc9-a79e5400d686_vton_raw.png
212. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1c95712e-be4c-43fc-9c8b-d02b59c6264d.png
213. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3096712c-b353-4f80-ad1b-aff297c43ba1_logo_composite.png
214. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3096712c-b353-4f80-ad1b-aff297c43ba1_vton_raw.png
215. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3887eecd-679c-45e3-8d9f-d67c5b5a1806_logo_composite.png
216. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3887eecd-679c-45e3-8d9f-d67c5b5a1806_vton_raw.png
217. 8d4a4d22-41c0-43ab-ba99-92750f81e335/4b94d870-dc16-4e95-a456-ec71e8dc871f_detail_debug.png
218. 8d4a4d22-41c0-43ab-ba99-92750f81e335/4b94d870-dc16-4e95-a456-ec71e8dc871f_logo_composite.png
219. 8d4a4d22-41c0-43ab-ba99-92750f81e335/4b94d870-dc16-4e95-a456-ec71e8dc871f_vton_raw.png
220. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5fcc8bbc-65a2-487a-9325-b5177613ff81_logo_composite.png
221. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5fcc8bbc-65a2-487a-9325-b5177613ff81_vton_raw.png
222. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6770ab07-2aff-475a-8e79-ee01b5bb2515.png
223. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6f0ce4d3-2e88-46c6-9560-94b330536469.jpg
224. 8d4a4d22-41c0-43ab-ba99-92750f81e335/90da08a3-b429-46dd-aff6-57406235a98f.png
225. 8d4a4d22-41c0-43ab-ba99-92750f81e335/90da08a3-b429-46dd-aff6-57406235a98f_vton_raw.png
226. 8d4a4d22-41c0-43ab-ba99-92750f81e335/95f0b94a-ed8e-44ef-a43c-e61d7d8a282e_detail_debug.png
227. 8d4a4d22-41c0-43ab-ba99-92750f81e335/95f0b94a-ed8e-44ef-a43c-e61d7d8a282e_logo_composite.png
228. 8d4a4d22-41c0-43ab-ba99-92750f81e335/95f0b94a-ed8e-44ef-a43c-e61d7d8a282e_vton_raw.png
229. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ac427f2a-82c1-4f04-97f9-531d3d976a25_logo_composite.png
230. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ac427f2a-82c1-4f04-97f9-531d3d976a25_vton_raw.png
231. 8d4a4d22-41c0-43ab-ba99-92750f81e335/cf46066e-e055-44b5-97bf-c7ee5f9956a4_detail_debug.png
232. 8d4a4d22-41c0-43ab-ba99-92750f81e335/cf46066e-e055-44b5-97bf-c7ee5f9956a4_logo_composite.png
233. 8d4a4d22-41c0-43ab-ba99-92750f81e335/cf46066e-e055-44b5-97bf-c7ee5f9956a4_vton_raw.png
234. 8d4a4d22-41c0-43ab-ba99-92750f81e335/imported_1781743872682.jpg

### c955dbe6-5b9d-42c1-87c4-2388bcc68369/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (21 objects)

235. 8d4a4d22-41c0-43ab-ba99-92750f81e335/050ab877-0f00-4330-bdf3-92c489e9b909.png
236. 8d4a4d22-41c0-43ab-ba99-92750f81e335/050ab877-0f00-4330-bdf3-92c489e9b909_vton_raw.png
237. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3c9ea094-78e5-4658-b65b-d124072ba330.png
238. 8d4a4d22-41c0-43ab-ba99-92750f81e335/3c9ea094-78e5-4658-b65b-d124072ba330_vton_raw.png
239. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8a02674c-117d-41c6-9197-c3b52c49b533_detail_debug.png
240. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8a02674c-117d-41c6-9197-c3b52c49b533_logo_composite.png
241. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8a02674c-117d-41c6-9197-c3b52c49b533_vton_raw.png
242. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8cecfddb-aec2-4ed7-9606-224d5e550439.png
243. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8cecfddb-aec2-4ed7-9606-224d5e550439_vton_raw.png
244. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ad3f0840-6a7a-46f1-a95c-cc16aa8d55f3_detail_debug.png
245. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ad3f0840-6a7a-46f1-a95c-cc16aa8d55f3_logo_composite.png
246. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ad3f0840-6a7a-46f1-a95c-cc16aa8d55f3_vton_raw.png
247. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b4188df7-8005-45b9-b0a0-98542a503350.png
248. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b4188df7-8005-45b9-b0a0-98542a503350_vton_raw.png
249. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e36cde91-e282-4f4e-bf39-517fa50d3643_detail_debug.png
250. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e36cde91-e282-4f4e-bf39-517fa50d3643_logo_composite.png
251. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e36cde91-e282-4f4e-bf39-517fa50d3643_vton_raw.png
252. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f2794ac7-63d9-4798-91a7-28ed3a1bb8cf_detail_debug.png
253. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f2794ac7-63d9-4798-91a7-28ed3a1bb8cf_logo_composite.png
254. 8d4a4d22-41c0-43ab-ba99-92750f81e335/f2794ac7-63d9-4798-91a7-28ed3a1bb8cf_vton_raw.png
255. hero_frame_768_1782083213.png

### 2179ae5d-c9bc-47e4-acdb-6aa1ac841f1b/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (14 objects)

256. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0ef973fa-ecac-4f17-9e76-658960d192d0.png
257. 8d4a4d22-41c0-43ab-ba99-92750f81e335/13af0bf8-70f8-48bc-a224-e5ff8c5661c4.png
258. 8d4a4d22-41c0-43ab-ba99-92750f81e335/141e8fb8-e014-4b9f-8f66-d8e94682d703.jpg
259. 8d4a4d22-41c0-43ab-ba99-92750f81e335/52595021-3fae-4251-9f26-eceda55c8a66.jpg
260. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6933c7a0-5a49-40e3-8370-a09a78959237.jpg
261. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6e601b52-ce70-4f12-86c2-ff26bf011298.png
262. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8f748d64-3b9c-4833-8ae0-8a74cd95da7b.jpg
263. 8d4a4d22-41c0-43ab-ba99-92750f81e335/91e570a1-7814-41a9-974a-054721bb6f41.jpg
264. 8d4a4d22-41c0-43ab-ba99-92750f81e335/aadaab23-38b0-4d0f-a534-3392ed2beb61.jpg
265. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c0f619b9-444e-43ed-b424-a2e4ce2c6411.jpg
266. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c8a3cb8a-9916-4f23-9032-ccbe49155997.jpg
267. 8d4a4d22-41c0-43ab-ba99-92750f81e335/da40cb6c-79d0-4a13-b803-6ba44cf4c031.png
268. 8d4a4d22-41c0-43ab-ba99-92750f81e335/e1cf0054-041f-4053-8504-1c175c122c1d.jpg
269. 8d4a4d22-41c0-43ab-ba99-92750f81e335/eedfc871-c092-476a-8bcc-8e353998eeb5.jpg

### 79516c91-c2ad-4b54-93f1-05023fbca28c/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (13 objects)

270. 8d4a4d22-41c0-43ab-ba99-92750f81e335/78a1f668-0daf-4f27-abda-eee7021808c2.jpg  [storage-only]
271. 8d4a4d22-41c0-43ab-ba99-92750f81e335/80fd106d-939e-42ce-a088-0e1d6fedef4c.jpg  [storage-only]
272. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9048975b-79c5-4019-ad66-f637f2e13dd4.jpg  [storage-only]
273. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9928c98e-784b-4b06-ac76-6572a33b4e01.jpg  [storage-only]
274. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b10d0f71-bfa2-4b22-8d3c-e3606d808310.jpg  [storage-only]
275. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ba722ec7-78b5-4a6b-93a8-a712feaa71ad.jpg  [storage-only]
276. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c8f72fcf-0614-47c4-8ed6-ab3e0b71280c.jpg  [storage-only]
277. 8d4a4d22-41c0-43ab-ba99-92750f81e335/ce601fd0-be23-48eb-90f3-9ddb2867f93f.jpg  [storage-only]
278. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d12a45e3-8c03-4304-b4b2-5557b16ad453.jpg  [storage-only]
279. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d83e9a8b-2c92-4b35-a10c-7eb235e3942b.jpg
280. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d95c273f-5323-4308-b5dc-ac76ed804545.jpg  [storage-only]
281. 8d4a4d22-41c0-43ab-ba99-92750f81e335/eaae159d-6b8c-45fe-a315-c67cf3aa3d00.jpg
282. 8d4a4d22-41c0-43ab-ba99-92750f81e335/fa87bcdb-87ed-4634-8c62-afb070caf464.jpg

### 65cf99cb-fd18-4168-b9ab-dfbfd42112ca/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (9 objects)

283. 8d4a4d22-41c0-43ab-ba99-92750f81e335/03114f53-16ec-45a2-9a26-31b6d1ea624a.png
284. 8d4a4d22-41c0-43ab-ba99-92750f81e335/2abe0740-2f0c-4ba8-a393-57fdd1db3658.jpg  [storage-only]
285. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6465a932-0fcd-4cee-9e59-363024bd170b.png
286. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8742a3da-633e-4e5a-a6bd-57c7c744066c.png
287. 8d4a4d22-41c0-43ab-ba99-92750f81e335/c2b6a056-7de1-44a2-8f5e-904fb17c8f62.png
288. 8d4a4d22-41c0-43ab-ba99-92750f81e335/d905e728-a773-4a9b-a928-986d1a288c31.png
289. 8d4a4d22-41c0-43ab-ba99-92750f81e335/da34e455-fe02-4930-a672-950ed543027a.png
290. 8d4a4d22-41c0-43ab-ba99-92750f81e335/imported_1780912067465.jpg
291. 8d4a4d22-41c0-43ab-ba99-92750f81e335/imported_1780912291807.jpg

### a4144901-50f9-4499-9a74-3ce834ef7458/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (7 objects)

292. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0973a848-dfde-4232-9d68-2d9effa4eeb3.png
293. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1a0ce95b-b475-443f-92ba-2ee74c3c0b8e.png
294. 8d4a4d22-41c0-43ab-ba99-92750f81e335/46255efb-1f17-42e4-88f1-f253a8a3b4d2.jpg
295. 8d4a4d22-41c0-43ab-ba99-92750f81e335/5ae3748a-b7a6-44cd-8470-ccd18656ad70.png
296. 8d4a4d22-41c0-43ab-ba99-92750f81e335/8c237065-29e1-4915-bb07-896477ad7505.png
297. 8d4a4d22-41c0-43ab-ba99-92750f81e335/a56cae12-eae5-4030-93ad-36461f5a5381.png
298. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b046aaaf-f5f2-4803-bd64-ff4e8025e857.png

### 08ae347a-f13a-498c-a420-b0ef0bf706c7/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (6 objects)

299. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_flux_mask.png
300. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_flux_src.png
301. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_mask.png
302. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_pad_mask.png
303. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_pad_src.png
304. 8d4a4d22-41c0-43ab-ba99-92750f81e335/995b30ce-b499-4332-9487-4d9d15f9763d_source1080.png

### 7da90f41-c450-48e1-95da-0153f5a4d042/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (2 objects)

305. 8d4a4d22-41c0-43ab-ba99-92750f81e335/de23010d-f2a8-445b-82ad-ed45d65736fa.png
306. 8d4a4d22-41c0-43ab-ba99-92750f81e335/de23010d-f2a8-445b-82ad-ed45d65736fa_vton_raw.png

### 917cccac-6de0-4b56-ab1e-b4dffdc7ac5a/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (2 objects)

307. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b2e05a50-c61e-47ea-876d-45ee8d0a89ca.png
308. 8d4a4d22-41c0-43ab-ba99-92750f81e335/b2e05a50-c61e-47ea-876d-45ee8d0a89ca_vton_raw.png

### a073744a-03b9-4ad1-a0ef-1f147bdb0c95/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (2 objects)

309. 8d4a4d22-41c0-43ab-ba99-92750f81e335/0e60dd53-d378-48f0-8784-636122880993.png
310. 8d4a4d22-41c0-43ab-ba99-92750f81e335/9536dc1b-6c38-49a1-9be6-1e2fee2be4d1.png

### f58a8449-2c57-4c9d-bd08-abeaa4972166/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (2 objects)

311. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6ef589ba-1d13-4bef-8932-d8f371f4aba1.png
312. 8d4a4d22-41c0-43ab-ba99-92750f81e335/6ef589ba-1d13-4bef-8932-d8f371f4aba1_vton_raw.png

### 830373d2-4017-4d18-8ff0-7c2220304f62/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (1 objects)

313. 8d4a4d22-41c0-43ab-ba99-92750f81e335/1b86f9c1-d75f-4eec-8e35-4d1debfab780.png

### 864088d5-02ff-4155-a9c8-572ae2cf1c0c/  →  3ca10935-8c3d-4479-9a0c-8bfe8050840c/   (1 objects)

314. 8d4a4d22-41c0-43ab-ba99-92750f81e335/892d9003-7575-48e2-b1ad-694e0c45bbb9.png  [storage-only]


---

## 3. Collision analysis (run BEFORE any copy)

Two collision classes were checked against the live object set:

**Class A — target path already occupied.** For each of the 314, does `3ca10935…/{rest}` already exist as a real object (i.e., among the 49 objects already under the target prefix)?
→ **0 collisions.**

**Class B — two legacy objects collapse to the same target path.** Do any two of the 314 share an identical `{rest}` (which would map to one target key)?
→ **0 collisions.**

**Why it is clean:** ownership is encoded only in segment 0; the remainder `{artist_id}/{look_id|artifact}.ext` is built from globally-unique UUIDs (and unique timestamped names for imports/hero-frames). No two objects — legacy or target — share a `{rest}`. The 49 existing target objects have `{rest}` values disjoint from all 314. **The re-key is collision-free; every copy lands on a fresh key.**

> Re-run this exact check at execution time (state can drift): fail-closed if any target key exists before its copy.

---

## 4. DB reference map — every place these paths are stored

Full read of all owner-scoped tables (deep-scanned including JSON columns) shows **all references to the 314 objects live in a single table, `public.artist_looks`.** Other tables (`shots`, `project_assets`, `provider_jobs`, `character_features`, …) do contain legacy-UID paths, but those resolve to **other buckets** (`project-references`, `hero-frames`, face refs) — **not** to any of the 314 `look-composites` objects, so they are out of scope for this re-key (they are their own, separate strand risk — see §7 A2).

| Table.Column | Type | Refs → distinct objects | How stored |
|---|---|--:|---|
| `artist_looks.generated_storage_path` | text | 135 → 135 | **bare path** (canonical composite pointer, 1:1 with the look row) |
| `artist_looks.generated_image_url` | text | 135 → 135 | **bare path** (mirror of the above; column is misnamed — it is not an http URL) |
| `artist_looks.composition_recipe_json` | jsonb | 297 → 181 | nested keys (`garment_path_used`, `scene_path`, mask/keyframe paths, `{bucket,path}` entries); **57 of these are full embedded `look-composites` signed/public URLs**, the rest bare paths |
| `artist_looks.error_message` | text | 1 → 1 | a path embedded in a historical error string (cosmetic) |

**Reference-mode totals:** 511 bare-path occurrences, 57 embedded-URL occurrences. **All** are updatable by the *same* string transform used for the objects: replace `"{old-uid}/"` → `"3ca10935-…/"`. Because a UID is a unique 36-char token, this substring replace cannot partially match anything else — it is exact whether the value is a bare path or a full URL inside JSON.

**Coverage of the 314:**
- **285** objects are referenced by ≥1 `artist_looks` row.
- **29** objects are **storage-only** (no DB pointer) — interim masks/face-guards/one hero-frame/most of the `79516c91` set. They still must be re-keyed (folder-prefix RLS would strand them), but there is **nothing to update in the DB** for them. They are flagged `[storage-only]` in §2 and in the CSV.

**Multiply-referenced objects — 143 of the 314** are pointed at by more than one row/column. Example: an `imported_…jpg` composite is a look's own `generated_storage_path` **and** reused as `garment_path_used` inside up to 21 *other* looks' `composition_recipe_json`. **Every** occurrence must be rewritten, not just the owning row — the deterministic global prefix-replace across the four columns above handles this in one pass.

---

## 5. Re-key migration plan (execution gate — NOT run here)

All storage writes use the **service role** through a Lovable edge function or the Lovable dashboard; RLS is never altered. Phases are separately gated; do not chain past a failed gate.

**Phase 0 — Freeze & snapshot.**
1. Confirm a fresh Lovable daily backup exists (restore point) and record its UTC timestamp.
2. Re-run the §3 collision check live; abort if any target key already exists.
3. Quiesce writers to `look-composites` for the affected looks (or accept that new writes already land under the target prefix, since the DB owner is now the durable account — verify no active job is writing under a legacy prefix).

**Phase 1 — Copy (additive, non-destructive).**
4. For each of the 314: `POST /storage/v1/object/copy` `{bucketId:"look-composites", sourceKey:"{old}", destinationKey:"{new}"}` (server-side S3 copy — no re-upload, bytes identical). Idempotent: skip if destination already present (resume-safe).
5. Persist per-object status (`pending|copied|verified|failed`) in a run table so the job resumes and skips completed rows; retry transient failures with backoff. **No fail-fast** — one bad object must not abort the batch.

**Phase 2 — Verify copies (before touching any reference).**
6. `HEAD` both old and new keys for all 314; assert **identical `Content-Length` and `ETag`** (ETag = MD5 for these single-part objects). Full `sha256` spot-check on a random sample plus every object > 25 MB.
7. Gate: **all 314 verified byte-identical** or STOP.

**Phase 3 — Switch DB references (single transaction, pre-image captured).**
8. Create `public.storage_rekey_backup_20260808(tbl,col,row_id,old_value,new_value,changed_at)` and insert the pre-image of every value about to change.
9. In one transaction on `public.artist_looks`, apply the prefix replace to `generated_storage_path`, `generated_image_url`, `composition_recipe_json` (as text, then re-cast to jsonb), and optionally `error_message`, scoped to rows whose value contains one of the 15 legacy prefixes:
   ```sql
   -- illustrative; run per-prefix or via a prefixes array, guarded + reconciled like the consolidation DO block
   update public.artist_looks
     set generated_storage_path = replace(generated_storage_path, old_uid||'/', tgt||'/'),
         generated_image_url    = replace(generated_image_url,    old_uid||'/', tgt||'/'),
         composition_recipe_json = replace(composition_recipe_json::text, old_uid||'/', tgt||'/')::jsonb
   where generated_storage_path like old_uid||'/%'
      or generated_image_url    like old_uid||'/%'
      or composition_recipe_json::text like '%'||old_uid||'/%';
   ```
10. Reconcile inside the transaction: assert **0** remaining occurrences of any legacy prefix across the four columns; else `RAISE` and roll back.

**Phase 4 — Prove readability from new locations.**
11. As the **durable account session** (folder-prefix RLS in force), sign+`GET`/`HEAD` all 314 new paths and the 285 DB-referenced values; assert HTTP 200 for every one. This proves the durable identity can now read every composite the tightened policy would later require.
12. Render-path smoke: load a sample of affected looks in the app; confirm thumbnails/composites resolve.

**Phase 5 — PARK.** Old objects remain. Bucket policy still parked. Independent reviewer signs off on Phases 2–4 evidence.

**Phase 6 — Cleanup (separate later gate, only after §5 verified clean AND policy applied+observed).**
13. Delete the 314 old keys in batches, re-verifying each new counterpart exists immediately before deleting its old twin. Keep `storage_rekey_backup_20260808` and the daily backup until a defined retention window closes.

**Rollback:** before Phase 6, revert is trivial — reverse the DB prefix replace from the pre-image table (or the inverse substring swap); new objects can simply be ignored/deleted since old ones still exist. After Phase 6, rollback relies on the retained pre-image + daily backup.

---

## 6. Risks & edge cases

1. **Objects referenced by multiple rows (143/314).** A single composite reused as an input in many recipes. Mitigated by the *global* prefix-replace across all four columns in one transaction (not row-local edits), with a 0-remaining reconciliation guard.
2. **Embedded full URLs in `composition_recipe_json` (57).** Signed/public `look-composites` URLs, not bare paths. The same substring transform rewrites the path segment inside them; but any **already-issued signed URL cached outside the DB** (in a user's browser, a queued job payload, a CDN) still points at the **old** key — which is why old objects are retained through Phase 5 so cached URLs keep resolving until deletion.
3. **Signed-URL cache / in-flight jobs.** `provider_jobs` payloads may carry signed URLs to legacy paths for running renders. Keeping originals until Phase 6 prevents breaking in-flight work; drain/av­oid deleting until active jobs referencing legacy keys complete.
4. **Public URLs embedded elsewhere.** If the bucket is private, public URLs already 404 and are moot; if any composite URL was pasted into an external doc/export, it will break only at Phase 6 delete — inventory such exports before cleanup.
5. **`generated_image_url` is a bare path, not a URL.** Do not assume URL-shaped handling; treat both `generated_*` columns as storage keys. (Frontend signs them at read time via `signedUrls("look-composites", …)`.)
6. **JSON re-cast integrity.** `replace()` on `::text` then `::jsonb` is safe only because UIDs never contain JSON metacharacters; validate each row re-parses as jsonb inside the transaction before commit.
7. **29 storage-only objects.** No DB pointer means no functional breakage if missed — but they still strand under folder-prefix RLS, so include them in the copy set; they simply skip Phase 3.
8. **New writes during the window.** Because DB ownership is already the durable account, freshly generated composites now write under `3ca10935…/` — good, but a job started before consolidation could still target a legacy prefix. Phase 0 quiesce + Phase 3 reconciliation catch stragglers.
9. **ETag assumption.** ETag == MD5 holds for single-part uploads; any multipart-uploaded object needs a full `sha256` compare instead (Phase 2 already forces this for large objects).

---

## 7. Anomalies flagged during discovery

**A1 — 16th prefix outside the consolidation set.** `864088d5-02ff-4155-a9c8-572ae2cf1c0c` owns **1** object (`…/8d4a4d22…/892d9003-7575-48e2-b1ad-694e0c45bbb9.png`) but is **not** among the 20 anonymous UIDs swept by the identity consolidation (§2 of IDENTITY_CONSOLIDATION). The object is storage-only (no DB reference), so it does not affect DB reconciliation, but it must still be re-keyed to avoid stranding. **Action:** include in the copy set; separately confirm this UID owns no `public.*` rows that the consolidation missed (quick read-only check before Phase 6).

**A2 — Same legacy-UID strand exists in OTHER buckets.** `project_assets.file_url`/`metadata_json`, `character_features.file_url`/`storage_path`/`reference_images`, and `provider_jobs.*_payload_json` hold legacy-UID paths pointing at **`project-references` / `hero-frames` / face-ref** objects. They are **out of scope for the 314**, but the identical folder-prefix-RLS strand risk applies to those buckets. **Action:** scope a parallel Part-B for each additional bucket before its policy is tightened; do not tighten those buckets' policies under the assumption this plan covered them.

**A3 — Non-standard path depths (handled).** 8 objects are depth-4 (`832fa0bc/8d4a4d22…/sam3/…_clothing.png`, SAM3 masks) and 1 is depth-2 (`c955dbe6/hero_frame_768_1782083213.png`, no `{artist}/{look}` structure). The segment-0-only transform re-keys them correctly; all 9 are DB-referenced and verified in the manifest. No special handling beyond noting the depth-2 object has no artist/look grouping.

---

## 8. Stop point

This is the manifest + collision result + DB reference map + plan. **No copy, move, rename, delete, policy, or RLS change was performed.** Execution (Phase 1+) and the eventual `look-composites` policy tightening are separate approval gates; the policy remains parked until this re-key independently verifies clean per §5 Phase 4.
