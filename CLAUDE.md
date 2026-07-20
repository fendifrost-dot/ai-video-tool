# CLAUDE.md — AI Video Tool (AVT)

Film production app. Repo: `fendifrost-dot/ai-video-tool`. Live: `aivideotool.lovable.app`.

Full stack: `AGENTS.md`. Agent context: `claude_code_handoff_avt_agent_context.md`. Disk rules: `claude_code_handoff_avt_workspace_disk_rules.md`.

---

## CRITICAL — Chain of command (read every session)

**There is NO standalone Supabase.** These apps are **Lovable-managed**. Do **not**:

- Run the `supabase` CLI (403 / wrong account = a **FALSE wall**, not a blocker)
- Open supabase.com dashboard to apply migrations
- Ask Fendi to paste/run SQL
- Hunt for a separate “Supabase project” outside Lovable Cloud
- Treat “I can’t find Supabase” as a reason to stall

### Correct deploy / schema path

| Action | Where |
|--------|--------|
| Code + edge function source | GitHub `main` (this repo) |
| SQL / migrations | **Lovable SQL editor** on the linked Lovable project |
| Frontend live | Lovable **Publish** (from `main`) |
| Edge functions live | Lovable **Edge Functions → redeploy** each touched function |
| Secrets | Lovable Cloud / edge secrets — **never** ask for keys in chat |

**Publish ≠ edge redeploy.** Always name which functions you redeployed.

Agents run authorized SQL / publish / redeploy themselves via Lovable — do not hand work back asking “where does Supabase live?”

### This project (AVT)

| | |
|--|--|
| Repo | `github.com/fendifrost-dot/ai-video-tool` |
| Local | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| Supabase (Lovable Cloud) | `qoyxgnkvjukovkrvdaiq` |
| Live | `aivideotool.lovable.app` |
| Lovable project id | `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` |

### Sister project — Control Center (SEPARATE)

| | |
|--|--|
| Repo | `github.com/fendifrost-dot/fendi-control-center` |
| Supabase | `wkzwcfmvnwolgrdpnygc` |
| Holds | `FAL_KEY` (AVT never holds Fal) |

AVT reaches Fal via CC `switchx-restyle` (`fal-run`) + `fal-queue-poll`. Grok image uses `XAI_API_KEY` on **AVT**. Do not edit CC while thinking you are in AVT.

### Other Lovable apps (do not mix IDs)

| App | Supabase id |
|-----|-------------|
| FanFuel / Artist Growth Hub | `vsemrziqxrrfcquxfnwd` |
| Modest Chic Builder | `lkbapymfjcfrnskcdrmv` |
| Continuum Capital Chicago OS | `mdmetmylcfkehugcpbjg` |
| LAAAN Logistics | `vtkvwvahtftpbcvnwbic` |

---

## CRITICAL — Disk / workspace (never violate)

**Failure mode (2026-07-20):** Opening iCloud `FENDI FILES/VIDEO/MODEST Member Only shots` hydrated huge media onto the Mac SSD and nearly filled the disk. iCloud paths are placeholders — any read / recursive `find` / `grep` under a parent **downloads** files.

### Allowed roots only

| Purpose | Path |
|---------|------|
| Code (this repo) | `/Users/gocrazyglobal/Projects/ai-video-tool` |
| Sibling clone (if needed) | `/Users/gocrazyglobal/ai-video-tool` |
| Media / video / MODEST / FENDI FILES | `/Volumes/T7/...` only |

Confirm T7: `df -h /Volumes/T7`. If missing → **stop and ask**. Never fall back to iCloud.

### Forbidden

- `~/Library/Mobile Documents/com~apple~CloudDocs/**`
- Especially MODEST Member Only shots, `FENDI FILES/MUSIC`, iCloud `LUNA Sessions`
- Machine-wide searches for `*.mov` / `*.mp4` / MODEST

### Keep Claude alive

- **Never delete** `~/Library/Application Support/Claude/vm_bundles` (~10 GB)
- Restate boundaries in every task prompt — sub-sessions may not inherit memory

---

## Hard product rules (wardrobe)

1. Asset processing runs through AVT / its edge functions — no ad-hoc local image pipelines in the agent sandbox.
2. No AI-regeneration of garment imagery; pixel preservation is mandatory.
3. Fix the tool, not workarounds. Minimize scope.
