// AVT edge function — batch-token-proxy (machine identity for unattended runners)
//
// The problem it solves: scripts/broll/run_broll_batch.py and friends authenticate with a
// user JWT hand-copied out of the browser. It expires after an hour, so a long unattended
// run dies mid-batch — STALL_AUDIT_2026-10-01.md root cause B records four such kills.
//
// What it does: exchanges a long-lived, revocable BATCH CREDENTIAL for an ORDINARY user
// session. Nothing downstream changes: every other proxy keeps demanding a real user JWT
// and never learns this function exists. The runner just stops needing a human at 11pm.
//
// THE OWNER IS BOUND TO THE CREDENTIAL, NEVER TO THE REQUEST. `session` reads
// owner_user_id out of the credential row; the request body carries no email, no user id,
// and parseRequest rejects one if it appears. A credential therefore cannot be pointed at
// an account other than the one it was enrolled for.
//
// Actions:
//   enroll  (user JWT)      → create a credential for the caller; the secret is returned
//                             ONCE and only the sha256 is stored.
//   session (x-batch-secret) → mint a session for the credential's owner.
//   list    (user JWT)      → the caller's credentials, secrets excluded.
//   revoke  (user JWT)      → revoke one of the caller's credentials.
//
// verify_jwt = false in config.toml because `session` arrives without a JWT; the three
// user actions validate the bearer token themselves below.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  checkCredential,
  newSecret,
  parseRequest,
  RATE_LIMIT_MINTS,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimited,
  readSecret,
  sha256Hex,
  SECRET_HEADER,
  timingSafeEqual,
  windowStart,
  type CredentialRow,
} from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${SECRET_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(ip)).slice(0, 32);
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return json(500, { error: "server_misconfigured" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const parsed = parseRequest(body);
  if (!parsed.ok) return json(400, { error: "invalid_request", detail: parsed.error });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- session
  if (parsed.action === "session") {
    const secret = readSecret(req.headers);
    if (!secret)
      return json(401, {
        error: "missing_secret",
        detail: `send the credential in the ${SECRET_HEADER} header`,
      });
    // The service-role key is not a batch credential. Someone pasting it here would be
    // handing a god key to a script; refuse rather than hash it and fall through to
    // "unknown credential", which reads like a typo.
    if (timingSafeEqual(secret, serviceRoleKey) || timingSafeEqual(secret, anonKey)) {
      return json(403, {
        error: "forbidden",
        detail: "a Supabase project key is not a batch credential",
      });
    }

    const now = new Date();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = await hashIp(ip);
    const userAgent = req.headers.get("user-agent")?.slice(0, 200) ?? null;

    const secretHash = await sha256Hex(secret);
    const { data: rows, error: lookupErr } = await admin
      .from("batch_credentials")
      .select("id, owner_user_id, revoked_at, expires_at, secret_sha256")
      .eq("secret_sha256", secretHash)
      .limit(1);
    if (lookupErr) return json(500, { error: "lookup_failed", detail: lookupErr.message });

    const row = (rows?.[0] ?? null) as (CredentialRow & { secret_sha256: string }) | null;
    // The eq() above already matched, but compare in constant time anyway so the code
    // reads as a credential check rather than a database join that happens to be one.
    const matched = row && timingSafeEqual(row.secret_sha256, secretHash) ? row : null;

    const audit = async (outcome: "minted" | "denied", reason: string | null) => {
      await admin.from("batch_credential_mints").insert({
        credential_id: matched?.id ?? null,
        owner_user_id: matched?.owner_user_id ?? null,
        outcome,
        reason,
        ip_hash: ipHash,
        user_agent: userAgent,
      });
    };

    const check = checkCredential(matched, now);
    if (!check.ok) {
      await audit("denied", check.reason);
      return json(401, { error: "credential_rejected", detail: check.reason });
    }

    const { count, error: countErr } = await admin
      .from("batch_credential_mints")
      .select("id", { count: "exact", head: true })
      .eq("credential_id", check.credentialId)
      .eq("outcome", "minted")
      .gte("at", windowStart(now));
    if (countErr) return json(500, { error: "rate_check_failed", detail: countErr.message });
    if (rateLimited(count ?? 0)) {
      await audit("denied", "rate_limited");
      return json(429, {
        error: "rate_limited",
        detail: `${RATE_LIMIT_MINTS} mints per ${RATE_LIMIT_WINDOW_SECONDS}s per credential`,
      });
    }

    // Resolve the owner's email server-side from the bound id. The caller never names it.
    const { data: ownerData, error: ownerErr } = await admin.auth.admin.getUserById(
      check.ownerUserId,
    );
    const email = ownerData?.user?.email ?? null;
    if (ownerErr || !email) {
      await audit("denied", "owner_unresolvable");
      return json(500, {
        error: "owner_unresolvable",
        detail: ownerErr?.message ?? "owner has no email",
      });
    }

    // generateLink gives a magiclink token_hash without sending mail; verifyOtp on an anon
    // client turns it into an ordinary session. The runner ends up holding exactly what a
    // browser login would have given it — no special token type for downstream proxies to
    // learn about.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      await audit("denied", "link_failed");
      return json(500, { error: "mint_failed", detail: linkErr?.message ?? "no token issued" });
    }

    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: sessionData, error: verifyErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    const session = sessionData?.session ?? null;
    if (verifyErr || !session) {
      await audit("denied", "verify_failed");
      return json(500, {
        error: "mint_failed",
        detail: verifyErr?.message ?? "no session returned",
      });
    }

    await admin
      .from("batch_credentials")
      .update({ last_used_at: now.toISOString() })
      .eq("id", check.credentialId);
    await audit("minted", null);

    return json(200, {
      ok: true,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      expiresIn: session.expires_in,
      userId: check.ownerUserId,
      credentialId: check.credentialId,
    });
  }

  // ------------------------------------------- enroll / list / revoke (user JWT)
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer "))
    return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (userErr || !user) return json(401, { error: "unauthenticated" });

  if (parsed.action === "enroll") {
    const secret = newSecret();
    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 86400_000).toISOString()
      : null;
    const { data, error } = await admin
      .from("batch_credentials")
      .insert({
        owner_user_id: user.id, // from the verified JWT, not from the body
        secret_sha256: await sha256Hex(secret),
        label: parsed.label,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select("id, label, created_at, expires_at")
      .single();
    if (error) return json(500, { error: "enroll_failed", detail: error.message });
    return json(200, {
      ok: true,
      credential: data,
      // Shown once. There is no second chance and no recovery path by design: the row
      // holds a hash, so losing this means enrolling again, not reading it back out.
      secret,
      note: "Store this now — it is never shown again.",
    });
  }

  if (parsed.action === "list") {
    const { data, error } = await admin
      .from("batch_credentials")
      .select("id, label, created_at, last_used_at, revoked_at, expires_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return json(500, { error: "list_failed", detail: error.message });
    return json(200, { ok: true, credentials: data ?? [] });
  }

  // revoke — scoped to the caller's own rows, so a known id is not enough to revoke
  // someone else's credential.
  const { data, error } = await admin
    .from("batch_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.credentialId!)
    .eq("owner_user_id", user.id)
    .is("revoked_at", null)
    .select("id, label, revoked_at");
  if (error) return json(500, { error: "revoke_failed", detail: error.message });
  if (!data || data.length === 0)
    return json(404, { error: "not_found", detail: "no active credential of yours with that id" });
  return json(200, { ok: true, credential: data[0] });
}

serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    // Never let the worker die silently: a bare 503 with no body is the single hardest
    // failure to diagnose from the Lovable logs (see the runway-video-edit-proxy 503).
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("batch-token-proxy unhandled_exception", detail);
    return json(500, { error: "unhandled_exception", detail });
  }
});
