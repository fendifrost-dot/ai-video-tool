# Reproducible Benchmark Generation System

**Status:** STANDING ENGINEERING PRINCIPLE — read before creating, certifying, or modifying any benchmark.
**Scope:** Project-agnostic. Applies to every product in this workspace — AVT video-quality benchmarks, FanFuel / Artist Growth Hub campaign benchmarks, and any future product that needs a benchmark, reference set, "golden" fixture, or canonical evaluation baseline.
**Version of this spec:** 1.0
**Worked example throughout:** AVT *Golden Frame Selection* (frame-quality benchmark). The example is illustrative only — the rules are the product.

---

## 0. Why this document exists

A benchmark is a claim about ground truth. If the claim is wrong, every experiment measured against it is silently wrong. The most common way a benchmark goes wrong is not a bug — it is a human (or an agent) declaring items "good enough" **from memory or intuition** instead of deriving them from evidence, then freezing that guess into a fixture everyone downstream trusts.

This document exists so that no benchmark in this workspace is ever certified that way again. It defines *how* a benchmark is derived, *what provenance* must travel with it, *when* it becomes immutable, and *how* every claim inside it is classified by strength of evidence.

---

## 1. CORE PRINCIPLE — Derived from evidence, never recalled from memory

> **A benchmark is DERIVED FROM EVIDENCE, never RECALLED FROM MEMORY.**

- You may **not** certify a benchmark by approving items "because they seem right," "because we used these last time," or "because they look representative." Intuition is not evidence.
- Every selected item must be the output of a **documented, versioned selection algorithm** that scored candidates against **objective criteria**.
- The evidence (scores, margins, rationale, the review artifact) is **presented to a human for approval** before anything is trusted.
- Only after approval is the benchmark **frozen** (Section 4).

Until it is both **derived** and **frozen+approved**, a benchmark is **PROVISIONAL** and must be labeled as such wherever it is referenced.

**No benchmark may exist without all four of:** a source checksum, a per-item checksum, a written selection rationale, and a version id. A "benchmark" missing any of these is not a benchmark — it is an unverified sample, and must not be used to certify anything.

*AVT example:* We do not pick "good frames" by eyeballing a video. We run *Golden Frame Selection*, which scores every candidate frame on defined criteria (sharpness, exposure, face visibility, etc.), picks winners with recorded margins, and only then asks a human to approve the contact sheet.

---

## 2. THE PROCEDURE (generic)

Follow these steps in order. Do not reorder, and do not skip (e) or (f).

**(a) Load the full canonical candidate set.**
Enumerate *every* candidate — not a convenient subset. Record how many there are and where they came from. If the set is sampled or truncated for cost, that truncation is itself a decision and must be logged (Section 5, `DECISION`) and stated in the provenance. Silent truncation is forbidden.

**(b) Score every candidate on the defined objective criteria.**
For each criterion, document the **exact scoring METHOD** — the metric, the tool/formula, the units, and the direction (higher-is-better or lower-is-better). A criterion whose method cannot be written down is not objective and cannot be used. Score *all* candidates, not just the ones you expect to win — the losers are the evidence that the winner won.

**(c) Pick the top DISTINCT item per criterion, showing runner-up + margin.**
- One winner **per criterion**, and winners must be **distinct** items where the benchmark's purpose requires coverage of different criteria (do not let one strong item sweep every slot unless that is explicitly intended and logged).
- For each pick, record the **winner score, the runner-up score, and the margin** between them. The margin is what makes the choice auditable and what sets the confidence level (Section 3).

**(d) Produce a labeled review artifact.**
Generate a human-reviewable artifact — e.g. a **contact sheet** of the selected frames labeled with criterion, index, and score; or a scorecard table; or a rendered comparison. It must let a human see *what was chosen and why* at a glance.

**(e) STOP for approval.**
Present the review artifact **and** the full score table to a human. Do not proceed. Approval is an explicit human act, not an assumption. (An agent may not approve its own benchmark.)

**(f) On approval, FREEZE.**
Only after a clear human "yes," assemble the Frozen Provenance Package (Section 3) and make the benchmark immutable (Section 4). Before this point the benchmark is PROVISIONAL.

---

## 3. THE FROZEN PROVENANCE PACKAGE (mandatory fields)

When a benchmark is frozen, it ships with a provenance package. **Every field below is mandatory.** A frozen benchmark missing any field is invalid and must not be trusted.

| Field | What it records |
|---|---|
| **Item indices / ids** | The canonical index or id of each selected item. |
| **Canonical-asset SHA-256 checksums** | SHA-256 of each frozen benchmark item (the exact bytes that are the benchmark). |
| **Source-asset checksum** | SHA-256 of the source the candidates were derived from (the master video, dataset, corpus, etc.). |
| **Timestamps** | When the selection ran and when it was frozen (absolute, not relative). |
| **Dimensions / shape** | Resolution, length, count, bit depth, schema — whatever describes the item's shape. |
| **Per-criterion rationale** | One line per criterion: why this item won, in plain language. |
| **Winner AND runner-up scores** | Both numbers, per criterion. |
| **Margin of victory** | Winner minus runner-up, per criterion. |
| **Confidence: High / Med / Low** | Derived **from the margin** (see below). |
| **Frozen selection-algorithm version** | The named, versioned algorithm used (e.g. `Golden Frame Selection v1.0`), including the scoring **method per criterion**. |
| **LINEAGE block** | See below. |
| **Representation note (when applicable)** | Where selection signals and frozen assets come from *different representations*, an explicit note explaining why (see below). |

**Confidence from margin (default banding — a product may tighten it, never loosen it silently):**
- **High** — large, unambiguous margin; the winner is clearly best.
- **Med** — modest margin; the winner is defensible but a runner-up is close.
- **Low** — near-tie; the choice is fragile and should be flagged for extra human scrutiny.
The exact numeric thresholds are part of the frozen algorithm version and must be written into it.

**LINEAGE block (verbatim fields):**
```
benchmark version:      e.g. wardrobe-swap-v1
derived-from:           source id / path / prior benchmark version
algorithm version:      e.g. Golden Frame Selection v1.0
source SHA-256:         <hash of source asset>
per-item SHA-256:       <hash per frozen item>
created date:           <absolute date>
purpose:                one line — what this benchmark is FOR
```

**Representation note — when signals and frozen bytes differ.**
Sometimes the scoring signals are computed on one representation of the data while the frozen benchmark items are stored in another. When that happens, the provenance must say so explicitly and say *why*.

> *AVT example:* signals for *Golden Frame Selection* are computed on the **verified, frame-aligned 8-bit proxy** (fast, and the representation a human actually reviews), while the **checksums are taken from the canonical 16-bit frames** (the archival bytes that are the real benchmark). The proxy is proven frame-aligned to the master, so a score computed on frame *N* of the proxy is a valid signal for frame *N* of the 16-bit master — but the *bytes* we freeze and hash are the 16-bit frames, never the proxy. This split is legitimate **only because it is documented here**; an undocumented split is a provenance defect.

**Permanent artifacts.** The **full score table** (every candidate, every criterion, every score — not just winners) and the **review artifact** (contact sheet / scorecard) are preserved as permanent benchmark artifacts alongside the frozen items. They are part of the benchmark, not scratch output.

---

## 4. IMMUTABILITY

Once frozen, a benchmark is **READ-ONLY**.

- Make the frozen items read-only on disk (`chmod 444`) and write a checksum manifest (`SHA256SUMS`) next to them. The manifest is the tamper-evidence: anyone can re-verify the bytes against it.
- **No experiment may modify a frozen benchmark.** Experiments read benchmarks; they never write them. A test that mutates its own baseline is measuring nothing.
- **Improvements never overwrite.** A better selection, a new criterion, a re-derivation → a **new version** (`v2.0`, `v2.1`, `v3.0`) with its own provenance package. The old version stays exactly as frozen, forever. Version numbers go up; bytes of a released version never change.
- **PROVISIONAL vs FROZEN.** Until a benchmark is frozen *and* human-approved (Section 2f), it is PROVISIONAL and must be labeled PROVISIONAL everywhere it appears. Provisional benchmarks may be iterated freely; frozen ones may not be touched.

Restating the floor from Section 1: **no benchmark exists without a source checksum, an item checksum, a selection rationale, and a version id.**

---

## 5. EVIDENCE-CLASSIFICATION TAXONOMY (companion principle)

Benchmarks are only as trustworthy as the claims around them. So **every finding or claim** in an audit, benchmark, report, or handoff is labeled **exactly one** of the following. The label is not decoration — it tells the reader how much weight the claim can bear.

| Label | Meaning | Obligation |
|---|---|---|
| **VERIFIED** | Proven by code, artifact, or reproducible measurement. | **Cite the proof** — file:line, checksum, test name, artifact path. |
| **OBSERVED** | Seen to happen, but not fully proven (single run, no isolation of cause). | Say what was seen and under what conditions. |
| **HYPOTHESIS** | A plausible claim that still needs validation. | **Name the test** that would confirm or refute it. |
| **DECISION** | An intentional choice we made. | State the choice **and its rationale**. |
| **RECOMMENDATION** | A proposed improvement, not yet adopted. | State the proposed change and expected benefit. |

**The cardinal rule:** never let a `HYPOTHESIS` or `OBSERVED` claim read as `VERIFIED`. Unlabeled prose defaults to the weakest plausible reading — so if something is genuinely verified, label it and cite it; otherwise do not imply certainty you have not earned. This is exactly how a benchmark gets corrupted: an intuition ("these frames look right" = HYPOTHESIS at best) gets written up as though it were VERIFIED.

**Tie to the Definition of Done.** A task, audit, or benchmark is **not Done** until:
1. every claim carries exactly one of the five labels;
2. every `VERIFIED` claim cites its proof;
3. every `HYPOTHESIS` names its validating test;
4. and — for a benchmark — it is either explicitly labeled PROVISIONAL, or it is FROZEN with a complete Provenance Package (Section 3) and passes its own `SHA256SUMS`.

---

## 6. Checklist (paste into the PR / handoff that ships a benchmark)

```
[ ] Full candidate set loaded and counted (no silent truncation)
[ ] Every candidate scored; scoring METHOD documented per criterion
[ ] Top distinct item per criterion chosen; winner+runner-up+margin recorded
[ ] Confidence (High/Med/Low) assigned from margin
[ ] Labeled review artifact produced (contact sheet / scorecard)
[ ] STOPPED for human approval — approval is explicit
[ ] Frozen Provenance Package complete (all Section 3 fields)
[ ] LINEAGE block filled in
[ ] Representation note added IF signals/frozen bytes differ
[ ] Full score table + review artifact preserved as permanent artifacts
[ ] Items chmod 444 + SHA256SUMS written and verified
[ ] Every claim labeled VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION
[ ] Benchmark labeled FROZEN (approved) or PROVISIONAL (not yet)
```

---

*This is standing-rules documentation. It is intentionally project-agnostic. When a product needs specifics — which criteria, which thresholds, which paths — those live in that product's own benchmark doc and must reference this spec by name and version.*
