# CLAUDE.md — AI Video Tool (AVT)

Film production app. Repo: `fendifrost-dot/ai-video-tool`. Live: `aivideotool.lovable.app`.

Full stack: `AGENTS.md`. Agent context: `claude_code_handoff_avt_agent_context.md`. Disk rules: `claude_code_handoff_avt_workspace_disk_rules.md`.

---

## ⛔ PROJECT POLICY — violating ANY item requires STOPPING work

**Before doing anything, pass the pre-flight in [`docs/AGENT_BOOTSTRAP.md`](docs/AGENT_BOOTSTRAP.md). Machine-readable source of truth: [`.deployment/manifest.yml`](.deployment/manifest.yml). If you cannot answer the pre-flight from evidence, you do NOT proceed.**

**Lovable-managed backend ONLY — no standalone Supabase dashboard/CLI/service-role/admin-API/external project. All auth, database, migration, and edge work goes through Lovable or the authenticated app/browser. See [`ENVIRONMENT.md`](ENVIRONMENT.md).**

- **Database & deploy are LOVABLE-MANAGED.** There is NO standalone Supabase to log into. All SQL runs in **Lovable's SQL Editor**; all edge redeploys via **Lovable → Edge Functions → redeploy** (Publish ≠ edge redeploy).
- **AVT Supabase project ref:** `qoyxgnkvjukovkrvdaiq`. **Canonical repo:** `github.com/fendifrost-dot/ai-video-tool`. **Canonical branch:** `main`.
- **Classify every change before you touch it.** [`docs/ARCHITECTURE_REVIEW.md`](docs/ARCHITECTURE_REVIEW.md) sorts changes into Class A (docs/tests/UI → no review), B (features/endpoints/queries → one reviewer), and C (storage/providers/auth/rendering/timelines/benchmarks/security/orchestration → **architecture + product + security sign-off before merge**). Security posture and known risks live in [`SECURITY.md`](SECURITY.md) + [`RISK_REGISTER.md`](RISK_REGISTER.md); test health is **always** reported by category per [`docs/TEST_TAXONOMY.md`](docs/TEST_TAXONOMY.md).

**FORBIDDEN — if you catch yourself doing ANY of these, STOP work immediately:**

| id | Forbidden |
|----|-----------|
| `standalone_supabase` | Opening / logging into a standalone supabase.com dashboard for ANY reason — migrations, schema, or data — **unless Lovable itself links you into it**. |
| `archived_clone` | Working from an archived or duplicate clone instead of the canonical repo. |
| `local_sql` | Running SQL locally or via the `supabase` CLI instead of Lovable's SQL Editor. **A CLI 403 / "wrong account" is a FALSE WALL**, not a blocker — do not open a dashboard or stall over it. |
| `stale_repo` | Acting on a stale checkout; confirm you are on canonical `main` and up to date. |

Do **not** ask Fendi to paste/run SQL, and do **not** hunt for a separate "Supabase project" outside Lovable Cloud. If in doubt: everything goes through **Lovable**, never a direct Supabase login. Full deploy/schema chain of command is below.

## ⛔ MODELS AND HIS LIKENESS — decisions by Fendi, binding on every agent (9 and 12 Nov 2026)

**1. No Grok on anything that ships.** "We need to demote grok image creator and replace with gemini" (9 Nov). "Gemini is preferred" (12 Nov). The workflow: shot stills in Gemini, animated with Seedance or Genjutsu (Fendi, 12 Nov). Kling is a candidate under test, not a production route.

| Need | Use | Never |
|---|---|---|
| A still that must read as a photograph (plate, scene, cutaway, reference) | **Gemini** `gemini-nano-banana-2.1` via `world-still-proxy` (`model` named on every request: the tool's default is still Grok) | `grok-imagine-image*` |
| Animating a still, or any generated clip | **Seedance** (`montage-shot`, the storyboard's Animate the plate) and **Genjutsu** (`dress-clip`, clothing on real footage): the routes Fendi approved on YSL | `grok-broll-proxy`, any `grok-imagine-video*` |
| A video clip with him in it | his real footage where it exists; otherwise recipe F (point 2 below) | any model given only stills of him |

Grok is Fendi's call, not yours ("grok is good for certain things so I don't want to make it impossible to use", 12 Nov). If Grok is the right tool, say so: he makes it in Grok Imagine on his subscription and you file it, or he approves it in words and you pass them as `grok_approval` on `avt_call` (the MCP server refuses a Grok generation without them; dry runs are free).

**2. Him in generated b-roll: generate it, with his face built from HIS sources** (Fendi, 12 Nov: "the face redraw isn't an issue").

- **Generating him doing things he never filmed is allowed and expected.** Approved, all "PERFECT!" (6 Nov): c026 seated on the carousel rail (`081a4ddf`), c033 leaning at the kitchen island (`20b8c185`), c039 at the platform pillar (`d90d6f29`). He filmed none of those actions. Missing footage of an action is **never** a reason to refuse a shot.
- **The route is recipe F** (`montage-shot`, `docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`): the action comes from the lines; his face comes from **his face photographs in the tool** (the `character_features` face set, sent by default) plus `@Video1` = a stretch of **his real footage** in the outfit where he is not rapping. Bigger is better: cut the window from the 4K original, cropped waist-up. There is no minimum face size; the result is judged, not the input.
- **The face put-back keeps the face of the clip it runs on.** On his real take that is his real pixels; on a generated render it is the render's face. It does not paste his real face onto a pose he never filmed. So: real footage of the action exists → use it (his pixels, `place_him_over_plate.py`); it does not → recipe F (his likeness from his photos), then the clothing swap + put-back if the outfit changes.
- **Never the source of his face:** a generated still of him (Gemini, Grok or any) fed to a video model, or text-to-video of him. That is what failed on Hyenas ("the person was clearly not me in the face").
- **Judge the output:** `scripts/edit/face_check.py` sheet against his face pictures + `scripts/edit/mouth_scan.py` (mouth at rest) on every render, posted with the clip. Fendi decides whether the face is him. A rejected face is re-rolled (different window, different staging), not argued.

**The exact technique (clothes, face put-back, placing him in any scene): [`docs/recipes/HIS_FACE_IN_ANY_SCENE.md`](docs/recipes/HIS_FACE_IN_ANY_SCENE.md).** Full run-book: `.claude/skills/avt-music-video-build/SKILL.md` §3–§4.

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

AVT reaches Fal via CC `switchx-restyle` (`fal-run`) + `fal-queue-poll`. Grok image uses `XAI_API_KEY` on **AVT** (drafts only; Grok ships nothing, see the block above). Do not edit CC while thinking you are in AVT.

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

**Show every output (Fendi, 14 Oct 2026):** post each generated clip and still into the chat as soon as it exists (inline file), not just a path or asset id.

## Building a video: load the skill first

`.claude/skills/avt-music-video-build/SKILL.md` is the run-book for any new video, any cutter handoff and any review of a delivered cut (the YSL lessons, 9 Nov 2026). Performance shots obey its motion budget (§3); photoreal stills go to Gemini (§4); the tool gaps we are looking to close are in `docs/capability/GAPS.md`.

## Hard product rules (wardrobe)

1. Asset processing runs through AVT / its edge functions — no ad-hoc local image pipelines in the agent sandbox.
2. No AI-regeneration of garment imagery; pixel preservation is mandatory.
3. Fix the tool, not workarounds. Minimize scope.

## CANONICAL: clothing swaps on Fendi's real footage keep his real face (approved 18 Oct 2026)

**Read [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md) before any wardrobe change on a performance take.** The loadable run-book, with the AVT tool set, is the skill [`.claude/skills/avt-clothing-swap/SKILL.md`](.claude/skills/avt-clothing-swap/SKILL.md).
- Genjutsu dresses the whole frame, which redraws his face.
- The canonical method then composites only the garment and cap back over the original frames. The face from the brows down, beard, hands and mouth stay the take's own pixels (proof printed: 0 difference).
- Approved by Fendi on c033 (final asset `5482b35b`).

**Before posting any shot with him, check it against [`docs/SHOT_RULES.md`](docs/SHOT_RULES.md) (locked, 5 Nov 2026) and say so in the post.** Every method with him in a shot, and which applies when: [`docs/recipes/README.md`](docs/recipes/README.md).** AI b-roll with him in it (mouth at rest) is [`docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`](docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md); the swap page's "Run on a new take" is the run-book for a new shot.

**Integration gap:** AVT's Dress and Region swap do **not** run this yet. It is the offline script `scripts/edit/body_only_swap.py`. Until it is in the app, a whole-frame Dress output is an intermediate, never the final picture.

Never use generated lip-sync or a face-altering pass on Fendi.

---

## LOCKED: Video garment-swap architecture — keyframe + propagation (do not drift)

**Canonical doc:** [`docs/VIDEO_SWAP_ARCHITECTURE.md`](docs/VIDEO_SWAP_ARCHITECTURE.md) — read it before touching any video-swap code. This section is the short form; the doc is authoritative.

**For Fendi's real performance takes (18 Oct 2026):** the swap engine is Genjutsu object-swap, and the final picture is the face-preserving put-back in [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md). On real footage that canonical method takes precedence over the keyframe/propagation lane below.

**Provenance:** Confirmed **unanimously** by Grok + Gemini + ChatGPT (2026-07-27). Matches the repo's own earlier pivot handoff [`CURSOR_HANDOFF_video_clothing_swap_pivot.md`](CURSOR_HANDOFF_video_clothing_swap_pivot.md) (**2026-06-21**, commit `228226f`) — the decision Phase 2b drifted from. This re-lock exists so that drift does not recur.

**Amended by Fendi, 9 and 12 Nov 2026: keyframes are made in Gemini, never Grok** (see "MODELS AND HIS LIKENESS" above). Where this section says Grok, read Gemini.

**PRODUCTION PATH = Gemini keyframe generation + temporal propagation.** Do **NOT** scale independent per-frame VTON / `switchx-restyle` to full-length videos.

**WHY:** Single-image engines (`switchx-restyle`, `vton-frame`) have **no temporal state** → independent per-frame sampling produces **"boiling"/flicker**. "Reference-lock" fixes only the *target garment*, **not** temporal consistency. Masked-lock (**Phase 2c**) is **ORIGINAL-FOOTAGE PRESERVATION** (pins face/scene/body), **NOT** garment-region stabilization.

**THE LANE:** approve a few product-accurate Gemini **hero keyframes** (every ~12–24 frames + at pose changes / scene cuts) → **propagate** the approved garment across intermediate frames via optical flow (RAFT / EbSynth-style) **or** a video-native VTON / video-to-video model → **re-anchor** a new Gemini keyframe when flow confidence breaks (large rotations / occlusions) → **composite onto the ORIGINAL footage** + keep the deterministic brand/logo composite for stripe/logo + **face-restore** as safety net.

**Phase 2b (independent per-frame swap) = BASELINE / DIAGNOSTIC ONLY.** Keep its reusable infra (frame extract, ordered storage, Fal routing, bounded concurrency, status tracking, reassembly); **never** make it the full-length production path.

**BENCHMARK before building full** (pick the winner on a short clip):
- **(a)** Gemini keyframe + optical-flow / EbSynth propagation, vs
- **(b)** video-native VTON (`fal-ai/kling/v1-5/kolors-virtual-try-on`, `fal-ai/fashn/v1.5`, Wan2.1 / Kling video-to-video with pose control).

**ENGINEERING PREREQS before any full-length run:**
- Replace fail-fast (one bad frame kills the job) with **per-frame/per-chunk persisted status + retries + resume + skip-completed**.
- Replace `EdgeRuntime.waitUntil` with a **durable chunk job queue**.
- Normalize output filename/format (code names everything `.jpg`).
- Record reproducibility metadata: model, version, prompt, reference-asset hash/version, mask version, seed, transfer mode.

**KILL CRITERION (short 2–4s test):** if it cannot hold Fendi's identity + exact jacket construction + stripe/logo placement + natural occlusion **without visible flicker/morphing**, **STOP and redesign before scaling.**
