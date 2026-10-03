# Provider jobs: who moves them

2026-10-03 · post-production-test hardening tranche, priority 4.

**The rule: the browser may display progress. It must not own it.** Submit a job, leave the storyboard, come back
later — the result is there.

## 1. What the audit found (before this tranche)

A storyboard job (and a Runs batch job) went through five steps. The browser owned four of them.

| Step | What happens | Who did it | With the page closed |
|---|---|---|---|
| Submit | the job's row is written first (write-ahead), then the provider is called through Control Center, then the provider's job id is written on the row | the browser (`worldBatch/runner.ts submitShot`) | — (submitting is the director's act) |
| Poll | ask Control Center where the job stands, write `succeeded` / `failed` on the row | **the browser**, every 20 s, from `useBoxJobs` / the Runs page | the job stayed "rendering" for ever |
| Save | download the clip, store it, insert the `project_assets` row, link it to the job | the server (`ingest-provider-job`) — but **only when the browser called it** | a rendered, paid clip was never saved |
| Attach | put the saved clip on the shot it was made for (select it); a restaged take: mark it performance footage and write its derived sync first | **the browser** (`planAssign`, `fileRestagedClip`) | the clip never reached its shot |
| Image jobs | one synchronous server call draws and files the pictures; then the **browser** checked them for stacked panels, put them on the shot and marked the job done | **the browser** | pictures filed and paid for, job left "drawing" for ever |

Nothing was lost on reopening the page (it picked every step up from the rows) — but nothing moved until then.

## 2. What moves them now

```
pg_cron (every minute) → public.kick_provider_jobs()      only when a job is unfinished
        → pg_net → edge function provider-jobs-tick        header x-cron-key (key lives in job_runner_config, service role only)
              → public.claim_provider_jobs()               hands over the unfinished jobs, one worker at a time
              → _shared/jobProgress.ts  advanceJob()       per job: ask the provider → save the clip → file a restaged take
                                                           as a take in sync → put it on its shot → finalized_at
```

- **The decision code is pure** (`supabase/functions/_shared/jobProgress.ts`): what a job needs next, read from its
  own row; every step is safe to repeat, so a worker that dies anywhere is picked up where it stopped.
- **Saving is the one existing implementation**, moved to `_shared/ingestClip.ts` and used by both
  `ingest-provider-job` and the tick. It now also links a clip that was stored but never linked instead of
  downloading it a second time.
- **One worker at a time has a job** (`claim_provider_jobs`: `for update skip locked`, a four-minute claim), so two
  ticks — or a tick and a page's nudge — never save the same clip twice.
- **A page that is open asks for a tick** (`provider-jobs-tick` with its user's JWT: that user's jobs only) and
  re-reads the rows (`src/lib/providerJobs/progress.ts`). It polls no provider, saves no clip, assigns no footage.
  The storyboard's job hook and the Runs page are both reduced to this.
- **Image jobs**: the server call that draws the pictures now writes them on the job's row the moment they are filed
  (`world-still-proxy`, `jobRowId`). The page that asked still checks and attaches them when it is there. When it is
  not, the tick finishes the job after two minutes: the pictures go on the shot **unselected** and the job says they
  are unchecked; opening the storyboard runs the stacked-panels check and only then selects one. A picture is never
  selected for a shot without the check. (The check stays in the browser because it needs the picture decoded at full
  size; decoding a 2K image inside the request that has just paid for it would risk the request.)
- **A clip's image is its own job now.** "Generate clip" on a shot with no image used to draw the image inside the
  clip's submit, with no row of its own; it is now drawn as an image job first, so it is on record like any other.
- **Giving up is said**: a submit that never reported a provider job (10 minutes), a render the provider never
  finished (6 hours), a save or attach that failed six times — each ends the job with the reason on the row
  (`error_text` / `progress_note`). A rendered clip that could not be saved stays `succeeded` with the provider's
  result on record.
- **History is not re-run**: the migration marks every job that was already over, or older than a day, as finished
  as it stands.

## 3. What is preserved

Provenance (the request payload and settings the submit wrote are never rewritten, only added to: `attachedAt`,
`attachedBy: "server"`), cost authorization (nothing is submitted by the server — only the director's confirmed
submit spends), the `provider_jobs` row as the record, retry semantics (a failed job is retried only by the director),
ingestion (same code), shot assignment (the same plan the app makes — a test holds the two equal).

## 4. Proof

`src/lib/providerJobs/jobProgress.test.ts` — the app's real runner submits into an in-memory copy of the tables, then
**no client code runs again** and the scheduler ticks: the clip is saved and on its shot; a restaged take is filed as
a take in sync; failures, give-ups and a vanished shot end honestly; running twice changes nothing; an image request
whose page died is finished by the server from the row. No provider is called and nothing is spent.

## 5. What still happens in the browser, on purpose

- Submitting (the director confirms the spend) — including cutting the take for a restaging before it is sent.
- The stacked-panels check of an image the server had to finish alone (above).
- Lyric timing, sync matching and the other Setup tools: they are interactive tools, not submitted jobs.
