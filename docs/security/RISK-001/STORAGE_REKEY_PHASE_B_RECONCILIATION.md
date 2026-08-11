# STORAGE RE-KEY — PHASE B: artist_looks REFERENCE SWITCH (executed)

**RISK-001 Part B, Phase B.** Executed 2026-08-08 (America/Los_Angeles) against Lovable-managed AVT project `qoyxgnkvjukovkrvdaiq`, table `public.artist_looks`.
**Action:** repointed references from the legacy `{old-uid}/…` paths to the **verified** `3ca10935-…/…` destinations (the 313 objects checksum-verified in Phase 1). **Scoped strictly to those 313 exact paths** — other-bucket paths that merely share a legacy UID prefix were left untouched. **No object copied/moved/deleted; no bucket policy changed; no RLS touched.**
**Reversibility:** full pre-image of every changed row/column captured **before** any write → [`STORAGE_REKEY_PHASE_B_PREIMAGE.json`](STORAGE_REKEY_PHASE_B_PREIMAGE.json) (156 rows).

---

## 1. Change reconciliation

| Metric | Value |
|---|--:|
| `artist_looks` rows total | 219 |
| Rows changed | **156** |
| — `generated_storage_path` updated | 135 |
| — `generated_image_url` updated | 135 |
| — `composition_recipe_json` updated | 102 |
| — `error_message` updated | 1 |
| PATCH success (updated **and** echo-verified against intended value) | **156/156** |
| PATCH failures | **0** |
| Of the 313 verified paths, distinct paths referenced by `artist_looks` | 285 |
| Of the 313, storage-only (no reference → nothing to switch) | 28 |

**Post-switch reconciliation (re-read all 219 rows):**
- Occurrences of any of the **313 old paths** remaining in `artist_looks`: **0** ✅
- Target-prefixed new-path occurrences now present: **351** ✅
- Other-bucket legacy paths (e.g. `project-references`, `hero-frames`) under the same UIDs: **intentionally preserved** (those buckets are separate, later gates — STOR-2…STOR-4).

---

## 2. Runtime verification — resolves through the REAL app + bytes match

**(a) App data-path proof (programmatic, exhaustive).** For all **135** rows whose `generated_storage_path` now points at a target object, replicated the app's exact read path — `supabase.storage.from("look-composites").createSignedUrl(path, 3600)` → `GET` — then sha256'd the bytes and compared to the Phase-1 verified destination digest:

- Resolved **HTTP 200 AND byte-identical: 135/135** ✅ · problems: **0** · 245,058,903 bytes served through the app path.

**(b) Deployed-app proof (browser, live).** Loaded `aivideotool.lovable.app` (anonymous session), opened **Fendi Frost → Virtual Samples** (artist `8d4a4d22…`, "All looks (219)"):

- Composite thumbnails **render correctly** (outfit composites display); no broken images.
- Network: **360** `POST /storage/v1/object/sign/look-composites` requests captured on load — **all HTTP 200** (the app signing every look's now-switched `generated_storage_path`).
- Console: **no errors/exceptions** (filtered for storage/40x/error/failed).

Together: every affected `artist_looks` row resolves through the real app, and the bytes served equal the Phase-1 checksum-verified destination objects.

---

## 3. Boundaries held / not done

- ❌ 314 legacy originals **still present** — not deleted (separate later cleanup gate).
- ❌ `look-composites` bucket policy **not** tightened; **no** RLS change; nothing re-opened.
- ❌ Mystery 1.94 MB zero-reference object `864088d5…` **still quarantined** — not migrated, not deleted.
- ❌ **No other bucket** re-keyed — STOR-2…STOR-4 remain separate, gated programs; no policy tightening anywhere.

## 4. Rollback (if ever needed)

Reverse each row from [`STORAGE_REKEY_PHASE_B_PREIMAGE.json`](STORAGE_REKEY_PHASE_B_PREIMAGE.json) (`PATCH artist_looks?id=eq.{id}` with the captured `before` values). The originals were never removed, so reverted references resolve immediately.
