// Supabase Edge Function — server-side image fetcher with SSRF protection.
// Accepts { url, targetType, artistId? } and:
//   1. Validates URL (https, no private/loopback/link-local hosts).
//   2. Fetches with a sane UA, max-1 redirect, 30s timeout, 20 MB cap.
//   3. Sniffs MIME from Content-Type + magic bytes (jpeg | png | webp only).
//   4. Uploads to the correct bucket via service role under a path scoped to
//      the authenticated user (and artist, for wardrobe).
//   5. Returns { storage_path, file_url, mime_type, size_bytes }.
//
// The frontend is responsible for inserting the row into the appropriate
// library table after a successful fetch.

// Deno runtime imports — when running in Lovable Cloud / Supabase Edge Functions
// these resolve to the platform-managed Deno worker. The unit tests don't
// import this file; they import urlValidator.ts directly.
// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ALLOWED_MIME_TYPES,
  MAX_BYTES,
  MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  validateUrl,
  sniffImageMime,
  extForMime,
} from "../_shared/urlValidator.ts";

type TargetType = "wardrobe" | "location" | "prop" | "product";

type Body = {
  url: string;
  targetType: TargetType;
  artistId?: string;
  productId?: string;
};

const BUCKET_BY_TARGET: Record<TargetType, string> = {
  wardrobe: "wardrobe-refs",
  location: "location-refs",
  prop: "prop-refs",
  product: "product-assets",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (!body?.url || typeof body.url !== "string") {
    return json(400, { error: "missing_url" });
  }
  if (!body?.targetType || !(body.targetType in BUCKET_BY_TARGET)) {
    return json(400, { error: "invalid_target_type" });
  }
  if (body.targetType === "wardrobe" && !body.artistId) {
    return json(400, { error: "missing_artist_id" });
  }
  if (body.targetType === "product" && !body.productId) {
    return json(400, { error: "missing_product_id" });
  }

  // 1. Validate URL
  const v = validateUrl(body.url);
  if (!v.ok) {
    return json(400, { error: "url_rejected", reason: v.reason, detail: v.detail });
  }

  // 2. Identify the caller — we trust Supabase's auth verification on the
  //    incoming JWT. The path prefix needs to be the user's id so the bucket
  //    RLS policies authorise the read.
  const authHeader = req.headers.get("authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { error: "unauthenticated" });
  }
  const userId = userData.user.id;

  // 3. Fetch with redirect-then-revalidate, timeout, and byte cap.
  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchImageSafely(v.url.toString());
  } catch (err) {
    return json(400, { error: "fetch_failed", detail: String(err) });
  }

  const { bytes, mime } = fetchResult;

  // 4. Build storage path + upload via service role.
  const ext = extForMime(mime);
  const uuid = crypto.randomUUID();
  const path =
    body.targetType === "wardrobe"
      ? `${userId}/${body.artistId}/${uuid}.${ext}`
      : body.targetType === "product"
        ? `${userId}/${body.productId}/${uuid}.${ext}`
        : `${userId}/${uuid}.${ext}`;

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { error: uploadErr } = await adminClient.storage
    .from(BUCKET_BY_TARGET[body.targetType])
    .upload(path, bytes, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    return json(500, { error: "upload_failed", detail: uploadErr.message });
  }

  return json(200, {
    storage_path: path,
    file_url: path,
    mime_type: mime,
    size_bytes: bytes.byteLength,
    bucket: BUCKET_BY_TARGET[body.targetType],
  });
});

// -----------------------------------------------------------------------------
// fetchImageSafely — does the network IO, enforces caps, sniffs MIME.
// -----------------------------------------------------------------------------
type FetchResult = { bytes: Uint8Array; mime: "image/jpeg" | "image/png" | "image/webp" };

async function fetchImageSafely(initialUrl: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let url = initialUrl;
    let redirects = 0;
    let response: Response | null = null;

    // Manual redirect handling so we can re-validate after each hop.
    while (true) {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "AI-Video-Tool/1.0 (+https://aivideotool.lovable.app; reference-image-fetcher)",
          Accept: "image/jpeg, image/png, image/webp",
        },
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        if (!next) throw new Error(`redirect_${response.status}_without_location`);
        if (redirects >= MAX_REDIRECTS) {
          throw new Error("too_many_redirects");
        }
        const resolved = new URL(next, url).toString();
        const v = validateUrl(resolved);
        if (!v.ok) {
          throw new Error(`redirect_to_blocked_host:${v.reason}`);
        }
        url = resolved;
        redirects += 1;
        continue;
      }
      break;
    }

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const cl = parseInt(contentLength, 10);
      if (Number.isFinite(cl) && cl > MAX_BYTES) {
        throw new Error("too_large_content_length");
      }
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType && !ALLOWED_MIME_TYPES.has(contentType)) {
      // Some servers lie about Content-Type or return application/octet-stream
      // for images. We don't reject here — we'll re-check the magic bytes
      // after streaming. But if the server affirmatively claims something
      // outside our allowlist (text/html etc.) we bail early to save bytes.
      if (
        contentType.startsWith("text/") ||
        contentType.startsWith("application/json") ||
        contentType.startsWith("application/xml")
      ) {
        throw new Error(`bad_content_type:${contentType}`);
      }
    }

    // Stream into a capped buffer so we don't accidentally drain a 10 GB body.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("no_body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error("too_large_streamed");
        }
        chunks.push(value);
      }
    }

    const bytes = concat(chunks, total);

    // 5. Magic-byte sniff — final guard, source-of-truth for MIME.
    const sniffed = sniffImageMime(bytes);
    if (!sniffed) {
      throw new Error("not_an_image");
    }

    return { bytes, mime: sniffed };
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
