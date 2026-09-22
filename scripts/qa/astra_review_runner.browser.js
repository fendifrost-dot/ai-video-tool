// Astra visual-QA runner — runs INSIDE the authenticated AVT app tab (Phase 1, manual).
//
// 1. Build the package:  python3 scripts/qa/build_astra_review_package.py ... --out pkg/
//    (a TARGETED package has one part, mechanisms.json — same flow)
// 2. In the app tab, create a file input, pick every file under pkg/parts/*.json,
//    pkg/frames/*.jpg and the reference images (or add them with file_upload tooling).
// 3. Paste this file into the console and call:
//      await window.astraReview.run({ projectId, draftId, files: <FileList>, maxCostUsd: 2.0 })
//    It submits each part to /functions/v1/astra-visual-review-proxy with the user's JWT
//    (never a key) in OpenAI background mode, polls until complete, and returns
//    { parts: {partId: proxyResponse}, cost, log }. Partial state lives in window.__astra.
//
// Nothing here weakens auth: the proxy validates the JWT and project ownership.
(function () {
  const SUPABASE_URL = "https://qoyxgnkvjukovkrvdaiq.supabase.co";
  const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });

  function session() {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const s = JSON.parse(localStorage[key]);
    return { jwt: s.access_token, anon: sessionStorage.claude_anon || window.__anon || null };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function call(body) {
    const { jwt, anon } = session();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/astra-visual-review-proxy`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({ error: "bad_json" })); j._httpStatus = res.status; return j;
  }

  // Submit every part (OpenAI background mode), then poll until each completes.
  // The proxy stores each completed part under project-exports/.../astra-reviews/<draftId>/<partId>.json.
  async function run({ projectId, draftId, files, maxCostUsd = 2.5, model, reasoningEffort = "high", only = null, dryRun = false, pollMs = 15000, maxWaitMs = 25 * 60 * 1000 }) {
    const byName = new Map([...files].map((f) => [f.name, f]));
    const parts = [...files].filter((f) => /^(shots-.*|transitions|sequence|mechanisms)\.json$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!parts.length) throw new Error("no part json files selected");
    const dataUrlCache = new Map();
    const img = async (fileRef) => { const name = fileRef.split("/").pop(); if (!dataUrlCache.has(name)) { const f = byName.get(name); if (!f) throw new Error("missing image file " + name); dataUrlCache.set(name, await readDataUrl(f)); } return dataUrlCache.get(name); };
    const out = { parts: {}, cost: 0, errors: {}, log: [] };
    window.__astra = out; window.__astraRunning = true;
    const pending = [];
    for (const pf of parts) {
      const part = JSON.parse(await readText(pf));
      if (only && !only.includes(part.partId)) continue;
      const frames = []; for (const fr of part.frames) frames.push({ label: fr.label, dataUrl: await img(fr.file) });
      const references = []; for (const rf of part.references || []) references.push({ label: rf.label, dataUrl: await img(rf.file) });
      const j = await call({ mode: "submit", projectId, draftId, partId: part.partId, model, reasoningEffort, instructions: part.instructions, frames, references, jsonSchema: part.jsonSchema, maxCostUsd, dryRun });
      out.log.push(`submit ${part.partId} -> ${j.responseId || j.error || j._httpStatus}`);
      if (dryRun || !j.responseId) { out.parts[part.partId] = j; if (j.error) out.errors[part.partId] = j.error; continue; }
      pending.push({ partId: part.partId, responseId: j.responseId, submittedAt: Date.now(), plan: j });
    }
    const t0 = Date.now();
    while (pending.length && Date.now() - t0 < maxWaitMs) {
      await sleep(pollMs);
      for (const p of [...pending]) {
        const j = await call({ mode: "poll", projectId, draftId, partId: p.partId, responseId: p.responseId });
        if (j.status === "completed" || j.error) {
          j.plan = p.plan; j._elapsedMs = Date.now() - p.submittedAt; out.parts[p.partId] = j;
          if (typeof j.actualCostUsd === "number") out.cost += j.actualCostUsd; if (j.error) out.errors[p.partId] = j.error;
          out.log.push(`${j.status || j.error} ${p.partId} ${Math.round(j._elapsedMs / 1000)}s $${j.actualCostUsd ?? "?"}`);
          pending.splice(pending.indexOf(p), 1);
        }
      }
    }
    for (const p of pending) { out.errors[p.partId] = "timeout"; out.parts[p.partId] = { error: "timeout", responseId: p.responseId }; }
    window.__astraRunning = false; return out;
  }

  window.astraReview = { run, session };
})();
