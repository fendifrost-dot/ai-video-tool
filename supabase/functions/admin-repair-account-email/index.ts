// AVT edge function — admin-repair-account-email
//
// ⚠️ ONE-TIME ACCOUNT-REPAIR FUNCTION — DELETE AFTER USE. ⚠️
//
// PURPOSE (single account, single field):
//   Set the email of the ONE durable AVT account
//     UID   3ca10935-8c3d-4479-9a0c-8bfe8050840c
//   to
//     EMAIL fendifrost@gmail.com
//   using the officially-supported, UID-preserving Supabase admin path:
//     auth.admin.updateUserById(uid, { email, email_confirm: true })
//
// WHY THIS METHOD (UID preservation — the whole point):
//   updateUserById() keys on the immutable `id` (the UID). It performs an
//   in-place UPDATE of that one auth.users row. It NEVER creates, deletes,
//   re-keys, or re-assigns a user, so the UID is guaranteed to stay byte-for-
//   byte identical. Only the email and its verification state change, and the
//   GoTrue admin layer keeps the linked auth.identities email row consistent
//   in the same transaction. This is why we use the admin API and NOT raw SQL
//   against auth.users / auth.identities (raw SQL would risk desyncing the
//   identity/verification state, and a careless UPDATE could touch the id).
//
// WHAT CHANGES:            email, email_confirmed_at (verification), and the
//                          linked identity's email (handled by GoTrue).
// WHAT IS NOT TOUCHED:     the UID, any OTHER user, passwords, app/user
//                          metadata, and anything outside Supabase Auth
//                          (Resend / Cloudflare / Gmail / DNS / mail routing).
//
// NON-GENERALIZED / HARD-GUARDED:
//   The target UID and target email are compile-time constants (see guards.ts).
//   The request body CANNOT supply a UID or an email — those fields are
//   ignored. The only honored input is `{ dryRun?: boolean }`. This endpoint
//   therefore physically cannot be repurposed as a general user-management API:
//   it can only ever act on the one hard-coded account, and only ever set the
//   one hard-coded email. A post-update assertion re-checks both invariants and
//   fails loudly if either drifts.
//
// AUTH (admin-gated, defense in depth):
//   1. verify_jwt = true (see supabase/config.toml) — the Supabase platform
//      rejects any request without a valid session JWT before our code runs.
//   2. A dedicated operator secret, required as the `x-operator-secret`
//      header and compared in constant time against the
//      ACCOUNT_REPAIR_OPERATOR_SECRET edge secret. Only an operator who holds
//      that secret (set in Lovable Cloud edge secrets) can invoke the repair.
//
// Required secrets (AVT project qoyxgnkvjukovkrvdaiq):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided by Lovable)
//   ACCOUNT_REPAIR_OPERATOR_SECRET           (set by the operator; delete with
//                                             the function)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assertRepairInvariants,
  constantTimeEqual,
  snapshot,
  TARGET_EMAIL,
  TARGET_UID,
} from "./guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-operator-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  /** Fetch and return the before-state only; make NO change. Default false. */
  dryRun?: boolean;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // ---- env ----------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const operatorSecret = Deno.env.get("ACCOUNT_REPAIR_OPERATOR_SECRET") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !operatorSecret) {
    return json(500, { error: "server_misconfigured" });
  }

  // ---- operator-secret gate (constant time) -------------------------------
  // verify_jwt = true already blocked anonymous callers at the platform; this
  // is the second, admin-only gate.
  const headerSecret = req.headers.get("x-operator-secret") ?? "";
  if (!headerSecret) return json(401, { error: "missing_operator_secret" });
  if (!constantTimeEqual(headerSecret, operatorSecret)) {
    return json(401, { error: "bad_operator_secret" });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  const dryRun = body.dryRun === true;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ---- BEFORE: fetch the exact target by UID ------------------------------
  const { data: beforeData, error: beforeErr } = await admin.auth.admin.getUserById(
    TARGET_UID,
  );
  if (beforeErr) {
    return json(500, { error: "target_lookup_failed", detail: beforeErr.message });
  }
  if (!beforeData?.user) {
    return json(404, { error: "target_uid_not_found", target_uid: TARGET_UID });
  }
  const before = snapshot(beforeData.user);
  // Paranoia: the SDK returned some other row. Never proceed.
  if (before.id !== TARGET_UID) {
    return json(500, {
      error: "target_identity_mismatch",
      expected_uid: TARGET_UID,
      got_uid: before.id,
    });
  }

  // ---- dry run: report before-state, change nothing -----------------------
  if (dryRun) {
    return json(200, {
      dryRun: true,
      target_uid: TARGET_UID,
      target_email: TARGET_EMAIL,
      before,
      would_change: {
        email: before.email !== TARGET_EMAIL,
        email_confirmation: before.email_confirmed_at === null,
      },
      note: "No change made. updateUserById would preserve this exact UID.",
    });
  }

  // ---- idempotent short-circuit -------------------------------------------
  if (before.email === TARGET_EMAIL && before.email_confirmed_at) {
    return json(200, {
      changed: false,
      reason: "already_target_email_and_confirmed",
      target_uid: TARGET_UID,
      before,
      after: before,
      assertions: {
        uid_unchanged: true,
        uid: TARGET_UID,
        email_changed: false,
        email: before.email,
      },
    });
  }

  // ---- THE ONE OPERATION --------------------------------------------------
  // Keys on the immutable id (UID). In-place UPDATE of that single row's email
  // + email verification state; GoTrue keeps the linked identity consistent.
  // No create/delete/re-key path exists here.
  const { data: updated, error: updErr } = await admin.auth.admin.updateUserById(
    TARGET_UID,
    { email: TARGET_EMAIL, email_confirm: true },
  );
  if (updErr) {
    return json(500, {
      error: "update_failed",
      detail: updErr.message,
      target_uid: TARGET_UID,
      before,
    });
  }

  // ---- AFTER: re-fetch by UID (don't trust the update echo alone) ---------
  const { data: afterData, error: afterErr } = await admin.auth.admin.getUserById(
    TARGET_UID,
  );
  const afterUser = afterData?.user ?? updated?.user ?? null;
  if (afterErr && !afterUser) {
    return json(500, { error: "post_update_verify_failed", detail: afterErr.message });
  }
  const after = snapshot(afterUser);

  // ---- ASSERT the invariants (fail loudly if drift) -----------------------
  const violations = assertRepairInvariants(before, after);
  if (violations.length > 0) {
    return json(500, {
      error: "invariant_violation",
      violations,
      before,
      after,
    });
  }

  return json(200, {
    changed: true,
    target_uid: TARGET_UID,
    target_email: TARGET_EMAIL,
    before,
    after,
    assertions: {
      uid_unchanged: before.id === after.id && after.id === TARGET_UID,
      uid: after.id,
      email_changed: before.email !== after.email,
      email_before: before.email,
      email_after: after.email,
      email_confirmed: after.email_confirmed_at !== null,
    },
    note: "One-time repair complete. Delete this function and its operator secret.",
  });
}

// Only start the server when run as the entrypoint, so the pure guard helpers
// can be imported without side effects.
if (import.meta.main) {
  serve(handler);
}
