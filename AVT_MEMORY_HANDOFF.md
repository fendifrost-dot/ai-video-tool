# Handoff — Wardrobe Pipeline & AVT (as of 2026-06-17)

> **Pivot update (2026-06-21):** Per-frame jacket-only IDM-VTON failed on **garment construction fidelity** (stripe, collar, sleeve panels). The locked architecture below is **superseded** for video clothing swap. Read **`CURSOR_HANDOFF_video_clothing_swap_pivot.md`** first — hero still → human approve → propagate → tracked brand layer. Hard rules in this file still apply. Phase 1 gates everything; Grok Imagine video gen in Prompt Builder is Phase 2+ experiment lane only, not the wardrobe engine.

This document is the single source of truth for a fresh Claude session picking up Fendi's AVT (AI Video Tool) wardrobe-swap work. The previous session drifted into ad-hoc Claude-side image processing (segmentation, compositing, AI re-rendering of garments). That is **explicitly not allowed.** Read this whole file before doing anything.

---

## Hard Rules (read first, do not violate)

1. **All asset processing runs through the AVT tool.** Claude does not segment, composite, mask, crop, or AI-regenerate images in a sandbox. If a workflow step needs to happen, it lives inside AVT or inside a Compose & Look (CC) edge function that AVT calls. If it doesn't exist there yet, the answer is "we need to build it into AVT," not "I'll do it locally and feed the result in."

2. **No AI-regeneration of garment imagery, ever.** Garment references for VTON come from real product photos. Pixel preservation is mandatory. Seedream-edit, Nano Banana, and any other generative image-edit model are off-limits for garment-truth assets. (They remain allowed for scene composites in SwitchX background work — not for the garment itself.)

3. **If the AVT tool isn't producing what Fendi wants, the fix is to improve AVT — not to work around it.** Iteration goes into the tool's code or its wired prompts, not into Claude doing the missing step manually.

4. **Audit outputs against references before delivering.** When AVT returns a result, open the reference and the output side-by-side, write down every visible delta (good and bad), and only deliver with that delta list attached. Do not call something a "win" without auditing.

5. **Wait for explicit approval before kicking off any task.** Do not jump back into VTON runs, segmentation, or pipeline work the moment this session opens. Fendi will tell you what to do next.

---

## Architecture (locked, do not redesign)

> **Superseded for video swap (2026-06-21):** See `CURSOR_HANDOFF_video_clothing_swap_pivot.md`. The diagram below remains historical context for still/VTON tooling and CC edge functions.

### The wardrobe pipeline (2026-06-17 — historical)

```
Source Video
↓
FFmpeg frame extraction         (5–10 keyframes for tests, full clip for prod)
↓
VTON garment transfer per frame  (PRIMARY: fal-ai/idm-vton; fallback: CatVTON, FASHN-AI)
↓
Approved wardrobe anchor frames
↓
SwitchX temporal propagation     (background lock + frame-to-frame coherence)
↓
FFmpeg reassembly                (preserve fps, timing, audio)
```

### Responsibility split

- **VTON (IDM-VTON / CatVTON / FASHN-AI)** owns: garment transfer, fit, geometry, collar, zipper, seams, logo/texture fidelity, removal of the old garment.
- **SwitchX (Beeble)** owns: temporal consistency, motion propagation, background lock, cinematic polish, lighting match. NOT the wardrobe creator anymore.
- **FFmpeg** owns: frame extract, frame reassembly, audio preservation, timing, final encoding.

### Why this architecture

We pivoted to VTON-first on 2026-06-17 after multiple SwitchX `alpha_mode: "custom"` runs produced "plausible jacket" instead of "this exact jacket." Beeble custom-mode is generative inpainting — it cannot literally transfer specific garment pixels. VTON models are purpose-built for that. SwitchX is still in the pipeline, just no longer first. Fendi's exact words at the pivot: *"Recreating the desired jacket after masking out old jacket isn't the solution. We need the tool built for taking the image of the desired garment and placing it on me near perfect."*

### Kling v2v is disqualified

Do not propose Kling O1 Edit v2v for wardrobe. It does not preserve identity — re-renders the subject from scratch. Fendi's verdict on the 4 Kling test outputs: *"None of the characters are the same image to image and what's worse is none of the character look anything like me. One of the characters is an actual white man… I give this an F."*

---

## Where things live

- **AVT (AI Video Tool)** — `https://aivideotool.lovable.app/`. Artist root: `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`. This is the canonical user-facing tool. All wardrobe-swap work goes through it.
- **CC (Compose & Look) Lovable project** — `https://lovable.dev/projects/7fce9fc6-fd96-4a31-8a89-649f00298c51`. Lovable chat is for redeploy/secret ops only. Never code edits in Lovable chat.
- **Repo** — `https://github.com/fendifrost-dot/fendi-control-center` (this repo, `main`). Local path on Fendi's machine: `/Users/gocrazyglobal/fendi-control-center`. Edge functions live in `supabase/functions/`.
- **FFH admin** — `https://fan-growth-pilot.lovable.app/admin`. NOT fendifrost.com or bemoremodest. Different concern (playlist pitches), do not conflate with AVT.
- **AVT Supabase** — `qoyxgnkvjukovkrvdaiq.supabase.co`. Lovable project **AI Video Tool** (`aivideotool.lovable.app`). Managed via Lovable Cloud — there is NO standalone supabase.com account. **Do not confuse with CC's project** (`wkzwcfmvnwolgrdpnygc` — Fendi Control Center / compose-look / switchx-restyle).

## Garment generator

There is a tool in AVT's Wardrobe section that creates product samples and clothing for Fendi's avatar (not called "garment generator" precisely — that's a working label). Cursor is digging into its wiring as of 2026-06-17. **Parked.** Do not touch until Fendi unparks it.

---

## The CC edge function: `switchx-restyle`

Located at `supabase/functions/switchx-restyle/index.ts`. Single entry point with multiple actions. Auth header: `X-Proxy-Secret: iPhone22G!` (the `KLING_PROXY_SECRET` value).

Action surface as of commit `db046cc`:

- `stage-file` — Re-host a remote file on Fal CDN (used when source host blocks Fal/Beeble IPs).
- `compose-reference` — Calls `fal-ai/bytedance/seedream/v4/edit`. **Off-limits for garment truth.** Allowed for scene composites.
- `remove-bg` — Calls `fal-ai/birefnet/v2` for background removal.
- `segment-image` — Calls `fal-ai/sam-3/image` with `apply_mask:true` and a text prompt. Returns the source with non-prompted regions blacked out. Pixel-preserving.
- `vton-frame` — Calls `fal-ai/idm-vton` or `fal-ai/cat-vton`. Returns a queue handle (immediate), polled via `fal-queue-poll`.
- `cancel-fal-job` — PUTs Fal cancel endpoint for in-flight jobs.
- (legacy) `sourceVideoUrl + prompt` body — original SwitchX three-mode orchestrator (background / wardrobe / both).

The companion edge function is `fal-queue-poll` (commit `9913f43`). It surfaces `fal_error_body` on response failures so silent validation errors no longer look like indefinite IN_QUEUE — this is the observability fix from the IDM-VTON `description` field bug.

### Known endpoint quirks

- `fal-ai/idm-vton` requires the field name `description` (was renamed from `garment_description`). The current code passes both, so it works regardless.
- `fal-ai/sam-3/image` text prompts work best with **single words** (`"jacket"`, `"tie"`, `"clothing"`). Multi-clause prompts (`"jacket, dress shirt, tie"`) return empty masks.
- `fal-ai/sam-3/video-rle` returns RLE only — useless for our pipeline. Use `fal-ai/sam-3/video` for an MP4 with masks.
- Beeble cannot fetch from `catbox.moe` (RemoteDisconnected). Stage to Fal CDN first.
- Beeble `alpha_mode: "custom"` polarity is **BLACK = preserve, WHITE = regenerate**. Edit-mask polarity, not preserve-mask. (Opposite of the original docs reading.)

---

## FFH playlist work (separate stream)

This is the music industry outreach side, not AVT. Don't mix them up.

- Send window: **Mon–Fri, 10AM–4PM America/Chicago.** No middle-of-the-night sends. If a send would land outside the window, defer to the next eligible slot.
- `approve_draft` only fires the actual send when called with `send_immediately: true`.
- 90-day curator cooldown enforced via the `playlist_targets` table.
- Admin is at `fan-growth-pilot.lovable.app/admin`.

---

## State of the SL jacket VTON tests (2026-06-17)

Five IDM-VTON outputs were produced this session against Fendi's Tokyo alley source frame, all targeting a Saint Laurent mastic cotton zip jacket. Reference photo source: SL website on-model shot (jacket worn over striped tie + striped dress shirt, model collar folded back so the navy interior lining shows). None of v1–v5 were approved for production. The session drifted into Claude doing ad-hoc segmentation and AI-regenerated reference cleanup, which is what triggered the stop.

**Lesson logged:** the on-model SL source photo doesn't show the mastic exterior of the collar (it's folded back showing the navy lining). VTON can only transfer what's visible in the reference. A flat-lay or zipped-up SL product shot would be needed to get the mastic collar exterior on the output. But that decision is Fendi's — and the right way to feed that into the pipeline is through AVT, not through Claude doing manual file work.

**What is NOT to happen on next-session startup:** re-running VTON, generating new reference compositions, segmenting more images, or any other proactive moves on this work. Wait for Fendi to direct.

---

## Memory rules carried over

These are the persistent memories that survive this handoff. They live in `agent/memory/` (auto-memory system) but listing them here so a fresh session can re-create them if memory was wiped:

- **VTON-first pivot is locked.** SwitchX is no longer the wardrobe engine — IDM-VTON / CatVTON / FASHN-AI own wardrobe; SwitchX owns background + temporal. Do not pitch "let's try SwitchX custom mode again."
- **Kling v2v disqualified.** Identity-destroying for Path B. Don't propose.
- **No garment regeneration.** Real pixels only for VTON references. Seedream-edit and Nano Banana are not allowed for garment-truth assets.
- **AVT-driven workflow.** Don't work around the tool. Fix the tool.
- **FFH admin URL.** `fan-growth-pilot.lovable.app/admin`. Not anywhere else.
- **FFH send flow.** `approve_draft` needs `send_immediately: true` to actually send.
- **Central time send window.** 10AM–4PM CT, Mon–Fri, for playlist pitches.

---

## Communication preferences

- Distill to what's actionable. Mobile-first. Avoid em dashes overuse, avoid bullet vomit, no headers for short replies.
- Audit before declaring a win. Reference-vs-output comparisons, explicit delta lists.
- When a tool errors silently, instrument it (see the `fal_error_body` surfacing fix).
- Don't worry about time spent — Fendi's call. The job is to apply all available resources to make the tool work properly.
- Never recommend pivoting away from the agreed architecture. The architecture is locked unless Fendi says otherwise.

---

## Next steps

**None to kick off proactively.** Wait for Fendi's explicit instruction before resuming any work. When he gives a direction, the right move is almost always: open AVT, find the relevant tool surface, run it from there, audit the output. If the surface doesn't exist or doesn't behave correctly, surface that to Fendi and propose a code change to AVT or the CC edge functions — not a workaround in this Claude session.
