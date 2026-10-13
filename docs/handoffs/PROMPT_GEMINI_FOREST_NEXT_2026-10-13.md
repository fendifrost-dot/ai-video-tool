# Prompt for the next agent — Gemini forest scene, after round 3 (13 Oct 2026)

Copy everything below the line into the next Claude (or ChatGPT) session. Written by the agent that
finished round 3; nothing here is verified by anyone other than that agent except where a commit SHA or
a database row is named.

---

You are continuing the Gemini character-continuity work for AVT (repo `fendifrost-dot/ai-video-tool`,
Lovable-managed Supabase `qoyxgnkvjukovkrvdaiq`; sister Control Center `fendifrost-dot/fendi-control-center`,
Supabase `wkzwcfmvnwolgrdpnygc`, holds `FAL_KEY`). Read `CLAUDE.md` in both repos first. No standalone
Supabase, no `supabase` CLI, no asking Fendi to run SQL or paste keys. SQL goes through the Lovable SQL
editor, edge redeploys through Lovable Edge Functions, and Publish is not a redeploy.

## State you inherit (all on `main`)

| Item | State | Evidence |
|---|---|---|
| Real pixel decode on CC `image-providers-gemini-generate` | LIVE | CC PR #63, merge `a729093`, deployed source_sha256 `1588588b…` |
| AVT `world-still-proxy` filing `imageUsable` / `stages.decode` | LIVE | AVT PR #245, merge `4ad8a29`, deployed source_sha256 `e6ca32aa…` |
| Live verification of the decode path | DONE | job `2054a5cd`, asset `65494df1`: `imageUsable true`, 1856×2304, `stages.decode usable` |
| Round-3 handoff with corrections, spend, forest round | MERGED | AVT PR #246, merge `0e9ed23`; file `docs/handoffs/GEMINI_ROUND3_2026-10-12.md` |
| Experiment record and images | MERGED | `docs/review/gemini_2026-10-12/` (protocol, `data/*.json`, `images/forest/`) |

Production selections, treatments, wardrobe, locks, timelines, exports and footage were not touched. Every
generated test asset is `approval_status = pending` with notes starting `TEST ONLY`. The only identity
authority is the approved ORIGINAL portrait asset `3fce9cb5-012f-4158-aecb-6615343eb2f3`.

## Verify before doing anything (cheap, distinguishes outcomes)

1. `git log --oneline -3 origin/main` on AVT must show `0e9ed23` or later. If not, your checkout is stale.
2. Through the AVT MCP (`avt_select` on `provider_jobs`, id `2054a5cd-e3f6-4931-a5b2-6b49274d4542`): the
   result JSON must contain `"imageUsable": true` and `"decode": "usable"`. If the row lacks these keys,
   the deployed function is older than `4ad8a29` and must be redeployed through Lovable before any run.
3. `avt_select` on `project_assets`, id `3fce9cb5-012f-4158-aecb-6615343eb2f3`: `approval_status` must be
   `approved` and `notes` must begin `Rider casting v2`. Anything else means production data moved; stop
   and report.

## Open creative decision (Fendi's, not yours)

The best forest still from the bounded cycle is F4 (asset `5cea3af9-27f0-4487-9269-f80b4911249b`),
ranked first by both blind reviewers. Its defects: only one hand visible, loose stirrup leather, slightly
small horse head, one ear hidden. The deploy-verification still V1 (asset `65494df1-a980-4bfb-b4e5-179830176201`,
same request as F4) is the only sample with both gloved hands on the reins, but it was never blind-reviewed.

Ask Fendi which of these he wants, then do only that:

- **(a) Accept the single-hand pose and run one bounded 2 s motion test on F4.** Record model, prompt,
  seed, cost estimate and result in `docs/review/gemini_2026-10-12/data/`. Do not animate any other still.
- **(b) One more still correction with a hands/reins reference crop.** Make the crop through the
  `asset-derivative` edge function (`source_tool: "manual"`, tool name in `metadata.tool`; the
  `provider_name` enum rejects anything else), then run it under the blind protocol in
  `docs/review/gemini_2026-10-12/EXPERIMENT_3_REFERENCE_COMPETITION.md` ("Forest round") with F4 and V1
  in the same shuffled set. Keep ORIGINAL as `<IMAGE_0>` and the faceless pose guide
  `6ab0db92-c556-4341-9c1e-3827e1a2f11f` as `<IMAGE_1>`; the hands crop is a third faceless reference.
  Prompt forest-v3 is the starting point; change one thing at a time and write down what changed.

Spending: each 2K Gemini still is estimated at $0.270 conditional (not a ceiling). Verified charges are
unknown for every run so far; say so in any spend figure you report. Do not top up or buy anything.

## Small cleanup you may do without asking

Two orphan storage objects from failed first `asset-derivative` calls have no `project_assets` row:

```
3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/derivatives/3eee45de-5655-4afb-9468-c54dd72192c5_outfit_faceless_1791848531180.jpg
3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/derivatives/a1b2ced9-8bc8-4203-a64a-f63d56391ef6_horse_tack_faceless_1791848534551.jpg
```

Before deleting, confirm with `avt_select` on `project_assets` (filter `storage_path` equal to each path)
that zero rows reference them. Expected: 0 rows each. If any row references one, leave it.

## Do not

- Do not edit `docs/handoffs/GEMINI_ROUND3_2026-10-12.md` sections 1 to 7 in place; append dated sections.
- Do not change `approval_status` on any asset, and do not replace the identity anchor with any generated still.
- Do not treat HTTP 200, a passing test, or one good image as verification of anything.
- Do not describe experiment 4 as "framing alone" or "not supported"; the corrected reading is in §6a.

## Report back

Which option Fendi chose, every job id and asset id created, the blind-review table if (b), the spend
estimate per run, and whether the new still or clip is ready for a 1.5 to 2 s motion shot, with its
defects stated plainly. End your session by writing the next prompt in this same folder.
