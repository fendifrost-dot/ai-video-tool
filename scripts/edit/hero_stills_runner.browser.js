// Hero-still minting runner — runs INSIDE the authenticated AVT app tab (same pattern as
// scripts/qa/astra_review_runner.browser.js). Canonical-Look lane, step E2:
//
//   scene frames (real footage, one per re-anchor slot)  +  ONE approved Look-on-artist anchor
//   +  the Look's references  →  grok-image-garment-proxy (xAI /v1/images/edits)  →  one still
//   per slot that shares the anchor's garment realisation  →  propagate_keyframe.py --hero-frames
//
// 1. Paste this file into the console of the AVT tab, then create a file input and pick the
//    scene JPG/PNGs (named <shot>_f<frame>.jpg) and the anchor image.
// 2. await window.heroStills.upload(files, { projectId, folder: "heroes/S06" })
//      → uploads every file to project-references/<user>/<project>/<folder>/<name>
// 3. await window.heroStills.mint({ artistId, wardrobeFeatureId, lookId, projectId,
//        scenePaths: [...], anchorPath, promptVersion: "hero-e2-v1", maxCostUsd: 2 })
//      → one proxy call per scene (each returns a child artist_looks row, status pending),
//        then polls until every row is complete/failed. Returns { rows, log }.
//        The runner refuses to submit more stills than maxCostUsd / costPerStill allows.
// 4. await window.heroStills.signOutputs(rows) → signed URLs (2 h) for the outputs, as
//    { lookId, scene, path, url } so the sandbox can fetch them.
//
// Nothing here weakens auth: the proxy validates the JWT, the artist and the Look.
(function () {
  const SUPABASE_URL = "https://qoyxgnkvjukovkrvdaiq.supabase.co";
  const COST_PER_STILL_USD = 0.12; // grok-imagine-image-quality, as recorded by the proxy (cost_cents 12)
  function session() {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const s = JSON.parse(localStorage[key]);
    return { jwt: s.access_token, anon: sessionStorage.claude_anon || window.__anon || null, userId: s.user?.id };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const headers = (extra = {}) => { const { jwt, anon } = session(); return { apikey: anon, Authorization: `Bearer ${jwt}`, ...extra }; };

  async function upload(files, { projectId, folder = "heroes", bucket = "project-references" }) {
    const { userId } = session(); const out = [];
    for (const f of files) {
      const path = `${userId}/${projectId}/${folder}/${f.name}`;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: headers({ "Content-Type": f.type || "image/jpeg", "x-upsert": "true" }), body: f });
      out.push({ name: f.name, path, ok: res.ok, status: res.status });
    }
    return out;
  }

  // referenceMode/referencePolicy are pass-through to the proxy. With an anchor the provider's
  // 3-image limit (grok-imagine-image-quality, verified 2026-09-21) leaves ONE slot for a product
  // reference, so the default is the flat product shot of the hero piece.
  async function mint({ artistId, wardrobeFeatureId, lookId, projectId, scenePaths, anchorPath, anchorBucket = "project-references", sceneBucket = "project-references", promptVersion = "hero-e2-v1", referenceMode = "flat", referencePolicy = { maxRefs: 1, primaryPieceRefs: 1, otherPieceRefs: 1 }, prompt, model, resolution, maxCostUsd = 2.0, pollMs = 8000, maxWaitMs = 20 * 60 * 1000, dryRun = false }) {
    const allowed = Math.floor(maxCostUsd / COST_PER_STILL_USD);
    if (scenePaths.length > allowed) throw new Error(`refusing: ${scenePaths.length} stills exceed maxCostUsd ${maxCostUsd} (${allowed} allowed at $${COST_PER_STILL_USD} each)`);
    const log = []; const rows = [];
    for (const scenePath of scenePaths) {
      const name = `Hero E2 · ${scenePath.split("/").pop()} · ${promptVersion}`;
      const body = { artistId, wardrobeFeatureId, lookId, projectId, scenePath, sceneBucket, anchorPath, anchorBucket, referenceMode, referencePolicy, promptVersion, name, prompt, model, resolution };
      if (dryRun) { log.push(`dry ${scenePath}`); continue; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/grok-image-garment-proxy`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({ error: "bad_json" }));
      log.push(`submit ${scenePath.split("/").pop()} -> ${res.status} ${j.lookId || j.error || ""}`);
      if (j.lookId) rows.push({ lookId: j.lookId, scene: scenePath, status: "pending" });
    }
    window.__heroStills = { rows, log };
    const t0 = Date.now();
    while (rows.some((r) => r.status === "pending") && Date.now() - t0 < maxWaitMs) {
      await sleep(pollMs);
      const ids = rows.filter((r) => r.status === "pending").map((r) => r.lookId);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/artist_looks?select=id,status,generated_storage_path,error_message,cost_cents&id=in.(${ids.join(",")})`, { headers: headers() });
      const list = await res.json();
      for (const l of list) {
        const r = rows.find((x) => x.lookId === l.id);
        if (l.status === "complete" || l.status === "failed") { r.status = l.status; r.path = l.generated_storage_path; r.error = l.error_message; r.costCents = l.cost_cents; log.push(`${l.status} ${r.scene.split("/").pop()} ${l.error_message || ""}`); }
      }
    }
    for (const r of rows) if (r.status === "pending") { r.status = "timeout"; }
    return { rows, log, estimatedCostUsd: rows.filter((r) => r.status === "complete").length * COST_PER_STILL_USD };
  }

  async function signOutputs(rows, bucket = "look-composites", expiresIn = 7200) {
    const paths = rows.filter((r) => r.path).map((r) => r.path);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}`, { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn, paths }) });
    const signed = await res.json();
    return rows.filter((r) => r.path).map((r, i) => ({ lookId: r.lookId, scene: r.scene, path: r.path, url: signed[i]?.signedURL ? `${SUPABASE_URL}/storage/v1${signed[i].signedURL}` : null }));
  }

  window.heroStills = { upload, mint, signOutputs, session, COST_PER_STILL_USD };
})();
