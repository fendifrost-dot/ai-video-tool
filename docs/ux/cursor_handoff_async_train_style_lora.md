# Cursor Handoff — Async Refactor for `train-style-lora`

## The bug

`train-style-lora` on CC awaits the Fal polling loop synchronously. Supabase edge functions have a hard 150s execution wall. `pollFalUntilDone()` has `timeoutMs = 600_000` (10 min). So the function dies at ~150s, kills the in-flight Fal poll, and the callback to AVT never fires. AVT's `identity_profile_json.style_lora_training.status` stays `"pending"` forever even though Fal probably finished hours ago.

Confirmed: Fendi's training kicked off 13:08 UTC today. At 17:45 UTC (4h 37m later), the status was still `pending`, the legacy face LoRA was untouched, no `lora_legacy_face` set, no callback delivered. Identical symptom we hit on compose-look before we made it async.

## Repo state

- CC main HEAD: `5f306b7485` (plus possibly newer — check `git log`). Function lives at `supabase/functions/train-style-lora/index.ts`.
- AVT main HEAD: includes the `train-style-lora-proxy` (fires CC) and `train-style-lora-callback` (receives result) edge functions Cursor shipped earlier. Those are correct — only CC's training function has the sync-await bug.

## The fix (mirror what we already did for compose-look)

CC's compose-look pipeline already implements the async pattern correctly. Same shape applies here:

1. **Receive the request** — read `body`, validate, etc. (existing code is fine up to this point)
2. **Return immediately** with `{ status: 'queued', request_id: '<fal_request_id>' }` after submitting to Fal but BEFORE polling
3. **Run `pollFalUntilDone` + `postCallback` inside `EdgeRuntime.waitUntil()`** so the work continues after the response is returned. This survives past the 150s response wall (background context has up to 5 min, sometimes longer depending on infra; either way far more than we need for typical Fal training)
4. **On poll failure or callback failure inside the background**, swallow errors as already done (`postCallback` already does) — but consider one improvement: write a `failed` status back to AVT on terminal failures so the UI doesn't sit on `pending` forever. This requires reaching the same callback URL with a `{ status: 'failed', error }` payload.

Reference shape — `compose-look` uses something like:

```ts
serve(async (req) => {
  // ... validate ...
  
  // Submit to Fal synchronously (so we have a request_id to return)
  const submitResp = await fetch('https://queue.fal.run/...', { ... });
  const { request_id, status_url, response_url } = await submitResp.json();
  
  // Kick off polling in background
  EdgeRuntime.waitUntil((async () => {
    try {
      const result = await pollFalUntilDone(falKey, request_id, status_url, response_url);
      // ... extract lora_url ...
      await postCallback(callback_url, proxySecret, {
        status: 'complete',
        lora_url,
        trigger_word,
      });
    } catch (err) {
      // surface as failed so UI doesn't hang on pending
      await postCallback(callback_url, proxySecret, {
        status: 'failed',
        error: String(err),
      });
    }
  })());
  
  // Return immediately
  return json(200, { status: 'queued', request_id });
});
```

Adapt to the current `train-style-lora` structure but the principle is the same.

## Additional defensive change (small, optional)

The AVT proxy currently sets `style_lora_training.status = 'pending'` BEFORE firing CC. If a user double-clicks "Train Style LoRA" or hits it twice while a job is pending, two Fal trainings get submitted (both billed). Two fixes:

- In AVT proxy: if `identity_profile_json.style_lora_training.status === 'pending'` AND `started_at` is less than 30 min ago, reject the new request with `409 already_training`.
- In the AVT UI: disable the "Train Style LoRA" button when status is `pending` and show "Training in progress — started Xm ago" instead.

Optional but a small UX win + cost protection.

## Constraints (unchanged hard rules)

- Lovable chat = redeploy/publish ONLY. No code asks, no schema asks.
- All code via GitHub REST.
- Don't touch the compose-look pipeline.
- Don't touch the AVT frontend except for the optional button-disable note above.

## After push

Hand me the SHA. I'll:
1. Trigger CC Lovable redeploy via terse chat
2. Help Fendi recover the orphan Fal job from his Fal dashboard if it completed (manual paste of the LoRA URL into his artist row via Supabase SQL Editor)
3. OR re-fire training and verify the new async path completes correctly (status flips pending → complete, lora.url swaps to FENDIFITS, lora_legacy_face populated, all within ~5-10 min)
4. Then re-run the failing-case smoke test through `lora_segmented_inpaint` with the new style LoRA

## What we want to avoid

The function should NEVER again sit in "pending" indefinitely because the edge function died mid-poll. With `EdgeRuntime.waitUntil` + the `failed` status fallback, the longest a job can stay pending is the Fal job's actual runtime (typically 15-30 min for 1000 steps × 45 images). After that, either `complete` or `failed` always lands.
