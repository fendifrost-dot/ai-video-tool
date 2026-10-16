#!/usr/bin/env node
// The agent's hands on the app: a headless Chrome signed in as the owner (avt_browser_session) that opens a
// storyboard shot and presses the buttons that only work in a browser — "Composite over plate", whose render is
// WebCodecs, and "Animate the plate", whose confirm spends. Nothing here decides anything: the app's own code builds
// the request, spends, renders and files; this script only presses what a person would press and reports what the
// page said.
//
//   node scripts/agent-browser/avt-press.mjs <composite|animate-plate> --session <agent-browser-session.json> --project <id> \
//        --shot c047 [--variation <id>] [--keep-variation] [--dry-run] [--chrome <path>] \
//        [--app https://aivideotool.lovable.app] [--allow-any-host] [--out <dir>] [--timeout-min 25]
//
// The session file is the answer of the MCP tool avt_browser_session (or avt_whoami {browser_session: true}),
// saved as is. It holds an access token only, so the sign-in ends when that token does: a real press refuses a
// token with less life than the timeout, and never waits past it.
//
// Chrome must decode and encode H.264 (the lane's takes and output): Chrome for Testing or Google Chrome, not the
// open-source Chromium Playwright ships, which has no H.264 (verified 16 Oct 2026: VideoEncoder.isConfigSupported
// avc1.* false there, true in Chrome for Testing 141). Pass its binary with --chrome or AVT_CHROME.
//
// Playwright is resolved from the repo when it has one, else from the global install.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function playwright() {
  const req = createRequire(import.meta.url);
  try {
    return req("playwright");
  } catch {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(join(root, "x"))("playwright");
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) out[k] = true;
      else {
        out[k] = v;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

const log = (...x) => console.log(new Date().toISOString().slice(11, 19), ...x);
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exit(1);
}

const a = parseArgs(process.argv.slice(2));
const command = a._[0];
// every press is: open the shot, click a button, confirm, wait for the app's own toast
const PRESSES = {
  composite: {
    button: "focus-composite-shot",
    confirm: "confirm-composite-shot",
    dryRun: "confirm-composite-dryrun",
    done: /composite is on this shot|Dry run: the exact request/i,
    missing: "the shot offers no Composite over plate (no dressed take on it) — dress it first",
  },
  "animate-plate": {
    button: "focus-animate-plate",
    confirm: "confirm-animate-plate",
    dryRun: "confirm-animate-plate-dryrun",
    done: /plate is being animated|Dry run: the exact request/i,
    missing: "the shot offers no Animate the plate (no plate of its scene) — generate the place first",
    input: "confirm-animate-plate-event",
  },
  // the shot's stretch of the take dressed in its scene's outfit (Higgsfield object-swap, ~$0.68 per billed source second)
  dress: {
    button: "focus-dress-shot",
    confirm: "confirm-dress-shot",
    dryRun: "confirm-dress-dryrun",
    done: /take is being dressed|Dry run: the exact request/i,
    missing: "the shot offers no Dress (no take in sync, or its scene has no outfit)",
  },
  // the take re-shot as a fast-cut montage (one Seedance call); --event is the scene list, one scene per line
  montage: {
    button: "focus-montage",
    confirm: "confirm-montage",
    dryRun: "confirm-montage-dryrun",
    done: /montage is being shot|Dry run: the exact request/i,
    missing: "the shot offers no Montage (not a performance shot with a take in sync, or too long to restage)",
    input: "confirm-montage-scenes",
  },
};
const PRESS = PRESSES[command];
if (!PRESS || !a.session || !a.project || !a.shot) {
  console.error(
    "usage: avt-press.mjs <composite|animate-plate|dress|montage> --session <agent-browser-session.json> --project <id> --shot <key> [--variation <id>] [--keep-variation] [--dry-run] [--event <text>] [--chrome <path>] [--app <url>] [--allow-any-host] [--out <dir>] [--timeout-min 25]",
  );
  process.exit(2);
}
const DRY = !!a["dry-run"];
const APP = (a.app ?? process.env.AVT_APP_URL ?? "https://aivideotool.lovable.app").replace(
  /\/$/,
  "",
);
// the token goes wherever this URL points: only the published app, over https, unless said otherwise
{
  let u;
  try {
    u = new URL(APP);
  } catch {
    fail(`--app is not a URL: ${APP}`);
  }
  const trusted =
    u.protocol === "https:" &&
    (u.hostname === "lovable.app" || u.hostname.endsWith(".lovable.app"));
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!trusted && !local && !a["allow-any-host"])
    fail(
      `refusing to send the owner's session to ${u.origin} — pass --allow-any-host if that is meant`,
    );
}
const CHROME = a.chrome ?? process.env.AVT_CHROME ?? null;
const OUT = a.out ?? join("_avt_outputs", "agent-browser", String(Date.now()));
let TIMEOUT_MS = Number(a["timeout-min"] ?? 25) * 60_000;
mkdirSync(OUT, { recursive: true });

// the MCP's answer, as saved; avt_whoami nests it under browser_session
const answer = JSON.parse(readFileSync(a.session, "utf8"));
const s = answer.browser_session ?? answer;
for (const k of ["access_token", "expires_at", "user", "storage_key"])
  if (!s[k]) fail(`the session file lacks ${k} — save the answer of avt_browser_session as is`);
const ttl = s.expires_at - Date.now() / 1000;
// a paid render must not outlive the sign-in: the MCP refreshes before handing one out, so a fresh answer has
// about an hour; an old file does not
if (ttl < 120)
  fail(`the session expires in ${Math.floor(ttl)} s — ask avt_browser_session for a fresh one`);
if (!DRY && ttl < TIMEOUT_MS / 1000 + 90)
  fail(
    `the session has ${Math.floor(ttl / 60)} min left, less than --timeout-min ${TIMEOUT_MS / 60000} plus 90 s — ask avt_browser_session for a fresh one (it refreshes first)`,
  );
TIMEOUT_MS = Math.min(TIMEOUT_MS, Math.max(60_000, (ttl - 90) * 1000));

// what supabase-js reads back from its storage on boot: access + refresh + expires_at + user. The refresh token is
// empty on purpose (see the MCP tool): the client uses the access token until it expires, then signs out locally.
const stored = {
  access_token: s.access_token,
  refresh_token: "",
  token_type: "bearer",
  expires_at: s.expires_at,
  expires_in: Math.floor(ttl),
  user: s.user,
};

const { chromium } = playwright();
const browser = await chromium.launch({
  headless: true,
  ...(CHROME ? { executablePath: CHROME } : {}),
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleLines = [];
let dryRunRequest = null;
page.on("console", async (m) => {
  const line = `${m.type()} ${m.text()}`;
  consoleLines.push(line);
  if (m.type() === "error") log("console:", line.slice(0, 400));
  if (/dry run — nothing was/i.test(m.text())) {
    // the request is a logged object: text() prints JSHandle@object, the args hold the value
    try {
      const vals = await Promise.all(m.args().map((x) => x.jsonValue().catch(() => null)));
      dryRunRequest = vals.find((v) => v && typeof v === "object") ?? null;
    } catch {
      /* leave null: the sentence alone is reported */
    }
  }
});
page.on("pageerror", (e) => consoleLines.push(`pageerror ${e.message}`));
let shots = 0;
const snap = async (name) => {
  const file = join(OUT, `${String(++shots).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
};
const finish = async (result) => {
  writeFileSync(join(OUT, "console.log"), consoleLines.join("\n"));
  if (dryRunRequest)
    writeFileSync(join(OUT, "dry-run-request.json"), JSON.stringify(dryRunRequest, null, 2));
  console.log(
    "RESULT " +
      JSON.stringify({ ...result, dryRun: DRY ? { request: dryRunRequest } : false, out: OUT }),
  );
  await browser.close().catch(() => {});
  process.exit(result.ok ? 0 : 1);
};

try {
  // sign in before the app boots: the key supabase-js reads on load
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        /* storage blocked: the app will show its sign-in form and the run fails below */
      }
    },
    { key: s.storage_key, value: JSON.stringify(stored) },
  );

  const url = `${APP}/projects/${a.project}/storyboard`;
  log("open", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

  // the board shows the project's ACTIVE variation (video_projects.active_variation_id). --variation presses the
  // app's own switcher to the one asked for and, unless --keep-variation, presses it back at the end.
  // the shell renders the switcher twice (desktop and mobile nav): read the first, press the first trigger
  const switcher = page.locator('[data-testid="variation-switcher"]').first();
  const activeVariation = async () =>
    (await switcher.getAttribute("data-active-variation").catch(() => null)) || null;
  const switchVariation = async (id) => {
    if ((await activeVariation()) === id) return;
    await page.locator('[data-testid="variation-switcher-trigger"]').first().click();
    await page
      .locator(`[data-testid="variation-option"][data-variation-id="${id}"]`)
      .first()
      .click();
    for (let i = 0; i < 30 && (await activeVariation()) !== id; i++)
      await page.waitForTimeout(1000);
    if ((await activeVariation()) !== id)
      throw new Error(`could not switch the board to variation ${id}`);
    log("variation now", id);
  };
  let previousVariation = null;
  if (a.variation) {
    // "Loading…" first: the active id arrives with the project query
    for (let i = 0; i < 120 && !(await activeVariation()); i++) await page.waitForTimeout(1000);
    previousVariation = await activeVariation();
    if (!previousVariation)
      throw new Error("the board never reported its active variation (not signed in?)");
    log("variation was", previousVariation);
    await switchVariation(a.variation);
  }
  const restoreVariation = async () => {
    if (
      !a.variation ||
      a["keep-variation"] ||
      !previousVariation ||
      previousVariation === a.variation
    )
      return;
    await page
      .locator('[data-testid="focus-close"]')
      .click()
      .catch(() => {});
    await switchVariation(previousVariation).catch((e) =>
      log("variation not restored:", e.message),
    );
  };

  const card = page.locator(`[data-testid="box-card"][data-box-key="${a.shot}"]`).first();
  try {
    await card.waitFor({ state: "visible", timeout: 120_000 });
  } catch {
    await snap("no-board");
    const loginish = (await page.locator("input[type=password], input[type=email]").count()) > 0;
    throw new Error(
      loginish
        ? "the app showed a sign-in form: the session was not accepted"
        : `no box ${a.shot} on the board (wrong project, variation or key?)`,
    );
  }
  await snap("board");
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-testid="box-open"]').first().click();
  const focus = page.locator('[data-testid="focus-view"]');
  await focus.waitFor({ state: "visible", timeout: 30_000 });
  log(
    "focus on",
    await focus.getAttribute("data-box-key"),
    "shot",
    await focus.getAttribute("data-box-number"),
  );
  await snap("focus");

  const button = page.locator(`[data-testid="${PRESS.button}"]`);
  try {
    await button.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    await snap("no-button");
    throw new Error(PRESS.missing);
  }
  // the plan is computed from the board's queries; give them a moment to settle before reading the button
  for (let i = 0; i < 20 && (await button.isDisabled()); i++) await page.waitForTimeout(1000);
  if (await button.isDisabled()) {
    await snap("cannot");
    throw new Error(
      `${command} is disabled: ${(await button.getAttribute("title")) ?? "(no reason on the button)"}`,
    );
  }
  await button.click();
  const confirm = page.locator(`[data-testid="${DRY ? PRESS.dryRun : PRESS.confirm}"]`);
  await confirm.waitFor({ state: "visible", timeout: 30_000 });
  // a press that takes words (animate-plate: the event) gets them typed into the dialog's own field
  if (a.event !== undefined) {
    if (typeof a.event !== "string" || !a.event.trim()) throw new Error("--event needs text");
    if (!PRESS.input) throw new Error(`${command} takes no --event`);
    const field = page.locator(`[data-testid="${PRESS.input}"]`);
    await field.waitFor({ state: "visible", timeout: 10_000 });
    await field.fill(String(a.event));
    log("typed the event:", String(a.event).slice(0, 200));
  }
  const dialogText = (
    await page
      .locator("[role=dialog], [role=alertdialog]")
      .first()
      .innerText()
      .catch(() => "")
  ).replace(/\s+/g, " ");
  log("dialog:", dialogText.slice(0, 1200));
  await snap("confirm");
  writeFileSync(join(OUT, "dialog.txt"), dialogText);
  await confirm.click();
  log(DRY ? "pressed: dry run" : `pressed: ${command}`);

  // progress: the status line under the buttons (data-state busy|working|saving|failed); the end: the app's toast
  const status = page.locator('[data-testid="focus-status"]');
  const started = Date.now();
  let last = "";
  let result = null;
  while (Date.now() - started < TIMEOUT_MS) {
    const toasts = await page
      .locator("[data-sonner-toast]")
      .allInnerTexts()
      .catch(() => []);
    const t = toasts.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const done = t.find((x) => PRESS.done.test(x));
    if (done) {
      result = { ok: true, toast: done, lastStage: last };
      break;
    }
    const state = (await status.getAttribute("data-state").catch(() => null)) ?? "";
    const now = (await status.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (now && now !== last) {
      log("stage:", now);
      last = now;
      if (/frame 1 of|uploading|downloading|reading the take/i.test(now)) await snap("stage");
    }
    if (state === "failed") {
      result = { ok: false, toast: t.join(" | ") || null, lastStage: last, failed: now };
      break;
    }
    const bad = t.find((x) => /could not|failed|error|refused|cannot|no video/i.test(x));
    if (bad) {
      result = { ok: false, toast: bad, lastStage: last };
      break;
    }
    await page.waitForTimeout(2000);
  }
  await snap(result?.ok ? "done" : "end");
  await restoreVariation();
  if (!result)
    result = {
      ok: false,
      toast: null,
      lastStage: last,
      note: `no toast within ${Math.round(TIMEOUT_MS / 60000)} min (bounded by the session's life)`,
    };
  await finish(result);
} catch (e) {
  await snap("error");
  await finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
}
