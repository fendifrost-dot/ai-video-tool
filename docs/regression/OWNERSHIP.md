# Lane R ownership + escalation

## Green autonomy

Lane R may add/edit:

| Surface | Why |
|---------|-----|
| `tests/regression/**` | Cross-copy freeze + locked-suite manifest |
| `docs/regression/**` | How to re-run, locked inventory, evidence |
| `scripts/run-regression-locked.mjs` | Runner only |
| `package.json` `test:regression` | npm alias |
| `tsconfig.json` `include` for `tests/**/*.ts` | so the harness typechecks |

Lane R may **run** any existing `*.test.ts` file. Running is not ownership of the module under test.

## Do not edit (escalate)

| Lane | Surface | If red |
|------|---------|--------|
| A | `src/lib/garment/logoComposite.ts`, `stillRepairOcclusion.ts`, still-repair proxy chest path, golden *paint* | Chest still / 1m owner |
| B | `src/lib/sleevePanel/**` paint (`repair`, `navyFill`, `liveStill` impl, edge sleevePanel) | Sleeve still / 1c owner |
| C | `TEMPORAL_LIVE_ACTIVATION_ARMED`, `authorizeTemporalEdgeRequest`, `temporal-propagate-proxy` internals | Temporal owner |
| D | `reconstructOriginalMaster` / adapters / e2e composite | Reconstruct owner |
| E | Evaluator scoring formulas / still-criteria reopen | Evaluator owner |
| Hero Frame | `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` product flag | Hero Frame owner |
| — | Control Center, Fal, Grok proxies, PR #37, auth/RLS | **RED → Fendi** |

## If a locked suite is red

1. Record the Vitest file, failing assertion, and HEAD SHA in `docs/regression/`.
2. Look up `escalateTo` + `doNotFix` in `tests/regression/locked-surfaces.json`.
3. Open / comment the owning lane's issue. Do **not** patch `doNotFix` files.
4. Authority: YELLOW (shared contract / copy drift) → ChatGPT. RED (paid calls, auth/RLS) → Fendi.

## Known non-blocking drift (do not "fix" from Lane R)

`TEMPORAL_LIVE_DEPLOY_NOTES.heroFrameOwnerFlip.current` is **false** because Lane C does not own the Hero Frame flag. Product `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` is **true** (PR #91 / #95). Auth/dispatch uses the product flag + `TEMPORAL_LIVE_ACTIVATION_ARMED` + `explicitArm`, not that notes field. Register: **REL-2** in [`RISK_REGISTER.md`](../../RISK_REGISTER.md). Lane R must **not** edit `src/lib/temporal/livePrep.ts`.

## Real-media placeholders

C2 / D2 / E2 / H own evidence for [`REAL_MEDIA_LOCKS.md`](REAL_MEDIA_LOCKS.md). Lane R only keeps the UNCLAIMED table honest. G2 / F2 stay off this checklist.
