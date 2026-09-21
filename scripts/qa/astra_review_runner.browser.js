// Astra visual-QA runner — runs INSIDE the authenticated AVT app tab (Phase 1, manual).
//
// 1. Build the package:  python3 scripts/qa/build_astra_review_package.py ... --out pkg/
// 2. In the app tab, create a file input, pick every file under pkg/parts/*.json,
//    pkg/frames/*.jpg and the reference images (or add them with file_upload tooling).
// 3. Paste this file into the console and call:
//      await window.astraReview.run({ projectId, draftId, files: <FileList>, maxCostUsd: 2.0 })
//    It POSTs each part to /functions/v1/astra-visual-review-proxy with the user's JWT
//    (never a key), sequentially, and returns { parts: {partId: proxyResponse}, cost }.
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

  async function run({ projectId, draftId, files, maxCostUsd = 2.0, model, reasoningEffort = "high", only = null }) {
    const byName = new Map([...files].map((f) => [f.name, f]));
    const parts = [...files].filter((f) => /^(shots-.*|transitions|sequence)\.json$/.test(f.name));
    if (!parts.length) throw new Error("no part json files selected");
    const { jwt, anon } = session();
    if (!anon) throw new Error("anon key not available in this tab (sessionStorage.claude_anon)");
    const dataUrlCache = new Map();
    const img = async (fileRef) => {
      const name = fileRef.split("/").pop();
      if (!dataUrlCache.has(name)) {
        const f = byName.get(name); if (!f) throw new Error("missing image file " + name);
        dataUrlCache.set(name, await readDataUrl(f));
      }
      return dataUrlCache.get(name);
    };
    const out = { parts: {}, cost: 0, errors: {} };
    for (const pf of parts.sort((a, b) => a.name.localeCompare(b.name))) {
      const part = JSON.parse(await readText(pf));
      if (only && !only.includes(part.partId)) continue;
      const frames = []; for (const fr of part.frames) frames.push({ label: fr.label, dataUrl: await img(fr.file) });
      const references = []; for (const rf of part.references || []) references.push({ label: rf.label, dataUrl: await img(rf.file) });
      const body = { projectId, draftId, partId: part.partId, model, reasoningEffort, instructions: part.instructions, frames, references, jsonSchema: part.jsonSchema, maxCostUsd };
      const t0 = Date.now();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/astra-visual-review-proxy`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({ error: "bad_json", status: res.status }));
      j._httpStatus = res.status; j._ms = Date.now() - t0;
      out.parts[part.partId] = j;
      if (typeof j.actualCostUsd === "number") out.cost += j.actualCostUsd;
      if (j.error) out.errors[part.partId] = j.error;
      window.__astra = out; // partial results survive if the page hiccups
    }
    return out;
  }

  window.astraReview = { run, session };
})();
