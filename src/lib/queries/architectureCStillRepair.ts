import { getAccessTokenWithTimeout } from "@/lib/authSession";
import type { QuadNorm } from "@/lib/garment/placementEngine";
import type { StillRepairStage, SleevePanelManual } from "@/lib/heroFrame/architectureCStillRepair";

export type ArchitectureCStillRepairInput = {
  projectId: string;
  stillAssetId: string;
  wardrobeFeatureId: string;
  stage: StillRepairStage;
  logoZoneQuad?: QuadNorm;
  sleevePanels?: SleevePanelManual[];
};

export type ArchitectureCStillRepairResult = {
  stage: StillRepairStage;
  assetId: string;
  storedBucket: string;
  storedPath: string;
  previewUrl: string | null;
  repair: Record<string, unknown>;
  temporalTrackingEnabled: false;
  hardStop: string;
};

export async function callArchitectureCStillRepair(
  input: ArchitectureCStillRepairInput,
): Promise<ArchitectureCStillRepairResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const token = await getAccessTokenWithTimeout();
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/functions/v1/architecture-c-still-repair-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const err = typeof body.error === "string" ? body.error : `http_${resp.status}`;
    const detail = typeof body.detail === "string" ? `: ${body.detail}` : "";
    throw new Error(`${err}${detail}`);
  }
  return {
    stage: body.stage as StillRepairStage,
    assetId: String(body.assetId),
    storedBucket: String(body.storedBucket ?? "project-references"),
    storedPath: String(body.storedPath),
    previewUrl: (body.previewUrl as string | null) ?? null,
    repair: (body.repair as Record<string, unknown>) ?? {},
    temporalTrackingEnabled: false,
    hardStop: String(
      body.hardStop ??
        "Still-first gate only. Temporal propagation is disabled until this still passes human review.",
    ),
  };
}
