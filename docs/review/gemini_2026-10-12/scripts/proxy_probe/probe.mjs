// Proxy ownership probe (12 Oct 2026, after #240 deploy). A fresh anonymous identity A and the bare publishable key call
// the deployed service-role proxies with (1) A's own (non-existent) path: ownership passes, object lookup fails ->
// 404 storage_object_not_found, no provider call; (2) the owner's real object: 403 storage_path_forbidden; (3) bare key:
// 401. Prints outcomes only. Usage: node proxy_probe.mjs <.env> <ownerObjectPath>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(process.argv[2], "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY, ownerPath = process.argv[3];
const A = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: s, error } = await A.auth.signInAnonymously(); if (error) throw error;
const aId = s.user.id, jwt = s.session.access_token;
const call = async (fn, body, token) => {
  const r = await fetch(`${URL_}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, error: j?.error ?? j?.code ?? j?.message ?? null };
};
const out = { A: aId.slice(0, 8), results: [] };
const rec = (fn, who, what, r, expect) => out.results.push({ fn, who, what, ...r, expect, pass: r.status === expect.status && (!expect.error || r.error === expect.error) });
const own = `${aId}/00000000-0000-4000-8000-000000000001/nonexistent.png`;
rec("sam3-segment-proxy", "A", "own folder, missing object", await call("sam3-segment-proxy", { scenePath: own }, jwt), { status: 404, error: "scene_sign_failed" });
rec("sam3-segment-proxy", "A", "owner's real object", await call("sam3-segment-proxy", { scenePath: ownerPath }, jwt), { status: 403, error: "storage_path_forbidden" });
rec("sam3-segment-proxy", "A", "traversal path", await call("sam3-segment-proxy", { scenePath: `${aId}/../${ownerPath}` }, jwt), { status: 400, error: "invalid_storage_path" });
rec("sam3-segment-proxy", "A", "other bucket, owner's object", await call("sam3-segment-proxy", { scenePath: ownerPath, sceneBucket: "prop-refs" }, jwt), { status: 403, error: "storage_path_forbidden" });
rec("sam3-segment-proxy", "bare key", "owner's real object", await call("sam3-segment-proxy", { scenePath: ownerPath }, null), { status: 401 });
rec("sam3-segment-proxy", "bare key as bearer", "owner's real object", await call("sam3-segment-proxy", { scenePath: ownerPath }, KEY), { status: 401 });
rec("asset-derivative", "A (anonymous session)", "any", await call("asset-derivative", { assetId: "00000000-0000-4000-8000-000000000001", box: { x: 0, y: 0, w: 1, h: 1 }, label: "x" }, jwt), { status: 403 });
rec("faceswap-proxy", "A", "owner's object as scene", await call("faceswap-proxy", { artistId: "00000000-0000-4000-8000-000000000001", scenePath: ownerPath }, jwt), { status: 403 });
rec("grok-image-garment-proxy", "A", "foreign artistId", await call("grok-image-garment-proxy", { artistId: "00000000-0000-4000-8000-000000000001", wardrobeFeatureId: "00000000-0000-4000-8000-000000000002", scenePath: own }, jwt), { status: 403 });
// Direct storage with A's session: the owner's object must be invisible (RLS).
const d = await A.storage.from("project-references").download(ownerPath); out.results.push({ fn: "storage", who: "A", what: "download owner's object", status: d.error ? "denied" : "ALLOWED", pass: !!d.error });
const l = await A.storage.from("project-references").list(ownerPath.split("/").slice(0, 2).join("/")); out.results.push({ fn: "storage", who: "A", what: "list owner's project folder", status: `${l.data?.length ?? "err"} entries`, pass: (l.data?.length ?? 0) === 0 });
await A.auth.signOut();
console.log(JSON.stringify(out, null, 1));
