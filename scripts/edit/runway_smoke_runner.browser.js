// Runway mechanism smoke — runs INSIDE the authenticated AVT app tab (same pattern as the other
// browser runners). Submits one shot's real performance source to `runway-video-edit-proxy` with
// each model's strongest DOCUMENTED native conditioning:
//
//   aleph2                 keyframe = a pose-correct frame of THIS shot carrying the approved Look
//                          realisation, placed at its timestamp; short instruction (≤ 1000 chars
//                          incl. the Look constraints)
//   gemini_omni_flash_1.1  mode=edit + the Look truth hierarchy (outfit sheet → hero refs → details,
//                          ≤ 5 images) + the full E1 instruction
//
// Usage (console):
//   await window.runwaySmoke.run({ projectId, artistId, videoAssetId, wardrobeFeatureId, lookId,
//       keyframePath, keyframeSeconds, inputSeconds, alephPrompt, omniPrompt, maxCostUsd: 3, dryRun: true })
//   → dry run returns each model's plan (contract, references, estimate) with nothing billed;
//     dryRun:false submits both (sequentially; the proxy is synchronous) and returns provenance.
// Everything recorded per model: model, contract, source asset, input seconds, keyframe path +
// timestamp, reference plan, prompt (composed), request body (signed URLs redacted), estimate,
// task id, final status, cost, output path, asset id.
(function () {
  const SUPABASE_URL = "https://qoyxgnkvjukovkrvdaiq.supabase.co";
  function session() {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const s = JSON.parse(localStorage[key]);
    return { jwt: s.access_token, anon: sessionStorage.claude_anon || window.__anon || null };
  }
  async function call(body) {
    const { jwt, anon } = session();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/runway-video-edit-proxy`, { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({ error: "bad_json" })); j._httpStatus = res.status; return j;
  }
  async function run({ projectId, artistId, videoAssetId, wardrobeFeatureId, lookId, keyframePath, keyframeBucket = "project-references", keyframeSeconds, inputSeconds, alephPrompt, omniPrompt, maxCostUsd = 3.0, dryRun = true, only = null, promptVersion = "smoke-s08-v1" }) {
    const common = { projectId, artistId, videoAssetId, wardrobeFeatureId, lookId, inputSeconds, maxCostUsd, dryRun, promptVersion };
    const jobs = [
      { name: "aleph2", body: { ...common, model: "aleph2", prompt: alephPrompt, keyframes: [{ path: keyframePath, bucket: keyframeBucket, seconds: keyframeSeconds }] } },
      { name: "gemini_omni_flash_1.1", body: { ...common, model: "gemini_omni_flash_1.1", prompt: omniPrompt, referencePolicy: { maxRefs: 5, primaryPieceRefs: 3, otherPieceRefs: 1, outfitSheet: true } } },
    ];
    const out = { dryRun, results: {}, log: [] }; window.__runwaySmoke = out;
    for (const job of jobs) {
      if (only && !only.includes(job.name)) continue;
      const t0 = Date.now(); const j = await call(job.body);
      out.results[job.name] = { ...j, _elapsedMs: Date.now() - t0 };
      out.log.push(`${job.name}: http ${j._httpStatus} ${j.error || ""} est $${j.estimatedCostUsd ?? "?"} refs=${j.referenceCount ?? "?"} keyframes=${j.keyframeCount ?? "?"} ${dryRun ? "(dry)" : `status=${j.finalStatus} cost=$${j.actualCostUsd ?? j.estimatedCostUsd ?? "?"} task=${j.submit?.taskId ?? "-"}`}`);
    }
    return out;
  }
  window.runwaySmoke = { run, session };
})();
