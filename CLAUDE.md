# CLAUDE.md — AI Video Tool (AVT)

Film production app. Repo: `fendifrost-dot/ai-video-tool`. Live: `aivideotool.lovable.app`.

Full stack/conventions: see `AGENTS.md`. Wardrobe/agent context: `claude_code_handoff_avt_agent_context.md`.

---

## CRITICAL — Disk / workspace (never violate)

**Failure mode (2026-07-20):** An agent opened iCloud `FENDI FILES/VIDEO/MODEST Member Only shots`. iCloud paths are **placeholders** — any read, recursive `find`, or `grep` across a parent directory **hydrates** files onto the internal SSD and can fill the Mac (~460 GB). That nearly blocked all work.

### Allowed roots only

| Purpose | Path |
|---------|------|
| Code (this repo) | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| Sibling clone (if needed) | `/Users/gocrazyglobal/ai-video-tool` |
| Media / video / MODEST / FENDI FILES | `/Volumes/T7/...` only |

Confirm T7 is mounted before touching media: `df -h /Volumes/T7`. If missing → **stop and ask**. Never fall back to iCloud.

### Forbidden (no `--add-dir`, no recursive search)

- `~/Library/Mobile Documents/com~apple~CloudDocs/**` (all of iCloud Drive)
- Especially MODEST Member Only shots, `FENDI FILES/MUSIC`, iCloud `LUNA Sessions`
- Machine-wide `/Users/gocrazyglobal` or `/` searches for `*.mov` / `*.mp4` / MODEST

If a file is not in the repo or on T7 → **ask for a T7 path or AVT/Supabase URL**. Do not hydrate iCloud to be helpful.

### Keep Claude alive

- **Never delete** `~/Library/Application Support/Claude/vm_bundles` (~10 GB)
- Restate these boundaries in **every** task prompt; do not assume a sub-session inherits them

Details: `claude_code_handoff_avt_workspace_disk_rules.md`

---

## Hard product rules (wardrobe)

1. Asset processing runs through AVT / its edge functions — no ad-hoc local image pipelines in the agent sandbox.
2. No AI-regeneration of garment imagery; pixel preservation is mandatory.
3. Fix the tool, not workarounds. Minimize scope.

---

## Deploy reminders

- Frontend: Lovable **Publish** from GitHub `main`
- Edge functions: Lovable redeploy on **AVT** Supabase (`qoyxgnkvjukovkrvdaiq`) — not Control Center unless asked
- Do not confuse AVT with Fendi Control Center (`wkzwcfmvnwolgrdpnygc`)
