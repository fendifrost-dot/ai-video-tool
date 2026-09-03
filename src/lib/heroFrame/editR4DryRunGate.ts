import { GROK_VIDEO_EDIT_PROMPT, GROK_VIDEO_EDIT_PROMPT_VERSION } from "./grokVideoEditPrompt";
import { EDIT_R4_PRODUCT, isEditR4CanonicalOwner } from "./editR4ProductIds";
import type { GrokVideoEditDryRunPlan } from "@/lib/queries/grokVideoEdit";

export type EditR4GateItem = { ok: boolean; label: string };

export function assessEditR4DryRun(
  plan: GrokVideoEditDryRunPlan | null | undefined,
  videoAssetId: string,
  wardrobeFeatureId: string,
  sessionUid?: string | null,
): EditR4GateItem[] {
  const body = plan?.xaiRequestBody;
  const refs = body?.reference_images ?? [];
  const videoUrl = typeof body?.video?.url === "string" ? body.video.url : "";
  const firstRef = refs[0];
  const firstRefUrl = typeof firstRef === "string" ? firstRef : (firstRef?.url ?? "");
  const paths = plan?.garmentPathsUsed ?? [];
  const endpoint = plan?.endpoint ?? "";
  return [
    {
      ok: isEditR4CanonicalOwner(sessionUid),
      label: "session UID = canonical owner",
    },
    {
      ok: videoAssetId === EDIT_R4_PRODUCT.videoAssetId &&
        plan?.videoAssetId === EDIT_R4_PRODUCT.videoAssetId,
      label: "source video is the canonical Fendi clip",
    },
    {
      ok: wardrobeFeatureId === EDIT_R4_PRODUCT.wardrobeFeatureId &&
        plan?.wardrobeFeatureId === EDIT_R4_PRODUCT.wardrobeFeatureId,
      label: "garment is the canonical Saint Laurent jacket",
    },
    {
      ok: endpoint.endsWith("/videos/edits") || endpoint.endsWith("/v1/videos/edits"),
      label: "endpoint = /v1/videos/edits",
    },
    {
      ok: plan?.dryRun === true && plan.billed === false,
      label: "dry-run billed === false",
    },
    {
      ok: (plan?.referenceCount ?? paths.length) === 1 && paths.length === 1,
      label: "exactly one garment reference",
    },
    {
      ok: paths.length === 1 && paths[0] === EDIT_R4_PRODUCT.flatReferencePath,
      label: "reference is the flat YSL product image",
    },
    {
      ok: !paths.some((p) => p.includes("onmodel")),
      label: "no on-model reference",
    },
    {
      ok: Boolean(body?.video && typeof body.video === "object" && videoUrl),
      label: "video uses { url } schema",
    },
    {
      ok: refs.length === 1 && typeof firstRef === "object" && firstRef !== null && Boolean(firstRefUrl),
      label: "reference_images uses [{ url }] schema",
    },
    {
      ok: Boolean(videoUrl),
      label: "source video signed URL present",
    },
    {
      ok: (plan?.prompt ?? "") === GROK_VIDEO_EDIT_PROMPT,
      label: "active prompt is Frozen Prompt V2 exactly",
    },
    {
      ok: plan?.promptVersion === GROK_VIDEO_EDIT_PROMPT_VERSION,
      label: "promptVersion === v2",
    },
    {
      ok: (plan?.model ?? "") === "grok-imagine-video",
      label: "model = grok-imagine-video",
    },
    {
      ok: Boolean(plan) && !endpoint.includes("/generations"),
      label: "not the generations endpoint",
    },
  ];
}

export function editR4DryRunPassed(items: EditR4GateItem[]): boolean {
  return items.length > 0 && items.every((g) => g.ok);
}

/** Single fail-closed gate — do not add a weaker parallel checker. */
export function isEditR4DryRunReady(
  plan: GrokVideoEditDryRunPlan | null | undefined,
  videoAssetId: string,
  wardrobeFeatureId: string,
  sessionUid?: string | null,
): boolean {
  return editR4DryRunPassed(assessEditR4DryRun(plan, videoAssetId, wardrobeFeatureId, sessionUid));
}
