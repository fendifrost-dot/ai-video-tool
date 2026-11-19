# HANDOFF TEMPLATE

Copy this file to `docs/handoffs/HANDOFF_<TOPIC>_<YYYY-MM-DD>.md` (or `docs/HANDOFF_<TOPIC>.md`) and fill every
section. A handoff is verification-first: the reader must be able to tell, with a cheap command, which state the work
is really in, without trusting this text.

Rules that apply to every handoff (build skill lessons 3, 9, 11; clothing-swap skill "Hand off when you stop"):

- Every claim carries one label: **VERIFIED** (you ran the command or read the line, and cite it), **OBSERVED** (seen,
  not proven), **HYPOTHESIS** (name the test), **DECISION** (whose, in whose words, the date), **RECOMMENDATION**.
- Never the word "verified" for something you did not run yourself.
- Code merged is **CODED**, never **LIVE**. Lovable Publish makes the frontend live; Lovable Edge Functions → redeploy
  makes each function live. Name which were done, and when.
- Every time is written on both clocks: `song 1:26.10 (file 1:12.30)`.
- Fendi's decisions are quoted in his words with the date. You never mark a result approved.
- Never a signed URL, token or key. Never media of him or of the song in the repo.

---

# HANDOFF: <topic> (<date>)

For: <who takes this next>. One paragraph: what the work is and why it exists (Fendi's words if he asked for it).

## 0. Start state

| | |
|---|---|
| Repo, branch | |
| Open PRs (number, state, what only lives there) | |
| What is already on `main` | |
| Backend | Lovable-managed only, project ref `qoyxgnkvjukovkrvdaiq`; pre-flight in `docs/AGENT_BOOTSTRAP.md` |
| Money so far (ledger file, total, last row) | |

## 1. Done

One row per finished thing. An id or a hash on every row; no row without one.

| What | Id / hash (asset, job, commit, board) | State: CODED / DEPLOYED (which function, when) / CHECKED LIVE (run id) | Fendi's words, if he judged it |
|---|---|---|---|

## 2. Not done

| What | Why it stopped | Exact next step (the command or the call) | Price |
|---|---|---|---|

## 3. Expected values

The numbers the next agent should see when the work is right. Exact, not "about".

| Check | Expected | Where it was measured |
|---|---|---|
| e.g. frame count | 1735 | `ffprobe -count_frames …` |
| e.g. put-back proof | `max \|out-original\| on face/hair/skin: 0` | `body_only_swap.py` output |

## 4. A cheap command that tells the outcomes apart

One command (or one MCP call) per question, $0 each, with what each possible result means.

```bash
# <question this answers>
<command>
# result A → <meaning>; result B → <meaning>
```

## 5. Do not

What was tried and rejected, with the row in `docs/PROBLEM_INDEX.md` or the asset that proves it. What must not be
re-tested. What is Fendi's call and not the agent's.

## 6. Report back

What the next agent must return: ids, numbers printed, CODED / DEPLOYED / CHECKED LIVE per item, Fendi's open
decisions listed plainly, and what was not done and why.

## 7. Money

| Item | Estimate | Ledger row when spent |
|---|---|---|

Dry run first, state the price, add the ledger row in the same commit as the result.
