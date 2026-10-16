# agent-browser — the AI presses the app itself

Some of the storyboard only runs in a browser: the composite lane renders with WebCodecs, the confirm dialogs
decide what is spent. An AI working through the MCP could write every request but not press those. This folder
closes that gap: a headless Chrome, signed in as the owner for one hour, opens the shot and presses the button; the
app's own code does everything else and the script reports what the page said.

## Run

```
# 1. the sign-in: ask the MCP and save its answer as is
#    avt_browser_session            → session.json      (or avt_whoami {browser_session: true})
# 2. press
node scripts/agent-browser/avt-press.mjs composite --session session.json \
     --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --shot c047 --dry-run      # the exact request, nothing sent
node scripts/agent-browser/avt-press.mjs composite --session session.json \
     --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --shot c047                # pays the matte, renders, files
```

The board shows the project's ACTIVE variation. `--variation <id>` presses the app's own switcher to the one you
mean and presses it back at the end (`--keep-variation` leaves it switched).

Output: `RESULT {ok, toast, dryRun, dryRunLog, out, lastStage}` on the last line; screenshots, the dialog text and the
console in `--out` (default `agent-browser-out-<time>`). Exit 0 only when the page's own success toast appeared.

## Chrome

The lane decodes and encodes H.264. Playwright's open-source Chromium has no H.264 (`VideoEncoder.isConfigSupported`
for `avc1.*` answers false; verified 16 Oct 2026), so pass a Chrome that does with `--chrome` or `AVT_CHROME`:
Chrome for Testing (`https://storage.googleapis.com/chrome-for-testing-public/<version>/linux64/chrome-linux64.zip`,
141.0.7390.37 verified) or Google Chrome. Playwright itself is resolved from the repo or the global install.

## The sign-in, and what it is not

`avt_browser_session` hands out the owner's ACCESS token only — the same session the MCP already acts with — and
never the refresh token: the browser cannot renew it, so the sign-in ends with the hour, and it cannot rotate the
refresh token out from under `batch-token-proxy`. Each hand-out is a `[browser]` row in `batch_credential_mints`.
The owner is bound to the credential; nothing in the request names a user. Treat `session.json` as a secret for
the hour it lives: keep it in the scratchpad, never in the repo.

## Adding a press

Every button the storyboard offers has a `data-testid` (`focus-*`, `box-*`, `confirm-*`). A new command is: open the
shot the same way, click the testid, wait for the app's own toast. Keep the rule: the script presses, the app decides.
