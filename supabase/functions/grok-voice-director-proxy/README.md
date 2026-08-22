# grok-voice-director-proxy

Phase 1 **read-only** Voice Director. Push-to-talk STT → project briefing → Grok text → TTS.

Not speech-to-speech. No writes. No Imagine/video.

## Client

`src/components/voiceDirector/VoiceDirector.tsx` on `/projects/$id`.

## Actions

| `action` | Body | Result |
|----------|------|--------|
| `transcribe` | `{ audioBase64, mime }` | `{ text }` |
| `direct` | `{ projectId, transcript }` | `{ replyText, toolTrace }` |
| `speak` | `{ text }` | `{ audioBase64, mime }` |

## Secrets

`XAI_API_KEY` (same as Imagine). Optional: `GROK_DIRECTOR_MODEL` (default `grok-4.6`), `GROK_DIRECTOR_VOICE` (default `eve`).

## Deploy

Lovable → Edge Functions → redeploy **`grok-voice-director-proxy`**. Publish alone is not enough.
