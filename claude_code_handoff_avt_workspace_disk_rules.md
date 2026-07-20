# Claude Handoff — AVT Workspace + Disk Rules (DO NOT FILL THE MAC)

**Date:** 2026-07-20  
**Audience:** Claude Cowork / Claude Code / any agent with `--add-dir` or machine-wide search  
**Priority:** Read this **before** searching the filesystem for video, MODEST, FENDI, or face assets.

---

## What went wrong (do not repeat)

Claude opened / searched an **iCloud** folder that was not needed for AVT code work:

```
~/Library/Mobile Documents/com~apple~CloudDocs/FENDI FILES/VIDEO/MODEST Member Only shots
```

That forced macOS to **download / rematerialize** large video + PNG files onto the internal SSD, filled the disk (~100% full), and nearly blocked all work. The Mac only has ~460 GB; media belongs on **T7**.

**There was no reason to open that folder.** AVT work is code + GitHub + (when needed) assets already on T7 or already ingested in the app/Supabase.

---

## Allowed work roots (ONLY these)

| Purpose | Path |
|---------|------|
| **Primary AVT repo (Cursor / Claude)** | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| **Sibling clone (if needed)** | `/Users/gocrazyglobal/ai-video-tool` |
| **GitHub** | `https://github.com/fendifrost-dot/ai-video-tool` (`main`) |
| **Media / video / MODEST / FENDI FILES** | `/Volumes/T7/...` only |
| **LUNA sessions (moved)** | `/Volumes/T7/LUNA Sessions` |
| **Old Mac archives (moved)** | `/Volumes/T7/ARCHIVES_FROM_MAC` |

Confirm T7 is mounted before touching media:

```bash
df -h /Volumes/T7
```

If T7 is missing: **stop and ask the user** — do not fall back to iCloud.

---

## Forbidden paths (never `--add-dir`, never recursive search)

Do **not** open, add, find, or crawl:

- `~/Library/Mobile Documents/com~apple~CloudDocs/**` (entire iCloud Drive)
- Especially: `.../FENDI FILES/VIDEO/MODEST Member Only shots`
- Especially: `.../FENDI FILES/MUSIC` (was ~23 GB local; must stay **cloud-only / dataless**)
- Especially: iCloud `LUNA Sessions` (local copy lives on T7 now)
- Machine-wide searches from `/Users/gocrazyglobal` or `/` for `*.mov`, `*.mp4`, `*.png`, MODEST, wardrobe refs

If a reference file is needed and is not in the repo or on T7: **ask the user for a T7 path or an AVT/Supabase URL**. Never hydrate iCloud to “be helpful.”

---

## Disk / Claude VM rules

| Keep | Path | Why |
|------|------|-----|
| **Claude VM** | `~/Library/Application Support/Claude/vm_bundles` (~10 GB) | Required for Claude to work — **never delete** |
| Safe to clear if disk is low | Claude `local-agent-mode-sessions`, caches, `Code Cache`, etc. | Rematerialized search junk |

When disk is tight:

1. Prefer **evict iCloud** (`brctl evict`) or **work from T7** — do not delete the Claude VM.
2. Do not download iCloud media “just to inspect.”
3. Check free space before large copies: `df -h /System/Volumes/Data`

Target comfort zone: **≥20 GB free** on the Data volume before heavy agent work.

---

## How to start an AVT session (checklist)

1. Workspace = `/Users/gocrazyglobal/Projects/ai-video-tool` (or GitHub `main`).
2. **No** `--add-dir` on iCloud. **No** MODEST iCloud folder.
3. If you need source video / MODEST shots / music stems → use **`/Volumes/T7`** paths the user names, or assets already in AVT.
4. Code changes → commit/push to `fendifrost-dot/ai-video-tool` as the user directs.
5. Deploy → Lovable **Publish** + redeploy touched **AVT** edge functions (not Control Center unless asked).

---

## One-liner for Claude (paste into session)

> Work only in `/Users/gocrazyglobal/Projects/ai-video-tool` (and `/Volumes/T7` for media). Never open or `--add-dir` iCloud Drive, especially MODEST Member Only shots or FENDI FILES/MUSIC. Those paths filled the Mac. Keep `Claude/vm_bundles`. If media is missing, ask for a T7 path — do not hydrate iCloud.

---

## Current disk snapshot (after cleanup, 2026-07-20)

- Internal Data volume: ~**23 GB free** (was critically full).
- T7: ~**500+ GB free** — preferred media root.
- Claude `vm_bundles`: **kept** (~10 GB).
- iCloud MUSIC / MODEST: should remain **evicted / dataless**; do not reopen.

---

## Related docs

- `claude_code_handoff_avt_agent_context.md` — repo/deploy/chain of command
- `AGENTS.md` — AVT stack + wardrobe rules
- `CURSOR_HANDOFF_full_outfit_guarded_grok.md` — Guarded Grok full-outfit path
