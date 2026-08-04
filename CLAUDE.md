# CLAUDE.md — AI Video Tool (AVT)

Film production app. Repo: `fendifrost-dot/ai-video-tool`. Live: `aivideotool.lovable.app`.

Full stack: `AGENTS.md`. Agent context: `claude_code_handoff_avt_agent_context.md`. Disk rules: `claude_code_handoff_avt_workspace_disk_rules.md`.

---

## ⛔ PROJECT POLICY — violating ANY item requires STOPPING work

**Before doing anything, pass the pre-flight in [`docs/AGENT_BOOTSTRAP.md`](docs/AGENT_BOOTSTRAP.md). Machine-readable source of truth: [`.deployment/manifest.yml`](.deployment/manifest.yml). If you cannot answer the pre-flight from evidence, you do NOT proceed.**

- **Database & deploy are LOVABLE-MANAGED.** There is NO standalone Supabase to log into. All SQL runs in **Lovable's SQL Editor**; all edge redeploys via **Lovable → Edge Functions → redeploy** (Publish ≠ edge redeploy).
- **AVT Supabase project ref:** `qoyxgnkvjukovkrvdaiq`. **Canonical repo:** `github.com/fendifrost-dot/ai-video-tool`. **Canonical branch:** `main`.

**FORBIDDEN — if you catch yourself doing ANY of these, STOP work immediately:**

| id | Forbidden |
|----|-----------|
| `standalone_supabase` | Opening / logging into a standalone supabase.com dashboard for ANY reason — migrations, schema, or data — **unless Lovable itself links you into it**. |
| `archived_clone` | Working from an archived or duplicate clone instead of the canonical repo. |
| `local_sql` | Running SQL locally or via the `supabase` CLI instead of Lovable's SQL Editor. **A CLI 403 / "wrong account" is a FALSE WALL**, not a blocker — do not open a dashboard or stall over it. |
| `stale_repo` | Acting on a stale checkout; confirm you are on canonical `main` and up to date. |

Do **not** ask Fendi to paste/run SQL, and do **not** hunt for a separate "Supabase project" outside Lovable Cloud. If in doubt: everything goes through **Lovable**, never a direct Supabase login. Full deploy/schema chain of command is below.

---

## CRITICAL — Chain of command (read every session)

**There is NO standalone Supabase.** These apps are **Lovable-managed**. Do **not**:

- Run the `supabase` CLI (403 / wrong account = a **FALSE wall**, not a blocker)
- Open supabase.com dashboard for ANY reason — SQL, migrations, or inspection — **unless Lovable links you into it**
- Ask Fendi to paste/run SQL
- Hunt for a separate “Supabase project” outside Lovable Cloud
- Treat “I can’t find Supabase” as a reason to stall

### Correct deploy / schema path

| Action | Where |
|--------|--------|
| Code + edge function source | GitHub `main` (this repo) |
| SQL / migrations | **Lovable SQL editor** on the linked Lovable project |
| Frontend live | Lovable **Publish** (from `main`) |
| Edge functions live | Lovable **Edge Functions → redeploy** each touched function |
| Secrets | Lovable Cloud / edge secrets — **never** ask for keys in chat |

**Publish ≠ edge redeploy.** Always name which functions you redeployed.

Agents run authorized SQL / publish / redeploy themselves via Lovable — do not hand work back asking “where does Supabase live?”

### This project (AVT)

| | |
|--|--|
| Repo | `github.com/fendifrost-dot/ai-video-tool` |
| Local | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| Supabase (Lovable Cloud) | `qoyxgnkvjukovkrvdaiq` |
| Live | `aivideotool.lovable.app` |
| Lovable project id | `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` |

### Sister project — Control Center (SEPARATE)

| | |
|--|--|
| Repo | `github.com/fendifrost-dot/fendi-control-center` |
| Supabase | `wkzwcfmvnwolgrdpnygc` |
| Holds | `FAL_KEY` (AVT never holds Fal) |

AVT reaches Fal via CC `switchx-restyle` (`fal-run`) + `fal-queue-poll`. Grok image uses `XAI_API_KEY` on **AVT**. Do not edit CC while thinking you are in AVT.

### Other Lovable apps (do not mix IDs)

| App | Supabase id |
|-----|-------------|
| FanFuel / Artist Growth Hub | `vsemrziqxrrfcquxfnwd` |
| Modest Chic Builder | `lkbapymfjcfrnskcdrmv` |
| Continuum Capital Chicago OS | `mdmetmylcfkehugcpbjg` |
| LAAAN Logistics | `vtkvwvahtftpbcvnwbic` |

---

## Engineering principles (read every session)

**Benchmarks are DERIVED FROM EVIDENCE, never RECALLED FROM MEMORY.** Never certify a benchmark, golden set, or reference fixture by approving items "because they seem right" — derive them via a documented, versioned selection algorithm, present the evidence (scores, margins, review artifact) for human approval, then freeze read-only with full provenance. Canonical spec: [`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`](docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md) — read it before creating, certifying, or modifying any benchmark.

**Evidence taxonomy:** every claim in any audit, benchmark, or report is labeled exactly one of **VERIFIED** (proven — cite it) / **OBSERVED** (seen, not proven) / **HYPOTHESIS** (needs a named test) / **DECISION** (intentional + rationale) / **RECOMMENDATION** (proposed). Never let a HYPOTHESIS read as VERIFIED.

---

## CRITICAL — Disk / workspace (never violate)

**Failure mode (2026-07-20):** Opening iCloud `FENDI FILES/VIDEO/MODEST Member Only shots` hydrated huge media onto the Mac SSD and nearly filled the disk. iCloud paths are placeholders — any read / recursive `find` / `grep` under a parent **downloads** files.

### Allowed roots only

| Purpose | Path |
|---------|------|
| Code (this repo) | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| Sibling clone (if needed) | `/Users/gocrazyglobal/ai-video-tool` |
| Media / video / MODEST / FENDI FILES | `/Volumes/T7/...` only |

Confirm T7: `df -h /Volumes/T7`. If missing → **stop and ask**. Never fall back to iCloud.

### Forbidden

- `~/Library/Mobile Documents/com~apple~CloudDocs/**`
- Especially MODEST Member Only shots, `FENDI FILES/MUSIC`, iCloud `LUNA Sessions`
- Machine-wide searches for `*.mov` / `*.mp4` / MODEST

### Keep Claude alive

- **Never delete** `~/Library/Application Support/Claude/vm_bundles` (~10 GB)
- Restate boundaries in every task prompt — sub-sessions may not inherit memory

---

## Hard product rules (wardrobe)

1. Asset processing runs through AVT / its edge functions — no ad-hoc local image pipelines in the agent sandbox.
2. No AI-regeneration of garment imagery; pixel preservation is mandatory.
3. Fix the tool, not workarounds. Minimize scope.

---

## LOCKED: Video garment-swap architecture — keyframe + propagation (do not drift)

**Canonical doc:** [`docs/VIDEO_SWAP_ARCHITECTURE.md`](docs/VIDEO_SWAP_ARCHITECTURE.md) — read it before touching any video-swap code. This section is the short form; the doc is authoritative.

**Provenance:** Confirmed **unanimously** by Grok + Gemini + ChatGPT (2026-07-27). Matches the repo's own earlier pivot handoff [`CURSOR_HANDOFF_video_clothing_swap_pivot.md`](CURSOR_HANDOFF_video_clothing_swap_pivot.md) (**2026-06-21**, commit `228226f`) — the decision Phase 2b drifted from. This re-lock exists so that drift does not recur.

**PRODUCTION PATH = Grok keyframe generation + temporal propagation.** Do **NOT** scale independent per-frame VTON / `switchx-restyle` to full-length videos.

**WHY:** Single-image engines (`switchx-restyle`, `vton-frame`) have **no temporal state** → independent per-frame sampling produces **"boiling"/flicker**. "Reference-lock" fixes only the *target garment*, **not** temporal consistency. Masked-lock (**Phase 2c**) is **ORIGINAL-FOOTAGE PRESERVATION** (pins face/scene/body), **NOT** garment-region stabilization.

**THE LANE:** approve a few product-accurate Grok **hero keyframes** (every ~12–24 frames + at pose changes / scene cuts) → **propagate** the approved garment across intermediate frames via optical flow (RAFT / EbSynth-style) **or** a video-native VTON / video-to-video model → **re-anchor** a new Grok keyframe when flow confidence breaks (large rotations / occlusions) → **composite onto the ORIGINAL footage** + keep the deterministic brand/logo composite for stripe/logo + **face-restore** as safety net.

**Phase 2b (independent per-frame swap) = BASELINE / DIAGNOSTIC ONLY.** Keep its reusable infra (frame extract, ordered storage, Fal routing, bounded concurrency, status tracking, reassembly); **never** make it the full-length production path.

**BENCHMARK before building full** (pick the winner on a short clip):
- **(a)** Grok keyframe + optical-flow / EbSynth propagation, vs
- **(b)** video-native VTON (`fal-ai/kling/v1-5/kolors-virtual-try-on`, `fal-ai/fashn/v1.5`, Wan2.1 / Kling video-to-video with pose control).

**ENGINEERING PREREQS before any full-length run:**
- Replace fail-fast (one bad frame kills the job) with **per-frame/per-chunk persisted status + retries + resume + skip-completed**.
- Replace `EdgeRuntime.waitUntil` with a **durable chunk job queue**.
- Normalize output filename/format (code names everything `.jpg`).
- Record reproducibility metadata: model, version, prompt, reference-asset hash/version, mask version, seed, transfer mode.

**KILL CRITERION (short 2–4s test):** if it cannot hold Fendi's identity + exact jacket construction + stripe/logo placement + natural occlusion **without visible flicker/morphing**, **STOP and redesign before scaling.**
