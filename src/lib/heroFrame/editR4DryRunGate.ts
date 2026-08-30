import { GROK_VIDEO_EDIT_PROMPT } from "./grokVideoEditPrompt";
import { EDIT_R4_PRODUCT } from "./editR4ProductIds";
import type { GrokVideoEditDryRunPlan } from "@/lib/queries/grokVideoEdit";

export type EditR4GateItem = { ok: boolean; label: string };

export function assessEditR4DryRun(
  plan: GrokVideoEditDryRunPlan | undefined,
  videoAssetId: string,
  wardrobeFeatureId: string,
): EditR4GateItem[] {
  const body = plan?.xaiRequestBody;
  const refs = body?.reference_images ?? [];
  const videoUrl = typeof body?.video?.url === "string" ? body.video.url : "";
  const firstRef = refs[0];
  const firstRefUrl = typeof firstRef === "string" ? firstRef : firstRef?.url ?? "";
  const paths = plan?.garmentPathsUsed ?? [];
  return [
    {
      ok: (plan?.endpoint ?? "").endsWith("/videos/edits"),
      label: "endpoint = /v1/videos/edits",
    },
    {
      ok: videoAssetId === EDIT_R4_PRODUCT.videoAssetId,
      label: "source video is the canonical Fendi clip",
    },
    {
      ok: wardrobeFeatureId === EDIT_R4_PRODUCT.wardrobeFeatureId,
      label: "garment is the canonical Saint Laurent jacket",
    },
    {
      ok: Boolean(videoUrl),
      label: "source video signed URL present",
    },
    {
      ok: (plan?.referenceCount ?? paths.length) === 1,
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
      ok: refs.length === 1 && typeof firstRef === "object" && Boolean(firstRefUrl),
      label: "reference_images uses [{ url }] schema",
    },
    {
      ok: (plan?.prompt ?? "") === GROK_VIDEO_EDIT_PROMPT,
      label: "frozen prompt unchanged",
    },
    {
      ok: (plan?.model ?? "") === "grok-imagine-video",
      label: "model = grok-imagine-video",
    },
    {
      ok: Boolean(plan) && !(plan?.endpoint ?? "").includes("/generations"),
      label: "not the generations endpoint",
    },
  ];
}

export function editR4DryRunPassed(items: EditR4GateItem[]): boolean {
  return items.length > 0 && items.every((g) => g.ok);
}
