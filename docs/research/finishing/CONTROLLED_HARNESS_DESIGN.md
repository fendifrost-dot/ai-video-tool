# Minimum controlled computer-use / extension harness

**Lane F · 2026-09-15 · $0 · isolated from Architecture C**  
Companion to [ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md](./ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md).

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Goal

Give Premiere (and, later, Astra) the **smallest** operator that can finish an AVT export without becoming a free-roaming desktop agent.

**[DECISION]** Minimum viable harness = **recipe + allowlist + plan-then-approve + workspace jail + action log**. It is **not** an MCP server with 100 Premiere tools, **not** a CEP evalScript bridge, and **not** an always-on Astra session.

---

## Why “controlled” is the whole design

**[OBSERVED]** Public Astra demos drive the Premiere / AE UI like a human. That is useful for one-off visual polish and catastrophic for a brand pipeline: no allowlist, no replay, no spend cap, no isolation from Architecture C windows.

**[VERIFIED]** AVT disk policy already forbids agent walks under iCloud (`CLAUDE.md` / `claude_code_handoff_avt_workspace_disk_rules.md`). A computer-use agent that can click Finder is one misfire away from hydrating MODEST / FENDI FILES media onto the boot disk.

**[DECISION]** Computer-use is a **runner behind the same recipe** as UXP, not a second product. If a step can be expressed as a UXP command, Astra is forbidden to click it.

---

## Components (minimum set)

```
finishing_recipe.json
        │
        ▼
validateRecipe()          ← $0, in-repo, no I/O
        │
        ▼
harness config            ← astra.enabled = false by default
        │
        ├─ uxp runner     ← Premiere UXP panel (not built; contract only)
        └─ astra runner   ← computer-use (DISABLED until RED approval)
                │
                ▼
        plan (screenshots + proposed steps)
                │
                ▼
        Fendi approve / reject
                │
                ▼
        execute one allowlisted step at a time + log
```

### 1. Recipe (source of work)

A recipe is a versioned JSON document. It names:

- `schema_version`
- `host`: `"premiere"` (v1) — `"after_effects"` is rejected until a later RED
- `workspace_root`: absolute path that must pass the jail
- `export_package_relpath`: path to the unzipped AVT ZIP
- `actions[]`: only allowlisted `op` names
- `operator`: human id
- `spend`: `{ astra_allowed: false, max_usd: 0 }`

**[VERIFIED]** The validator lives at `src/lib/automation/finishingRecipe.ts` (pure; unit-tested). It does not read disk or call Premiere.

### 2. Allowlist (source of permission)

| `op` | Runner | v1 enabled |
|------|--------|------------|
| `import_fcpxml` | `uxp` | yes (when panel exists) |
| `import_media_folder` | `uxp` | yes |
| `create_bins` | `uxp` | yes |
| `add_markers_from_beats` | `uxp` | yes |
| `apply_lut` | `uxp` | yes, LUT file must already be in the package |
| `queue_ame_export` | `uxp` | yes, local `.epr` only |
| `write_sidecar` | `uxp` | yes |
| `capture_screenshot` | `astra` | **no** until RED |
| `astra_visual_adjust` | `astra` | **no** until RED |

Any other `op` is a hard reject. No “shell”, “open_url”, “install_plugin”, “click”, “type”, “hotkey” generics.

**[DECISION]** There is no escape hatch action. If we need a new op, we add it to the allowlist in a new recipe schema version after review. Class C if it ever touches providers, storage, or auth.

### 3. Plan-then-approve (source of intent)

**[DECISION]** UXP recipes that contain **only** `uxp` actions may run after a local dry-run printout (no paid step). Any recipe with an `astra` action must:

1. Produce a plan: proposed steps, expected windows, screenshot(s), estimated spend.
2. Stop.
3. Wait for an explicit Fendi approval recorded on the work-order issue (or a signed `approval.json` in the workspace).
4. Execute **one** action, log, re-screenshot, continue only if the post-condition matches the plan.

No “keep going until it looks right.”

### 4. Workspace jail (source of isolation)

**[DECISION]** `workspace_root` must be one of:

| Allowed | Why |
|---------|-----|
| An explicit path Fendi names in the recipe (typically `/Volumes/T7/...`) | Matches AVT disk rules |
| A dedicated local finishing sandbox **outside** iCloud, Architecture C fixtures, and `~/Library/Mobile Documents` | Prevents media hydration |

**Rejected path substrings (validator-enforced):**

- `Library/Mobile Documents`
- `com~apple~CloudDocs`
- `ArchitectureC` / `architecture-c` / `architectureC`
- `MODEST Member Only`
- `FENDI FILES`

**[DECISION]** The harness never receives a repo-wide or home-directory root. Premiere project, media cache, and AME output stay **inside** `workspace_root`.

### 5. Action log (source of evidence)

Every executed step appends one JSONL record:

```json
{
  "ts": "2026-09-15T00:00:00.000Z",
  "op": "import_fcpxml",
  "runner": "uxp",
  "args_hash": "sha256:…",
  "ok": true,
  "screenshot": null,
  "error": null
}
```

**[RECOMMENDATION]** Keep logs next to the master (`workspace_root/logs/finishing.jsonl`). Do not upload logs to providers. Do not put them in Architecture C evidence folders.

### 6. Kill switches

| Switch | Default |
|--------|---------|
| `astra.enabled` | `false` |
| `spend.max_usd` | `0` |
| `max_actions` | `12` |
| `max_astra_steps` | `0` |
| `allow_file_delete` | `false` (and no such op exists) |
| `allow_network` | `false` (AME local only) |
| `abort_on_unexpected_dialog` | `true` |
| `hosts` | `["premiere"]` only |

**[DECISION]** If any kill switch trips, the harness writes `status: "aborted"` to the sidecar and stops. It does not retry with Astra.

---

## Runner designs

### UXP panel (preferred; not implemented in this PR)

**[DECISION]** One Premiere UXP panel, developer-loaded, not a public add-on store listing.

Minimum panel methods (extends the existing stub conceptually; **do not** pretend `PremiereUxpBridge` is live):

```
connect()
importFcpxml(path, { suppressUi: true })
importMediaFolder(path, targetBin)
createBins(names[])
addMarkers(markers[])
applyLut(sequenceId, lutPath)
queueAmeExport({ presetPath, outputPath })
writeSidecar(path, payload)
```

**[OBSERVED]** Adobe UXP Premiere APIs include `Project.importFiles` and `EncoderManager.exportSequence` (queue to AME or immediate). FCPXML import via `importFiles` / `openFCPXML` is the historical Premiere path. Signatures are version-dependent — treat them as **HYPOTHESIS** until a $0 local probe on Fendi's Premiere build (itself a RED if it requires installing a panel).

**[RECOMMENDATION]** First $0 local probe (after Fendi says the machine/volume is OK): load an empty UXP panel that only reports `app` version and refuses every command. No media import.

### Astra computer-use (disabled)

**[DECISION]** Fendi's OpenAI API can reach Astra. That access is for **research notes only** until RED-F1. The harness does not read the key, does not open a computer-use session, and keeps `astra.enabled = false`.

**[DECISION]** Astra sees:

- the Premiere window for the **jail project only**
- the recipe plan
- screenshots it is allowed to take

Astra does **not** see:

- the AVT browser logged into production
- Architecture C still-repair UI
- Finder roots outside `workspace_root`
- terminal / gh / Lovable / Control Center
- API keys

**[HYPOTHESIS]** The cheapest safe Astra loop is: screenshot → propose one `astra_visual_adjust` → stop for approval → optional single execute. Anything that requires Astra to “import the FCPXML” is a design failure (UXP should do that).

**[DECISION]** Do not wrap Premiere in a generic computer-use tool (click/type/scroll). Those tools are how allowlists die.

---

## What we are explicitly not building

| Anti-pattern | Why it is rejected |
|--------------|--------------------|
| 100-tool Premiere MCP (CEP `evalScript`) | Uncontrolled surface; ExtendScript is the legacy path |
| Astra as “the editor” | Destroys manifest-as-source-of-truth |
| In-NLE Runway / Higgsfield / Firefly from this harness | Paid generation + identity/garment drift |
| Headless Premiere on a cloud VM | New infra, licenses, media egress — Class C / RED |
| Auto-upload finished master through a new proxy | Auth/storage widening; forbidden |
| Shared harness with Architecture C agents | Collision risk; umbrella isolation rule |

---

## Contract other lanes can depend on

```ts
validateFinishingRecipe(recipe) → { ok, errors[] }
createDisabledHarnessConfig()   → { astra.enabled: false, max_usd: 0 }
```

No network. No Premiere process. No extra npm dependency.

A future implementation PR (not this lane unless Fendi expands scope) would add a UXP panel repo-folder **or** a sibling package. Keep it out of `supabase/functions` and out of Control Center.

---

## $0 work that is enough to close the design

| Item | Status |
|------|--------|
| Architecture recommendation | this folder |
| Harness design (this file) | this folder |
| Recipe allowlist + jail validator | `src/lib/automation/finishingRecipe.ts` |
| Disabled-by-default harness config | `src/lib/automation/finishingHarness.ts` |
| Sample UXP-only recipe | `sample_finishing_recipe.json` |
| Live UXP panel | **not started** (needs machine + Adobe install; see RED) |
| Live Astra session | **forbidden** until RED |

---

## Acceptance test for a future implementation (do not run now)

1. Validator rejects a recipe with `op: "click"` and a path under iCloud.
2. Dry-run of the sample recipe prints 5 UXP steps and 0 Astra steps.
3. On a Fendi-approved machine: UXP imports the existing `premiere_ready/timeline.fcpxml` from a **copied** export ZIP on T7 without changing AVT `main`.
4. Astra runner remains disabled; enabling it without `approval.json` no-ops.

Steps 3–4 are RED if they require installing software or opening a paid session.
