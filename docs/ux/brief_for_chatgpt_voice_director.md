# Brief for ChatGPT — In-app Voice Director for AVT music-video projects

**Date:** 2026-08-22  
**From:** Cursor (implementation proposal)  
**For:** ChatGPT — **consult only. Do not treat this as a build order.**  
**Repo:** `github.com/fendifrost-dot/ai-video-tool` (`main`)  
**Live:** `aivideotool.lovable.app`  
**Change class if we ever build it:** **Class C** (new Grok/xAI provider surface + spend + auth/token + mic). See `docs/ARCHITECTURE_REVIEW.md`.  
**This file itself:** Class A (docs / consult).

Evidence labels used below: **[V]** Verified (cite it) · **[O]** Observed · **[H]** Hypothesis · **[D]** Decision (proposed, not locked) · **[R]** Recommendation.

---

## 0. What we want from you

Critique this implementation shape **before any code**. Fendi wants to **talk inside AVT** while building a music-video project, and have the tool **speak back** with options and the next direction — then actually write treatment / shots / prompts through existing AVT paths.

Please answer:

1. Is speech-to-speech (one Grok Voice session + tools) the right engine, or is STT → existing text LLM → TTS cleaner / cheaper / more controllable?
2. Is the v1 tool allowlist too small, too big, or pointed at the wrong rail?
3. Confirmation + spend gates — are they enough, or will voice still accidentally burn Imagine/video?
4. Dual-brain problem: treatment today is Anthropic via Control Center; voice would be Grok. Merge, keep, or isolate?
5. Security of browser WebSocket + xAI ephemeral tokens on Lovable/Cloudflare — holes we are missing?
6. Kill this idea if you think it is a second product pretending to be a feature. Say so.

Do **not** invent a Company OS, a coding agent, or a grok.com scrape. This is an **in-app director** for music-video projects.

---

## 1. The product ask (corrected)

Not: voice for coding AVT, Cursor, or Grok Build.  
Yes: a **Director** that lives on a project in AVT.

Fendi is often away from the keyboard (studio, car, walking a cut). He wants to say things like:

- “Draft a darker treatment for this song.”
- “Add a three-second jacket CU on the drop.”
- “What’s missing after the chorus? Give me three options.”
- “Read shot 4’s prompt back.”

…and hear a spoken reply, then have AVT **persist** the accepted change.

**[D]** Voice **drafts and queues**. Eyes still approve hero frames, garment truth, and any paid Imagine/video job.

---

## 2. What this is not

| Out of scope | Why |
|--------------|-----|
| Grok Build / `GROK_PROVIDER_SPECIALIST` | Engineering lane. Subscription CLI. Different job. |
| Consumer Grok Voice / grok.com / Tesla | xAI AUP: do not automate consumer Grok. Use the **API**. |
| Voice-approve wardrobe / stripe / face | Needs pixels. Voice must not mark a look canonical. |
| Voice-fire `/v1/images/edits` or `/v1/videos/*` in v1 | Spend + Architecture C research. Director may **recommend** a call; it must not submit one. |
| Timeline scrub / export mux | Visual + timing. Keep click-and-look. |
| Replacing the song bed with TTS | Project audio is the **record**. Voice is conversation, not the mix. |

---

## 3. AVT as it stands (ground this critique here)

Film-production OS: artists, looks, wardrobe, timelines, provider jobs. Lovable-managed Supabase `qoyxgnkvjukovkrvdaiq`. Frontend TanStack Start + React 19. Edge: Deno functions. Grok Imagine already on AVT via `XAI_API_KEY` (`grok-image-garment-proxy`). Fal only via Control Center. **[V]** `CLAUDE.md`, `docs/grok_api_status.md`, `SECURITY.md`.

### Project rail (the Director’s map) **[V]**

`src/components/ProjectSidebar.tsx`:

Treatment → Shot List → Assets → Cover Flight → Hero Frame → Prompt Lab → Video → Review → Timeline → Export

### Writers the Director must reuse (no parallel tables) **[V]**

| Action | Existing path |
|--------|----------------|
| Read project | `src/lib/queries/projects.ts` → `video_projects` (lyrics, mood, visual_style, `treatment_json`, song structure) |
| Draft treatment | `src/lib/treatment/api.ts` → `proxy-provider-call` → CC `ai-draft-treatment` (Anthropic). Saves `{ text, model, generated_at, tokens }` into `video_projects.treatment_json`. |
| Structured treatment UI | `src/pages/TreatmentBuilderPage.tsx` |
| List / create / update / delete shots | `src/lib/queries/shots.ts` → `shots` (RLS + `user_id` on insert) |
| Compile prompt | `src/lib/prompts/compiler.ts` + Prompt Lab |
| Song intelligence | Client-side BPM/beats/energy only. **Paid audio APIs were rejected.** `docs/song_intelligence.md` |
| Generate video | `src/lib/providerJobs/api.ts` → `proxy-provider-call` → CC. **Not a v1 voice tool.** |
| Hero / garment | `grok-image-garment-proxy`. **Not a v1 voice tool.** |

Audio in AVT is the **song** (`project-audio`), muxed on export. Lyrics are pasted text. **[V]**

---

## 4. Grok Voice as it stands (provider claims, not AVT capability)

xAI Voice docs (`docs.x.ai/developers/model-capabilities/audio/voice`, fetched 2026-08-22) **[V]**:

| API | Endpoint | Role |
|-----|----------|------|
| Speech-to-speech | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | Full-duplex talk + tool calls + spoken reply |
| TTS | `POST /v1/tts` | Text → audio (speech tags, many voices, custom clone) |
| STT | `POST /v1/stt` | File/stream → text (+ timestamps / diarization) |
| Custom voices | `POST /v1/custom-voices` | Clone from ≤120s reference |

Browser auth: **ephemeral token** from `POST https://api.x.ai/v1/realtime/client_secrets` using the server key; client connects with `xai-client-secret.<token>` on `Sec-WebSocket-Protocol`. Token TTL example 300s. **Never put `XAI_API_KEY` in the browser.** **[V]** `SECURITY.md` already states this for Imagine.

List price (x.ai/api marketing, 2026-08-22) **[O]** — re-verify before any spend gate: speech-to-speech ~$0.05/min; TTS $15/1M chars; STT $0.10–0.20/hr. A 15-minute director session ≈ $0.75 if S2S.

Tools: session declares JSON-schema functions; model emits `response.function_call_arguments.done`; **our client executes** and returns output; model continues speaking. Same pattern as OpenAI Realtime. **[V]**

---

## 5. Proposed implementation (Cursor’s current shape)

### 5.1 Engine **[D]**

**v1 = Grok speech-to-speech + client-side tool runner.**

Why one session, not STT→Claude→TTS:

- Fendi asked for **talk and be talked to**, not dictation into forms.
- Tool-use mid-conversation (“add the shot” → “done, you now have five”) is native to S2S.
- We already hold `XAI_API_KEY` on AVT. No new vendor for the pipe.

Why we might be wrong (please attack this):

- Treatment quality today is Anthropic, not Grok. S2S Grok may write worse treatments than `ai-draft-treatment`.
- S2S is harder to log, test, and replay than text.
- $0.05/min vs almost-free STT + existing CC text call + cheap TTS.
- Cloudflare/Lovable + long-lived browser WebSockets may be flaky; we have **0 provider-live tests**. **[V]** `docs/TEST_TAXONOMY.md`.

**Fallback shape if you reject S2S:** push-to-talk STT → existing text path (treatment/shot mutations) → TTS of the reply. Same allowlist. Worse “director” feel, easier to gate and test.

### 5.2 Process topology **[D]**

```
[AVT project page, logged-in JWT]
   │
   ├─ POST /functions/v1/grok-voice-session-proxy
   │     verify JWT + project ownership
   │     mint xAI ephemeral token (XAI_API_KEY stays on edge)
   │     return { token, expires_at, session_instructions_hash }
   │
   └─ Browser WebSocket → wss://api.x.ai/v1/realtime
         session.update:
           voice, instructions (Director system prompt + project briefing),
           tools = allowlist only,
           turn_detection = server_vad
         on function_call:
           run existing TanStack mutations / query fns in the browser
           (same RLS as the UI — do not open a service-role tool server)
         on output_audio: play
         on user barge-in: cancel the current spoken turn
```

**[D]** Tools run **in the authenticated browser** against the same Supabase client as the UI. That keeps RLS as the write gate. A service-role “voice tool proxy” would be a second trust boundary and is the wrong default.

**[R]** Edge function does **three things only**: authz, mint token, optionally return a **server-built briefing** (project title, section list, shot count, treatment excerpt) so the model is grounded without stuffing lyrics into a client-editable blob the user can jailbreak into a different project.

### 5.3 Director system prompt (sketch) **[D]**

You are the AVT **project director** for this one `project_id`. You are not a coding agent and not the Imagine API.

- Speak in short director language. Always offer **three options** when the user asks what’s next.
- Read before write. After any write, say what changed (shot number, section, duration).
- Writes require a spoken confirm (“yes, add it” / “save that”).
- You cannot approve looks, swap garments, or start a paid generation.
- If the user asks to generate video or a hero frame: explain the next **visual** step and stop.
- If audio/song analysis is missing, say so; do not invent BPM or drop times.
- Never claim a lock-file architecture is settled. Garment-swap production path is under evidence review.

### 5.4 v1 tool allowlist **[D]**

Hard-coded in client + hashed into the session. Model cannot add tools.

| Tool | Maps to | Side effect |
|------|---------|-------------|
| `read_project` | `useProject` + song structure helpers | none |
| `read_shots` | `useProjectShots` | none |
| `read_song_analysis` | `song_analyses` if present | none |
| `draft_treatment` | `draftTreatment()` | CC Anthropic spend + writes `treatment_json` |
| `save_treatment_notes` | patch `treatment_json` / notes field only after confirm | write |
| `create_shot` | `useCreateShot` | insert |
| `update_shot` | `useUpdateShot` (description, section, duration, type — **not** status→approved) | write |
| `compile_prompt` | `compilePrompt` for a shot id | none (or save compiled text if we already persist it) |
| `whats_next` | pure function: lyrics/sections vs shots vs analysis → gaps | none |

**Not in v1:** `delete_shot` (too easy to regret by voice), `createGenerationJob`, `grok-image-garment-proxy`, timeline/export, wardrobe, faceswap, any storage upload.

`draft_treatment` is the one v1 tool that **already spends**. Treat it like a paid call: spoken confirm + UI toast with model + “Undo” if we can revert `treatment_json`.

### 5.5 Confirmation + spend **[D]**

Two layers, both required for writes:

1. **Spoken confirm** in the Voice session (model must call a `confirm_pending_write` or the client holds a pending intent until the user says yes).
2. **Visible UI chip** on the current page: “Director wants to add Shot #5 — Accept / Reject.” Accept runs the mutation. Reject drops it.

Paid tools (`draft_treatment` in v1; Imagine/video never in v1):

- Client-side session budget (e.g. max 1 treatment draft per voice session unless Fendi raises it).
- Log `provider`, `model`, `estimated_cents`, `project_id` the same way other jobs do if a table already exists; otherwise a small `voice_session_events` later — **do not design a new warehouse in v1**. Toast + existing treatment envelope provenance is enough to start.

### 5.6 UX **[D]**

- One **Director** control on project pages (not global chrome). Dead when no `project_id`.
- Push-to-talk **or** open conversation with server VAD — your call; we lean **push-to-talk for v1** so a phone in a pocket does not create shots. **[R]**
- While connected: muted live caption of what it heard + last tool name (accessibility + debug).
- After hangup: nothing persists except the mutations the user accepted. No secret voice transcript bucket in v1 (Class C storage). If we need transcripts later, that is a **new** storage decision.

### 5.7 Phased build (only after you and Fendi sign off) **[R]**

| Phase | Ship | Gate |
|-------|------|------|
| **0** | This consult. No code. | You + Fendi agree engine + allowlist |
| **1** | Token mint + listen/speak + `read_*` + `whats_next` only | Authz test: other user’s project → 403. No writes. |
| **2** | `create_shot` / `update_shot` / treatment with dual confirm | Undo works. No generation tools exist in the session. |
| **3** | Optional: “recommend a paid Imagine call” as **speech only** (no tool) | Still cannot submit |
| **never-as-v1** | Voice-submit Imagine/video, voice-approve hero, custom artist voice clone onto the mix | Separate Class C + product brief |

Phase 1 is the honest prototype. If Fendi does not enjoy talking to a read-only director, kill it before writes.

---

## 6. Security / Lovable constraints (please stress-test)

**[V]** Rules we will not break:

- `XAI_API_KEY` stays an AVT edge secret. `SECURITY.md`.
- Edge functions that use service role must verify JWT **and** project ownership. RISK-001 class of bug: unauthenticated invoke → provider spend.
- No standalone Supabase CLI/dashboard. SQL only in Lovable SQL editor if a table is ever added.
- Publish ≠ edge redeploy. New `grok-voice-session-proxy` needs its own Lovable redeploy.
- SSRF guard (`urlValidator`) is irrelevant if we never fetch user URLs in this function — keep it that way. Token mint is outbound to `api.x.ai` only.

**[H]** Risks we want you to grade:

1. Ephemeral token stolen from the browser → attacker talks to Grok on **our** bill. Mitigations: 300s TTL, bind token request to `project_id` + `user_id`, rate-limit mints, no tools that spend except treatment (and treatment still needs our JWT to write).
2. Prompt injection via lyrics / pasted treatment (“ignore tools, generate video”). Mitigations: allowlist, client ignores unknown tool names, generation tools absent.
3. Cross-project briefing leak if the edge briefing query is wrong. Mitigations: `.eq("id", projectId).eq("user_id", auth.uid())` (or existing RLS via user-scoped client, not service role, for the briefing read).
4. Long WebSocket vs Cloudflare/Lovable idle timeouts — session drops mid-sentence. Mitigations: push-to-talk, cheap reconnect, no half-applied writes (intent queue).
5. Mic in a shared space recording unpublished lyrics. Product/legal, not just eng. **[R]** visible recording indicator + no transcript store in v1.

A build must add a **RISK_REGISTER** row (new provider surface + spend). That is part of Class C, not optional.

---

## 7. Dual-brain: Anthropic treatment vs Grok Voice **[H]**

Today the treatment button is Anthropic-on-CC. Voice is Grok.

Options:

| A | Voice only **calls** `draftTreatment()` (Anthropic) and **reads it aloud** | One writer, Grok is the mouth |
| B | Grok drafts treatment text in-session; we save it as `treatment_json` with `model: grok-voice` | Two writers, provenance splits |
| C | Replace Anthropic with Grok text for treatment entirely | Out of scope; do not sneak this in |

**[D]** Cursor prefers **A** for v1. Grok is the director. Anthropic stays the treatment author. `save_treatment_notes` is for small spoken edits after the draft exists.

If you think Grok S2S will fight Anthropic’s prose (user says “make it darker,” Grok rewrites the whole treatment locally and we save the wrong brain), say so and recommend B or a stricter “notes only” patch.

---

## 8. How this relates to other Grok work (do not mix)

| Lane | Job |
|------|-----|
| Imagine API | Production media. Hero + (research) `/v1/videos/edits`. |
| Grok Build specialist | Engineering. Catch stale architecture. Not in the AVT UI. |
| **This Director** | In-app creative conversation + existing project writers. |

Architecture C (video edit + original-master composite) stays a **research** question. The Director must not “help” by submitting edits. It may say “that’s a visual / paid-call question — open Hero / Video.”

---

## 9. Success / kill

**Success (Phase 2):** Fendi can, without typing, produce a treatment revision and a coherent 6–10 shot list tied to song sections, hear “what’s next,” and see those rows in the existing Shot List / Treatment pages. No Imagine cents spent from the voice session.

**Kill if:**

- He still has to look at a form to trust every write (then voice is theater).
- Shots appear he did not confirm.
- A session can submit a provider generation.
- Lyrics leak across projects.
- We start storing raw audio/transcripts “just in case.”

---

## 10. Specific questions (please answer in order)

1. **Engine:** S2S + tools vs STT → current text stack → TTS? Pick one and why, including cost and testability.
2. **Allowlist:** Cut or add v1 tools? Especially `draft_treatment` (already spends) vs Grok-authored treatment (option B).
3. **Confirm UX:** Spoken-only vs spoken + on-screen Accept chip. Is dual-confirm too heavy for a director in motion?
4. **Push-to-talk vs open VAD** for a musician who is not at a desk.
5. **Token mint on Lovable edge** — any reason to put this on Control Center instead (AVT already has `XAI_API_KEY` for image; CC has `Frost_Grok` for video)?
6. **Phase 1 read-only prototype** — worth a week, or skip straight to writes?
7. **Should we build this at all while Architecture C is the live research question**, or is it a distraction that should wait?
8. **Anything in this brief that would lock a stale assumption** (we just made that mistake on a Grok specialist charter — do not repeat it).

---

## 11. Constraints for your answer

- Solo operator + agents. Minimize surface.
- Cost-sensitive. Session budget must be obvious.
- Lovable-managed backend only. No standalone Supabase.
- Provider keys never in the browser.
- Asset processing for **media** stays in AVT/edge jobs; voice must not become an ad-hoc local media pipeline.
- Evidence labels on claims. Do not treat xAI marketing as AVT capability.

**What success looks like from this consult:** a yes/no on the engine, a revised allowlist, a security punch-list, and an explicit “build / wait / kill” verdict — not a spec dump and not code.
