// SEC-4 storage probe (as run 12 Oct 2026): fresh anonymous test identities A and B, plus the bare anon key, against
// prop-refs and project-references, using a harmless 1x1 PNG in A's own folder. It never touches another user's objects.
// It prints outcomes only (no URLs or tokens). Run: node probe.mjs <.env path> <state.json path> <phase label>
// Existence after a delete is checked with a database-backed list(), not download(): the CDN can serve a deleted object.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = Object.fromEntries(readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const statePath = process.argv[3]; const phase = process.argv[4];
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
async function session(name, state) {
  const c = mk();
  if (state[name]) { const { error } = await c.auth.setSession(state[name]); if (!error) return c; }
  const { data, error } = await c.auth.signInAnonymously(); if (error) throw new Error(`${name} sign-in: ${error.message}`);
  state[name] = { access_token: data.session.access_token, refresh_token: data.session.refresh_token }; return c;
}
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {}; // holds test-session tokens: never commit it
const A = await session("A", state), B = await session("B", state), anon = mk();
const aId = (await A.auth.getUser()).data.user.id, bId = (await B.auth.getUser()).data.user.id;
writeFileSync(statePath, JSON.stringify(state));
const out = { phase, at: new Date().toISOString(), A: aId.slice(0, 8), B: bId.slice(0, 8), results: [] };
const rec = (bucket, who, op, ok, detail = "") => out.results.push({ bucket, who, op, allowed: ok, detail });
for (const bucket of ["prop-refs", "project-references"]) {
  const dir = `${aId}/sec4-fixture`, file = `${dir}/fixture.png`;
  let r = await A.storage.from(bucket).upload(file, png, { contentType: "image/png", upsert: true }); rec(bucket, "A-owner", "upload(own)", !r.error, r.error?.message);
  r = await A.storage.from(bucket).list(dir); rec(bucket, "A-owner", "list(own)", !r.error && r.data.some((o) => o.name === "fixture.png"));
  r = await A.storage.from(bucket).download(file); rec(bucket, "A-owner", "download(own)", !r.error && r.data?.size === png.length);
  r = await A.storage.from(bucket).createSignedUrl(file, 60); const fetched = r.data?.signedUrl ? (await fetch(r.data.signedUrl)).status : null; rec(bucket, "A-owner", "sign(own)+fetch", !r.error && fetched === 200, `fetch=${fetched}`);
  r = await A.storage.from(bucket).update(file, png, { contentType: "image/png" }); rec(bucket, "A-owner", "update(own)", !r.error, r.error?.message);
  for (const [who, c] of [["B-other", B], ["anon", anon]]) {
    r = await c.storage.from(bucket).list(dir); rec(bucket, who, "list(A folder)", !r.error && r.data.length > 0);
    r = await c.storage.from(bucket).list(""); rec(bucket, who, "list(bucket root)", !r.error && r.data.some((o) => o.name === aId), `entries=${r.data?.length ?? "err"}`);
    r = await c.storage.from(bucket).download(file); rec(bucket, who, "download(A file)", !r.error && !!r.data);
    r = await c.storage.from(bucket).createSignedUrl(file, 60); rec(bucket, who, "sign(A file)", !r.error && !!r.data?.signedUrl);
    r = await c.storage.from(bucket).upload(`${aId}/sec4-fixture/${who}.png`, png, { contentType: "image/png" }); rec(bucket, who, "upload(into A folder)", !r.error, r.error?.message);
    r = await c.storage.from(bucket).update(file, png, { contentType: "image/png" }); rec(bucket, who, "overwrite(A file)", !r.error, r.error?.message);
    r = await c.storage.from(bucket).remove([file]); const still = ((await A.storage.from(bucket).list(dir)).data ?? []).some((o) => o.name === "fixture.png"); rec(bucket, who, "delete(A file)", !still, `remove returned ${r.data?.length ?? "err"} rows`);
    if (!still) await A.storage.from(bucket).upload(file, png, { contentType: "image/png", upsert: true });
  }
  if (phase === "cleanup") { const all = await A.storage.from(bucket).list(dir); await A.storage.from(bucket).remove((all.data ?? []).map((o) => `${dir}/${o.name}`)); rec(bucket, "A-owner", "cleanup", true, `removed ${all.data?.length ?? 0}`); }
}
console.log(JSON.stringify(out, null, 1));
