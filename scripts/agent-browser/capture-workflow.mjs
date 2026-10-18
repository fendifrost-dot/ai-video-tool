#!/usr/bin/env node
/**
 * Capture authenticated workflow screenshots (Setup → Export + Timeline).
 * Uses avt_browser_session JSON + Google Chrome (H.264).
 *
 *   node scripts/agent-browser/capture-workflow.mjs \
 *     --session /tmp/agent-browser-session.json \
 *     --out /opt/cursor/artifacts/screenshots/before \
 *     --app https://aivideotool.lovable.app \
 *     --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
 *     --chrome /usr/bin/google-chrome-stable
 */
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

const a = parseArgs(process.argv.slice(2));
const session = JSON.parse(readFileSync(a.session, "utf8"));
const app = (a.app || "https://aivideotool.lovable.app").replace(/\/$/, "");
const project = a.project || "764a63d2-93cd-44f3-905f-292f14ab2f51";
const outDir = a.out || "/opt/cursor/artifacts/screenshots/workflow";
const chrome = a.chrome || process.env.AVT_CHROME || "/usr/bin/google-chrome-stable";
mkdirSync(outDir, { recursive: true });

const routes = [
  ["setup", `/projects/${project}/setup`],
  ["treatment", `/projects/${project}/treatment`],
  ["storyboard", `/projects/${project}/storyboard`],
  ["timeline", `/projects/${project}/editor`],
  ["review", `/projects/${project}/review`],
  ["export", `/projects/${project}/export`],
  ["auth", `/auth`],
];

const { chromium } = playwright();
const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const report = { app, project, shots: {}, at: new Date().toISOString() };

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  // Inject Supabase session before any navigation
  await context.addInitScript(
    ({ storageKey, sessionBlob }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(sessionBlob));
    },
    {
      storageKey: session.storage_key,
      sessionBlob: {
        access_token: session.access_token,
        token_type: session.token_type || "bearer",
        expires_in: session.expires_in || 3600,
        expires_at: session.expires_at,
        refresh_token: "",
        user: session.user,
      },
    },
  );

  const page = await context.newPage();
  for (const [name, path] of routes) {
    const url = `${app}${path}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const waitFor =
        name === "timeline"
          ? '[data-testid="editor-workspace"], [data-testid="cut-empty"], [data-testid="cut-error"]'
          : name === "storyboard"
            ? '[data-testid="box-card"], [data-testid="storyboard-empty"], [data-testid="storyboard-page"]'
            : name === "setup"
              ? '[data-testid="setup-page"], [data-testid="setup-checklist"]'
              : name === "export"
                ? '[data-testid="render-contract"], h1'
                : name === "auth"
                  ? "text=Continue with Google"
                  : "h1";
      try {
        await page.waitForSelector(waitFor, { timeout: 45000 });
      } catch {
        /* still screenshot */
      }
      await page.waitForTimeout(name === "timeline" || name === "storyboard" ? 6000 : 2000);
      const file = `${name}-${vp.name}.png`;
      const dest = join(outDir, file);
      await page.screenshot({ path: dest, fullPage: false });
      report.shots[file] = dest;
      console.log("OK", file, page.url());
    } catch (err) {
      console.error("FAIL", name, vp.name, err.message);
      report.shots[`${name}-${vp.name}.png`] = `ERROR: ${err.message}`;
    }
  }
  await context.close();
}

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log("DONE", outDir);
