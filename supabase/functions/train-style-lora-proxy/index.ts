// AVT — start personal style LoRA training (Fal flux-lora-fast-training via CC)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { zipSync } from "https://esm.sh/fflate@0.8.2?target=deno";

const STYLE_LORA_TRIGGER = "FENDIFITS";
const MIN_IMAGES = 4;

type Body = {
  artistId?: string;
  featureIds?: string[] | null;
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

function publicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/style-references/${path}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ccUrl = Deno.env.get("TRAIN_STYLE_LORA_CC_URL") ??
    Deno.env.get("COMPOSE_LOOK_CC_URL")?.replace(/compose-look$/, "train-style-lora") ?? "";
  const proxySecret = Deno.env.get("COMPOSE_LOOK_PROXY_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !ccUrl || !proxySecret) {
    return json(500, { error: "server_misconfigured" });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const artistId = body.artistId ?? "";
  if (!artistId) return json(400, { error: "missing_artist_id" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let q = admin
    .from("character_features")
    .select("id, storage_path, file_url")
    .eq("artist_id", artistId)
    .eq("feature_type", "style_reference");

  if (body.featureIds?.length) {
    q = q.in("id", body.featureIds);
  }

  const { data: rows, error: fetchErr } = await q;
  if (fetchErr) return json(500, { error: "fetch_failed", detail: fetchErr.message });

  const paths = (rows ?? [])
    .map((r: { storage_path: string | null; file_url: string | null }) =>
      r.storage_path ?? r.file_url
    )
    .filter((p: string | null): p is string => !!p);

  if (paths.length < MIN_IMAGES) {
    return json(400, {
      error: "not_enough_images",
      detail: `Need at least ${MIN_IMAGES} style reference photos`,
    });
  }

  const { data: artist, error: artistErr } = await admin
    .from("artists")
    .select("id, identity_profile_json")
    .eq("id", artistId)
    .maybeSingle();
  if (artistErr) return json(500, { error: "artist_lookup_failed" });
  if (!artist) return json(404, { error: "artist_not_found" });

  const identity = (artist.identity_profile_json ?? {}) as Record<string, unknown>;
  const nextIdentity = {
    ...identity,
    style_lora_training: {
      status: "pending",
      started_at: new Date().toISOString(),
      image_count: paths.length,
      trigger_word: STYLE_LORA_TRIGGER,
    },
  };

  await admin
    .from("artists")
    .update({ identity_profile_json: nextIdentity })
    .eq("id", artistId);

  const callbackUrl =
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/train-style-lora-callback?artist_id=${artistId}`;

  const background = async () => {
    try {
      const zipEntries: Record<string, Uint8Array> = {};
      let idx = 0;
      for (const path of paths) {
        const url = publicUrl(supabaseUrl, path);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`fetch_image_${resp.status}:${path}`);
        const buf = new Uint8Array(await resp.arrayBuffer());
        const name = `img_${String(idx).padStart(3, "0")}.jpg`;
        zipEntries[name] = buf;
        idx++;
      }

      const zipped = zipSync(zipEntries);
      const zipPath = `${artistId}/training/${crypto.randomUUID()}.zip`;
      const { error: upErr } = await admin.storage
        .from("style-references")
        .upload(zipPath, zipped, {
          contentType: "application/zip",
          upsert: true,
        });
      if (upErr) throw new Error(`zip_upload_failed: ${upErr.message}`);

      const zipPublicUrl = publicUrl(supabaseUrl, zipPath);

      const ccResp = await fetch(ccUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": proxySecret,
        },
        body: JSON.stringify({
          images_data_url: zipPublicUrl,
          trigger_word: STYLE_LORA_TRIGGER,
          is_style: true,
          callback_url: callbackUrl,
          artist_id: artistId,
        }),
      });

      if (!ccResp.ok) {
        const text = await ccResp.text().catch(() => "");
        throw new Error(`cc_submit_${ccResp.status}: ${text.slice(0, 300)}`);
      }
    } catch (err) {
      const failIdentity = {
        ...nextIdentity,
        style_lora_training: {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: String(err?.message ?? err).slice(0, 500),
          image_count: paths.length,
          trigger_word: STYLE_LORA_TRIGGER,
        },
      };
      await admin
        .from("artists")
        .update({ identity_profile_json: failIdentity })
        .eq("id", artistId);
    }
  };

  // @ts-ignore EdgeRuntime.waitUntil
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    EdgeRuntime.waitUntil(background());
  } else {
    background();
  }

  return json(200, {
    status: "training_started",
    image_count: paths.length,
    trigger_word: STYLE_LORA_TRIGGER,
  });
});
