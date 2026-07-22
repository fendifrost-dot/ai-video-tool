# Claude Handoff — Restore Cowork Projects (NOT git worktrees)

**Date:** 2026-07-21  
**Audience:** Claude Cowork / Claude Code agent with **Terminal access** (needs Full Disk Access or Documents permission — Cursor agents often get `Operation not permitted` on `~/Documents`)  
**Owner goal:** Make missing projects show again in the Claude Cowork **Projects** sidebar.

---

## 0. Read this first — two different systems

| Thing | What it is | Where it lives | UI location |
|-------|------------|----------------|-------------|
| **Cowork Projects** | Chat/project spaces (Family Roots, Control Hub, AI Video Tool, …) | `~/Documents/Claude/Projects/` (+ cloud sync via claude.ai) | Cowork sidebar → **Projects** |
| **Code git worktrees** | Claude Code session checkouts (`admiring-booth`, `strange-mccarthy`, …) | `~/fendi-control-center/.claude/worktrees/` | Code / sessions for that repo — **NOT** the Projects sidebar |

**Already restored (do NOT redo unless broken):**
- Real folder: `/Users/gocrazyglobal/fendi-control-center` (1.6G, **not** a symlink)
- 57 worktrees + matching `.git/worktrees` metadata
- Claude pool rebuilt: `~/Library/Application Support/Claude/git-worktrees.json` (57 entries)

If the user says “worktrees aren’t in Projects,” they usually mean **Cowork Projects**. Fix Documents/Claude + Claude app state — not `.claude/worktrees`.

---

## 1. Failure history (why things broke)

1. Agent opened iCloud MODEST → hydrated huge media → disk nearly full.
2. Cleanup moved home repos to T7: `/Volumes/T7/ARCHIVES_FROM_MAC/…`
3. Symlinks to T7 **looked** fine (`exists=true`) but macOS TCC made them **unreadable** (`R_OK=false`) to Claude → empty UI.
4. Git worktrees were later restored correctly to `~/fendi-control-center`.
5. Cowork **Projects** sidebar still incomplete — separate store under Documents + cloud.

**Disk now:** internal ~460GB, ~17GB free (tight). T7 ~547GB free. Prefer T7 for media. Never open iCloud MODEST/MUSIC.

---

## 2. Authoritative paths

### Cowork Projects (sidebar)

| Path | Role |
|------|------|
| `/Users/gocrazyglobal/Documents/Claude` | `coworkUserFilesPath` from `claude_desktop_config.json` |
| `/Users/gocrazyglobal/Documents/Claude/Projects/` | Local project folders |
| `/Users/gocrazyglobal/Documents/Claude/projects/` | Duplicate/alternate casing — check both |

**Confirmed present on disk (probe `test -e`) as of 2026-07-21:**
- `…/Projects/Family Roots` ✅ (shows in UI)
- `…/Projects/Control Hub` ✅ (shows in UI)
- `…/Projects/EMRANI ALI GLOBAL FUNDING` ✅ (shows in UI)
- `…/Projects/CONTINUUM CAPITAL GROUP` ✅
- `…/Projects/AI Video Tool` ✅ **exists on disk but user did not see it in sidebar** ← investigate first

**Seen in UI but missing as exact folder name (may be cloud-only or renamed):**
- taxgenerator
- Credit Litigation
- Apartment search
- How to use Claude / Example project (built-in?)

### Claude app config

| File | Notes |
|------|--------|
| `~/Library/Application Support/Claude/claude_desktop_config.json` | `coworkUserFilesPath`, trusted folders |
| `~/Library/Application Support/Claude/config.json` | OAuth / account |
| `~/Library/Application Support/Claude/git-worktrees.json` | **Code** worktree pool (already fixed; leave alone unless empty) |
| `~/.claude.json` | Claude Code `projects` map (paths including worktrees) |
| `~/.claude/projects/` | Session transcripts keyed by encoded path |

### Code worktrees (already fixed)

| Path | Notes |
|------|--------|
| `/Users/gocrazyglobal/fendi-control-center` | Original home path, real directory |
| `…/.claude/worktrees/` | 57 checkouts |
| `…/.git/worktrees/` | 57 git admin dirs |
| `/Volumes/T7/ARCHIVES_FROM_MAC/fendi-control-center` | Backup copy on T7 |

### Dangerous trusted folders still in config (remove or replace)

In `claude_desktop_config.json` → `preferences.localAgentModeTrustedFolders` still includes:

- `…/iCloud…/FENDI FILES/VIDEO/MODEST Member Only shots` ← **caused disk fill**
- `…/iCloud…/FENDI FILES/CREDIT`
- entire iCloud Drive root

**Replace MODEST with T7 path** if user still needs it, e.g. `/Volumes/T7/…` (ask user for exact T7 MODEST path). Never re-add iCloud MODEST.

---

## 3. What to do (Cowork Projects restore)

Run in **Terminal.app** (or Claude with Documents permission). Cursor sandbox often cannot `listdir` Documents.

### Step A — Inventory local vs UI

```bash
ls -la "/Users/gocrazyglobal/Documents/Claude"
ls -la "/Users/gocrazyglobal/Documents/Claude/Projects"
ls -la "/Users/gocrazyglobal/Documents/Claude/projects"
```

Compare to sidebar. Note:
- On disk but not in sidebar (e.g. **AI Video Tool**)
- In sidebar but not on disk (cloud-only)
- Missing from both (need recreate or recover from backup)

### Step B — Fix “on disk but not in sidebar”

For each orphaned folder under `Documents/Claude/Projects/`:

1. Quit Claude completely.
2. Check for junk / empty project metadata inside the folder (`.claude`, project json, etc.) — list with `ls -la`.
3. Reopen Claude → Projects → see if it rescans.
4. If still missing: **Create project** in UI pointing at that existing folder, or open the folder via Claude’s “open project from folder” if available.
5. Do **not** delete `AI Video Tool` folder — it exists and is likely the missing AVT project.

### Step C — Cloud / account projects

Some sidebar entries (taxgenerator, Credit Litigation, …) may be **claude.ai remote projects**, not local folders. If local folder missing:

1. Confirm user is logged into the same Anthropic account (`lastKnownAccountUuid` in config).
2. Check claude.ai projects in browser.
3. Do not recreate duplicates until you confirm cloud vs local.

### Step D — Clean trusted folders (prevent next disk crisis)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (quit Claude first):

- Remove iCloud MODEST path from `localAgentModeTrustedFolders`
- Keep working dirs: `~/fendi-control-center`, `~/Projects/ai-video-tool`, etc.
- Prefer `/Volumes/T7/...` for media

Also enforce repo `CLAUDE.md` rules: no iCloud hydration; media on T7 only.

### Step E — Verify

1. Restart Claude.
2. Projects sidebar shows **AI Video Tool** (and any other recovered local projects).
3. Opening AI Video Tool does **not** crawl iCloud MODEST.
4. Code worktrees (if needed): open `/Users/gocrazyglobal/fendi-control-center` — expect 57 under Code/sessions, not under Projects.

---

## 4. Do NOT do

- Do not move/delete `~/Library/Application Support/Claude/vm_bundles` (~10GB).
- Do not `brctl` / open iCloud MODEST or MUSIC to “find” projects.
- Do not treat empty `git-worktrees.json` as the Projects sidebar bug (it’s already rebuilt for Code).
- Do not symlink home repos back to T7 (TCC makes them unreadable to Claude).
- Do not run `supabase` CLI — Lovable-managed (see each repo’s `CLAUDE.md`).
- Do not fill the last ~17GB — copy large recoveries to T7 first if needed.

---

## 5. Disk / workspace rules (restate every prompt)

Allowed: `/Users/gocrazyglobal/Projects/ai-video-tool`, `/Users/gocrazyglobal/fendi-control-center`, `/Volumes/T7/...`  
Forbidden: `~/Library/Mobile Documents/com~apple~CloudDocs/**` (especially MODEST / MUSIC)

Details: `claude_code_handoff_avt_workspace_disk_rules.md` + root `CLAUDE.md`.

---

## 6. Paste prompt for the restoring agent

```
You are restoring Claude Cowork PROJECTS (sidebar list), NOT git worktrees.

Context handoff: claude_code_handoff_avt_cowork_projects_restore.md

Facts:
- coworkUserFilesPath = ~/Documents/Claude
- Local projects under ~/Documents/Claude/Projects/ (also check projects/)
- AI Video Tool folder EXISTS on disk but may be missing from sidebar — fix that first
- Code worktrees already restored at ~/fendi-control-center (57) + git-worktrees.json — leave alone
- Never open iCloud MODEST; media only on /Volumes/T7
- Internal disk ~17GB free — don't hydrate large iCloud trees
- Remove MODEST from localAgentModeTrustedFolders in claude_desktop_config.json

Inventory Documents/Claude/Projects, compare to sidebar, resurface orphaned local projects, then verify AI Video Tool appears after Claude restart.
```

---

## 7. Success criteria

- [ ] `ls ~/Documents/Claude/Projects` matches expected local projects  
- [ ] **AI Video Tool** visible in Cowork Projects sidebar  
- [ ] Other missing local projects recovered or confirmed cloud-only  
- [ ] MODEST removed from trusted folders  
- [ ] Disk still ≥10GB free; no iCloud rematerialization  
- [ ] Code worktrees at `~/fendi-control-center` still intact (regression check)
