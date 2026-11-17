// Beeble VFX Pass Generator (SwitchLight 3) from a headless Chrome, as Fendi: the passes (Normal, BaseColor, Alpha,
// Depth, ...) that relight his take (docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md, step 3c). Not in Beeble's public API
// (that is SwitchX only, never used on him), so the web app is pressed. Spend: about 3 credits per source second,
// from his Beeble plan (verse 26.1, 2.4 s: 9 credits). First run 14 Nov 2026.
//
// usage (run from a scratch folder; state.json and the downloads land there; keep them out of the repo):
//   node beeble-passes.mjs signin   --email <his address>        # Beeble emails a code; prints WAITING, then waits for
//                                                                  # code.txt (the agent reads the code from his Gmail
//                                                                  # with his go and writes it there); saves state.json
//   node beeble-passes.mjs upload   --file clip.mp4              # uploads and leaves the job at "Review Required" (0 credits)
//   node beeble-passes.mjs review   --name clip                  # prints the review screen, screenshot review.png (0 credits)
//   node beeble-passes.mjs generate --name clip                  # presses "Generate All Frames" (spends credits)
//   node beeble-passes.mjs status                                # history and credits left
//   node beeble-passes.mjs download                              # newest finished job: "All Passes" ZIP into the folder
// Notes: the app greets with a SwitchX pop-up ("Close" dismisses it). Wait for the upload to validate before Run.
// Normal pass: 8-bit PNG, camera space (+X right, +Y up, +Z toward the camera); relight_comp.py --normals reads it as is.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
// Playwright from the repo when it has one, else from the global install (as avt-press.mjs)
const { chromium } = (() => { try { return createRequire(import.meta.url)('playwright'); }
  catch { return createRequire(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'x'))('playwright'); } })();

const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const APP = 'https://app.beeble.ai';

async function open() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true,
    ...(fs.existsSync('state.json') && cmd !== 'signin' ? { storageState: 'state.json' } : {}) });
  const p = await ctx.newPage();
  await p.goto(APP + '/home', { waitUntil: 'networkidle', timeout: 60000 });
  await p.getByRole('button', { name: 'Close' }).click({ timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(800);
  return { b, ctx, p };
}
async function tool(p) {
  await p.getByText('VFX Pass Generator', { exact: true }).first().click(); await p.waitForTimeout(4000);
}
async function history(p) {
  await p.getByRole('button', { name: 'HISTORY' }).click(); await p.waitForTimeout(4000);
  const t = await p.innerText('body'); const m = t.match(/(\d+)\s*\n\s*credits/);
  return { text: t.slice(t.indexOf('PLUGINS') + 7), credits: m ? Number(m[1]) : null };
}
async function close({ b, ctx }) { await ctx.storageState({ path: 'state.json' }); await b.close(); }

const s = await open(); const { p } = s;
try {
  if (cmd === 'signin') {
    await p.getByText('Sign In', { exact: true }).first().click(); await p.waitForTimeout(2000);
    await p.getByPlaceholder('Enter your email address').fill(arg('email'));
    await p.getByRole('button', { name: /Continue/ }).click(); await p.waitForTimeout(6000);
    console.log('WAITING for code.txt (Beeble emailed a code)');
    const t0 = Date.now();
    while (!fs.existsSync('code.txt') && Date.now() - t0 < 600000) await p.waitForTimeout(2000);
    const code = fs.readFileSync('code.txt', 'utf8').trim();
    const vis = []; for (const i of await p.$$('input')) if (await i.isVisible()) vis.push(i);
    if (vis.length >= code.length) for (let k = 0; k < code.length; k++) await vis[k].fill(code[k]); else await vis[0].fill(code);
    await p.waitForTimeout(8000);
    const t = await p.innerText('body'); const m = t.match(/(\d+)\s*\n\s*credits/);
    console.log('SIGNED IN', /Personal workspace/.test(t), 'credits', m && m[1]);
    fs.unlinkSync('code.txt');
  } else if (cmd === 'upload') {
    await tool(p); await p.setInputFiles('input[type=file]', arg('file'));
    for (let i = 0; i < 150; i++) { await p.waitForTimeout(2000); if (!/Validating|Uploading|Loading/.test(await p.innerText('body'))) break; }
    await p.getByRole('button', { name: 'Run', exact: true }).click(); await p.waitForTimeout(8000);
    const h = await history(p); console.log(h.text.slice(0, 600)); console.log('CREDITS', h.credits);
  } else if (cmd === 'review' || cmd === 'generate') {
    await tool(p); await history(p);
    await p.getByRole('button', { name: 'Review Required' }).first().click();
    for (let k = 0; k < 60; k++) { await p.waitForTimeout(2000); const tt = await p.innerText('[role=dialog]').catch(() => ''); if (tt && !/Processing/.test(tt)) break; }
    console.log(await p.innerText('[role=dialog]')); await p.screenshot({ path: 'review.png' });
    if (cmd === 'generate') {
      await p.getByRole('button', { name: /Generate All Frames/i }).last().click(); await p.waitForTimeout(10000);
      const h = await history(p); console.log(h.text.slice(0, 400)); console.log('CREDITS', h.credits);
    }
  } else if (cmd === 'status') {
    await tool(p); const h = await history(p); console.log(h.text.slice(0, 1200)); console.log('CREDITS', h.credits);
  } else if (cmd === 'download') {
    await tool(p); await history(p);
    await p.locator('[aria-label="Download VFX passes"]').first().click(); await p.waitForTimeout(3000);
    const dl = p.waitForEvent('download', { timeout: 900000 });
    await p.getByText('All Passes', { exact: false }).last().click();
    const d = await dl; const f = arg('out', d.suggestedFilename()); await d.saveAs(f); console.log('SAVED', f);
  } else {
    console.log('commands: signin | upload | review | generate | status | download');
  }
} finally { await close(s); }
