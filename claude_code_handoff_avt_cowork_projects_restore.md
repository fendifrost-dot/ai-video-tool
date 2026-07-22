# Claude Handoff — Restore Cowork Projects (NOT git worktrees)

**Date:** 2026-07-21 (updated after Cowork agent investigation)  
**Audience:** Human + agents. Cowork cannot mount `~/Library/Application Support/Claude`. Cursor/Terminal can.  
**Owner goal:** Projects sidebar shows expected projects; iCloud trusted folders gone.

---

## 0. Two different systems

| Thing | Where | UI |
|-------|--------|-----|
| **Cowork Projects** | `~/Documents/Claude/Projects/` + **app registry / claude.ai account** | Sidebar → Projects |
| **Code git worktrees** | `~/fendi-control-center/.claude/worktrees/` | Code / sessions — **not** Projects sidebar |

**Code worktrees already restored — leave alone:**
- Real dir `/Users/gocrazyglobal/fendi-control-center` (1.6G, 57 worktrees)
- `~/Library/Application Support/Claude/git-worktrees.json` (57 entries)

---

## 1. Corrected root cause (Cowork agent finding)

**Folder-on-disk does NOT register a project in the sidebar.**

- Compared visible projects (Control Hub, Family Roots) vs **AI Video Tool**
- No per-folder marker / `.claude/` required (Family Roots shows with no `.claude/` at all)
- Sidebar membership = Claude app **project registry** (UUID app-state under `~/Library/Application Support/Claude`) + cloud account
- Cowork **refuses to mount** Application Support/Claude → cannot edit registry or `claude_desktop_config.json` from Cowork

So Step “drop folder and rescan” in the earlier draft was **wrong**.

---

## 2. Inventory (2026-07-21, Cowork with Documents access)

**14 folders intact** under `~/Documents/Claude/Projects/` (macOS case-insensitive: `Projects` ≡ `projects`):

AI Video Tool, ALONZO WAHEED FUNDING, Apartment Unfair Housing, Boltz Automotive, Buzz Genius, CONTINUUM CAPITAL GROUP, Control Hub, EMRANI ALI GLOBAL FUNDING, Family Roots, Fan Fuel Hub, MODEST STREETWEAR APPAREL INC., Production company build, TERRENCE CLEVELAND, (+ Continuum as above).

**AI Video Tool is fully intact on disk** (files through Jul 20) — nothing lost. It may still be missing from the sidebar until re-added in the UI.

---

## 3. Trusted folders — live config (confirmed)

File: `~/Library/Application Support/Claude/claude_desktop_config.json`  
Key: `preferences.localAgentModeTrustedFolders`

Was (hazardous):

1. `…/CloudDocs/FENDI FILES/CREDIT`
2. `…/CloudDocs/FENDI FILES/VIDEO/MODEST Member Only shots` ← disk-fill culprit
3. `/Users/gocrazyglobal/artistgrowthhub-repo` ← keep
4. `…/CloudDocs` ← **entire iCloud root** (worst)

Script: `scripts/clean_claude_trusted_folders.py`

```bash
# Fully quit Claude first, then:
python3 /Users/gocrazyglobal/Projects/ai-video-tool/scripts/clean_claude_trusted_folders.py
python3 /Users/gocrazyglobal/Projects/ai-video-tool/scripts/clean_claude_trusted_folders.py --apply
```

Creates timestamped backup next to the config. Prefer Cursor/Terminal for this — Cowork cannot write that path.

---

## 4. What only the human can do (sidebar)

Cowork cannot control the Claude app window (OS blocks agents operating Claude itself).

1. Glance at Projects sidebar — **AI Video Tool may already appear**; don’t create a duplicate.
2. If missing: **New Project / +** → point at existing folder:  
   `/Users/gocrazyglobal/Documents/Claude/Projects/AI Video Tool`
3. Repeat for any other on-disk folders you want in the sidebar (Fan Fuel Hub, MODEST STREETWEAR, etc.) — only if missing from UI.

Cloud-only sidebar entries (if any) stay tied to the Anthropic account — check claude.ai if a name isn’t a local folder.

---

## 5. Do NOT

- Delete `~/Library/Application Support/Claude/vm_bundles`
- Open / trust iCloud MODEST, MUSIC, or CloudDocs root
- Symlink repos to T7 (TCC → unreadable to Claude)
- Hand-edit `claude_desktop_config.json` while Claude is running (it overwrites; use the script after quit)
- Redo git worktree restore unless registry is empty again

---

## 6. Disk / workspace

- Internal ~17GB free (tight). T7 ~547GB free.
- Media: `/Volumes/T7` only. See `CLAUDE.md` + `claude_code_handoff_avt_workspace_disk_rules.md`.

---

## 7. Success criteria

- [ ] `clean_claude_trusted_folders.py --apply` run after Claude quit; no CloudDocs paths remain
- [ ] **AI Video Tool** (and desired others) visible in Projects sidebar
- [ ] Opening projects does not hydrate iCloud MODEST
- [ ] `~/fendi-control-center` worktrees still intact
