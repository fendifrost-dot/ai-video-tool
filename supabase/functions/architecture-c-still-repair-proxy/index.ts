// AVT edge function — architecture-c-still-repair-proxy
//
// Still-first deterministic product-truth repair for Architecture C.
// Stage logo_chest: existing compositeLogoOntoVton (chest band cover + wordmark).
// Stage sleeve_panel: manual upper-arm quads only (detection stays stubbed).
// Temporal tracking is intentionally disabled in the response.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ARCHITECTURE_C_V2_REPAIR,
  assertStillRepairStage,
  buildStillRepairAssetMetadata,
  isQuadNorm,
  mergeLogoZoneManualQuad,
  type QuadNorm,
  type SleevePanelManual,
  type StillRepairStage,
} from "../_shared/architectureCStillRepair.ts";
import {
  downloadStoragePath,
  logoCompositeMetaCore,
  resolveLogoAssets,
} from "../_shared/logoComposite.ts";
import {
  compositeLogoOntoVton,
  compositeSleevePanelsOntoStill,
} from "../_shared/placementEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OUTPUT_SIGN_TTL = 604800;
const KEYFRAME_ID = "v2-still-0.785";

type Body = {
  projectId: string;
  stillAssetId: string;
  wardrobeFeatureId: string;
  stage: StillRepairStage | string;
  logoZoneQuad?: QuadNorm;
  sleevePanels?: SleevePanelManual[];
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const makeAdmin = (url: string, key: string) =>
  createClient(url, key, { auth: { persistSession: false } });

function bucketForAssetType(assetType: string): string {
  switch (assetType) {
    case "reference_image":
    case "reference_video":
    case "lyrics_doc":
      return "project-references";
    case "ae_asset":
    case "premiere_export":
      return "project-exports";
    default:
      return "project-clips";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "server_misconfigured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "missing_bearer" });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body.projectId || !body.stillAssetId || !body.wardrobeFeatureId || !body.stage) {
    return json(400, { error: "missing_required_fields" });
  }

  let stage: StillRepairStage;
  try {
    stage = assertStillRepairStage(String(body.stage));
  } catch {
    return json(400, { error: "invalid_stage", detail: "logo_chest|sleeve_panel" });
  }

  if (ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled) {
    return json(500, { error: "tracking_flag_misconfigured" });
  }

  const admin = makeAdmin(supabaseUrl, serviceRoleKey);

  const { data: project, error: pErr } = await admin
    .from("video_projects")
    .select("id, user_id")
    .eq("id", body.projectId)
    .maybeSingle();
  if (pErr) return json(500, { error: "project_query_failed", detail: pErr.message });
  if (!project || project.user_id !== userId) return json(403, { error: "project_forbidden" });

  const { data: stillAsset, error: sErr } = await admin
    .from("project_assets")
    .select("id, user_id, project_id, file_url, asset_type, metadata_json")
    .eq("id", body.stillAssetId)
    .maybeSingle();
  if (sErr) return json(500, { error: "still_asset_query_failed", detail: sErr.message });
  if (!stillAsset || stillAsset.user_id !== userId || stillAsset.project_id !== body.projectId) {
    return json(403, { error: "not_owner" });
  }
  if (!stillAsset.file_url) return json(404, { error: "still_not_resolvable" });

  const stillMeta = (stillAsset.metadata_json ?? {}) as Record<string, unknown>;
  const stillBucket =
    (typeof stillMeta.bucket === "string" && stillMeta.bucket) ||
    bucketForAssetType(String(stillAsset.asset_type));
  const { data: stillBlob, error: dlErr } = await admin.storage
    .from(stillBucket)
    .download(stillAsset.file_url as string);
  if (dlErr || !stillBlob) {
    return json(500, { error: "still_download_failed", detail: dlErr?.message ?? "empty" });
  }
  let workingBytes: Uint8Array = new Uint8Array(await stillBlob.arrayBuffer());

  const { data: wardrobe, error: wErr } = await admin
    .from("character_features")
    .select("id")
    .eq("id", body.wardrobeFeatureId)
    .maybeSingle();
  if (wErr) return json(500, { error: "wardrobe_query_failed", detail: wErr.message });
  if (!wardrobe) return json(404, { error: "wardrobe_not_found" });

  let repairMeta: Record<string, unknown> = {};

  if (stage === "logo_chest") {
    const resolved = await resolveLogoAssets(admin, body.wardrobeFeatureId);
    if (!resolved) {
      return json(422, {
        error: "logo_assets_unresolved",
        detail: "SKU needs logo_placement + front (or logo) asset linked to this wardrobe row",
      });
    }
    let truthRaw = resolved.productTruthRaw;
    if (body.logoZoneQuad) {
      if (!isQuadNorm(body.logoZoneQuad)) {
        return json(400, { error: "invalid_logo_zone_quad" });
      }
      truthRaw = mergeLogoZoneManualQuad(truthRaw, body.logoZoneQuad, KEYFRAME_ID);
    }
    const composite = await compositeLogoOntoVton(
      workingBytes,
      resolved.logoBytes,
      resolved.placement,
      resolved.logoSource,
      truthRaw,
    );
    workingBytes = composite.bytes;
    repairMeta = {
      ...logoCompositeMetaCore(composite),
      logo_asset_id: resolved.placement.logo_asset_id ?? null,
      keyframe_id: KEYFRAME_ID,
      logo_zone_quad_provided: Boolean(body.logoZoneQuad),
    };
  } else {
    const panels = body.sleevePanels ?? [];
    if (panels.length === 0) {
      return json(400, {
        error: "sleeve_panels_required",
        detail: "Pass left/right manual quads on the visible upper-arm segment only",
      });
    }
    for (const p of panels) {
      if (!isQuadNorm(p.targetQuad)) {
        return json(400, { error: "invalid_sleeve_quad", side: p.side });
      }
    }
    const resolved = await resolveLogoAssets(admin, body.wardrobeFeatureId);
    // Prefer front flat bytes via the same product link used for logo crop.
    const { data: link } = await admin
      .from("product_wardrobe_links")
      .select("product_id")
      .eq("character_feature_id", body.wardrobeFeatureId)
      .maybeSingle();
    if (!link?.product_id) return json(422, { error: "product_link_missing" });
    const frontId = resolved?.placement.front_asset_id ?? null;
    let frontPath: string | null = null;
    if (frontId) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("id", frontId)
        .eq("product_id", link.product_id)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("product_id", link.product_id)
        .eq("asset_role", "front")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) return json(422, { error: "front_flat_missing" });
    const flatBytes = await downloadStoragePath(admin, frontPath);
    const sleeve = await compositeSleevePanelsOntoStill(
      workingBytes,
      flatBytes,
      panels.map((p) => ({
        side: p.side,
        targetQuad: p.targetQuad,
        sourceBboxNorm: p.sourceBboxNorm ?? null,
      })),
    );
    workingBytes = sleeve.bytes;
    repairMeta = {
      sleeve_panels: sleeve.sides,
      front_flat_path: frontPath,
      geometry_note: "visible_upper_arm_only",
    };
  }

  const frameTimeSec =
    typeof stillMeta.frame_time_sec === "number" ? stillMeta.frame_time_sec : null;
  const sourceVideoAssetId =
    typeof stillMeta.source_video_asset_id === "string"
      ? stillMeta.source_video_asset_id
      : null;

  const outPath =
    `${userId}/${body.projectId}/architecture-c-repair/${stage}_${body.stillAssetId}_${Date.now()}.png`;
  const { error: upErr } = await admin.storage
    .from("project-references")
    .upload(outPath, workingBytes, { contentType: "image/png", upsert: true });
  if (upErr) return json(500, { error: "upload_failed", detail: upErr.message });

  const metadata = buildStillRepairAssetMetadata({
    stage,
    sourceStillAssetId: body.stillAssetId,
    sourceVideoAssetId,
    frameTimeSec,
    wardrobeFeatureId: body.wardrobeFeatureId,
    repairMeta,
  });

  const { data: assetRow, error: assetErr } = await admin
    .from("project_assets")
    .insert({
      user_id: userId,
      project_id: body.projectId,
      asset_type: "reference_image",
      file_url: outPath,
      source_tool: "manual",
      approval_status: "pending",
      parent_asset_id: body.stillAssetId,
      metadata_json: metadata,
    })
    .select("id")
    .single();

  if (assetErr || !assetRow) {
    return json(500, {
      error: "project_assets_insert_failed",
      detail: assetErr?.message ?? "no_row",
    });
  }

  const { data: signed } = await admin.storage
    .from("project-references")
    .createSignedUrl(outPath, OUTPUT_SIGN_TTL);

  return json(200, {
    stage,
    assetId: assetRow.id as string,
    storedBucket: "project-references",
    storedPath: outPath,
    previewUrl: signed?.signedUrl ?? null,
    repair: repairMeta,
    temporalTrackingEnabled: false,
    hardStop:
      "Still-first gate only. Temporal propagation is disabled until this still passes human review.",
  });
});
