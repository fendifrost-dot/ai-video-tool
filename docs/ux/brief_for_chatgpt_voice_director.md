# Brief for ChatGPT — In-app Voice Director for AVT music-video projects

**Date:** 2026-08-22  
**Status:** Consult complete. Phase 1 kill-test specified. **Class C if/when merged.**  
**Repo:** `github.com/fendifrost-dot/ai-video-tool`  
**Live:** `aivideotool.lovable.app`

Evidence labels: **[V]** Verified · **[O]** Observed · **[H]** Hypothesis · **[D]** Decision (now agreed) · **[R]** Recommendation.

---

## Agreed verdict (ChatGPT 2026-08-22 — Fendi accepted)

**BUILD a tiny read-only prototype now. Kill quickly if Fendi does not reach for it. Do not start with Grok speech-to-speech as the brain.**

| Decision | Agreement |
|----------|-----------|
| Engine v1 | **STT → existing AVT text/context → TTS.** S2S is Phase 2+ only, after the Director is useful. |
| Allowlist v1 | **Read-only:** `read_project`, `read_shots`, `read_song_analysis`, `whats_next`, `compile_prompt`. **No writes. No `draft_treatment`. No generation.** |
| Phase 2 writes (later) | `create_shot`, `update_shot`, `draft_treatment` via existing Anthropic path, limited treatment-note edits. No delete. No Imagine/video. No wardrobe approve. No timeline destructive ops. |
| Confirm (when writes exist) | Spoken commit + **visible Undo card**. Not mandatory tap-Accept. Paid ops (treatment draft) require an unambiguous spoken yes + one-draft/session budget. |
| Input | **Push-to-talk.** Open VAD later, optional. |
| Auth | Token/key mint and STT/TTS stay on **AVT** edge. Not Control Center. `XAI_API_KEY` never in the browser. |
| Dual brain | Grok = Director / interface. Anthropic = treatment author. Do not let Grok silently overwrite `treatment_json`. |
| Architecture C | Orthogonal. Do not wait. Do not grow this into a six-week Voice product. |
| Second product? | No, if it stays a voice interface over existing AVT writers. Yes, if it grows its own memory, treatment DB, media pipeline, or transcript warehouse. |

Kill-test bar (2–3 days, not a week): push-to-talk works; it understands the project; it speaks; `whats_next` is useful; it can read shots/prompts back; reconnect is tolerable; latency is not annoying. If Fendi does not naturally ask “what happens after the second chorus?”, kill it. Do not add writes because the plumbing works.

---

## Why not S2S in v1

xAI S2S is real (realtime, tools, barge-in, ~$0.05/min) **[O]**. Putting it in charge now adds a second decision-maker on top of existing treatment/shot logic. Modular STT → AVT context → TTS is easier to log, replay, test, gate, inspect, keep Anthropic on treatment, and swap the reasoning model later. Voice transport is also cheaper (STT $0.10–0.20/hr, TTS $15/1M chars) **[O]**.

S2S is the **premium conversational mode after behavior is proven**, not the foundation.

---

## Phase 1 implementation (what we are building)

```
Hold-to-talk on a project page
  → browser MediaRecorder (in-memory only)
  → POST grok-voice-director-proxy  action=transcribe   (JWT)
  → existing AVT reads (RLS) + whats_next / compile_prompt
  → POST grok-voice-director-proxy  action=direct       (JWT + projectId + transcript)
        edge re-loads project/shots/analysis with the user client (not a client-supplied briefing)
        Grok text phrases a spoken reply from that frozen briefing
  → POST grok-voice-director-proxy  action=speak
  → play audio
```

No database writes. No transcript bucket. No localStorage/sessionStorage of tokens or audio. Disconnect drops in-memory session state.

### Edge function (`grok-voice-director-proxy`)

Boring on purpose:

- verify JWT
- check project ownership via user-scoped Supabase client (RLS)
- origin allowlist
- per-user rate limit + session-duration / turn budget
- `XAI_API_KEY` only on the server (`/v1/stt`, `/v1/chat/completions` or `/v1/responses`, `/v1/tts`)
- never log raw credentials or full audio

### Security (Phase 1 must-haves)

- JWT required (`verify_jwt = true`)
- ownership checked before every `direct`
- rate limits + hard turn budget
- origin check on the mint/voice endpoint
- tool/read path uses the authenticated AVT session, not a stolen xAI credential
- no writes exist, so a leaked STT/TTS hop cannot mutate AVT
- CSP tightening and Durable Objects are **not** part of this kill-test (would be a larger app change). Documented as follow-up if Phase 1 lives.

### Dual brain

Phase 1 does not call `draftTreatment`. Grok only **speaks** from read tools. When Phase 2 adds treatment, the Director asks to run the **existing** Anthropic path; it does not author and save a Grok treatment as if it came from that generator.

---

## Phase 1 allowlist (locked)

| Tool | Effect |
|------|--------|
| `read_project` | title, mood, style, section names, treatment excerpt, lyrics excerpt |
| `read_shots` | number, section, duration, type, status, scene one-liner |
| `read_song_analysis` | bpm / drops / section labels if present; never invent times |
| `whats_next` | gaps vs sections + three options |
| `compile_prompt` | current working prompt text for a shot (scene / stored prompt) — no new generation |

Forbidden in this prototype: `create_shot`, `update_shot`, `delete_shot`, `draft_treatment`, `save_treatment_notes`, `createGenerationJob`, garment/hero, timeline/export, storage upload.

---

## Success / kill

**Keep going** if Fendi uses it to hear coverage gaps and shot read-backs without typing.

**Kill** if he still opens the shot table for every thought, if it invents BPM/drops, if a turn can write or spend Imagine, if lyrics leak across projects, or if we start storing transcripts “just in case.”

---

## Superseded Cursor proposal (do not implement)

The first draft of this brief proposed Grok S2S + dual spoken/tap confirm + `draft_treatment` in the first tool set. ChatGPT rejected S2S-as-v1-brain, mandatory double confirm, and any Phase 1 writes. That draft is historical only.

---

## Constraints (unchanged)

- Solo operator. Minimize surface.
- Lovable-managed backend only. Publish ≠ edge redeploy — this function must be redeployed by name.
- Provider keys never in the browser.
- Class C sign-off (architecture + product + security) before merge to `main`.
- Add `RISK_REGISTER` row for the new voice spend surface.
