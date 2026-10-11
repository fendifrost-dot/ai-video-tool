// RLS integration check against EXISTING disposable owned fixtures. No provider
// calls, uploads, row changes, or production media needed. Does not print tokens.
// Configure through the runner's secret environment; never paste credentials in chat.
// Required: AVT_RLS_URL, AVT_RLS_ANON_KEY, AVT_RLS_TOKEN_A/B,
// AVT_RLS_UID_A/B, AVT_RLS_PROP_PATH_A/B (<uid>/<fixture>.png).
// Run: node scripts/qa/gemini_storage_rls.mjs
const get = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}; RLS integration is NOT verified.`);
  return value;
};
const origin = get("AVT_RLS_URL");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(origin)) throw new Error("Expected a Supabase HTTPS origin without a path");
const key = get("AVT_RLS_ANON_KEY");
const identities = ["A", "B"].map((name) => {
  const uid = get(`AVT_RLS_UID_${name}`); const path = get(`AVT_RLS_PROP_PATH_${name}`);
  if (!/^[a-f0-9-]{36}\/[a-zA-Z0-9_-]+\.png$/.test(path) || !path.startsWith(`${uid}/`)) throw new Error("Fixture must be a direct owner-scoped PNG in prop-refs");
  return { uid, path, token: get(`AVT_RLS_TOKEN_${name}`) };
});
if (identities[0].uid === identities[1].uid) throw new Error("Need two different owners");
async function sign(token, path) {
  const response = await fetch(`${origin}/storage/v1/object/sign/prop-refs/${path}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }), redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  return response.ok && typeof (payload.signedURL ?? payload.signedUrl) === "string";
}
for (let i = 0; i < 2; i++) {
  if (!await sign(identities[i].token, identities[i].path)) throw new Error(`Owner ${i + 1} positive control failed; do not interpret denials`);
  if (await sign(identities[i].token, identities[1 - i].path)) throw new Error(`RLS FAILURE: owner ${i + 1} can sign the other owner's file`);
  if (await sign(key, identities[i].path)) throw new Error("RLS FAILURE: anonymous API role can sign an owned file");
}
console.log("RLS integration PASS: two owner controls, cross-owner and anonymous denial; no provider calls.");
